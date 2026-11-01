import { NativeModules, PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';
import type BleManagerInstance from 'react-native-ble-manager';

/**
 * Thin, lazily-loaded wrapper around react-native-ble-manager.
 *
 * The native module only exists in real builds (EAS / `expo run:android`).
 * In Expo Go and on the web it is missing, and importing the library would
 * throw — so it is required on demand, and everything degrades gracefully to
 * "Bluetooth unavailable" (the demo sensor still works).
 */

export type BleManager = typeof BleManagerInstance;

/** Bluetooth SIG Heart Rate Service and Heart Rate Measurement characteristic. */
export const HR_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
export const HR_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

export const isHrMeasurement = (uuid: string) => {
  const u = uuid.toLowerCase();
  return u === '2a37' || u === HR_MEASUREMENT;
};

let cached: BleManager | null | undefined;
let started: Promise<void> | null = null;

export function getBle(): BleManager | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') return (cached = null);
  const native = TurboModuleRegistry.get('BleManager') ?? NativeModules.BleManager;
  if (!native) return (cached = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-ble-manager').default as BleManager;
  } catch {
    cached = null;
  }
  return cached;
}

export const bleAvailable = () => getBle() !== null;

export type ReadyResult = 'ok' | 'unavailable' | 'permission-denied' | 'bluetooth-off';

/** Start the manager once, request runtime permissions and make sure Bluetooth is on. */
export async function ensureBleReady(): Promise<ReadyResult> {
  const ble = getBle();
  if (!ble) return 'unavailable';

  if (Platform.OS === 'android') {
    const granted = await requestAndroidPermissions();
    if (!granted) return 'permission-denied';
  }

  started ??= ble.start({ showAlert: false });
  await started;

  const state = await ble.checkState();
  if (state === 'off' || state === 'turning_off') {
    if (Platform.OS === 'android') {
      try {
        await ble.enableBluetooth(); // shows the system "Turn on Bluetooth?" prompt
        return 'ok';
      } catch {
        return 'bluetooth-off';
      }
    }
    return 'bluetooth-off';
  }
  if (state === 'unauthorized') return 'permission-denied';
  return 'ok';
}

async function requestAndroidPermissions(): Promise<boolean> {
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const P = PermissionsAndroid.PERMISSIONS;
  const needed =
    api >= 31
      ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT] // Android 12+: "Nearby devices"
      : [P.ACCESS_FINE_LOCATION]; // Android ≤ 11 needs location to scan for BLE
  const result = await PermissionsAndroid.requestMultiple(needed);
  return needed.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
