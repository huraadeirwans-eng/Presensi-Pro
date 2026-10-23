import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  limit,
  where,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from './firebaseAuth';
import { AttendanceRecord, EventSession, GeofenceLocation, AdminUserRecord } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ==========================================
// 1. PRESENSI / ATTENDANCE REALTIME SYNC
// ==========================================

export const sanitizeAttendanceForCloud = (record: AttendanceRecord): Record<string, any> => {
  return {
    id: String(record.id || '').slice(0, 128),
    name: String(record.name || '-').slice(0, 150),
    nik: String(record.identityNumber || '').slice(0, 50),
    identityNumber: String(record.identityNumber || '').slice(0, 50),
    unitKerja: String(record.department || '-').slice(0, 100),
    department: String(record.department || '-').slice(0, 100),
    eventName: String(record.eventName || '-').slice(0, 200),
    timestamp: String(record.timestamp || new Date().toISOString()).slice(0, 100),
    status: (['Hadir', 'Terlambat', 'Izin'].includes(record.status) ? record.status : 'Hadir') as string,
    keterangan: String(record.keterangan || '').slice(0, 200),
    latitude: typeof record.latitude === 'number' ? record.latitude : 0,
    longitude: typeof record.longitude === 'number' ? record.longitude : 0,
    accuracy: typeof record.accuracy === 'number' ? record.accuracy : 0,
    address: String(record.address || '').slice(0, 300),
    mapsUrl: String(record.mapsUrl || '').slice(0, 500),
    device: String(record.deviceInfo || '').slice(0, 100),
    deviceInfo: String(record.deviceInfo || '').slice(0, 100),
    syncedToSheets: Boolean(record.syncedToSheets),
    profession: String(record.profession || '').slice(0, 100),
    trainingDate: String(record.trainingDate || '').slice(0, 50),
    entryTime: String(record.entryTime || '').slice(0, 50),
    targetStartTime: String(record.targetStartTime || '').slice(0, 50),
    email: String(record.email || '').slice(0, 150),
    isOfflinePending: false,
  };
};

export const CLOUD_COLLECTIONS = {
  ATTENDANCE: 'diklat_attendance',
  DELETED_IDS: 'diklat_deleted_ids',
  EVENTS: 'diklat_events',
  GEOFENCE: 'diklat_geofence_locations',
  ADMIN_USERS: 'diklat_admin_users',
};

/**
 * Menyimpan data presensi ke Firestore Cloud
 * Otomatis memicu onSnapshot di seluruh perangkat admin dan peserta lain
 */
export const saveAttendanceToCloud = async (record: AttendanceRecord): Promise<void> => {
  const path = `${CLOUD_COLLECTIONS.ATTENDANCE}/${record.id}`;
  try {
    const payload = sanitizeAttendanceForCloud(record);
    const docRef = doc(db, CLOUD_COLLECTIONS.ATTENDANCE, record.id);
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

/**
 * Menghapus data presensi dari Firestore Cloud secara permanen dan mencatat tombstone
 */
export const deleteAttendanceFromCloud = async (id: string): Promise<void> => {
  if (!id) return;
  const path = `${CLOUD_COLLECTIONS.ATTENDANCE}/${id}`;
  try {
    const docRef = doc(db, CLOUD_COLLECTIONS.ATTENDANCE, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.warn(`Firestore delete attendance warning for ${path}:`, error);
  }

  // Also clean up legacy collection if present
  try {
    const legacyRef = doc(db, 'attendance', id);
    await deleteDoc(legacyRef);
  } catch (_) {}

  // Catat ID di diklat_deleted_ids agar tidak pernah muncul kembali di perangkat manapun
  try {
    const tombstoneRef = doc(db, CLOUD_COLLECTIONS.DELETED_IDS, id);
    await setDoc(tombstoneRef, {
      id,
      deletedAt: new Date().toISOString(),
      timestamp: Date.now(),
    });
  } catch (err) {
    console.warn('Gagal menyimpan tombstone deleted id di Firestore:', err);
  }
};

/**
 * Kosongkan seluruh data presensi di Firestore Cloud secara tuntas dan catat tombstones
 */
export const clearAllAttendanceFromCloud = async (): Promise<number> => {
  try {
    const q = query(collection(db, CLOUD_COLLECTIONS.ATTENDANCE), limit(1000));
    const snap = await getDocs(q);
    const promises: Promise<any>[] = [];

    snap.forEach((d) => {
      promises.push(deleteDoc(d.ref).catch(() => {}));
      promises.push(
        setDoc(doc(db, CLOUD_COLLECTIONS.DELETED_IDS, d.id), {
          id: d.id,
          deletedAt: new Date().toISOString(),
          timestamp: Date.now(),
        }).catch(() => {})
      );
    });

    // Clean legacy collection too
    try {
      const legSnap = await getDocs(query(collection(db, 'attendance'), limit(1000)));
      legSnap.forEach((d) => {
        promises.push(deleteDoc(d.ref).catch(() => {}));
      });
    } catch (_) {}

    await Promise.all(promises);
    return snap.size;
  } catch (err) {
    console.warn('Gagal clear all attendance dari Firestore:', err);
    return 0;
  }
};

/**
 * Mengambil seluruh daftar ID yang telah dihapus permanen dari Firestore Cloud
 */
export const fetchDeletedAttendanceIdsFromCloud = async (): Promise<string[]> => {
  try {
    const snap = await getDocs(query(collection(db, CLOUD_COLLECTIONS.DELETED_IDS), limit(2000)));
    const ids: string[] = [];
    snap.forEach((d) => {
      if (d.id) ids.push(d.id);
    });
    return ids;
  } catch (e) {
    return [];
  }
};

/**
 * Berlangganan real-time listener terhadap ID yang dihapus
 */
export const subscribeDeletedAttendanceIdsRealtime = (
  onData: (deletedIds: string[]) => void
): (() => void) => {
  try {
    return onSnapshot(
      collection(db, CLOUD_COLLECTIONS.DELETED_IDS),
      (snapshot) => {
        const ids: string[] = [];
        snapshot.forEach((d) => {
          if (d.id) ids.push(d.id);
        });
        if (ids.length > 0) {
          onData(ids);
        }
      },
      (err) => console.warn('Deleted IDs realtime listener warning:', err)
    );
  } catch (e) {
    return () => {};
  }
};

/**
 * Berlangganan (Real-time listener) presensi via Firestore
 * Kapanpun ada presensi baru dari HP, admin laptop langsung otomatis terupdate
 */
export const subscribeAttendanceRealtime = (
  onData: (records: AttendanceRecord[]) => void,
  onError?: (error: any) => void
): (() => void) => {
  const path = CLOUD_COLLECTIONS.ATTENDANCE;
  try {
    const q = query(collection(db, path), limit(1000));
    return onSnapshot(
      q,
      (snapshot) => {
        const records: AttendanceRecord[] = [];
        snapshot.forEach((d) => {
          const raw = d.data();
          records.push({
            id: d.id,
            timestamp: raw.timestamp || '',
            name: raw.name || '',
            email: raw.email || '',
            identityNumber: raw.identityNumber || raw.nik || '',
            department: raw.department || raw.unitKerja || '',
            profession: raw.profession || '',
            trainingDate: raw.trainingDate || '',
            entryTime: raw.entryTime || '',
            targetStartTime: raw.targetStartTime || '',
            keterangan: raw.keterangan || '',
            eventName: raw.eventName || '',
            status: raw.status || 'Hadir',
            latitude: Number(raw.latitude) || 0,
            longitude: Number(raw.longitude) || 0,
            accuracy: Number(raw.accuracy) || 0,
            address: raw.address || '',
            mapsUrl: raw.mapsUrl || '',
            deviceInfo: raw.deviceInfo || raw.device || '',
            syncedToSheets: Boolean(raw.syncedToSheets),
            isOfflinePending: false,
          });
        });

        // Urutkan data presensi dari yang paling baru ke lama
        records.sort((a, b) => {
          const tA = new Date(a.timestamp).getTime() || 0;
          const tB = new Date(b.timestamp).getTime() || 0;
          return tB - tA;
        });

        onData(records);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    console.warn('Gagal menginisialisasi listener realtime attendance:', err);
    return () => {};
  }
};

/**
 * Mengambil seluruh data presensi langsung dari Firestore Cloud
 */
export const fetchAttendanceFromCloud = async (): Promise<AttendanceRecord[]> => {
  const path = CLOUD_COLLECTIONS.ATTENDANCE;
  try {
    const q = query(collection(db, path), limit(1000));
    const snapshot = await getDocs(q);
    const records: AttendanceRecord[] = [];
    snapshot.forEach((d) => {
      const raw = d.data();
      records.push({
        id: d.id,
        timestamp: raw.timestamp || '',
        name: raw.name || '',
        email: raw.email || '',
        identityNumber: raw.identityNumber || raw.nik || '',
        department: raw.department || raw.unitKerja || '',
        profession: raw.profession || '',
        trainingDate: raw.trainingDate || '',
        entryTime: raw.entryTime || '',
        targetStartTime: raw.targetStartTime || '',
        keterangan: raw.keterangan || '',
        eventName: raw.eventName || '',
        status: raw.status || 'Hadir',
        latitude: Number(raw.latitude) || 0,
        longitude: Number(raw.longitude) || 0,
        accuracy: Number(raw.accuracy) || 0,
        address: raw.address || '',
        mapsUrl: raw.mapsUrl || '',
        deviceInfo: raw.deviceInfo || raw.device || '',
        syncedToSheets: Boolean(raw.syncedToSheets),
        isOfflinePending: false,
      });
    });

    records.sort((a, b) => {
      const tA = new Date(a.timestamp).getTime() || 0;
      const tB = new Date(b.timestamp).getTime() || 0;
      return tB - tA;
    });

    return records;
  } catch (err) {
    console.warn('Gagal fetch attendance dari Firestore Cloud:', err);
    return [];
  }
};

// ==========================================
// 2. DIKLAT EVENTS REALTIME SYNC
// ==========================================

export const saveEventToCloud = async (event: EventSession): Promise<void> => {
  const path = `${CLOUD_COLLECTIONS.EVENTS}/${event.id}`;
  try {
    const payload = {
      id: String(event.id).slice(0, 128),
      title: String(event.title || '').slice(0, 200),
      organization: String(event.organization || '').slice(0, 150),
      date: String(event.date || '').slice(0, 50),
      startTime: String(event.startTime || '').slice(0, 20),
      endTime: String(event.endTime || '').slice(0, 20),
      speaker: String(event.description || '').slice(0, 150),
      location: String(event.targetLatitude ? `${event.targetLatitude},${event.targetLongitude}` : '').slice(0, 200),
      isActive: true,
      code: String(event.qrCodePayload || '').slice(0, 100),
    };
    const docRef = doc(db, CLOUD_COLLECTIONS.EVENTS, event.id);
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteEventFromCloud = async (id: string): Promise<void> => {
  const path = `${CLOUD_COLLECTIONS.EVENTS}/${id}`;
  try {
    await deleteDoc(doc(db, CLOUD_COLLECTIONS.EVENTS, id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const subscribeEventsRealtime = (
  onData: (events: EventSession[]) => void,
  onError?: (error: any) => void
): (() => void) => {
  const path = CLOUD_COLLECTIONS.EVENTS;
  try {
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const events: EventSession[] = [];
        snapshot.forEach((d) => {
          const raw = d.data();
          events.push({
            id: d.id,
            title: raw.title || '',
            organization: raw.organization || 'RSIA AZ ZAHRA Palembang',
            description: raw.speaker || raw.description || '',
            date: raw.date || '',
            startTime: raw.startTime || '',
            endTime: raw.endTime || '',
            requireLocation: true,
            qrCodePayload: raw.code || d.id,
          });
        });
        if (events.length > 0) {
          onData(events);
        }
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    console.warn('Gagal menginisialisasi listener realtime events:', err);
    return () => {};
  }
};

// ==========================================
// 3. GEOFENCE LOCATIONS REALTIME SYNC
// ==========================================

export const saveGeofenceToCloud = async (loc: GeofenceLocation): Promise<void> => {
  const path = `${CLOUD_COLLECTIONS.GEOFENCE}/${loc.id}`;
  try {
    const payload = {
      id: String(loc.id).slice(0, 128),
      name: String(loc.name || '').slice(0, 150),
      latitude: Number(loc.latitude) || 0,
      longitude: Number(loc.longitude) || 0,
      radiusMeters: Number(loc.radiusMeters) || 85,
      isActive: Boolean(loc.isActive),
      address: String(loc.address || '').slice(0, 300),
    };
    await setDoc(doc(db, CLOUD_COLLECTIONS.GEOFENCE, loc.id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const subscribeGeofenceRealtime = (
  onData: (locations: GeofenceLocation[]) => void,
  onError?: (error: any) => void
): (() => void) => {
  const path = CLOUD_COLLECTIONS.GEOFENCE;
  try {
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const locs: GeofenceLocation[] = [];
        snapshot.forEach((d) => {
          const raw = d.data();
          locs.push({
            id: d.id,
            name: raw.name || '',
            latitude: Number(raw.latitude) || 0,
            longitude: Number(raw.longitude) || 0,
            radiusMeters: Number(raw.radiusMeters) || 85,
            isActive: Boolean(raw.isActive),
            address: raw.address || '',
          });
        });
        if (locs.length > 0) {
          onData(locs);
        }
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    console.warn('Gagal menginisialisasi listener realtime geofence:', err);
    return () => {};
  }
};

// ==========================================
// 4. ADMIN USERS REALTIME SYNC
// ==========================================

export const saveAdminUserToCloud = async (admin: AdminUserRecord): Promise<void> => {
  const path = `${CLOUD_COLLECTIONS.ADMIN_USERS}/${admin.id}`;
  try {
    const payload = {
      id: String(admin.id).slice(0, 128),
      email: String(admin.email || '').trim().toLowerCase().slice(0, 150),
      name: String(admin.name || '').trim().slice(0, 150),
      role: admin.role || 'Admin Diklat',
      authType: admin.authType || 'email_password',
      createdAt: admin.createdAt || new Date().toISOString(),
      isActive: admin.isActive !== false,
    };
    await setDoc(doc(db, CLOUD_COLLECTIONS.ADMIN_USERS, admin.id), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};

export const deleteAdminUserFromCloud = async (id: string, email?: string): Promise<void> => {
  const deletePromises: Promise<any>[] = [];

  if (id) {
    try {
      const docRef = doc(db, CLOUD_COLLECTIONS.ADMIN_USERS, id);
      deletePromises.push(deleteDoc(docRef).catch((e) => console.warn(`Doc ${id} delete note:`, e)));
    } catch (_) {}
  }

  if (email) {
    const cleanEmail = String(email).trim().toLowerCase();
    try {
      // Coba hapus jika document ID adalah email langsung
      const emailDocRef = doc(db, CLOUD_COLLECTIONS.ADMIN_USERS, cleanEmail);
      deletePromises.push(deleteDoc(emailDocRef).catch(() => {}));
    } catch (_) {}

    try {
      // Query dokumen dengan field email
      const q = query(
        collection(db, CLOUD_COLLECTIONS.ADMIN_USERS),
        where('email', '==', cleanEmail)
      );
      const snapshot = await getDocs(q);
      snapshot.forEach((docSnap) => {
        deletePromises.push(deleteDoc(docSnap.ref).catch((e) => console.warn('Gagal hapus doc admin ref:', e)));
      });
    } catch (err) {
      console.warn('Gagal query admin berdasarkan email di Firestore:', err);
    }
  }

  try {
    await Promise.all(deletePromises);
  } catch (err) {
    console.warn('Peringatan saat menghapus admin dari Firestore:', err);
  }
};

export const subscribeAdminUsersRealtime = (
  onData: (admins: AdminUserRecord[]) => void,
  onError?: (error: any) => void
): (() => void) => {
  if (!auth.currentUser) {
    return () => {};
  }
  const path = CLOUD_COLLECTIONS.ADMIN_USERS;
  try {
    return onSnapshot(
      collection(db, path),
      (snapshot) => {
        const admins: AdminUserRecord[] = [];
        snapshot.forEach((d) => {
          const raw = d.data();
          admins.push({
            id: d.id,
            email: raw.email || '',
            name: raw.name || '',
            role: raw.role || 'Admin Diklat',
            authType: raw.authType || 'email_password',
            createdAt: raw.createdAt || '',
            isActive: raw.isActive !== false,
          });
        });
        onData(admins);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  } catch (err) {
    console.warn('Gagal menginisialisasi listener realtime admin users:', err);
    return () => {};
  }
};
