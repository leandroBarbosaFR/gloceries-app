import { isTransientError, toUserMessage } from '../errors';
import { formatExpiry, formatInviteCode, isPlausibleInviteCode, normalizeInviteCode } from '../invite';
import { buildMapsLinks } from '../maps';

describe('invite codes', () => {
  it('normalizes pasted and formatted codes', () => {
    expect(normalizeInviteCode(' abcd-ef12 3456\n7890 ')).toBe('ABCDEF1234567890');
    expect(isPlausibleInviteCode('abcd-ef12-3456-7890')).toBe(true);
    expect(isPlausibleInviteCode('ZZZZ')).toBe(false);
  });

  it('formats codes in groups of four', () => {
    expect(formatInviteCode('ABCDEF1234567890')).toBe('ABCD-EF12-3456-7890');
  });

  it('describes expiry', () => {
    const now = new Date('2026-11-22T12:00:00Z');
    expect(formatExpiry('2026-11-29T12:00:00Z', now)).toBe('Expire dans 7 jours');
    expect(formatExpiry('2026-11-22T18:00:00Z', now)).toBe('Expire dans moins de 24 h');
    expect(formatExpiry('2026-11-21T12:00:00Z', now)).toBe('Code expiré');
    expect(formatExpiry(null, now)).toBeNull();
    expect(formatExpiry('2026-11-29T12:00:00Z', now, 'en')).toBe('Expires in 7 days');
    expect(formatExpiry('2026-11-29T12:00:00Z', now, 'pt')).toBe('Expira em 7 dias');
  });
});

describe('maps links', () => {
  const store = { id: 's', name: 'Monoprix & Co', latitude: 48.85, longitude: 2.35 };

  it('builds Apple Plans, Google Maps and Waze links', () => {
    expect(buildMapsLinks(store, 'apple')).toEqual({
      appUrl: null,
      webUrl: 'https://maps.apple.com/?daddr=48.85,2.35&q=Monoprix%20%26%20Co&dirflg=d',
    });
    expect(buildMapsLinks(store, 'google').appUrl).toBe('comgooglemaps://?daddr=48.85,2.35&directionsmode=driving');
    expect(buildMapsLinks(store, 'waze').webUrl).toBe('https://waze.com/ul?ll=48.85,2.35&navigate=yes');
  });
});

describe('errors', () => {
  it('classifies network failures as transient', () => {
    expect(isTransientError(new TypeError('Network request failed'))).toBe(true);
    expect(isTransientError({ message: 'FetchError: Network request failed', code: '' })).toBe(true);
    expect(isTransientError({ message: 'server', status: 503 })).toBe(true);
    expect(isTransientError({ message: 'JWT expired', code: 'PGRST301' })).toBe(true);
  });

  it('classifies database rejections as permanent', () => {
    expect(isTransientError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false);
    expect(isTransientError({ message: 'value too long', code: '23514' })).toBe(false);
  });

  it('produces French messages without leaking SQL', () => {
    expect(toUserMessage({ message: 'new row violates row-level security policy', code: '42501' })).toBe(
      "Vous n'avez pas accès à cette liste.",
    );
    expect(toUserMessage({ message: 'invite_invalid' })).toBe("Ce code d'invitation est invalide ou a expiré.");
    expect(toUserMessage({ message: 'Token has expired or is invalid', code: 'otp_expired' })).toContain('Code incorrect');
    expect(toUserMessage(new Error('boom'))).toBe('Une erreur est survenue. Réessayez dans un instant.');
    expect(toUserMessage({ message: 'invite_invalid' }, 'en')).toBe('This invite code is invalid or has expired.');
    expect(toUserMessage({ message: 'invite_invalid' }, 'pt')).toBe('Este código de convite é inválido ou expirou.');
    expect(toUserMessage({ message: 'Unsupported provider: provider is not enabled' }, 'en')).toBe('This sign-in method isn’t enabled yet.');
  });
});
