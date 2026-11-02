import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File as FsFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import {
  backupFileName,
  buildBackup,
  parseBackup,
  sessionsToCsv,
  type ParsedBackup,
  type ParseResult,
  type RestorePlan,
} from '../domain/backup';
import { decodeSeries, encodeSeries, type HrSeries } from '../domain/hrSeries';
import { getProtocol } from '../domain/protocols';
import type { DistanceUnit, RoutePoint } from '../domain/track';
import { hrSeriesKey } from './hrSeries';
import { parsePersisted, type PersistedState, type SessionEntry } from './model';
import { routeKey } from './routes';

/**
 * File and storage side of backup / restore. The rules (what goes in a
 * backup, how a restore merges) live in domain/backup.ts.
 */

export type ExportOutcome = 'shared' | 'unavailable';

/** Larger than any real journal; protects against picking a video by mistake. */
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

/** Reads every route and heart-rate series the journal refers to. */
async function collectAttachments(journal: PersistedState): Promise<{ routes: Record<string, RoutePoint[]>; hr: Record<string, unknown> }> {
  const wanted = new Map<string, { kind: 'route' | 'hr'; id: string }>();
  for (const s of journal.sessions) {
    if (s.gps?.hasRoute) wanted.set(routeKey(s.id), { kind: 'route', id: s.id });
    if (s.hasHrSeries) wanted.set(hrSeriesKey(s.id), { kind: 'hr', id: s.id });
  }
  const routes: Record<string, RoutePoint[]> = {};
  const hr: Record<string, unknown> = {};
  if (wanted.size === 0) return { routes, hr };

  const pairs = await AsyncStorage.multiGet([...wanted.keys()]);
  for (const [key, raw] of pairs) {
    const target = wanted.get(key);
    if (!target || !raw) continue;
    try {
      const value: unknown = JSON.parse(raw);
      if (target.kind === 'route' && Array.isArray(value)) routes[target.id] = value as RoutePoint[];
      if (target.kind === 'hr') hr[target.id] = value;
    } catch {
      // A damaged entry is left out rather than spoiling the whole backup.
    }
  }
  return { routes, hr };
}

async function shareFile(name: string, contents: string, mimeType: string, uti: string, dialogTitle: string): Promise<ExportOutcome> {
  if (Platform.OS === 'web') {
    downloadOnWeb(name, contents, mimeType);
    return 'shared';
  }
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  const file = new FsFile(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(contents);
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle });
  return 'shared';
}

function downloadOnWeb(name: string, contents: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Writes the whole journal (plus routes and heart-rate graphs) to one file and opens the share sheet. */
export async function exportBackup(journal: PersistedState, now = Date.now()): Promise<ExportOutcome> {
  const { routes, hr } = await collectAttachments(journal);
  const file = buildBackup({ journal, routes, hr, exportedAt: now, appVersion: Constants.expoConfig?.version });
  return shareFile(backupFileName(now, 'json'), JSON.stringify(file), 'application/json', 'public.json', 'Save your Tempo backup');
}

export async function exportSessionsCsv(sessions: readonly SessionEntry[], distanceUnit: DistanceUnit, now = Date.now()): Promise<ExportOutcome> {
  const csv = sessionsToCsv(sessions, { distanceUnit, protocolName: (id) => getProtocol(id).name });
  return shareFile(backupFileName(now, 'csv'), csv, 'text/csv', 'public.comma-separated-values-text', 'Export sessions');
}

export interface PickedFile {
  name: string;
  result: ParseResult<HrSeries>;
}

/** Opens the system file picker and reads the chosen backup. Null when cancelled. */
export async function pickBackupFile(): Promise<PickedFile | null> {
  // Any type: Drive and email apps often label .json files as plain text or binary.
  const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (picked.canceled || !picked.assets?.length) return null;
  const asset = picked.assets[0];
  if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) {
    return { name: asset.name, result: { ok: false, error: 'That file is too large to be a Tempo backup.' } };
  }

  let text: string;
  try {
    if (Platform.OS === 'web') {
      text = asset.file ? await asset.file.text() : await (await fetch(asset.uri)).text();
    } else {
      const file = new FsFile(asset.uri);
      text = await file.text();
      try {
        file.delete(); // our cached copy; the original is untouched
      } catch {
        // Not important.
      }
    }
  } catch (e) {
    console.warn('[backup] could not read picked file', e);
    return { name: asset.name, result: { ok: false, error: 'Couldn’t open that file. Try saving it to the phone first.' } };
  }
  return { name: asset.name, result: readBackup(text) };
}

export function readBackup(text: string): ParseResult<HrSeries> {
  return parseBackup(text, {
    journal: parsePersisted,
    hr: (raw) => decodeSeries(JSON.stringify(raw)),
  });
}

/**
 * Writes the routes and heart-rate graphs a restore brings in, and removes
 * those of sessions the restore drops. Call before swapping the journal in,
 * so nothing ever points at data that isn't there yet.
 */
export async function writeRestoreAttachments(plan: RestorePlan, backup: ParsedBackup<HrSeries>): Promise<void> {
  const sets: [string, string][] = [];
  const removes: string[] = [];
  for (const id of plan.writeIds) {
    const route = backup.routes[id];
    const series = backup.hr[id];
    if (route) sets.push([routeKey(id), JSON.stringify(route)]);
    else removes.push(routeKey(id));
    if (series) sets.push([hrSeriesKey(id), encodeSeries(series)]);
    else removes.push(hrSeriesKey(id));
  }
  for (const id of plan.removeIds) removes.push(routeKey(id), hrSeriesKey(id));
  if (sets.length) await AsyncStorage.multiSet(sets);
  if (removes.length) await AsyncStorage.multiRemove(removes);
}
