import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/** Online unless NetInfo positively reports no connection / no internet. */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  }, []);
  return isOnline;
}

/** Calls `callback` each time the app returns to the foreground. */
export function useOnForeground(callback: () => void): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (previous !== 'active' && next === 'active') callbackRef.current();
      previous = next;
    });
    return () => subscription.remove();
  }, []);
}

export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  return reduceMotion;
}
