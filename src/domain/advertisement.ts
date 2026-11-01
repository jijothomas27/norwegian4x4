/**
 * Minimal parser for raw BLE advertising data (a sequence of
 * [length][type][payload] structures). Used to recognise watches that don't
 * put their name or service list where the BLE library looks for them —
 * Garmin devices, for example, always carry Garmin's Bluetooth SIG company
 * ID in their manufacturer data.
 */

/** Bluetooth SIG company identifier for Garmin International. */
export const GARMIN_COMPANY_ID = 0x0087;

export interface ParsedAdvertisement {
  name?: string;
  /** 16-bit service UUIDs as 4-char lowercase hex ("180d"). */
  services16: string[];
  companyIds: number[];
}

export function parseAdvertisement(bytes: readonly number[] | undefined): ParsedAdvertisement {
  const out: ParsedAdvertisement = { services16: [], companyIds: [] };
  if (!bytes) return out;
  let i = 0;
  while (i < bytes.length) {
    const len = bytes[i];
    if (!len || i + 1 >= bytes.length) break; // zero length = padding at the end
    const type = bytes[i + 1];
    const start = i + 2;
    const end = Math.min(bytes.length, i + 1 + len);
    const payload = bytes.slice(start, end);
    switch (type) {
      case 0x02: // incomplete list of 16-bit UUIDs
      case 0x03: // complete list
        for (let j = 0; j + 1 < payload.length; j += 2) {
          out.services16.push(((payload[j + 1] << 8) | payload[j]).toString(16).padStart(4, '0'));
        }
        break;
      case 0x16: // service data, 16-bit UUID
        if (payload.length >= 2) out.services16.push(((payload[1] << 8) | payload[0]).toString(16).padStart(4, '0'));
        break;
      case 0x08: // shortened local name
      case 0x09: // complete local name
        out.name = String.fromCharCode(...payload).replace(/\0+$/, '').trim() || out.name;
        break;
      case 0xff: // manufacturer specific data
        if (payload.length >= 2) out.companyIds.push(payload[0] | (payload[1] << 8));
        break;
    }
    i += len + 1;
  }
  return out;
}

export function advertisesHeartRate(ad: ParsedAdvertisement): boolean {
  return ad.services16.includes('180d'); // Heart Rate Service
}

export function isGarmin(ad: ParsedAdvertisement): boolean {
  return ad.companyIds.includes(GARMIN_COMPANY_ID);
}
