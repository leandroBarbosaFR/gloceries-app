import type { Language } from '../lib/types';

type ErrorShape = { message?: unknown; code?: unknown; status?: unknown; name?: unknown };

function shapeOf(error: unknown): ErrorShape {
  if (error && typeof error === 'object') return error as ErrorShape;
  return { message: String(error) };
}

const NETWORK_PATTERN = /network request failed|failed to fetch|network|timed? ?out|timeout|abort|offline|internet/i;

/**
 * Transient errors are worth retrying later (offline, timeouts, server overload, expired JWT that
 * will be refreshed). Permanent ones (RLS denied, constraint violations) must not be retried forever.
 */
export function isTransientError(error: unknown): boolean {
  const { message, code, status, name } = shapeOf(error);
  if (name === 'AbortError') return true;
  if (typeof status === 'number' && (status === 0 || status === 408 || status === 429 || status >= 500)) return true;
  if (code === 'PGRST301' || code === 'PGRST303') return true; // JWT expired / invalid: refresh then retry
  if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return false; // Postgres SQLSTATE
  if (typeof code === 'string' && code.startsWith('PGRST')) return false;
  return typeof message === 'string' && NETWORK_PATTERN.test(message);
}

const MESSAGES = {
  fr: {
    code: 'Code incorrect ou expiré. Demandez un nouveau code.',
    rateLimited: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.',
    invite: "Ce code d'invitation est invalide ou a expiré.",
    forbidden: "Vous n'avez pas accès à cette liste.",
    network: 'Connexion impossible. Vérifiez votre réseau puis réessayez.',
    email: 'Adresse e-mail invalide.',
    provider: 'Ce mode de connexion n’est pas encore activé.',
    generic: 'Une erreur est survenue. Réessayez dans un instant.',
  },
  en: {
    code: 'Incorrect or expired code. Request a new one.',
    rateLimited: 'Too many attempts. Please wait a few minutes before trying again.',
    invite: 'This invite code is invalid or has expired.',
    forbidden: 'You don’t have access to this list.',
    network: 'Can’t connect. Check your network and try again.',
    email: 'Invalid email address.',
    provider: 'This sign-in method isn’t enabled yet.',
    generic: 'Something went wrong. Please try again in a moment.',
  },
  pt: {
    code: 'Código incorreto ou expirado. Peça um novo.',
    rateLimited: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
    invite: 'Este código de convite é inválido ou expirou.',
    forbidden: 'Você não tem acesso a esta lista.',
    network: 'Sem conexão. Verifique sua rede e tente novamente.',
    email: 'E-mail inválido.',
    provider: 'Este método de login ainda não está ativado.',
    generic: 'Algo deu errado. Tente novamente em instantes.',
  },
} satisfies Record<Language, Record<string, string>>;

/** Maps technical errors to short user copy. Never leaks raw SQL to users. */
export function toUserMessage(error: unknown, language: Language = 'fr'): string {
  const messages = MESSAGES[language];
  const { message, code, status } = shapeOf(error);
  const text = typeof message === 'string' ? message : '';
  if (code === 'otp_expired' || /token has expired|invalid.*token|otp/i.test(text)) return messages.code;
  if (code === 'over_email_send_rate_limit' || status === 429 || /rate[ _]limit|too many|trop de tentatives/i.test(text)) return messages.rateLimited;
  if (/invite_invalid|code invalide/i.test(text)) return messages.invite;
  if (code === '42501' || /row-level security|permission denied/i.test(text)) return messages.forbidden;
  if (code === 'provider_disabled' || /provider is not enabled|unsupported provider/i.test(text)) return messages.provider;
  if (isTransientError(error)) return messages.network;
  if (/email/i.test(text) && /invalid/i.test(text)) return messages.email;
  return messages.generic;
}
