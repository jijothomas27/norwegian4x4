import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { GhostButton, IconButton, PrimaryButton } from '../components/Buttons';
import { formatShareStat, ShareCard, shareCardAspect } from '../components/ShareCard';
import { buildPhases, getProtocol, normalizeConfig } from '../domain/protocols';
import { pickShareStats } from '../domain/shareStats';
import { formatMinutes } from '../domain/timeline';
import { defaultDistanceUnit, type DistanceUnit } from '../domain/track';
import type { SessionEntry } from '../state/model';
import { useHrSeries } from '../state/hrSeries';
import { useStore } from '../state/store';
import { colors } from '../theme/tokens';

/** Plain-text version, for apps that don't take images (or as a fallback). */
function shareCaption(session: SessionEntry, unit: DistanceUnit): string {
  const def = getProtocol(session.protocolId);
  const walking = def.id === 'japanese-iwt';
  const parts = pickShareStats(session).map((stat) => {
    const f = formatShareStat(stat, unit, walking);
    return `${f.label} ${f.value}${f.unit === '%' ? '%' : f.unit ? ` ${f.unit}` : ''}`;
  });
  const head = `${def.name} ${session.completed ? 'done' : 'in the bag'}: ${session.roundsCompleted}/${session.totalRounds} rounds in ${formatMinutes(session.durationSec)}`;
  const max = session.maxHr?.previous !== undefined ? ` New max heart rate: ${session.maxHr.bpm} bpm!` : '';
  return `${head}${parts.length ? ` · ${parts.join(' · ')}` : ''}.${max}\n— tracked with Tempo`;
}

/**
 * Share preview: the card exactly as it will be sent, an option to leave the
 * route off, then the system share sheet with the image.
 */
export default function ShareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state } = useStore();
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [showRoute, setShowRoute] = useState(true);
  const [showHr, setShowHr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = state.sessions.find((s) => s.id === id);
  const hrSeries = useHrSeries(id, session?.hasHrSeries === true);
  if (!session) return state.hydrated ? <Redirect href="/" /> : <View style={styles.root} />;

  const def = getProtocol(session.protocolId);
  const phases = buildPhases(def, normalizeConfig(def, { rounds: session.totalRounds }));
  const unit: DistanceUnit = state.settings.distanceUnit ?? defaultDistanceUnit(Intl.DateTimeFormat().resolvedOptions().locale);
  const cardWidth = Math.min(width - 40, 420);
  const caption = shareCaption(session, unit);
  const hrShown = showHr && !!hrSeries;
  const routeShown = !hrShown && showRoute && session.gps?.hasRoute === true;
  // The graph replaces the route: one picture on the card.
  const toggleHr = (on: boolean) => {
    setShowHr(on);
    if (on) setShowRoute(false);
  };
  const toggleRoute = (on: boolean) => {
    setShowRoute(on);
    if (on) setShowHr(false);
  };

  async function shareText() {
    setError(null);
    try {
      await Share.share({ message: caption });
    } catch {
      setError('Couldn’t open the share sheet.');
    }
  }

  async function shareImage() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        await shareText();
        return;
      }
      // 1080 px wide whatever the screen density — a good size for chats and stories.
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: 1080,
        height: Math.round(1080 * shareCardAspect(routeShown || hrShown)),
        fileName: `tempo-${session!.id}`,
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your workout' });
    } catch (e) {
      console.warn('[share] image share failed', e);
      setError('Couldn’t create the image — try sharing as text.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
        <AppText variant="eyebrow">Share workout</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <ShareCard
          ref={cardRef}
          session={session}
          phases={phases}
          unit={unit}
          width={cardWidth}
          showRoute={showRoute}
          hrSeries={hrSeries}
          showHr={showHr}
        />

        {hrSeries ? (
          <View style={[styles.toggle, { width: cardWidth }]}>
            <Ionicons name="pulse-outline" size={18} color={colors.textSecondary} />
            <AppText variant="callout" style={{ flex: 1, marginLeft: 10 }}>
              Include heart-rate graph
            </AppText>
            <Switch
              value={showHr}
              onValueChange={toggleHr}
              trackColor={{ true: def.accent, false: 'rgba(255,255,255,0.15)' }}
              thumbColor={colors.text}
              accessibilityLabel="Include heart-rate graph"
            />
          </View>
        ) : null}

        {session.gps?.hasRoute ? (
          <View style={[styles.toggle, { width: cardWidth }]}>
            <Ionicons name="map-outline" size={18} color={colors.textSecondary} />
            <AppText variant="callout" style={{ flex: 1, marginLeft: 10 }}>
              Include route shape
            </AppText>
            <Switch
              value={routeShown}
              onValueChange={toggleRoute}
              trackColor={{ true: def.accent, false: 'rgba(255,255,255,0.15)' }}
              thumbColor={colors.text}
              accessibilityLabel="Include route shape"
            />
          </View>
        ) : null}
        {session.gps?.hasRoute ? (
          <AppText variant="caption" style={[styles.note, { width: cardWidth }]}>
            The route is a line with no map behind it, but it starts where you started — turn it off if that’s your front door.
          </AppText>
        ) : null}

        {error ? (
          <AppText variant="caption" color={colors.amber} align="center" style={{ marginTop: 12 }}>
            {error}
          </AppText>
        ) : null}

        <View style={[styles.actions, { width: cardWidth }]}>
          <PrimaryButton label={busy ? 'Preparing…' : 'Share image'} onPress={shareImage} accent={def.accent} disabled={busy} />
          <GhostButton label="Share as text" icon="chatbubble-ellipses-outline" onPress={shareText} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  content: {
    alignItems: 'center',
    paddingTop: 12,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  note: {
    marginTop: 6,
    paddingHorizontal: 4,
  },
  actions: {
    marginTop: 22,
    gap: 12,
  },
});
