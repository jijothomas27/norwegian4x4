import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, IconButton, PrimaryButton } from '../components/Buttons';
import { ActionSheet } from '../components/Sheet';
import { planRestore, summarizeBackup, type ParsedBackup, type RestoreMode } from '../domain/backup';
import type { HrSeries } from '../domain/hrSeries';
import { defaultDistanceUnit } from '../domain/track';
import { useNow } from '../hooks/useNow';
import { formatShortDate, startOfDay } from '../lib/format';
import { exportBackup, exportSessionsCsv, pickBackupFile, writeRestoreAttachments, type PickedFile } from '../state/backup';
import type { PersistedState } from '../state/model';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme/tokens';

type Busy = 'backup' | 'csv' | 'pick' | 'restore' | null;
type Notice = { tone: 'ok' | 'error'; text: string } | null;

/** Back up, export and restore the journal. */
export default function BackupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { state, updateSettings, restoreJournal } = useStore();
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  const distanceUnit = state.settings.distanceUnit ?? defaultDistanceUnit(Intl.DateTimeFormat().resolvedOptions().locale);
  const journal: PersistedState = { version: 1, sessions: state.sessions, metrics: state.metrics, settings: state.settings };
  const hrGraphs = state.sessions.filter((s) => s.hasHrSeries).length;
  const routes = state.sessions.filter((s) => s.gps?.hasRoute).length;
  const preview = picked?.result.ok ? picked.result.backup : null;
  // On a new phone, restoring is the point of coming here.
  const isEmpty = state.hydrated && state.sessions.length === 0 && state.metrics.length === 0;
  const scrollRef = useRef<ScrollViewInstance>(null);

  async function run(kind: Exclude<Busy, null>, task: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setNotice(null);
    try {
      await task();
    } catch (e) {
      console.warn(`[backup] ${kind} failed`, e);
      setNotice({ tone: 'error', text: 'Something went wrong. Nothing was changed — please try again.' });
    } finally {
      setBusy(null);
    }
  }

  const backUp = () =>
    run('backup', async () => {
      const at = Date.now();
      const outcome = await exportBackup(journal, at);
      if (outcome === 'unavailable') {
        setNotice({ tone: 'error', text: 'Sharing isn’t available on this device.' });
        return;
      }
      updateSettings({ lastBackupAt: at, backupSnoozedAt: undefined });
      setNotice({ tone: 'ok', text: 'Backup created. Keep the file somewhere off this phone, like Google Drive.' });
    });

  const exportCsv = () =>
    run('csv', async () => {
      const outcome = await exportSessionsCsv(state.sessions, distanceUnit);
      if (outcome === 'unavailable') setNotice({ tone: 'error', text: 'Sharing isn’t available on this device.' });
    });

  const pick = () =>
    run('pick', async () => {
      const file = await pickBackupFile();
      if (!file) return;
      setPicked(file);
      if (!file.result.ok) {
        setNotice({ tone: 'error', text: file.result.error });
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else if (!isEmpty) {
        // The preview replaces the restore button at the bottom; bring it into view.
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
      }
    });

  const restore = (mode: RestoreMode) =>
    run('restore', async () => {
      if (!preview || !state.hydrated) return;
      const plan = planRestore(journal, preview.journal, mode, preview.exportedAt);
      await writeRestoreAttachments(plan, preview);
      restoreJournal(plan.journal);
      setPicked(null);
      setNotice({ tone: 'ok', text: restoredText(mode, plan.added, plan.alreadyHere) });
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });

  const exportSections = (
    <>
      <AppText variant="eyebrow" style={styles.section}>
        Back up
      </AppText>
      <PrimaryButton
        label={busy === 'backup' ? 'Preparing…' : 'Back up journal'}
        onPress={backUp}
        disabled={busy !== null || state.sessions.length + state.metrics.length === 0}
      />
      <AppText variant="caption" style={styles.hint}>
        Saves everything — sessions, readings, settings, routes and heart-rate graphs — as one file. Save it to Google Drive or
        email it to yourself, so a new phone can pick up where this one left off.
      </AppText>

      <AppText variant="eyebrow" style={styles.section}>
        Spreadsheet
      </AppText>
      <GhostButton label={busy === 'csv' ? 'Preparing…' : 'Export sessions as CSV'} icon="grid-outline" onPress={exportCsv} />
      <AppText variant="caption" style={styles.hint}>
        One row per session (date, duration, heart rate, time in zone, VO₂ estimate, distance and pace in {distanceUnit === 'mi' ? 'miles' : 'km'}).
        Opens in Google Sheets or Excel. Can’t be restored from — use a backup for that.
      </AppText>
    </>
  );

  const restoreSection = (
    <>
      <AppText variant="eyebrow" style={styles.section}>
        Restore
      </AppText>
      {preview && picked ? (
        <View style={styles.card}>
          <AppText variant="caption" numberOfLines={1}>
            {picked.name}
          </AppText>
          <PreviewText backup={preview} />
          {preview.skipped > 0 ? (
            <AppText variant="caption" color={colors.amber} style={{ marginTop: 8 }}>
              {plural(preview.skipped, 'entry', 'entries')} couldn’t be read and will be left out.
            </AppText>
          ) : null}
          <PrimaryButton
            label={busy === 'restore' ? 'Restoring…' : 'Merge into journal'}
            onPress={() => restore('merge')}
            disabled={busy !== null}
            style={{ marginTop: space.md }}
          />
          <AppText variant="caption" style={styles.hint}>
            Adds what this phone doesn’t have yet. Nothing already here is changed or removed.
          </AppText>
          <View style={styles.row}>
            <GhostButton label="Replace instead" icon="swap-horizontal" color={colors.crimson} onPress={() => setConfirmReplace(true)} />
            <GhostButton label="Cancel" onPress={() => setPicked(null)} />
          </View>
        </View>
      ) : (
        <>
          <GhostButton label={busy === 'pick' ? 'Opening…' : 'Restore from a backup'} icon="folder-open-outline" onPress={pick} />
          <AppText variant="caption" style={styles.hint}>
            Choose a tempo-backup file from Drive, email or Downloads. You’ll see what’s in it before anything changes.
          </AppText>
        </>
      )}
    </>
  );

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <AppText variant="eyebrow">Data</AppText>
            <AppText variant="title" style={{ marginTop: 8 }}>
              Data & backup
            </AppText>
          </View>
          <IconButton icon="close" label="Close" onPress={() => router.back()} />
        </View>

        <View style={[styles.card, { marginTop: space.lg }]}>
          <AppText variant="caption">On this phone</AppText>
          <AppText variant="heading" style={{ marginTop: 6 }}>
            {plural(state.sessions.length, 'session')} · {plural(state.metrics.length, 'reading')}
          </AppText>
          <AppText variant="body" style={{ marginTop: 2 }}>
            {plural(hrGraphs, 'heart-rate graph')} · {plural(routes, 'route')}
          </AppText>
          <View style={styles.lastRow}>
            <Ionicons
              name={state.settings.lastBackupAt ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={16}
              color={state.settings.lastBackupAt ? colors.sage : colors.amber}
            />
            <AppText variant="caption" color={colors.textSecondary} style={{ marginLeft: 6 }}>
              {state.settings.lastBackupAt ? `Last backup: ${relativeDay(state.settings.lastBackupAt, now)}` : 'Not backed up yet'}
            </AppText>
          </View>
        </View>

        {notice ? (
          <View style={[styles.notice, notice.tone === 'error' ? styles.noticeError : styles.noticeOk]} accessibilityLiveRegion="polite">
            <Ionicons
              name={notice.tone === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              size={18}
              color={notice.tone === 'error' ? colors.crimson : colors.sage}
            />
            <AppText variant="callout" style={{ flex: 1, marginLeft: 10 }}>
              {notice.text}
            </AppText>
          </View>
        ) : null}

        {isEmpty ? (
          <>
            {restoreSection}
            {exportSections}
          </>
        ) : (
          <>
            {exportSections}
            {restoreSection}
          </>
        )}
      </ScrollView>

      <ActionSheet
        visible={confirmReplace}
        title="Replace your journal?"
        message={`Everything on this phone (${plural(state.sessions.length, 'session')} and ${plural(state.metrics.length, 'reading')}) will be replaced by the backup. This can’t be undone.`}
        onDismiss={() => setConfirmReplace(false)}
        actions={[
          {
            label: 'Replace',
            tone: 'destructive',
            onPress: () => {
              setConfirmReplace(false);
              restore('replace');
            },
          },
          { label: 'Cancel', onPress: () => setConfirmReplace(false) },
        ]}
      />
    </View>
  );
}

function PreviewText({ backup }: { backup: ParsedBackup<HrSeries> }) {
  const s = summarizeBackup(backup);
  const range =
    s.oldest !== null && s.newest !== null
      ? startOfDay(s.oldest) === startOfDay(s.newest)
        ? `, ${dateWithYear(s.newest)}`
        : `, ${dateWithYear(s.oldest)} – ${dateWithYear(s.newest)}`
      : '';
  return (
    <>
      <AppText variant="heading" style={{ marginTop: 6 }}>
        {backup.exportedAt ? `Backup from ${dateWithYear(backup.exportedAt)}` : 'Tempo backup'}
      </AppText>
      <AppText variant="body" style={{ marginTop: 4 }}>
        {plural(s.sessions, 'session')}
        {range}
      </AppText>
      <AppText variant="body">
        {plural(s.metrics, 'reading')} · {plural(s.hrGraphs, 'heart-rate graph')} · {plural(s.routes, 'route')}
      </AppText>
    </>
  );
}

function restoredText(mode: RestoreMode, added: { sessions: number; metrics: number }, already: { sessions: number; metrics: number }): string {
  if (mode === 'replace') return `Journal replaced: ${plural(added.sessions, 'session')} and ${plural(added.metrics, 'reading')}.`;
  if (added.sessions + added.metrics === 0) return 'Everything in that backup is already on this phone.';
  const extra = already.sessions + already.metrics > 0 ? ` ${plural(already.sessions + already.metrics, 'entry', 'entries')} were already here.` : '';
  return `Restored: ${plural(added.sessions, 'session')} and ${plural(added.metrics, 'reading')} added.${extra}`;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function dateWithYear(ts: number): string {
  return `${formatShortDate(ts)} ${new Date(ts).getFullYear()}`;
}

function relativeDay(ts: number, now: number): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return dateWithYear(ts);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    padding: 16,
  },
  lastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: space.md,
    padding: 14,
    borderRadius: radius.md,
  },
  noticeOk: {
    backgroundColor: 'rgba(125,219,168,0.10)',
  },
  noticeError: {
    backgroundColor: 'rgba(255,90,110,0.10)',
  },
  section: {
    marginTop: space.xl,
    marginBottom: 12,
  },
  hint: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: space.md,
    flexWrap: 'wrap',
  },
});
