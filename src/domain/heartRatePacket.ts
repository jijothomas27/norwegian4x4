/**
 * Parser for the Bluetooth SIG "Heart Rate Measurement" characteristic
 * (0x2A37, part of the Heart Rate Service 0x180D). Every standard BLE heart
 * rate source speaks this format: Garmin watches in broadcast mode, Polar /
 * Wahoo / Garmin chest straps, Apple Watch via third-party apps, etc.
 *
 * Byte 0 = flags
 *   bit 0    heart-rate value format: 0 → uint8, 1 → uint16 (little-endian)
 *   bits 1-2 sensor contact: 0b10 = supported but no contact, 0b11 = contact
 *   bit 3    energy expended (uint16) present
 *   bit 4    one or more RR intervals (uint16, 1/1024 s) present
 */

export interface HeartRateMeasurement {
  bpm: number;
  /** true/false when the sensor reports skin contact, null when unsupported. */
  contact: boolean | null;
  energyKj?: number;
  /** Beat-to-beat intervals in milliseconds (for HRV, if the sensor sends them). */
  rrMs: number[];
}

export function parseHeartRateMeasurement(bytes: readonly number[]): HeartRateMeasurement | null {
  if (bytes.length < 2) return null;
  const flags = bytes[0];
  const wide = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contactDetected = (flags & 0x02) !== 0;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasRr = (flags & 0x10) !== 0;

  let i = 1;
  let bpm: number;
  if (wide) {
    if (bytes.length < 3) return null;
    bpm = bytes[1] | (bytes[2] << 8);
    i = 3;
  } else {
    bpm = bytes[1];
    i = 2;
  }

  let energyKj: number | undefined;
  if (hasEnergy && i + 1 < bytes.length) {
    energyKj = bytes[i] | (bytes[i + 1] << 8);
    i += 2;
  }

  const rrMs: number[] = [];
  if (hasRr) {
    for (; i + 1 < bytes.length; i += 2) {
      rrMs.push(Math.round(((bytes[i] | (bytes[i + 1] << 8)) / 1024) * 1000));
    }
  }

  return {
    bpm,
    contact: contactSupported ? contactDetected : null,
    energyKj,
    rrMs,
  };
}

/** Readings outside this range are sensor noise, not physiology. */
export function isPlausibleBpm(bpm: number): boolean {
  return bpm >= 30 && bpm <= 240;
}

/**
 * True for the Heart Rate Service UUID in any form a BLE stack reports it:
 * "180d", "0x180D" or the full "0000180d-0000-1000-8000-00805f9b34fb".
 */
export function isHeartRateServiceUuid(uuid: string): boolean {
  const u = uuid.trim().toLowerCase().replace(/^0x/, '');
  return u === '180d' || u === '0000180d' || u === '0000180d-0000-1000-8000-00805f9b34fb';
}
