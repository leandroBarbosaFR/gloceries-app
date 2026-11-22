import { parseAuthCallback } from '../authCallback';

describe('parseAuthCallback', () => {
  it('extracts a PKCE code', () => {
    expect(parseAuthCallback('psst://auth-callback?code=34e770dd-9ff9')).toEqual({ kind: 'code', code: '34e770dd-9ff9' });
  });

  it('extracts implicit-flow tokens from the fragment', () => {
    expect(parseAuthCallback('psst://auth-callback#access_token=abc&refresh_token=def&token_type=bearer&type=magiclink')).toEqual({
      kind: 'tokens',
      accessToken: 'abc',
      refreshToken: 'def',
    });
  });

  it('maps Supabase error redirects to French messages', () => {
    const result = parseAuthCallback('psst://auth-callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(result).toEqual({ kind: 'error', reason: 'expired' });
  });

  it('ignores unrelated URLs (e.g. dev client or notifications)', () => {
    expect(parseAuthCallback('psst://expo-development-client/?url=http%3A%2F%2F192.168.1.2%3A8081')).toBeNull();
    expect(parseAuthCallback('https://example.com/?code=1')).toBeNull();
    expect(parseAuthCallback('psst://auth-callback')).toBeNull();
  });
});
