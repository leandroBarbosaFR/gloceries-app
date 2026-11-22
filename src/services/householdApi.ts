import { normalizeInviteCode } from '../domain/invite';
import type { ListSnapshotItem } from '../domain/geofenceEngine';
import { supabase } from '../lib/supabase';
import type { GroceryItem, GroceryItemPatch, Household } from '../lib/types';

const HOUSEHOLD_COLUMNS = 'id,name,invite_code,invite_expires_at';
const ITEM_COLUMNS = 'id,household_id,name,quantity,checked,mute_reminders,created_at,updated_at';

export async function loadHousehold(): Promise<Household | null> {
  const { data: membership, error } = await supabase
    .from('household_members')
    .select('household_id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!membership) return null;
  const { data, error: householdError } = await supabase.from('households').select(HOUSEHOLD_COLUMNS).eq('id', membership.household_id).single();
  if (householdError) throw householdError;
  return data as Household;
}

export async function createHousehold(name: string): Promise<Household> {
  const { data, error } = await supabase.rpc('create_household', { household_name: name.trim() });
  if (error) throw error;
  return data as Household;
}

export async function joinHousehold(code: string): Promise<Household> {
  const { data, error } = await supabase.rpc('join_household', { code: normalizeInviteCode(code) });
  if (error) throw error;
  // The RPC returns NULL (not an error) for invalid/expired codes so attempts are rate-limited.
  if (!data || !(data as Household).id) throw new Error('invite_invalid');
  return data as Household;
}

export async function rotateInviteCode(householdId: string): Promise<Household> {
  const { data, error } = await supabase.rpc('rotate_invite_code', { household_uuid: householdId });
  if (error) throw error;
  return data as Household;
}

export async function leaveHousehold(householdId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_household', { household_uuid: householdId });
  if (error) throw error;
}

export async function countMembers(householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc('household_member_count', { household_uuid: householdId });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}

export async function listItems(householdId: string, signal?: AbortSignal): Promise<GroceryItem[]> {
  let query = supabase.from('grocery_items').select(ITEM_COLUMNS).eq('household_id', householdId).order('created_at', { ascending: false });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GroceryItem[];
}

/** Idempotent insert: replaying the same client-generated id is a no-op. */
export async function insertItem(item: GroceryItem, userId: string): Promise<void> {
  const { error } = await supabase.from('grocery_items').upsert(
    {
      id: item.id,
      household_id: item.household_id,
      name: item.name,
      quantity: item.quantity,
      checked: item.checked,
      mute_reminders: item.mute_reminders,
      created_by: userId,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function updateItem(itemId: string, patch: GroceryItemPatch): Promise<void> {
  const { error } = await supabase.from('grocery_items').update(patch).eq('id', itemId);
  if (error) throw error;
}

export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('grocery_items').delete().eq('id', itemId);
  if (error) throw error;
}

/**
 * Used by the background geofence task: short timeout, never throws, returns null when the
 * session is missing or the network is unavailable (caller falls back to the local snapshot).
 */
export async function fetchItemsForReminder(householdId: string, timeoutMs = 8_000): Promise<ListSnapshotItem[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;
    const items = await listItems(householdId, controller.signal);
    return items.map(({ id, name, quantity, checked, mute_reminders }) => ({ id, name, quantity, checked, mute_reminders }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
