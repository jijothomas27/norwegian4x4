import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Phase } from '../domain/types';
import { tones } from '../theme/tokens';

interface Props {
  phases: readonly Phase[];
  /** Index of the active phase; phases before it render filled. Omit for a static preview. */
  activeIndex?: number;
  /** 0…1 progress through the active phase. */
  activeProgress?: number;
  height?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  /** Dim inactive segments (preview mode shows full colour). */
  dimUpcoming?: boolean;
}

/**
 * A thin, proportional ribbon of the whole session — one segment per phase,
 * coloured by intensity. Doubles as a progress indicator on the timer.
 */
export function PhaseStrip({
  phases,
  activeIndex,
  activeProgress = 0,
  height = 4,
  gap = 3,
  style,
  dimUpcoming = activeIndex !== undefined,
}: Props) {
  return (
    <View style={[styles.row, { height, gap }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {phases.map((p, i) => {
        const accent = tones[p.tone].accent;
        const isPast = activeIndex !== undefined && i < activeIndex;
        const isActive = activeIndex === i;
        const fill = isPast ? 1 : isActive ? activeProgress : dimUpcoming ? 0 : 1;
        return (
          <View
            key={p.key}
            style={[
              styles.segment,
              {
                flexGrow: p.durationSec,
                borderRadius: height / 2,
                backgroundColor: dimUpcoming ? 'rgba(255,255,255,0.08)' : 'transparent',
              },
            ]}
          >
            <View
              style={{
                width: `${Math.max(0, Math.min(1, fill)) * 100}%`,
                height: '100%',
                borderRadius: height / 2,
                backgroundColor: accent,
                opacity: dimUpcoming ? 1 : 0.85,
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  segment: {
    flexBasis: 0,
    overflow: 'hidden',
  },
});
