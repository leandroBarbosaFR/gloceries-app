import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Banner, Card } from '../components/Surfaces';
import { TextField } from '../components/TextField';
import { AUTH_REDIRECT_URL } from '../domain/authCallback';
import { toUserMessage } from '../domain/errors';
import { useI18n, type LanguagePreference } from '../i18n';
import { isSecretKeyMisconfiguration, supabase } from '../lib/supabase';
import { isAppleSignInAvailable, signInWithApple, signInWithGoogle } from '../services/authSession';
import { colors, radii, spacing, touch } from '../theme/tokens';

function Logo() {
  return (
    <View style={styles.logoRow} accessible accessibilityLabel="Psst!">
      <View style={styles.logoMark}>
        <Ionicons name="basket" size={22} color={colors.onPrimary} />
      </View>
      <AppText variant="title2" tone="brand">
        Psst!
      </AppText>
    </View>
  );
}

/** Compact FR / EN switch shown before sign-in. The full choice (incl. Automatic) lives in Settings. */
function LanguageToggle() {
  const { language, setPreference } = useI18n();
  const options: { value: LanguagePreference; label: string; name: string }[] = [
    { value: 'fr', label: 'FR', name: 'Français' },
    { value: 'en', label: 'EN', name: 'English' },
    { value: 'pt', label: 'PT', name: 'Português' },
  ];
  return (
    <View style={styles.languageToggle} accessibilityRole="radiogroup" accessibilityLabel="Langue / Language / Idioma">
      {options.map((option) => {
        const selected = option.value === language;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.name}
            onPress={() => setPreference(option.value)}
            hitSlop={6}
            style={[styles.languageOption, selected && styles.languageOptionSelected]}
          >
            <AppText variant="footnote" weight="700" tone={selected ? 'inverse' : 'secondary'} maxFontSizeMultiplier={1.2}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function TopBar({ trailing }: { trailing?: React.ReactNode }) {
  return (
    <View style={styles.topBar}>
      <Logo />
      <View style={styles.topBarTrailing}>
        {trailing}
        <LanguageToggle />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
export function ConfigMissingScreen() {
  const { strings } = useI18n();
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.centered}>
        <Logo />
        <AppText variant="title1">{strings.config.title}</AppText>
        <AppText variant="body" tone="secondary">
          {isSecretKeyMisconfiguration ? strings.config.secretKey : strings.config.body}
        </AppText>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
const PAGE_ICONS: (keyof typeof Ionicons.glyphMap)[] = ['people', 'notifications', 'shield-checkmark'];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { strings } = useI18n();
  const pages = strings.onboarding.pages;
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const isLast = page === pages.length - 1;

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== page) setPage(next);
  };

  const goNext = () => {
    if (isLast) return onDone();
    scrollRef.current?.scrollTo({ x: width * (page + 1), animated: true });
    setPage(page + 1);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <TopBar trailing={!isLast ? <Button title={strings.onboarding.skip} variant="ghost" compact onPress={onDone} accessibilityHint={strings.onboarding.skipHint} /> : null} />
      <ScrollView ref={scrollRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} style={styles.flex}>
        {pages.map((content, i) => (
          <View key={content.title} style={[styles.onboardingPage, { width }]}>
            <View style={styles.heroIcon}>
              <Ionicons name={PAGE_ICONS[i]} size={44} color={colors.primary} />
            </View>
            <AppText variant="title1" accessibilityRole="header">
              {content.title}
            </AppText>
            <AppText variant="body" tone="secondary">
              {content.body}
            </AppText>
            <View style={styles.bullets}>
              {content.bullets.map((bullet) => (
                <View key={bullet} style={styles.bullet}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                  <AppText variant="callout" style={styles.flex}>
                    {bullet}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.onboardingFooter}>
        <View style={styles.dots} accessible accessibilityLabel={strings.onboarding.pageA11y(page + 1, pages.length)}>
          {pages.map((content, i) => (
            <View key={content.title} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>
        <Button title={isLast ? strings.onboarding.start : strings.onboarding.next} onPress={goNext} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
type BusyKind = 'email' | 'code' | 'google' | 'apple';

export function SignInScreen({ completing = false, linkError = null }: { completing?: boolean; linkError?: string | null }) {
  const { strings, language } = useI18n();
  const copy = strings.signIn;
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'choose' | 'code'>('choose');
  const [busy, setBusy] = useState<BusyKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showCodeEntry, setShowCodeEntry] = useState(false);
  const [resendInSeconds, setResendInSeconds] = useState(0);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    void isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  // Each new e-mail invalidates the previous link and Supabase rate-limits sends: enforce a pause.
  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = setTimeout(() => setResendInSeconds((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendInSeconds]);

  const trimmedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const codeDigits = code.replace(/\D/g, '');

  const run = async (kind: BusyKind, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (runError) {
      // Our own errors already carry translated copy; Supabase/native errors are mapped.
      const isLocalized = runError instanceof Error && Object.values(copy).includes(runError.message);
      setError(isLocalized ? (runError as Error).message : toUserMessage(runError, language));
    } finally {
      setBusy(null);
    }
  };

  const sendLink = () =>
    run('email', async () => {
      if (!emailValid) return;
      const { error: otpError } = await supabase.auth.signInWithOtp({ email: trimmedEmail, options: { shouldCreateUser: true, emailRedirectTo: AUTH_REDIRECT_URL } });
      if (otpError) throw otpError;
      setStep('code');
      setResendInSeconds(60);
      setInfo(copy.sent(trimmedEmail));
    });

  const verify = () =>
    run('code', async () => {
      if (codeDigits.length < 6) return;
      const { error: verifyError } = await supabase.auth.verifyOtp({ email: trimmedEmail, token: codeDigits, type: 'email' });
      if (verifyError) throw verifyError;
    });

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <TopBar />
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <AppText variant="largeTitle" accessibilityRole="header">
            {copy.title}
          </AppText>
          <AppText variant="body" tone="secondary">
            {copy.intro}
          </AppText>
          {linkError ? <Banner tone="danger" message={linkError} /> : null}
          {error ? <Banner tone="danger" message={error} /> : null}

          {completing ? (
            <View style={styles.completing} accessibilityLiveRegion="polite">
              <ActivityIndicator color={colors.primary} />
              <AppText variant="callout" tone="secondary">
                {copy.completing}
              </AppText>
            </View>
          ) : step === 'choose' ? (
            <>
              {appleAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                  cornerRadius={radii.md}
                  style={styles.appleButton}
                  onPress={() =>
                    void run('apple', async () => {
                      await signInWithApple();
                    })
                  }
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy.continueWithGoogle}
                accessibilityState={{ busy: busy === 'google', disabled: busy !== null }}
                disabled={busy !== null}
                onPress={() =>
                  void run('google', async () => {
                    await signInWithGoogle();
                  })
                }
                style={({ pressed }) => [styles.googleButton, pressed && { backgroundColor: colors.surfacePressed }]}
              >
                {busy === 'google' ? (
                  <ActivityIndicator color={colors.ink} />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={20} color={colors.ink} />
                    <AppText variant="headline" maxFontSizeMultiplier={1.4}>
                      {copy.continueWithGoogle}
                    </AppText>
                  </>
                )}
              </Pressable>

              <View style={styles.divider}>
                <View style={styles.line} />
                <AppText variant="footnote" tone="tertiary">
                  {strings.common.or}
                </AppText>
                <View style={styles.line} />
              </View>

              <TextField
                label={copy.emailLabel}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder={copy.emailPlaceholder}
                returnKeyType="send"
                onSubmitEditing={() => void sendLink()}
              />
              <Button title={copy.sendLink} variant="secondary" icon="mail-outline" onPress={() => void sendLink()} loading={busy === 'email'} disabled={!emailValid || busy !== null} />
            </>
          ) : (
            <>
              {info ? (
                <AppText variant="callout" tone="brand" accessibilityLiveRegion="polite">
                  {info}
                </AppText>
              ) : null}
              <Card style={styles.linkCard}>
                <Ionicons name="mail-open-outline" size={28} color={colors.primary} />
                <AppText variant="headline">{copy.openEmailTitle}</AppText>
                <AppText variant="callout" tone="secondary">
                  {copy.openEmailBody}
                </AppText>
              </Card>
              {showCodeEntry ? (
                <>
                  <TextField
                    label={copy.codeLabel}
                    value={code}
                    onChangeText={setCode}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={10}
                    placeholder="123456"
                    returnKeyType="done"
                    onSubmitEditing={() => void verify()}
                    style={styles.codeInput}
                  />
                  <Button title={copy.validateCode} variant="secondary" onPress={() => void verify()} loading={busy === 'code'} disabled={codeDigits.length < 6} />
                </>
              ) : (
                <Button title={copy.haveCode} variant="ghost" compact onPress={() => setShowCodeEntry(true)} />
              )}
              <Button
                title={resendInSeconds > 0 ? copy.resendIn(resendInSeconds) : copy.resend}
                variant="ghost"
                onPress={() => void sendLink()}
                disabled={busy !== null || resendInSeconds > 0}
                accessibilityHint={copy.resendHint}
              />
              <Button
                title={copy.changeEmail}
                variant="ghost"
                onPress={() => {
                  setStep('choose');
                  setCode('');
                  setError(null);
                }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoMark: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, minHeight: 56 },
  topBarTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  languageToggle: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radii.pill, padding: 3 },
  languageOption: { minWidth: 44, minHeight: 34, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  languageOptionSelected: { backgroundColor: colors.primary },
  onboardingPage: { paddingHorizontal: spacing.xxl, paddingTop: spacing.xxl, gap: spacing.lg },
  heroIcon: { width: 96, height: 96, borderRadius: radii.xl, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  bullets: { gap: spacing.md, marginTop: spacing.sm },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  onboardingFooter: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 22, backgroundColor: colors.primary },
  form: { padding: spacing.xxl, paddingTop: spacing.lg, gap: spacing.lg },
  appleButton: { height: touch.large, width: '100%' },
  googleButton: {
    minHeight: touch.large,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  completing: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  linkCard: { gap: spacing.sm },
  codeInput: { fontSize: 24, letterSpacing: 6, fontVariant: ['tabular-nums'] },
});
