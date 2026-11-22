import type { Language } from '../lib/types';

/** Accepts "abcd-ef12 3456 7890" or pasted text, returns "ABCDEF1234567890". */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

export function isPlausibleInviteCode(input: string): boolean {
  return /^[0-9A-F]{16}$/.test(normalizeInviteCode(input));
}

/** "ABCDEF1234567890" → "ABCD-EF12-3456-7890" for readability. */
export function formatInviteCode(code: string): string {
  const normalized = normalizeInviteCode(code);
  return normalized.match(/.{1,4}/g)?.join('-') ?? normalized;
}

export function formatExpiry(expiresAtIso: string | null | undefined, now: Date = new Date(), language: Language = 'fr'): string | null {
  if (!expiresAtIso) return null;
  const expiresAt = new Date(expiresAtIso);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const copy = {
    fr: { expired: 'Code expiré', soon: 'Expire dans moins de 24 h', days: (count: number) => `Expire dans ${count} jours` },
    en: { expired: 'Code expired', soon: 'Expires in less than 24 hours', days: (count: number) => `Expires in ${count} days` },
    pt: { expired: 'Código expirado', soon: 'Expira em menos de 24 h', days: (count: number) => `Expira em ${count} dias` },
  }[language];
  if (expiresAt.getTime() <= now.getTime()) return copy.expired;
  const days = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return days <= 1 ? copy.soon : copy.days(days);
}
