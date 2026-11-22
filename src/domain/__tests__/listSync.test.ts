import type { GroceryItem } from '../../lib/types';
import {
  applyOperations,
  applyRealtimeChange,
  enqueueOperation,
  normalizeItemName,
  removeOperation,
  sortItems,
  type PendingOperation,
} from '../listSync';

function makeItem(id: string, overrides: Partial<GroceryItem> = {}): GroceryItem {
  return {
    id,
    household_id: 'house',
    name: id,
    quantity: 1,
    checked: false,
    mute_reminders: false,
    created_at: `2026-11-22T10:00:0${id.length % 10}Z`,
    ...overrides,
  };
}

let sequence = 0;
const add = (item: GroceryItem): PendingOperation => ({ kind: 'add', opId: `op-${++sequence}`, item, createdAt: sequence });
const update = (itemId: string, patch: Partial<GroceryItem>): PendingOperation => ({
  kind: 'update',
  opId: `op-${++sequence}`,
  itemId,
  patch,
  createdAt: sequence,
});
const remove = (itemId: string): PendingOperation => ({ kind: 'delete', opId: `op-${++sequence}`, itemId, createdAt: sequence });

describe('enqueueOperation coalescing', () => {
  it('folds updates into a pending add', () => {
    const queue = enqueueOperation(enqueueOperation([], add(makeItem('milk'))), update('milk', { checked: true }));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: 'add', item: { id: 'milk', checked: true } });
  });

  it('cancels add + delete entirely', () => {
    const queue = enqueueOperation(enqueueOperation([], add(makeItem('milk'))), remove('milk'));
    expect(queue).toEqual([]);
  });

  it('merges consecutive updates', () => {
    let queue = enqueueOperation([], update('milk', { checked: true }));
    queue = enqueueOperation(queue, update('milk', { mute_reminders: true }));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: 'update', patch: { checked: true, mute_reminders: true } });
  });

  it('replaces updates by a delete and ignores updates after delete', () => {
    let queue = enqueueOperation([], update('milk', { checked: true }));
    queue = enqueueOperation(queue, remove('milk'));
    queue = enqueueOperation(queue, update('milk', { checked: false }));
    queue = enqueueOperation(queue, remove('milk'));
    expect(queue).toHaveLength(1);
    expect(queue[0].kind).toBe('delete');
  });

  it('never rewrites the in-flight operation: delete during an in-flight add is queued', () => {
    const inFlightAdd = add(makeItem('milk'));
    let queue = enqueueOperation([], inFlightAdd);
    queue = enqueueOperation(queue, update('milk', { checked: true }), inFlightAdd.opId);
    expect(queue.map((operation) => operation.kind)).toEqual(['add', 'update']);
    expect(queue[0]).toBe(inFlightAdd);
    queue = enqueueOperation(queue, remove('milk'), inFlightAdd.opId);
    expect(queue.map((operation) => operation.kind)).toEqual(['add', 'delete']);
    expect(queue[0]).toBe(inFlightAdd);
  });

  it('does not merge into an in-flight update', () => {
    const inFlight = update('milk', { checked: true });
    const queue = enqueueOperation([inFlight], update('milk', { mute_reminders: true }), inFlight.opId);
    expect(queue).toHaveLength(2);
    expect(queue[0]).toBe(inFlight);
  });

  it('keeps operations on other items untouched', () => {
    let queue = enqueueOperation([], update('bread', { checked: true }));
    queue = enqueueOperation(queue, remove('milk'));
    expect(queue.map((operation) => operation.kind)).toEqual(['update', 'delete']);
    expect(removeOperation(queue, queue[0].opId)).toHaveLength(1);
  });
});

describe('applyOperations (optimistic view)', () => {
  const server = [makeItem('milk'), makeItem('bread')];

  it('shows pending adds, updates and deletes on top of server data', () => {
    const queue = [add(makeItem('eggs', { created_at: '2026-11-22T11:00:00Z' })), update('milk', { checked: true }), remove('bread')];
    const view = applyOperations(server, queue);
    expect(view.map((item) => [item.id, item.checked])).toEqual([
      ['eggs', false],
      ['milk', true],
    ]);
  });

  it('does not duplicate an add already confirmed by the server', () => {
    const view = applyOperations([...server, makeItem('eggs')], [add(makeItem('eggs'))]);
    expect(view.filter((item) => item.id === 'eggs')).toHaveLength(1);
  });

  it('ignores updates for items deleted elsewhere', () => {
    expect(applyOperations([], [update('ghost', { checked: true })])).toEqual([]);
  });
});

describe('applyRealtimeChange', () => {
  const server = [makeItem('milk')];

  it('inserts and updates complete rows of the same household', () => {
    const inserted = applyRealtimeChange(server, { eventType: 'INSERT', new: makeItem('eggs') }, 'house');
    expect(inserted.map((item) => item.id).sort()).toEqual(['eggs', 'milk']);
    const updated = applyRealtimeChange(inserted, { eventType: 'UPDATE', new: makeItem('milk', { checked: true }) }, 'house');
    expect(updated.find((item) => item.id === 'milk')?.checked).toBe(true);
  });

  it('removes deleted rows (DELETE payload only contains the primary key)', () => {
    expect(applyRealtimeChange(server, { eventType: 'DELETE', old: { id: 'milk' } }, 'house')).toEqual([]);
  });

  it('ignores rows from another household and partial payloads', () => {
    expect(applyRealtimeChange(server, { eventType: 'INSERT', new: makeItem('x', { household_id: 'other' }) }, 'house')).toBe(server);
    expect(applyRealtimeChange(server, { eventType: 'UPDATE', new: { id: 'milk' } }, 'house')).toBe(server);
  });
});

describe('sortItems / normalizeItemName', () => {
  it('puts items to buy first, newest first', () => {
    const sorted = sortItems([
      makeItem('old', { created_at: '2026-01-01T00:00:00Z' }),
      makeItem('done', { checked: true, created_at: '2026-12-01T00:00:00Z' }),
      makeItem('new', { created_at: '2026-06-01T00:00:00Z' }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(['new', 'old', 'done']);
  });

  it('normalizes names', () => {
    expect(normalizeItemName('  lait   demi-écrémé ')).toBe('lait demi-écrémé');
    expect(normalizeItemName('   ')).toBeNull();
    expect(normalizeItemName('a'.repeat(200))).toHaveLength(120);
  });
});
