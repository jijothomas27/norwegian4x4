import assert from 'node:assert/strict';
import { test } from 'node:test';

import { advertisesHeartRate, isGarmin, parseAdvertisement } from '../src/domain/advertisement.ts';

const bytesOf = (s: string) => [...s].map((c) => c.charCodeAt(0));

test('parses flags, 16-bit services, name and Garmin manufacturer data', () => {
  const name = bytesOf('Venu 2');
  const raw = [
    0x02, 0x01, 0x06, // flags
    0x05, 0x03, 0x0d, 0x18, 0x14, 0x18, // complete 16-bit UUIDs: 180D, 1814
    name.length + 1, 0x09, ...name, // complete local name
    0x05, 0xff, 0x87, 0x00, 0x01, 0x02, // manufacturer data, company 0x0087
    0x00, 0x00, 0x00, // padding
  ];
  const ad = parseAdvertisement(raw);
  assert.equal(ad.name, 'Venu 2');
  assert.deepEqual(ad.services16, ['180d', '1814']);
  assert.ok(advertisesHeartRate(ad));
  assert.ok(isGarmin(ad));
});

test('unnamed Garmin advert without services is still recognised as Garmin', () => {
  const ad = parseAdvertisement([0x02, 0x01, 0x06, 0x04, 0xff, 0x87, 0x00, 0x09]);
  assert.equal(ad.name, undefined);
  assert.ok(isGarmin(ad));
  assert.ok(!advertisesHeartRate(ad));
});

test('tolerates truncated or empty data', () => {
  assert.deepEqual(parseAdvertisement(undefined), { services16: [], companyIds: [] });
  assert.deepEqual(parseAdvertisement([0x05, 0x03, 0x0d]), { services16: [], companyIds: [] });
});
