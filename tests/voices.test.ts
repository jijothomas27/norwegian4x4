import assert from 'node:assert/strict';
import { test } from 'node:test';

import { labelVoices, pickBestVoice, rankVoices, type TtsVoice } from '../src/domain/voices.ts';

const v = (id: string, language: string, quality: number, extra: Partial<TtsVoice> = {}): TtsVoice => ({
  id,
  language,
  quality,
  latency: 300,
  network: false,
  installed: true,
  ...extra,
});

const voices = [
  v('en-us-x-sfg-local', 'en-US', 300, { isDefault: true }),
  v('en-us-x-iol-local', 'en-US', 400),
  v('en-us-x-tpd-network', 'en-US', 500, { network: true }),
  v('en-us-x-tpf-local', 'en-US', 400, { installed: false }),
  v('en-gb-x-gba-local', 'en-GB', 500),
  v('nb-no-x-cfs-local', 'nb-NO', 500),
];

test('picks the best installed offline voice in your region', () => {
  assert.equal(pickBestVoice(voices, 'en-US')?.id, 'en-us-x-iol-local');
});

test('falls back to another region of the same language', () => {
  assert.equal(pickBestVoice(voices, 'en-IE')?.id, 'en-gb-x-gba-local');
  assert.equal(pickBestVoice(voices, 'fr-FR'), null);
});

test('ranking excludes network and missing voices', () => {
  const ids = rankVoices(voices, 'en-US').map((x) => x.id);
  assert.deepEqual(ids, ['en-us-x-iol-local', 'en-us-x-sfg-local', 'en-gb-x-gba-local']);
});

test('labels are readable', () => {
  const labels = labelVoices(rankVoices(voices, 'en-US'));
  assert.equal(labels.get('en-us-x-iol-local'), 'American 1');
  assert.equal(labels.get('en-us-x-sfg-local'), 'American 2');
  assert.equal(labels.get('en-gb-x-gba-local'), 'British 1');
});
