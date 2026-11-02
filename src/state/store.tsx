import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import {
  EMPTY_STATE,
  makeId,
  parsePersisted,
  type MetricEntry,
  type PersistedState,
  type SessionEntry,
  type Settings,
} from './model';
import { deleteHrSeries } from './hrSeries';
import { deleteRoute } from './routes';

const STORAGE_KEY = '@tempo/journal/v1';
const SAVE_DEBOUNCE_MS = 250;

interface StoreState extends PersistedState {
  hydrated: boolean;
}

type Action =
  | { type: 'hydrate'; state: PersistedState }
  | { type: 'addSession'; entry: SessionEntry }
  | { type: 'deleteSession'; id: string }
  | { type: 'updateSession'; id: string; patch: Partial<Omit<SessionEntry, 'id' | 'type'>> }
  | { type: 'addMetric'; entry: MetricEntry }
  | { type: 'deleteMetric'; id: string }
  | { type: 'updateSettings'; patch: Partial<Settings> };

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'hydrate':
      return { ...action.state, hydrated: true };
    case 'addSession':
      return { ...state, sessions: [action.entry, ...state.sessions] };
    case 'deleteSession':
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) };
    case 'updateSession':
      return { ...state, sessions: state.sessions.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    case 'addMetric':
      return { ...state, metrics: [action.entry, ...state.metrics] };
    case 'deleteMetric':
      return { ...state, metrics: state.metrics.filter((m) => m.id !== action.id) };
    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
  }
}

interface StoreApi {
  state: StoreState;
  addSession: (entry: Omit<SessionEntry, 'id' | 'type'>) => SessionEntry;
  deleteSession: (id: string) => void;
  updateSession: (id: string, patch: Partial<Omit<SessionEntry, 'id' | 'type'>>) => void;
  addMetric: (entry: Omit<MetricEntry, 'id' | 'type' | 'at'> & { at?: number }) => MetricEntry;
  deleteMetric: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { ...EMPTY_STATE, hydrated: false });

  // Load once on launch.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) dispatch({ type: 'hydrate', state: parsePersisted(raw) });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'hydrate', state: EMPTY_STATE });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist (debounced) after every change, but never before hydration —
  // otherwise the empty initial state would overwrite saved data.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.hydrated) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const snapshot: PersistedState = {
      version: 1,
      sessions: state.sessions,
      metrics: state.metrics,
      settings: state.settings,
    };
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)).catch((err) => {
        console.warn('[store] failed to persist journal', err);
      });
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state.hydrated, state.sessions, state.metrics, state.settings]);

  const addSession = useCallback<StoreApi['addSession']>((input) => {
    const entry: SessionEntry = { ...input, id: makeId(), type: 'session' };
    dispatch({ type: 'addSession', entry });
    return entry;
  }, []);

  const addMetric = useCallback<StoreApi['addMetric']>((input) => {
    const entry: MetricEntry = { ...input, at: input.at ?? Date.now(), id: makeId(), type: 'metric' };
    dispatch({ type: 'addMetric', entry });
    return entry;
  }, []);

  const deleteSession = useCallback((id: string) => {
    dispatch({ type: 'deleteSession', id });
    deleteRoute(id);
    deleteHrSeries(id);
  }, []);
  const updateSession = useCallback<StoreApi['updateSession']>((id, patch) => dispatch({ type: 'updateSession', id, patch }), []);
  const deleteMetric = useCallback((id: string) => dispatch({ type: 'deleteMetric', id }), []);
  const updateSettings = useCallback((patch: Partial<Settings>) => dispatch({ type: 'updateSettings', patch }), []);

  const api = useMemo<StoreApi>(
    () => ({ state, addSession, deleteSession, updateSession, addMetric, deleteMetric, updateSettings }),
    [state, addSession, deleteSession, updateSession, addMetric, deleteMetric, updateSettings],
  );

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
