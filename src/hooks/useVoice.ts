import { useCallback, useEffect, useState } from 'react';

import { backgroundSession } from '../../modules/tempo-workout';
import { labelVoices, pickBestVoice, rankVoices, type TtsVoice } from '../domain/voices';
import { setCueVoice } from '../lib/cues';
import { useStore } from '../state/store';

const deviceLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
};

let cachedVoices: TtsVoice[] | null = null;

async function loadVoices(): Promise<TtsVoice[]> {
  if (cachedVoices) return cachedVoices;
  if (!backgroundSession) return [];
  try {
    cachedVoices = await backgroundSession.getVoices();
  } catch {
    cachedVoices = [];
  }
  return cachedVoices;
}

/**
 * Applies the chosen (or automatically best) voice to every cue. Mounted once
 * at the root so the voice is ready before the first workout.
 */
export function useApplyVoice() {
  const { state } = useStore();
  const chosen = state.settings.voiceId;
  useEffect(() => {
    if (!state.hydrated) return;
    let cancelled = false;
    void loadVoices().then((voices) => {
      if (cancelled) return;
      const available = rankVoices(voices, deviceLocale());
      const id = available.some((v) => v.id === chosen) ? chosen! : (pickBestVoice(voices, deviceLocale())?.id ?? null);
      setCueVoice(id);
    });
    return () => {
      cancelled = true;
    };
  }, [state.hydrated, chosen]);
}

export interface VoiceOption {
  id: string;
  label: string;
  quality: number;
}

/** Voices for the picker: offline voices in your language, best first. */
export function useVoiceOptions() {
  const [options, setOptions] = useState<VoiceOption[] | null>(null);
  const [bestId, setBestId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadVoices().then((voices) => {
      if (cancelled) return;
      const ranked = rankVoices(voices, deviceLocale()).slice(0, 10);
      const labels = labelVoices(ranked);
      setOptions(ranked.map((v) => ({ id: v.id, label: labels.get(v.id) ?? v.id, quality: v.quality })));
      setBestId(ranked[0]?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    cachedVoices = null;
  }, []);

  return { available: backgroundSession !== null, options, bestId, refresh };
}
