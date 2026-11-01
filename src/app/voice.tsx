import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton } from '../components/Buttons';
import { Segmented } from '../components/Controls';
import { PressableScale } from '../components/PressableScale';
import { defaultDistanceUnit, type DistanceUnit } from '../domain/track';
import { VOICE_SAMPLE } from '../domain/voices';
import { useVoiceOptions } from '../hooks/useVoice';
import { previewVoice } from '../lib/cues';
import { useStore } from '../state/store';
import { colors, radius, space } from '../theme/tokens';

/** Voice and units for workout cues. Tapping a voice selects it and plays a sample. */
export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, updateSettings } = useStore();
  const { available, options, bestId } = useVoiceOptions();
  const selected = state.settings.voiceId && options?.some((o) => o.id === state.settings.voiceId) ? state.settings.voiceId : null;
  const unit: DistanceUnit = state.settings.distanceUnit ?? defaultDistanceUnit(Intl.DateTimeFormat().resolvedOptions().locale);

  const choose = (id: string | null) => {
    updateSettings({ voiceId: id ?? undefined });
    previewVoice(id ?? bestId, VOICE_SAMPLE);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 12,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="eyebrow">Cues</AppText>
          <AppText variant="title" style={{ marginTop: 8 }}>
            Voice & units
          </AppText>
        </View>
        <IconButton icon="close" label="Close" onPress={() => router.back()} />
      </View>

      <AppText variant="eyebrow" style={styles.section}>
        Voice
      </AppText>
      {!available ? (
        <AppText variant="body">Voice choice needs the installed app (it isn’t available in Expo Go or the browser).</AppText>
      ) : options === null ? (
        <AppText variant="body">Loading voices…</AppText>
      ) : options.length === 0 ? (
        <AppText variant="body">
          No offline voices found. On your phone, open Settings › System › Languages › Text-to-speech output and install voice data.
        </AppText>
      ) : (
        <View style={styles.card}>
          <VoiceRow label="Automatic" hint="The most natural voice on your phone" selected={selected === null} onPress={() => choose(null)} />
          {options.map((o) => (
            <VoiceRow
              key={o.id}
              label={o.label}
              hint={[o.id === bestId ? 'Best quality' : null, o.quality >= 400 ? 'High quality' : null].filter(Boolean)[0] ?? undefined}
              selected={selected === o.id}
              onPress={() => choose(o.id)}
              divider
            />
          ))}
        </View>
      )}
      <AppText variant="caption" style={{ marginTop: 10 }}>
        Tap a voice to hear it. Only voices that work offline are listed, so cues keep working with poor signal. More voices: phone
        Settings › System › Languages › Text-to-speech output › Speech Services by Google › Install voice data.
      </AppText>

      <AppText variant="eyebrow" style={styles.section}>
        Distance
      </AppText>
      <Segmented<DistanceUnit>
        options={[
          { value: 'mi', label: 'Miles' },
          { value: 'km', label: 'Kilometres' },
        ]}
        value={unit}
        onChange={(distanceUnit) => updateSettings({ distanceUnit })}
        accessibilityLabel="Distance unit"
      />
    </ScrollView>
  );
}

function VoiceRow({
  label,
  hint,
  selected,
  onPress,
  divider,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  divider?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${hint ? `, ${hint}` : ''}`}
      style={[styles.row, divider && styles.divider]}
    >
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? colors.lavender : colors.textTertiary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <AppText variant="callout">{label}</AppText>
        {hint ? <AppText variant="caption">{hint}</AppText> : null}
      </View>
      <Ionicons name="volume-medium-outline" size={18} color={colors.textTertiary} />
    </PressableScale>
  );
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
  section: {
    marginTop: space.xl,
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.lg,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
