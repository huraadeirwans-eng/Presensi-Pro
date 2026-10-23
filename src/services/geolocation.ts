/**
 * Layanan Geolocation & Pengukuran GPS Akurat Perangkat (WGS84)
 * - 100% menggunakan sensor lokasi asli hardware perangkat (Geolocation API)
 * - Tidak menggunakan perkiraan IP atau koordinat statis tiruan
 * - Evaluasi multi-sampel untuk memilih akurasi terbaik dan timestamp terbaru
 * - Menampilkan radius akurasi asli dalam meter secara jujur dan transparan
 */

export interface AccuracyEvaluation {
  category: 'high' | 'medium' | 'low';
  label: string;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  description: string;
  advice?: string;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // radius akurasi dalam meter
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number; // Waktu pengukuran (epoch ms)
  accuracyCategory: 'high' | 'medium' | 'low';
  accuracyLabel: string;
  accuracyDescription: string;
  accuracyAdvice?: string;
  address: string;
  mapsUrl: string;
  osmUrl: string;
  road?: string;
  suburb?: string;
  city?: string;
  state?: string;
  isRealGps: true;
}

export interface GpsSamplingProgress {
  currentAccuracy: number;
  bestAccuracy: number;
  sampleCount: number;
  status: 'requesting_permission' | 'locking_satellites' | 'optimizing_precision' | 'ready';
  message: string;
}

export interface GpsErrorDetail {
  code: number;
  type: 'PERMISSION_DENIED' | 'POSITION_UNAVAILABLE' | 'TIMEOUT' | 'INSECURE_CONTEXT' | 'UNSUPPORTED' | 'UNKNOWN';
  title: string;
  message: string;
  troubleshootingSteps: string[];
}

/**
 * Evaluasi kategori akurasi GPS secara jujur berdasarkan margin of error (meter)
 * - Tinggi: <= 15 meter (penguncian satelit GNSS/GPS outdoor kuat)
 * - Sedang: 16 - 50 meter (indoor dekat jendela / terhalang kanopi / Wi-Fi trilateration)
 * - Rendah: > 50 meter (indoor dalam / sinyal seluler tower)
 */
export const evaluateGpsAccuracy = (accuracyMeters: number): AccuracyEvaluation => {
  const acc = Math.max(1, Math.round(accuracyMeters));

  if (acc <= 15) {
    return {
      category: 'high',
      label: 'Akurasi Tinggi (Presisi)',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      borderClass: 'border-emerald-500/40',
      textClass: 'text-emerald-300',
      description: `Satelit GPS terkunci kuat dengan deviasi ±${acc} meter.`,
    };
  }

  if (acc <= 50) {
    return {
      category: 'medium',
      label: 'Akurasi Sedang',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      borderClass: 'border-amber-500/40',
      textClass: 'text-amber-300',
      description: `Sinyal terhalang kanopi/dinding gedung dengan deviasi ±${acc} meter.`,
      advice: 'Untuk akurasi lebih tinggi, Anda dapat mendekat ke arah jendela atau pintu keluar.',
    };
  }

  return {
    category: 'low',
    label: 'Akurasi Rendah',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    borderClass: 'border-rose-500/40',
    textClass: 'text-rose-300',
    description: `Sinyal satelit lemah di dalam ruangan dengan deviasi ±${acc} meter.`,
    advice: 'Pastikan Wi-Fi pada perangkat dalam keadaan AKTIF (membantu trilaterasi lokasi indoor) atau melangkah mendekat ke jendela.',
  };
};

/**
 * Klasifikasi pesan error GPS yang informatif dan solutif
 */
export const getGpsErrorMessage = (error: any): GpsErrorDetail => {
  // Cek apakah bukan HTTPS di browser
  if (
    typeof window !== 'undefined' &&
    window.location.protocol !== 'https:' &&
    window.location.hostname !== 'localhost' &&
    window.location.hostname !== '127.0.0.1'
  ) {
    return {
      code: -1,
      type: 'INSECURE_CONTEXT',
      title: 'Akses GPS Membutuhkan Koneksi Aman (HTTPS)',
      message: 'Browser memblokir sensor lokasi karena situs tidak dibuka melalui protokol HTTPS.',
      troubleshootingSteps: [
        'Buka alamat aplikasi menggunakan tautan resmi HTTPS.',
        'Jika mengakses dari ponsel, gunakan domain cloud yang diawali dengan https://.',
      ],
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {
      code: -2,
      type: 'UNSUPPORTED',
      title: 'Perangkat Tidak Mendukung Geolocation',
      message: 'Browser atau perangkat ini tidak memiliki API pendeteksi lokasi bawaan.',
      troubleshootingSteps: [
        'Gunakan browser modern seperti Google Chrome, Safari, atau Microsoft Edge versi terbaru.',
      ],
    };
  }

  const code = Number(error?.code);

  if (code === 1) {
    // PERMISSION_DENIED
    return {
      code: 1,
      type: 'PERMISSION_DENIED',
      title: 'Izin Akses Lokasi Ditolak',
      message: 'Aplikasi tidak dapat membaca koordinat karena izin akses lokasi tidak diberikan pada browser.',
      troubleshootingSteps: [
        'Pada Chrome/Edge: Klik ikon gembok 🔒 atau setelan di samping kolom alamat URL (Address Bar).',
        'Cari menu "Izin Situs" atau "Lokasi (Location)", lalu ubah dari Blokir menjadi "Izinkan".',
        'Pada iPhone (Safari): Buka Pengaturan HP > Privasi & Keamanan > Layanan Lokasi > Safari > pilih "Saat Menggunakan App".',
        'Pada HP Android: Buka Pengaturan HP > Aplikasi > Chrome > Izin > Lokasi > pilih "Izinkan hanya saat aplikasi digunakan".',
        'Setelah izin diubah, klik tombol "Perbarui GPS" atau segarkan halaman.',
      ],
    };
  }

  if (code === 2) {
    // POSITION_UNAVAILABLE
    return {
      code: 2,
      type: 'POSITION_UNAVAILABLE',
      title: 'Sinyal GPS Tidak Tersedia',
      message: 'Sensor GPS perangkat Anda dalam keadaan nonaktif atau sinyal satelit tidak dapat dijangkau.',
      troubleshootingSteps: [
        'Pastikan tombol toggle "Lokasi / GPS" pada bilah notifikasi ponsel Anda sudah AKTIF (ON).',
        'Nyalakan koneksi Wi-Fi perangkat (membantu Google Location Services menentukan posisi di dalam ruangan).',
        'Jika berada di dalam basement atau ruangan tertutup tanpa jendela, pindahlah ke area dengan visibilitas sinyal yang lebih baik.',
      ],
    };
  }

  if (code === 3) {
    // TIMEOUT
    return {
      code: 3,
      type: 'TIMEOUT',
      title: 'Waktu Penguncian GPS Habis (Timeout)',
      message: 'Perangkat membutuhkan waktu lebih lama untuk mengunci sinyal satelit GPS.',
      troubleshootingSteps: [
        'Pastikan fitur "Lokasi Presisi" (High Accuracy) aktif di pengaturan lokasi HP.',
        'Nyalakan Wi-Fi ponsel untuk mempercepat penguncian lokasi indoor.',
        'Klik tombol "Perbarui GPS" untuk memulai ulang proses penguncian satelit.',
      ],
    };
  }

  return {
    code: 0,
    type: 'UNKNOWN',
    title: 'Gagal Membaca Koordinat GPS',
    message: String(error?.message || 'Terjadi kendala saat menghubungkan ke sensor GPS perangkat.'),
    troubleshootingSteps: [
      'Pastikan GPS ponsel menyala dan izin lokasi diizinkan di browser.',
      'Klik tombol "Perbarui GPS" untuk mencoba kembali.',
    ],
  };
};

/**
 * Periksa status izin akses lokasi pada browser sebelum memanggil sensor GPS
 */
export const checkLocationPermission = async (): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> => {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
    return 'unsupported';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state;
  } catch {
    return 'unsupported';
  }
};

/**
 * Mengambil koordinat asli hardware perangkat dengan multi-sampling
 * - Menggunakan enableHighAccuracy: true dan maximumAge: 0 (selalu data sensor fresh)
 * - Mengumpulkan beberapa pembacaan sensor dan memilih sampel dengan akurasi terbaik dan timestamp terbaru
 * - Tidak pernah menggunakan rata-rata koordinat atau koordinat tiruan
 */
export const getCoordinates = async (
  highAccuracy: boolean = true,
  maxWaitMs: number = 8000,
  targetAccuracy: number = 15,
  onProgress?: (progress: GpsSamplingProgress) => void
): Promise<GeolocationPosition> => {
  // Cek apakah izin sebelumnya sudah ditolak permanen
  try {
    const perm = await checkLocationPermission();
    if (perm === 'denied') {
      const err = new Error('Izin akses lokasi browser ditolak.');
      (err as any).code = 1; // PERMISSION_DENIED
      throw err;
    }
  } catch (permErr: any) {
    if (permErr?.code === 1) throw permErr;
  }

  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Browser Anda tidak mendukung fitur deteksi lokasi (Geolocation API).'));
      return;
    }

    // Informasikan status awal
    if (onProgress) {
      onProgress({
        currentAccuracy: 999,
        bestAccuracy: 999,
        sampleCount: 0,
        status: 'requesting_permission',
        message: 'Menghubungkan ke sensor GPS hardware perangkat (Meminta izin sensor)...',
      });
    }

    let bestPosition: GeolocationPosition | null = null;
    let sampleCount = 0;
    let watchId: number | null = null;
    let timeoutTimer: any = null;
    let quickCheckTimer: any = null;
    let hasResolved = false;

    const cleanup = () => {
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch {}
        watchId = null;
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (quickCheckTimer) {
        clearTimeout(quickCheckTimer);
        quickCheckTimer = null;
      }
    };

    const finish = (pos: GeolocationPosition) => {
      if (hasResolved) return;
      hasResolved = true;
      cleanup();
      resolve(pos);
    };

    // Timer batas waktu pengumpulan sampel: selesaikan dengan sampel terbaik yang didapat
    timeoutTimer = setTimeout(() => {
      if (bestPosition) {
        finish(bestPosition);
      } else {
        cleanup();
        // Coba sekali lagi dengan getCurrentPosition langsung sebagai fallback terakhir
        navigator.geolocation.getCurrentPosition(
          (pos) => finish(pos),
          (err) => reject(err),
          {
            enableHighAccuracy: true,
            timeout: 6000,
            maximumAge: 0,
          }
        );
      }
    }, maxWaitMs);

    // Quick-check: Jika watchPosition belum memicu callback setelah 2.5 detik (terjadi pada beberapa Android/WebView),
    // jalankan getCurrentPosition paralel untuk memancing inisialisasi sensor GPS
    quickCheckTimer = setTimeout(() => {
      if (sampleCount === 0 && !hasResolved) {
        try {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (hasResolved) return;
              sampleCount++;
              const curAccuracy = pos.coords.accuracy;
              if (!bestPosition || curAccuracy < bestPosition.coords.accuracy) {
                bestPosition = pos;
              }
              if (curAccuracy <= targetAccuracy) {
                finish(pos);
              }
            },
            () => {},
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
          );
        } catch {}
      }
    }, 2500);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          sampleCount++;
          const curAccuracy = pos.coords.accuracy;

          // Evaluasi sampel terbaik: nilai akurasi terkecil (paling presisi dalam meter)
          // Jika nilai akurasi setara (selisih <= 3 meter), utamakan sampel dengan timestamp terbaru
          if (!bestPosition) {
            bestPosition = pos;
          } else if (curAccuracy < bestPosition.coords.accuracy) {
            bestPosition = pos;
          } else if (
            curAccuracy <= bestPosition.coords.accuracy + 3 &&
            pos.timestamp > bestPosition.timestamp
          ) {
            bestPosition = pos;
          }

          if (onProgress) {
            const isGood = curAccuracy <= targetAccuracy;
            onProgress({
              currentAccuracy: curAccuracy,
              bestAccuracy: bestPosition.coords.accuracy,
              sampleCount,
              status: isGood ? 'ready' : 'optimizing_precision',
              message: isGood
                ? `GPS terkunci presisi (Akurasi: ±${Math.round(curAccuracy)}m)`
                : `Menerima sampel #${sampleCount}: Akurasi ±${Math.round(curAccuracy)}m (Mengoptimalkan...)`,
            });
          }

          // Jika akurasi hardware sudah sangat presisi (<= targetAccuracy misal 15m) dan ada konfirmasi konsisten, kunci seketika!
          if (curAccuracy <= targetAccuracy && sampleCount >= 2) {
            finish(bestPosition || pos);
          }
        },
        (err) => {
          // Jika terjadi error sementara namun sudah memiliki sampel valid sebelumnya, gunakan sampel tersebut
          if (bestPosition) {
            finish(bestPosition);
          } else {
            cleanup();
            reject(err);
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: maxWaitMs + 2000,
          maximumAge: 0, // STRICT 0: Jangan gunakan data cache lama, selalu baca sensor fisik terkini
        }
      );
    } catch (e) {
      // Fallback jika watchPosition dibatasi oleh browser
      navigator.geolocation.getCurrentPosition(
        (pos) => finish(pos),
        (err) => reject(err),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    }
  });
};

/**
 * Reverse geocode untuk mendapatkan nama alamat jalan/gedung dari koordinat WGS84
 * - Memprioritaskan endpoint server aplikasi untuk menghindari CORS
 * - Fallback ke BigDataCloud dan Photon OSM
 */
export const reverseGeocode = async (lat: number, lng: number): Promise<string> => {
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return '';

  // 1. Endpoint reverse geocode aplikasi kita (bebas CORS)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`/api/reverse-geocode?lat=${lat}&lng=${lng}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (data.address && !data.address.startsWith('Koordinat GPS:')) {
        return data.address;
      }
    }
  } catch {}

  // 2. Direct BigDataCloud API (gratis, sangat ramah browser client di Indonesia)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=id`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
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
  } catch {}

  // 3. Photon Komoot OSM API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const pRes = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (pRes.ok) {
      const data = await pRes.json();
      const feature = data.features?.[0];
      if (feature && feature.properties) {
        const p = feature.properties;
        const parts = [p.name, p.street, p.district, p.city, p.state].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
      }
    }
  } catch {}

  return '';
};

/**
 * Mengambil lokasi aktual pengguna secara jujur dari sensor hardware GPS
 * - Mengembalikan posisi WGS84, akurasi asli dalam meter, dan kategori akurasi
 * - Tidak pernah mengganti dengan IP-location atau koordinat tiruan jika GPS gagal
 */
export const fetchCurrentLocation = async (
  onProgress?: (progress: GpsSamplingProgress) => void,
  targetAccuracy: number = 15,
  maxWaitMs: number = 9000
): Promise<ResolvedLocation> => {
  let position: GeolocationPosition | null = null;
  let lastError: any = null;

  try {
    position = await getCoordinates(true, maxWaitMs, targetAccuracy, onProgress);
  } catch (err: any) {
    lastError = err;
    // Coba percobaan kedua dengan batas waktu 5 detik
    try {
      position = await getCoordinates(true, 5000, 25, onProgress);
    } catch (fallbackErr: any) {
      lastError = fallbackErr;
    }
  }

  // Jika GPS gagal, lempar error yang jelas dan jujur tanpa memalsukan koordinat
  if (!position) {
    const errDetail = getGpsErrorMessage(lastError);
    const errorToThrow = new Error(errDetail.message);
    (errorToThrow as any).detail = errDetail;
    throw errorToThrow;
  }

  const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;
  const timestamp = position.timestamp || Date.now();

  const evalAcc = evaluateGpsAccuracy(accuracy);
  const rawAddress = (await reverseGeocode(latitude, longitude)) || '';
  const coordStr = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  let address = rawAddress;
  if (!rawAddress || !rawAddress.includes(coordStr)) {
    if (!rawAddress) {
      address = `Area Presensi (Koordinat: ${coordStr})`;
    } else if (rawAddress.startsWith('Koordinat GPS:')) {
      address = `${rawAddress} (${coordStr})`;
    } else {
      address = `${rawAddress} (Koordinat: ${coordStr})`;
    }
  }

  const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`;

  return {
    latitude,
    longitude,
    accuracy: Math.round(accuracy * 10) / 10, // Simpan akurasi asli dalam meter
    altitude: altitude !== null ? Math.round(altitude * 10) / 10 : null,
    altitudeAccuracy: altitudeAccuracy !== null ? Math.round(altitudeAccuracy * 10) / 10 : null,
    heading: heading !== null ? Math.round(heading) : null,
    speed: speed !== null ? Math.round(speed * 10) / 10 : null,
    timestamp,
    accuracyCategory: evalAcc.category,
    accuracyLabel: evalAcc.label,
    accuracyDescription: evalAcc.description,
    accuracyAdvice: evalAcc.advice,
    address,
    mapsUrl,
    osmUrl,
    isRealGps: true,
  };
};

/**
 * Menghitung jarak antara dua koordinat (WGS84) dalam satuan meter menggunakan rumus Haversine
 */
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371e3; // Radius bumi dalam meter
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

export interface LocationSearchResult {
  name: string;
  displayName: string;
  latitude: number;
  longitude: number;
  isCoordinate?: boolean;
  coordinateLabel?: string;
}

/**
 * Pencarian lokasi atau resolusi titik koordinat
 */
export const searchLocationsOrCoordinates = async (
  queryOrCoords: { q?: string; lat?: number; lng?: number; customName?: string }
): Promise<LocationSearchResult[]> => {
  const { q, lat, lng, customName } = queryOrCoords;

  if (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
    const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    let placeName = customName || '';
    let fullAddress = '';

    try {
      fullAddress = await reverseGeocode(lat, lng);
      if (fullAddress && !placeName) {
        placeName = fullAddress.split(',')[0];
      }
    } catch {}

    const title = placeName || `Titik Koordinat (${coordStr})`;
    const subtitle = fullAddress || `Koordinat GPS: ${coordStr}`;

    return [
      {
        name: title,
        displayName: subtitle,
        latitude: lat,
        longitude: lng,
        isCoordinate: true,
        coordinateLabel: coordStr,
      },
    ];
  }

  const query = (q || '').trim();
  if (!query) return [];

  const coordMatch = query.match(/([+-]?\d+(?:\.\d+)?)[,\s]+([+-]?\d+(?:\.\d+)?)/);
  if (coordMatch) {
    const pLat = parseFloat(coordMatch[1]);
    const pLng = parseFloat(coordMatch[2]);
    if (!isNaN(pLat) && !isNaN(pLng) && pLat >= -90 && pLat <= 90 && pLng >= -180 && pLng <= 180) {
      return searchLocationsOrCoordinates({ lat: pLat, lng: pLng, customName });
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`/api/search-location?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.results) && data.results.length > 0) {
        return data.results;
      }
    }
  } catch {}

  const results: LocationSearchResult[] = [];
  const lowerQ = query.toLowerCase();
  if (
    lowerQ.includes('zahra') ||
    lowerQ.includes('aszahra') ||
    lowerQ.includes('rsia') ||
    lowerQ.includes('palembang') ||
    lowerQ.includes('sako') ||
    lowerQ.includes('hasan kasim')
  ) {
    results.push({
      name: 'RS Bersalin Aszahra - Ruang Diklat & Pelatihan',
      displayName: 'RS Bersalin Aszahra, Jalan Brigjen Hasan Kasim, RT.34, Sako, Palembang, Sumatera Selatan 30114',
      latitude: -2.9422709671986396,
      longitude: 104.78431815809301,
      isCoordinate: true,
      coordinateLabel: '-2.942271, 104.784318',
    });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const pRes = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=id`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData?.features && Array.isArray(pData.features)) {
        for (const f of pData.features) {
          const coords = f.geometry?.coordinates;
          const props = f.properties || {};
          if (coords && coords.length >= 2) {
            const pLng = coords[0];
            const pLat = coords[1];
            const pName = props.name || props.street || query;
            const full = [props.name, props.street, props.district, props.city, props.state, props.country]
              .filter(Boolean)
              .join(', ');
            results.push({
              name: pName,
              displayName: full || pName,
              latitude: pLat,
              longitude: pLng,
            });
          }
        }
      }
    }
  } catch {}

  return results;
};
