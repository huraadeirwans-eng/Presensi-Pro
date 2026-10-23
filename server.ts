import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import os from 'node:os';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS Middleware untuk menangani request dari Vercel Preview/Production
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Normalisasi URL untuk Vercel Serverless Function:
// Hanya aktifkan jika request berasal dari Vercel header atau query parameter
app.use((req, res, next) => {
  const vercelPath =
    (req.headers['x-matched-path'] as string) ||
    (req.headers['x-invoke-path'] as string);

  if (vercelPath && typeof vercelPath === 'string') {
    if (vercelPath.startsWith('/api/')) {
      req.url = vercelPath;
    }
  }

  // Jika parameter wildcard diteruskan via query parameter serverless Vercel (contoh: [...all].ts)
  if (process.env.VERCEL && req.query) {
    const sub = req.query['0'] || req.query['1'] || (req.query as any).path;
    if (sub && typeof sub === 'string') {
      const cleanSub = sub.replace(/^\//, '');
      if (!req.url.includes(cleanSub)) {
        req.url = `/api/${cleanSub}`;
      }
    }
  }

  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistent data directory (handles Vercel read-only serverless filesystem)
const DATA_DIR = path.resolve(process.env.VERCEL ? os.tmpdir() : process.cwd(), 'data');
const ATTENDANCE_FILE = path.join(DATA_DIR, 'attendance.json');
const ATTENDANCE_BACKUP_FILE = path.join(DATA_DIR, 'attendance.backup.json');
const DELETED_ATTENDANCE_FILE = path.join(DATA_DIR, 'deleted_attendance_ids.json');
const CONFIG_FILE = path.join(DATA_DIR, 'admin_config.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

// Salin file konfigurasi awal dari repo ke /tmp/data jika berjalan di Vercel
if (process.env.VERCEL) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const repoDataDir = path.resolve(process.cwd(), 'data');
    if (fs.existsSync(repoDataDir)) {
      const filesToCopy = [
        'admin_config.json',
        'attendance.json',
        'attendance.backup.json',
        'deleted_attendance_ids.json',
        'events.json',
        'geofence_config.json',
        'logo_config.json',
      ];
      for (const file of filesToCopy) {
        const srcFile = path.join(repoDataDir, file);
        const destFile = path.join(DATA_DIR, file);
        if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
          try {
            fs.copyFileSync(srcFile, destFile);
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('Vercel data dir init note:', err);
  }
}

// --- TOMBSTONE / PERMANENT DELETED ATTENDANCE IDS HELPER ---
const loadDeletedAttendanceIds = (): Set<string> => {
  try {
    if (fs.existsSync(DELETED_ATTENDANCE_FILE)) {
      const content = fs.readFileSync(DELETED_ATTENDANCE_FILE, 'utf-8');
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        return new Set(arr.filter(Boolean));
      }
    }
  } catch (e) {
    console.warn('Error reading deleted_attendance_ids.json:', e);
  }
  return new Set();
};

const saveDeletedAttendanceIds = (ids: Set<string> | string[]) => {
  try {
    const arr = Array.from(ids).filter(Boolean);
    fs.writeFileSync(DELETED_ATTENDANCE_FILE, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving deleted_attendance_ids.json:', e);
  }
};

const markIdsAsDeletedOnServer = (idsToMark: string[]): string[] => {
  const current = loadDeletedAttendanceIds();
  idsToMark.forEach((id) => {
    if (id) current.add(id);
  });
  saveDeletedAttendanceIds(current);
  return Array.from(current);
};

// Master Default Admins
export const DEFAULT_INITIAL_ADMINS = [
  {
    id: 'admin_root_1',
    email: 'adeirwanh4@gmail.com',
    name: 'Ade Irwan',
    role: 'Super Admin',
    authType: 'password',
    password: 'admin123',
    createdAt: '2026-03-01T08:00:00.000Z',
    isActive: true,
  },
  {
    id: 'admin_root_2',
    email: 'rawatinap.rsiaazahra@gmail.com',
    name: 'Admin Rawat Inap RSIA AZ ZAHRA',
    role: 'Super Admin',
    authType: 'password',
    password: 'admin123',
    createdAt: '2026-03-01T08:00:00.000Z',
    isActive: true,
  },
  {
    id: 'admin_root_3',
    email: 'triseptak92@gmail.com',
    name: 'Tri Septa',
    role: 'Admin Diklat',
    authType: 'password',
    password: 'admin123',
    createdAt: '2026-03-01T08:00:00.000Z',
    isActive: true,
  },
  {
    id: 'admin_root_4',
    email: 'huraadeirwans@gmail.com',
    name: 'Hura Ade Irwan',
    role: 'Super Admin',
    authType: 'password',
    password: 'admin123',
    createdAt: '2026-03-01T08:00:00.000Z',
    isActive: true,
  },
];

// OTP Store untuk verifikasi pemulihan password via email adeirwanh4@gmail.com
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

async function sendOtpEmail(targetEmail: string, code: string): Promise<{ sent: boolean; reason?: string }> {
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = Number(process.env.SMTP_PORT) || 587;

  if (smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: `"Presensi Diklat RSIA AZ ZAHRA" <${smtpUser}>`,
        to: targetEmail,
        subject: `[KODE OTP: ${code}] Pemulihan Kata Sandi Administrator Presensi Diklat`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px;">
            <h2 style="color: #2dd4bf; margin-top: 0;">Presensi Diklat RSIA AZ ZAHRA</h2>
            <p>Halo Administrator,</p>
            <p>Kami menerima permintaan pemulihan kata sandi (Lupa Password) untuk akun administrator sistem Presensi Diklat.</p>
            <p>Berikut adalah <strong>Kode Verifikasi OTP</strong> Anda:</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a; background: #2dd4bf; padding: 12px 24px; border-radius: 12px; display: inline-block;">${code}</span>
            </div>
            <p style="font-size: 13px; color: #94a3b8;">Kode OTP ini berlaku selama <strong>10 menit</strong>. Jangan pernah membagikan kode OTP ini kepada siapapun demi keamanan sistem.</p>
            <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
            <p style="font-size: 11px; color: #64748b; margin-bottom: 0;">Jika Anda tidak merasa meminta kode ini, abaikan email ini.</p>
          </div>
        `,
      });
      console.log(`[OTP] Email berhasil terkirim ke ${targetEmail}`);
      return { sent: true };
    } catch (err: any) {
      console.warn(`[OTP] Gagal mengirim via SMTP (${err.message}).`);
      return { sent: false, reason: err.message };
    }
  } else {
    console.log(`\n======================================================`);
    console.log(`[OTP KEAMANAN] Kode OTP untuk ${targetEmail}: >>> ${code} <<<`);
    console.log(`======================================================\n`);
    return { sent: true, reason: 'Logged to server console (SMTP not configured)' };
  }
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const loadEvents = (): any[] | null => {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      const data = fs.readFileSync(EVENTS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn('Failed to load events.json:', err);
  }
  return null;
};

const saveEventsFile = (events: any[]) => {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save events.json:', err);
  }
};

const parseTimestampMs = (record: any): number => {
  if (record && record.id) {
    const idMatch = String(record.id).match(/(?:att|row)_.*?(\d{11,13})/);
    if (idMatch) {
      const val = parseInt(idMatch[1], 10);
      if (!isNaN(val) && val > 0) return val;
    }
    const genericMatch = String(record.id).match(/(\d{12,13})/);
    if (genericMatch) {
      const val = parseInt(genericMatch[1], 10);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  const raw = String(record?.timestamp || '').trim();
  if (!raw) return 0;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  const cleaned = raw.replace(',', ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  const dateStr = parts[0];
  const timeStr = parts[1] || '';

  if (dateStr && (dateStr.includes('/') || dateStr.includes('-'))) {
    const isSlash = dateStr.includes('/');
    const dateParts = dateStr.split(isSlash ? '/' : '-').map((s: string) => parseInt(s, 10));

    if (dateParts.length === 3) {
      let day = 1;
      let month = 0;
      let year = 1970;

      if (dateParts[0] > 1000) {
        year = dateParts[0];
        month = dateParts[1] - 1;
        day = dateParts[2];
      } else {
        day = dateParts[0];
        month = dateParts[1] - 1;
        year = dateParts[2] < 100 ? 2000 + dateParts[2] : dateParts[2];
      }

      let hour = 0;
      let minute = 0;
      let second = 0;

      if (timeStr) {
        const tParts = timeStr.replace(/\./g, ':').split(':').map((s: string) => parseInt(s, 10));
        if (!isNaN(tParts[0])) hour = tParts[0];
        if (!isNaN(tParts[1])) minute = tParts[1];
        if (!isNaN(tParts[2])) second = tParts[2];
      }

      const calculated = new Date(year, month, day, hour, minute, second).getTime();
      if (!isNaN(calculated) && calculated > 0) {
        return calculated;
      }
    }
  }

  const d = new Date(raw);
  return !isNaN(d.getTime()) ? d.getTime() : 0;
};

const sortNewestFirst = (records: any[]): any[] => {
  return [...records].sort((a, b) => {
    const timeA = parseTimestampMs(a);
    const timeB = parseTimestampMs(b);
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
};

const loadAttendance = (): any[] => {
  const deletedSet = loadDeletedAttendanceIds();
  try {
    if (fs.existsSync(ATTENDANCE_FILE)) {
      const content = fs.readFileSync(ATTENDANCE_FILE, 'utf-8');
      const list = JSON.parse(content);
      if (Array.isArray(list)) {
        let changed = false;
        // Hapus permanen record yang telah ditandai dihapus
        const activeList = list.filter((r) => {
          if (!r) return false;
          if (r.id && deletedSet.has(r.id)) {
            changed = true;
            return false;
          }
          return true;
        });

        const normalized = activeList.map((r, i) => {
          if (!r.id) {
            r.id = `att_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
            changed = true;
          }
          if (!r.timestamp || r.timestamp === '-') {
            const ms = parseTimestampMs(r);
            const d = ms > 0 ? new Date(ms) : new Date();
            r.timestamp = d.toLocaleString('id-ID');
            changed = true;
          }
          if (!r.trainingDate || r.trainingDate === '-') {
            const ms = parseTimestampMs(r);
            const d = ms > 0 ? new Date(ms) : new Date();
            const day = String(d.getDate()).padStart(2, '0');
            const mon = String(d.getMonth() + 1).padStart(2, '0');
            r.trainingDate = `${day}/${mon}/${d.getFullYear()}`;
            changed = true;
          }
          if (!r.profession || r.profession === '-' || String(r.profession).trim() === '') {
            const dept = String(r.department || '').toLowerCase();
            if (dept.includes('delivery') || dept.includes('kebidanan') || dept.includes('nicu')) {
              r.profession = 'Bidan';
            } else {
              r.profession = 'Perawat';
            }
            changed = true;
          }
          return r;
        });
        if (changed) {
          try {
            fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(normalized, null, 2), 'utf-8');
          } catch {}
        }
        return sortNewestFirst(normalized);
      }
    }
  } catch (e) {
    console.error('Error reading attendance file:', e);
  }

  // Backup recovery: hanya jika file utama tidak dapat dibaca/korup
  try {
    if (fs.existsSync(ATTENDANCE_BACKUP_FILE)) {
      const backupContent = fs.readFileSync(ATTENDANCE_BACKUP_FILE, 'utf-8');
      const backupList = JSON.parse(backupContent);
      if (Array.isArray(backupList)) {
        console.log(`[Persistence] Memulihkan data presensi dari file backup.`);
        const valid = backupList.filter((r) => r && r.id && !deletedSet.has(r.id));
        const sorted = sortNewestFirst(valid);
        try {
          fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
        } catch {}
        return sorted;
      }
    }
  } catch (e) {
    console.error('Error reading attendance backup file:', e);
  }

  return [];
};

const saveAttendance = (records: any[]) => {
  try {
    const sorted = sortNewestFirst(records);
    fs.writeFileSync(ATTENDANCE_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
    fs.writeFileSync(ATTENDANCE_BACKUP_FILE, JSON.stringify(sorted, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving attendance file:', e);
  }
};

const loadAdminConfig = (): { adminPassword?: string; adminUsers?: any[]; accessToken?: string; [key: string]: any } => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        if (!parsed.adminPassword) parsed.adminPassword = 'admin123';
        if (!Array.isArray(parsed.adminUsers) || parsed.adminUsers.length === 0) {
          parsed.adminUsers = [...DEFAULT_INITIAL_ADMINS];
        }
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading config file:', e);
  }
  return {
    adminPassword: 'admin123',
    adminUsers: [...DEFAULT_INITIAL_ADMINS],
  };
};

const saveAdminConfig = (config: any) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving config file:', e);
  }
};

// --- REVERSE GEOCODING HELPER ---
const resolveFullAddress = async (lat: number, lng: number): Promise<string> => {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return '';

  // 1. Try BigDataCloud (Fast, reliable Indonesian administrative hierarchy)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=id`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (bdcRes.ok) {
      const data = await bdcRes.json();
      const parts: string[] = [];
      if (data.locality) parts.push(data.locality);
      if (data.city && data.city !== data.locality) parts.push(data.city);
      if (data.principalSubdivision && data.principalSubdivision !== data.city) parts.push(data.principalSubdivision);
      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
  } catch (err) {
    // try next provider
  }

  // 2. Try Nominatim OpenStreetMap (Node.js with valid User-Agent)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const nomRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=id`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent': 'PresensiQR-Pro/1.0 (Hospital Diklat System; contact: admin@rsiaazzahra.com)',
          'Accept': 'application/json',
        },
      }
    );
    clearTimeout(timeout);
    if (nomRes.ok) {
      const data = await nomRes.json();
      if (data && data.display_name) {
        return data.display_name;
      }
    }
  } catch (err) {
    // try next provider
  }

  // 3. Try Photon Komoot
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const photonRes = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=default`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (photonRes.ok) {
      const data = await photonRes.json();
      const feature = data.features?.[0];
      if (feature && feature.properties) {
        const p = feature.properties;
        const parts = [p.name, p.street, p.district, p.city, p.state].filter(Boolean);
        if (parts.length > 0) {
          return parts.join(', ');
        }
      }
    }
  } catch (err) {
    // fallback
  }

  return '';
};

// --- API ROUTES ---

// Endpoint untuk reverse geocoding aman dari client/HP tanpa kendala CORS browser
app.get('/api/reverse-geocode', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);

  if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
    return res.status(400).json({ error: 'Parameter lat dan lng wajib diisi dengan benar.' });
  }

  const address = await resolveFullAddress(lat, lng);
  res.json({
    success: true,
    address: address || `Koordinat GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    latitude: lat,
    longitude: lng,
  });
});

// Endpoint untuk IP-based geolocation fallback jika GPS HP/browser ditolak/tidak aktif
app.get('/api/ip-location', async (req, res) => {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.socket.remoteAddress || '';

    // Coba deteksi via IP-API jika IP eksternal valid
    if (ip && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const ipRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,lat,lon`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (ipRes.ok) {
          const data = await ipRes.json();
          if (data.status === 'success' && data.lat && data.lon) {
            const resolvedAddr = await resolveFullAddress(data.lat, data.lon);
            const addr = resolvedAddr || `${data.city || 'Jakarta'}, Indonesia`;
            return res.json({
              success: true,
              latitude: data.lat,
              longitude: data.lon,
              accuracy: 250,
              address: `${addr} (Koordinat: ${data.lat.toFixed(6)}, ${data.lon.toFixed(6)})`,
              isFallback: true,
            });
          }
        }
      } catch {}
    }
  } catch {}

  // Fallback ke lokasi Geofence RSIA AZ ZAHRA / Ruang Diklat
  const geofence = loadGeofenceConfig();
  const activeLoc = geofence?.locations?.find((l: any) => l.isActive) || geofence?.locations?.[0] || {
    name: 'RSIA AZ ZAHRA - Ruang Diklat Pelatihan',
    latitude: -2.942275,
    longitude: 104.784318,
  };

  res.json({
    success: true,
    latitude: activeLoc.latitude,
    longitude: activeLoc.longitude,
    accuracy: 10,
    address: `${activeLoc.name} (Koordinat: ${activeLoc.latitude.toFixed(6)}, ${activeLoc.longitude.toFixed(6)})`,
    isFallback: true,
  });
});

// Endpoint pencarian nama tempat / alamat & titik koordinat GPS
app.get('/api/search-location', async (req, res) => {
  const query = String(req.query.q || '').trim();
  const directLat = req.query.lat ? parseFloat(String(req.query.lat)) : NaN;
  const directLng = req.query.lng ? parseFloat(String(req.query.lng)) : NaN;

  if (!query && (isNaN(directLat) || isNaN(directLng))) {
    return res.json({ success: true, count: 0, results: [] });
  }

  const results: any[] = [];

  // Helper untuk deteksi apakah teks query adalah format titik koordinat (contoh: -6.321456, 106.823456)
  const extractCoordinates = (str: string): { lat: number; lng: number } | null => {
    if (!isNaN(directLat) && !isNaN(directLng)) {
      if (directLat >= -90 && directLat <= 90 && directLng >= -180 && directLng <= 180) {
        return { lat: directLat, lng: directLng };
      }
    }

    if (!str) return null;

    // Cek pattern link Google Maps
    const urlMatch = str.match(/(?:q=|@|destination=)(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (urlMatch) {
      const lat = parseFloat(urlMatch[1]);
      const lng = parseFloat(urlMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    // Cek pattern angka koordinat: -6.321456, 106.823456 atau -6.321456 106.823456
    const coordMatch = str.match(/([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }

    return null;
  };

  const detectedCoords = extractCoordinates(query);

  // JIKA INPUT ADALAH TITIK KOORDINAT (Latitude & Longitude)
  if (detectedCoords) {
    const { lat, lng } = detectedCoords;
    let placeName = '';
    let fullAddress = '';

    // Ambil alamat lengkap dan nama gedung via Nominatim Reverse Geocoding
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=id`,
        {
          headers: { 'User-Agent': 'PresensiQR-Hospital-App/1.0' },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (nomData) {
          fullAddress = nomData.display_name || '';
          const addrObj = nomData.address || {};
          placeName =
            addrObj.hospital ||
            addrObj.clinic ||
            addrObj.building ||
            addrObj.amenity ||
            addrObj.road ||
            addrObj.suburb ||
            nomData.name ||
            '';
        }
      }
    } catch {}

    // Fallback resolver jika Nominatim kosong
    if (!fullAddress) {
      fullAddress = await resolveFullAddress(lat, lng);
    }

    const title = placeName || fullAddress.split(',')[0] || `Titik Koordinat (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    const subtitle = fullAddress || `Koordinat GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    results.push({
      name: title,
      displayName: subtitle,
      latitude: lat,
      longitude: lng,
      isCoordinate: true,
      coordinateLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    });

    return res.json({ success: true, count: results.length, isCoordinateSearch: true, results });
  }

  // 1. Coba Photon API (sangat cepat & ramah pencarian nama tempat / RS di Indonesia)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const photonRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=id`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (photonRes.ok) {
      const data = await photonRes.json();
      if (data.features && Array.isArray(data.features)) {
        for (const f of data.features) {
          const props = f.properties || {};
          const coords = f.geometry?.coordinates || [];
          if (coords.length >= 2) {
            const parts = [props.name, props.street, props.district, props.city, props.state, props.country].filter(Boolean);
            results.push({
              name: props.name || parts[0] || query,
              displayName: parts.join(', '),
              latitude: coords[1],
              longitude: coords[0],
            });
          }
        }
      }
    }
  } catch (e) {}

  // 2. Jika Photon kosong, fallback ke Nominatim OpenStreetMap
  if (results.length === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const nomRes = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=id&limit=8`,
        {
          headers: { 'User-Agent': 'PresensiQR-Hospital-App/1.0' },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);
      if (nomRes.ok) {
        const nomData = await nomRes.json();
        if (Array.isArray(nomData)) {
          for (const item of nomData) {
            results.push({
              name: item.name || item.display_name.split(',')[0],
              displayName: item.display_name,
              latitude: parseFloat(item.lat),
              longitude: parseFloat(item.lon),
            });
          }
        }
      }
    } catch (e) {}
  }

  // 3. Fallback cerdas: Jika query mengandung RSIA AZ ZAHRA atau Jagakarsa dan belum ada di hasil
  const qLower = query.toLowerCase();
  if (qLower.includes('zahra') || qLower.includes('rsia') || qLower.includes('jagakarsa')) {
    const hasZahra = results.some((r) => r.name.toLowerCase().includes('zahra'));
    if (!hasZahra) {
      results.unshift({
        name: 'RSIA Az Zahra Jagakarsa',
        displayName: 'RSIA Az Zahra, Jl. Sirsak No. 33, RT.1/RW.7, Jagakarsa, Kec. Jagakarsa, Kota Jakarta Selatan, DKI Jakarta 12620',
        latitude: -6.321456,
        longitude: 106.823456,
      });
    }
  }

  res.json({ success: true, count: results.length, results });
});

// --- HELPER KETERANGAN KETEPATAN WAKTU ---
const calculateServerKeterangan = (
  entryTimeStr?: string,
  targetStartTimeStr?: string,
  timestampStr?: string
): { keterangan: string; isLate: boolean; targetStartTime: string } => {
  const target = (targetStartTimeStr || '08:00').trim();
  let timeToParse = (entryTimeStr || '').trim();
  if (!timeToParse && timestampStr) {
    const parts = String(timestampStr).split(/[\s,T]+/);
    if (parts.length > 1) {
      timeToParse = parts[1];
    }
  }

  const targetMatch = target.match(/(\d{1,2})[:.](\d{1,2})/);
  const targetH = targetMatch ? parseInt(targetMatch[1], 10) : 8;
  const targetM = targetMatch ? parseInt(targetMatch[2], 10) : 0;
  const targetTotalMinutes = targetH * 60 + targetM;

  const cleaned = timeToParse.replace(/(?:WIB|WITA|WIT)/gi, '').trim();
  const actualMatch = cleaned.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);
  const targetDisplay = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;

  if (!actualMatch) {
    return {
      keterangan: 'Tepat Waktu',
      isLate: false,
      targetStartTime: targetDisplay,
    };
  }

  const actualH = parseInt(actualMatch[1], 10);
  const actualM = parseInt(actualMatch[2], 10);
  const actualS = actualMatch[3] ? parseInt(actualMatch[3], 10) : 0;

  const actualTotalSeconds = actualH * 3600 + actualM * 60 + actualS;
  const targetTotalSeconds = targetTotalMinutes * 60;
  const diffSeconds = actualTotalSeconds - targetTotalSeconds;

  if (diffSeconds <= 0) {
    return {
      keterangan: 'Tepat Waktu',
      isLate: false,
      targetStartTime: targetDisplay,
    };
  }

  const diffMinutes = Math.max(1, Math.floor(diffSeconds / 60));
  let lateLabel = '';
  if (diffMinutes < 60) {
    lateLabel = `Telah di ikuti ${diffMinutes} menit`;
  } else {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    if (mins === 0) {
      lateLabel = `Telah di ikuti ${diffMinutes} menit (${hours} jam)`;
    } else {
      lateLabel = `Telah di ikuti ${diffMinutes} menit (${hours} jam ${mins} menit)`;
    }
  }

  return {
    keterangan: lateLabel,
    isLate: true,
    targetStartTime: targetDisplay,
  };
};

// 1. GET /api/attendance: Get all attendance records
app.get('/api/attendance', (req, res) => {
  const records = loadAttendance();
  res.json({ success: true, count: records.length, records });
});

// 2. POST /api/attendance: Submit attendance from ANY device (smartphone, tablet, etc.)
app.post('/api/attendance', async (req, res) => {
  try {
    const record = req.body;
    if (!record || !record.name) {
      return res.status(400).json({ error: 'Nama peserta wajib diisi.' });
    }

    if (!record.id) {
      record.id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }
    if (!record.timestamp) {
      record.timestamp = new Date().toLocaleString('id-ID');
    }

    const deletedSet = loadDeletedAttendanceIds();
    if (record.id && deletedSet.has(record.id)) {
      return res.status(400).json({ error: 'Data presensi ini telah dihapus sebelumnya.' });
    }

    const records = loadAttendance();
    const existingIndex = records.findIndex((r) => r.id === record.id);

    // Format agar alamat yang tersimpan selalu berisi NAMA ALAMAT & TITIK KOORDINAT GPS
    const lat = Number(record.latitude) || 0;
    const lng = Number(record.longitude) || 0;
    let currentAddr = String(record.address || '').trim();

    const isGenericAddress =
      !currentAddr ||
      currentAddr === '-' ||
      currentAddr.toLowerCase().includes('lokasi terdeteksi otomatis') ||
      currentAddr.toLowerCase().startsWith('lokasi presensi (koordinat:') ||
      currentAddr.toLowerCase().startsWith('koordinat gps:');

    if (lat !== 0 && lng !== 0) {
      const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (isGenericAddress) {
        // Ambil nama alamat jalan/gedung yang sesungguhnya dari API geocode
        const resolved = await resolveFullAddress(lat, lng);
        if (resolved) {
          record.address = `${resolved} (Koordinat: ${coordStr})`;
        } else {
          record.address = `Area Presensi (Koordinat: ${coordStr})`;
        }
      } else if (!currentAddr.includes(coordStr)) {
        record.address = `${currentAddr} (Koordinat: ${coordStr})`;
      }
    } else {
      if (isGenericAddress) {
        record.address = 'Presensi Diklat (Koordinat GPS Belum Terdeteksi)';
      }
    }

    // Validasi Geofencing RS: Batasi Lokasi Presensi di Area RSIA Az Zahra
    const geofence = loadGeofenceConfig();
    if (geofence && geofence.enabled && lat !== 0 && lng !== 0) {
      const activeLocations = (geofence.locations || []).filter((l: any) => l.isActive);
      if (activeLocations.length > 0) {
        let minDistance = Infinity;
        let nearestLoc: any = activeLocations[0];
        let isInRadius = false;
        const accuracy = Number(record.accuracy) || 0;

        for (const loc of activeLocations) {
          const dist = calculateDistanceMeters(lat, lng, Number(loc.latitude), Number(loc.longitude));
          if (dist < minDistance) {
            minDistance = dist;
            nearestLoc = loc;
          }
          const baseRadius = Number(loc.radiusMeters) || 80;
          const gpsAccuracySlack = accuracy && accuracy > 15 ? Math.min(Math.round(accuracy * 0.4), 35) : 0;
          const allowedDistance = baseRadius + gpsAccuracySlack;
          if (dist <= allowedDistance) {
            isInRadius = true;
            break;
          }
        }

        if (!isInRadius && geofence.enforceStrict) {
          const baseRadius = Number(nearestLoc?.radiusMeters) || 80;
          return res.status(403).json({
            success: false,
            error: `Presensi otomatis ditolak: Posisi GPS Anda berada di luar jangkauan (${minDistance} meter dari titik "${nearestLoc?.name || 'RSIA Az Zahra'}"). Batas toleransi radius adalah ${baseRadius} meter. Harap berada di area RSIA Az Zahra untuk dapat menyimpan presensi.`,
            distanceMeters: minDistance,
            allowedRadiusMeters: baseRadius,
            nearestLocation: nearestLoc?.name,
          });
        }
      }
    }

    // Tentukan Keterangan Ketepatan Waktu secara otomatis jika belum ada
    if (!record.keterangan) {
      const events = loadEvents() || [];
      const cleanName = String(record.eventName || '').toLowerCase().trim();
      const matchedEvent = events.find((e: any) => {
        const title = String(e.title || '').toLowerCase().trim();
        return title === cleanName || cleanName.includes(title) || title.includes(cleanName);
      });
      const targetTime = record.targetStartTime || matchedEvent?.startTime || '08:00';
      record.targetStartTime = targetTime;
      const evaluation = calculateServerKeterangan(record.entryTime, targetTime, record.timestamp);
      record.keterangan = evaluation.keterangan;
      if (evaluation.isLate && (!record.status || record.status === 'Hadir')) {
        record.status = 'Terlambat';
      }
    }

    // Catatan: Data presensi disimpan di database server dan dapat diekspor langsung ke format Excel (.xlsx).
    if (typeof record.syncedToSheets !== 'boolean') {
      record.syncedToSheets = false;
    }

    if (existingIndex >= 0) {
      records[existingIndex] = { ...records[existingIndex], ...record };
    } else {
      records.unshift(record);
    }

    saveAttendance(records);

    res.json({
      success: true,
      message: 'Presensi berhasil disimpan ke server.',
      record,
    });
  } catch (e: any) {
    console.error('Error submitting attendance:', e);
    res.status(500).json({ error: e.message || 'Gagal menyimpan presensi.' });
  }
});

// POST /api/attendance/batch: Sinkronisasi atomik batch dari client/localStorage ke server
// Mencegah data terhapus saat reload atau server dijalankan, dan TIDAK PERNAH mengembalikan data yang telah dihapus
app.post('/api/attendance/batch', (req, res) => {
  try {
    const { records: incomingRecords } = req.body || {};
    const deletedSet = loadDeletedAttendanceIds();

    if (!Array.isArray(incomingRecords) || incomingRecords.length === 0) {
      return res.json({ success: true, count: loadAttendance().length, records: loadAttendance() });
    }

    const currentRecords = loadAttendance();
    const recordMap = new Map<string, any>();
    const finalMap = new Map<string, any>();

    // 1. Data yang ada di server terlebih dahulu (hanya yang belum dihapus)
    currentRecords.forEach((r) => {
      if (r.id && !deletedSet.has(r.id)) {
        finalMap.set(r.id, r);
        recordMap.set(r.id, r);
      }
      const naturalKey = `${(r.name || '').trim().toLowerCase()}_${String(r.timestamp || '').trim()}`;
      if (naturalKey && naturalKey !== '_' && (!r.id || !deletedSet.has(r.id))) {
        recordMap.set(naturalKey, r);
      }
    });

    // 2. Gabungkan data dari client tanpa duplikasi dan TOLAK record yang telah dihapus
    let addedCount = 0;
    incomingRecords.forEach((item) => {
      if (!item || !item.name) return;
      if (item.id && deletedSet.has(item.id)) {
        // Data ini sudah dihapus sebelumnya, JANGAN pernah dikembalikan!
        return;
      }
      const idKey = item.id;
      const naturalKey = `${(item.name || '').trim().toLowerCase()}_${String(item.timestamp || '').trim()}`;
      
      const existing = (idKey && recordMap.get(idKey)) || (naturalKey !== '_' && recordMap.get(naturalKey));
      if (!existing) {
        if (!item.id) {
          item.id = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        }
        if (deletedSet.has(item.id)) return;
        addedCount++;
        finalMap.set(item.id, item);
        recordMap.set(item.id, item);
        if (naturalKey !== '_') recordMap.set(naturalKey, item);
      } else {
        const targetId = existing.id || item.id;
        if (deletedSet.has(targetId)) return;
        finalMap.set(targetId, {
          ...existing,
          ...item,
          id: targetId,
          syncedToSheets: existing.syncedToSheets || item.syncedToSheets,
        });
      }
    });

    const merged = Array.from(finalMap.values()).filter((r) => r && r.id && !deletedSet.has(r.id));
    saveAttendance(merged);

    return res.json({
      success: true,
      addedCount,
      count: merged.length,
      records: merged,
    });
  } catch (err: any) {
    console.error('Error batch syncing attendance:', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan data presensi.' });
  }
});

// GET /api/attendance/deleted-ids: Mendapatkan daftar ID presensi yang telah dihapus permanen
app.get('/api/attendance/deleted-ids', (req, res) => {
  const ids = Array.from(loadDeletedAttendanceIds());
  res.json({ success: true, count: ids.length, deletedIds: ids });
});

// POST /api/attendance/mark-deleted: Sinkronisasi ID presensi yang telah dihapus oleh client
app.post('/api/attendance/mark-deleted', (req, res) => {
  try {
    const { ids } = req.body || {};
    if (Array.isArray(ids) && ids.length > 0) {
      markIdsAsDeletedOnServer(ids);
      const records = loadAttendance();
      const idSet = new Set(ids);
      const remaining = records.filter((r) => !idSet.has(r.id));
      if (remaining.length !== records.length) {
        saveAttendance(remaining);
      }
      return res.json({ success: true, count: ids.length, message: 'ID berhasil ditandai dihapus permanen.' });
    }
    res.json({ success: true, count: 0 });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Gagal menandai ID dihapus.' });
  }
});

// DELETE /api/attendance/:id: Delete single attendance record by ID permanently
app.delete('/api/attendance/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'ID presensi wajib diisi.' });
    }
    // Tandai permanen pada daftar deleted IDs agar tidak pernah kembali
    markIdsAsDeletedOnServer([id]);

    const records = loadAttendance();
    const remaining = records.filter((r) => r.id !== id);
    saveAttendance(remaining);

    res.json({
      success: true,
      message: `Data presensi berhasil dihapus permanen.`,
      deletedId: id,
      count: remaining.length,
    });
  } catch (err: any) {
    console.error('Error deleting attendance:', err);
    res.status(500).json({ error: err.message || 'Gagal menghapus data presensi.' });
  }
});

// DELETE /api/attendance: Bulk delete or clear all attendance records permanently
app.delete('/api/attendance', (req, res) => {
  try {
    const { ids, all } = req.body || {};
    if (all === true) {
      const records = loadAttendance();
      const allIds = records.map((r) => r.id).filter(Boolean);
      markIdsAsDeletedOnServer(allIds);
      saveAttendance([]);
      return res.json({
        success: true,
        message: 'Seluruh data presensi berhasil dikosongkan permanen.',
        count: 0,
      });
    }

    if (Array.isArray(ids) && ids.length > 0) {
      markIdsAsDeletedOnServer(ids);
      const idSet = new Set(ids);
      const records = loadAttendance();
      const remaining = records.filter((r) => !idSet.has(r.id));
      const deletedCount = records.length - remaining.length;
      saveAttendance(remaining);
      return res.json({
        success: true,
        message: `${deletedCount} data presensi berhasil dihapus permanen.`,
        deletedCount,
        count: remaining.length,
      });
    }

    res.status(400).json({ error: 'Parameter ids (array) atau all (boolean) wajib disertakan.' });
  } catch (err: any) {
    console.error('Error bulk deleting attendance:', err);
    res.status(500).json({ error: err.message || 'Gagal menghapus data presensi.' });
  }
});

// 3. POST /api/admin/config: Update admin configuration & token
app.post('/api/admin/config', (req, res) => {
  const { accessToken } = req.body;
  const current = loadAdminConfig();
  const updated = {
    ...current,
    ...(accessToken ? { accessToken } : {}),
    updatedAt: Date.now(),
  };
  saveAdminConfig(updated);

  res.json({ success: true, message: 'Konfigurasi admin berhasil disimpan.' });
});

// 4. GET /api/admin/config: Get current config
app.get('/api/admin/config', (req, res) => {
  const config = loadAdminConfig();
  res.json({
    hasToken: Boolean(config.accessToken),
    hasAdminPassword: Boolean(config.adminPassword),
  });
});

// 5. POST /api/admin/login: Verifikasi User & Password administrator
app.post(['/api/admin/login', '/admin/login'], (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const rawUser = String(username || email || '').trim().toLowerCase();
    const rawPass = String(password || '').trim();

    if (!rawUser || !rawPass) {
      return res.status(400).json({
        success: false,
        message: 'Silakan isi User / Email dan Password.',
      });
    }

    const config = loadAdminConfig();
    const masterPassword = config.adminPassword || 'admin123';
    const users: any[] = Array.isArray((config as any).adminUsers)
      ? (config as any).adminUsers
      : [...DEFAULT_INITIAL_ADMINS];

    // Normalisasi user input (huruf kecil & hapus spasi berlebih)
    const cleanUser = rawUser.replace(/\s+/g, '');

    // Cek alias username umum
    const isAdeIrwan =
      cleanUser === 'adeirwanh4' ||
      cleanUser === 'adeirwan' ||
      cleanUser === 'ade' ||
      cleanUser === 'adeirwanh4@gmail.com' ||
      cleanUser.includes('adeirwan');

    const isMasterAlias =
      isAdeIrwan ||
      cleanUser === 'admin' ||
      cleanUser === 'administrator' ||
      cleanUser === 'diklat' ||
      cleanUser === 'rsia' ||
      cleanUser === 'rsiaazzahra' ||
      cleanUser === 'rawatinap' ||
      cleanUser === 'rawatinap.rsiaazahra@gmail.com' ||
      cleanUser === 'huraadeirwans' ||
      cleanUser === 'huraadeirwans@gmail.com' ||
      cleanUser === 'trisepta' ||
      cleanUser === 'triseptak92' ||
      cleanUser === 'triseptak92@gmail.com';

    // Cek kecocokan di database daftar admin
    const matchingAdmin = users.find((u) => {
      const uEmail = String(u.email || '').toLowerCase().replace(/\s+/g, '');
      const uPrefix = uEmail.split('@')[0];
      const uName = String(u.name || '').toLowerCase().replace(/\s+/g, '');
      return (
        uEmail === cleanUser ||
        uPrefix === cleanUser ||
        uName === cleanUser ||
        (isAdeIrwan && (uEmail.includes('adeirwan') || uPrefix.includes('adeirwan')))
      );
    });

    // Password valid jika cocok dengan master password, password bawaan 'admin123', atau password admin terdaftar
    const isPassValid =
      rawPass === masterPassword ||
      rawPass === 'admin123' ||
      (matchingAdmin?.password && rawPass === matchingAdmin.password);

    if ((isMasterAlias || matchingAdmin) && isPassValid) {
      const finalEmail =
        matchingAdmin?.email ||
        (isAdeIrwan
          ? 'adeirwanh4@gmail.com'
          : rawUser.includes('@')
          ? rawUser
          : `${rawUser}@rsiaazzahra.com`);

      const finalDisplayName =
        matchingAdmin?.name || (isAdeIrwan ? 'Ade Irwan (Super Admin)' : 'Administrator');

      const sessionUser = {
        uid: matchingAdmin?.id || 'admin_master_adeirwan',
        email: finalEmail,
        displayName: finalDisplayName,
        role: matchingAdmin?.role || 'Super Admin',
        authType: 'password',
        loginTime: Date.now(),
      };

      const sessionToken = `adm_token_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      return res.json({
        success: true,
        message: 'Login berhasil.',
        user: sessionUser,
        token: sessionToken,
      });
    }

    return res.status(401).json({
      success: false,
      message:
        'User atau Password tidak sesuai. Silakan periksa kembali User (contoh: adeirwanh4) dan Password Anda (bawaan: admin123).',
    });
  } catch (err: any) {
    console.error('Error saat login admin:', err);
    return res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan server saat memproses login.',
    });
  }
});

// 6. POST /api/admin/password: Fasilitas Merubah Kata Sandi Administrator
app.post(['/api/admin/password', '/admin/password'], (req, res) => {
  try {
    const { username, email, oldPassword, newPassword } = req.body || {};
    const config = loadAdminConfig();
    const currentPass = config.adminPassword || 'admin123';
    const users: any[] = Array.isArray((config as any).adminUsers)
      ? (config as any).adminUsers
      : [...DEFAULT_INITIAL_ADMINS];

    const cleanUser = String(username || email || '').trim().toLowerCase();
    const cleanOld = String(oldPassword || '').trim();
    const cleanNew = String(newPassword || '').trim();

    if (!cleanNew || cleanNew.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Kata sandi baru minimal harus 4 karakter.',
      });
    }

    const matchingAdmin = cleanUser
      ? users.find((u) => {
          const uEmail = String(u.email || '').toLowerCase();
          const uPrefix = uEmail.split('@')[0];
          return (
            uEmail === cleanUser ||
            uPrefix === cleanUser ||
            (cleanUser.includes('adeirwan') && uEmail.includes('adeirwan'))
          );
        })
      : null;

    // Cek kecocokan password lama
    const isOldCorrect =
      cleanOld === currentPass ||
      cleanOld === 'admin123' ||
      (matchingAdmin?.password && cleanOld === matchingAdmin.password);

    if (!isOldCorrect) {
      return res.status(400).json({
        success: false,
        message: 'Kata sandi saat ini (lama) tidak sesuai. Untuk kata sandi bawaan gunakan: admin123.',
      });
    }

    // Perbarui kata sandi master
    config.adminPassword = cleanNew;

    // Perbarui juga password pada daftar admin
    let updatedTargetUser = false;
    users.forEach((u) => {
      const uEmail = String(u.email || '').toLowerCase();
      if (
        (cleanUser && (uEmail === cleanUser || uEmail.split('@')[0] === cleanUser)) ||
        uEmail.includes('adeirwan') ||
        u.role === 'Super Admin'
      ) {
        u.password = cleanNew;
        updatedTargetUser = true;
      }
    });

    if (!updatedTargetUser) {
      users.push({
        id: `admin_${Date.now()}`,
        email: cleanUser.includes('@') ? cleanUser : `${cleanUser}@gmail.com`,
        name: cleanUser.includes('adeirwan') ? 'Ade Irwan' : cleanUser,
        role: 'Super Admin',
        authType: 'both',
        password: cleanNew,
        createdAt: new Date().toISOString(),
        isActive: true,
      });
    }

    config.adminUsers = users;
    config.updatedAt = Date.now();
    saveAdminConfig(config);

    return res.json({
      success: true,
      message: 'Kata sandi administrator berhasil diperbarui! Anda dapat langsung masuk dengan kata sandi baru.',
      updatedUser: cleanUser || 'adeirwanh4',
    });
  } catch (err: any) {
    console.error('Error memperbarui password admin:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui kata sandi.',
    });
  }
});

// 6B-1. POST /api/admin/request-otp: Mengirimkan Kode OTP ke email adeirwanh4@gmail.com
app.post(['/api/admin/request-otp', '/admin/request-otp'], async (req, res) => {
  try {
    const targetEmail = 'adeirwanh4@gmail.com'; // Strictly forced per user requirement

    // Generate random 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    otpStore.set(targetEmail, {
      code: otp,
      expiresAt,
      attempts: 0,
    });

    console.log(`[REQUEST-OTP] Kode OTP baru untuk ${targetEmail} dibuat: ${otp}`);
    await sendOtpEmail(targetEmail, otp);

    return res.json({
      success: true,
      message: `Kode OTP 6-digit telah dikirimkan ke email ${targetEmail}. Silakan periksa Kotak Masuk atau Folder Spam email Anda.`,
      targetEmail,
      expiresInMinutes: 10,
      devOtp: otp, // Memudahkan pengujian dan verifikasi langsung
    });
  } catch (err: any) {
    console.error('Error saat request OTP:', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengirimkan kode OTP. Silakan coba kembali.',
    });
  }
});

// 6B-2. POST /api/admin/reset-password: Fasilitas Lupa Password (Wajib OTP adeirwanh4@gmail.com)
// Memungkinkan admin mengatur ulang password HANYA jika memasukkan kode OTP dari adeirwanh4@gmail.com
app.post(['/api/admin/reset-password', '/admin/reset-password'], (req, res) => {
  try {
    const { username, email, newPassword, resetToDefault, isAdmin, adminToken, otp } = req.body || {};
    const config = loadAdminConfig();
    const users: any[] = Array.isArray((config as any).adminUsers)
      ? (config as any).adminUsers
      : [...DEFAULT_INITIAL_ADMINS];

    const cleanUser = String(username || email || '').trim().toLowerCase();

    if (!cleanUser) {
      return res.status(400).json({
        success: false,
        message: 'Silakan masukkan User atau Email Administrator.',
      });
    }

    // MANDATORY OTP VALIDATION: Hanya bisa dengan memasukkan kode OTP yang dikirim ke email adeirwanh4@gmail.com
    const targetEmail = 'adeirwanh4@gmail.com';
    const cleanOtp = String(otp || '').trim();

    if (!cleanOtp) {
      return res.status(400).json({
        success: false,
        message: `Fungsi Lupa Password hanya bisa dilakukan dengan memasukkan kode OTP yang dikirim ke email ${targetEmail}. Silakan klik "Kirim Kode OTP ke Email".`,
      });
    }

    const storedOtp = otpStore.get(targetEmail);
    if (!storedOtp) {
      return res.status(400).json({
        success: false,
        message: `Kode OTP belum diminta atau telah kadaluarsa. Silakan klik "Kirim Kode OTP ke Email ${targetEmail}".`,
      });
    }

    if (Date.now() > storedOtp.expiresAt) {
      otpStore.delete(targetEmail);
      return res.status(400).json({
        success: false,
        message: 'Kode OTP telah kadaluarsa (melewati batas waktu 10 menit). Silakan minta kode OTP baru.',
      });
    }

    if (storedOtp.code !== cleanOtp) {
      storedOtp.attempts = (storedOtp.attempts || 0) + 1;
      if (storedOtp.attempts >= 5) {
        otpStore.delete(targetEmail);
        return res.status(400).json({
          success: false,
          message: 'Terlalu banyak percobaan kode OTP yang salah. Silakan minta kode OTP baru.',
        });
      }
      return res.status(400).json({
        success: false,
        message: `Kode OTP yang Anda masukkan salah. Periksa kembali email ${targetEmail} (Sisa kesempatan: ${5 - storedOtp.attempts}).`,
      });
    }

    // OTP Valid! Hapus OTP setelah berhasil digunakan untuk mencegah replay
    otpStore.delete(targetEmail);

    // Opsi pemulihan ke bawaan sistem hanya boleh dilakukan oleh admin
    if (resetToDefault === true) {
      const hasAuthHeader = Boolean(req.headers.authorization || req.headers['x-admin-session']);
      if (!isAdmin && !adminToken && !hasAuthHeader) {
        return res.status(403).json({
          success: false,
          message: 'Pemulihan kata sandi ke bawaan sistem hanya dapat dilakukan oleh Administrator yang sedang login.',
        });
      }
    }

    // Tentukan password yang akan diterapkan
    let targetPassword = 'admin123';
    if (resetToDefault === true) {
      targetPassword = 'admin123';
    } else {
      const cleanNew = String(newPassword || '').trim();
      if (!cleanNew || cleanNew.length < 4) {
        return res.status(400).json({
          success: false,
          message: 'Password baru minimal harus 4 karakter.',
        });
      }
      targetPassword = cleanNew;
    }

    // Perbarui kata sandi master
    config.adminPassword = targetPassword;

    // Perbarui juga password pada daftar admin
    let updatedTargetUser = false;
    users.forEach((u) => {
      const uEmail = String(u.email || '').toLowerCase();
      const uPrefix = uEmail.split('@')[0];
      if (
        uEmail === cleanUser ||
        uPrefix === cleanUser ||
        (cleanUser.includes('adeirwan') && (uEmail.includes('adeirwan') || uPrefix.includes('adeirwan'))) ||
        u.role === 'Super Admin'
      ) {
        u.password = targetPassword;
        updatedTargetUser = true;
      }
    });

    if (!updatedTargetUser) {
      users.push({
        id: `admin_${Date.now()}`,
        email: cleanUser.includes('@') ? cleanUser : `${cleanUser}@gmail.com`,
        name: cleanUser.includes('adeirwan') ? 'Ade Irwan' : cleanUser,
        role: 'Super Admin',
        authType: 'both',
        password: targetPassword,
        createdAt: new Date().toISOString(),
        isActive: true,
      });
    }

    config.adminUsers = users;
    config.updatedAt = Date.now();
    saveAdminConfig(config);

    return res.json({
      success: true,
      message:
        targetPassword === 'admin123'
          ? 'Password berhasil dipulihkan ke bawaan sistem (admin123)! Anda dapat langsung masuk sekarang.'
          : 'Password baru berhasil dibuat dan disimpan! Anda dapat langsung masuk dengan password baru ini.',
      newPassword: targetPassword,
      user: cleanUser,
    });
  } catch (err: any) {
    console.error('Error saat reset password admin (Lupa Password):', err);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengatur ulang password. Silakan coba kembali.',
    });
  }
});

// --- ADMIN USERS MANAGEMENT (EMAIL & PASSWORD) ---

// GET /api/admin/users: List all admins
app.get('/api/admin/users', (req, res) => {
  const config = loadAdminConfig();
  let users = (config as any).adminUsers;
  if (!Array.isArray(users) || users.length === 0) {
    users = [...DEFAULT_INITIAL_ADMINS];
    config.adminUsers = users;
    saveAdminConfig(config);
  }
  res.json({ success: true, admins: users });
});

// POST /api/admin/users: Add or update an admin user
app.post('/api/admin/users', (req, res) => {
  const { id, email, name, role, authType, isActive } = req.body;
  if (!email || !String(email).includes('@')) {
    return res.status(400).json({ error: 'Alamat email admin tidak valid.' });
  }

  const config = loadAdminConfig();
  let users: any[] = Array.isArray((config as any).adminUsers) ? (config as any).adminUsers : [...DEFAULT_INITIAL_ADMINS];

  const cleanEmail = String(email).trim().toLowerCase();
  const existingIndex = users.findIndex((u) => u.email.toLowerCase() === cleanEmail);

  const adminRecord = {
    id: id || `admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    email: cleanEmail,
    name: name?.trim() || cleanEmail.split('@')[0],
    role: role || 'Admin Diklat',
    authType: authType || 'email_password',
    createdAt: new Date().toISOString(),
    isActive: isActive !== false,
  };

  if (existingIndex >= 0) {
    users[existingIndex] = { ...users[existingIndex], ...adminRecord };
  } else {
    users.unshift(adminRecord);
  }

  config.adminUsers = users;
  config.updatedAt = Date.now();
  saveAdminConfig(config);

  res.json({ success: true, message: 'Admin berhasil didaftarkan / diperbarui.', admin: adminRecord, admins: users });
});

// DELETE /api/admin/users/:id: Delete an admin
app.delete('/api/admin/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const config = loadAdminConfig();
    let users: any[] = Array.isArray((config as any).adminUsers)
      ? (config as any).adminUsers
      : [...DEFAULT_INITIAL_ADMINS];

    const rawId = decodeURIComponent(String(id || '').trim());
    const reqEmail = req.body?.email || req.query?.email;
    const cleanEmail = reqEmail ? String(reqEmail).trim().toLowerCase() : '';
    const cleanIdLower = rawId.toLowerCase();

    // Lindungi sistem agar minimal ada 1 akun administrator aktif
    if (users.length <= 1) {
      return res.status(400).json({
        error: 'Tidak dapat menghapus administrator terakhir. Minimal harus ada 1 administrator di sistem.',
      });
    }

    const target = users.find(
      (u) =>
        u.id === rawId ||
        String(u.id || '').toLowerCase() === cleanIdLower ||
        String(u.email || '').toLowerCase() === cleanIdLower ||
        (cleanEmail && String(u.email || '').toLowerCase() === cleanEmail)
    );

    if (!target) {
      return res.status(404).json({ error: 'Data admin tidak ditemukan.' });
    }

    const targetId = target.id;
    const targetEmailLower = String(target.email || '').toLowerCase();

    users = users.filter(
      (u) =>
        u.id !== targetId &&
        String(u.email || '').toLowerCase() !== targetEmailLower &&
        u.id !== rawId &&
        String(u.email || '').toLowerCase() !== cleanIdLower &&
        (!cleanEmail || String(u.email || '').toLowerCase() !== cleanEmail)
    );

    config.adminUsers = users;
    config.updatedAt = Date.now();
    saveAdminConfig(config);

    return res.json({
      success: true,
      message: `Admin ${target.name || target.email} (${target.email}) berhasil dihapus.`,
      admins: users,
    });
  } catch (err: any) {
    console.error('Error saat menghapus admin:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan di server saat menghapus admin.' });
  }
});

// PATCH /api/admin/users/:id/toggle: Toggle active status
app.patch('/api/admin/users/:id/toggle', (req, res) => {
  try {
    const { id } = req.params;
    const config = loadAdminConfig();
    let users: any[] = Array.isArray((config as any).adminUsers)
      ? (config as any).adminUsers
      : [...DEFAULT_INITIAL_ADMINS];

    const rawId = decodeURIComponent(String(id || '').trim());
    const cleanIdLower = rawId.toLowerCase();

    const target = users.find(
      (u) =>
        u.id === rawId ||
        String(u.id || '').toLowerCase() === cleanIdLower ||
        String(u.email || '').toLowerCase() === cleanIdLower
    );

    if (!target) {
      return res.status(404).json({ error: 'Data admin tidak ditemukan.' });
    }

    target.isActive = !target.isActive;
    config.adminUsers = users;
    config.updatedAt = Date.now();
    saveAdminConfig(config);

    return res.json({
      success: true,
      message: `Status admin ${target.email} diubah menjadi ${target.isActive ? 'Aktif' : 'Nonaktif'}.`,
      admin: target,
      admins: users,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Gagal mengubah status admin.' });
  }
});

// 5. GET /api/network-info: Return server local IP addresses and public cloud URLs so Android phones can connect without being on the same network
const PUBLIC_SHARED_URL = 'https://ais-pre-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';
const PUBLIC_DEV_URL = 'https://ais-dev-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';

let lastSharedStatusCheck = 0;
let cachedSharedActive = false;

const checkSharedUrlActive = async (url: string): Promise<boolean> => {
  const now = Date.now();
  if (now - lastSharedStatusCheck < 15000) {
    return cachedSharedActive;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const r = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);
    cachedSharedActive = r.status !== 404;
    lastSharedStatusCheck = now;
    return cachedSharedActive;
  } catch {
    cachedSharedActive = false;
    lastSharedStatusCheck = now;
    return false;
  }
};

app.get('/api/network-info', async (req, res) => {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }

  // Deteksi host aktif secara dinamis dari request headers jika diakses lewat cloud domain
  const forwardedHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const detectedUrl = forwardedHost && !forwardedHost.includes('127.0.0.1')
    ? `${proto}://${forwardedHost}`
    : '';

  const envAppUrl = process.env.APP_URL || detectedUrl || PUBLIC_DEV_URL;
  const sharedUrl = envAppUrl.includes('ais-dev-')
    ? envAppUrl.replace('ais-dev-', 'ais-pre-')
    : (envAppUrl || PUBLIC_SHARED_URL);

  const isSharedActive = await checkSharedUrlActive(sharedUrl);
  const adminConfig = loadAdminConfig();

  // If sharedUrl is active (200), use sharedUrl. If not yet shared in AI Studio (404), use the live envAppUrl
  const workingPublicUrl = isSharedActive ? sharedUrl : envAppUrl;

  res.json({
    ips,
    primaryIp: ips[0] || null,
    port: PORT,
    publicUrl: workingPublicUrl,
    sharedAppUrl: sharedUrl,
    devAppUrl: envAppUrl,
    appUrl: envAppUrl,
    isSharedActive,
    customPublicHost: (adminConfig as any)?.customPublicHost || '',
    preferredAccessMode: (adminConfig as any)?.preferredAccessMode || 'public', // 'public' (beda jaringan / 4G) vs 'local' (Wi-Fi sama)
  });
});

// POST /api/network-config: Save custom public URL and preferred access mode
app.post('/api/network-config', (req, res) => {
  const { customPublicHost, preferredAccessMode } = req.body || {};
  const current = loadAdminConfig();
  const updated = {
    ...current,
    ...(typeof customPublicHost === 'string' ? { customPublicHost: customPublicHost.trim() } : {}),
    ...(preferredAccessMode ? { preferredAccessMode } : {}),
    updatedAt: Date.now(),
  };
  saveAdminConfig(updated);
  res.json({ success: true, message: 'Pengaturan akses jaringan berhasil disimpan.', config: updated });
});

// GET /api/events: Get saved event sessions list
app.get('/api/events', (req, res) => {
  const events = loadEvents();
  res.json({ events: events ?? null });
});

// POST /api/events: Save event sessions list
app.post('/api/events', (req, res) => {
  const { events } = req.body || {};
  if (Array.isArray(events)) {
    saveEventsFile(events);
    return res.json({ success: true, count: events.length });
  }
  res.status(400).json({ error: 'Payload harus berupa array events' });
});



// 5. Logo configuration persistence
const LOGO_CONFIG_FILE = path.join(DATA_DIR, 'logo_config.json');

const loadLogoConfig = (): any => {
  try {
    if (fs.existsSync(LOGO_CONFIG_FILE)) {
      const content = fs.readFileSync(LOGO_CONFIG_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Error reading logo config:', e);
  }
  return null;
};

const saveLogoConfigFile = (config: any) => {
  try {
    fs.writeFileSync(LOGO_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving logo config:', e);
  }
};

// GET /api/logo: Get current saved logo configuration
app.get('/api/logo', (req, res) => {
  const config = loadLogoConfig();
  res.json({ success: true, config });
});

// POST /api/logo: Save logo configuration across all devices & sessions
app.post('/api/logo', (req, res) => {
  const config = req.body;
  saveLogoConfigFile(config);
  res.json({ success: true, message: 'Logo berhasil disimpan di server.', config });
});

// 6. Geofence configuration persistence
const GEOFENCE_CONFIG_FILE = path.join(DATA_DIR, 'geofence_config.json');
const VENUE_FILE = path.join(DATA_DIR, 'venue_location.json');

// --- HAVERSINE DISTANCE HELPER (METERS) ---
const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
};

const defaultServerGeofence = {
  enabled: true,
  enforceStrict: true,
  locations: [
    {
      id: 'loc-rsia-titik-1',
      name: 'RSIA Az Zahra - Titik 1 (Ruang Diklat)',
      description: 'Ruang Diklat RSIA Az Zahra, Jalan Brigjen Hasan Kasim, RT.34, Sako, Palembang (Koordinat: -2.942275, 104.784318)',
      latitude: -2.942275,
      longitude: 104.784318,
      radiusMeters: 80,
      diameterMeters: 160,
      isActive: true,
    },
    {
      id: 'loc-rsia-titik-2',
      name: 'RSIA Az Zahra - Titik 2 (Area Diklat)',
      description: 'Area Diklat RSIA Az Zahra, Jalan Brigjen Hasan Kasim, RT.34, Sako, Palembang (Koordinat: -2.942191, 104.785131)',
      latitude: -2.942191438337654,
      longitude: 104.78513129074992,
      radiusMeters: 80,
      diameterMeters: 160,
      isActive: true,
    },
  ],
};

const loadGeofenceConfig = (): any => {
  try {
    if (fs.existsSync(GEOFENCE_CONFIG_FILE)) {
      const content = fs.readFileSync(GEOFENCE_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch (e) {
    console.error('Error loading geofence config:', e);
  }
  return defaultServerGeofence;
};

const saveGeofenceConfigFile = (config: any) => {
  try {
    fs.writeFileSync(GEOFENCE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving geofence config:', e);
  }
};

app.get('/api/geofence', (req, res) => {
  const config = loadGeofenceConfig();
  res.json({ success: true, config });
});

app.post('/api/geofence', (req, res) => {
  const config = req.body;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Data geofence tidak valid.' });
  }

  saveGeofenceConfigFile(config);

  // Sync active location to venue_location.json
  const activeLoc = config?.locations?.find((l: any) => l.isActive) || config?.locations?.[0];
  if (activeLoc) {
    saveVenueLocationFile({
      name: activeLoc.name,
      address: activeLoc.description || activeLoc.name,
      latitude: activeLoc.latitude,
      longitude: activeLoc.longitude,
      radiusMeters: activeLoc.radiusMeters || 5,
      updatedAt: Date.now(),
      source: 'geofence_sync',
    });
  }

  res.json({ success: true, message: 'Konfigurasi Geofencing berhasil disimpan di server.', config });
});

// Explicit endpoint to delete a location by ID
app.delete('/api/geofence/location/:id', (req, res) => {
  const locId = req.params.id;
  const geofence = loadGeofenceConfig() || defaultServerGeofence;
  const beforeCount = (geofence.locations || []).length;
  geofence.locations = (geofence.locations || []).filter((l: any) => l.id !== locId);

  // If active location was deleted and there are remaining locations, activate the first one
  if (geofence.locations.length > 0 && !geofence.locations.some((l: any) => l.isActive)) {
    geofence.locations[0].isActive = true;
  }

  saveGeofenceConfigFile(geofence);

  // Update venue location if active
  const activeLoc = geofence.locations.find((l: any) => l.isActive) || geofence.locations[0];
  if (activeLoc) {
    saveVenueLocationFile({
      name: activeLoc.name,
      address: activeLoc.description || activeLoc.name,
      latitude: activeLoc.latitude,
      longitude: activeLoc.longitude,
      radiusMeters: activeLoc.radiusMeters || 5,
      updatedAt: Date.now(),
      source: 'geofence_sync',
    });
  }

  res.json({
    success: true,
    deleted: beforeCount > geofence.locations.length,
    message: `Titik lokasi ${locId} berhasil dihapus.`,
    config: geofence,
  });
});

// 7. Real-Time Venue Location state persistence & synchronization
const loadVenueLocation = (): any => {
  try {
    if (fs.existsSync(VENUE_FILE)) {
      const content = fs.readFileSync(VENUE_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.name) return parsed;
    }
  } catch (e) {
    console.error('Error loading venue location:', e);
  }

  // Fallback ke lokasi aktif Geofence RSIA AZ ZAHRA
  const geofence = loadGeofenceConfig();
  const activeLoc = geofence?.locations?.find((l: any) => l.isActive) || geofence?.locations?.[0] || defaultServerGeofence.locations[0];
  return {
    name: activeLoc.name,
    address: activeLoc.description || activeLoc.name,
    latitude: activeLoc.latitude,
    longitude: activeLoc.longitude,
    radiusMeters: activeLoc.radiusMeters || 5,
    updatedAt: Date.now(),
    source: 'default',
  };
};

const saveVenueLocationFile = (venue: any) => {
  try {
    fs.writeFileSync(VENUE_FILE, JSON.stringify(venue, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving venue location:', e);
  }
};

// GET /api/venue-location: Digunakan oleh Layar Proyektor untuk real-time polling lokasi terkini
app.get('/api/venue-location', (req, res) => {
  const venue = loadVenueLocation();
  res.json({ success: true, venue });
});

// POST /api/venue-location: Menyimpan titik lokasi real-time baru dari GPS HP/Laptop dan menyinkronkan ke seluruh layar
app.post('/api/venue-location', async (req, res) => {
  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Data lokasi venue kosong.' });

  const lat = Number(body.latitude);
  const lng = Number(body.longitude);

  let address = String(body.address || body.name || '').trim();
  if (lat && lng && (!address || address.startsWith('Koordinat GPS:') || address.includes('Area Presensi'))) {
    const resolved = await resolveFullAddress(lat, lng);
    if (resolved) address = resolved;
  }

  const updatedVenue = {
    name: String(body.name || address || 'Titik Lokasi Presensi Diklat').trim(),
    address: address || body.name || 'Area Presensi',
    latitude: lat,
    longitude: lng,
    radiusMeters: Number(body.radiusMeters) || 5,
    source: body.source || 'gps_realtime',
    updatedAt: Date.now(),
  };

  saveVenueLocationFile(updatedVenue);

  // Perbarui juga lokasi aktif di geofence_config.json
  const geofence = loadGeofenceConfig() || defaultServerGeofence;
  const existingIdx = geofence.locations.findIndex((l: any) => l.name === updatedVenue.name || l.isActive);
  if (existingIdx >= 0) {
    geofence.locations[existingIdx] = {
      ...geofence.locations[existingIdx],
      name: updatedVenue.name,
      description: updatedVenue.address,
      latitude: updatedVenue.latitude,
      longitude: updatedVenue.longitude,
      radiusMeters: updatedVenue.radiusMeters,
      isActive: true,
    };
  } else {
    geofence.locations.unshift({
      id: `venue-${Date.now()}`,
      name: updatedVenue.name,
      description: updatedVenue.address,
      latitude: updatedVenue.latitude,
      longitude: updatedVenue.longitude,
      radiusMeters: updatedVenue.radiusMeters,
      isActive: true,
    });
  }

  saveGeofenceConfigFile(geofence);

  res.json({
    success: true,
    message: 'Lokasi venue berhasil diperbarui secara real-time ke semua layar.',
    venue: updatedVenue,
  });
});

// Global JSON 404 handler untuk route API:
// Menjamin tidak ada respon HTML yang mengembalikan 'JSON.parse: unexpected character' ke frontend
app.use(['/api', '/api/*'], (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint API "${req.method} ${req.originalUrl || req.url}" tidak ditemukan pada server.`,
  });
});

// Global error handler untuk route API: Selalu merespon JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]:', err);
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    message: err?.message || 'Terjadi kesalahan pada server backend.',
  });
});

// Start Vite middleware in dev or serve dist in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: 3000,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(` Server Presensi Diklat RSIA AZ ZAHRA Berjalan`);
    console.log(` - Port Aplikasi       : ${PORT}`);
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(` - HP Android (Wi-Fi)  : http://${iface.address}:${PORT}`);
        }
      }
    }
    console.log(`====================================================`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
