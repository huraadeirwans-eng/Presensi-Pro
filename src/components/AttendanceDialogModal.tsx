import React, { useState, useEffect } from 'react';
import {
  User,
  CreditCard,
  Building2,
  Stethoscope,
  Calendar,
  Clock,
  MapPin,
  RefreshCw,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchCurrentLocation,
  ResolvedLocation,
  GpsSamplingProgress,
  GpsErrorDetail,
} from '../services/geolocation';
import { GpsLocationVisualizer } from './GpsLocationVisualizer';
import {
  getSavedUserProfile,
  saveUserProfile,
  getSavedGeofenceConfig,
  defaultGeofenceConfig,
  validateCoordinatesGeofence,
  GeofenceValidationResult,
  syncGeofenceFromServer,
} from '../services/storage';
import { GeofenceConfig } from '../types';

export const UNIT_KERJA_OPTIONS = [
  'Emergency Unit',
  'Outpatient Unit',
  'Inpatient Unit',
  'Delivery Room',
  'NICU',
  'ICU',
  'Operating Theater',
  'Lainnya',
] as const;

export const PROFESI_OPTIONS = [
  'Perawat',
  'Bidan',
  'Lainnya',
] as const;

export interface AttendanceFormData {
  name: string;
  nik: string;
  unitKerja: string;
  profesi: string;
  tanggalPelatihan: string;
  jamMasuk: string;
  location: ResolvedLocation | null;
}

interface AttendanceDialogModalProps {
  eventName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AttendanceFormData) => Promise<void>;
  isSubmitting: boolean;
  initialLocation?: ResolvedLocation | null;
}

export const AttendanceDialogModal: React.FC<AttendanceDialogModalProps> = ({
  eventName,
  isOpen,
  onClose,
  onSave,
  isSubmitting,
  initialLocation,
}) => {
  // 1. Nama : (Free Teks)
  const [name, setName] = useState('');

  // 2. Nomor Induk Karyawan : (free Teks)
  const [nik, setNik] = useState('');

  // 3. Unit Kerja : Pilihan (Emergency Unit, Outpatient Unit, Inpatient Unit, Delivery Room, NICU, ICU, Operating Theater , Lainnya: Free Teks)
  const [unitKerjaSelect, setUnitKerjaSelect] = useState<string>('Emergency Unit');
  const [unitKerjaLainnya, setUnitKerjaLainnya] = useState('');

  // 4. Profesi : (Pilihan : Perawat, Bidan, Lainnya: Free Teks)
  const [profesiSelect, setProfesiSelect] = useState<string>('Perawat');
  const [profesiLainnya, setProfesiLainnya] = useState('');

  // 5. Tanggal Pelatihan : Pilih (DD,MM,YYYY)
  const [tanggalPelatihan, setTanggalPelatihan] = useState<string>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  // 6. Jam Masuk : Otomatis (Sesuai Jam Saat di simpan)
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // 7. Lokasi : Otomatis Real Time
  const [location, setLocation] = useState<ResolvedLocation | null>(initialLocation || null);
  const [addressInput, setAddressInput] = useState<string>(initialLocation?.address || '');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<GpsErrorDetail | null>(null);
  const [samplingProgress, setSamplingProgress] = useState<GpsSamplingProgress | null>(null);

  // Form error
  const [validationError, setValidationError] = useState<string | null>(null);

  // Geofence states
  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfig>(defaultGeofenceConfig);
  const [geofenceResult, setGeofenceResult] = useState<GeofenceValidationResult | null>(null);

  // Live timer for Jam Masuk Otomatis display
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Load geofence config and listen to updates
  useEffect(() => {
    setGeofenceConfig(getSavedGeofenceConfig());
    syncGeofenceFromServer().then((cfg) => {
      if (cfg) setGeofenceConfig(cfg);
    });

    const handleGeofenceUpdate = (e: any) => {
      if (e.detail) setGeofenceConfig(e.detail);
    };
    window.addEventListener('presensi_geofence_updated', handleGeofenceUpdate);
    return () => window.removeEventListener('presensi_geofence_updated', handleGeofenceUpdate);
  }, []);

  // Sync addressInput whenever location changes and has address
  useEffect(() => {
    if (location && location.address) {
      setAddressInput(location.address);
    }
  }, [location]);

  // Validate coordinates whenever location or geofence config changes
  useEffect(() => {
    if (location && location.latitude && location.longitude) {
      const result = validateCoordinatesGeofence(
        location.latitude,
        location.longitude,
        geofenceConfig,
        location.accuracy || 5
      );
      setGeofenceResult(result);
    } else {
      setGeofenceResult(null);
    }
  }, [location, geofenceConfig]);

  // Load saved profile on open for fast attendance
  useEffect(() => {
    if (isOpen) {
      const saved = getSavedUserProfile();
      if (saved.name) setName(saved.name);
      if (saved.identityNumber) setNik(saved.identityNumber);
      if (saved.department) {
        if (UNIT_KERJA_OPTIONS.includes(saved.department as any)) {
          setUnitKerjaSelect(saved.department);
        } else {
          setUnitKerjaSelect('Lainnya');
          setUnitKerjaLainnya(saved.department);
        }
      }
      if (saved.profession) {
        if (PROFESI_OPTIONS.includes(saved.profession as any)) {
          setProfesiSelect(saved.profession);
        } else {
          setProfesiSelect('Lainnya');
          setProfesiLainnya(saved.profession);
        }
      }

      // Reset date to today on open if not set
      if (!tanggalPelatihan) {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        setTanggalPelatihan(`${y}-${m}-${d}`);
      }

      // Auto-detect or refresh location
      detectLocation();
    }
  }, [isOpen]);

  const detectLocation = async (): Promise<ResolvedLocation | null> => {
    setLocationLoading(true);
    setLocationError(null);
    setErrorDetail(null);
    try {
      const loc = await fetchCurrentLocation((prog) => {
        setSamplingProgress(prog);
      });
      setLocation(loc);
      if (loc.address) {
        setAddressInput(loc.address);
      }
      return loc;
    } catch (err: any) {
      const msg = err.message || 'Gagal mendeteksi lokasi GPS otomatis.';
      setLocationError(msg);
      if (err.detail) {
        setErrorDetail(err.detail);
      }
      return null;
    } finally {
      setLocationLoading(false);
      setSamplingProgress(null);
    }
  };

  if (!isOpen) return null;

  // Format YYYY-MM-DD to DD/MM/YYYY string
  const formatDMY = (dateStr: string): string => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
    }
    return dateStr;
  };

  // Human-readable DD/MM/YYYY formatted label
  const getFormattedDateLabel = (dateStr: string): string => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      if (!isNaN(d.getTime())) {
        return `${parts[2]}/${parts[1]}/${parts[0]} (${d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })})`;
      }
    }
    return dateStr;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    // 1. Validasi Nama
    if (!name.trim()) {
      setValidationError('Nama wajib diisi.');
      return;
    }

    // 2. Validasi NIK
    if (!nik.trim()) {
      setValidationError('Nomor Induk Karyawan wajib diisi.');
      return;
    }

    // 3. Validasi Unit Kerja
    let finalUnitKerja = unitKerjaSelect;
    if (unitKerjaSelect === 'Lainnya') {
      if (!unitKerjaLainnya.trim()) {
        setValidationError('Silakan sebutkan Unit Kerja Anda pada isian Lainnya.');
        return;
      }
      finalUnitKerja = unitKerjaLainnya.trim();
    }

    // 4. Validasi Profesi
    let finalProfesi = profesiSelect;
    if (profesiSelect === 'Lainnya') {
      if (!profesiLainnya.trim()) {
        setValidationError('Silakan sebutkan Profesi Anda pada isian Lainnya.');
        return;
      }
      finalProfesi = profesiLainnya.trim();
    }

    // 5. Validasi Tanggal Pelatihan
    if (!tanggalPelatihan) {
      setValidationError('Tanggal Pelatihan wajib dipilih.');
      return;
    }
    const finalTanggalPelatihan = formatDMY(tanggalPelatihan);

    // 6. Jam Masuk : Otomatis (Sesuai Jam Saat di simpan)
    const lockTime = new Date();
    const finalJamMasuk = lockTime.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }) + ' WIB';

    // 7. Lokasi : Otomatis Real Time Sensor GPS
    let curLocation = location;
    if (!curLocation || !curLocation.latitude || curLocation.latitude === 0) {
      try {
        curLocation = await detectLocation();
      } catch {}
    }

    if (!curLocation || !curLocation.latitude || curLocation.latitude === 0) {
      // Fallback: gunakan informasi lokasi agar presensi tetap tersimpan aman
      curLocation = {
        latitude: 0,
        longitude: 0,
        accuracy: 0,
        address: (addressInput || '').trim() || 'Presensi Diklat (GPS Ponsel Belum Aktif)',
        timestamp: Date.now(),
        accuracyCategory: 'low',
        accuracyLabel: 'Lokasi Manual / Standar',
        accuracyDescription: 'GPS belum terdeteksi',
        mapsUrl: '',
        osmUrl: '',
        isRealGps: true,
      };
    }

    // Validasi Geofencing jika diaktifkan oleh admin RS
    if (geofenceConfig.enabled && curLocation && curLocation.latitude !== 0) {
      const geoCheck = validateCoordinatesGeofence(
        curLocation.latitude,
        curLocation.longitude,
        geofenceConfig,
        curLocation.accuracy || 5
      );
      if (!geoCheck.isInRadius && geofenceConfig.enforceStrict) {
        const nearestName = geoCheck.nearestLocation?.name || 'RSIA Az Zahra';
        const allowedRadius = geoCheck.nearestLocation?.radiusMeters || 100;
        setValidationError(
          `⛔ Presensi Ditolak: Anda berada di luar area presensi (${geoCheck.distanceMeters} meter dari titik "${nearestName}"). Batas radius lokasi yang diizinkan adalah ${allowedRadius} meter. Harap berada di area RSIA Az Zahra untuk dapat melakukan presensi.`
        );
        return;
      }
    }

    // Siapkan alamat akhir: gabungan nama alamat & koordinat
    let finalAddress = (addressInput || '').trim() || (curLocation?.address || '');
    if (curLocation && curLocation.latitude !== 0 && curLocation.longitude !== 0) {
      const coordStr = `${Number(curLocation.latitude).toFixed(6)}, ${Number(curLocation.longitude).toFixed(6)}`;
      const lower = finalAddress.toLowerCase();
      if (!finalAddress || lower.includes('lokasi terdeteksi otomatis')) {
        finalAddress = `Area Presensi (Koordinat: ${coordStr})`;
      } else if (!finalAddress.includes(coordStr)) {
        finalAddress = `${finalAddress} (Koordinat: ${coordStr})`;
      }
    }

    // Simpan profil untuk autofill presensi berikutnya
    saveUserProfile({
      name: name.trim(),
      identityNumber: nik.trim(),
      department: finalUnitKerja,
      profession: finalProfesi,
      email: '',
    });

    const finalLocationObject: ResolvedLocation | null = curLocation
      ? {
          ...curLocation,
          address: finalAddress || curLocation.address,
        }
      : finalAddress
      ? {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          timestamp: Date.now(),
          accuracyCategory: 'low',
          accuracyLabel: 'Lokasi Belum Terkunci',
          accuracyDescription: 'Sensor GPS belum mengunci koordinat fisik.',
          address: finalAddress,
          mapsUrl: '',
          osmUrl: '',
          isRealGps: true,
        }
      : null;

    await onSave({
      name: name.trim(),
      nik: nik.trim(),
      unitKerja: finalUnitKerja,
      profesi: finalProfesi,
      tanggalPelatihan: finalTanggalPelatihan,
      jamMasuk: finalJamMasuk,
      location: finalLocationObject,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[94vh]">
        {/* Header Dialog */}
        <div className="bg-gradient-to-r from-teal-600 to-emerald-600 px-5 sm:px-6 py-4 flex items-center justify-between text-white shadow-md shrink-0">
          <div>
            <span className="text-[10px] uppercase font-extrabold tracking-wider bg-black/20 px-2 py-0.5 rounded text-teal-100">
              PRESENSI DIKLAT PELATIHAN
            </span>
            <h3 className="font-extrabold text-base sm:text-lg tracking-tight mt-0.5">
              Kotak Dialog Absensi Peserta
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
          {/* Sesi Diklat / Judul Pelatihan Info */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs text-slate-300">
            <div className="min-w-0 pr-2">
              <span className="text-slate-400 block text-[10px]">Materi / Judul Diklat Pelatihan:</span>
              <strong className="text-white font-semibold text-xs sm:text-sm truncate block">{eventName}</strong>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold shrink-0">
              GPS Real Time
            </span>
          </div>

          {validationError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* 1. NAMA : (Free Teks) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-400" />
                <span>Nama :</span>
                <span className="text-rose-400 font-bold">*</span>
              </span>
              <span className="text-[10px] text-teal-300 font-semibold">(Free Teks)</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ketik Nama Lengkap Anda (Free Teks)"
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all placeholder:text-slate-500"
            />
          </div>

          {/* 2. NOMOR INDUK KARYAWAN : (free Teks) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                <span>Nomor Induk Karyawan :</span>
                <span className="text-rose-400 font-bold">*</span>
              </span>
              <span className="text-[10px] text-teal-300 font-semibold">(free Teks)</span>
            </label>
            <input
              type="text"
              required
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              placeholder="Ketik Nomor Induk Karyawan (free Teks)"
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all placeholder:text-slate-500 font-mono"
            />
          </div>

          {/* 3. UNIT KERJA : Pilihan (Emergency Unit, Outpatient Unit, Inpatient Unit, Delivery Room, NICU, ICU, Operating Theater , Lainnya: Free Teks) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Unit Kerja :</span>
                <span className="text-rose-400 font-bold">*</span>
              </span>
              <span className="text-[10px] text-teal-300 font-medium">
                Pilihan (7 Unit + Lainnya: Free Teks)
              </span>
            </label>
            <select
              value={unitKerjaSelect}
              onChange={(e) => setUnitKerjaSelect(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all"
            >
              <option value="Emergency Unit">Emergency Unit</option>
              <option value="Outpatient Unit">Outpatient Unit</option>
              <option value="Inpatient Unit">Inpatient Unit</option>
              <option value="Delivery Room">Delivery Room</option>
              <option value="NICU">NICU</option>
              <option value="ICU">ICU</option>
              <option value="Operating Theater">Operating Theater</option>
              <option value="Lainnya">Lainnya: Free Teks</option>
            </select>
          </div>

          {/* If Unit Kerja 'Lainnya' selected -> Free Teks input */}
          {unitKerjaSelect === 'Lainnya' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-150 pl-3 border-l-2 border-teal-400 space-y-1">
              <label className="block text-xs font-semibold text-teal-300">
                Unit Kerja Lainnya: <span className="text-rose-400">*</span> <span className="text-[10px] text-slate-400">(Free Teks)</span>
              </label>
              <input
                type="text"
                required
                value={unitKerjaLainnya}
                onChange={(e) => setUnitKerjaLainnya(e.target.value)}
                placeholder="Ketik nama unit kerja Anda (Free Teks)"
                className="w-full bg-slate-950 border border-teal-500/50 text-slate-100 rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
              />
            </div>
          )}

          {/* 4. PROFESI : (Pilihan : Perawat, Bidan, Lainnya: Free Teks) */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-teal-400" />
                <span>Profesi :</span>
                <span className="text-rose-400 font-bold">*</span>
              </span>
              <span className="text-[10px] text-teal-300 font-medium">
                Pilihan (Perawat, Bidan, Lainnya: Free Teks)
              </span>
            </label>
            <select
              value={profesiSelect}
              onChange={(e) => setProfesiSelect(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all"
            >
              <option value="Perawat">Perawat</option>
              <option value="Bidan">Bidan</option>
              <option value="Lainnya">Lainnya: Free Teks</option>
            </select>
          </div>

          {/* If Profesi 'Lainnya' selected -> Free Teks input */}
          {profesiSelect === 'Lainnya' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-150 pl-3 border-l-2 border-teal-400 space-y-1">
              <label className="block text-xs font-semibold text-teal-300">
                Profesi Lainnya: <span className="text-rose-400">*</span> <span className="text-[10px] text-slate-400">(Free Teks)</span>
              </label>
              <input
                type="text"
                required
                value={profesiLainnya}
                onChange={(e) => setProfesiLainnya(e.target.value)}
                placeholder="Ketik profesi Anda (Free Teks)"
                className="w-full bg-slate-950 border border-teal-500/50 text-slate-100 rounded-xl px-3.5 py-2 text-xs sm:text-sm focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
              />
            </div>
          )}

          {/* 5. TANGGAL */}
          <div>
            <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center justify-between flex-wrap gap-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>Tanggal :</span>
                <span className="text-rose-400 font-bold">*</span>
              </span>
              <span className="text-[10px] text-teal-300 font-mono font-semibold bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                Tanggal
              </span>
            </label>
            <input
              type="date"
              required
              value={tanggalPelatihan}
              onChange={(e) => setTanggalPelatihan(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all font-mono"
            />
            {tanggalPelatihan && (
              <div className="flex items-center justify-between text-[11px] text-teal-300 mt-1.5 px-1 font-medium">
                <span>Tanggal: <strong className="font-mono font-bold text-white bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">{formatDMY(tanggalPelatihan)}</strong></span>
                <span className="text-slate-400">{getFormattedDateLabel(tanggalPelatihan)}</span>
              </div>
            )}
          </div>

          {/* 6. JAM MASUK : Otomatis (Sesuai Jam Saat di simpan) */}
          <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs flex-wrap gap-1">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>Jam Masuk :</span>
              </span>
              <span className="text-[10px] text-emerald-300 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                Otomatis (Sesuai Jam Saat di simpan)
              </span>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="font-mono text-base sm:text-lg font-black text-teal-300 flex items-center gap-2">
                <span>
                  {currentTime.toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </span>
                <span className="text-xs text-slate-400 font-sans font-semibold">WIB</span>
              </div>
              <span className="text-[10px] text-slate-400 text-right">
                *Otomatis dicatat saat tombol Simpan ditekan
              </span>
            </div>
          </div>

          {/* 7. LOKASI : Otomatis Real Time Sensor GPS */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-teal-400" />
              <span>Lokasi &amp; Peta GPS Aktual (WGS84)</span>
            </label>

            {/* Visualizer Komprehensif: Akurasi Asli, Peta WGS84, Status Geofence */}
            <GpsLocationVisualizer
              location={location}
              loading={locationLoading}
              error={locationError}
              errorDetail={errorDetail}
              samplingProgress={samplingProgress}
              geofenceConfig={geofenceConfig}
              onRefreshGps={detectLocation}
              showMapDefault={true}
            />

            {/* Input Nama Alamat Terdeteksi Otomatis */}
            <div className="pt-1">
              <label className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-1">
                Catatan Alamat / Gedung:
              </label>
              <textarea
                rows={2}
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Alamat terdeteksi otomatis dari GPS..."
                className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400 leading-relaxed font-sans placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-[11px] text-teal-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
            <span>Data presensi Anda terverifikasi GPS dan tersimpan aman secara real-time.</span>
          </div>

          {/* Dialog Action Buttons */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs shadow-lg shadow-teal-500/20 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Presensi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
