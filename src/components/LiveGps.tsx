import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { formatDistance, formatPace, type DistanceUnit } from '../domain/track';
import type { GpsState } from '../hooks/useWorkoutGps';
import { colors } from '../theme/tokens';
import { AppText } from './AppText';

interface Props {
  state: GpsState;
  unit: DistanceUnit;
  distanceM: number;
  stagePaceSecPerKm: number | null;
  /** Brisk-pace target, shown during hard walking intervals. */
  targetPaceSecPerKm: number | null;
}

/** One quiet line under the heart rate: distance · pace this stage · target. */
export function LiveGps({ state, unit, distanceM, stagePaceSecPerKm, targetPaceSecPerKm }: Props) {
  if (state === 'off') return null;

  let text: string;
  if (state === 'searching') text = 'Finding GPS…';
  else if (state === 'lost' && distanceM === 0) text = 'Waiting for GPS signal…';
  else {
    const parts = [formatDistance(distanceM, unit), `${formatPace(stagePaceSecPerKm, unit)} this stage`];
    if (targetPaceSecPerKm !== null) parts.push(`target ${formatPace(targetPaceSecPerKm, unit)}`);
    text = parts.join('  ·  ') + (state === 'lost' ? '  ·  signal lost' : '');
  }

  const slow =
    targetPaceSecPerKm !== null && stagePaceSecPerKm !== null && stagePaceSecPerKm > targetPaceSecPerKm * 1.07;

  return (
    <View style={styles.row} accessible accessibilityLabel={`GPS: ${text}`}>
      <Ionicons name="navigate-outline" size={13} color={state === 'ok' ? colors.textSecondary : colors.textTertiary} />
      <AppText variant="caption" color={slow ? colors.amber : colors.textSecondary} style={styles.text} numberOfLines={1}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  text: {
    marginLeft: 6,
    fontVariant: ['tabular-nums'],
  },
});
