import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { decodeSeries, encodeSeries, type HrSeries } from '../domain/hrSeries';

/**
 * Per-session heart-rate series live under their own keys (like routes), so
 * the main journal stays small and quick to load.
 */
const key = (sessionId: string) => `@tempo/hr/v1/${sessionId}`;

export async function saveHrSeries(sessionId: string, series: HrSeries): Promise<void> {
  await AsyncStorage.setItem(key(sessionId), encodeSeries(series));
}

export async function loadHrSeries(sessionId: string): Promise<HrSeries | null> {
  try {
    return decodeSeries(await AsyncStorage.getItem(key(sessionId)));
  } catch {
    return null;
  }
}

export function deleteHrSeries(sessionId: string): void {
  AsyncStorage.removeItem(key(sessionId)).catch(() => {});
}

/** Loads a session's series once; null while loading or when there is none. */
export function useHrSeries(sessionId: string, enabled: boolean): HrSeries | null {
  const [loaded, setLoaded] = useState<{ id: string; series: HrSeries | null } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadHrSeries(sessionId).then((series) => {
      if (!cancelled) setLoaded({ id: sessionId, series });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, enabled]);
  return enabled && loaded?.id === sessionId ? loaded.series : null;
}
