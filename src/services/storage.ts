import {
  AttendanceRecord,
  EventSession,
  LogoConfig,
  GeofenceConfig,
  GeofenceLocation,
} from '../types';
import { calculateDistanceMeters } from './geolocation';
import {
  saveAttendanceToCloud,
  deleteAttendanceFromCloud,
  clearAllAttendanceFromCloud,
  fetchDeletedAttendanceIdsFromCloud,
  saveEventToCloud,
  deleteEventFromCloud,
  saveGeofenceToCloud,
} from './firestoreSync';

const STORAGE_KEYS = {
  ATTENDANCE_LOGS: 'presensi_attendance_logs_v1',
  DELETED_ATTENDANCE_IDS: 'presensi_deleted_attendance_ids_v1',
  USER_PROFILE: 'presensi_user_profile_v1',
  ACTIVE_EVENT: 'presensi_active_event_v1',
  CUSTOM_EVENTS: 'presensi_custom_events_v1',
  LOGO_CONFIG: 'presensi_custom_logo_v1',
  GEOFENCE_CONFIG: 'presensi_geofence_config_v1',
};

export const getDeletedAttendanceIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DELETED_ATTENDANCE_IDS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr.filter(Boolean));
    }
  } catch {}
  return new Set();
};

export const markAttendanceIdsAsDeleted = (ids: string[]): void => {
  if (!ids || ids.length === 0) return;
  try {
    const existing = getDeletedAttendanceIds();
    ids.forEach((id) => {
      if (id) existing.add(id);
    });
    const arr = Array.from(existing).slice(-5000);
    localStorage.setItem(STORAGE_KEYS.DELETED_ATTENDANCE_IDS, JSON.stringify(arr));
  } catch {}

  // Synchronize immediately to backend server so it never resurrects!
  if (typeof fetch !== 'undefined') {
    fetch('/api/attendance/mark-deleted', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }
};

/**
 * Sinkronisasi daftar ID yang telah dihapus dari server Express dan Firestore Cloud
 */
export const syncDeletedIdsFromServer = async (): Promise<Set<string>> => {
  const current = getDeletedAttendanceIds();
  let updated = false;

  // 1. Dari server Express
  try {
    const res = await fetch('/api/attendance/deleted-ids');
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.deletedIds && Array.isArray(data.deletedIds)) {
        data.deletedIds.forEach((id: string) => {
          if (id && !current.has(id)) {
            current.add(id);
            updated = true;
          }
        });
      }
    }
  } catch {}

  // 2. Dari Firestore cloud tombstones
  try {
    const cloudIds = await fetchDeletedAttendanceIdsFromCloud();
    if (cloudIds && Array.isArray(cloudIds)) {
      cloudIds.forEach((id) => {
        if (id && !current.has(id)) {
          current.add(id);
          updated = true;
        }
      });
    }
  } catch {}

  if (updated) {
    try {
      localStorage.setItem(
        STORAGE_KEYS.DELETED_ATTENDANCE_IDS,
        JSON.stringify(Array.from(current).slice(-5000))
      );
      // Bersihkan juga localStorage ATTENDANCE_LOGS jika masih menyimpan data yang sudah dihapus
      const rawLogs = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS);
      if (rawLogs) {
        const parsed: AttendanceRecord[] = JSON.parse(rawLogs);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((r) => r && r.id && !current.has(r.id));
          if (filtered.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(filtered));
            if (typeof window !== 'undefined') {
              window.dispatchEvent(
                new CustomEvent('presensi_attendance_updated', { detail: filtered })
              );
            }
          }
        }
      }
    } catch {}
  }
  return current;
};

export const defaultEvents: EventSession[] = [
  {
    id: 'diklat-bhd-code-blue',
    title: 'Diklat Bantuan Hidup Dasar (BHD) & Code Blue',
    organization: 'Diklat & Pelatihan',
    description: 'Pelatihan wajib resusitasi jantung paru dan penanganan kegawatdaruratan',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:00',
    endTime: '12:00',
    requireLocation: true,
    qrCodePayload: JSON.stringify({
      type: 'PRESENSI_QR_EVENT',
      eventId: 'diklat-bhd-code-blue',
      title: 'Diklat Bantuan Hidup Dasar (BHD) & Code Blue',
      token: 'DIKLAT_BHD_TOKEN_2026',
    }),
  },
  {
    id: 'diklat-ppi-infeksi',
    title: 'Pelatihan Pencegahan & Pengendalian Infeksi (PPI)',
    organization: 'Diklat & Pelatihan',
    description: 'Kepatuhan kebersihan tangan, APD, dan pencegahan infeksi nosokomial',
    date: new Date().toISOString().split('T')[0],
    startTime: '13:00',
    endTime: '16:00',
    requireLocation: true,
    qrCodePayload: JSON.stringify({
      type: 'PRESENSI_QR_EVENT',
      eventId: 'diklat-ppi-infeksi',
      title: 'Pelatihan Pencegahan & Pengendalian Infeksi (PPI)',
      token: 'DIKLAT_PPI_TOKEN_2026',
    }),
  },
  {
    id: 'diklat-patient-safety',
    title: 'Diklat Keselamatan Pasien (Patient Safety)',
    organization: 'Diklat & Pelatihan',
    description: 'Sasaran keselamatan pasien, manajemen risiko dan pelaporan insiden',
    date: new Date().toISOString().split('T')[0],
    startTime: '08:30',
    endTime: '11:30',
    requireLocation: true,
    qrCodePayload: JSON.stringify({
      type: 'PRESENSI_QR_EVENT',
      eventId: 'diklat-patient-safety',
      title: 'Diklat Keselamatan Pasien (Patient Safety)',
      token: 'DIKLAT_SAFETY_TOKEN_2026',
    }),
  },
  {
    id: 'diklat-k3rs-apar',
    title: 'Pelatihan K3RS & Simulasi Kebakaran (APAR)',
    organization: 'Diklat & Pelatihan',
    description: 'Penggunaan alat pemadam api ringan dan evakuasi tanggap darurat',
    date: new Date().toISOString().split('T')[0],
    startTime: '09:00',
    endTime: '12:00',
    requireLocation: true,
    qrCodePayload: JSON.stringify({
      type: 'PRESENSI_QR_EVENT',
      eventId: 'diklat-k3rs-apar',
      title: 'Pelatihan K3RS & Simulasi Kebakaran (APAR)',
      token: 'DIKLAT_K3RS_TOKEN_2026',
    }),
  },
];



export interface KeteranganEvaluation {
  keterangan: string; // "Tepat Waktu" atau "Terlambat X Menit" / "Terlambat X Jam Y Menit"
  isLate: boolean;
  diffMinutes: number;
  targetStartTime: string;
  actualTime: string;
}

/**
 * Menghitung otomatis status keterangan ketepatan waktu presensi:
 * - Jika melebihi jam masuk: tercatat "Terlambat [X] Menit" atau "Terlambat [X] Jam [Y] Menit"
 * - Jika kurang dari atau sama dengan jam masuk: tercatat "Tepat Waktu"
 */
export const calculateAttendanceKeterangan = (
  entryTimeStr?: string,
  targetStartTimeStr?: string,
  timestampStr?: string
): KeteranganEvaluation => {
  const target = (targetStartTimeStr || '08:00').trim();

  // Ambil teks jam aktual dari entryTime atau dari timestamp
  let timeToParse = (entryTimeStr || '').trim();
  if (!timeToParse && timestampStr) {
    const parts = timestampStr.split(/[\s,T]+/);
    if (parts.length > 1) {
      timeToParse = parts[1];
    }
  }

  // Parse target start time: HH:mm (misal: "08:00")
  const targetMatch = target.match(/(\d{1,2})[:.](\d{1,2})/);
  const targetH = targetMatch ? parseInt(targetMatch[1], 10) : 8;
  const targetM = targetMatch ? parseInt(targetMatch[2], 10) : 0;
  const targetTotalMinutes = targetH * 60 + targetM;

  // Bersihkan teks waktu aktual dari "WIB", "WITA", "WIT"
  const cleaned = timeToParse.replace(/(?:WIB|WITA|WIT)/gi, '').trim();
  const actualMatch = cleaned.match(/(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?/);

  if (!actualMatch) {
    return {
      keterangan: 'Tepat Waktu',
      isLate: false,
      diffMinutes: 0,
      targetStartTime: `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`,
      actualTime: timeToParse || `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`,
    };
  }

  const actualH = parseInt(actualMatch[1], 10);
  const actualM = parseInt(actualMatch[2], 10);
  const actualS = actualMatch[3] ? parseInt(actualMatch[3], 10) : 0;

  const actualTotalSeconds = actualH * 3600 + actualM * 60 + actualS;
  const targetTotalSeconds = targetTotalMinutes * 60;
  const diffSeconds = actualTotalSeconds - targetTotalSeconds;

  const actualDisplay = `${String(actualH).padStart(2, '0')}:${String(actualM).padStart(2, '0')}${
    actualMatch[3] ? `:${String(actualS).padStart(2, '0')}` : ''
  }`;
  const targetDisplay = `${String(targetH).padStart(2, '0')}:${String(targetM).padStart(2, '0')}`;

  // Kurang dari atau pas jam masuk => Tepat Waktu
  if (diffSeconds <= 0) {
    return {
      keterangan: 'Tepat Waktu',
      isLate: false,
      diffMinutes: 0,
      targetStartTime: targetDisplay,
      actualTime: actualDisplay,
    };
  }

  // Melewati jam masuk => Hitung berapa menit telah diikuti
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
    diffMinutes,
    targetStartTime: targetDisplay,
    actualTime: actualDisplay,
  };
};

export const getTargetStartTimeForRecord = (
  record: Partial<AttendanceRecord>,
  eventsList?: EventSession[]
): string => {
  if (record.targetStartTime) return record.targetStartTime;

  const events = eventsList || getSavedEvents();
  if (record.eventName) {
    const cleanName = record.eventName.toLowerCase().trim();
    const found = events.find((e) => {
      const title = (e.title || '').toLowerCase().trim();
      return title === cleanName || cleanName.includes(title) || title.includes(cleanName);
    });
    if (found && found.startTime) {
      return found.startTime;
    }
  }

  if (events && events.length > 0 && events[0].startTime) {
    return events[0].startTime;
  }
  return '08:00';
};

export const getSavedAttendanceLogs = (): AttendanceRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.ATTENDANCE_LOGS);
    if (!data) return [];
    const list: AttendanceRecord[] = JSON.parse(data);
    const deletedIds = getDeletedAttendanceIds();
    return list
      .filter((item) => item && item.id && !deletedIds.has(item.id))
      .map((item) => {
        // Perbarui jika keterangan belum ada atau masih format lama "Terlambat..."
        const needsRecalc =
          !item.keterangan ||
          item.keterangan.startsWith('Terlambat') ||
          item.keterangan === '-';

        if (needsRecalc) {
          const target = item.targetStartTime || getTargetStartTimeForRecord(item);
          const evalResult = calculateAttendanceKeterangan(item.entryTime, target, item.timestamp);
          return {
            ...item,
            targetStartTime: target,
            keterangan: evalResult.keterangan,
            status: evalResult.isLate && (!item.status || item.status === 'Hadir') ? 'Terlambat' : item.status,
          };
        }
        return item;
      });
  } catch {
    return [];
  }
};

export const saveAttendanceLog = (record: AttendanceRecord) => {
  const current = getSavedAttendanceLogs();

  // Otomatis tentukan jam masuk target dan hitung keterangan jika belum ada
  let finalizedRecord = { ...record };
  if (!finalizedRecord.timestamp || finalizedRecord.timestamp === '-') {
    finalizedRecord.timestamp = new Date().toLocaleString('id-ID');
  }
  if (!finalizedRecord.trainingDate || finalizedRecord.trainingDate === '-') {
    const today = new Date();
    finalizedRecord.trainingDate = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
  }
  if (!finalizedRecord.targetStartTime) {
    finalizedRecord.targetStartTime = getTargetStartTimeForRecord(finalizedRecord);
  }
  if (!finalizedRecord.keterangan) {
    const evalResult = calculateAttendanceKeterangan(
      finalizedRecord.entryTime,
      finalizedRecord.targetStartTime,
      finalizedRecord.timestamp
    );
    finalizedRecord.keterangan = evalResult.keterangan;
    if (evalResult.isLate && (!finalizedRecord.status || finalizedRecord.status === 'Hadir')) {
      finalizedRecord.status = 'Terlambat';
    }
  }

  // Prepend newest first
  const updated = [finalizedRecord, ...current.filter((r) => r.id !== finalizedRecord.id)].slice(0, 1000);
  try {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(updated));
  } catch (err) {
    console.warn('localStorage save warning:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: updated }));
  }

  // ⚡ REAL-TIME CLOUD SYNC KE FIREBASE FIRESTORE:
  // Menjamin perubahan seketika (Cloud Sync) antara Admin Laptop dan Semua HP Peserta
  saveAttendanceToCloud(finalizedRecord).catch((err) => {
    console.warn('Sync ke Firestore Cloud tertunda:', err);
  });

  return updated;
};

/**
 * Menyimpan banyak data presensi sekaligus secara atomik (batch)
 * Mencegah data terhapus atau tertimpa saat sinkronisasi antara server dan localStorage
 */
export const saveAttendanceLogsBatch = (newRecords: AttendanceRecord[]): AttendanceRecord[] => {
  if (!newRecords || newRecords.length === 0) return getSavedAttendanceLogs();

  const current = getSavedAttendanceLogs();
  const deletedIds = getDeletedAttendanceIds();
  const recordMap = new Map<string, AttendanceRecord>();

  // 1. Masukkan data lokal yang sudah ada terlebih dahulu (sebagai dasar)
  current.forEach((r) => {
    if (r && r.id && !deletedIds.has(r.id)) {
      const key = r.id || `${(r.name || '').trim().toLowerCase()}_${String(r.timestamp || '').trim()}`;
      recordMap.set(key, r);
    }
  });

  // 2. Gabungkan data baru tanpa menghapus data lokal yang belum tersinkron (dan abaikan data yang sudah dihapus)
  const allowedNewRecords: AttendanceRecord[] = [];
  newRecords.forEach((item) => {
    if (!item || !item.name || (item.id && deletedIds.has(item.id))) return;

    let finalized = { ...item };
    if (!finalized.targetStartTime) {
      finalized.targetStartTime = getTargetStartTimeForRecord(finalized);
    }
    if (!finalized.keterangan) {
      const evalResult = calculateAttendanceKeterangan(
        finalized.entryTime,
        finalized.targetStartTime,
        finalized.timestamp
      );
      finalized.keterangan = evalResult.keterangan;
      if (evalResult.isLate && (!finalized.status || finalized.status === 'Hadir')) {
        finalized.status = 'Terlambat';
      }
    }

    const key = finalized.id || `${(finalized.name || '').trim().toLowerCase()}_${String(finalized.timestamp || '').trim()}`;
    const existing = recordMap.get(key);

    if (existing) {
      // Pertahankan status sinkronisasi Sheets jika salah satu sudah true
      const syncedToSheets = existing.syncedToSheets || finalized.syncedToSheets;
      // Pertahankan alamat/koordinat yang paling lengkap
      const bestAddress = (finalized.address && finalized.address !== '-') ? finalized.address : existing.address;
      const bestLat = (finalized.latitude && finalized.latitude !== 0) ? finalized.latitude : existing.latitude;
      const bestLng = (finalized.longitude && finalized.longitude !== 0) ? finalized.longitude : existing.longitude;
      const bestMapsUrl = finalized.mapsUrl || existing.mapsUrl;

      recordMap.set(key, {
        ...existing,
        ...finalized,
        syncedToSheets,
        address: bestAddress,
        latitude: bestLat,
        longitude: bestLng,
        mapsUrl: bestMapsUrl,
      });
    } else {
      recordMap.set(key, finalized);
      allowedNewRecords.push(finalized);
    }
  });

  const updated = Array.from(recordMap.values())
    .filter((r) => r && r.id && !deletedIds.has(r.id))
    .slice(0, 1000);

  try {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(updated));
  } catch (err) {
    console.warn('localStorage save warning:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: updated }));
  }

  // Real-time Cloud Sync ke Firebase Firestore: otomatis sinkron ke perangkat admin & perangkat lain
  allowedNewRecords.forEach((rec) => {
    saveAttendanceToCloud(rec).catch((err) => {
      console.warn('Sync ke Firestore Cloud tertunda (offline):', err);
    });
  });

  return updated;
};

/**
 * Sinkronisasi state lokal dengan data dari server
 * Menggabungkan (merge) data secara aman dan TIDAK PERNAH menghapus data lokal jika respon server kosong atau gagal
 */
/**
 * Sinkronisasi state lokal dengan data dari server
 * Menggabungkan (merge) data secara aman dan menjamin record yang telah dihapus tidak pernah kembali
 */
export const syncAttendanceWithServer = (
  serverRecords: AttendanceRecord[],
  allowEmptyClear: boolean = false
): AttendanceRecord[] => {
  const deletedIds = getDeletedAttendanceIds();

  if (!Array.isArray(serverRecords)) {
    return getSavedAttendanceLogs().filter((r) => r && r.id && !deletedIds.has(r.id));
  }

  // Jika server memang kosong karena dikosongkan/dihapus
  if (serverRecords.length === 0) {
    if (allowEmptyClear) {
      try {
        localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify([]));
      } catch {}
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: [] }));
      }
      return [];
    }
    const filtered = getSavedAttendanceLogs().filter((r) => r && r.id && !deletedIds.has(r.id));
    return filtered;
  }

  const localLogs = getSavedAttendanceLogs();
  const recordMap = new Map<string, AttendanceRecord>();

  // 1. Simpan local logs dulu (abaikan record yang telah dihapus)
  localLogs.forEach((item) => {
    if (item && item.id && !deletedIds.has(item.id)) {
      recordMap.set(item.id, item);
    }
  });

  // 2. Gabungkan data dari server (hanya yang belum dihapus)
  serverRecords.forEach((item) => {
    if (item && item.id && !deletedIds.has(item.id)) {
      const existing = recordMap.get(item.id);
      recordMap.set(item.id, {
        ...existing,
        ...item,
        syncedToSheets: existing?.syncedToSheets || item.syncedToSheets,
      });
    }
  });

  const merged = Array.from(recordMap.values())
    .filter((r) => r && r.id && !deletedIds.has(r.id))
    .slice(0, 1000);

  // Optimasi Performa: Cegah penulisan ulang localStorage & window event spam jika data identik
  if (localLogs.length === merged.length) {
    let hasChanged = false;
    for (let i = 0; i < localLogs.length; i++) {
      if (
        localLogs[i].id !== merged[i].id ||
        localLogs[i].syncedToSheets !== merged[i].syncedToSheets ||
        localLogs[i].status !== merged[i].status ||
        localLogs[i].keterangan !== merged[i].keterangan
      ) {
        hasChanged = true;
        break;
      }
    }
    if (!hasChanged) {
      return localLogs;
    }
  }

  try {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(merged));
  } catch (err) {
    console.warn('localStorage save warning:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: merged }));
  }
  return merged;
};

export const deleteAttendanceLog = (id: string) => {
  if (!id) return getSavedAttendanceLogs();
  markAttendanceIdsAsDeleted([id]);

  const current = getSavedAttendanceLogs();
  const updated = current.filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(updated));
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_deleted', { detail: { id, remaining: updated } }));
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: updated }));
  }

  // Hapus dari Firebase Firestore Cloud & catat tombstone
  deleteAttendanceFromCloud(id).catch(() => {});

  // Hapus dari backend server Express
  if (typeof fetch !== 'undefined') {
    fetch(`/api/attendance/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
  }

  return updated;
};

export const deleteMultipleAttendanceLogs = (ids: string[]) => {
  if (!ids || ids.length === 0) return getSavedAttendanceLogs();
  markAttendanceIdsAsDeleted(ids);
  const idSet = new Set(ids);
  const current = getSavedAttendanceLogs();
  const updated = current.filter((r) => !idSet.has(r.id));

  try {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(updated));
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_deleted', { detail: { ids, remaining: updated } }));
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: updated }));
  }

  // Hapus dari Firebase Firestore Cloud
  ids.forEach((id) => deleteAttendanceFromCloud(id).catch(() => {}));

  // Hapus dari backend server Express
  if (typeof fetch !== 'undefined') {
    fetch('/api/attendance', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }

  return updated;
};

export const clearAttendanceLogs = () => {
  const current = getSavedAttendanceLogs();
  const allIds = current.map((r) => r.id).filter(Boolean);
  if (allIds.length > 0) {
    markAttendanceIdsAsDeleted(allIds);
  }

  clearAllAttendanceFromCloud().catch(() => {});

  if (typeof fetch !== 'undefined') {
    fetch('/api/attendance', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
  }

  try {
    localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify([]));
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_cleared'));
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: [] }));
  }
  return [];
};

export const updateAttendanceLogSyncStatus = (id: string, synced: boolean) => {
  const current = getSavedAttendanceLogs();
  const updated = current.map((item) =>
    item.id === id ? { ...item, syncedToSheets: synced } : item
  );
  localStorage.setItem(STORAGE_KEYS.ATTENDANCE_LOGS, JSON.stringify(updated));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_attendance_updated', { detail: updated }));
  }
  return updated;
};

export interface UserProfile {
  name: string;
  identityNumber: string;
  email: string;
  department: string;
  profession?: string;
}

export const getSavedUserProfile = (): UserProfile => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
    return data
      ? JSON.parse(data)
      : {
          name: '',
          identityNumber: '',
          email: '',
          department: '',
          profession: 'Perawat',
        };
  } catch {
    return { name: '', identityNumber: '', email: '', department: '', profession: 'Perawat' };
  }
};

export const saveUserProfile = (profile: UserProfile) => {
  localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
};

export const getSavedEvents = (): EventSession[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CUSTOM_EVENTS);
    if (data === null) return defaultEvents;
    const custom = JSON.parse(data);
    if (Array.isArray(custom)) {
      // Auto-migrate old organization names to 'Diklat & Pelatihan'
      return custom.map((evt: EventSession) => {
        if (
          !evt.organization ||
          evt.organization === 'Nursing Preceptor' ||
          evt.organization === 'Instalasi Diklat Rumah Sakit' ||
          evt.organization === 'Instalasi Diklat & Pelatihan RS' ||
          evt.organization === 'Komite PPI & Diklat' ||
          evt.organization === 'Unit K3RS & Instalasi Diklat'
        ) {
          return { ...evt, organization: 'Diklat & Pelatihan' };
        }
        return evt;
      });
    }
    return defaultEvents;
  } catch {
    return defaultEvents;
  }
};

export const saveEvents = (events: EventSession[]) => {
  try {
    localStorage.setItem(STORAGE_KEYS.CUSTOM_EVENTS, JSON.stringify(events));
  } catch (err) {
    console.warn('Failed to save events to localStorage:', err);
  }

  // Broadcast to all active components in this browser window immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_events_updated', { detail: events }));
  }

  // Realtime Cloud sync ke Firebase Firestore
  events.forEach((ev) => saveEventToCloud(ev).catch(() => {}));

  // Asynchronously save to backend server for cross-device & cross-tab sync
  if (typeof fetch !== 'undefined') {
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
    }).catch(() => {});
  }
};

export const syncEventsFromServer = async (): Promise<EventSession[] | null> => {
  try {
    const res = await fetch('/api/events');
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.events)) {
        localStorage.setItem(STORAGE_KEYS.CUSTOM_EVENTS, JSON.stringify(data.events));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('presensi_events_updated', { detail: data.events }));
        }
        return data.events;
      }
    }
  } catch {}
  return null;
};

export const defaultLogoConfig: LogoConfig = {
  logoUrl: null,
  institutionName: 'Diklat & Pelatihan',
  width: 200,
  height: 48,
  shape: 'landscape',
  objectFit: 'contain',
  altText: 'Logo Instansi Diklat',
  showInKiosk: false,
  showInSidebar: false,
  showInBadge: false,
  showInHeader: false,
  showInDataView: false,
  showInScanner: false,
};

export const getSavedLogoConfig = (): LogoConfig => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.LOGO_CONFIG);
    if (data) {
      const parsed = JSON.parse(data);
      if (
        !parsed.institutionName ||
        parsed.institutionName === 'Nursing Preceptor' ||
        parsed.institutionName === 'Instalasi Diklat Rumah Sakit' ||
        parsed.institutionName === 'Instalasi Diklat & Pelatihan RS' ||
        parsed.institutionName === 'Instalasi Diklat'
      ) {
        parsed.institutionName = 'Diklat & Pelatihan';
      }
      // If no valid uploaded image, hide placeholder icons
      if (!parsed.logoUrl) {
        parsed.showInHeader = false;
        parsed.showInSidebar = false;
        parsed.showInKiosk = false;
        parsed.showInBadge = false;
        parsed.showInDataView = false;
        parsed.showInScanner = false;
      }
      return { ...defaultLogoConfig, ...parsed };
    }
    return defaultLogoConfig;
  } catch {
    return defaultLogoConfig;
  }
};

export const saveLogoConfig = (config: LogoConfig) => {
  try {
    localStorage.setItem(STORAGE_KEYS.LOGO_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.warn('LocalStorage save failed, trying server sync:', err);
  }

  // Broadcast to all active components in this browser window immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_logo_updated', { detail: config }));
  }

  // Asynchronously save to backend server for cross-device & cross-tab sync
  if (typeof fetch !== 'undefined') {
    fetch('/api/logo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch((e) => console.warn('Failed to sync logo to server:', e));
  }
};

/**
 * Sinkronisasi logo dari server (bermanfaat jika logo diubah dari perangkat lain atau setelah refresh)
 */
export const syncLogoFromServer = async (): Promise<LogoConfig | null> => {
  try {
    const res = await fetch('/api/logo');
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.config && typeof data.config === 'object') {
        const merged: LogoConfig = { ...defaultLogoConfig, ...data.config };
        try {
          localStorage.setItem(STORAGE_KEYS.LOGO_CONFIG, JSON.stringify(merged));
        } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('presensi_logo_updated', { detail: merged }));
        }
        return merged;
      }
    }
  } catch (err) {
    // quiet fallback
  }
  return null;
};

export const defaultGeofenceConfig: GeofenceConfig = {
  enabled: true, // Default aktif
  enforceStrict: true, // Wajib berada dalam radius area RS
  locations: [
    {
      id: 'loc-rsia-titik-1',
      name: 'RSIA Az Zahra - Titik 1 (Ruang Diklat)',
      description: 'Ruang Diklat RSIA Az Zahra, Jalan Brigjen Hasan Kasim, RT.34, Sako, Palembang (Koordinat: -2.942275, 104.784318)',
      latitude: -2.942275,
      longitude: 104.784318,
      radiusMeters: 100,
      isActive: true,
    },
    {
      id: 'loc-rsia-titik-2',
      name: 'RSIA Az Zahra - Titik 2 (Area Diklat)',
      description: 'Area Diklat RSIA Az Zahra, Jalan Brigjen Hasan Kasim, RT.34, Sako, Palembang (Koordinat: -2.942191, 104.785131)',
      latitude: -2.942191438337654,
      longitude: 104.78513129074992,
      radiusMeters: 100,
      isActive: true,
    },
  ],
};

export const getSavedGeofenceConfig = (): GeofenceConfig => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.GEOFENCE_CONFIG);
    if (data) {
      const parsed = JSON.parse(data);
      let locs = Array.isArray(parsed.locations) && parsed.locations.length > 0
        ? parsed.locations
        : defaultGeofenceConfig.locations;

      // Otomatis perbarui jika radius masih terlalu sempit (< 80m) agar mencakup seluruh kompleks gedung RSIA Az Zahra
      let updatedAny = false;
      locs = locs.map((l: any) => {
        if (!l.radiusMeters || l.radiusMeters < 80) {
          updatedAny = true;
          return { ...l, radiusMeters: 100 };
        }
        return l;
      });

      if (updatedAny) {
        try {
          localStorage.setItem(
            STORAGE_KEYS.GEOFENCE_CONFIG,
            JSON.stringify({ ...defaultGeofenceConfig, ...parsed, locations: locs })
          );
        } catch {}
      }

      return {
        ...defaultGeofenceConfig,
        ...parsed,
        locations: locs,
      };
    }
  } catch {}
  return defaultGeofenceConfig;
};

export const saveGeofenceConfig = (config: GeofenceConfig) => {
  try {
    localStorage.setItem(STORAGE_KEYS.GEOFENCE_CONFIG, JSON.stringify(config));
  } catch (err) {
    console.warn('Failed to save geofence to localStorage:', err);
  }

  // Broadcast event across all components in window
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('presensi_geofence_updated', { detail: config }));
  }

  // Realtime Cloud sync ke Firebase Firestore
  if (config.locations && Array.isArray(config.locations)) {
    config.locations.forEach((loc) => saveGeofenceToCloud(loc).catch(() => {}));
  }

  // Synchronize to backend server
  if (typeof fetch !== 'undefined') {
    fetch('/api/geofence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }).catch((e) => console.warn('Failed to sync geofence to server:', e));
  }
};

export const syncGeofenceFromServer = async (): Promise<GeofenceConfig | null> => {
  try {
    const res = await fetch('/api/geofence');
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.config && typeof data.config === 'object') {
        const merged: GeofenceConfig = {
          ...defaultGeofenceConfig,
          ...data.config,
          locations: Array.isArray(data.config.locations)
            ? data.config.locations
            : defaultGeofenceConfig.locations,
        };
        try {
          localStorage.setItem(STORAGE_KEYS.GEOFENCE_CONFIG, JSON.stringify(merged));
        } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('presensi_geofence_updated', { detail: merged }));
        }
        return merged;
      }
    }
  } catch {}
  return null;
};

export const deleteGeofenceLocationFromStorage = async (id: string): Promise<GeofenceConfig> => {
  const current = getSavedGeofenceConfig();
  const updatedLocations = (current.locations || []).filter((loc) => loc.id !== id);
  if (updatedLocations.length > 0 && !updatedLocations.some((l) => l.isActive)) {
    updatedLocations[0].isActive = true;
  }
  const updatedConfig: GeofenceConfig = {
    ...current,
    locations: updatedLocations,
  };
  saveGeofenceConfig(updatedConfig);

  try {
    await fetch(`/api/geofence/location/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await fetch('/api/geofence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedConfig),
    });
  } catch (e) {
    console.warn('Server delete sync failed:', e);
  }

  return updatedConfig;
};

export interface GeofenceValidationResult {
  isAllowed: boolean;
  isInRadius: boolean;
  nearestLocation: GeofenceLocation | null;
  distanceMeters: number;
  accuracyMeters?: number;
  excessMeters?: number;
  message: string;
}

export const validateCoordinatesGeofence = (
  lat: number,
  lng: number,
  config?: GeofenceConfig,
  accuracy?: number
): GeofenceValidationResult => {
  const currentConfig = config || getSavedGeofenceConfig();

  // Jika pembatasan lokasi GPS dinonaktifkan, izinkan bebas
  if (!currentConfig.enabled) {
    return {
      isAllowed: true,
      isInRadius: true,
      nearestLocation: null,
      distanceMeters: 0,
      accuracyMeters: accuracy,
      excessMeters: 0,
      message: 'Geofencing nonaktif. Presensi diizinkan dari semua lokasi.',
    };
  }

  const activeLocations = (currentConfig.locations || []).filter((l) => l.isActive);
  if (activeLocations.length === 0) {
    return {
      isAllowed: true,
      isInRadius: true,
      nearestLocation: null,
      distanceMeters: 0,
      accuracyMeters: accuracy,
      excessMeters: 0,
      message: 'Tidak ada titik lokasi RS aktif. Presensi diizinkan.',
    };
  }

  // Hitung jarak ke seluruh titik lokasi aktif
  let minDistance = Infinity;
  let nearest: GeofenceLocation = activeLocations[0];
  let matchedLocation: GeofenceLocation | null = null;

  for (const loc of activeLocations) {
    const dist = calculateDistanceMeters(lat, lng, loc.latitude, loc.longitude);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = loc;
    }
    const baseRadius = Number(loc.radiusMeters) || 100;
    // Tambahkan kelonggaran akurasi GPS indoor: jika ponsel berada di dalam gedung beton RS,
    // margin ketidakpastian perangkat (misal ±76m) diperhitungkan secara adil
    const gpsAccuracySlack = accuracy && accuracy > 15 ? Math.min(Math.round(accuracy * 0.5), 50) : 0;
    const allowedDistance = baseRadius + gpsAccuracySlack;
    if (dist <= allowedDistance) {
      matchedLocation = loc;
      break;
    }
  }

  if (matchedLocation) {
    const baseRadius = Number(matchedLocation.radiusMeters) || 100;
    const isDirect = minDistance <= baseRadius;
    return {
      isAllowed: true,
      isInRadius: true,
      nearestLocation: matchedLocation,
      distanceMeters: minDistance,
      accuracyMeters: accuracy || 5,
      excessMeters: 0,
      message: isDirect
        ? `Terverifikasi di dalam area: ${matchedLocation.name} (Jarak terhitung ${minDistance} meter, berada dalam batas radius ${baseRadius} meter).`
        : `Terverifikasi di area: ${matchedLocation.name} (Jarak terhitung ${minDistance} meter, sah dalam toleransi akurasi GPS indoor ±${Math.round(accuracy || 0)}m).`,
    };
  }

  // Di luar radius semua titik
  const isStrict = currentConfig.enforceStrict;
  const baseRadius = Number(nearest.radiusMeters) || 100;
  const gpsAccuracySlack = accuracy && accuracy > 15 ? Math.min(Math.round(accuracy * 0.5), 50) : 0;
  const allowedDistance = baseRadius + gpsAccuracySlack;
  const excess = Math.max(0, minDistance - allowedDistance);
  const message = `Posisi GPS terdeteksi ${minDistance} meter dari titik "${nearest.name}" (Batas radius ${baseRadius} meter, selisih ${excess} meter). Harap berada di area RSIA Az Zahra untuk dapat menyimpan presensi.`;

  return {
    isAllowed: !isStrict,
    isInRadius: false,
    nearestLocation: nearest,
    distanceMeters: minDistance,
    accuracyMeters: accuracy,
    excessMeters: excess,
    message,
  };
};


