import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { getProtocol } from '../domain/protocols';
import { PLAN_PROTOCOLS, type Streak, type WeekProgress } from '../domain/weekPlan';
import { PLAN_LABEL } from '../lib/planText';
import { colors, radius } from '../theme/tokens';
import { AppText } from './AppText';
import { PressableScale } from './PressableScale';
import { ProgressRing } from './ProgressRing';

interface Props {
  progress: WeekProgress;
  streak: Streak;
  /** e.g. "Reminders weekdays at 18:00" */
  footnote: string;
  onPress: () => void;
}

/** This week's sessions against the goals, one ring per protocol, plus the streak. */
export function WeekCard({ progress, streak, footnote, onPress }: Props) {
  const tracked = PLAN_PROTOCOLS.filter((id) => progress.goals[id] > 0);

  if (tracked.length === 0) {
    return (
      <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel="Set weekly goals" style={[styles.card, styles.row]}>
        <Ionicons name="calendar-outline" size={20} color={colors.lavender} />
        <View style={{ flex: 1, marginLeft: 14 }}>
          <AppText variant="callout">Set a weekly goal</AppText>
          <AppText variant="caption">Track sessions per week, keep a streak, get gentle reminders</AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </PressableScale>
    );
  }

  const streakText =
    streak.weeks > 0 ? `${streak.weeks}-week streak` : progress.met ? 'Goals met' : 'No streak yet';
  const label = tracked
    .map((id) => `${getProtocol(id).shortName} ${progress.done[id]} of ${progress.goals[id]}`)
    .join(', ');

  return (
    <PressableScale
      onPress={onPress}
      pressedScale={0.99}
      accessibilityRole="button"
      accessibilityLabel={`This week: ${label}. ${streakText}. Opens the weekly plan.`}
      style={styles.card}
    >
      <View style={styles.head}>
        <AppText variant="eyebrow">This week</AppText>
        <View style={styles.row}>
          {streak.weeks > 0 ? <Ionicons name="flame-outline" size={14} color={colors.amber} style={{ marginRight: 4 }} /> : null}
          <AppText variant="caption" color={streak.weeks > 0 || progress.met ? colors.amber : colors.textTertiary}>
            {streakText}
          </AppText>
        </View>
      </View>

      <View style={styles.rings}>
        {tracked.map((id) => {
          const def = getProtocol(id);
          const done = progress.done[id];
          const goal = progress.goals[id];
          return (
            <View key={id} style={styles.item}>
              <ProgressRing size={56} strokeWidth={3} progress={done / goal} color={def.accent}>
                {done >= goal ? (
                  <Ionicons name="checkmark" size={22} color={def.accent} />
                ) : (
                  <AppText variant="callout" style={styles.count}>
                    {done}/{goal}
                  </AppText>
                )}
              </ProgressRing>
              <View style={{ marginLeft: 12, flexShrink: 1 }}>
                <AppText variant="callout" numberOfLines={1}>
                  {PLAN_LABEL[id]}
                </AppText>
                <AppText variant="caption">
                  {done >= goal ? (done > goal ? `${done} done · goal ${goal}` : 'Done') : `${goal - done} to go`}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.row, styles.foot]}>
        <AppText variant="caption" style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>
          {footnote}
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rings: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  item: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  foot: {
    marginTop: 16,
  },
});
