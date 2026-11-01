import AsyncStorage from '@react-native-async-storage/async-storage';

import type { RoutePoint } from '../domain/track';

/**
 * GPS routes live under their own storage keys, one per session, so the main
 * journal stays small and quick to load.
 */
const key = (sessionId: string) => `@tempo/route/v1/${sessionId}`;

export async function saveRoute(sessionId: string, route: readonly RoutePoint[]): Promise<void> {
  if (route.length < 2) return;
  await AsyncStorage.setItem(key(sessionId), JSON.stringify(route));
}

export async function loadRoute(sessionId: string): Promise<RoutePoint[] | null> {
  try {
    const raw = await AsyncStorage.getItem(key(sessionId));
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    return data.filter(
      (p): p is RoutePoint => Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number' && Number.isFinite(n)),
    );
  } catch {
    return null;
  }
}

export function deleteRoute(sessionId: string): void {
  AsyncStorage.removeItem(key(sessionId)).catch(() => {});
}
