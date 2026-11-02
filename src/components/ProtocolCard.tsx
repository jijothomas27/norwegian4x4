import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { buildPhases } from '../domain/protocols';
import { formatMinutes, totalDurationMs } from '../domain/timeline';
import type { ProtocolDef } from '../domain/types';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PhaseStrip } from './PhaseStrip';
import { PressableScale } from './PressableScale';

interface Props {
  protocol: ProtocolDef;
  onPress: () => void;
  /** Today's suggestion from the weekly plan. */
  suggested?: boolean;
}

/** Large tactile card on the home screen — one per workout protocol. */
export function ProtocolCard({ protocol, onPress, suggested }: Props) {
  const phases = useMemo(() => buildPhases(protocol, protocol.defaults), [protocol]);
  const minutes = formatMinutes(totalDurationMs(phases) / 1000);
  const structure =
    protocol.id === 'norwegian-4x4'
      ? `${protocol.defaults.rounds} × ${protocol.workSec / 60} min hard`
      : `${protocol.defaults.rounds} × ${protocol.workSec / 60}+${protocol.restSec / 60} min`;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${suggested ? 'Suggested today. ' : ''}${protocol.name}. ${protocol.tagline} ${minutes}.`}
      accessibilityHint="Opens the session overview"
      style={styles.card}
    >
      <LinearGradient
        colors={protocol.cardGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Concentric rings — a quiet nod to a pulse / ripple */}
      <Svg width={260} height={260} style={styles.rings} pointerEvents="none">
        {[40, 75, 110].map((r, i) => (
          <Circle key={r} cx={200} cy={60} r={r} stroke={protocol.accent} strokeOpacity={0.16 - i * 0.04} strokeWidth={1} fill="none" />
        ))}
        <Circle cx={200} cy={60} r={5} fill={protocol.accent} opacity={0.9} />
      </Svg>

      <View style={styles.top}>
        <View style={styles.eyebrowRow}>
          <AppText variant="eyebrow" color={protocol.accent}>
            {protocol.eyebrow}
          </AppText>
          {suggested ? (
            <View style={[styles.badge, { borderColor: protocol.accent }]}>
              <AppText variant="eyebrow" color={colors.text} style={styles.badgeText}>
                Today
              </AppText>
            </View>
          ) : null}
        </View>
        <AppText variant="title" style={styles.name}>
          {protocol.name}
        </AppText>
        <AppText variant="body" style={styles.tagline} numberOfLines={2}>
          {protocol.tagline}
        </AppText>
      </View>

      <View style={styles.bottom}>
        <PhaseStrip phases={phases} height={3} gap={2} style={{ marginBottom: 16, opacity: 0.9 }} />
        <View style={styles.footer}>
          <View style={styles.meta}>
            <AppText variant="callout">{minutes}</AppText>
            <View style={styles.dot} />
            <AppText variant="callout" color={colors.textSecondary}>
              {structure}
            </AppText>
          </View>
          <View style={styles.arrow}>
            <Ionicons name="arrow-forward" size={18} color={colors.text} />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    padding: 24,
    minHeight: 248,
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
  },
  rings: {
    position: 'absolute',
    right: -40,
    top: -10,
  },
  top: {
    paddingRight: 48,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
  },
  name: {
    marginTop: 10,
  },
  tagline: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
  },
  bottom: {
    marginTop: 28,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textTertiary,
    marginHorizontal: 10,
  },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
