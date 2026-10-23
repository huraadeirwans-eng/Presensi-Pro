import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  setAccessTokenInMemory,
} from './services/firebaseAuth';
import {
  subscribeAttendanceRealtime,
  subscribeEventsRealtime,
  subscribeGeofenceRealtime,
  subscribeDeletedAttendanceIdsRealtime,
  fetchAttendanceFromCloud,
} from './services/firestoreSync';
import { Sidebar } from './components/Sidebar';
import { QRScannerView } from './components/QRScannerView';
import { EventQRView } from './components/EventQRView';
import { EventSessionsView } from './components/EventSessionsView';
import { ParticipantBadgeView } from './components/ParticipantBadgeView';
import { AttendanceDataView } from './components/AttendanceDataView';
import { SettingsView } from './components/SettingsView';
import { AdminLoginModal } from './components/AdminLoginModal';
import { LoginGate } from './components/LoginGate';
import {
  saveAttendanceLog,
  saveAttendanceLogsBatch,
  syncAttendanceWithServer,
  getSavedAttendanceLogs,
  getDeletedAttendanceIds,
  markAttendanceIdsAsDeleted,
  syncDeletedIdsFromServer,
  getSavedLogoConfig,
  defaultLogoConfig,
  syncLogoFromServer,
  syncGeofenceFromServer,
  getSavedGeofenceConfig,
} from './services/storage';
import { LogoConfig } from './types';
import {
  Menu,
  QrCode,
  Calendar,
  UserCheck,
  Settings,
  MapPin,
  ShieldCheck,
  Clock,
  Sparkles,
  ExternalLink,
  Lock,
  KeyRound,
  HelpCircle,
} from 'lucide-react';

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [adminSession, setAdminSession] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('presensi_admin_session');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return null;
  });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loginTabPreference, setLoginTabPreference] = useState<'password' | 'google'>('password');
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  const isAuthenticated = Boolean(user || adminSession);
  const activeUser = user || (adminSession ? ({ uid: adminSession.uid, email: adminSession.email, displayName: adminSession.displayName } as any) : null);
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(() => getSavedLogoConfig());
  const [activeTab, setActiveTab] = useState<'scan' | 'kiosk' | 'events' | 'badge' | 'data' | 'settings'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (
        params.get('absen') === '1' ||
        params.get('scan') === 'true' ||
        params.get('event') ||
        params.get('code') ||
        isMobile
      ) {
        return 'scan';
      }
    }
    return 'kiosk';
  });
  const [dataSubTab, setDataSubTab] = useState<'rekap' | 'chart'>('rekap');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Clock timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load initial logo config and sync geofence from server
  useEffect(() => {
    setLogoConfig(getSavedLogoConfig());

    // Sync logo from server (in case updated from other device)
    syncLogoFromServer().then((cfg) => {
      if (cfg) setLogoConfig(cfg);
    });

    // Sync geofence locations from server on mount
    syncGeofenceFromServer().catch(console.warn);

    const handleLogoUpdate = (e: any) => {
      if (e.detail) setLogoConfig(e.detail);
    };

    window.addEventListener('presensi_logo_updated', handleLogoUpdate);
    return () => {
      window.removeEventListener('presensi_logo_updated', handleLogoUpdate);
    };
  }, []);

  // ⚡ REAL-TIME CLOUD SYNC (Firebase Firestore):
  // Menjamin perubahan seketika (Cloud Sync) antara Admin Laptop dan Semua HP Peserta
  useEffect(() => {
    // 0. Sinkronisasi daftar ID yang telah dihapus permanen dari server & cloud
    syncDeletedIdsFromServer().catch(console.warn);

    // 1. Ambil data presensi yang ada di Firestore Cloud saat aplikasi dibuka
    fetchAttendanceFromCloud()
      .then((cloudRecords) => {
        if (cloudRecords && Array.isArray(cloudRecords) && cloudRecords.length > 0) {
          syncAttendanceWithServer(cloudRecords);
        }
      })
      .catch((err) => console.warn('Initial Firestore attendance fetch warning:', err));

    // 2. Pasang real-time listener: Setiap ada peserta scan absen dari HP, data langsung muncul
    const unsubAttendance = subscribeAttendanceRealtime((cloudRecords) => {
      if (cloudRecords && Array.isArray(cloudRecords) && cloudRecords.length > 0) {
        syncAttendanceWithServer(cloudRecords);
      }
    });

    // 3. Pasang real-time listener: ID yang dihapus oleh admin di perangkat manapun langsung terhapus di semua perangkat
    const unsubDeletedIds = subscribeDeletedAttendanceIdsRealtime((deletedIds) => {
      if (deletedIds && Array.isArray(deletedIds) && deletedIds.length > 0) {
        markAttendanceIdsAsDeleted(deletedIds);
      }
    });

    const unsubEvents = subscribeEventsRealtime((cloudEvents) => {
      if (cloudEvents && Array.isArray(cloudEvents) && cloudEvents.length > 0) {
        try {
          localStorage.setItem('presensi_custom_events_v1', JSON.stringify(cloudEvents));
        } catch {}
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('presensi_events_updated', { detail: cloudEvents }));
        }
      }
    });

    const unsubGeofence = subscribeGeofenceRealtime((cloudLocations) => {
      if (cloudLocations && Array.isArray(cloudLocations) && cloudLocations.length > 0) {
        try {
          const currentCfg = getSavedGeofenceConfig();
          const updatedCfg = { ...currentCfg, locations: cloudLocations };
          localStorage.setItem('presensi_geofence_config_v1', JSON.stringify(updatedCfg));
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('presensi_geofence_updated', { detail: updatedCfg }));
          }
        } catch {}
      }
    });

    return () => {
      unsubAttendance();
      unsubDeletedIds();
      unsubEvents();
      unsubGeofence();
    };
  }, []);

  // Continuously listen/poll server for attendance submitted from ANY smartphone/device
  // Melindungi data agar tidak terhapus saat reload / server restart dan TIDAK PERNAH mengembalikan data yang sudah dihapus
  useEffect(() => {
    let isFetching = false;
    const pollServerAttendance = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isFetching) return;
      isFetching = true;
      try {
        await syncDeletedIdsFromServer().catch(() => {});
        const res = await fetch('/api/attendance');
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.records && Array.isArray(data.records)) {
            // Sinkronisasi data server ke state lokal secara aman (jika server kosong, allowEmptyClear jika ada)
            syncAttendanceWithServer(data.records, data.records.length === 0);

            // Hanya unggah record yang benar-benar tersimpan offline, belum terkirim, dan TIDAK DIHAPUS
            const localLogs = getSavedAttendanceLogs();
            const deletedIds = getDeletedAttendanceIds();
            const pendingOffline = localLogs.filter((l) => l.isOfflinePending && l.name && !deletedIds.has(l.id));

            if (pendingOffline.length > 0) {
              fetch('/api/attendance/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ records: pendingOffline }),
              })
                .then((r) => (r.ok ? r.json() : null))
                .then((resData) => {
                  if (resData?.records && Array.isArray(resData.records)) {
                    syncAttendanceWithServer(resData.records);
                  }
                })
                .catch(() => {});
            }
          }
        }
      } catch (err) {
        // quiet fallback
      } finally {
        isFetching = false;
      }
    };

    pollServerAttendance();
    const timer = setInterval(pollServerAttendance, 5000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        if (currentUser) {
          setShowLoginModal(false);
        }
        setAuthChecking(false);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setAuthChecking(false);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // Handle Google Sign In
  const handleLogin = async () => {
    setIsAuthenticating(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
        setAccessTokenInMemory(result.accessToken);
      }
    } catch (err: any) {
      console.warn('Google Sign In info:', err?.message || err);
    } finally {
      setIsAuthenticating(false);
    }
  };

  // Handle Sign Out
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      setAdminSession(null);
      setAccessToken(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('presensi_admin_session');
        localStorage.removeItem('presensi_auth_logged_in');
      }
      setShowLoginModal(true);
    }
  };

  // Active page titles
  const pageTitles: Record<typeof activeTab, { title: string; subtitle: string }> = {
    scan: {
      title: 'QR Presensi Diklat Pelatihan',
      subtitle: 'Scan QR Code materi diklat & pengisian formulir Nama, NIK, Unit Kerja',
    },
    kiosk: {
      title: 'Layar Proyektor Diklat (Full Screen)',
      subtitle: 'Tampilan Full Screen untuk proyektor / monitor ruang aula pelatihan',
    },
    events: {
      title: 'Materi / Sesi Diklat Pelatihan',
      subtitle: 'Daftar materi pelatihan, jadwal per sesi, kelola peserta & cetak QR code sesi',
    },
    badge: {
      title: 'Kartu Peserta Diklat Pelatihan',
      subtitle: 'ID Card digital peserta dengan QR code verifikasi kehadiran',
    },
    data: {
      title:
        dataSubTab === 'chart'
          ? 'Grafik Batang Harian Peserta Diklat'
          : 'Filter & Rekapitulasi Presensi',
      subtitle:
        dataSubTab === 'chart'
          ? 'Grafik batang harian jumlah peserta per unit kerja & tanggal pelatihan'
          : 'Pencarian kata kunci, filter unit kerja & tanggal, dan riwayat presensi',
    },
    settings: {
      title: 'Pengaturan Aplikasi',
      subtitle: 'Pengaturan geofence radius lokasi RS dan kustomisasi logo aplikasi',
    },
  };

  // Deteksi apakah sedang dalam mode Scan Presensi oleh Peserta (via Android, mobile, atau link ?absen=1)
  const isParticipantScanMode = (() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (
        params.get('absen') === '1' ||
        params.get('scan') === 'true' ||
        params.get('event') ||
        params.get('code') ||
        activeTab === 'scan'
      ) {
        return true;
      }
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        return true;
      }
    }
    return false;
  })();

  const handleSelectTab = (tab: 'scan' | 'kiosk' | 'events' | 'badge' | 'data' | 'settings') => {
    // Menu administratif yang memerlukan akun login administrator
    const adminOnlyTabs = ['events', 'data', 'settings'];
    if (adminOnlyTabs.includes(tab) && !isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    setActiveTab(tab);
  };

  // HANYA TAB ADMINISTRATOR YANG MEMERLUKAN LOGIN (events, data, settings)
  // Peserta yang melakukan scan atau membuka presensi TIDAK PERLU LOGIN sama sekali
  const adminOnlyTabs = ['events', 'data', 'settings'];
  if (!isAuthenticated && adminOnlyTabs.includes(activeTab)) {
    return (
      <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-teal-500 selection:text-slate-950 relative overflow-y-auto">
        {/* Ambient background styling */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-950/30 via-slate-950 to-slate-950 pointer-events-none" />

        {/* Portal Dialog Form User & Password untuk akses panel administrator */}
        <div className="relative z-10 w-full max-w-lg my-auto">
          <AdminLoginModal
            isOpen={true}
            isMandatory={false}
            isFullScreen={true}
            tabPreference={loginTabPreference}
            onClose={() => setActiveTab('scan')}
            onLoginSuccess={(loggedInUser, token) => {
              if (loggedInUser?.authType === 'password') {
                setAdminSession(loggedInUser);
              } else {
                setUser(loggedInUser);
              }
              setAccessToken(token);
              setAccessTokenInMemory(token);
              setShowLoginModal(false);
            }}
            onGoogleLogin={handleLogin}
            isAuthenticating={isAuthenticating}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 flex font-sans selection:bg-teal-500 selection:text-slate-950">
      {/* 1. LEFT VERTICAL SIDEBAR MENU (DISUSUN KE BAWAH) */}
      <Sidebar
        user={activeUser}
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        dataSubTab={dataSubTab}
        setDataSubTab={setDataSubTab}
        onLogin={() => setShowLoginModal(true)}
        onLogout={handleLogout}
        onOpenSettings={() => setActiveTab('settings')}
        isAuthenticating={isAuthenticating}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* 2. RIGHT CONTENT AREA */}
      <div className={`flex-1 min-w-0 flex flex-col h-screen ${activeTab === 'kiosk' || activeTab === 'data' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {/* Top Header Bar */}
        <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-30 backdrop-blur-md px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-slate-800 text-slate-200 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer"
              title="Buka Menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Custom Landscape Logo on Header (only if user uploaded custom logo) */}
            {logoConfig.showInHeader && logoConfig.logoUrl && (
              <div className="flex items-center shrink-0 pr-3 border-r border-slate-800">
                <img
                  src={logoConfig.logoUrl}
                  alt={logoConfig.altText || logoConfig.institutionName || 'Logo'}
                  style={{
                    maxHeight: '36px',
                    maxWidth: `${Math.min(logoConfig.width, 160)}px`,
                    objectFit: logoConfig.objectFit,
                  }}
                  className="rounded drop-shadow"
                />
              </div>
            )}

            {/* Current Active Page Title */}
            <div className="min-w-0">
              <h1 className="font-extrabold text-sm sm:text-base text-white tracking-tight truncate flex items-center gap-2">
                <span>{pageTitles[activeTab].title}</span>
              </h1>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                {pageTitles[activeTab].subtitle}
              </p>
            </div>
          </div>

          {/* Right Header: Live Clock & Quick Status */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs text-teal-300 font-mono font-bold">
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
          </div>
        </header>

        {/* Main Dynamic View Content */}
        <main
          className={`flex-1 ${
            activeTab === 'kiosk' || activeTab === 'data'
              ? 'p-1.5 sm:p-2 flex flex-col min-h-0 overflow-hidden'
              : activeTab === 'events'
              ? 'p-1.5 sm:p-2 md:p-2.5 min-h-0'
              : 'p-3 sm:p-5'
          }`}
        >
          {activeTab === 'scan' && (
            <QRScannerView
              accessToken={accessToken}
              onOpenSettings={() => setActiveTab('settings')}
              onRequireAuth={() => setShowLoginModal(true)}
            />
          )}

          {activeTab === 'kiosk' && (
            <EventQRView
              accessToken={accessToken}
              onOpenSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'events' && (
            <EventSessionsView
              onSelectEventForKiosk={(eventId) => {
                localStorage.setItem('presensi_active_event_id', eventId);
                setActiveTab('kiosk');
              }}
              onOpenScan={(_eventId) => {
                setActiveTab('scan');
              }}
            />
          )}

          {activeTab === 'badge' && <ParticipantBadgeView />}

          {activeTab === 'data' && (
            <AttendanceDataView
              subTab={dataSubTab}
              onSubTabChange={setDataSubTab}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={activeUser}
              accessToken={accessToken}
              onLogin={() => setShowLoginModal(true)}
              onLogout={handleLogout}
              isAuthenticating={isAuthenticating}
            />
          )}
        </main>

        {/* Compact Footer (Hidden on data and kiosk to ensure 1 lembar kerja penuh tanpa scroll) */}
        {activeTab !== 'kiosk' && activeTab !== 'data' && (
          <footer className="bg-slate-900/60 border-t border-slate-800/80 text-slate-400 text-xs py-4 px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left mt-auto shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-white">PresensiDiklat Pro</span>
            <span>•</span>
            <span>Instalasi Diklat &amp; Pelatihan Rumah Sakit</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1 text-teal-400">
              <MapPin className="w-3 h-3" /> GPS Reverse Geocoding
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <ShieldCheck className="w-3 h-3" /> Verifikasi Presensi Resmi
            </span>
          </div>
        </footer>
        )}
      </div>

      {/* Kotak Dialog User dan Password Administrator jika dibuka dari Pengaturan / Header */}
      <AdminLoginModal
        isOpen={showLoginModal}
        isMandatory={false}
        isFullScreen={false}
        tabPreference={loginTabPreference}
        onClose={() => setShowLoginModal(false)}
        onLoginSuccess={(loggedInUser, token) => {
          if (loggedInUser?.authType === 'password') {
            setAdminSession(loggedInUser);
          } else {
            setUser(loggedInUser);
          }
          setAccessToken(token);
          setAccessTokenInMemory(token);
          setShowLoginModal(false);
        }}
        onGoogleLogin={handleLogin}
        isAuthenticating={isAuthenticating}
      />

    </div>
  );
}
