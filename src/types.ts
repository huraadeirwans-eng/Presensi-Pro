export interface AttendanceRecord {
  id: string;
  timestamp: string; // ISO or formatted 'YYYY-MM-DD HH:mm:ss'
  name: string;
  email: string;
  identityNumber: string; // NIP / NIM / NIK (Nomor Induk Karyawan)
  department: string; // Unit Kerja
  profession?: string; // Profesi: Perawat / Bidan / Lainnya
  trainingDate?: string; // Tanggal Pelatihan (DD,MM,YYYY)
  entryTime?: string; // Jam Masuk (Otomatis sesuai jam saat disimpan)
  targetStartTime?: string; // Jam Masuk yang ditentukan (contoh: "08:00")
  keterangan?: string; // Keterangan: "Tepat Waktu" atau "Telah di ikuti [X] menit"
  eventName: string;
  status: 'Hadir' | 'Terlambat' | 'Izin';
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  address: string;
  mapsUrl: string;
  deviceInfo: string;
  syncedToSheets: boolean;
  sheetsRowIndex?: number;
  isOfflinePending?: boolean;
}

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string;
  loading: boolean;
  error: string | null;
}

export interface EventSession {
  id: string;
  title: string;
  organization: string;
  description?: string;
  date: string;
  startTime: string;
  endTime: string;
  requireLocation: boolean;
  targetLatitude?: number;
  targetLongitude?: number;
  maxRadiusMeters?: number; // Geofencing radius
  qrCodePayload: string;
}

export interface LogoConfig {
  logoUrl: string | null;
  institutionName?: string; // Free Teks nama instansi/organisasi (default: Diklat & Pelatihan)
  width: number; // width in pixels
  height: number; // height in pixels
  shape: 'landscape'; // Bentuk landscape
  objectFit: 'contain' | 'cover';
  altText: string;
  showInKiosk: boolean;
  showInSidebar: boolean;
  showInBadge: boolean;
  showInHeader?: boolean;
  showInDataView?: boolean;
  showInScanner?: boolean;
}

export interface GeofenceLocation {
  id: string;
  name: string; // misal: "Gedung Diklat & Aula Pelatihan"
  description?: string; // misal: "Lantai 2 & 3"
  latitude: number;
  longitude: number;
  radiusMeters: number; // radius toleransi dalam meter (misal: 100)
  isActive: boolean;
  address?: string;
}

export interface GeofenceConfig {
  enabled: boolean; // Aktifkan pembatasan lokasi GPS
  enforceStrict: boolean; // true = wajib dalam radius (tolak jika di luar); false = izinkan dengan penanda
  locations: GeofenceLocation[];
}

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: 'Super Admin' | 'Admin Diklat' | 'Petugas Presensi';
  authType: 'email_password' | 'google';
  password?: string;
  createdAt: string;
  isActive: boolean;
}


