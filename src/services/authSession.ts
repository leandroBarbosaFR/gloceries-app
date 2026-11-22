import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { AUTH_REDIRECT_URL, parseAuthCallback, type AuthCallback } from '../domain/authCallback';
import { getActiveStrings } from '../i18n';
import { supabase } from '../lib/supabase';

export type SocialResult = 'signed-in' | 'cancelled';

/** Turns a parsed auth redirect (e-mail link or OAuth) into a Supabase session. */
export async function completeAuthCallback(callback: AuthCallback): Promise<void> {
  if (callback.kind === 'error') {
    const strings = getActiveStrings().signIn;
    throw new Error(callback.reason === 'expired' ? strings.linkExpired : strings.linkFailed);
  }
  const { error } =
    callback.kind === 'code'
      ? await supabase.auth.exchangeCodeForSession(callback.code)
      : await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
  if (error) throw error;
}

/**
 * Google via Supabase OAuth (PKCE) in an ASWebAuthenticationSession sheet.
 * The redirect to psst://auth-callback is returned to this promise (not to Linking).
 */
export async function signInWithGoogle(): Promise<SocialResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: AUTH_REDIRECT_URL, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
  const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT_URL, { preferEphemeralSession: false });
  if (result.type !== 'success') return 'cancelled';
  const callback = parseAuthCallback(result.url);
  if (!callback) throw new Error(getActiveStrings().signIn.socialFailed);
  await completeAuthCallback(callback);
  return 'signed-in';
}

export function isAppleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/** Native Sign in with Apple → Supabase ID-token sign-in (nonce protects against replay). */
export async function signInWithApple(): Promise<SocialResult> {
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw error;
  }
  if (!credential.identityToken) throw new Error(getActiveStrings().signIn.appleNoToken);
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
  if (error) throw error;
  return 'signed-in';
}
