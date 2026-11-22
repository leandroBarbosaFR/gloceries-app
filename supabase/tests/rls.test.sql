-- pgTAP tests for Psst! RLS and RPCs.
-- Run locally with the Supabase CLI:  supabase start && supabase test db
-- (Requires Docker. Not executed in CI yet — see docs/QA_CHECKLIST.md.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixtures: three users. Alice and Bob share a household, Mallory is an outsider.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'mallory@test.local');

create or replace function pg_temp.login(user_uuid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_uuid, 'role', 'authenticated')::text, true);
  select set_config('role', 'authenticated', true);
$$;

-- Alice creates a household.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select isnt((select id from public.create_household('Famille Test')), null, 'alice can create a household');
create temp table ctx as select id, invite_code from public.households limit 1;
grant select on ctx to authenticated;

-- Bob joins with the code (lower case + dashes accepted).
select pg_temp.login('00000000-0000-0000-0000-00000000000b');
select is((select id from public.join_household(lower(substr((select invite_code from ctx), 1, 4) || '-' || substr((select invite_code from ctx), 5)))), (select id from ctx), 'bob joins with a formatted code');
select is((select public.join_household('0000000000000000')), null, 'invalid code returns null (not an exception)');

-- Bob adds an item; Alice sees it.
insert into public.grocery_items (household_id, name, created_by) values ((select id from ctx), 'Lait', '00000000-0000-0000-0000-00000000000b');
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.grocery_items), 1, 'alice sees the item added by bob');
select lives_ok($$ update public.grocery_items set checked = true $$, 'alice can check an item');

-- Mallory sees nothing and cannot write.
select pg_temp.login('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.households), 0, 'outsider cannot read households');
select is((select count(*)::int from public.household_members), 0, 'outsider cannot read memberships');
select is((select count(*)::int from public.grocery_items), 0, 'outsider cannot read items');
select throws_ok(
  $$ insert into public.grocery_items (household_id, name, created_by) values ((select id from ctx), 'Spam', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'outsider cannot insert items');
select is((with updated as (update public.grocery_items set name = 'Hacked' returning 1) select count(*)::int from updated), 0, 'outsider cannot update items');
select throws_ok($$ insert into public.household_members (household_id, user_id) values ((select id from ctx), auth.uid()) $$, '42501', null, 'outsider cannot add themselves to a household');
select throws_ok($$ select public.rotate_invite_code((select id from ctx)) $$, 'P0001', 'Not a member', 'outsider cannot rotate the invite code');
select throws_ok($$ select * from public.rpc_attempts $$, '42501', null, 'rate-limit ledger is not readable');

-- Rate limiting: 10 failed joins in 15 minutes, then refusal.
select lives_ok($$ select public.join_household('BAD' || g) from generate_series(1, 10) as g $$, 'failed joins under the limit are accepted');
select throws_ok($$ select public.join_household('STILLBAD') $$, 'P0001', 'rate_limited', 'join is rate-limited after 10 attempts');

-- Rotation invalidates the old code.
select pg_temp.login('00000000-0000-0000-0000-00000000000a');
select isnt((select invite_code from public.rotate_invite_code((select id from ctx))), (select invite_code from ctx), 'rotation produces a new code');

select * from finish();
rollback;
