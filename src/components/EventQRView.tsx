import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Calendar,
  Clock,
  Maximize2,
  Minimize2,
  Download,
  Printer,
  Users,
  Building,
  CheckCircle2,
  QrCode as QrIcon,
  Sparkles,
  MapPin,
  Wifi,
  WifiOff,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Building2,
  X,
  Compass,
  Globe,
  Copy,
  Check,
  Smartphone,
  Share2,
  Search,
  ChevronDown,
  BookOpen,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  RotateCcw,
  Tv,
  HelpCircle,
} from 'lucide-react';
import { EventSession, LogoConfig, GeofenceConfig } from '../types';
import {
  getSavedEvents,
  saveEvents,
  syncEventsFromServer,
  getSavedAttendanceLogs,
  saveAttendanceLog,
  getSavedLogoConfig,
  defaultLogoConfig,
  getSavedGeofenceConfig,
  defaultGeofenceConfig,
  syncGeofenceFromServer,
} from '../services/storage';
import { fetchCurrentLocation } from '../services/geolocation';
import {
  getActiveDynamicQRData,
  DynamicQRData,
  DYNAMIC_QR_INTERVAL_SEC,
} from '../services/dynamicQR';

interface EventQRViewProps {
  accessToken?: string | null;
  onOpenSettings?: () => void;
}

export const PUBLIC_SHARED_URL = 'https://ais-pre-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';
export const PUBLIC_DEV_URL = 'https://ais-dev-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';

export const EventQRView: React.FC<EventQRViewProps> = ({
  accessToken,
  onOpenSettings,
}) => {
  const [events, setEvents] = useState<EventSession[]>([]);
  const [activeEventId, setActiveEventId] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(defaultLogoConfig);

  // Geofence & Venue Location for Projector Screen
  const [geofenceConfig, setGeofenceConfig] = useState<GeofenceConfig>(defaultGeofenceConfig);
  const [currentVenueLocation, setCurrentVenueLocation] = useState<string>('RSIA AZ ZAHRA - Ruang Diklat Pelatihan');
  const [venueCoordinates, setVenueCoordinates] = useState<string>('');
  const [latestAttendee, setLatestAttendee] = useState<any | null>(null);

  // Network & Host URL for Mobile Phones
  const [networkIps, setNetworkIps] = useState<string[]>([]);
  const [publicCloudUrl, setPublicCloudUrl] = useState<string>(PUBLIC_DEV_URL);
  const [sharedAppUrl, setSharedAppUrl] = useState<string>(PUBLIC_SHARED_URL);
  const [devAppUrl, setDevAppUrl] = useState<string>(PUBLIC_DEV_URL);
  const [isSharedActive, setIsSharedActive] = useState<boolean>(false);
  const [customHost, setCustomHost] = useState<string>(() => {
    try {
      return localStorage.getItem('presensi_qr_custom_host') || '';
    } catch {
      return '';
    }
  });
  const [showNetworkModal, setShowNetworkModal] = useState(false);
  const [tempCustomHost, setTempCustomHost] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Mode URL QR Code: 'public' (Beda Jaringan: 4G/5G/Internet Bebas tanpa Wi-Fi laptop) vs 'local' (Wi-Fi 1 Jaringan)
  const [qrUrlMode, setQrUrlMode] = useState<'public' | 'local'>(() => {
    try {
      const saved = localStorage.getItem('presensi_qr_url_mode');
      return saved === 'local' ? 'local' : 'public';
    } catch {
      return 'public';
    }
  });

  // Dynamic QR Sizing: 'auto' | 'compact' | 'medium' | 'large' | 'huge'
  const [qrSizeMode, setQrSizeMode] = useState<'auto' | 'compact' | 'medium' | 'large' | 'huge'>(() => {
    try {
      const saved = localStorage.getItem('presensi_qr_size_mode');
      if (saved && ['auto', 'compact', 'medium', 'large', 'huge'].includes(saved)) {
        return saved as any;
      }
      return 'auto';
    } catch {
      return 'auto';
    }
  });

  const [zoomPercent, setZoomPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('presensi_qr_zoom_percent');
      return saved ? Math.min(Math.max(parseInt(saved, 10), 60), 220) : 100;
    } catch {
      return 100;
    }
  });

  const [isQrSizeMenuOpen, setIsQrSizeMenuOpen] = useState(false);
  const qrSizeMenuRef = useRef<HTMLDivElement>(null);

  // Monitor Window Resize for Dynamic Viewport Fitting
  const [windowDimensions, setWindowDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen to fullscreen changes (e.g. if user presses Esc or F11)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Close QR Size menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (qrSizeMenuRef.current && !qrSizeMenuRef.current.contains(e.target as Node)) {
        setIsQrSizeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSetQrSizeMode = (mode: 'auto' | 'compact' | 'medium' | 'large' | 'huge') => {
    setQrSizeMode(mode);
    try {
      localStorage.setItem('presensi_qr_size_mode', mode);
    } catch {}
  };

  const handleAdjustZoom = (delta: number) => {
    setZoomPercent((prev) => {
      const next = Math.min(Math.max(prev + delta, 60), 220);
      try {
        localStorage.setItem('presensi_qr_zoom_percent', next.toString());
      } catch {}
      return next;
    });
  };

  const handleResetZoom = () => {
    setZoomPercent(100);
    setQrSizeMode('auto');
    try {
      localStorage.setItem('presensi_qr_zoom_percent', '100');
      localStorage.setItem('presensi_qr_size_mode', 'auto');
    } catch {}
  };

  // Compute actual QR pixel size dynamically
  const computedQrSize = React.useMemo(() => {
    const scale = zoomPercent / 100;
    const { width: winW, height: winH } = windowDimensions;

    if (qrSizeMode === 'compact') {
      return Math.round(220 * scale);
    }
    if (qrSizeMode === 'medium') {
      return Math.round(310 * scale);
    }
    if (qrSizeMode === 'large') {
      return Math.round(420 * scale);
    }
    if (qrSizeMode === 'huge') {
      return Math.round(540 * scale);
    }

    // MODE 'auto': Dinamis Cerdas Menyesuaikan Layar Proyektor & Monitor
    if (isFullscreen) {
      // In fullscreen, utilize optimal height & width of proyektor screen
      const byHeight = (winH - 190) * 0.68;
      const byWidth = winW * 0.58;
      const rawAuto = Math.min(byHeight, byWidth);
      return Math.round(Math.max(260, Math.min(rawAuto, 650)) * scale);
    }

    // In normal kiosk mode
    const byHeight = (winH - 260) * 0.54;
    const byWidth = winW * 0.44;
    const rawAuto = Math.min(byHeight, byWidth);
    return Math.round(Math.max(210, Math.min(rawAuto, 440)) * scale);
  }, [qrSizeMode, zoomPercent, windowDimensions, isFullscreen]);

  // Fetch local server IPs & public cloud URLs
  useEffect(() => {
    fetch('/api/network-info')
      .then((res) => (res.ok ? res.json().catch(() => null) : null))
      .then((data) => {
        if (!data) return;
        if (data.ips && Array.isArray(data.ips)) {
          setNetworkIps(data.ips);
        }
        if (data.publicUrl) {
          setPublicCloudUrl(data.publicUrl);
        }
        if (data.sharedAppUrl) {
          setSharedAppUrl(data.sharedAppUrl);
        }
        if (data.devAppUrl) {
          setDevAppUrl(data.devAppUrl);
        }
        if (typeof data.isSharedActive === 'boolean') {
          setIsSharedActive(data.isSharedActive);
        }
        if (data.customPublicHost && !customHost) {
          setCustomHost(data.customPublicHost);
        }
        if (data.preferredAccessMode && !localStorage.getItem('presensi_qr_url_mode')) {
          setQrUrlMode(data.preferredAccessMode === 'local' ? 'local' : 'public');
        }
      })
      .catch(() => {});
  }, []);

  const handleSelectQrMode = (mode: 'public' | 'local', hostOverride?: string) => {
    setQrUrlMode(mode);
    try {
      localStorage.setItem('presensi_qr_url_mode', mode);
      if (hostOverride !== undefined) {
        setCustomHost(hostOverride);
        if (hostOverride) {
          localStorage.setItem('presensi_qr_custom_host', hostOverride);
        } else {
          localStorage.removeItem('presensi_qr_custom_host');
        }
      }
    } catch {}

    fetch('/api/network-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredAccessMode: mode }),
    }).catch(() => {});
  };

  const getBaseOrigin = () => {
    if (customHost.trim()) {
      return customHost.trim().replace(/\/+$/, '');
    }

    // Jika admin memilih mode Wi-Fi Lokal secara eksplisit (harus 1 jaringan Wi-Fi sama dengan laptop)
    if (qrUrlMode === 'local') {
      if (networkIps.length > 0) {
        return `http://${networkIps[0]}:3000`;
      }
      return typeof window !== 'undefined' ? window.location.origin : PUBLIC_DEV_URL;
    }

    // Mode Default: 'public'
    // 1. Selalu utamakan origin browser saat ini jika dibuka lewat HTTPS
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return window.location.origin;
    }

    // 2. Gunakan URL terverifikasi dari server (atau devAppUrl yang live)
    if (isSharedActive && sharedAppUrl) {
      return sharedAppUrl;
    }

    return devAppUrl || publicCloudUrl || PUBLIC_DEV_URL;
  };

  // Connection Online/Offline Status
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Venue state & Real-Time Sync
  const [isRefreshingVenueLocation, setIsRefreshingVenueLocation] = useState(false);
  const [showVenueModal, setShowVenueModal] = useState(false);

  // Fungsi memperbarui titik lokasi real-time via GPS dan langsung menyinkronkannya ke server
  const handleRefreshRealTimeLocation = async () => {
    setIsRefreshingVenueLocation(true);
    try {
      // 1. Coba deteksi GPS perangkat saat ini (high-accuracy)
      const loc = await fetchCurrentLocation();
      setCurrentVenueLocation(loc.address);
      setVenueCoordinates(`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);

      // 2. Kirim update ke server secara instan agar semua layar di jaringan (http://192.168.1.6:3000) sinkron
      await fetch('/api/venue-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: loc.address.split(',')[0] || 'Titik Lokasi Diklat',
          address: loc.address,
          latitude: loc.latitude,
          longitude: loc.longitude,
          radiusMeters: 100,
          source: 'gps_device_live',
        }),
      });
    } catch (err: any) {
      // Jika browser membatasi GPS (misal di http://192.168.1.6:3000 karena protokol HTTP biasa)
      setShowVenueModal(true);
    } finally {
      setIsRefreshingVenueLocation(false);
    }
  };

  // Real-time polling: Sinkronisasi lokasi venue dari server setiap 2 detik
  // Memastikan bahwa tampilan di http://192.168.1.6:3000 / Layar Proyektor SELALU mengikuti lokasi real-time terkini
  useEffect(() => {
    const fetchLiveVenue = async () => {
      try {
        const res = await fetch('/api/venue-location');
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.venue) {
            const vName = data.venue.name || data.venue.address;
            if (vName) {
              setCurrentVenueLocation(vName);
            }
            if (data.venue.latitude && data.venue.longitude) {
              setVenueCoordinates(`${Number(data.venue.latitude).toFixed(6)}, ${Number(data.venue.longitude).toFixed(6)}`);
            }
          }
        }
      } catch {}
    };

    fetchLiveVenue();
    const interval = setInterval(fetchLiveVenue, 2000);
    return () => clearInterval(interval);
  }, []);

  // Load logo, geofence, and subscribe to updates
  useEffect(() => {
    setLogoConfig(getSavedLogoConfig());
    const handleLogoUpdate = (e: any) => {
      if (e.detail) setLogoConfig(e.detail);
    };
    window.addEventListener('presensi_logo_updated', handleLogoUpdate);

    // Load Geofence and Venue Location
    const cfg = getSavedGeofenceConfig();
    setGeofenceConfig(cfg);
    syncGeofenceFromServer().then((c) => {
      if (c) {
        setGeofenceConfig(c);
        const loc = c.locations?.find((l: any) => l.isActive) || c.locations?.[0];
        if (loc) {
          setCurrentVenueLocation(loc.name);
          setVenueCoordinates(`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
        }
      }
    });

    const handleGeofenceUpdate = (e: any) => {
      if (e.detail) {
        setGeofenceConfig(e.detail);
        const loc = e.detail.locations?.find((l: any) => l.isActive) || e.detail.locations?.[0];
        if (loc) {
          setCurrentVenueLocation(loc.name);
          setVenueCoordinates(`${loc.latitude.toFixed(6)}, ${loc.longitude.toFixed(6)}`);
        }
      }
    };
    window.addEventListener('presensi_geofence_updated', handleGeofenceUpdate);

    return () => {
      window.removeEventListener('presensi_logo_updated', handleLogoUpdate);
      window.removeEventListener('presensi_geofence_updated', handleGeofenceUpdate);
    };
  }, []);

  // Search & Filter state for Materi / Sesi Diklat in Layar Proyektor
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [isEventDropdownOpen, setIsEventDropdownOpen] = useState(false);
  const eventDropdownRef = useRef<HTMLDivElement>(null);

  const kioskContainerRef = useRef<HTMLDivElement>(null);

  // Load and synchronize events in real-time
  useEffect(() => {
    const applyEvents = (list: EventSession[]) => {
      setEvents(list);
      setActiveEventId((prev) => {
        const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('presensi_active_event_id') : null;
        if (saved && list.some((e) => e.id === saved)) {
          return saved;
        }
        if (prev && list.some((e) => e.id === prev)) {
          return prev;
        }
        const nextId = list[0]?.id || '';
        try {
          if (nextId) localStorage.setItem('presensi_active_event_id', nextId);
          else localStorage.removeItem('presensi_active_event_id');
        } catch {}
        return nextId;
      });
    };

    applyEvents(getSavedEvents());
    syncEventsFromServer().then((remote) => {
      if (remote) applyEvents(remote);
    });

    const handleEventsUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        applyEvents(e.detail);
      } else {
        applyEvents(getSavedEvents());
      }
    };
    window.addEventListener('presensi_events_updated', handleEventsUpdate);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'presensi_custom_events') {
        applyEvents(getSavedEvents());
      } else if (e.key === 'presensi_active_event_id' && e.newValue) {
        setActiveEventId(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    const interval = setInterval(() => {
      const currentList = getSavedEvents();
      applyEvents(currentList);
    }, 3000);

    return () => {
      window.removeEventListener('presensi_events_updated', handleEventsUpdate);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Close event search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (eventDropdownRef.current && !eventDropdownRef.current.contains(e.target as Node)) {
        setIsEventDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Update clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate attendee count for active event & poll server in real-time
  useEffect(() => {
    if (!activeEventId) return;
    const currentEvt = events.find((e) => e.id === activeEventId);
    if (!currentEvt) return;

    const updateCount = async () => {
      try {
        const res = await fetch('/api/attendance');
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.records && Array.isArray(data.records)) {
            const evtLogs = data.records.filter((log: any) => log.eventName === currentEvt.title);
            setAttendeeCount(evtLogs.length);
            if (evtLogs.length > 0) {
              setLatestAttendee(evtLogs[0]);
            }
            return;
          }
        }
      } catch {}
      const logs = getSavedAttendanceLogs();
      const evtLogs = logs.filter((log) => log.eventName === currentEvt.title);
      setAttendeeCount(evtLogs.length);
      if (evtLogs.length > 0) {
        setLatestAttendee(evtLogs[0]);
      }
    };

    updateCount();
    const timer = setInterval(updateCount, 3000);

    const handleRealtimeUpdate = (e: any) => {
      const records: any[] = e.detail || getSavedAttendanceLogs();
      const evtLogs = records.filter((log) => log.eventName === currentEvt.title);
      setAttendeeCount(evtLogs.length);
      if (evtLogs.length > 0) {
        setLatestAttendee(evtLogs[0]);
      }
    };
    window.addEventListener('presensi_attendance_updated', handleRealtimeUpdate);

    return () => {
      clearInterval(timer);
      window.removeEventListener('presensi_attendance_updated', handleRealtimeUpdate);
    };
  }, [activeEventId, events]);

  // Dynamic QR Code State & Auto-Refresh Timer (Anti-Fraud / Anti-Foto)
  const [dynamicQR, setDynamicQR] = useState<DynamicQRData>(() =>
    getActiveDynamicQRData(events.find((e) => e.id === activeEventId)?.title || 'Diklat')
  );

  // Live timer: berganti dinamis tiap 15 detik demi mencegah foto/screenshot curang
  useEffect(() => {
    const currentEvt = events.find((e) => e.id === activeEventId) || events[0];
    const evtTitle = currentEvt?.title || 'Diklat';

    const tick = () => {
      const updated = getActiveDynamicQRData(evtTitle);
      setDynamicQR(updated);
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeEventId, events]);

  // Generate QR code data URL whenever active event, host, or dynamic token interval changes
  useEffect(() => {
    const activeEvt = events.find((e) => e.id === activeEventId);
    if (!activeEvt) return;

    const baseOrigin = getBaseOrigin();
    // Payload menyertakan timestamp dan token dinamis terenkripsi
    const payload = `${baseOrigin}/?absen=1&event=${encodeURIComponent(activeEvt.title)}&t=${dynamicQR.timestamp}&token=${encodeURIComponent(dynamicQR.token)}&code=${dynamicQR.code}`;

    QRCode.toDataURL(payload, {
      width: 1024,
      margin: 2,
      color: {
        dark: '#02132b',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        setQrDataUrl(url);
      })
      .catch((err) => {
        console.error('Error generating QR code:', err);
      });
  }, [activeEventId, events, customHost, networkIps, qrUrlMode, dynamicQR.intervalIndex]);

  const activeEvent = events.find((e) => e.id === activeEventId) || events[0];

  const handleToggleFullscreen = () => {
    if (!kioskContainerRef.current) return;

    if (!document.fullscreenElement) {
      kioskContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleDownloadQR = () => {
    if (!qrDataUrl || !activeEvent) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `QR_Presensi_${activeEvent.title.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter events by training title for dropdown search
  const filteredEvents = events.filter((e) =>
    e.title.toLowerCase().includes(eventSearchQuery.toLowerCase().trim())
  );

  // Indonesian Date Formatting
  const formattedDay = currentTime.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className={`mx-auto w-full h-full flex flex-col justify-between p-1 sm:p-2 space-y-2 overflow-hidden ${isFullscreen ? 'max-w-none' : 'max-w-6xl'}`}>
      {/* Control Bar: Event Selection, Add Event, Fullscreen, Print */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 sm:px-4 sm:py-2 shadow-md flex flex-wrap items-center justify-between gap-2 text-white shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap relative" ref={eventDropdownRef}>
          <label className="text-xs font-semibold text-slate-400 whitespace-nowrap hidden sm:inline flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-teal-400" />
            Materi / Sesi Diklat:
          </label>

          {/* Searchable Dropdown Trigger */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsEventDropdownOpen((prev) => !prev)}
              className="bg-slate-950 border border-slate-700 hover:border-teal-400 text-teal-300 font-bold rounded-xl px-3 py-1.5 text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer shadow-sm max-w-[260px] sm:max-w-xs md:max-w-sm truncate"
              title="Klik untuk mencari dan memilih judul materi pelatihan"
            >
              <BookOpen className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="truncate">
                {activeEvent?.title || (events.length === 0 ? 'Belum Ada Materi Diklat' : 'Pilih Materi Diklat')}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isEventDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu Panel with Search Input */}
            {isEventDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 max-w-[92vw] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Search Bar Input */}
                <div className="p-2.5 border-b border-slate-800 bg-slate-950/80">
                  <div className="relative flex items-center">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
                    <input
                      type="text"
                      autoFocus
                      value={eventSearchQuery}
                      onChange={(e) => setEventSearchQuery(e.target.value)}
                      placeholder="Cari judul materi pelatihan..."
                      className="w-full bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:border-teal-400"
                    />
                    {eventSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setEventSearchQuery('')}
                        className="absolute right-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                        title="Hapus pencarian"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5 px-1 text-[10px] text-slate-400">
                    <span>
                      {filteredEvents.length} dari {events.length} materi ditemukan
                    </span>
                    <span className="text-teal-400">Klik materi untuk ganti layar</span>
                  </div>
                </div>

                {/* Items List */}
                <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
                  {filteredEvents.length > 0 ? (
                    filteredEvents.map((evt) => {
                      const isSelected = evt.id === activeEventId;
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={() => {
                            setActiveEventId(evt.id);
                            setIsEventDropdownOpen(false);
                            setEventSearchQuery('');
                          }}
                          className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-start justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-teal-500/20 border border-teal-500/60 text-teal-200 font-bold'
                              : 'hover:bg-slate-800/80 text-slate-200 border border-transparent'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5 line-clamp-1">
                              {evt.title}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 truncate">
                              <span>{evt.organization || 'Diklat & Pelatihan'}</span>
                              {evt.startTime && evt.endTime && (
                                <span>• {evt.startTime} - {evt.endTime} WIB</span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <Check className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })
                  ) : (
                    <div className="py-6 px-4 text-center text-xs text-slate-400">
                      <p>Tidak ada materi pelatihan yang cocok dengan &quot;{eventSearchQuery}&quot;</p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Gunakan menu <strong>Materi / Sesi Diklat</strong> untuk menambah atau mengedit materi.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-1.5 sm:gap-2">
          {/* Indikator Status Presensi Aktif */}
          <div
            title="Sistem Presensi Aktif"
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 relative"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-60 pointer-events-none" />
          </div>

          {/* Target IP/URL Akses HP Android */}
          <button
            type="button"
            onClick={() => {
              setTempCustomHost(customHost);
              setShowNetworkModal(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              qrUrlMode === 'public'
                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-800 hover:bg-slate-700 text-teal-300 border-teal-500/30'
            }`}
            title="Atur Alamat Akses QR Code untuk HP Android (Beda Jaringan 4G / Wi-Fi Lokal)"
          >
            {qrUrlMode === 'public' ? (
              <Globe className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-teal-400" />
            )}
            <span className="hidden md:inline text-slate-300 text-[11px]">Akses HP:</span>
            <span className="font-mono text-[11px] font-bold text-white">
              {qrUrlMode === 'public' ? 'Beda Jaringan (4G/Internet)' : 'Wi-Fi Lokal'}
            </span>
          </button>

          {/* Pengatur Ukuran QR Dinamis (Auto Layar / Kompak / Sedang / Besar / Proyektor) */}
          <div className="relative" ref={qrSizeMenuRef}>
            <div className="inline-flex items-center rounded-xl bg-slate-800 border border-slate-700/80 p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setIsQrSizeMenuOpen((prev) => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-700 text-teal-300 text-xs font-semibold transition-all cursor-pointer"
                title="Atur Ukuran QR Code agar dinamis mengikuti ukuran layar atau proyektor"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden lg:inline text-slate-300 text-[11px]">Ukuran QR:</span>
                <span className="font-bold text-[11px] text-white">
                  {qrSizeMode === 'auto'
                    ? 'Dinamis (Auto)'
                    : qrSizeMode === 'compact'
                    ? 'Kompak'
                    : qrSizeMode === 'medium'
                    ? 'Sedang'
                    : qrSizeMode === 'large'
                    ? 'Besar'
                    : 'Proyektor'}
                </span>
                <span className="text-[10px] text-teal-400 font-mono">({computedQrSize}px)</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isQrSizeMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => handleAdjustZoom(-10)}
                disabled={zoomPercent <= 60}
                className="p-1 hover:bg-slate-700 text-slate-300 hover:text-white rounded disabled:opacity-30 transition-colors cursor-pointer"
                title="Perkecil Ukuran QR (-10%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleAdjustZoom(10)}
                disabled={zoomPercent >= 220}
                className="p-1 hover:bg-slate-700 text-slate-300 hover:text-white rounded disabled:opacity-30 transition-colors cursor-pointer"
                title="Perbesar Ukuran QR (+10%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Dropdown Menu Pengaturan Ukuran QR */}
            {isQrSizeMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 p-3 space-y-3 animate-in fade-in zoom-in-95 text-left">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Ukuran QR Code Dinamis
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                    {computedQrSize} × {computedQrSize} px
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Mode Ukuran Layar:
                  </span>
                  {[
                    { id: 'auto', label: 'Dinamis Layar (Otomatis)', desc: 'Menyesuaikan layar proyektor & monitor secara otomatis', icon: Tv },
                    { id: 'compact', label: 'Kompak (220px)', desc: 'Cocok untuk laptop kecil atau tablet', icon: Minimize2 },
                    { id: 'medium', label: 'Sedang (310px)', desc: 'Standar ruang rapat kecil', icon: Tv },
                    { id: 'large', label: 'Besar (420px)', desc: 'Optimal untuk LCD Proyektor HD', icon: Maximize2 },
                    { id: 'huge', label: 'Maksimal (540px+)', desc: 'Layar lebar aula / TV 4K auditorium', icon: Sparkles },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSetQrSizeMode(opt.id as any)}
                      className={`w-full text-left p-2 rounded-xl text-xs transition-all flex items-start gap-2 cursor-pointer ${
                        qrSizeMode === opt.id
                          ? 'bg-teal-500/20 text-teal-200 border border-teal-500/50 font-bold'
                          : 'text-slate-300 hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      <div className="mt-0.5">
                        {qrSizeMode === opt.id ? (
                          <Check className="w-3.5 h-3.5 text-teal-400" />
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-100">{opt.label}</div>
                        <div className="text-[10px] text-slate-400">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Zoom Scale Slider */}
                <div className="pt-2 border-t border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400 text-[11px]">Skala Perbesaran:</span>
                    <span className="font-mono font-bold text-teal-300 text-[11px]">{zoomPercent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAdjustZoom(-10)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                      title="Perkecil"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="range"
                      min={60}
                      max={220}
                      step={10}
                      value={zoomPercent}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setZoomPercent(val);
                        try {
                          localStorage.setItem('presensi_qr_zoom_percent', val.toString());
                        } catch {}
                      }}
                      className="w-full accent-teal-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleAdjustZoom(10)}
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs cursor-pointer"
                      title="Perbesar"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset ke Standar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQrSizeMenuOpen(false)}
                    className="px-2.5 py-1 bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleToggleFullscreen}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Keluar Full Screen' : 'Full Screen'}</span>
          </button>
        </div>
      </div>

      {/* Main Kiosk & Projection Card */}
      <div
        ref={kioskContainerRef}
        className={`bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-slate-800 rounded-2xl p-2.5 sm:p-4 shadow-2xl text-white flex-1 flex flex-col items-center justify-between text-center relative overflow-hidden ${
          isFullscreen ? 'min-h-screen justify-center py-6' : 'min-h-0'
        }`}
      >
        {/* Floating Controls in Fullscreen Mode */}
        {isFullscreen && (
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-1.5 sm:gap-2 bg-slate-900/95 backdrop-blur-md p-1.5 sm:p-2 rounded-2xl border border-slate-700 shadow-2xl">
            <span className="text-[11px] font-mono text-teal-300 px-2 font-bold hidden sm:inline">
              QR: {computedQrSize}px ({zoomPercent}%)
            </span>
            <button
              type="button"
              onClick={() => handleAdjustZoom(-10)}
              disabled={zoomPercent <= 60}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 transition-colors cursor-pointer"
              title="Perkecil Ukuran QR (-10%)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleAdjustZoom(10)}
              disabled={zoomPercent >= 220}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-40 transition-colors cursor-pointer"
              title="Perbesar Ukuran QR (+10%)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToggleFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              title="Keluar dari Layar Penuh"
            >
              <Minimize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Keluar Full Screen</span>
            </button>
          </div>
        )}

        {/* Background glow effects */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header: Organization, Logo & Clock */}
        <div className="relative z-10 space-y-0.5 mb-1 max-w-xl shrink-0">
          {/* Custom Landscape Logo on Kiosk (only if user uploaded logo) */}
          {logoConfig.showInKiosk && logoConfig.logoUrl && (
            <div className="flex items-center justify-center mb-1">
              <img
                src={logoConfig.logoUrl}
                alt={logoConfig.altText || logoConfig.institutionName || 'Logo'}
                style={{
                  width: `${Math.min(logoConfig.width, 160)}px`,
                  maxHeight: `${Math.min(logoConfig.height, 36)}px`,
                  objectFit: logoConfig.objectFit,
                }}
                className="drop-shadow-lg transition-all"
              />
            </div>
          )}

          <h1 className="text-base sm:text-xl md:text-2xl font-black text-white tracking-tight line-clamp-2">
            {activeEvent?.title || 'Sesi Presensi'}
          </h1>

          <div className="flex items-center justify-center flex-wrap gap-2 pt-0.5">
            <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
              Scan QR Code • Tanpa Foto Diri
            </span>
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-300 font-medium">
              <Calendar className="w-3 h-3 text-teal-400" />
              <span>{formattedDay}</span>
            </div>
            <span className="text-slate-600 hidden sm:inline">•</span>
            <div className="flex items-center gap-1 text-teal-300 font-mono font-bold text-xs">
              <Clock className="w-3 h-3 text-teal-400" />
              <span>{formattedTime} WIB</span>
            </div>
          </div>

          {/* Lokasi Presensi GPS Venue Diklat (Tampil Jelas di Layar Proyektor) */}
          <div className="flex items-center justify-center flex-wrap gap-1.5 pt-1">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950/80 border border-teal-500/40 text-teal-300 text-[11px] sm:text-xs font-semibold shadow-md max-w-full">
              <MapPin className="w-3.5 h-3.5 text-teal-400 animate-pulse shrink-0" />
              <span className="text-slate-400">Titik Lokasi:</span>
              <span className="text-white font-bold truncate max-w-xs sm:max-w-md" title={currentVenueLocation}>
                {currentVenueLocation}
              </span>
              {venueCoordinates && (
                <span className="text-[10px] text-teal-300 font-mono hidden md:inline bg-teal-500/10 px-1.5 py-0.2 rounded border border-teal-500/20">
                  {venueCoordinates}
                </span>
              )}
            </div>

            {/* Tombol Sinkronkan GPS Real-Time */}
            <button
              type="button"
              onClick={handleRefreshRealTimeLocation}
              disabled={isRefreshingVenueLocation}
              title="Ambil titik GPS posisi perangkat secara real-time dan sinkronkan ke semua layar"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-[10px] sm:text-[11px] font-bold transition-all shadow active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshingVenueLocation ? 'animate-spin' : ''}`} />
              <span>{isRefreshingVenueLocation ? 'Mengunci GPS...' : 'Ambil GPS Real-Time'}</span>
            </button>

            {geofenceConfig.enabled && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                <span>Geofence GPS Aktif</span>
              </span>
            )}
          </div>
        </div>

        {/* Center: QR Code Canvas Frame (Dinamis Mengikuti Ukuran Layar Proyektor) */}
        <div
          className="relative z-10 p-2.5 sm:p-4 bg-white rounded-3xl shadow-2xl shadow-teal-500/20 border-4 border-teal-400/50 my-auto shrink-0 flex flex-col items-center justify-center transition-all duration-200"
          style={{
            maxWidth: '94vw',
            maxHeight: isFullscreen ? '68vh' : '52vh',
          }}
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="QR Code Presensi"
              style={{
                width: `${computedQrSize}px`,
                height: `${computedQrSize}px`,
                maxWidth: isFullscreen ? 'min(75vw, 62vh)' : 'min(65vw, 44vh)',
                maxHeight: isFullscreen ? 'min(75vw, 62vh)' : 'min(65vw, 44vh)',
              }}
              className="object-contain rounded-xl transition-all duration-200"
            />
          ) : (
            <div
              style={{
                width: `${computedQrSize}px`,
                height: `${computedQrSize}px`,
                maxWidth: isFullscreen ? 'min(75vw, 62vh)' : 'min(65vw, 44vh)',
                maxHeight: isFullscreen ? 'min(75vw, 62vh)' : 'min(65vw, 44vh)',
              }}
              className="flex items-center justify-center bg-slate-100 rounded-xl"
            >
              <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Badge & Anti-Fraud Dynamic Indicator at Bottom of QR */}
          <div className="mt-2 w-full flex flex-col items-center justify-center gap-1.5 text-slate-900 font-extrabold text-[10px] sm:text-xs">
            {/* Live Dynamic QR Countdown Anti-Curang */}
            <div className="w-full max-w-sm px-3 py-1.5 rounded-xl bg-slate-950 text-white border border-teal-500/40 shadow flex flex-col items-center gap-1">
              <div className="flex items-center justify-between w-full text-[10px] sm:text-[11px] font-bold text-teal-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>QR Dinamis Anti-Curang</span>
                </span>
                <span className="font-mono text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded text-[10px]">
                  Berganti: {dynamicQR.remainingSeconds}s
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${(dynamicQR.remainingSeconds / DYNAMIC_QR_INTERVAL_SEC) * 100}%` }}
                />
              </div>
              <p className="text-[9px] text-slate-400 text-center font-normal">
                Foto / screenshot tidak dapat digunakan curang • QR kadaluwarsa otomatis
              </p>
            </div>

            <div className="flex items-center gap-1">
              <QrIcon className="w-3.5 h-3.5 text-teal-600" />
              <span className="tracking-wide">SCAN VIA KAMERA HP / GOOGLE LENS / WA</span>
            </div>
            <span
              className={`text-[9px] sm:text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                qrUrlMode === 'public'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-teal-50 text-teal-700 border-teal-200'
              }`}
            >
              {qrUrlMode === 'public'
                ? '🌐 MODE BEDA JARINGAN (4G/5G/INTERNET) • BISA DIBUKA TANPA WI-FI LAPTOP'
                : '📶 MODE WI-FI LOKAL (1 JARINGAN SAMA)'}
            </span>
          </div>
        </div>

        {/* Quick URL Switcher for QR Code */}
        <div className="relative z-10 flex items-center justify-center gap-1.5 my-1 text-xs shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => handleSelectQrMode('public')}
            className={`px-3 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              qrUrlMode === 'public'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'bg-slate-900/90 text-slate-400 border border-slate-800 hover:text-white'
            }`}
            title="HP Android bisa membuka presensi dari mana saja menggunakan Paket Data 4G/5G tanpa perlu terhubung ke Wi-Fi laptop"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Mode Beda Jaringan (4G/5G Bebas)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSelectQrMode('local')}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              qrUrlMode === 'local'
                ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                : 'bg-slate-900/90 text-slate-400 border border-slate-800 hover:text-white'
            }`}
            title="Gunakan alamat IP lokal 192.168.x.x (hanya jika HP dan Laptop di 1 Wi-Fi yang sama)"
          >
            <Wifi className="w-3 h-3" />
            <span>Wi-Fi Lokal ({networkIps[0] || '192.168.1.6'})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNetworkModal(true)}
            className="px-2.5 py-1 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            title="Panduan solusi jika HP tidak bisa membuka alamat 192.168.137.1 atau ingin scan beda jaringan"
          >
            <HelpCircle className="w-3 h-3 text-amber-400" />
            <span>Kenapa 192.168.137.1 Tidak Terbuka di HP?</span>
          </button>

          <a
            href={`${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(activeEvent?.title || 'Sesi Presensi')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-teal-300 border border-teal-500/30 text-[10px] font-semibold flex items-center gap-1 transition-colors"
            title="Tes buka halaman presensi peserta langsung di browser ini"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Tes Link Scan</span>
          </a>
        </div>

        {/* Footer: Live Count & Instructions */}
        <div className="relative z-10 w-full max-w-xl flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/30 flex items-center justify-center font-bold">
              <Users className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <span className="text-[10px] text-slate-400 block">Peserta Tercatat Hari Ini:</span>
              <strong className="text-white text-xs sm:text-sm font-bold">{attendeeCount} Orang</strong>
            </div>
          </div>

          {/* Indikator Status Presensi Aktif */}
          <div
            className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            <span className="text-[10px] font-bold text-emerald-400">
              Presensi Cloud Aktif
            </span>
          </div>
        </div>
      </div>

      {/* Modal: Configure Mobile Scan Target URL (Beda Jaringan 4G/5G vs Wi-Fi Lokal) */}
      {showNetworkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-5 sm:p-6 shadow-2xl text-white space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  Alamat Akses QR Code untuk HP Android
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pengaturan agar HP peserta dapat mengakses presensi tanpa harus 1 jaringan dengan laptop
                </p>
              </div>
              <button
                onClick={() => setShowNetworkModal(false)}
                className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Banner Penjelasan Solusi Beda Jaringan */}
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs space-y-1.5">
              <p className="font-bold flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                Bisa Diakses Tanpa Terhubung ke Jaringan yang Sama dengan Laptop!
              </p>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Dengan mengaktifkan <strong>Mode Internet Publik (Cloud)</strong> di bawah ini, seluruh HP Android peserta dapat langsung melakukan scan dan mengisi formulir presensi menggunakan <strong>Paket Data Seluler (4G/5G)</strong> mereka masing-masing tanpa perlu menyambung ke Wi-Fi laptop.
              </p>
            </div>

            {/* Pilihan 1: URL Internet Publik / Cloud Resmi (BEDA JARINGAN) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  1. Mode Internet Publik (Beda Jaringan / 4G / 5G / Kuota Bebas):
                </label>
                {qrUrlMode === 'public' && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase">
                    Aktif di QR Code
                  </span>
                )}
              </div>

              <div
                className={`p-3.5 rounded-xl border text-left text-xs transition-all space-y-2.5 ${
                  qrUrlMode === 'public'
                    ? 'bg-emerald-500/15 border-emerald-500/80 shadow-lg shadow-emerald-500/10'
                    : 'bg-slate-950 border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                        🟢 AKTIF (Status: 200 OK • Anti 404)
                      </span>
                    </div>
                    <span className="font-mono text-xs sm:text-sm font-bold text-emerald-300 block break-all">
                      {getBaseOrigin()}
                    </span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      ✅ <strong>Bebas Jaringan:</strong> Bisa dibuka oleh HP Android peserta via kuota internet seluler (4G/5G) maupun Wi-Fi mana pun tanpa ketergantungan pada jaringan laptop.
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      🔒 Menggunakan protokol resmi HTTPS: Kamera HP, Google Lens, QR scanner, dan GPS lokasi berjalan otomatis.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80 flex-wrap">
                  {qrUrlMode !== 'public' ? (
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectQrMode('public', '');
                        setShowNetworkModal(false);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Aktifkan Mode Beda Jaringan Ini</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Mode ini sedang aktif pada QR Code di layar
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      const link = `${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(activeEvent?.title || 'Sesi Presensi')}`;
                      navigator.clipboard.writeText(link);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-teal-400" />}
                    <span>{copiedLink ? 'Tautan Disalin!' : 'Salin Tautan'}</span>
                  </button>

                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Presensi Diklat: ${activeEvent?.title || 'Sesi Pelatihan'}\nSilakan scan atau klik tautan berikut untuk absen:\n${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(activeEvent?.title || '')}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Kirim ke WhatsApp</span>
                  </a>

                  <a
                    href={`${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(activeEvent?.title || 'Sesi Presensi')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Tes Link (Buka Sekarang)</span>
                  </a>
                </div>

                {/* Info Penjelasan Tombol Share AI Studio */}
                <div className="mt-2 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-300 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      Tautan Publik Bebas Login (Shared App URL):
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                        isSharedActive
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {isSharedActive ? '🟢 Terpublikasi' : '🟡 Perlu Klik Share di AI Studio'}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 block break-all">
                    {sharedAppUrl}
                  </span>
                  {!isSharedActive && (
                    <p className="text-[10px] text-amber-200/90 leading-relaxed">
                      💡 <em>Kenapa tautan di atas muncul <strong>404 Not Found</strong> jika dibuka langsung?</em> Karena Google Cloud Run memerlukan Anda mengklik tombol <strong>&quot;Share&quot; (Bagikan)</strong> di pojok kanan atas AI Studio. Setelah diklik sekali, URL tersebut akan aktif permanen untuk publik tanpa login Google.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Pilihan 2: IP Wi-Fi Lokal Laptop (Hanya jika 1 Jaringan Sama) */}
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Mode Wi-Fi Lokal Laptop (Hanya jika HP dan Laptop di 1 Wi-Fi Sama):
              </label>
              <p className="text-[11px] text-slate-400">
                Pilih opsi ini HANYA jika tidak ada akses internet eksternal dan semua perangkat terhubung ke router/hotspot lokal yang sama.
              </p>
              {networkIps.length > 0 ? (
                <div className="space-y-2">
                  {networkIps.map((ip) => {
                    const port = typeof window !== 'undefined' && window.location.port ? `:${window.location.port}` : ':3000';
                    const fullUrl = `http://${ip}${port}`;
                    const isSelected = qrUrlMode === 'local' && (getBaseOrigin() === fullUrl || !customHost);
                    return (
                      <button
                        key={ip}
                        type="button"
                        onClick={() => {
                          handleSelectQrMode('local', fullUrl);
                          setShowNetworkModal(false);
                        }}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left text-xs transition-all ${
                          isSelected
                            ? 'bg-teal-500/20 border-teal-500 text-teal-200 font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Wifi className="w-4 h-4 text-teal-400 shrink-0" />
                          <div>
                            <span className="font-mono text-sm block">{fullUrl}</span>
                            <span className="text-[10px] text-slate-400">Hanya bisa diakses jika HP tersambung ke Wi-Fi laptop</span>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full bg-teal-500 text-slate-950 text-[10px] font-black uppercase">
                            Aktif
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Troubleshooting Alert for Mobile Hotspot (192.168.137.1) */}
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-1.5 mt-2">
                    <div className="font-bold flex items-center gap-1.5 text-amber-300">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Kendala Akses Hotspot Lokal (contoh: 192.168.137.1:3000):</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      1. <strong>Windows Firewall:</strong> Windows secara bawaan memblokir port 3000 dari perangkat luar. Jalankan perintah ini di CMD (Admin): <br />
                      <code className="text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded font-mono text-[10px] select-all inline-block mt-0.5">
                        netsh advfirewall firewall add rule name="Presensi QR" dir=in action=allow protocol=TCP localport=3000
                      </code>
                    </p>
                    <p className="text-slate-300 leading-relaxed">
                      2. <strong>GPS Diblokir di HTTP:</strong> Browser HP (Chrome) mematikan GPS pada alamat HTTP biasa. <strong>Gunakan Tautan Cloud HTTPS resmi (Pilihan 1 di atas)</strong> agar kamera &amp; GPS HP langsung aktif 100%!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs">
                  Sedang mendeteksi IP Wi-Fi laptop...
                </div>
              )}
            </div>

            {/* Input Manual Kustom / Cloud / Ngrok */}
            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300">
                3. Atau Masukkan IP / URL Publik Kustom Manual:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tempCustomHost}
                  onChange={(e) => setTempCustomHost(e.target.value)}
                  placeholder="Contoh: https://diklat.rs-azzahra.com atau http://192.168.1.15:3000"
                  className="flex-1 bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-teal-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = tempCustomHost.trim();
                    if (clean) {
                      handleSelectQrMode(clean.startsWith('https') ? 'public' : 'local', clean);
                    } else {
                      handleSelectQrMode('public', '');
                    }
                    setShowNetworkModal(false);
                  }}
                  className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs transition-colors shrink-0 cursor-pointer"
                >
                  Terapkan
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-400 space-y-1 pt-1 border-t border-slate-800">
              <p className="font-semibold text-slate-300">Ringkasan:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li><strong>Mau HP bisa scan tanpa Wi-Fi laptop?</strong> Pilih <strong>Mode 1 (Internet Publik)</strong>. Peserta bebas menggunakan paket data 4G/5G apapun.</li>
                <li>Data presensi yang disubmit dari HP peserta akan otomatis masuk ke Rekapitulasi Presensi dan siap diekspor ke format Excel (.xlsx).</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sinkronisasi Lokasi Real-Time */}
      {showVenueModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 max-w-lg w-full text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Sinkronisasi Lokasi Real-Time Proyektor</h3>
                  <p className="text-xs text-slate-400">Pilih titik lokasi rumah sakit untuk ditampilkan di proyektor:</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVenueModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info notice about HTTP vs HTTPS */}
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
              <strong className="block flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Informasi Izin GPS pada Alamat Jaringan Lokal (HTTP):
              </strong>
              <p className="text-[11px] leading-relaxed text-slate-300">
                Browser membatasi deteksi satelit GPS langsung jika web dibuka melalui protokol HTTP lokal (seperti <code className="text-teal-300 font-mono">http://192.168.1.6:3000</code>).
              </p>
              <p className="text-[11px] leading-relaxed text-slate-300">
                Untuk menyinkronkan lokasi secara real-time, Anda dapat memilih salah satu opsi di bawah ini:
              </p>
            </div>

            {/* Quick Option 1: Set RSIA AZ ZAHRA */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-300 block">Pilihan Titik Lokasi Rumah Sakit:</span>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/venue-location', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: 'RSIA AZ ZAHRA - Ruang Diklat Pelatihan',
                        address: 'RSIA Az Zahra, Jl. Sirsak No. 33, Jagakarsa, Jakarta Selatan',
                        latitude: -6.321456,
                        longitude: 106.823456,
                        radiusMeters: 100,
                        source: 'zahra_preset',
                      }),
                    });
                    setCurrentVenueLocation('RSIA AZ ZAHRA - Ruang Diklat Pelatihan');
                    setVenueCoordinates('-6.321456, 106.823456');
                    setShowVenueModal(false);
                  }}
                  className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-teal-500/15 border border-teal-500/30 hover:border-teal-500/60 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-0.5 min-w-0">
                    <strong className="text-teal-300 text-xs block group-hover:text-teal-200">
                      🏥 RSIA AZ ZAHRA - Ruang Diklat Pelatihan
                    </strong>
                    <span className="text-[11px] text-slate-400 block truncate">
                      Jl. Sirsak No. 33, Jagakarsa, Jakarta Selatan (-6.321456, 106.823456)
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded bg-teal-500 text-slate-950 font-bold text-[10px] shrink-0">
                    Pilih Ini
                  </span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/venue-location', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: 'Gedung Utama & Ruang Komite Keperawatan',
                        address: 'RSIA Az Zahra Gedung Utama Lantai 2',
                        latitude: -6.321600,
                        longitude: 106.823600,
                        radiusMeters: 150,
                        source: 'aula_preset',
                      }),
                    });
                    setCurrentVenueLocation('Gedung Utama & Ruang Komite Keperawatan');
                    setVenueCoordinates('-6.321600, 106.823600');
                    setShowVenueModal(false);
                  }}
                  className="w-full text-left p-3 rounded-xl bg-slate-950 hover:bg-teal-500/15 border border-slate-800 hover:border-teal-500/60 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-0.5 min-w-0">
                    <strong className="text-white text-xs block group-hover:text-teal-300">
                      🏢 Gedung Utama & Ruang Komite Keperawatan
                    </strong>
                    <span className="text-[11px] text-slate-400 block truncate">
                      Lantai 2 Gedung Utama RS (-6.321600, 106.823600)
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded bg-slate-800 text-slate-200 font-bold text-[10px] shrink-0">
                    Pilih Ini
                  </span>
                </button>
              </div>
            </div>

            {/* Quick Option 2: Open HTTPS Cloud URL */}
            <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
              <span className="text-slate-400 block">
                Atau buka web ini melalui tautan HTTPS Cloud untuk deteksi satelit GPS HP/Laptop secara langsung:
              </span>
              <a
                href={getBaseOrigin()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 font-semibold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Buka via HTTPS Cloud (Izin GPS Lengkap)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
