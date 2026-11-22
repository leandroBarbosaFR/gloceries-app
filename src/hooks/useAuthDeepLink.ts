import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { parseAuthCallback } from '../domain/authCallback';
import { toUserMessage } from '../domain/errors';
import { getActiveLanguage, getActiveStrings } from '../i18n';
import { completeAuthCallback } from '../services/authSession';

/**
 * Completes sign-in when the user taps the link in the Supabase e-mail on this iPhone
 * (works with Supabase's default, non-editable template). Handles cold start and warm opens.
 */
export function useAuthDeepLink(): { completing: boolean; linkError: string | null; clearLinkError: () => void } {
  const [completing, setCompleting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const handled = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    const handle = async (url: string | null | undefined) => {
      if (!url || handled.current.has(url)) return;
      const callback = parseAuthCallback(url);
      if (!callback) return;
      handled.current.add(url);
      if (callback.kind === 'error') {
        const strings = getActiveStrings().signIn;
        setLinkError(callback.reason === 'expired' ? strings.linkExpired : strings.linkFailed);
        return;
      }
      setCompleting(true);
      setLinkError(null);
      try {
        await completeAuthCallback(callback);
      } catch (error) {
        // PKCE requires opening the link on the same iPhone that requested it.
        const message = String((error as Error)?.message);
        if (mounted) setLinkError(/code verifier/i.test(message) ? getActiveStrings().signIn.linkOtherDevice : toUserMessage(error, getActiveLanguage()));
      } finally {
        if (mounted) setCompleting(false);
      }
    };

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener('url', ({ url }) => void handle(url));
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return { completing, linkError, clearLinkError: () => setLinkError(null) };
}
