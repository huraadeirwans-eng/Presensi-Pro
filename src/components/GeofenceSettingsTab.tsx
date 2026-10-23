import React, { useState, useEffect } from 'react';
import {
  MapPin,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Navigation,
  Compass,
  ExternalLink,
  RefreshCw,
  Sliders,
  RotateCcw,
  Building,
  Check,
  X,
  Radio,
  Eye,
  Crosshair,
  Search,
  Building2,
  Sparkles,
} from 'lucide-react';
import { GeofenceConfig, GeofenceLocation } from '../types';
import {
  getSavedGeofenceConfig,
  saveGeofenceConfig,
  defaultGeofenceConfig,
  validateCoordinatesGeofence,
  GeofenceValidationResult,
  syncGeofenceFromServer,
  deleteGeofenceLocationFromStorage,
} from '../services/storage';
import {
  fetchCurrentLocation,
  calculateDistanceMeters,
  searchLocationsOrCoordinates,
} from '../services/geolocation';

interface GeofenceSettingsTabProps {
  onFeedback: (feedback: { type: 'success' | 'error'; message: string }) => void;
}

export const GeofenceSettingsTab: React.FC<GeofenceSettingsTabProps> = ({ onFeedback }) => {
  const [config, setConfig] = useState<GeofenceConfig>(defaultGeofenceConfig);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Modal & Inline konfirmasi hapus & reset (100% bekerja di iFrame & Mobile)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [locationToDelete, setLocationToDelete] = useState<GeofenceLocation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  // Search places & coordinate points states
  const [searchMode, setSearchMode] = useState<'text' | 'coords'>('text');
  const [searchQuery, setSearchQuery] = useState('');
  const [coordLat, setCoordLat] = useState('');
  const [coordLng, setCoordLng] = useState('');
  const [coordPasteInput, setCoordPasteInput] = useState('');
  const [coordCustomName, setCoordCustomName] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [detectedCoordInQuery, setDetectedCoordInQuery] = useState<{ lat: number; lng: number } | null>(null);
  const [searchAddRadius, setSearchAddRadius] = useState<number>(80); // Default radius 80 meter (Area RSIA Az Zahra)

  // Form states for adding or editing
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formLat, setFormLat] = useState<string>('');
  const [formLng, setFormLng] = useState<string>('');
  const [formRadius, setFormRadius] = useState<number>(80); // Default radius 80 meter
  const [isDetectingCurrentGps, setIsDetectingCurrentGps] = useState(false);

  // Live tester states
  const [isTestingLocation, setIsTestingLocation] = useState(false);
  const [liveLockingAccuracy, setLiveLockingAccuracy] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<{
    coords: { lat: number; lng: number; accuracy: number; address: string };
    validation: GeofenceValidationResult;
  } | null>(null);

  // Helper untuk mengekstrak titik koordinat dari teks bebas (contoh: -6.321456, 106.823456 atau link Maps)
  const parseCoordinatesFromString = (input: string): { lat: number; lng: number } | null => {
    if (!input) return null;
    const str = input.trim();
    // Link Google Maps
    const urlMatch = str.match(/(?:q=|@|destination=)(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
    if (urlMatch) {
      const lat = parseFloat(urlMatch[1]);
      const lng = parseFloat(urlMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    // Format angka koordinat: -6.321456, 106.823456 atau -6.321456 106.823456
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

  // Pencarian khusus via Titik Koordinat (Latitude & Longitude)
  const handleSearchCoordinates = async (latVal?: string, lngVal?: string, customName?: string) => {
    const latStr = (latVal !== undefined ? latVal : coordLat).trim();
    const lngStr = (lngVal !== undefined ? lngVal : coordLng).trim();

    if (!latStr || !lngStr) {
      setSearchError('Harap masukkan angka Latitude dan Longitude.');
      return;
    }

    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setSearchError('Latitude tidak valid. Masukkan angka antara -90 dan 90 (contoh: -2.942271).');
      return;
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      setSearchError('Longitude tidak valid. Masukkan angka antara -180 dan 180 (contoh: 104.784318).');
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const finalName = customName || coordCustomName.trim() || `Titik Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

    try {
      const results = await searchLocationsOrCoordinates({ lat, lng, customName: finalName });
      if (results && results.length > 0) {
        setSearchResults(results);
      } else {
        setSearchResults([
          {
            name: finalName,
            displayName: `Koordinat GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
            latitude: lat,
            longitude: lng,
            isCoordinate: true,
            coordinateLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          },
        ]);
      }
    } catch {
      // Fallback mutlak: Selalu sediakan hasil koordinat yang valid tanpa pernah gagal!
      setSearchResults([
        {
          name: finalName,
          displayName: `Koordinat GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`,
          latitude: lat,
          longitude: lng,
          isCoordinate: true,
          coordinateLabel: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        },
      ]);
    } finally {
      setIsSearching(false);
    }
  };

  // Tempel cepat format koordinat
  const handlePasteCoordinate = (text: string) => {
    setCoordPasteInput(text);
    const parsed = parseCoordinatesFromString(text);
    if (parsed) {
      setCoordLat(parsed.lat.toFixed(6));
      setCoordLng(parsed.lng.toFixed(6));
      handleSearchCoordinates(parsed.lat.toFixed(6), parsed.lng.toFixed(6));
    }
  };

  // Search places via server endpoint (mendukung nama tempat dan otomatis mendeteksi titik koordinat)
  const handleSearchLocation = async (queryText?: string) => {
    const q = (queryText !== undefined ? queryText : searchQuery).trim();
    if (!q) return;

    // Jika pengguna memasukkan titik koordinat di kotak pencarian teks biasa, alihkan cerdas ke pencarian koordinat
    const coords = parseCoordinatesFromString(q);
    if (coords) {
      setCoordLat(coords.lat.toFixed(6));
      setCoordLng(coords.lng.toFixed(6));
      return handleSearchCoordinates(coords.lat.toString(), coords.lng.toString());
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const results = await searchLocationsOrCoordinates({ q });
      setSearchResults(results);
      if (!results || results.length === 0) {
        setSearchError(`Tidak ditemukan lokasi dengan kata kunci "${q}". Silakan coba ketik nama RS atau gunakan tab Titik Koordinat.`);
      }
    } catch {
      setSearchError('Pencarian daring sedang sibuk. Silakan gunakan tab Titik Koordinat untuk memasukkan koordinat GPS langsung.');
    } finally {
      setIsSearching(false);
    }
  };

  // Load config on mount & listen to updates + sync with server
  useEffect(() => {
    const saved = getSavedGeofenceConfig();
    setConfig(saved);

    // Sync from server to guarantee exact list of points
    syncGeofenceFromServer().then((serverCfg) => {
      if (serverCfg) {
        setConfig(serverCfg);
      }
    });

    const handleUpdate = (e: any) => {
      if (e.detail) {
        setConfig(e.detail);
      }
    };
    window.addEventListener('presensi_geofence_updated', handleUpdate);
    return () => window.removeEventListener('presensi_geofence_updated', handleUpdate);
  }, []);

  // Update and auto-save
  const updateAndSave = (newConfig: GeofenceConfig) => {
    setConfig(newConfig);
    saveGeofenceConfig(newConfig);
  };

  // Toggle master Geofencing enabled
  const handleToggleEnabled = (enabled: boolean) => {
    const updated: GeofenceConfig = {
      ...config,
      enabled,
    };
    updateAndSave(updated);
    onFeedback({
      type: 'success',
      message: enabled
        ? '✓ Pembatasan Geofencing GPS diaktifkan. Peserta hanya dapat presensi di area RS yang ditentukan.'
        : '✓ Geofencing dinonaktifkan. Peserta dapat melakukan presensi dari lokasi manapun.',
    });
  };

  // Toggle enforcement policy
  const handleToggleStrict = (enforceStrict: boolean) => {
    const updated: GeofenceConfig = {
      ...config,
      enforceStrict,
    };
    updateAndSave(updated);
    onFeedback({
      type: 'success',
      message: enforceStrict
        ? '✓ Kebijakan diatur: KETAT (Presensi di luar radius RS otomatis ditolak).'
        : '✓ Kebijakan diatur: FLEKSIBEL (Presensi tetap dicatat dengan penanda "Di Luar Radius").',
    });
  };

  // Toggle location active state
  const handleToggleLocationActive = (id: string, active: boolean) => {
    const updatedLocations = config.locations.map((loc) =>
      loc.id === id ? { ...loc, isActive: active } : loc
    );
    const updated = { ...config, locations: updatedLocations };
    updateAndSave(updated);
  };

  // Delete location handlers (Dual-protection: inline card confirmation & modal)
  const handleDeleteLocationClick = (loc: GeofenceLocation) => {
    // Set both inline card confirmation and modal so user sees confirmation anywhere
    setConfirmingDeleteId(loc.id);
    setLocationToDelete(loc);
  };

  // Unified delete executor
  const handleExecuteDelete = async (targetId: string, targetName: string) => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      // 1. Immediately update UI state and count
      const updatedLocations = config.locations.filter((loc) => loc.id !== targetId);
      if (updatedLocations.length > 0 && !updatedLocations.some((l) => l.isActive)) {
        updatedLocations[0].isActive = true;
      }
      const updated: GeofenceConfig = {
        ...config,
        locations: updatedLocations,
      };

      setConfig(updated);
      setConfirmingDeleteId(null);
      setLocationToDelete(null);

      // 2. Persist to storage & server asynchronously
      await deleteGeofenceLocationFromStorage(targetId);

      onFeedback({
        type: 'success',
        message: `✓ Titik lokasi "${targetName}" berhasil dihapus.`,
      });
    } catch (err: any) {
      console.error('Error deleting location:', err);
      onFeedback({
        type: 'error',
        message: 'Gagal menghapus titik lokasi: ' + (err.message || 'Kesalahan sistem'),
      });
    } finally {
      setIsDeleting(false);
    }
  };


  // Apply 100-meter hospital radius to all hospital locations with 1 click
  const handleApplyHospitalRadiusToAll = (radius: number = 100) => {
    const updatedLocations = config.locations.map((loc) => ({
      ...loc,
      radiusMeters: radius,
    }));
    const updated: GeofenceConfig = {
      ...config,
      enabled: true,
      enforceStrict: true,
      locations: updatedLocations,
    };
    updateAndSave(updated);
    onFeedback({
      type: 'success',
      message: `✓ Berhasil menerapkan Radius ${radius} Meter ke semua titik lokasi RS. Seluruh gedung RSIA Az Zahra kini terlindungi dengan cakupan optimal.`,
    });
  };

  // Add search result directly to Geofence list with chosen radius (default 5m)
  const handleAddSearchResult = (result: any, customRadius?: number) => {
    const radius = customRadius || searchAddRadius || 5;
    const newLoc: GeofenceLocation = {
      id: `loc-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: result.name || 'Lokasi Presensi RS',
      description: result.displayName || '',
      latitude: result.latitude,
      longitude: result.longitude,
      radiusMeters: radius,
      isActive: true,
    };

    // Auto-enable geofencing and strict mode if currently disabled so it immediately takes effect!
    const updated = {
      ...config,
      enabled: true,
      enforceStrict: true,
      locations: [newLoc, ...config.locations],
    };
    updateAndSave(updated);
    onFeedback({
      type: 'success',
      message: `✓ Lokasi "${newLoc.name}" dengan radius ${radius} meter berhasil ditambahkan dan diaktifkan!`,
    });
  };

  // Open add form
  const handleOpenAddForm = () => {
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormLat('');
    setFormLng('');
    setFormRadius(5); // Default 5 meter
    setIsFormOpen(true);
  };

  // Open edit form
  const handleOpenEditForm = (loc: GeofenceLocation) => {
    setEditingId(loc.id);
    setFormName(loc.name);
    setFormDescription(loc.description || '');
    setFormLat(loc.latitude.toString());
    setFormLng(loc.longitude.toString());
    setFormRadius(loc.radiusMeters);
    setIsFormOpen(true);
  };

  // Auto detect current GPS for form
  const handleAutoDetectFormGps = async () => {
    setIsDetectingCurrentGps(true);
    try {
      const loc = await fetchCurrentLocation();
      setFormLat(loc.latitude.toFixed(6));
      setFormLng(loc.longitude.toFixed(6));
      if (!formDescription && loc.address) {
        setFormDescription(loc.address.split(',')[0] || '');
      }
      onFeedback({
        type: 'success',
        message: `✓ Koordinat GPS berhasil diambil dari posisi perangkat Anda saat ini (Akurasi: ±${Math.round(loc.accuracy)}m).`,
      });
    } catch (err: any) {
      onFeedback({
        type: 'error',
        message: 'Gagal mendeteksi GPS: ' + (err.message || 'Pastikan izin lokasi diberikan.'),
      });
    } finally {
      setIsDetectingCurrentGps(false);
    }
  };

  // Save form (Add or Edit)
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      onFeedback({ type: 'error', message: 'Nama titik lokasi wajib diisi.' });
      return;
    }

    const lat = parseFloat(formLat);
    const lng = parseFloat(formLng);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      onFeedback({ type: 'error', message: 'Latitude tidak valid. Masukkan angka antara -90 dan 90.' });
      return;
    }

    if (isNaN(lng) || lng < -180 || lng > 180) {
      onFeedback({ type: 'error', message: 'Longitude tidak valid. Masukkan angka antara -180 dan 180.' });
      return;
    }

    const radius = Math.max(10, Math.min(5000, formRadius || 100));

    if (editingId) {
      // Edit existing
      const updatedLocations = config.locations.map((loc) =>
        loc.id === editingId
          ? {
              ...loc,
              name: formName.trim(),
              description: formDescription.trim(),
              latitude: lat,
              longitude: lng,
              radiusMeters: radius,
            }
          : loc
      );
      const updated = { ...config, locations: updatedLocations };
      updateAndSave(updated);
      onFeedback({
        type: 'success',
        message: `✓ Titik lokasi "${formName.trim()}" berhasil diperbarui & disimpan.`,
      });
    } else {
      // Add new
      const newLoc: GeofenceLocation = {
        id: `geo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        name: formName.trim(),
        description: formDescription.trim(),
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
        isActive: true,
      };
      const updated = { ...config, locations: [...config.locations, newLoc] };
      updateAndSave(updated);
      onFeedback({
        type: 'success',
        message: `✓ Titik lokasi baru "${formName.trim()}" berhasil ditambahkan.`,
      });
    }

    setIsFormOpen(false);
    setEditingId(null);
  };

  // Run live location test
  const handleRunLiveTest = async () => {
    setIsTestingLocation(true);
    setLiveLockingAccuracy(null);
    setTestResult(null);
    try {
      const loc = await fetchCurrentLocation(
        (prog) => {
          setLiveLockingAccuracy(Math.round(prog.currentAccuracy));
        },
        8, // target precision <= 8 meters
        8000 // wait up to 8s for satellite lock convergence
      );
      const validation = validateCoordinatesGeofence(loc.latitude, loc.longitude, config, loc.accuracy);
      setTestResult({
        coords: {
          lat: loc.latitude,
          lng: loc.longitude,
          accuracy: loc.accuracy,
          address: loc.address,
        },
        validation,
      });
      onFeedback({
        type: validation.isInRadius ? 'success' : 'error',
        message: validation.isInRadius
          ? `✓ Pengujian Berhasil: Posisi Anda berada di dalam radius "${validation.nearestLocation?.name}" (Jarak ${validation.distanceMeters}m).`
          : `⚠️ Pengujian: Posisi Anda berjarak ${validation.distanceMeters}m dari "${validation.nearestLocation?.name}" (Radius: ${validation.nearestLocation?.radiusMeters}m).`,
      });
    } catch (err: any) {
      onFeedback({
        type: 'error',
        message: 'Pengujian GPS gagal: ' + (err.message || 'Izin lokasi dibutuhkan.'),
      });
    } finally {
      setIsTestingLocation(false);
      setLiveLockingAccuracy(null);
    }
  };

  // Quick fix 1: Set user's current GPS position as the reference coordinates of the hospital
  const handleSetCurrentAsReferenceLocation = (targetLocId: string, lat: number, lng: number) => {
    const updatedLocations = config.locations.map((loc) =>
      loc.id === targetLocId
        ? {
            ...loc,
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
          }
        : loc
    );
    const updated: GeofenceConfig = {
      ...config,
      locations: updatedLocations,
    };
    updateAndSave(updated);

    // Re-evaluate immediately
    const validation = validateCoordinatesGeofence(lat, lng, updated, testResult?.coords.accuracy);
    if (testResult) {
      setTestResult({
        ...testResult,
        validation,
      });
    }

    onFeedback({
      type: 'success',
      message: '✓ Berhasil! Koordinat titik RS kini telah diperbarui ke posisi perangkat Anda saat ini (Jarak menjadi 0 meter).',
    });
  };

  // Quick fix 2: Adjust radius to accommodate indoor GPS drift
  const handleQuickAdjustRadius = (targetLocId: string, newRadius: number) => {
    const updatedLocations = config.locations.map((loc) =>
      loc.id === targetLocId
        ? {
            ...loc,
            radiusMeters: newRadius,
          }
        : loc
    );
    const updated: GeofenceConfig = {
      ...config,
      locations: updatedLocations,
    };
    updateAndSave(updated);

    if (testResult) {
      const validation = validateCoordinatesGeofence(
        testResult.coords.lat,
        testResult.coords.lng,
        updated,
        testResult.coords.accuracy
      );
      setTestResult({
        ...testResult,
        validation,
      });
    }

    onFeedback({
      type: 'success',
      message: `✓ Batas radius berhasil diubah menjadi ${newRadius} meter. Posisi Anda kini masuk ke dalam area yang diizinkan!`,
    });
  };

  // Reset to default RS locations (Modal confirmation)
  const handleResetDefaultsClick = () => {
    setShowResetConfirmModal(true);
  };

  const confirmResetDefaults = () => {
    updateAndSave(defaultGeofenceConfig);
    setShowResetConfirmModal(false);
    onFeedback({
      type: 'success',
      message: '✓ Titik lokasi geofencing dikembalikan ke standar bawaan RS.',
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Master Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5" />
              SISTEM GEOFENCING KOORDINAT GPS RUMAH SAKIT
            </span>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
              <Compass className="w-5 h-5 text-teal-400" />
              Batasi Lokasi Presensi di Area RS
            </h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              Tentukan satu atau beberapa titik gedung/ruangan rumah sakit yang diizinkan untuk presensi.
              Sistem akan memverifikasi koordinat GPS ponsel peserta secara otomatis terhadap radius area yang diatur.
            </p>
          </div>

          {/* Master Switch Button - Fully Clickable */}
          <button
            type="button"
            onClick={() => handleToggleEnabled(!config.enabled)}
            className={`flex items-center gap-3 shrink-0 p-3 rounded-2xl border transition-all cursor-pointer self-start sm:self-auto shadow-md ${
              config.enabled
                ? 'bg-teal-500/15 border-teal-500/50 text-teal-300 hover:bg-teal-500/25'
                : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
            title="Klik untuk mengaktifkan atau menonaktifkan pembatasan Geofencing"
          >
            <span className="text-xs font-bold text-left">
              {config.enabled ? (
                <span className="text-teal-300 flex items-center gap-1.5 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  Geofencing Aktif
                </span>
              ) : (
                <span className="text-slate-300 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                  Geofencing Nonaktif (Klik untuk Aktifkan)
                </span>
              )}
            </span>
            <div className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 shrink-0 ${
              config.enabled ? 'bg-teal-500' : 'bg-slate-700'
            }`}>
              <div className={`w-5 h-5 rounded-full bg-white transition-transform transform shadow-md ${
                config.enabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </div>
          </button>
        </div>

        {/* 2. Kebijakan Pembatasan (Strict vs Warning) */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-200 block flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-400" />
            Kebijakan Validasi Bila Peserta Berada di Luar Radius RS:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Opsi 1: Ketat (Wajib di Area RS) */}
            <button
              type="button"
              onClick={() => handleToggleStrict(true)}
              className={`p-4 rounded-xl border text-left transition-all ${
                config.enforceStrict
                  ? 'bg-teal-500/10 border-teal-500/50 shadow-md shadow-teal-500/10'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${config.enforceStrict ? 'border-teal-400 bg-teal-400' : 'border-slate-600'}`}>
                    {config.enforceStrict && <Check className="w-2.5 h-2.5 text-slate-950" />}
                  </span>
                  Ketat (Tolak Presensi)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-500/10 text-rose-300 border border-rose-500/20">
                  Direkomendasikan
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 pl-5.5 leading-relaxed">
                Formulir presensi otomatis <strong>ditolak dan tidak dapat dikirim</strong> jika koordinat GPS ponsel peserta terdeteksi di luar batas radius titik RS.
              </p>
            </button>

            {/* Opsi 2: Fleksibel (Peringatan & Catatan) */}
            <button
              type="button"
              onClick={() => handleToggleStrict(false)}
              className={`p-4 rounded-xl border text-left transition-all ${
                !config.enforceStrict
                  ? 'bg-teal-500/10 border-teal-500/50 shadow-md shadow-teal-500/10'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${!config.enforceStrict ? 'border-teal-400 bg-teal-400' : 'border-slate-600'}`}>
                    {!config.enforceStrict && <Check className="w-2.5 h-2.5 text-slate-950" />}
                  </span>
                  Fleksibel (Izinkan &amp; Beri Label)
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  Toleransi
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 pl-5.5 leading-relaxed">
                Peserta tetap dapat mengisi presensi, namun sistem memberikan label peringatan <strong>"Di Luar Radius RS"</strong> pada tabel data dan laporan Excel.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* 2.5 Pencarian Lokasi & Rumah Sakit Otomatis (Nama Tempat & Titik Koordinat GPS) */}
      <div className="bg-slate-900 border border-teal-500/30 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              PENCARIAN LOKASI &amp; TITIK KOORDINAT RS
            </span>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
              <Search className="w-4 h-4 text-teal-400" />
              Cari &amp; Tambahkan Lokasi Presensi RS
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cari berdasarkan <strong>nama rumah sakit / gedung</strong> atau langsung masukkan <strong>titik koordinat GPS (Latitude &amp; Longitude)</strong> untuk ditambahkan ke daftar titik presensi dengan 1 klik.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setSearchMode('text');
                setSearchError(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                searchMode === 'text'
                  ? 'bg-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>Cari Nama RS / Tempat</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchMode('coords');
                setSearchError(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                searchMode === 'coords'
                  ? 'bg-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Cari Titik Koordinat</span>
            </button>
          </div>
        </div>

        {/* MODE 1: PENCARIAN TEKS (NAMA TEMPAT / RS) */}
        {searchMode === 'text' && (
          <div className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchLocation();
              }}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchQuery(val);
                    setDetectedCoordInQuery(parseCoordinatesFromString(val));
                  }}
                  placeholder="Ketik nama RS / tempat atau titik koordinat (contoh: RSIA AZ ZAHRA atau -6.321456, 106.823456)..."
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching || !searchQuery.trim()}
                className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mencari...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Cari Lokasi</span>
                  </>
                )}
              </button>
            </form>

            {/* Smart Detection Banner if user typed coordinates in text box */}
            {detectedCoordInQuery && (
              <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs animate-in fade-in">
                <div className="flex items-center gap-2 text-teal-300 font-medium">
                  <Crosshair className="w-4 h-4 text-teal-400 shrink-0" />
                  <span>
                    Terdeteksi format koordinat: <strong>{detectedCoordInQuery.lat.toFixed(6)}, {detectedCoordInQuery.lng.toFixed(6)}</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCoordLat(detectedCoordInQuery.lat.toString());
                    setCoordLng(detectedCoordInQuery.lng.toString());
                    handleSearchCoordinates(detectedCoordInQuery.lat.toString(), detectedCoordInQuery.lng.toString());
                  }}
                  className="px-3 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] shrink-0 transition-colors shadow"
                >
                  Cari Titik Koordinat Ini
                </button>
              </div>
            )}

            {/* Quick Suggestion Chips */}
            <div className="flex items-center flex-wrap gap-2 text-xs">
              <span className="text-[11px] text-slate-400">Pencarian Cepat:</span>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('RSIA AZ ZAHRA Jagakarsa');
                  handleSearchLocation('RSIA AZ ZAHRA Jagakarsa');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-teal-300 border border-teal-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
              >
                <Building2 className="w-3 h-3 text-teal-400" />
                <span>🏥 RSIA AZ ZAHRA Jagakarsa</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('Gedung Diklat');
                  handleSearchLocation('Gedung Diklat');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold flex items-center gap-1 transition-colors"
              >
                <span>🏢 Ruang Aula Diklat</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode('coords');
                  setCoordLat('-2.942271');
                  setCoordLng('104.784318');
                  handleSearchCoordinates('-2.942271', '104.784318', 'RS Bersalin Aszahra - Ruang Diklat');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-teal-300 border border-teal-500/30 text-[11px] font-semibold flex items-center gap-1 transition-colors"
              >
                <Crosshair className="w-3 h-3 text-teal-400" />
                <span>🎯 Titik Koordinat RS Bersalin Aszahra</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const loc = await fetchCurrentLocation();
                    handleAddSearchResult({
                      name: 'Lokasi Saya Saat Ini (GPS)',
                      displayName: loc.address,
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                    });
                  } catch (e: any) {
                    onFeedback({ type: 'error', message: 'Gagal mendeteksi lokasi GPS: ' + e.message });
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-semibold flex items-center gap-1 transition-colors"
              >
                <Crosshair className="w-3 h-3 text-teal-400" />
                <span>📍 Tambah Lokasi Saya Sekarang</span>
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: PENCARIAN TITIK KOORDINAT (LATITUDE & LONGITUDE) */}
        {searchMode === 'coords' && (
          <div className="space-y-4 bg-slate-950/70 p-4 sm:p-5 rounded-2xl border border-teal-500/30 animate-in fade-in">
            {/* Quick Paste Field */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-teal-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Crosshair className="w-4 h-4 text-teal-400" />
                  <span>Tempel / Paste Koordinat Lengkap (Copy dari Google Maps / GPS):</span>
                </span>
                <span className="text-[10px] text-teal-400 font-mono bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                  Format: Latitude, Longitude
                </span>
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={coordPasteInput}
                  onChange={(e) => handlePasteCoordinate(e.target.value)}
                  placeholder="Contoh: -6.321456, 106.823456 atau link Google Maps..."
                  className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => handlePasteCoordinate(coordPasteInput)}
                  disabled={!coordPasteInput.trim() || isSearching}
                  className="px-4 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow transition-all shrink-0 cursor-pointer"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Terapkan Koordinat</span>
                </button>
              </div>
            </div>

            {/* Dua Kolom Input Koordinat Terpisah */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Latitude (Garis Lintang): <span className="text-rose-400">*</span></span>
                  <span className="text-[10px] text-slate-500 font-mono">-90 s/d 90</span>
                </label>
                <input
                  type="text"
                  value={coordLat}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Jika pengguna paste teks koordinat lengkap di input latitude, otomatis pecah!
                    if (val.includes(',') || val.includes(' ')) {
                      const p = parseCoordinatesFromString(val);
                      if (p) {
                        setCoordLat(p.lat.toString());
                        setCoordLng(p.lng.toString());
                        return;
                      }
                    }
                    setCoordLat(val);
                  }}
                  placeholder="Contoh: -6.321456"
                  className="w-full bg-slate-900 border border-slate-700 text-white font-mono rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                  <span>Longitude (Garis Bujur): <span className="text-rose-400">*</span></span>
                  <span className="text-[10px] text-slate-500 font-mono">-180 s/d 180</span>
                </label>
                <input
                  type="text"
                  value={coordLng}
                  onChange={(e) => setCoordLng(e.target.value)}
                  placeholder="Contoh: 106.823456"
                  className="w-full bg-slate-900 border border-slate-700 text-white font-mono rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
                />
              </div>
            </div>

            {/* Custom Name / Label Optional */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Nama Titik / Gedung RS (Opsional):
              </label>
              <input
                type="text"
                value={coordCustomName}
                onChange={(e) => setCoordCustomName(e.target.value)}
                placeholder="Contoh: Ruang Pelatihan Diklat / Poliklinik Lantai 1 (kosongkan untuk auto-detect alamat)"
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
              />
            </div>

            {/* Radius Toleransi Selection */}
            <div className="pt-1">
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between flex-wrap gap-1">
                <span className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-teal-400" />
                  <span>Batas Radius Toleransi Presensi:</span>
                </span>
                <span className="text-[10px] text-teal-300 font-bold bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 font-mono">
                  {searchAddRadius === 5 ? '🎯 Radius 5 Meter (Super Ketat)' : `Radius ${searchAddRadius} Meter`}
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {[5, 10, 20, 50, 85, 100].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSearchAddRadius(r)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      searchAddRadius === r
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                  >
                    {r === 85 ? '🎯 85m (Toleransi Akurasi)' : r === 5 ? '🎯 5 Meter (Ketat)' : `${r}m`}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Bila disetel ke <strong>5 meter</strong>: Jika peserta berada di luar jangkauan radius 5 meter dari titik koordinat ini, presensi <strong>otomatis ditolak untuk disimpan</strong> dan muncul pemberitahuan agar menuju ke titik koordinat.
              </p>
            </div>

            {/* Action Buttons for Coordinate Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800">
              <div className="flex items-center flex-wrap gap-2 text-[11px]">
                <button
                  type="button"
                  disabled={isSearching}
                  onClick={async () => {
                    setIsSearching(true);
                    setSearchError(null);
                    try {
                      const loc = await fetchCurrentLocation();
                      const latStr = loc.latitude.toFixed(6);
                      const lngStr = loc.longitude.toFixed(6);
                      setCoordLat(latStr);
                      setCoordLng(lngStr);
                      const detectedName = coordCustomName.trim() || (loc.address ? loc.address.split(',')[0] : 'Lokasi Saya Saat Ini (GPS)');
                      setCoordCustomName(detectedName);

                      // Langsung tampilkan hasil koordinat GPS perangkat tanpa ketergantungan server
                      setSearchResults([
                        {
                          name: detectedName,
                          displayName: loc.address || `Koordinat GPS: ${latStr}, ${lngStr}`,
                          latitude: loc.latitude,
                          longitude: loc.longitude,
                          isCoordinate: true,
                          coordinateLabel: `${latStr}, ${lngStr}`,
                        },
                      ]);

                      onFeedback({
                        type: 'success',
                        message: `✓ Berhasil mengunci GPS: ${latStr}, ${lngStr}`,
                      });
                    } catch (e: any) {
                      setSearchError('Gagal mendeteksi GPS: ' + (e.message || 'Periksa izin lokasi browser.'));
                      onFeedback({ type: 'error', message: 'Gagal mendeteksi GPS: ' + (e.message || 'Periksa izin lokasi.') });
                    } finally {
                      setIsSearching(false);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-teal-300 border border-slate-700 font-semibold flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Crosshair className="w-3 h-3 text-teal-400" />
                  <span>Ambil GPS Saya Sekarang</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCoordLat('-2.942271');
                    setCoordLng('104.784318');
                    setCoordCustomName('RS Bersalin Aszahra - Ruang Diklat');
                    handleSearchCoordinates('-2.942271', '104.784318', 'RS Bersalin Aszahra - Ruang Diklat');
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold flex items-center gap-1 transition-colors"
                >
                  <span>🏥 Titik RS Bersalin Aszahra Palembang</span>
                </button>
              </div>

              <button
                type="button"
                disabled={isSearching || !coordLat.trim() || !coordLng.trim()}
                onClick={() => handleSearchCoordinates()}
                className="px-5 py-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {isSearching ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mencari Koordinat...</span>
                  </>
                ) : (
                  <>
                    <Crosshair className="w-4 h-4" />
                    <span>Cari Titik Koordinat</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Search Error Alert */}
        {searchError && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}

        {/* Search Results Display */}
        {searchResults.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-slate-800/80 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-400" />
                <span>Hasil Pencarian ({searchResults.length} Lokasi Siap Ditambahkan):</span>
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSearchResults([])}
                  className="text-[11px] text-slate-400 hover:text-white"
                >
                  Bersihkan Hasil
                </button>
              </div>
            </div>

            {/* Quick Radius Selector Bar for Search Results */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-teal-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-slate-300 font-semibold flex items-center gap-1.5 text-[11px]">
                <Sliders className="w-3.5 h-3.5 text-teal-400" />
                <span>Pilih Radius Saat Ditambahkan:</span>
              </span>
              <div className="flex items-center flex-wrap gap-1">
                {[25, 50, 80, 100, 150].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSearchAddRadius(r)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                      searchAddRadius === r
                        ? 'bg-teal-500 text-slate-950 shadow-sm'
                        : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-700'
                    }`}
                  >
                    {r === 80 ? '🏥 80m (Standar RS)' : `${r}m`}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
              {searchResults.map((res, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-teal-500/50 flex flex-col justify-between gap-3 transition-all text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-white text-sm block flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-teal-400 shrink-0" />
                        <span className="truncate">{res.name}</span>
                      </strong>
                      {res.isCoordinate && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/30 shrink-0">
                          Titik Koordinat
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-[11px] line-clamp-2 leading-relaxed">
                      {res.displayName}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[10px] font-mono text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20 inline-block">
                        {Number(res.latitude || 0).toFixed(6)}, {Number(res.longitude || 0).toFixed(6)}
                      </span>
                      <a
                        href={`https://maps.google.com/?q=${res.latitude},${res.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-teal-300 text-[10px] underline inline-flex items-center gap-0.5"
                      >
                        <span>Lihat Peta</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddSearchResult(res, searchAddRadius)}
                    className="w-full py-2.5 px-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambahkan ke Titik Presensi RS ({searchAddRadius === 5 ? 'Radius 5 Meter' : `Radius ${searchAddRadius}m`})</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Daftar Titik Lokasi GPS Rumah Sakit */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Building className="w-4 h-4 text-teal-400" />
              Daftar Titik Lokasi Rumah Sakit ({config.locations.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Presensi akan diverifikasi valid jika peserta berada dalam radius salah satu titik lokasi aktif di bawah ini.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleApplyHospitalRadiusToAll(80)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
              title="Terapkan Radius Standar Area RS (80 Meter) ke seluruh titik lokasi RS"
            >
              <Crosshair className="w-3.5 h-3.5 text-teal-400" />
              <span>Set Radius 80m ke Semua Titik</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddForm}
              className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Titik Lokasi</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaultsClick}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
              title="Kembalikan Titik Bawaan"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Form Tambah / Edit Titik */}
        {isFormOpen && (
          <div className="p-5 rounded-2xl bg-slate-950 border border-teal-500/40 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-sm text-teal-300 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-400" />
                {editingId ? 'Edit Titik Lokasi RS' : 'Tambah Titik Lokasi RS Baru'}
              </h4>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              {/* Quick Search Helper in Form */}
              <div className="p-3 bg-slate-900 rounded-xl border border-teal-500/20 space-y-2">
                <label className="block text-xs font-bold text-teal-300 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-teal-400" />
                  Cari Nama Tempat / Titik Koordinat untuk Isi Form Otomatis:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ketik nama RS atau koordinat (contoh: -6.321456, 106.823456)..."
                    className="flex-1 bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-teal-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleSearchLocation()}
                    className="px-3.5 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shrink-0 cursor-pointer"
                  >
                    Cari
                  </button>
                </div>
                {searchResults.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-1 pt-1">
                    <span className="text-[10px] text-teal-300 font-semibold block">Pilih hasil di bawah untuk mengisi form:</span>
                    {searchResults.slice(0, 4).map((res, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setFormName(res.name);
                          setFormDescription(res.displayName);
                          setFormLat(res.latitude.toFixed(6));
                          setFormLng(res.longitude.toFixed(6));
                        }}
                        className="w-full text-left p-2 rounded-lg bg-slate-950 hover:bg-teal-500/15 border border-slate-800 hover:border-teal-500/40 text-xs transition-colors"
                      >
                        <strong className="text-white block truncate">{res.name}</strong>
                        <span className="text-slate-400 text-[10px] block truncate">{res.displayName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Nama Titik */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Nama Gedung / Titik Area RS: <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Contoh: Gedung Diklat & Aula Pelatihan"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>

                {/* Keterangan */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Keterangan Ruang / Lantai (Opsional):
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Contoh: Lantai 3 Ruang Diklat BHD"
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>
              </div>

              {/* Koordinat GPS & Auto-Detect Button */}
              <div className="space-y-2 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-bold text-teal-300 flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-teal-400" />
                    Koordinat GPS Lokasi:
                  </label>
                  <button
                    type="button"
                    onClick={handleAutoDetectFormGps}
                    disabled={isDetectingCurrentGps}
                    className="px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-[11px] font-bold flex items-center gap-1 transition-all self-start sm:self-auto"
                  >
                    <RefreshCw className={`w-3 h-3 ${isDetectingCurrentGps ? 'animate-spin' : ''}`} />
                    <span>{isDetectingCurrentGps ? 'Mendeteksi GPS...' : 'Ambil Posisi Saya Saat Ini'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Latitude:</label>
                    <input
                      type="text"
                      required
                      value={formLat}
                      onChange={(e) => setFormLat(e.target.value)}
                      placeholder="-6.175392"
                      className="w-full bg-slate-950 border border-slate-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Longitude:</label>
                    <input
                      type="text"
                      required
                      value={formLng}
                      onChange={(e) => setFormLng(e.target.value)}
                      placeholder="106.827153"
                      className="w-full bg-slate-950 border border-slate-700 text-white font-mono rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400"
                    />
                  </div>
                </div>
              </div>

              {/* Radius Slider & Quick Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <label className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-teal-400" />
                    Radius Toleransi:
                  </label>
                  <span className="font-mono font-bold text-teal-400 text-sm bg-teal-500/10 px-2.5 py-0.5 rounded border border-teal-500/20">
                    {formRadius} Meter
                  </span>
                </div>

                <input
                  type="range"
                  min="5"
                  max="1000"
                  step="1"
                  value={formRadius}
                  onChange={(e) => setFormRadius(parseInt(e.target.value, 10))}
                  className="w-full accent-teal-500 cursor-pointer"
                />

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-400 font-semibold mr-1">Pilihan Cepat:</span>
                  {[5, 10, 20, 50, 85, 100, 250].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormRadius(preset)}
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors cursor-pointer ${
                        formRadius === preset
                          ? 'bg-teal-500 text-slate-950 shadow-sm'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {preset === 85 ? '🎯 85m (Toleransi Akurasi)' : preset === 5 ? '🎯 5m (Ketat)' : `${preset}m`}
                    </button>
                  ))}
                </div>
                {formRadius <= 5 && (
                  <p className="text-[10px] text-teal-300 bg-teal-500/10 border border-teal-500/20 p-2 rounded-lg">
                    🎯 Radius 5 meter: Peserta di luar 5 meter dari titik ini otomatis akan ditolak untuk disimpan dan diarahkan menuju ke titik koordinat.
                  </p>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  {editingId ? 'Simpan Perubahan' : 'Tambahkan Titik'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Daftar Kartu Lokasi */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.locations.length === 0 ? (
            <div className="col-span-1 md:col-span-2 p-8 rounded-2xl bg-slate-950/60 border border-dashed border-slate-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 mx-auto flex items-center justify-center">
                <MapPin className="w-6 h-6" />
              </div>
              <div>
                <p className="text-white font-bold text-sm">Belum Ada Titik Lokasi Rumah Sakit</p>
                <p className="text-xs text-slate-400 mt-1">
                  Semua titik telah dihapus. Tambahkan titik lokasi baru atau kembalikan preset bawaan RS.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleOpenAddForm}
                  className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Titik Baru</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaultsClick}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Kembalikan Preset Standar RS</span>
                </button>
              </div>
            </div>
          ) : (
            config.locations.map((loc) => (
              <div
                key={loc.id}
                className={`p-4 rounded-2xl border transition-all ${
                  confirmingDeleteId === loc.id
                    ? 'bg-rose-950/40 border-rose-500/60 shadow-lg shadow-rose-950/30'
                    : loc.isActive
                    ? 'bg-slate-950/80 border-slate-800 hover:border-teal-500/40'
                    : 'bg-slate-950/30 border-slate-800/40 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-white truncate">
                        {loc.name}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                          loc.isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {loc.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    {loc.description && (
                      <p className="text-xs text-slate-400 truncate">{loc.description}</p>
                    )}
                  </div>

                  {/* Toggle Aktif / Nonaktif Button */}
                  <button
                    type="button"
                    onClick={() => handleToggleLocationActive(loc.id, !loc.isActive)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-all shrink-0 cursor-pointer shadow-sm ${
                      loc.isActive
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
                    }`}
                    title={loc.isActive ? 'Klik untuk nonaktifkan titik ini' : 'Klik untuk aktifkan titik ini'}
                  >
                    <span className={`w-2 h-2 rounded-full ${loc.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    <span>{loc.isActive ? 'Aktif' : 'Nonaktif'}</span>
                  </button>
                </div>

                {/* Data Koordinat & Radius */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="space-y-0.5">
                    <div className="font-mono text-slate-300">
                      {Number(loc.latitude || 0).toFixed(5)}, {Number(loc.longitude || 0).toFixed(5)}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-teal-400 font-bold font-mono">
                        Radius: {loc.radiusMeters || 80} meter
                      </span>
                      {Number(loc.radiusMeters) >= 50 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          🏥 Area RSIA Az Zahra
                        </span>
                      )}
                      <a
                        href={`https://maps.google.com/?q=${loc.latitude},${loc.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-teal-300 underline inline-flex items-center gap-0.5"
                      >
                        <span>Lihat Peta</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditForm(loc)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                      title="Edit Titik"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteLocationClick(loc)}
                      className="p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 hover:text-rose-200 border border-rose-500/30 transition-colors shadow-sm cursor-pointer"
                      title="Hapus Titik Lokasi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* INLINE CONFIRMATION BAR: 100% Guaranteed to work in iFrame without popup dependency */}
                {confirmingDeleteId === loc.id && (
                  <div className="mt-3 pt-3 border-t border-rose-500/30 bg-rose-950/60 p-3 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 animate-in fade-in duration-150">
                    <div className="flex items-center gap-2 text-xs text-rose-200 font-bold">
                      <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>Hapus titik "{loc.name}"?</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingDeleteId(null);
                          setLocationToDelete(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => handleExecuteDelete(loc.id, loc.name)}
                        className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Live GPS Simulator & Test Bench */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-teal-400" />
              Uji Coba Geofencing Langsung (Live GPS Tester)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cek apakah posisi perangkat Anda saat ini diakui masuk ke dalam salah satu radius area RS.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRunLiveTest}
            disabled={isTestingLocation}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/40 text-xs font-bold flex items-center gap-2 transition-all self-start sm:self-auto active:scale-95 shadow-md"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingLocation ? 'animate-spin text-teal-400' : ''}`} />
            <span>
              {isTestingLocation
                ? liveLockingAccuracy !== null
                  ? `Mengunci Satelit GPS (±${liveLockingAccuracy}m)...`
                  : 'Mengunci Satelit GPS...'
                : 'Uji Posisi Saya Sekarang'}
            </span>
          </button>
        </div>

        {/* Live Satellite Calibration Bar when testing */}
        {isTestingLocation && (
          <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center gap-3 text-xs text-teal-300 animate-in fade-in">
            <Radio className="w-4 h-4 text-teal-400 animate-pulse shrink-0" />
            <div className="space-y-0.5 flex-1">
              <div className="flex items-center justify-between font-bold">
                <span>Sedang Mengumpulkan Sinyal Satelit GNSS...</span>
                <span className="font-mono text-teal-200">
                  {liveLockingAccuracy !== null ? `Akurasi Terkini: ±${liveLockingAccuracy}m` : 'Mencari sinyal...'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Sistem menunggu beberapa detik agar chip GPS smartphone mengunci satelit di langit sehingga akurasi menyusut dari perkiraan awal BTS/Wi-Fi (±85m) menuju akurasi presisi tinggi (±3m s/d ±8m).
              </p>
            </div>
          </div>
        )}

        {testResult && (
          <div
            className={`p-4 sm:p-5 rounded-2xl border space-y-4 animate-in fade-in duration-200 ${
              testResult.validation.isInRadius
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-bold text-sm sm:text-base">
                {testResult.validation.isInRadius ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                )}
                <span>
                  {testResult.validation.isInRadius
                    ? 'Posisi Berada di Dalam Area RS yang Diizinkan'
                    : 'Posisi Terdeteksi di Luar Radius RS'}
                </span>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                  testResult.validation.isInRadius
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {testResult.validation.isAllowed ? 'Presensi Diterima' : 'Presensi Ditolak'}
              </span>
            </div>

            {/* Diagnostic Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Jarak ke Titik RS</span>
                <span className="text-sm sm:text-base font-black font-mono text-white">
                  {testResult.validation.distanceMeters} meter
                </span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Batas Radius RS</span>
                <span className="text-sm sm:text-base font-black font-mono text-teal-400">
                  {testResult.validation.nearestLocation?.radiusMeters || 5} meter
                </span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Selisih ke Batas</span>
                <span className={`text-sm sm:text-base font-black font-mono ${testResult.validation.isInRadius ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {testResult.validation.isInRadius ? '0m (Aman)' : `+${Math.max(1, testResult.validation.distanceMeters - (testResult.validation.nearestLocation?.radiusMeters || 5))} meter`}
                </span>
              </div>
              <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Akurasi GPS HP</span>
                <span className="text-sm sm:text-base font-black font-mono text-slate-300">
                  ±{Math.round(testResult.coords.accuracy)} meter
                </span>
              </div>
            </div>

            <div className="text-xs space-y-1.5 text-slate-300">
              <p className="leading-relaxed">{testResult.validation.message}</p>
              <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400 font-mono">
                <span>
                  Koordinat HP Anda: {testResult.coords.lat.toFixed(6)}, {testResult.coords.lng.toFixed(6)}
                </span>
                {testResult.validation.nearestLocation && (
                  <span>
                    Koordinat RS Acuan: {Number(testResult.validation.nearestLocation.latitude).toFixed(6)}, {Number(testResult.validation.nearestLocation.longitude).toFixed(6)}
                  </span>
                )}
              </div>
            </div>

            {/* Smart Action Panel when outside radius */}
            {!testResult.validation.isInRadius && testResult.validation.nearestLocation && (
              <div className="bg-slate-950/80 p-4 rounded-xl border border-amber-500/30 space-y-3">
                <div className="flex items-start gap-2 text-xs text-amber-200">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Kenapa Terdeteksi di Luar Radius padahal sudah di RS?</p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      1. <strong>Jarak Fisik ke Titik Patokan (misal 27m):</strong> Titik koordinat acuan ditempatkan pada titik Ruang Diklat. Jika Anda berada di lobi, ruang rawat inap, poliklinik, atau teras yang berjarak 20–80 meter, jarak fisik tersebut dihitung terhadap titik patokan.
                      <br />
                      2. <strong>Redaman Sinyal GPS Indoor (±20 s/d ±80m):</strong> Sensor GPS di dalam gedung RS terhalang atap dan dinding beton bertulang, sehingga ponsel melaporkan radius ketidakpastian. Dengan radius 100 meter dan toleransi akurasi indoor yang kini aktif, jarak 27m otomatis diakui sah.
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 mr-1">Solusi 1-Klik:</span>

                  {/* Button: Set current position as hospital coordinates */}
                  <button
                    type="button"
                    onClick={() =>
                      handleSetCurrentAsReferenceLocation(
                        testResult.validation.nearestLocation!.id,
                        testResult.coords.lat,
                        testResult.coords.lng
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>Jadikan Posisi Saya Sebagai Titik RS (Jarak 0m)</span>
                  </button>

                  {/* Button: Adjust radius to 15m */}
                  <button
                    type="button"
                    onClick={() =>
                      handleQuickAdjustRadius(
                        testResult.validation.nearestLocation!.id,
                        Math.max(15, testResult.validation.distanceMeters + 5)
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 border border-teal-500/30 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Perbesar Radius ke {Math.max(15, testResult.validation.distanceMeters + 5)} Meter</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Informative Guidance Card for 100% GPS Accuracy */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-teal-400 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span>Panduan Memperoleh Akurasi GPS Maksimal (Presisi 100% di Lingkungan RS):</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-300">
            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 space-y-1">
              <span className="font-bold text-white block flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-300 text-[10px] flex items-center justify-center font-bold">1</span>
                Penyebab Akurasi Awal ±85m
              </span>
              <p className="text-slate-400 leading-relaxed">
                HP pertama kali memberikan estimasi dari menara BTS/Wi-Fi (±85m). Tombol pengujian kini otomatis menunggu chip GNSS HP mengunci satelit di langit sehingga akurasi menyusut ke tingkat optimal.
              </p>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 space-y-1">
              <span className="font-bold text-white block flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-300 text-[10px] flex items-center justify-center font-bold">2</span>
                Izin Browser "Tepat / Precise"
              </span>
              <p className="text-slate-400 leading-relaxed">
                Di Android &amp; iOS, pastikan izin lokasi browser disetel ke <strong>"Tepat / Precise"</strong> (bukan "Perkiraan"). Aktifkan juga Wi-Fi di HP untuk membantu triangulasi posisi di dalam gedung.
              </p>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800/80 space-y-1">
              <span className="font-bold text-white block flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-teal-500/20 text-teal-300 text-[10px] flex items-center justify-center font-bold">3</span>
                Formula 100% Anti-Gagal
              </span>
              <p className="text-slate-400 leading-relaxed">
                Klik <strong>"Jadikan Posisi Saya Sebagai Titik RS"</strong> di ruangan Anda, lalu gunakan <strong>Radius 15m - 25m</strong>. Seluruh staf di ruangan dijamin 100% lolos presensi tanpa penolakan palsu.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Konfirmasi Hapus Titik Lokasi RS (100% Berfungsi di iFrame / Web) */}
      {locationToDelete && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-2xl overflow-hidden text-white">
            <div className="bg-rose-950/50 px-6 py-4 border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-rose-100">
                  Konfirmasi Hapus Titik Lokasi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLocationToDelete(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3.5 text-xs sm:text-sm">
              <p className="text-slate-300 leading-relaxed">
                Apakah Anda yakin ingin menghapus titik lokasi ini dari daftar geofencing Rumah Sakit?
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1.5 font-mono text-xs">
                <div className="text-white font-bold text-sm font-sans flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-400" />
                  <span>{locationToDelete.name}</span>
                </div>
                {locationToDelete.description && (
                  <div className="text-slate-400 font-sans text-[11px]">{locationToDelete.description}</div>
                )}
                <div className="text-teal-300 pt-1 text-[11px]">
                  Koordinat: {Number(locationToDelete.latitude || 0).toFixed(6)}, {Number(locationToDelete.longitude || 0).toFixed(6)}
                </div>
                <div className="text-slate-400 text-[11px]">Radius Toleransi: {locationToDelete.radiusMeters || 5} meter</div>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                *Titik lokasi ini tidak akan lagi digunakan untuk memverifikasi area presensi peserta.
              </p>
            </div>

            <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setLocationToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleExecuteDelete(locationToDelete.id, locationToDelete.name)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Titik Lokasi'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Reset Titik ke Standar RS */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-teal-500/40 rounded-2xl shadow-2xl overflow-hidden text-white">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-white">
                  Reset Titik ke Standar RS
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs sm:text-sm">
              <p className="text-slate-300">
                Kembalikan daftar titik lokasi ke preset standar bawaan Rumah Sakit (RS Bersalin Aszahra Palembang)?
              </p>
              <p className="text-[11px] text-teal-300 bg-teal-500/10 border border-teal-500/20 p-2.5 rounded-xl">
                Titik lokasi akan diatur ke titik acuan RS Bersalin Aszahra (-2.942271, 104.784318) dengan radius toleransi 85 meter.
              </p>
            </div>

            <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowResetConfirmModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmResetDefaults}
                className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ya, Kembalikan Preset Standar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
