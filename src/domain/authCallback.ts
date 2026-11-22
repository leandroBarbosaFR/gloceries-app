/** Deep link the sign-in e-mail redirects to. Must be listed in Supabase › Auth › URL Configuration › Redirect URLs. */
export const AUTH_REDIRECT_URL = 'psst://auth-callback';

export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; reason: 'expired' | 'failed' };

function parseParams(fragment: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of fragment.split('&')) {
    if (!pair) continue;
    const separator = pair.indexOf('=');
    const key = separator === -1 ? pair : pair.slice(0, separator);
    const value = separator === -1 ? '' : pair.slice(separator + 1);
    try {
      params.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' ')));
    } catch {
      params.set(key, value);
    }
  }
  return params;
}

/**
 * Parses the magic-link redirect. Supports the PKCE flow (`?code=`), the implicit flow
 * (`#access_token=…&refresh_token=…`) and Supabase error redirects. Returns null for any other URL.
 */
export function parseAuthCallback(url: string): AuthCallback | null {
  if (!url.startsWith(AUTH_REDIRECT_URL)) return null;
  const rest = url.slice(AUTH_REDIRECT_URL.length);
  const queryStart = rest.indexOf('?');
  const hashStart = rest.indexOf('#');
  const query = queryStart === -1 ? '' : rest.slice(queryStart + 1, hashStart > queryStart ? hashStart : undefined);
  const hash = hashStart === -1 ? '' : rest.slice(hashStart + 1);
  const params = parseParams(query);
  for (const [key, value] of parseParams(hash)) params.set(key, value);

  const errorText = params.get('error_description') ?? params.get('error');
  if (errorText) {
    const expired = /expired|invalid/i.test(errorText) || params.get('error_code') === 'otp_expired';
    return { kind: 'error', reason: expired ? 'expired' : 'failed' };
  }
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return null;
}
