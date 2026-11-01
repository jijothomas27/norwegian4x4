/**
 * Choosing a text-to-speech voice. Android reports quality and latency on a
 * 100–500 scale (500 = very high quality / very high latency). Pure, tested
 * in tests/voices.test.ts.
 */

export interface TtsVoice {
  id: string;
  /** BCP-47, e.g. "en-US" */
  language: string;
  quality: number;
  latency: number;
  /** Needs an internet connection — avoided, you may be out on a walk with patchy signal. */
  network: boolean;
  /** Voice data is downloaded and ready. */
  installed: boolean;
  isDefault?: boolean;
}

const langOf = (tag: string) => tag.split(/[-_]/)[0]?.toLowerCase() ?? '';
const regionOf = (tag: string) => tag.split(/[-_]/)[1]?.toUpperCase() ?? '';

/** Offline voices in the phone's language, best first. */
export function rankVoices(voices: readonly TtsVoice[], preferred: string): TtsVoice[] {
  const lang = langOf(preferred) || 'en';
  const region = regionOf(preferred);
  const score = (v: TtsVoice) =>
    (regionOf(v.language) === region ? 1000 : 0) +
    v.quality -
    v.latency / 10 +
    (/-local$/i.test(v.id) ? 5 : 0) +
    (v.isDefault ? 1 : 0);
  return voices
    .filter((v) => v.installed && !v.network && langOf(v.language) === lang)
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
}

/** The voice Tempo uses when you haven't picked one. */
export function pickBestVoice(voices: readonly TtsVoice[], preferred: string): TtsVoice | null {
  return rankVoices(voices, preferred)[0] ?? null;
}

const REGION_NAMES: Record<string, string> = {
  US: 'American',
  GB: 'British',
  AU: 'Australian',
  IN: 'Indian',
  CA: 'Canadian',
  IE: 'Irish',
  NZ: 'New Zealand',
  ZA: 'South African',
  NG: 'Nigerian',
  SG: 'Singaporean',
};

/** Human labels — "American 1", "British 2" — for the picker (engine voice ids are cryptic). */
export function labelVoices(voices: readonly TtsVoice[]): Map<string, string> {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const v of voices) {
    const region = regionOf(v.language);
    const name = REGION_NAMES[region] ?? (region || v.language);
    const n = (counts.get(name) ?? 0) + 1;
    counts.set(name, n);
    labels.set(v.id, `${name} ${n}`);
  }
  return labels;
}

export const VOICE_SAMPLE = 'Round two of four. High intensity. Four minutes. Find a pace you can just hold.';
