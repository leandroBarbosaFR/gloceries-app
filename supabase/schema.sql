-- Psst! — Supabase schema (idempotent: safe to re-run in the SQL Editor).
-- Requires: Email OTP enabled in Authentication, email template sending {{ .Token }}.
-- Client apps only ever use the publishable/anon key; every access goes through RLS or the RPCs below.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique default upper(encode(extensions.gen_random_bytes(8), 'hex')),
  invite_expires_at timestamptz not null default now() + interval '7 days',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.grocery_items (
  -- Client generates the UUID so offline inserts are idempotent when replayed.
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity integer not null default 1 check (quantity between 1 and 999),
  checked boolean not null default false,
  mute_reminders boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Rate limiting ledger for invite joins / household creation. Not readable by clients.
create table if not exists public.rpc_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  succeeded boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists grocery_items_household_idx on public.grocery_items(household_id, created_at);
create index if not exists household_members_user_idx on public.household_members(user_id);
create index if not exists rpc_attempts_user_action_idx on public.rpc_attempts(user_id, action, created_at);

-- Keep updated_at fresh and forbid moving an item to another household.
create or replace function public.touch_grocery_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.household_id <> old.household_id then raise exception 'household_id is immutable'; end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists grocery_items_touch on public.grocery_items;
create trigger grocery_items_touch before update on public.grocery_items
  for each row execute function public.touch_grocery_item();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.grocery_items enable row level security;
alter table public.rpc_attempts enable row level security; -- no policies: clients cannot read/write

-- Membership check in SECURITY DEFINER to avoid recursive RLS evaluation.
create or replace function public.is_household_member(household_uuid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members where household_id = household_uuid and user_id = auth.uid());
$$;
revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated;

drop policy if exists "members read household" on public.households;
create policy "members read household" on public.households for select to authenticated
  using (public.is_household_member(id));

drop policy if exists "members read memberships" on public.household_members;
create policy "members read memberships" on public.household_members for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "members read items" on public.grocery_items;
create policy "members read items" on public.grocery_items for select to authenticated
  using (public.is_household_member(household_id));

drop policy if exists "members add items" on public.grocery_items;
create policy "members add items" on public.grocery_items for insert to authenticated
  with check (public.is_household_member(household_id) and created_by = auth.uid());

drop policy if exists "members update items" on public.grocery_items;
create policy "members update items" on public.grocery_items for update to authenticated
  using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));

drop policy if exists "members delete items" on public.grocery_items;
create policy "members delete items" on public.grocery_items for delete to authenticated
  using (public.is_household_member(household_id));

-- Households/memberships are only created, joined, left or deleted through the RPCs below.
revoke insert, update, delete on public.households, public.household_members from anon, authenticated;
revoke all on public.rpc_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.assert_rate_limit(action_name text, max_attempts integer, window_interval interval)
returns void language plpgsql security definer set search_path = '' as $$
declare recent integer;
begin
  select count(*) into recent from public.rpc_attempts
   where user_id = auth.uid() and action = action_name and created_at > now() - window_interval;
  if recent >= max_attempts then raise exception 'rate_limited' using errcode = 'P0001', hint = 'Trop de tentatives'; end if;
end;
$$;
revoke all on function public.assert_rate_limit(text, integer, interval) from public, anon, authenticated;

drop function if exists public.create_household(text);
create or replace function public.create_household(household_name text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare result public.households;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if household_name is null or char_length(trim(household_name)) < 1 or char_length(trim(household_name)) > 80 then
    raise exception 'Invalid household name';
  end if;
  perform public.assert_rate_limit('create_household', 5, interval '1 hour');
  insert into public.rpc_attempts(user_id, action, succeeded) values (auth.uid(), 'create_household', true);
  insert into public.households(name, created_by) values (trim(household_name), auth.uid()) returning * into result;
  insert into public.household_members(household_id, user_id) values (result.id, auth.uid());
  return result;
end;
$$;

-- Returns NULL (instead of raising) for an invalid/expired code so the failed attempt is
-- committed in rpc_attempts and counts toward the rate limit (an exception would roll it back).
drop function if exists public.join_household(text);
create or replace function public.join_household(code text)
returns public.households language plpgsql security definer set search_path = '' as $$
declare
  result public.households;
  normalized text := upper(regexp_replace(coalesce(code, ''), '[^0-9A-Za-z]', '', 'g'));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform public.assert_rate_limit('join_household', 10, interval '15 minutes');
  select * into result from public.households where invite_code = normalized and invite_expires_at > now();
  insert into public.rpc_attempts(user_id, action, succeeded) values (auth.uid(), 'join_household', found);
  if result.id is null then return null; end if;
  insert into public.household_members(household_id, user_id) values (result.id, auth.uid()) on conflict do nothing;
  return result;
end;
$$;

-- Any member can rotate the invite code (invalidates the previous one) and extend validity by 7 days.
create or replace function public.rotate_invite_code(household_uuid uuid)
returns public.households language plpgsql security definer set search_path = '' as $$
declare result public.households;
begin
  if auth.uid() is null or not public.is_household_member(household_uuid) then raise exception 'Not a member'; end if;
  perform public.assert_rate_limit('rotate_invite', 10, interval '1 hour');
  insert into public.rpc_attempts(user_id, action, succeeded) values (auth.uid(), 'rotate_invite', true);
  update public.households
     set invite_code = upper(encode(extensions.gen_random_bytes(8), 'hex')),
         invite_expires_at = now() + interval '7 days'
   where id = household_uuid
  returning * into result;
  return result;
end;
$$;

-- Leaves the household; deletes it (and its items) when the last member leaves.
create or replace function public.leave_household(household_uuid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  delete from public.household_members where household_id = household_uuid and user_id = auth.uid();
  delete from public.households h where h.id = household_uuid
     and not exists (select 1 from public.household_members m where m.household_id = h.id);
end;
$$;

create or replace function public.household_member_count(household_uuid uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select case when public.is_household_member(household_uuid)
    then (select count(*)::integer from public.household_members where household_id = household_uuid)
    else 0 end;
$$;

-- Deletes the caller's account and personal data. Households where the caller was the last
-- member are deleted with their items; items in shared households stay (created_by → NULL).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  delete from public.households h
   where exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id = me)
     and not exists (select 1 from public.household_members m where m.household_id = h.id and m.user_id <> me);
  delete from auth.users where id = me; -- cascades memberships and rpc_attempts
end;
$$;

revoke all on function
  public.create_household(text), public.join_household(text), public.rotate_invite_code(uuid),
  public.leave_household(uuid), public.household_member_count(uuid), public.delete_my_account()
  from public, anon;
grant execute on function
  public.create_household(text), public.join_household(text), public.rotate_invite_code(uuid),
  public.leave_household(uuid), public.household_member_count(uuid), public.delete_my_account()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (RLS applies to postgres_changes for authenticated subscribers)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'grocery_items'
  ) then
    alter publication supabase_realtime add table public.grocery_items;
  end if;
end;
$$;

-- Housekeeping suggestion (run with pg_cron if enabled):
-- delete from public.rpc_attempts where created_at < now() - interval '30 days';
