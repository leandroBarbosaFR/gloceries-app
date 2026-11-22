import type { Language, ReminderStore } from '../lib/types';

export const REMINDER_CATEGORY_ID = 'psst-store-reminder';
export const ACTION_NAVIGATE = 'psst-navigate';
export const ACTION_DISMISS = 'psst-dismiss';
const BODY_BUDGET = 150;

export type ReminderItem = { id: string; name: string; quantity: number };

export type ReminderPayload = {
  kind: 'store-reminder';
  store: ReminderStore;
  itemIds: string[];
  sentAt: number;
};

export type ReminderContent = {
  title: string;
  body: string;
  data: ReminderPayload;
};

function itemLabel(item: ReminderItem): string {
  const name = item.name.trim();
  return item.quantity > 1 ? `${name} (×${item.quantity})` : name;
}

const COPY = {
  fr: {
    and: 'et',
    fallbackStore: 'Un supermarché',
    title: (store: string) => `Psst ! ${store} est tout près`,
    header: (count: number) => `${count} article${count > 1 ? 's' : ''} à acheter : `,
    others: (count: number) => `${count} autre${count > 1 ? 's' : ''}`,
    navigate: 'Itinéraire',
    dismiss: 'Ignorer',
  },
  en: {
    and: 'and',
    fallbackStore: 'A supermarket',
    title: (store: string) => `Psst! ${store} is nearby`,
    header: (count: number) => `${count} item${count === 1 ? '' : 's'} to buy: `,
    others: (count: number) => `${count} more`,
    navigate: 'Directions',
    dismiss: 'Dismiss',
  },
  pt: {
    and: 'e',
    fallbackStore: 'Um supermercado',
    title: (store: string) => `Psst! ${store} está pertinho`,
    header: (count: number) => `${count} ${count === 1 ? 'item' : 'itens'} para comprar: `,
    others: (count: number) => `mais ${count}`,
    navigate: 'Rota',
    dismiss: 'Ignorar',
  },
};

export function reminderActionTitles(language: Language): { navigate: string; dismiss: string } {
  return { navigate: COPY[language].navigate, dismiss: COPY[language].dismiss };
}

/** "a", "a et b", "a, b et c" (or "and" in English). */
export function joinList(parts: string[], language: Language = 'fr'): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} ${COPY[language].and} ${parts[parts.length - 1]}`;
}

/**
 * One grouped notification per store entry: lists as many items as fit, then "et N autres".
 */
export function buildReminderContent(store: ReminderStore, items: ReminderItem[], sentAt: number, language: Language = 'fr'): ReminderContent {
  const copy = COPY[language];
  const storeName = store.name.trim() || copy.fallbackStore;
  const count = items.length;
  const header = copy.header(count);

  const labels = items.map(itemLabel);
  const renderList = (shownLabels: string[]): string => {
    const hidden = count - shownLabels.length;
    return hidden > 0 ? `${shownLabels.join(', ')} ${copy.and} ${copy.others(hidden)}` : joinList(shownLabels, language);
  };

  // Greedily show as many item names as fit in the budget; always show at least one.
  let list = renderList(labels.slice(0, 1));
  for (let i = 2; i <= labels.length; i++) {
    const candidate = renderList(labels.slice(0, i));
    if (header.length + candidate.length > BODY_BUDGET) break;
    list = candidate;
  }

  return {
    title: copy.title(storeName),
    body: `${header}${list}.`,
    data: { kind: 'store-reminder', store: { ...store, name: storeName }, itemIds: items.map((item) => item.id), sentAt },
  };
}

/** Defensive parse of the payload received from a notification response. */
export function parseReminderPayload(raw: unknown): ReminderPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.kind !== 'store-reminder') return null;
  const store = candidate.store as Record<string, unknown> | undefined;
  if (
    !store ||
    typeof store.id !== 'string' ||
    typeof store.name !== 'string' ||
    typeof store.latitude !== 'number' ||
    typeof store.longitude !== 'number'
  ) {
    return null;
  }
  const itemIds = Array.isArray(candidate.itemIds) ? candidate.itemIds.filter((value): value is string => typeof value === 'string') : [];
  return {
    kind: 'store-reminder',
    store: { id: store.id, name: store.name, latitude: store.latitude, longitude: store.longitude },
    itemIds,
    sentAt: typeof candidate.sentAt === 'number' ? candidate.sentAt : 0,
  };
}
