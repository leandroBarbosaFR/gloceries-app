import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '../domain/errors';
import { getActiveLanguage } from '../i18n';
import type { Household } from '../lib/types';
import { loadHousehold } from '../services/householdApi';
import { readJson, writeJson } from '../services/storage';

const householdCacheKey = (userId: string) => `psst:household:v1:${userId}`;

export type HouseholdState = {
  household: Household | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setHousehold: (household: Household | null) => void;
};

/** Loads the user's household; cached locally so the app opens offline. */
export function useHousehold(userId: string | null): HouseholdState {
  const [household, setHouseholdState] = useState<Household | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const setHousehold = useCallback(
    (next: Household | null) => {
      setHouseholdState(next);
      if (userId) void writeJson(householdCacheKey(userId), next).catch(() => undefined);
    },
    [userId],
  );

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      setError(null);
      setHousehold(await loadHousehold());
    } catch (loadError) {
      setError(toUserMessage(loadError, getActiveLanguage()));
    } finally {
      setLoading(false);
    }
  }, [setHousehold, userId]);

  useEffect(() => {
    if (!userId) {
      setHouseholdState(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    readJson<Household | null>(householdCacheKey(userId), null).then((cached) => {
      if (cancelled) return;
      if (cached) {
        setHouseholdState(cached);
        setLoading(false);
      }
      void reload();
    });
    return () => {
      cancelled = true;
    };
  }, [reload, userId]);

  return { household, loading, error, reload, setHousehold };
}
