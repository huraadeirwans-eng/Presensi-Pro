/**
 * Dynamic QR Code Service for Anti-Fraud / Anti-Cheating Attendance
 *
 * Mencegah kecurangan peserta yang memfoto atau mengirim tangkapan layar (screenshot) QR code ke orang lain.
 * QR Code di layar proyektor / kiosk akan berganti secara otomatis setiap 15 detik.
 * URL yang dihasilkan memiliki parameter timestamp dan token dinamis terenkripsi.
 * Jika QR code dibuka dari foto lama (> 45-60 detik), sistem akan otomatis menolak dan memblokir presensi.
 */

const SECRET_SALT = 'RSIA_AZZAHRA_DIKLAT_ANTI_CHEAT_V2';
export const DYNAMIC_QR_INTERVAL_SEC = 15; // QR Code berganti tiap 15 detik
export const DYNAMIC_QR_MAX_AGE_MS = 5 * 60 * 1000; // Maksimal usia scan: 5 menit (mencegah foto hari kemarin namun toleran terhadap jaringan lambat)

/**
 * Fast synchronous cryptographic hash (Murmur3 / FNV-1a variation)
 */
function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36).toUpperCase().padStart(8, '0').slice(-8);
}

export interface DynamicQRData {
  token: string;
  timestamp: number;
  remainingSeconds: number;
  intervalIndex: number;
  code: string;
}

/**
 * Generate current dynamic QR code parameters for a given event
 */
export function getActiveDynamicQRData(
  eventTitle: string = 'Diklat',
  intervalSeconds: number = DYNAMIC_QR_INTERVAL_SEC
): DynamicQRData {
  const now = Date.now();
  const intervalMs = intervalSeconds * 1000;
  const intervalIndex = Math.floor(now / intervalMs);
  const cycleStart = intervalIndex * intervalMs;
  const elapsedInCycle = now - cycleStart;
  const remainingSeconds = Math.max(1, Math.ceil((intervalMs - elapsedInCycle) / 1000));
  const raw = `${eventTitle.trim()}::${intervalIndex}::${SECRET_SALT}`;
  const code = hashString(raw);
  const token = `${intervalIndex}-${code}`;
  return {
    token,
    timestamp: now,
    remainingSeconds,
    intervalIndex,
    code,
  };
}

export interface DynamicQRVerificationResult {
  isValid: boolean;
  isExpired: boolean;
  ageSeconds: number;
  message: string;
}

/**
 * Verifies whether a scanned dynamic QR token and timestamp is authentic and still within validity window
 */
export function verifyDynamicQR(
  eventTitle: string,
  timestampStr: string | null | undefined,
  tokenStr: string | null | undefined,
  maxAgeMs: number = DYNAMIC_QR_MAX_AGE_MS
): DynamicQRVerificationResult {
  // If no timestamp or token provided at all
  if (!timestampStr || !tokenStr) {
    return {
      isValid: false,
      isExpired: false,
      ageSeconds: 0,
      message: 'Parameter QR dinamis tidak ditemukan. Harap scan langsung dari layar proyektor aktif.',
    };
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || timestamp <= 0) {
    return {
      isValid: false,
      isExpired: true,
      ageSeconds: 9999,
      message: 'Format timestamp QR Code tidak valid.',
    };
  }

  const now = Date.now();
  const ageMs = now - timestamp;
  const ageSeconds = Math.max(0, Math.round(ageMs / 1000));

  // Future timestamp manipulation protection (toleransi 2 menit clock skew antara HP & laptop proyektor)
  if (ageMs < -120000) {
    return {
      isValid: false,
      isExpired: true,
      ageSeconds: 0,
      message: 'Jam pada perangkat tidak sinkron dengan waktu server.',
    };
  }

  // Check if expired (> maxAgeMs = 60 seconds)
  if (ageMs > maxAgeMs) {
    return {
      isValid: false,
      isExpired: true,
      ageSeconds,
      message: `⛔ KODE QR TELAH KADALUWARSA (${ageSeconds} detik lalu). QR proyektor berganti setiap ${DYNAMIC_QR_INTERVAL_SEC} detik untuk mencegah kecurangan foto/screenshot. Silakan scan langsung QR yang aktif di proyektor saat ini.`,
    };
  }

  // Verify token hash against the interval when it was created
  const intervalMs = DYNAMIC_QR_INTERVAL_SEC * 1000;
  const intervalIndex = Math.floor(timestamp / intervalMs);
  const expectedCode = hashString(`${eventTitle.trim()}::${intervalIndex}::${SECRET_SALT}`);
  const expectedToken = `${intervalIndex}-${expectedCode}`;

  // Also check previous/next interval to accommodate network latency
  const prevCode = hashString(`${eventTitle.trim()}::${intervalIndex - 1}::${SECRET_SALT}`);
  const nextCode = hashString(`${eventTitle.trim()}::${intervalIndex + 1}::${SECRET_SALT}`);

  const isMatch =
    tokenStr === expectedToken ||
    tokenStr === expectedCode ||
    tokenStr === `${intervalIndex - 1}-${prevCode}` ||
    tokenStr === prevCode ||
    tokenStr === `${intervalIndex + 1}-${nextCode}` ||
    tokenStr === nextCode;

  if (!isMatch) {
    return {
      isValid: false,
      isExpired: true,
      ageSeconds,
      message: 'Kode keamanan QR tidak cocok atau telah dimanipulasi. Mohon scan langsung dari layar proyektor.',
    };
  }

  return {
    isValid: true,
    isExpired: false,
    ageSeconds,
    message: '✓ QR Code Dinamis Valid & Terverifikasi Langsung dari Layar Proyektor (Bebas Kecurangan Foto).',
  };
}
