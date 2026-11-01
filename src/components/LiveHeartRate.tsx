import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { Phase } from '../domain/types';
import { zoneMessage, type BpmRange, type ZoneStatus } from '../domain/zones';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { BeatingHeart, HeartRateNumber, statusColor, ZoneGauge } from './HeartRate';
import { PressableScale } from './PressableScale';

interface Props {
  phase: Phase;
  accent: string;
  /** Fresh reading, or null when there's no (recent) signal. */
  bpm: number | null;
  range: BpmRange | null;
  maxHr: number | null;
  status: ZoneStatus | null;
  deviceName: string | null;
  connection: 'connected' | 'connecting' | 'lost' | 'none';
}

/**
 * Live heart-rate panel on the timer: beating heart + bpm, the target band
 * for the current stage, and one line of coaching.
 */
export function LiveHeartRate({ phase, accent, bpm, range, maxHr, status, deviceName, connection }: Props) {
  const router = useRouter();

  if (connection === 'none') {
    return (
      <PressableScale
        onPress={() => router.push('/heart-rate')}
        accessibilityRole="button"
        accessibilityLabel="Connect a heart-rate sensor"
        style={styles.connectPill}
      >
        <Ionicons name="heart-outline" size={16} color={colors.textSecondary} />
        <AppText variant="caption" color={colors.textSecondary} style={{ marginLeft: 8 }}>
          Connect heart rate
        </AppText>
      </PressableScale>
    );
  }

  const tint = statusColor(status, accent);
  let message: string;
  if (connection !== 'connected' || bpm === null) {
    message = connection === 'connecting' ? `Connecting to ${deviceName ?? 'sensor'}…` : `${deviceName ?? 'Sensor'} — searching for signal…`;
  } else if (!range) {
    message = 'Add your age to see target zones';
  } else {
    message = zoneMessage(status ?? 'settling', phase);
  }

  return (
    <View
      style={styles.panel}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        bpm !== null
          ? `Heart rate ${bpm}${range ? `, target ${range.low} to ${range.high}` : ''}. ${message}`
          : message
      }
    >
      <View style={styles.row}>
        <View style={styles.reading}>
          <BeatingHeart bpm={bpm} color={bpm !== null ? tint : colors.textTertiary} size={20} />
          <View style={{ marginLeft: 10 }}>
            <HeartRateNumber bpm={bpm} color={colors.textTertiary} />
          </View>
        </View>
        {range && maxHr ? (
          <View style={styles.gaugeCol}>
            <ZoneGauge bpm={bpm} range={range} maxHr={maxHr} accent={accent} />
            <AppText variant="caption" style={styles.target}>
              Target {range.low}–{range.high}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="caption" color={bpm !== null ? tint : colors.textTertiary} align="center" style={styles.message}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.lg,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 112,
  },
  gaugeCol: {
    flex: 1,
    marginLeft: 12,
  },
  target: {
    marginTop: 4,
    fontSize: 12,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  message: {
    marginTop: 8,
    fontWeight: '500',
  },
  connectPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
