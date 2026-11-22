import type { GroceryItem, GroceryItemPatch } from '../lib/types';

export type PendingOperation =
  | { kind: 'add'; opId: string; item: GroceryItem; createdAt: number }
  | { kind: 'update'; opId: string; itemId: string; patch: GroceryItemPatch; createdAt: number }
  | { kind: 'delete'; opId: string; itemId: string; createdAt: number };

function operationItemId(operation: PendingOperation): string {
  return operation.kind === 'add' ? operation.item.id : operation.itemId;
}

/**
 * Appends an operation to the offline queue, coalescing with earlier operations on the same item
 * so the queue stays small and replays are minimal:
 * - add + update → add (with patch merged)
 * - add + delete → nothing (never reached the server)
 * - update + update → single merged update
 * - update + delete → delete
 * - delete + update → delete (update dropped)
 *
 * `inFlightOpId` is the operation currently being sent to the server: it is never modified or
 * removed here (it may already have been applied server-side), new work is appended instead.
 */
export function enqueueOperation(queue: PendingOperation[], operation: PendingOperation, inFlightOpId?: string | null): PendingOperation[] {
  if (operation.kind === 'add') return [...queue, operation];

  const itemId = operation.itemId;
  const mutable = (queued: PendingOperation) => queued.opId !== inFlightOpId;
  const pendingAdd = queue.find(
    (queued): queued is Extract<PendingOperation, { kind: 'add' }> => mutable(queued) && queued.kind === 'add' && queued.item.id === itemId,
  );
  const alreadyDeleted = queue.some((queued) => queued.kind === 'delete' && queued.itemId === itemId);

  if (operation.kind === 'update') {
    if (alreadyDeleted) return queue;
    if (pendingAdd) {
      return queue.map((queued) => (queued === pendingAdd ? { ...pendingAdd, item: { ...pendingAdd.item, ...operation.patch } } : queued));
    }
    const existingUpdate = queue.find(
      (queued): queued is Extract<PendingOperation, { kind: 'update' }> => mutable(queued) && queued.kind === 'update' && queued.itemId === itemId,
    );
    if (existingUpdate) {
      return queue.map((queued) => (queued === existingUpdate ? { ...existingUpdate, patch: { ...existingUpdate.patch, ...operation.patch } } : queued));
    }
    return [...queue, operation];
  }

  // delete
  if (alreadyDeleted) return queue;
  const withoutItem = queue.filter((queued) => !mutable(queued) || operationItemId(queued) !== itemId);
  const addStillLocal = pendingAdd !== undefined && !queue.some((queued) => !mutable(queued) && operationItemId(queued) === itemId);
  return addStillLocal ? withoutItem : [...withoutItem, operation];
}

export function removeOperation(queue: PendingOperation[], opId: string): PendingOperation[] {
  return queue.filter((queued) => queued.opId !== opId);
}

/** Items shown to the user = server truth + local operations not yet confirmed. */
export function applyOperations(serverItems: GroceryItem[], queue: PendingOperation[]): GroceryItem[] {
  const byId = new Map(serverItems.map((item) => [item.id, item] as const));
  for (const operation of queue) {
    if (operation.kind === 'add') {
      if (!byId.has(operation.item.id)) byId.set(operation.item.id, operation.item);
    } else if (operation.kind === 'update') {
      const current = byId.get(operation.itemId);
      if (current) byId.set(operation.itemId, { ...current, ...operation.patch });
    } else {
      byId.delete(operation.itemId);
    }
  }
  return sortItems([...byId.values()]);
}

export type RealtimeChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: Partial<GroceryItem> | null;
  old?: Partial<GroceryItem> | null;
};

function isCompleteItem(candidate: Partial<GroceryItem> | null | undefined): candidate is GroceryItem {
  return (
    !!candidate &&
    typeof candidate.id === 'string' &&
    typeof candidate.household_id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.checked === 'boolean' &&
    typeof candidate.mute_reminders === 'boolean' &&
    typeof candidate.created_at === 'string'
  );
}

/** Applies a Supabase Realtime postgres_changes payload to the server-side list. */
export function applyRealtimeChange(serverItems: GroceryItem[], change: RealtimeChange, householdId: string): GroceryItem[] {
  if (change.eventType === 'DELETE') {
    const deletedId = change.old?.id;
    return deletedId ? serverItems.filter((item) => item.id !== deletedId) : serverItems;
  }
  const incoming = change.new;
  if (!isCompleteItem(incoming) || incoming.household_id !== householdId) return serverItems;
  const normalized: GroceryItem = { ...incoming, quantity: typeof incoming.quantity === 'number' ? incoming.quantity : 1 };
  const exists = serverItems.some((item) => item.id === normalized.id);
  const next = exists ? serverItems.map((item) => (item.id === normalized.id ? normalized : item)) : [...serverItems, normalized];
  return sortItems(next);
}

/** To-buy items first (newest first), then items already in the basket. */
export function sortItems(items: GroceryItem[]): GroceryItem[] {
  return [...items].sort((left, right) => {
    if (left.checked !== right.checked) return left.checked ? 1 : -1;
    return right.created_at.localeCompare(left.created_at);
  });
}

/** Trims and collapses whitespace; returns null when the name is unusable. */
export function normalizeItemName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length === 0) return null;
  return name.slice(0, 120);
}
