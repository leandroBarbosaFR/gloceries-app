import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJson, StorageKeys, writeJson } from '../services/storage';
import { en } from './en';
import { fr, type Strings } from './fr';
import { pt } from './pt';

import type { Language } from '../lib/types';

export type { Language };
export type LanguagePreference = 'system' | Language;
export type { Strings };

const DICTIONARIES: Record<Language, Strings> = { fr, en, pt };

/** French and Portuguese iPhones get their language; every other locale gets English. */
export function deviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'fr' ? 'fr' : code === 'pt' ? 'pt' : 'en';
  } catch {
    return 'fr';
  }
}

export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === 'system' ? deviceLanguage() : preference;
}

export function stringsFor(language: Language): Strings {
  return DICTIONARIES[language];
}

/**
 * Active language for code outside React (hooks' error messages, services, the background
 * geofence task). Kept in sync by I18nProvider; the background task calls loadLanguage().
 */
let activeLanguage: Language = deviceLanguage();
export const getActiveLanguage = (): Language => activeLanguage;
export const getActiveStrings = (): Strings => DICTIONARIES[activeLanguage];

export async function loadLanguagePreference(): Promise<LanguagePreference> {
  const stored = await readJson<LanguagePreference>(StorageKeys.language, 'system');
  return stored === 'fr' || stored === 'en' || stored === 'pt' ? stored : 'system';
}

/** For headless contexts (background task): resolves and activates the saved language. */
export async function loadLanguage(): Promise<Language> {
  activeLanguage = resolveLanguage(await loadLanguagePreference());
  return activeLanguage;
}

type I18nValue = {
  language: Language;
  preference: LanguagePreference;
  strings: Strings;
  setPreference: (preference: LanguagePreference) => void;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference | null>(null);

  useEffect(() => {
    void loadLanguagePreference().then(setPreferenceState);
  }, []);

  const setPreference = useCallback((next: LanguagePreference) => {
    setPreferenceState(next);
    void writeJson(StorageKeys.language, next).catch(() => undefined);
  }, []);

  const value = useMemo<I18nValue | null>(() => {
    if (!preference) return null;
    const language = resolveLanguage(preference);
    activeLanguage = language;
    return { language, preference, strings: DICTIONARIES[language], setPreference };
  }, [preference, setPreference]);

  if (!value) return <>{fallback ?? null}</>;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value) return value;
  // Outside a provider (e.g. isolated component tests): French defaults, read-only.
  return { language: 'fr', preference: 'fr', strings: fr, setPreference: () => undefined };
}
