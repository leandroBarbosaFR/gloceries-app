import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isTransientError, toUserMessage } from '../domain/errors';
import { getActiveLanguage } from '../i18n';
import type { ListSnapshot } from '../domain/geofenceEngine';
import {
  applyOperations,
  applyRealtimeChange,
  enqueueOperation,
  normalizeItemName,
  removeOperation,
  type PendingOperation,
  type RealtimeChange,
} from '../domain/listSync';
import { supabase } from '../lib/supabase';
import type { GroceryItem, GroceryItemPatch } from '../lib/types';
import { deleteItem, insertItem, listItems, updateItem } from '../services/householdApi';
import { saveListSnapshot } from '../services/geofencing';
import { readJson, StorageKeys, writeJson } from '../services/storage';
import { useOnForeground } from './useAppState';

export type SyncStatus = 'loading' | 'synced' | 'syncing' | 'offline' | 'error';

export type GroceryListState = {
  items: GroceryItem[];
  pendingItemIds: Set<string>;
  status: SyncStatus;
  lastError: string | null;
  lastSyncedAt: number | null;
  addItem: (rawName: string) => boolean;
  toggleChecked: (item: GroceryItem) => void;
  toggleMute: (item: GroceryItem) => void;
  removeItem: (item: GroceryItem) => void;
  clearChecked: () => void;
  refresh: () => Promise<void>;
  dismissError: () => void;
};

type CachedList = { items: GroceryItem[]; savedAt: number };

const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

/**
 * Shared family list with:
 * - instant local cache (works offline / on cold start),
 * - optimistic updates through a persisted offline queue (idempotent replays),
 * - Supabase Realtime + full refresh on (re)subscribe, foreground and network recovery,
 * - a snapshot for the background geofence task.
 */
export function useGroceryList(householdId: string | null, userId: string | null, isOnline: boolean): GroceryListState {
  const [serverItems, setServerItems] = useState<GroceryItem[]>([]);
  const [queue, setQueueState] = useState<PendingOperation[]>([]);
  const [status, setStatus] = useState<SyncStatus>('loading');
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const queueRef = useRef<PendingOperation[]>([]);
  const inFlightRef = useRef<string | null>(null);
  const flushingRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttemptRef = useRef(0);
  const householdRef = useRef(householdId);
  householdRef.current = householdId;

  const setQueue = useCallback((next: PendingOperation[]) => {
    queueRef.current = next;
    setQueueState(next);
    const currentHousehold = householdRef.current;
    if (currentHousehold) void writeJson(StorageKeys.offlineQueue(currentHousehold), next).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    const targetHousehold = householdRef.current;
    if (!targetHousehold) return;
    try {
      const items = await listItems(targetHousehold);
      if (householdRef.current !== targetHousehold) return;
      setServerItems(items);
      setLastSyncedAt(Date.now());
      setStatus(queueRef.current.length > 0 ? 'syncing' : 'synced');
    } catch (error) {
      setStatus(isTransientError(error) ? 'offline' : 'error');
      if (!isTransientError(error)) setLastError(toUserMessage(error, getActiveLanguage()));
    }
  }, []);

  const scheduleRetry = useCallback((flush: () => Promise<void>) => {
    if (retryTimerRef.current) return;
    const delay = RETRY_DELAYS_MS[Math.min(retryAttemptRef.current, RETRY_DELAYS_MS.length - 1)];
    retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      void flush();
    }, delay);
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (flushingRef.current || !userId) return;
    flushingRef.current = true;
    let needsRefresh = false;
    try {
      while (queueRef.current.length > 0) {
        const operation = queueRef.current[0];
        inFlightRef.current = operation.opId;
        setStatus('syncing');
        try {
          if (operation.kind === 'add') await insertItem(operation.item, userId);
          else if (operation.kind === 'update') await updateItem(operation.itemId, operation.patch);
          else await deleteItem(operation.itemId);
          retryAttemptRef.current = 0;
        } catch (error) {
          if (isTransientError(error)) {
            setStatus('offline');
            scheduleRetry(flush);
            return;
          }
          // Permanent rejection (RLS, constraint…): drop it and resync with the server truth.
          setLastError(toUserMessage(error, getActiveLanguage()));
          needsRefresh = true;
        } finally {
          inFlightRef.current = null;
        }
        setQueue(removeOperation(queueRef.current, operation.opId));
      }
      setStatus('synced');
    } finally {
      flushingRef.current = false;
      if (needsRefresh) void refresh();
    }
  }, [refresh, scheduleRetry, setQueue, userId]);

  // Load cache + queue, then fetch, then subscribe.
  useEffect(() => {
    if (!householdId) {
      setServerItems([]);
      queueRef.current = [];
      setQueueState([]);
      return;
    }
    let cancelled = false;
    setStatus('loading');

    void (async () => {
      const [cached, storedQueue] = await Promise.all([
        readJson<CachedList | null>(StorageKeys.listCache(householdId), null),
        readJson<PendingOperation[]>(StorageKeys.offlineQueue(householdId), []),
      ]);
      if (cancelled) return;
      if (cached) {
        setServerItems(cached.items);
        setLastSyncedAt(cached.savedAt);
      }
      queueRef.current = storedQueue;
      setQueueState(storedQueue);
      await flush();
      await refresh();
    })();

    const channel = supabase
      .channel(`psst-items-${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items', filter: `household_id=eq.${householdId}` }, (payload) => {
        setServerItems((previous) => applyRealtimeChange(previous, payload as unknown as RealtimeChange, householdId));
        setLastSyncedAt(Date.now());
      })
      .subscribe((channelStatus) => {
        if (cancelled) return;
        // SUBSCRIBED fires on first join AND after every automatic reconnection: resync then,
        // because changes made while disconnected are not replayed by Realtime.
        if (channelStatus === 'SUBSCRIBED') void refresh();
        else if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') setStatus('offline');
      });

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [flush, householdId, refresh]);

  // Network recovery → push pending changes, then resync.
  useEffect(() => {
    if (!isOnline || !householdId) return;
    retryAttemptRef.current = 0;
    void flush().then(refresh);
  }, [flush, householdId, isOnline, refresh]);

  useOnForeground(() => {
    if (!householdRef.current) return;
    void flush().then(refresh);
  });

  // Persist server cache.
  useEffect(() => {
    if (!householdId || status === 'loading') return;
    void writeJson(StorageKeys.listCache(householdId), { items: serverItems, savedAt: Date.now() } satisfies CachedList).catch(() => undefined);
  }, [householdId, serverItems, status]);

  const items = useMemo(() => applyOperations(serverItems, queue), [queue, serverItems]);
  const pendingItemIds = useMemo(
    () => new Set(queue.map((operation) => (operation.kind === 'add' ? operation.item.id : operation.itemId))),
    [queue],
  );

  // Snapshot for the background geofence task (what the user currently sees).
  useEffect(() => {
    if (!householdId || status === 'loading') return;
    const timer = setTimeout(() => {
      const snapshot: ListSnapshot = {
        householdId,
        savedAt: Date.now(),
        items: items.map(({ id, name, quantity, checked, mute_reminders }) => ({ id, name, quantity, checked, mute_reminders })),
      };
      void saveListSnapshot(snapshot).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [householdId, items, status]);

  const enqueue = useCallback(
    (operation: PendingOperation) => {
      setQueue(enqueueOperation(queueRef.current, operation, inFlightRef.current));
      void flush();
    },
    [flush, setQueue],
  );

  const addItem = useCallback(
    (rawName: string): boolean => {
      const name = normalizeItemName(rawName);
      if (!name || !householdId) return false;
      const now = new Date().toISOString();
      enqueue({
        kind: 'add',
        opId: Crypto.randomUUID(),
        createdAt: Date.now(),
        item: { id: Crypto.randomUUID(), household_id: householdId, name, quantity: 1, checked: false, mute_reminders: false, created_at: now, updated_at: now },
      });
      return true;
    },
    [enqueue, householdId],
  );

  const patchItem = useCallback(
    (item: GroceryItem, patch: GroceryItemPatch) => enqueue({ kind: 'update', opId: Crypto.randomUUID(), createdAt: Date.now(), itemId: item.id, patch }),
    [enqueue],
  );

  const removeItem = useCallback(
    (item: GroceryItem) => enqueue({ kind: 'delete', opId: Crypto.randomUUID(), createdAt: Date.now(), itemId: item.id }),
    [enqueue],
  );

  const clearChecked = useCallback(() => {
    let next = queueRef.current;
    for (const item of items.filter((candidate) => candidate.checked)) {
      next = enqueueOperation(next, { kind: 'delete', opId: Crypto.randomUUID(), createdAt: Date.now(), itemId: item.id }, inFlightRef.current);
    }
    setQueue(next);
    void flush();
  }, [flush, items, setQueue]);

  return {
    items,
    pendingItemIds,
    status: status === 'synced' && !isOnline ? 'offline' : status,
    lastError,
    lastSyncedAt,
    addItem,
    toggleChecked: (item) => patchItem(item, { checked: !item.checked }),
    toggleMute: (item) => patchItem(item, { mute_reminders: !item.mute_reminders }),
    removeItem,
    clearChecked,
    refresh: async () => {
      await flush();
      await refresh();
    },
    dismissError: () => setLastError(null),
  };
}
