import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthDeepLink } from './src/hooks/useAuthDeepLink';
import { I18nProvider, useI18n } from './src/i18n';
import { useHousehold } from './src/hooks/useHousehold';
import { useSession } from './src/hooks/useSession';
import { isConfigured } from './src/lib/supabase';
import { HouseholdSetupScreen } from './src/screens/HouseholdSetupScreen';
import { MainShell, signOutEverywhere } from './src/screens/MainShell';
import { ConfigMissingScreen, OnboardingScreen, SignInScreen } from './src/screens/WelcomeScreens';
import { readJson, StorageKeys, writeJson } from './src/services/storage';
import { ScreenshotApp } from './src/screenshots/ScreenshotApp';
import { colors } from './src/theme/tokens';

// Only true when bundled with EXPO_PUBLIC_SCREENSHOT_MODE=1 (App Store screenshots). Never set for EAS builds.
const SCREENSHOT_MODE = process.env.EXPO_PUBLIC_SCREENSHOT_MODE === '1';

function Splash({ label = 'Chargement' }: { label?: string }) {
  return (
    <View style={styles.splash} accessibilityLabel={label} accessible>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function ConfiguredApp() {
  const { strings } = useI18n();
  const { session, loading: sessionLoading } = useSession();
  const authLink = useAuthDeepLink();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const userId = session?.user.id ?? null;
  const household = useHousehold(userId);

  useEffect(() => {
    void readJson<boolean>(StorageKeys.onboardingDone, false).then(setOnboardingDone);
  }, []);

  if (sessionLoading || onboardingDone === null) return <Splash label={strings.common.loading} />;
  if (!onboardingDone && !session && !authLink.completing) {
    return (
      <OnboardingScreen
        onDone={() => {
          setOnboardingDone(true);
          void writeJson(StorageKeys.onboardingDone, true);
        }}
      />
    );
  }
  if (!session) return <SignInScreen completing={authLink.completing} linkError={authLink.linkError} />;
  if (household.loading && !household.household) return <Splash label={strings.common.loading} />;
  if (!household.household) {
    return (
      <HouseholdSetupScreen onReady={household.setHousehold} onSignOut={() => void signOutEverywhere()} loadError={household.error} onRetry={() => void household.reload()} />
    );
  }
  return <MainShell key={household.household.id} session={session} household={household.household} setHousehold={household.setHousehold} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <I18nProvider fallback={<Splash />}>
        {SCREENSHOT_MODE ? <ScreenshotApp /> : isConfigured ? <ConfiguredApp /> : <ConfigMissingScreen />}
      </I18nProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
