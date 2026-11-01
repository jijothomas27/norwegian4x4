import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';

import { advertisesHeartRate, isGarmin, parseAdvertisement } from '../domain/advertisement';
import { isHeartRateServiceUuid, isPlausibleBpm, parseHeartRateMeasurement } from '../domain/heartRatePacket';
import type { HrDevice } from '../state/model';
import { useStore } from '../state/store';
import { bleAvailable, ensureBleReady, getBle, HR_MEASUREMENT, HR_SERVICE, isHrMeasurement, withTimeout } from './ble';

export type HrStatus =
  | 'idle' // nothing connected
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting' // lost the sensor, retrying in the background
  | 'bluetooth-off'
  | 'permission-denied'
  | 'unavailable'; // no native Bluetooth (Expo Go / web)

export interface FoundDevice extends HrDevice {
  rssi: number;
  /** Advertises the standard Heart Rate service. */
  heartRate: boolean;
  /**
   * Already paired/connected to this phone (e.g. a Garmin watch linked to
   * Garmin Connect). Such devices often don't show up in scans at all, so
   * they're listed separately and connected to directly.
   */
  paired?: boolean;
}

export interface HeartRateState {
  status: HrStatus;
  device: HrDevice | null;
  bpm: number | null;
  /** epoch ms of the latest reading */
  at: number | null;
  /** false = sensor reports it has lost skin contact */
  contact: boolean | null;
  found: FoundDevice[];
  error: string | null;
  /** True once a scan has run to completion (for "nothing found" help). */
  scanDone: boolean;
}

interface HeartRateApi extends HeartRateState {
  bleAvailable: boolean;
  scan: (opts?: { all?: boolean }) => Promise<void>;
  stopScan: () => void;
  connect: (device: HrDevice) => Promise<void>;
  /** Disconnect and stop auto-reconnecting (keeps the device remembered). */
  disconnect: () => void;
  /** Disconnect and forget the remembered device. */
  forget: () => void;
  /** Demo sensor only: the bpm the simulated heart drifts towards. */
  setDemoTarget: (bpm: number) => void;
}

export const DEMO_DEVICE: HrDevice = { id: 'demo', name: 'Demo sensor' };

const SCAN_SECONDS = 12;
const CONNECT_TIMEOUT_MS = 12_000;
const RETRY_MS = 4000;

const INITIAL: HeartRateState = {
  status: 'idle',
  device: null,
  bpm: null,
  at: null,
  contact: null,
  found: [],
  error: null,
  scanDone: false,
};

const HeartRateContext = createContext<HeartRateApi | null>(null);

export function HeartRateProvider({ children }: { children: ReactNode }) {
  const { state: store, updateSettings } = useStore();
  const available = bleAvailable();
  const [hr, setHr] = useState<HeartRateState>(() => ({ ...INITIAL, status: available ? 'idle' : 'unavailable' }));

  // Mutable session bookkeeping — only touched from effects and handlers.
  const currentId = useRef<string | null>(null); // device we want to be connected to
  const wanted = useRef(false); // user wants a live connection (auto-reconnect on)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoTarget = useRef(72);
  const demoBpm = useRef(68);
  // When scanning with the Heart Rate service filter, every result is a HR source
  // even if its advertisement doesn't spell the UUID out in a form we can parse.
  const filteredScan = useRef(true);

  const clearRetry = () => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  };

  const stopDemo = () => {
    if (demoTimer.current) clearInterval(demoTimer.current);
    demoTimer.current = null;
  };

  // connectReal is defined below; retries reach it through this ref.
  const connectRef = useRef<((d: HrDevice, o?: { silent?: boolean }) => Promise<void>) | null>(null);

  const scheduleRetry = (device: HrDevice) => {
    clearRetry();
    retryTimer.current = setTimeout(() => {
      if (wanted.current) void connectRef.current?.(device, { silent: true });
    }, RETRY_MS);
  };

  const findByName = async (name: string): Promise<{ id: string } | null> => {
    const ble = getBle();
    if (!ble) return null;
    try {
      await ble.scan({ serviceUUIDs: [HR_SERVICE], seconds: 6 });
      await new Promise((r) => setTimeout(r, 6500));
      const list = await ble.getDiscoveredPeripherals();
      const match = list.find((p) => (p.name ?? p.advertising?.localName) === name);
      return match ? { id: match.id } : null;
    } catch {
      return null;
    }
  };

  // ── Native event listeners ────────────────────────────────────────────────
  const onDisconnected = useEffectEvent((peripheral: string) => {
    if (peripheral !== currentId.current) return;
    if (wanted.current && hr.device) {
      setHr((s) => ({ ...s, status: 'reconnecting', bpm: null }));
      scheduleRetry(hr.device);
    } else {
      setHr((s) => ({ ...s, status: 'idle', bpm: null }));
    }
  });

  useEffect(() => {
    const ble = getBle();
    if (!ble) return;
    const subs = [
      ble.onDidUpdateValueForCharacteristic((e) => {
        if (e.peripheral !== currentId.current || !isHrMeasurement(e.characteristic)) return;
        const m = parseHeartRateMeasurement(e.value);
        if (!m || !isPlausibleBpm(m.bpm)) return;
        setHr((s) => ({ ...s, bpm: m.bpm, contact: m.contact, at: Date.now(), status: 'connected' }));
      }),
      ble.onDiscoverPeripheral((p) => {
        // The library doesn't always surface the name or service list (Garmin
        // watches especially), so also read the raw advertisement bytes.
        const raw = parseAdvertisement(p.advertising?.rawData?.bytes);
        const advertised = (p.advertising?.serviceUUIDs ?? []).some(isHeartRateServiceUuid) || advertisesHeartRate(raw);
        const heartRate = advertised || filteredScan.current;
        const garmin = isGarmin(raw);
        const name = p.name ?? p.advertising?.localName ?? raw.name ?? (garmin ? 'Garmin watch' : undefined);
        if (!name && !heartRate) return; // unnamed, irrelevant devices are just noise
        setHr((s) => {
          const existing = s.found.find((d) => d.id === p.id);
          const entry: FoundDevice = {
            id: p.id,
            name: name ?? existing?.name ?? 'Heart-rate sensor',
            rssi: p.rssi,
            heartRate: heartRate || !!existing?.heartRate,
            paired: existing?.paired,
          };
          return { ...s, found: sortFound([...s.found.filter((d) => d.id !== p.id), entry]) };
        });
      }),
      ble.onStopScan(() => setHr((s) => (s.status === 'scanning' ? { ...s, status: 'idle', scanDone: true } : { ...s, scanDone: true }))),
      ble.onDisconnectPeripheral((e) => onDisconnected(e.peripheral)),
      ble.onDidUpdateState((e) => {
        if (e.state === 'off') setHr((s) => ({ ...s, status: 'bluetooth-off', bpm: null }));
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  // ── Connecting ────────────────────────────────────────────────────────────
  const connectReal = useCallback(
    async (device: HrDevice, { silent = false }: { silent?: boolean } = {}) => {
      const ble = getBle();
      if (!ble) return;
      clearRetry();
      const ready = await ensureBleReady();
      if (ready !== 'ok') {
        setHr((s) => ({ ...s, status: ready, error: null }));
        if (ready === 'bluetooth-off' && wanted.current) scheduleRetry(device);
        return;
      }
      currentId.current = device.id;
      wanted.current = true;
      setHr((s) => ({ ...s, device, status: s.status === 'reconnecting' ? 'reconnecting' : 'connecting', error: null }));
      try {
        await ble.stopScan().catch(() => {});
        await withTimeout(ble.connect(device.id), CONNECT_TIMEOUT_MS, 'Connecting');
        const info = await withTimeout(ble.retrieveServices(device.id), CONNECT_TIMEOUT_MS, 'Discovering services');
        const services = [...(info.services ?? []).map((x) => x.uuid), ...(info.serviceUUIDs ?? [])];
        if (services.length > 0 && !services.some(isHeartRateServiceUuid)) {
          throw new NotBroadcastingError(device.name);
        }
        await ble.startNotification(device.id, HR_SERVICE, HR_MEASUREMENT);
        setHr((s) => ({ ...s, status: 'connected', device, error: null }));
        if (store.settings.hrDevice?.id !== device.id || store.settings.hrDevice?.name !== device.name) {
          updateSettings({ hrDevice: device });
        }
      } catch (err) {
        if (err instanceof NotBroadcastingError) {
          // Reachable, but heart-rate broadcast is off on the watch. Keep trying
          // quietly so it connects as soon as the user turns it on.
          setHr((s) => ({ ...s, status: 'reconnecting', error: silent ? s.error : err.message }));
          if (wanted.current) scheduleRetry(device);
          return;
        }
        // Some watches rotate their Bluetooth address; look for one with the same name.
        const replacement = await findByName(device.name);
        if (replacement && replacement.id !== device.id) {
          void connectRef.current?.({ id: replacement.id, name: device.name }, { silent });
          return;
        }
        setHr((s) => ({
          ...s,
          status: wanted.current ? 'reconnecting' : 'idle',
          error: silent ? null : `Couldn’t connect to ${device.name}. Make sure heart-rate broadcast is on and the watch is nearby.`,
        }));
        if (wanted.current) scheduleRetry(device);
        if (__DEV__) console.warn('[hr] connect failed', err);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.settings.hrDevice, updateSettings],
  );

  useEffect(() => {
    connectRef.current = connectReal;
  }, [connectReal]);

  const startDemo = useCallback(
    (device: HrDevice) => {
      stopDemo();
      currentId.current = device.id;
      wanted.current = true;
      setHr((s) => ({ ...s, device, status: 'connected', error: null, contact: true }));
      demoTimer.current = setInterval(() => {
        // Heart rate chases its target with a ~20 s time constant, plus a little noise.
        const diff = demoTarget.current - demoBpm.current;
        demoBpm.current += diff * 0.06 + (Math.random() - 0.5) * 1.6;
        setHr((s) => ({ ...s, bpm: Math.round(demoBpm.current), at: Date.now() }));
      }, 1000);
      if (store.settings.hrDevice?.id !== device.id) updateSettings({ hrDevice: device });
    },
    [store.settings.hrDevice, updateSettings],
  );

  const connect = useCallback(
    async (device: HrDevice) => (device.id === DEMO_DEVICE.id ? startDemo(device) : connectReal(device)),
    [connectReal, startDemo],
  );

  // ── Scanning ──────────────────────────────────────────────────────────────
  const scan = useCallback(async ({ all = false }: { all?: boolean } = {}) => {
    const ble = getBle();
    if (!ble) return;
    const ready = await ensureBleReady();
    if (ready !== 'ok') {
      setHr((s) => ({ ...s, status: ready }));
      return;
    }
    filteredScan.current = !all;
    setHr((s) => ({ ...s, status: s.status === 'connected' ? 'connected' : 'scanning', found: [], error: null, scanDone: false }));

    // Devices already linked to this phone (your watch via Garmin Connect) often
    // stop advertising, so a scan alone never finds them. List them up front.
    try {
      const [connected, bonded] = await Promise.all([
        ble.getConnectedPeripherals([]).catch(() => []),
        Platform.OS === 'android' ? ble.getBondedPeripherals().catch(() => []) : Promise.resolve([]),
      ]);
      const paired: FoundDevice[] = [];
      for (const p of [...connected, ...bonded]) {
        const name = p.name ?? p.advertising?.localName;
        if (!name || paired.some((d) => d.id === p.id)) continue;
        paired.push({ id: p.id, name, rssi: p.rssi ?? -60, heartRate: false, paired: true });
      }
      if (paired.length) {
        setHr((s) => {
          const merged = paired.map((d) => ({ ...d, heartRate: s.found.find((f) => f.id === d.id)?.heartRate ?? false }));
          return { ...s, found: sortFound([...s.found.filter((d) => !paired.some((x) => x.id === d.id)), ...merged]) };
        });
      }
    } catch {
      // Listing paired devices is best-effort.
    }

    try {
      await ble.scan({ serviceUUIDs: all ? [] : [HR_SERVICE], seconds: SCAN_SECONDS });
    } catch (err) {
      setHr((s) => ({ ...s, status: 'idle', scanDone: true, error: 'Bluetooth scan failed. Try again in a moment.' }));
      if (__DEV__) console.warn('[hr] scan failed', err);
    }
  }, []);

  const stopScan = useCallback(() => {
    getBle()
      ?.stopScan()
      .catch(() => {});
    setHr((s) => (s.status === 'scanning' ? { ...s, status: 'idle' } : s));
  }, []);

  const disconnect = useCallback(() => {
    wanted.current = false;
    clearRetry();
    stopDemo();
    const id = currentId.current;
    currentId.current = null;
    if (id && id !== DEMO_DEVICE.id) {
      getBle()
        ?.disconnect(id)
        .catch(() => {});
    }
    setHr((s) => ({ ...s, status: bleAvailable() ? 'idle' : 'unavailable', bpm: null, at: null, contact: null }));
  }, []);

  const forget = useCallback(() => {
    disconnect();
    setHr((s) => ({ ...s, device: null }));
    updateSettings({ hrDevice: undefined });
  }, [disconnect, updateSettings]);

  const setDemoTarget = useCallback((bpm: number) => {
    demoTarget.current = bpm;
  }, []);

  // ── Auto-connect to the remembered sensor ─────────────────────────────────
  const autoConnect = useEffectEvent(() => {
    const saved = store.settings.hrDevice;
    if (!saved || wanted.current) return;
    if (saved.id === DEMO_DEVICE.id) {
      startDemo(saved);
      return;
    }
    if (!available) return;
    void connectReal(saved, { silent: true });
  });
  useEffect(() => {
    if (!store.hydrated) return;
    const id = setTimeout(autoConnect, 0); // after first paint, never blocking launch
    return () => clearTimeout(id);
  }, [store.hydrated]);

  // Retry promptly when the app comes back to the foreground.
  const onForeground = useEffectEvent(() => {
    if (wanted.current && hr.device && hr.status !== 'connected' && hr.device.id !== DEMO_DEVICE.id) {
      void connectReal(hr.device, { silent: true });
    }
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') onForeground();
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      clearRetry();
      stopDemo();
    },
    [],
  );

  const api = useMemo<HeartRateApi>(
    () => ({
      ...hr,
      // Show the remembered device even before the first connection attempt finishes.
      device: hr.device ?? store.settings.hrDevice ?? null,
      bleAvailable: available,
      scan,
      stopScan,
      connect,
      disconnect,
      forget,
      setDemoTarget,
    }),
    [hr, store.settings.hrDevice, available, scan, stopScan, connect, disconnect, forget, setDemoTarget],
  );

  return <HeartRateContext.Provider value={api}>{children}</HeartRateContext.Provider>;
}

export function useHeartRate(): HeartRateApi {
  const ctx = useContext(HeartRateContext);
  if (!ctx) throw new Error('useHeartRate must be used inside <HeartRateProvider>');
  return ctx;
}

/** Heart-rate devices first, then paired devices (likely your watch), then by signal strength. */
function sortFound(list: FoundDevice[]): FoundDevice[] {
  const rank = (d: FoundDevice) => (d.heartRate ? 2 : 0) + (d.paired ? 1 : 0);
  return [...list].sort((a, b) => rank(b) - rank(a) || b.rssi - a.rssi);
}

class NotBroadcastingError extends Error {
  constructor(name: string) {
    super(`Connected to ${name}, but it isn’t sharing heart rate. On the watch, turn on Wrist Heart Rate › Broadcast (or start an activity with Broadcast In Activity) — Tempo will pick it up automatically.`);
  }
}

/** A reading older than this is treated as "no signal". */
export const HR_STALE_MS = 6000;
