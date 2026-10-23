import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import confetti from 'canvas-confetti';
import {
  QrCode,
  Camera,
  MapPin,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  User,
  Building,
  CreditCard,
  Upload,
  Zap,
  Info,
  ExternalLink,
  ShieldCheck,
  Compass,
  Download,
  Printer,
  Calendar,
  Clock,
  Sparkles,
  FileEdit,
  Building2,
  HelpCircle,
  Smartphone,
  Laptop,
  X,
} from 'lucide-react';
import {
  fetchCurrentLocation,
  reverseGeocode,
  ResolvedLocation,
  GpsSamplingProgress,
  GpsErrorDetail,
} from '../services/geolocation';
import { GpsLocationVisualizer } from './GpsLocationVisualizer';
import { sound } from '../services/sound';
import {
  saveAttendanceLog,
  getSavedUserProfile,
  saveUserProfile,
  getSavedEvents,
  getSavedAttendanceLogs,
  getSavedLogoConfig,
  defaultLogoConfig,
  getSavedGeofenceConfig,
  defaultGeofenceConfig,
  validateCoordinatesGeofence,
  syncGeofenceFromServer,
  calculateAttendanceKeterangan,
} from '../services/storage';
import {
  verifyDynamicQR,
  getActiveDynamicQRData,
  DynamicQRData,
  DYNAMIC_QR_INTERVAL_SEC,
} from '../services/dynamicQR';
import { AttendanceRecord, EventSession, LogoConfig, GeofenceConfig } from '../types';
import { AttendanceSuccessModal } from './AttendanceSuccessModal';
import { AttendanceDialogModal, AttendanceFormData } from './AttendanceDialogModal';
import { saveAttendanceToCloud } from '../services/firestoreSync';

interface QRScannerViewProps {
  accessToken: string | null;
  onOpenSettings: () => void;
  onRequireAuth: () => void;
}

export const QRScannerView: React.FC<QRScannerViewProps> = ({
  accessToken,
  onOpenSettings,
  onRequireAuth,
}) => {
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(defaultLogoConfig);

  useEffect(() => {
    setLogoConfig(getSavedLogoConfig());
    const handleLogoUpdate = (e: any) => {
      if (e.detail) setLogoConfig(e.detail);
    };
    window.addEventListener('presensi_logo_updated', handleLogoUpdate);
    return () => window.removeEventListener('presensi_logo_updated', handleLogoUpdate);
  }, []);

  // Sub-tabs: 'display_qr' vs 'camera_scan'
  const [activeSubTab, setActiveSubTab] = useState<'display_qr' | 'camera_scan'>('display_qr');

  // Events & QR Code state
  const [eventsList, setEventsList] = useState<EventSession[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [todayAttendeeCount, setTodayAttendeeCount] = useState(0);

  // Dialog box state (Nama, NIK, Unit Kerja)
  const [showAttendanceDialog, setShowAttendanceDialog] = useState(false);
  const [scannedEventTitle, setScannedEventTitle] = useState('');

  // Scanner state (camera)
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const qrRegionId = 'qr-reader-container';

  // Geolocation & Geofence state
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<GpsErrorDetail | null>(null);
  const [samplingProgress, setSamplingProgress] = useState<GpsSamplingProgress | null>(null);
  const [showGpsHelpModal, setShowGpsHelpModal] = useState(false);
  const [helpTab, setHelpTab] = useState<'chrome' | 'iphone' | 'laptop'>('chrome');
  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfig>(defaultGeofenceConfig);

  // Sync and listen to geofence changes
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

  // Submission & Success modal state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [successRecord, setSuccessRecord] = useState<AttendanceRecord | null>(null);
  const [qrAlertModal, setQrAlertModal] = useState<{ title: string; message: string; type: 'error' | 'warning' | 'info' } | null>(null);

  // Load events & synchronize
  useEffect(() => {
    const events = getSavedEvents();
    setEventsList(events);
    const urlEvent = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('event') : null;
    if (urlEvent) {
      setScannedEventTitle(urlEvent);
      const match = events.find((evt) => evt.title.toLowerCase() === urlEvent.toLowerCase());
      if (match) setSelectedEventId(match.id);
    } else if (events.length > 0) {
      setSelectedEventId(events[0].id);
      setScannedEventTitle(events[0].title);
    }

    const handleEventsUpdate = (e: any) => {
      const list: EventSession[] = e.detail || getSavedEvents();
      setEventsList(list);
      const currentUrlEvent = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('event') : null;
      if (currentUrlEvent) {
        setScannedEventTitle(currentUrlEvent);
        const match = list.find((evt) => evt.title.toLowerCase() === currentUrlEvent.toLowerCase());
        if (match) setSelectedEventId(match.id);
        return;
      }
      setSelectedEventId((prev) => {
        if (list.some((evt) => evt.id === prev)) return prev;
        const next = list[0];
        if (next) {
          setScannedEventTitle(next.title);
          return next.id;
        }
        return '';
      });
    };
    window.addEventListener('presensi_events_updated', handleEventsUpdate);
    return () => window.removeEventListener('presensi_events_updated', handleEventsUpdate);
  }, []);

  // Check URL query parameters: if scanned via native phone camera (`?absen=1`), Google Lens, or opened on mobile device
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isMobile =
      typeof navigator !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (
      params.get('absen') === '1' ||
      params.get('scan') === 'true' ||
      params.get('event') ||
      params.get('code') ||
      isMobile
    ) {
      const eventParam = params.get('event');
      if (eventParam) {
        setScannedEventTitle(eventParam);
      }

      // Validasi Anti-Curang: Cek usia token dinamis QR proyektor
      const tParam = params.get('t');
      const tokenParam = params.get('token');
      if (tParam && tokenParam) {
        const verify = verifyDynamicQR(eventParam || 'Diklat', tParam, tokenParam);
        if (verify.isExpired) {
          sound.playErrorBeep();
          setQrAlertModal({
            title: '⛔ QR Code Kadaluwarsa / Foto Terdeteksi',
            message: verify.message,
            type: 'error',
          });
          return;
        }
      }

      // Langsung buka kotak dialog presensi tanpa perlu login
      setShowAttendanceDialog(true);
    }
  }, []);

  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Auto-detect location on view mount
  useEffect(() => {
    detectLocation();
  }, []);

  const detectLocation = async () => {
    setLocationLoading(true);
    setLocationError(null);
    setErrorDetail(null);
    try {
      const loc = await fetchCurrentLocation((prog) => {
        setSamplingProgress(prog);
      });
      setLocation(loc);
    } catch (err: any) {
      setLocationError(err.message || 'Gagal mendeteksi lokasi otomatis.');
      if (err.detail) {
        setErrorDetail(err.detail);
      }
    } finally {
      setLocationLoading(false);
      setSamplingProgress(null);
    }
  };

  const activeEvent = eventsList.find((e) => e.id === selectedEventId) || eventsList[0];

  // Poll server for real-time attendance count (optimized without redundant storage writes)
  useEffect(() => {
    const updateCountFromLogs = () => {
      if (!activeEvent) return;
      const logs = getSavedAttendanceLogs();
      const count = logs.filter((r: AttendanceRecord) => r.eventName === activeEvent.title).length;
      setTodayAttendeeCount(count);
    };

    updateCountFromLogs();

    const fetchServerAttendance = async () => {
      try {
        const res = await fetch('/api/attendance');
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.records && Array.isArray(data.records) && activeEvent) {
            const count = data.records.filter((r: AttendanceRecord) => r.eventName === activeEvent.title).length;
            setTodayAttendeeCount(count);
          }
        }
      } catch {}
    };

    fetchServerAttendance();
    const interval = setInterval(fetchServerAttendance, 4000);

    const handleUpdate = () => {
      updateCountFromLogs();
    };
    window.addEventListener('presensi_attendance_updated', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('presensi_attendance_updated', handleUpdate);
    };
  }, [selectedEventId, activeEvent, successRecord]);

  // Generate QR code data URL (supports cross-network access via Cloud URL / Local Wi-Fi IP)
  const PUBLIC_DEV_URL = 'https://ais-dev-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';
  const PUBLIC_SHARED_URL = 'https://ais-pre-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';

  // Dynamic QR Code for Scanner View (Anti-Fraud rotation)
  const [dynamicQR, setDynamicQR] = useState<DynamicQRData>(() =>
    getActiveDynamicQRData(activeEvent?.title || 'Diklat')
  );

  useEffect(() => {
    const currentTitle = activeEvent?.title || 'Diklat';
    const tick = () => {
      setDynamicQR(getActiveDynamicQRData(currentTitle));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeEvent?.title]);

  useEffect(() => {
    if (!activeEvent) return;

    let baseOrigin = window.location.origin;
    const customHost = localStorage.getItem('presensi_qr_custom_host') || '';

    if (customHost.trim()) {
      baseOrigin = customHost.trim().replace(/\/+$/, '');
    } else if (typeof window !== 'undefined') {
      baseOrigin = window.location.origin;
    }

    const scanUrl = `${baseOrigin}/?absen=1&event=${encodeURIComponent(activeEvent.title)}&t=${dynamicQR.timestamp}&token=${encodeURIComponent(dynamicQR.token)}&code=${dynamicQR.code}`;

    QRCode.toDataURL(scanUrl, {
      width: 800,
      margin: 2,
      color: {
        dark: '#03192f',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        setQrCodeDataUrl(url);
      })
      .catch((err) => {
        console.error('QR code generation error:', err);
      });
  }, [selectedEventId, eventsList, activeEvent, dynamicQR.intervalIndex]);

  // Enumerate cameras
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find((d) => {
            const lbl = (d.label || '').toLowerCase();
            return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment');
          });
          setSelectedCameraId(backCam ? backCam.id : devices[0].id);
        }
      })
      .catch((err) => {
        console.warn('Could not enumerate cameras:', err);
      });

    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (cameraId?: string) => {
    try {
      setCameraError(null);
      const camId = cameraId || selectedCameraId;

      if (scannerRef.current) {
        await stopCamera();
      }

      const html5QrCode = new Html5Qrcode(qrRegionId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const cameraConfig = camId
        ? { deviceId: { exact: camId } }
        : { facingMode: 'environment' };

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        onQrCodeScanned,
        () => {}
      );

      setIsScanning(true);
    } catch (err: any) {
      console.error('Camera start error:', err);
      setCameraError(
        err.message || 'Kamera tidak dapat diakses. Pastikan izin kamera aktif pada browser.'
      );
      setIsScanning(false);
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch (e) {
        console.warn('Stop camera error:', e);
      }
      setIsScanning(false);
    }
  };

  // When QR code is scanned: Play sound & process attendance or open dialog
  const onQrCodeScanned = async (decodedText: string) => {
    sound.playSuccessChime();
    await stopCamera();

    const cleanDecoded = String(decodedText || '').trim();

    // 1. Cek apakah QR yang discan adalah Kartu Peserta (Participant Badge QR JSON)
    if (cleanDecoded.startsWith('{') && cleanDecoded.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanDecoded);
        if (parsed.type === 'PRESENSI_QR_PARTICIPANT' || (parsed.name && (parsed.identityNumber || parsed.department))) {
          // Otomatis catat presensi peserta tersebut seketika!
          const now = new Date();
          const finalDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
          const nowTime = now.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }) + ' WIB';

          await handleSaveAttendance({
            name: String(parsed.name).trim(),
            nik: String(parsed.identityNumber || '-').trim(),
            unitKerja: String(parsed.department || 'Emergency Unit').trim(),
            profesi: String(parsed.profession || 'Perawat').trim(),
            tanggalPelatihan: finalDate,
            jamMasuk: nowTime,
            location: location,
          });
          return;
        } else if (parsed.type === 'PRESENSI_QR_EVENT' || parsed.title) {
          if (parsed.title) {
            setScannedEventTitle(parsed.title);
          }
          setShowAttendanceDialog(true);
          return;
        }
      } catch (e) {
        console.warn('JSON parse error from QR:', e);
      }
    }

    // 2. Parse event title & verifikasi dynamic QR token anti-cheat
    let title = activeEvent?.title || 'Sesi Presensi';
    if (cleanDecoded.includes('event=') || cleanDecoded.includes('token=')) {
      try {
        const url = new URL(cleanDecoded);
        const eventParam = url.searchParams.get('event');
        if (eventParam) title = eventParam;

        const tParam = url.searchParams.get('t');
        const tokenParam = url.searchParams.get('token');
        if (tParam && tokenParam) {
          const verify = verifyDynamicQR(eventParam || 'Diklat', tParam, tokenParam);
          if (verify.isExpired) {
            sound.playErrorBeep();
            setQrAlertModal({
              title: '⛔ QR Code Kadaluwarsa / Foto Terdeteksi',
              message: verify.message,
              type: 'error',
            });
            return;
          }
        }
      } catch {}
    }
    setScannedEventTitle(title);

    // Open Dialog Box
    setShowAttendanceDialog(true);
  };

  // Upload QR from image file
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const html5QrCode = new Html5Qrcode('file-qr-temp', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      const decodedText = await html5QrCode.scanFile(file, true);
      sound.playSuccessChime();
      await onQrCodeScanned(decodedText);
    } catch (err: any) {
      sound.playErrorBeep();
      setQrAlertModal({
        title: 'QR Code Tidak Ditemukan',
        message: 'Tidak menemukan QR Code yang valid pada gambar tersebut. Pastikan gambar tidak buram dan QR Code terlihat jelas.',
        type: 'error',
      });
    }
  };

  // Called when participant clicks "Simpan" in the Dialog Box
  const handleSaveAttendance = async (data: AttendanceFormData) => {
    setIsSubmitting(true);
    setStatusMessage('Menyimpan data presensi...');

    // Location detection
    let finalLocation = data.location || location;
    if (!finalLocation || !finalLocation.latitude) {
      try {
        finalLocation = await fetchCurrentLocation((prog) => setSamplingProgress(prog));
        setLocation(finalLocation);
      } catch (e: any) {
        finalLocation = {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
          address: 'Presensi Diklat (GPS Ponsel Belum Aktif)',
          timestamp: Date.now(),
          accuracyCategory: 'low',
          accuracyLabel: 'Lokasi Manual / Standar',
          accuracyDescription: 'GPS belum terdeteksi',
          mapsUrl: '',
          osmUrl: '',
          isRealGps: true,
        };
      }
    }

    const now = new Date();
    const formattedTimestamp = now.toLocaleString('id-ID', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    let finalTrainingDate = (data.tanggalPelatihan || '').trim();
    if (finalTrainingDate.includes('-')) {
      const parts = finalTrainingDate.split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        finalTrainingDate = `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    } else if (finalTrainingDate.includes(',')) {
      const parts = finalTrainingDate.split(',').map((s) => s.trim());
      if (parts.length === 3) {
        finalTrainingDate = `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
      }
    }
    if (!finalTrainingDate) {
      finalTrainingDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
    }

    const lat = finalLocation?.latitude || 0;
    const lng = finalLocation?.longitude || 0;
    let fullAddress = String(finalLocation?.address || '').trim();

    if (lat !== 0 && lng !== 0) {
      const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      if (!fullAddress || fullAddress === 'Lokasi Terdeteksi Otomatis' || fullAddress.startsWith('Koordinat GPS:')) {
        try {
          const resolved = await reverseGeocode(lat, lng);
          if (resolved && !resolved.includes('°')) {
            fullAddress = `${resolved} (Koordinat: ${coordStr})`;
          } else {
            fullAddress = `Area Presensi (Koordinat: ${coordStr})`;
          }
        } catch {
          fullAddress = `Area Presensi (Koordinat: ${coordStr})`;
        }
      } else if (!fullAddress.includes(coordStr)) {
        fullAddress = `${fullAddress} (Koordinat: ${coordStr})`;
      }
    } else {
      if (!fullAddress || fullAddress === 'Lokasi Terdeteksi Otomatis') {
        fullAddress = 'Presensi Diklat (Koordinat GPS Belum Terdeteksi)';
      }
    }

    // Validasi Geofencing: Otomatis tolak jika di luar toleransi diameter 10 meter (radius 5 meter)
    if (geofenceConfig.enabled && lat !== 0 && lng !== 0) {
      const geoCheck = validateCoordinatesGeofence(
        lat,
        lng,
        geofenceConfig,
        finalLocation?.accuracy || location?.accuracy || 5
      );
      if (!geoCheck.isInRadius && geofenceConfig.enforceStrict) {
        setIsSubmitting(false);
        setStatusMessage(null);
        sound.playErrorBeep();
        const nearestName = geoCheck.nearestLocation?.name || 'RSIA Az Zahra';
        const allowedRadius = geoCheck.nearestLocation?.radiusMeters || 80;
        setQrAlertModal({
          title: 'Presensi Otomatis Ditolak',
          message: `Posisi GPS Anda berada di luar area presensi (${geoCheck.distanceMeters} meter dari titik "${nearestName}").\n\nBatas toleransi radius yang ditentukan adalah ${allowedRadius} meter.\n\nHarap berada di area RSIA Az Zahra untuk dapat melakukan presensi.`,
          type: 'warning',
        });
        return;
      }
    }

    const matchedEvent =
      eventsList.find(
        (e) => (e.title || '').toLowerCase().trim() === (scannedEventTitle || '').toLowerCase().trim()
      ) || activeEvent;
    const targetStartTime = matchedEvent?.startTime || '08:00';
    const evalKeterangan = calculateAttendanceKeterangan(data.jamMasuk, targetStartTime, formattedTimestamp);

    const record: AttendanceRecord = {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: formattedTimestamp,
      name: data.name,
      email: '-',
      identityNumber: data.nik,
      department: data.unitKerja,
      profession: data.profesi,
      trainingDate: finalTrainingDate,
      entryTime: data.jamMasuk,
      targetStartTime,
      keterangan: evalKeterangan.keterangan,
      eventName: scannedEventTitle || activeEvent?.title || 'Sesi Presensi',
      status: evalKeterangan.isLate ? 'Terlambat' : 'Hadir',
      latitude: lat,
      longitude: lng,
      accuracy: finalLocation?.accuracy || 0,
      address: fullAddress,
      mapsUrl: finalLocation?.mapsUrl || (lat !== 0 ? `https://maps.google.com/?q=${lat},${lng}` : ''),
      deviceInfo: `${navigator.platform} - ${navigator.userAgent.includes('Mobile') ? 'Smartphone' : 'Browser'}`,
      syncedToSheets: false,
    };

    // 1. Simpan ke local storage
    saveAttendanceLog(record);

    // 2. Simpan seketika ke Google Cloud Firestore (sehingga web live & admin langsung menerima)
    try {
      await saveAttendanceToCloud(record);
    } catch (cloudErr) {
      console.warn('Direct Firestore cloud save warning:', cloudErr);
    }

    // 3. Post ke backend Express server agar tersimpan di backup server
    try {
      await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
    } catch (serverErr) {
      console.warn('Server sync error:', serverErr);
    }

    // Data tersimpan aman di database presensi dan dapat diekspor langsung ke format Excel (.xlsx)

    setIsSubmitting(false);
    setStatusMessage(null);
    setShowAttendanceDialog(false);

    // Audio chime & confetti celebration
    sound.playSuccessChime();
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    setSuccessRecord(record);
  };

  const handleDownloadQR = () => {
    if (!qrCodeDataUrl || !activeEvent) return;
    const a = document.createElement('a');
    a.href = qrCodeDataUrl;
    a.download = `QR_Presensi_${activeEvent.title.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div id="file-qr-temp" className="hidden"></div>

      {/* Top Banner with Toggle: Tampilkan QR Code vs Kamera Scanner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            {logoConfig.showInScanner && logoConfig.logoUrl && (
              <div className="mb-2">
                <img
                  src={logoConfig.logoUrl}
                  alt={logoConfig.altText || logoConfig.institutionName || 'Logo'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: `${Math.min(logoConfig.height, 44)}px`,
                    objectFit: logoConfig.objectFit,
                  }}
                  className="rounded drop-shadow"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
                <QrCode className="w-6 h-6 text-teal-400" />
                QR Code Presensi Diklat Pelatihan
              </h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                GPS Auto-Lock
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1">
              Saat QR Code di-scan, kotak dialog <strong className="text-white">Nama, NIK, dan Unit Kerja</strong> akan muncul otomatis dan tersimpan aman beserta koordinat lokasi GPS akurat.
            </p>
          </div>

          <div className="w-full sm:w-auto inline-flex p-1 bg-slate-950/90 rounded-xl border border-slate-800 shadow-inner gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('display_qr');
                stopCamera();
              }}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer min-w-0 ${
                activeSubTab === 'display_qr'
                  ? 'bg-teal-500 text-slate-950 shadow-md ring-1 ring-teal-400/50 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <QrCode className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Tampilkan QR Code</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('camera_scan')}
              className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer min-w-0 ${
                activeSubTab === 'camera_scan'
                  ? 'bg-teal-500 text-slate-950 shadow-md ring-1 ring-teal-400/50 font-black'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Buka Kamera Scanner</span>
            </button>
          </div>
        </div>

        {/* Live GPS Location Visualizer with WGS84 Map, Accuracy Radius & Geofence Verification */}
        <div className="mt-5">
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
        </div>
      </div>


      {/* TAB 1: DISPLAY QR CODE PROMINENTLY */}
      {activeSubTab === 'display_qr' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Big Crisp QR Code */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Session & Clock */}
            <div className="relative z-10 w-full mb-5 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="text-left">
                  <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider block">
                    SESI PRESENSI AKTIF
                  </span>
                  <select
                    value={selectedEventId}
                    onChange={(e) => {
                      setSelectedEventId(e.target.value);
                      const evt = eventsList.find((ev) => ev.id === e.target.value);
                      if (evt) setScannedEventTitle(evt.title);
                    }}
                    className="mt-1 bg-slate-950 border border-slate-700 text-teal-300 font-bold rounded-xl px-3 py-1.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 max-w-[260px] truncate"
                  >
                    {eventsList.map((evt) => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="text-right">
                  <div className="text-teal-300 font-mono font-bold text-sm sm:text-base flex items-center justify-end gap-1">
                    <Clock className="w-3.5 h-3.5 text-teal-400" />
                    <span>
                      {currentTime.toLocaleTimeString('id-ID', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      })}{' '}
                      WIB
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {currentTime.toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* THE VISIBLE QR CODE */}
            <div className="relative z-10 p-4 sm:p-5 bg-white rounded-3xl shadow-2xl border-4 border-teal-400/50 transform transition-transform hover:scale-[1.01] flex flex-col items-center justify-center">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt="QR Code Presensi"
                  className="w-[min(74vw,320px)] h-[min(74vw,320px)] sm:w-[min(48vw,380px)] sm:h-[min(48vw,380px)] object-contain rounded-xl transition-all"
                />
              ) : (
                <div className="w-[min(74vw,320px)] h-[min(74vw,320px)] sm:w-[min(48vw,380px)] sm:h-[min(48vw,380px)] flex items-center justify-center bg-slate-100 rounded-xl text-slate-600 font-semibold text-xs">
                  Membuat QR Code...
                </div>
              )}

              <div className="mt-3 flex flex-col items-center justify-center gap-1">
                <span className="text-slate-900 font-black text-xs tracking-wider flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-teal-600" />
                  SCAN DENGAN KAMERA HP ANDA
                </span>
                <span className="text-[10px] text-emerald-800 font-bold bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  OTOMATIS MUNCUL KOTAK DIALOG PRESENSI
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="relative z-10 mt-6 flex items-center justify-center gap-3 text-xs">
              <button
                onClick={handleDownloadQR}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-teal-400" />
                <span>Unduh QR</span>
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Poster</span>
              </button>
            </div>

            <div className="relative z-10 mt-6 w-full pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span>Peserta Hadir Sesi Ini:</span>
              <strong className="text-white text-sm font-bold bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                {todayAttendeeCount} Orang
              </strong>
            </div>
          </div>

          {/* Right Column: Direct Dialog Trigger Card */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl text-white space-y-5">
              <div className="border-b border-slate-800 pb-4">
                <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">
                  ALUR PRESENSI
                </span>
                <h3 className="text-base font-bold text-white mt-0.5 flex items-center gap-2">
                  <FileEdit className="w-4 h-4 text-teal-400" />
                  Kotak Dialog Presensi
                </h3>
                <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                  Saat peserta memindai QR Code di samping, kotak dialog presensi akan muncul dengan isian:
                </p>
              </div>

              {/* Preview of dialog fields */}
              <div className="space-y-2.5 bg-slate-950 p-4 rounded-2xl border border-slate-800/80 text-xs text-slate-300">
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                  <span><strong>Nama :</strong> (Free Teks)</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                  <span><strong>Nomor Induk Karyawan :</strong> (free Teks)</span>
                </div>
                <div className="flex items-start gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0 mt-1"></span>
                  <div className="min-w-0">
                    <strong>Unit Kerja :</strong> Pilihan (Emergency Unit, Outpatient Unit, Inpatient Unit, Delivery Room, NICU, ICU, Operating Theater, Lainnya: Free Teks)
                  </div>
                </div>
                <div className="flex items-start gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0 mt-1"></span>
                  <div className="min-w-0">
                    <strong>Profesi :</strong> (Pilihan : Perawat, Bidan, Lainnya: Free Teks)
                  </div>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                  <span><strong>Tanggal Pelatihan :</strong> Pilih (DD,MM,YYYY)</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                  <span><strong>Jam Masuk :</strong> Otomatis (Sesuai Jam Saat di simpan)</span>
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0"></span>
                  <span><strong>Lokasi :</strong> Otomatis Real Time</span>
                </div>
                <div className="flex items-center gap-2 font-semibold text-emerald-400 pt-2 border-t border-slate-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Semua data di atas tersimpan aman secara real-time dan terverifikasi GPS</span>
                </div>
              </div>

              {/* Button to open dialog directly */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setScannedEventTitle(activeEvent?.title || 'Sesi Presensi');
                    setShowAttendanceDialog(true);
                  }}
                  className="w-full py-4 px-5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-teal-500/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2.5"
                >
                  <FileEdit className="w-5 h-5 text-slate-950" />
                  <span>Buka Kotak Dialog Presensi Sekarang</span>
                </button>
                <p className="text-[11px] text-slate-400 text-center mt-2">
                  Dapat diisi langsung di perangkat ini atau lewat scan QR di smartphone.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: IN-APP CAMERA SCANNER */}
      {activeSubTab === 'camera_scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col items-center">
            <div className="relative w-full max-w-sm aspect-square bg-slate-950 rounded-2xl overflow-hidden border-2 border-dashed border-slate-700 flex flex-col items-center justify-center">
              <div id={qrRegionId} className="w-full h-full"></div>

              {!isScanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-slate-950/90 z-10">
                  <div className="w-16 h-16 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30 flex items-center justify-center">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">Pemindai Kamera Siap</h3>
                    <div className="inline-block my-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                      Scan QR untuk Munculkan Kotak Dialog
                    </div>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      Arahkan kamera ke QR Code. Begitu terdeteksi, kotak dialog Nama, NIK, dan Unit Kerja akan langsung terbuka.
                    </p>
                  </div>
                  <button
                    onClick={() => startCamera()}
                    className="px-6 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm rounded-xl shadow-lg transition-all active:scale-95 flex items-center gap-2"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Aktifkan Kamera</span>
                  </button>
                </div>
              )}

              {isScanning && (
                <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-4 z-20">
                  <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-[11px] text-teal-300 border border-teal-500/30">
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                    <span>Arahkan ke QR Code</span>
                  </div>

                  <div className="w-48 h-48 border-2 border-teal-400 rounded-2xl relative shadow-[0_0_15px_#2dd4bf55]">
                    <div className="w-full h-0.5 bg-teal-400 shadow-[0_0_8px_#2dd4bf] animate-bounce mt-24"></div>
                  </div>

                  <button
                    onClick={stopCamera}
                    className="pointer-events-auto px-4 py-1.5 bg-rose-600/90 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Tutup Scanner
                  </button>
                </div>
              )}
            </div>

            <div className="w-full max-w-sm mt-4 space-y-3">
              {cameras.length > 1 && (
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Pilih Kamera:</span>
                  <select
                    value={selectedCameraId}
                    onChange={(e) => {
                      setSelectedCameraId(e.target.value);
                      if (isScanning) startCamera(e.target.value);
                    }}
                    className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1 text-xs"
                  >
                    {cameras.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label || `Kamera ${c.id.substring(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {cameraError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-lg text-xs">
                  {cameraError}
                </div>
              )}

              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-800 text-xs">
                <label className="flex items-center gap-1.5 text-slate-400 hover:text-teal-300 cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Scan dari File Gambar</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowAttendanceDialog(true)}
                  className="flex items-center gap-1 text-teal-400 hover:text-teal-300 font-semibold"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Buka Dialog Langsung</span>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl text-white space-y-4">
            <h3 className="text-base font-bold flex items-center gap-2 text-white">
              <Info className="w-4 h-4 text-teal-400" />
              Petunjuk Scan
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Setelah QR terdeteksi di kamera ini, kotak dialog presensi akan segera muncul di layar untuk memasukkan Nama, NIK, dan Unit Kerja peserta.
            </p>
          </div>
        </div>
      )}

      {/* THE ATTENDANCE DIALOG MODAL (Nama, NIK, Unit Kerja) */}
      <AttendanceDialogModal
        isOpen={showAttendanceDialog}
        eventName={scannedEventTitle || activeEvent?.title || 'Sesi Presensi'}
        onClose={() => setShowAttendanceDialog(false)}
        onSave={handleSaveAttendance}
        isSubmitting={isSubmitting}
        initialLocation={location}
      />

      {/* Success Modal / Attendance Slip */}
      {successRecord && (
        <AttendanceSuccessModal
          record={successRecord}
          onClose={() => setSuccessRecord(null)}
        />
      )}

      {/* Modal Panduan Mengaktifkan Izin Lokasi GPS */}
      {showGpsHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-lg w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Panduan Mengaktifkan Izin Lokasi (GPS)</h3>
                  <p className="text-xs text-slate-400">Pilih jenis perangkat atau browser yang Anda gunakan:</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGpsHelpModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setHelpTab('chrome')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  helpTab === 'chrome' ? 'bg-teal-500 text-slate-950 shadow font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Android / Chrome</span>
              </button>
              <button
                type="button"
                onClick={() => setHelpTab('iphone')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  helpTab === 'iphone' ? 'bg-teal-500 text-slate-950 shadow font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>iPhone (Safari)</span>
              </button>
              <button
                type="button"
                onClick={() => setHelpTab('laptop')}
                className={`flex-1 py-1.5 px-2 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  helpTab === 'laptop' ? 'bg-teal-500 text-slate-950 shadow font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Komputer / PC</span>
              </button>
            </div>

            {/* Tab Contents */}
            <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800 text-xs space-y-3">
              {helpTab === 'chrome' && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p className="text-slate-200">Perhatikan kolom alamat web di bagian atas layar browser Chrome Anda.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p className="text-slate-200">Ketuk ikon <strong>Gembok 🔒</strong> atau <strong>Setelan Situs ⚙️</strong> di sebelah kiri alamat web.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p className="text-slate-200">Pilih menu <strong>Izin (Permissions)</strong> ➔ Cari baris <strong>Lokasi (Location)</strong> ➔ Ubah menjadi <strong>"Izinkan" (Allow)</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                    <p className="text-slate-200">Segarkan (Refresh / F5) halaman web, lalu klik <strong>Perbarui GPS</strong>.</p>
                  </div>
                </div>
              )}

              {helpTab === 'iphone' && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p className="text-slate-200">Buka menu <strong>Pengaturan (Settings)</strong> iPhone Anda ➔ Gulir ke bawah dan pilih <strong>Safari</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p className="text-slate-200">Gulir ke bawah hingga bagian <em>Pengaturan Situs Web</em> ➔ Ketuk <strong>Lokasi (Location)</strong> ➔ Pilih <strong>"Izinkan" (Allow)</strong> atau <strong>"Minta"</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p className="text-slate-200">Pastikan juga GPS aktif: Buka <strong>Pengaturan ➔ Privasi &amp; Keamanan ➔ Layanan Lokasi (Location Services)</strong> dalam posisi <strong>Aktif (ON)</strong>.</p>
                  </div>
                </div>
              )}

              {helpTab === 'laptop' && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                    <p className="text-slate-200">Klik ikon <strong>Gembok</strong> atau <strong>Ikon Setelan</strong> di sebelah kiri kolom URL browser (http://...).</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                    <p className="text-slate-200">Ubah opsi <strong>Lokasi (Location)</strong> dari "Blokir" menjadi <strong>"Izinkan"</strong>.</p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-300 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                    <p className="text-slate-200">Di Windows: Buka <em>Windows Settings ➔ Privacy &amp; Security ➔ Location</em> dan aktifkan <em>Location Services</em>.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons in Modal */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setShowGpsHelpModal(false);
                  detectLocation();
                }}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Deteksi Ulang GPS Presisi Sekarang</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGpsHelpModal(false)}
                className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Alert / Notification Modal */}
      {qrAlertModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  qrAlertModal.type === 'error'
                    ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                }`}
              >
                {qrAlertModal.type === 'error' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <MapPin className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-white">{qrAlertModal.title}</h3>
                <p className="text-xs sm:text-sm text-slate-300 mt-1.5 whitespace-pre-line leading-relaxed">
                  {qrAlertModal.message}
                </p>
              </div>
            </div>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setQrAlertModal(null)}
                className="w-full sm:w-auto py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-all cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  setQrAlertModal(null);
                  setShowAttendanceDialog(true);
                }}
                className="w-full sm:w-auto py-2 px-5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                Buka Formulir Presensi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
