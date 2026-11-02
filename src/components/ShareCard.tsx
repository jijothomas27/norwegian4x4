import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { getProtocol } from '../domain/protocols';
import { pickShareStats, type ShareStat } from '../domain/shareStats';
import { formatMinutes } from '../domain/timeline';
import { formatDistance, formatPace, type DistanceUnit } from '../domain/track';
import type { Phase } from '../domain/types';
import { formatLongDate, formatNumber } from '../lib/format';
import type { SessionEntry } from '../state/model';
import { colors } from '../theme/tokens';
import { AppText } from './AppText';
import { RouteSketch } from './RouteSketch';

interface Props {
  session: SessionEntry;
  phases: readonly Phase[];
  unit: DistanceUnit;
  width: number;
  showRoute: boolean;
  ref?: Ref<ComponentRef<typeof View>>;
}

/** Height ÷ width: 2:3 (a phone-friendly portrait) with the route, square without. */
export const shareCardAspect = (withRoute: boolean) => (withRoute ? 1.5 : 1);

/** Display parts for one stat tile. */
export function formatShareStat(stat: ShareStat, unit: DistanceUnit, walking: boolean): { value: string; unit?: string; label: string } {
  switch (stat.kind) {
    case 'inZone':
      return { value: `${stat.value}`, unit: '%', label: 'hard time in zone' };
    case 'peakHr':
      return { value: `${stat.value}`, unit: 'bpm', label: 'peak heart rate' };
    case 'avgHr':
      return { value: `${stat.value}`, unit: 'bpm', label: 'average heart rate' };
    case 'vo2':
      return { value: formatNumber(stat.value), label: 'est. VO₂ max' };
    case 'distance': {
      const [v, u] = formatDistance(stat.value, unit).split(' ');
      return { value: v, unit: u, label: 'distance' };
    }
    case 'workPace': {
      const [v, u] = formatPace(stat.value, unit).split(' ');
      return { value: v, unit: u, label: walking ? 'brisk pace' : 'hard pace' };
    }
    case 'recovery':
      return { value: `−${stat.value}`, unit: 'bpm', label: '1-min HR recovery' };
  }
}

/**
 * A purpose-made 4:5 image of a workout, for sharing. It's a separate
 * layout from the summary screen (rather than a screenshot of it) so it reads
 * well as a small image in a chat or a story: one headline, four numbers,
 * the route, and the protocol's colours.
 */
export function ShareCard({ session, phases, unit, width, showRoute, ref }: Props) {
  const def = getProtocol(session.protocolId);
  const walking = def.id === 'japanese-iwt';
  const stats = pickShareStats(session);
  const newMax = session.maxHr?.previous !== undefined;
  const s = width / 360; // scale everything off a 360-wide design
  const routeShown = showRoute && session.gps?.hasRoute === true;
  const height = Math.round(width * shareCardAspect(routeShown));
  // The route fills whatever height is left between the header and the stats.
  const [routeHeight, setRouteHeight] = useState(0);

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height, borderRadius: 28 * s, padding: 26 * s }]}>
      <LinearGradient colors={def.cardGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={width} style={StyleSheet.absoluteFill} pointerEvents="none">
        {[60, 110, 160].map((r, i) => (
          <Circle
            key={r}
            cx={width - 40 * s}
            cy={50 * s}
            r={r * s}
            stroke={def.accent}
            strokeOpacity={0.18 - i * 0.05}
            strokeWidth={1}
            fill="none"
          />
        ))}
        <Circle cx={width - 40 * s} cy={50 * s} r={6 * s} fill={def.accent} />
      </Svg>

      {/* Header */}
      <AppText variant="eyebrow" color={def.accent} style={{ fontSize: 11 * s }} allowFontScaling={false}>
        {formatLongDate(session.startedAt)}
      </AppText>
      <AppText
        allowFontScaling={false}
        style={{ color: colors.text, fontSize: 34 * s, lineHeight: 40 * s, fontWeight: '300', letterSpacing: -0.8, marginTop: 10 * s }}
        numberOfLines={2}
      >
        {def.name}
      </AppText>
      <View style={[styles.row, { marginTop: 8 * s }]}>
        <Ionicons name={session.completed ? 'checkmark-circle' : 'ellipse-outline'} size={16 * s} color={def.accent} />
        <AppText allowFontScaling={false} style={{ color: colors.textSecondary, fontSize: 15 * s, marginLeft: 6 * s }}>
          {session.roundsCompleted} of {session.totalRounds} rounds · {formatMinutes(session.durationSec)}
        </AppText>
      </View>
      {newMax ? (
        <View style={[styles.badge, { marginTop: 12 * s, paddingHorizontal: 10 * s, paddingVertical: 5 * s, borderColor: def.accent }]}>
          <Ionicons name="trending-up" size={13 * s} color={def.accent} />
          <AppText allowFontScaling={false} style={{ color: colors.text, fontSize: 12 * s, fontWeight: '600', marginLeft: 6 * s }}>
            New max heart rate · {session.maxHr?.bpm} bpm
          </AppText>
        </View>
      ) : null}

      {/* Route */}
      <View
        style={{ flex: 1, justifyContent: 'center', marginVertical: 10 * s, overflow: 'hidden' }}
        onLayout={(e) => setRouteHeight(Math.floor(e.nativeEvent.layout.height))}
      >
        {routeShown && routeHeight > 40 ? <RouteSketch sessionId={session.id} phases={phases} height={routeHeight} /> : null}
      </View>

      {/* Stats */}
      {stats.length > 0 ? (
        <View style={styles.grid}>
          {stats.map((stat) => {
            const f = formatShareStat(stat, unit, walking);
            return (
              <View key={stat.kind} style={[styles.cell, { marginBottom: 12 * s }]}>
                <View style={[styles.row, { alignItems: 'baseline' }]}>
                  <AppText
                    allowFontScaling={false}
                    style={{ color: colors.text, fontSize: 32 * s, lineHeight: 38 * s, fontWeight: '200', letterSpacing: -1, fontVariant: ['tabular-nums'] }}
                  >
                    {f.value}
                  </AppText>
                  {f.unit ? (
                    <AppText allowFontScaling={false} style={{ color: colors.textSecondary, fontSize: 13 * s, marginLeft: 4 * s }}>
                      {f.unit}
                    </AppText>
                  ) : null}
                </View>
                <AppText allowFontScaling={false} style={{ color: colors.textTertiary, fontSize: 12 * s }}>
                  {f.label}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 * s }]}>
        <AppText allowFontScaling={false} style={{ color: colors.textTertiary, fontSize: 11 * s, flex: 1 }} numberOfLines={1}>
          {session.totalRounds} × {def.workSec / 60} min · {def.work.guidance.split(' · ')[0]}
        </AppText>
        <View style={styles.row}>
          <View style={{ width: 6 * s, height: 6 * s, borderRadius: 3 * s, backgroundColor: def.accent, marginRight: 6 * s }} />
          <AppText allowFontScaling={false} style={{ color: colors.text, fontSize: 13 * s, fontWeight: '600', letterSpacing: 2 }}>
            TEMPO
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '50%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
