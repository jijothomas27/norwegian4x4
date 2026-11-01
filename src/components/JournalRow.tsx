import { StyleSheet, View } from 'react-native';

import { getProtocol } from '../domain/protocols';
import { formatMinutes } from '../domain/timeline';
import { formatNumber, formatTime, kgToUnit } from '../lib/format';
import type { JournalEntry, WeightUnit } from '../state/model';
import { colors } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';

interface Props {
  entry: JournalEntry;
  weightUnit: WeightUnit;
  /** Name of the workout a metric log was attached to, if any. */
  linkedSessionName?: string;
  onLongPress: () => void;
}

/** A single line in the journal feed — a workout or a metrics log. */
export function JournalRow({ entry, weightUnit, linkedSessionName, onLongPress }: Props) {
  if (entry.type === 'session') {
    const protocol = getProtocol(entry.protocolId);
    const rounds = `${entry.roundsCompleted}/${entry.totalRounds} rounds`;
    return (
      <PressableScale
        onLongPress={onLongPress}
        delayLongPress={350}
        pressedScale={0.99}
        accessibilityLabel={`${protocol.name}, ${formatMinutes(entry.durationSec)}, ${rounds}${entry.completed ? '' : ', ended early'}, at ${formatTime(entry.startedAt)}`}
        accessibilityHint="Long press to delete"
        style={styles.row}
      >
        <View style={[styles.marker, { backgroundColor: protocol.accent }]} />
        <View style={styles.body}>
          <AppText variant="callout">{protocol.name}</AppText>
          <AppText variant="caption" style={styles.meta}>
            {formatMinutes(entry.durationSec)}
            {'  ·  '}
            {rounds}
            {entry.completed ? '' : '  ·  ended early'}
            {entry.hr ? `  ·  avg ${entry.hr.avg} bpm` : ''}
          </AppText>
        </View>
        <AppText variant="caption" style={styles.time}>
          {formatTime(entry.startedAt)}
        </AppText>
      </PressableScale>
    );
  }

  const parts: string[] = [];
  if (entry.vo2max !== undefined) parts.push(`VO₂ ${formatNumber(entry.vo2max)}`);
  if (entry.weightKg !== undefined) parts.push(`${formatNumber(kgToUnit(entry.weightKg, weightUnit))} ${weightUnit}`);
  if (entry.heartRate !== undefined) parts.push(`${Math.round(entry.heartRate)} bpm`);

  return (
    <PressableScale
      onLongPress={onLongPress}
      delayLongPress={350}
      pressedScale={0.99}
      accessibilityLabel={`Metrics: ${parts.join(', ')}${entry.notes ? `. Note: ${entry.notes}` : ''}`}
      accessibilityHint="Long press to delete"
      style={styles.row}
    >
      <View style={[styles.marker, styles.metricMarker]} />
      <View style={styles.body}>
        <AppText variant="callout" color={colors.textSecondary}>
          {parts.length > 0 ? parts.join('   ') : 'Note'}
        </AppText>
        {linkedSessionName ? (
          <AppText variant="caption" style={styles.meta}>
            After {linkedSessionName}
          </AppText>
        ) : null}
        {entry.notes ? (
          <AppText variant="caption" color={colors.textTertiary} style={styles.note} numberOfLines={3}>
            “{entry.notes}”
          </AppText>
        ) : null}
      </View>
      <AppText variant="caption" style={styles.time}>
        {formatTime(entry.at)}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  marker: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 16,
  },
  metricMarker: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.lavender,
  },
  body: {
    flex: 1,
  },
  meta: {
    marginTop: 3,
  },
  note: {
    marginTop: 6,
    fontStyle: 'italic',
  },
  time: {
    marginLeft: 12,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
});
