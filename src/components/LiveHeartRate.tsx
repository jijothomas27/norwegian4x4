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
  /**
   * When heart rate is shown big in the ring, the panel shows the stage
   * clock in its place.
   */
  swappedClock?: string | null;
  /** Tap toggles heart rate into / out of the ring. */
  onToggleFocus?: () => void;
}

/** Big enough to read at arm's length while running. */
const BIG_BPM = 64;

/**
 * Live heart-rate panel on the timer: a large bpm number coloured by zone
 * (accent = on target, amber = too high, blue = too low), the target band,
 * and one line of coaching. Tap to move heart rate into the ring.
 */
export function LiveHeartRate({ phase, accent, bpm, range, maxHr, status, deviceName, connection, swappedClock, onToggleFocus }: Props) {
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

  const live = connection === 'connected' && bpm !== null;
  const tint = live ? statusColor(status, accent) : colors.textTertiary;
  let message: string;
  if (!live) {
    message = connection === 'connecting' ? `Connecting to ${deviceName ?? 'sensor'}…` : `${deviceName ?? 'Sensor'} — searching for signal…`;
  } else if (!range) {
    message = 'Add your age to see target zones';
  } else {
    message = zoneMessage(status ?? 'settling', phase);
  }

  return (
    <PressableScale
      onPress={onToggleFocus}
      disabled={!onToggleFocus}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityHint={swappedClock ? 'Shows the timer in the ring again' : 'Shows heart rate large in the ring'}
      accessibilityLiveRegion="polite"
      accessibilityLabel={
        bpm !== null ? `Heart rate ${bpm}${range ? `, target ${range.low} to ${range.high}` : ''}. ${message}` : message
      }
      style={[styles.panel, live && status && status !== 'settling' ? { borderColor: tint } : null]}
    >
      <View style={styles.row}>
        <View style={styles.reading}>
          {swappedClock ? (
            <View>
              <AppText
                maxFontSizeMultiplier={1.15}
                style={{ fontSize: 48, lineHeight: 54, fontWeight: '300', letterSpacing: -1.5, color: colors.text, fontVariant: ['tabular-nums'] }}
              >
                {swappedClock}
              </AppText>
              <AppText variant="caption" style={{ marginTop: -2 }}>
                left in stage
              </AppText>
            </View>
          ) : (
            <>
              <BeatingHeart bpm={bpm} color={tint} size={26} />
              <View style={{ marginLeft: 10 }}>
                <HeartRateNumber bpm={bpm} size={BIG_BPM} valueColor={live ? tint : colors.textTertiary} color={colors.textSecondary} />
              </View>
            </>
          )}
        </View>
        {range && maxHr ? (
          <View style={styles.gaugeCol}>
            <ZoneGauge bpm={bpm} range={range} maxHr={maxHr} accent={accent} />
            <AppText variant="callout" color={colors.textSecondary} style={styles.target}>
              {range.low}–{range.high}
            </AppText>
            <AppText variant="caption" style={styles.targetLabel}>
              target bpm
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText variant="callout" color={tint} align="center" style={styles.message} numberOfLines={1}>
        {message}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 150,
  },
  gaugeCol: {
    flex: 1,
    marginLeft: 14,
  },
  target: {
    marginTop: 6,
    fontSize: 18,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  targetLabel: {
    fontSize: 11,
    textAlign: 'right',
  },
  message: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
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
