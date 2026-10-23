import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  QrCode,
  Calendar,
  BookOpen,
  UserCheck,
  Table,
  Settings,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Sparkles,
  MapPin,
  X,
  Stethoscope,
  Filter,
  BarChart3,
  KeyRound,
  HelpCircle,
} from 'lucide-react';
import { LogoConfig } from '../types';
import { getSavedLogoConfig, defaultLogoConfig } from '../services/storage';

interface SidebarProps {
  user: User | null;
  activeTab: 'scan' | 'kiosk' | 'events' | 'badge' | 'data' | 'settings';
  setActiveTab: (tab: 'scan' | 'kiosk' | 'events' | 'badge' | 'data' | 'settings') => void;
  dataSubTab?: 'rekap' | 'chart';
  setDataSubTab?: (tab: 'rekap' | 'chart') => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  onOpenChangePassword?: () => void;
  isAuthenticating: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  activeTab,
  setActiveTab,
  dataSubTab = 'rekap',
  setDataSubTab,
  onLogin,
  onLogout,
  onOpenSettings,
  onOpenChangePassword,
  isAuthenticating,
  isOpenMobile,
  onCloseMobile,
}) => {
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(defaultLogoConfig);

  useEffect(() => {
    setLogoConfig(getSavedLogoConfig());

    const handleLogoUpdate = (e: any) => {
      if (e.detail) setLogoConfig(e.detail);
    };

    window.addEventListener('presensi_logo_updated', handleLogoUpdate);
    return () => {
      window.removeEventListener('presensi_logo_updated', handleLogoUpdate);
    };
  }, []);

  const menuItems = [
    {
      id: 'kiosk' as const,
      title: 'Layar Proyektor Diklat',
      subtitle: 'Full Screen / Aula Pelatihan',
      badge: 'Utama',
      icon: Calendar,
    },
    {
      id: 'events' as const,
      title: 'Materi / Sesi Diklat',
      subtitle: 'Daftar Sesi, Jadwal & QR Code',
      badge: null,
      icon: BookOpen,
    },
    {
      id: 'scan' as const,
      title: 'QR Presensi Diklat',
      subtitle: 'Scan QR & Dialog Presensi',
      badge: null,
      icon: QrCode,
    },
    {
      id: 'badge' as const,
      title: 'Kartu Peserta Diklat',
      subtitle: 'ID Badge Digital Peserta',
      badge: null,
      icon: UserCheck,
    },
    {
      id: 'data' as const,
      title: 'Rekapitulasi Presensi',
      subtitle: 'Tabel Kehadiran & Ekspor Excel',
      badge: null,
      icon: Table,
    },
    {
      id: 'settings' as const,
      title: 'Pengaturan Aplikasi',
      subtitle: 'Geofence, Radius & Logo',
      badge: null,
      icon: Settings,
    },
  ];

  const handleSelectTab = (tab: 'scan' | 'kiosk' | 'events' | 'badge' | 'data' | 'settings') => {
    setActiveTab(tab);
    if (tab === 'data' && setDataSubTab) {
      setDataSubTab('rekap');
    }
    onCloseMobile();
  };

  const handleSelectSubTab = (sub: 'rekap' | 'chart') => {
    setActiveTab('data');
    if (setDataSubTab) {
      setDataSubTab(sub);
    }
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm lg:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-72 sm:w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 overflow-y-auto text-white transition-transform duration-300 ease-in-out shadow-2xl lg:shadow-none ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top: Branding & Close Button on Mobile */}
        <div>
          <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
            {logoConfig.showInSidebar && logoConfig.logoUrl ? (
              <div className="flex flex-col items-start gap-1 min-w-0 pr-2">
                <img
                  src={logoConfig.logoUrl}
                  alt={logoConfig.altText || logoConfig.institutionName || 'Logo'}
                  style={{
                    maxWidth: '100%',
                    height: `${Math.min(logoConfig.height, 42)}px`,
                    objectFit: logoConfig.objectFit,
                  }}
                  className="rounded drop-shadow"
                />
                <span className="text-[10px] text-teal-400 font-bold tracking-tight">
                  {logoConfig.institutionName || 'Diklat & Pelatihan'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-emerald-400 p-0.5 shadow-md shadow-teal-500/15 flex items-center justify-center shrink-0">
                  <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                    <QrCode className="w-4.5 h-4.5 text-teal-400" />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-base tracking-tight text-white">
                      Presensi<span className="text-teal-400">Diklat</span>
                    </span>
                    <span className="px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider rounded bg-teal-500/15 text-teal-300 border border-teal-500/30">
                      PRO
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium truncate">
                    Presensi GPS &amp; Geofence
                  </p>
                </div>
              </div>
            )}

            {/* Close Button on Mobile */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>



          {/* VERTICAL MENU LIST (DISUSUN KE BAWAH) */}
          <div className="px-3 mt-4 space-y-1.5">
            <span className="px-3 text-[10px] uppercase font-bold text-slate-300 tracking-wider block mb-2">
              MENU UTAMA
            </span>

            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const isDataMenu = item.id === 'data';

              return (
                <div key={item.id} className="space-y-1">
                  <button
                    onClick={() => handleSelectTab(item.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all text-left group ${
                      isActive
                        ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 font-bold shadow-lg shadow-teal-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`p-2 rounded-lg shrink-0 ${
                          isActive
                            ? 'bg-slate-950/20 text-slate-950'
                            : 'bg-slate-950 text-teal-400 border border-slate-800 group-hover:border-slate-700'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold truncate">
                            {item.title}
                          </span>
                          {item.badge && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider ${
                                isActive
                                  ? 'bg-slate-950 text-teal-300'
                                  : item.badge === 'Utama'
                                  ? 'bg-teal-500/20 text-teal-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[11px] truncate mt-0.5 ${
                            isActive ? 'text-slate-900/90 font-medium' : 'text-slate-400'
                          }`}
                        >
                          {item.subtitle}
                        </p>
                      </div>
                    </div>

                    {isDataMenu && isActive ? (
                      <ChevronDown className="w-4 h-4 shrink-0 text-slate-950" />
                    ) : (
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isActive ? 'text-slate-950 translate-x-0.5' : 'text-slate-600 group-hover:text-slate-400'
                        }`}
                      />
                    )}
                  </button>

                  {/* Sub-menu items untuk Menu Rekap Data Presensi (hanya tampil saat menu ini aktif) */}
                  {isDataMenu && isActive && (
                    <div className="ml-5 pl-2.5 border-l-2 border-teal-500/40 space-y-1 py-1 animate-in fade-in slide-in-from-top-1">
                      {/* Sub-menu 1: Filter & Rekapitulasi Presensi (Default Utama) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSubTab('rekap');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all text-left group ${
                          isActive && dataSubTab === 'rekap'
                            ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                        title="Filter & Rekapitulasi Presensi"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Filter className={`w-3.5 h-3.5 shrink-0 ${isActive && dataSubTab === 'rekap' ? 'text-teal-400' : 'text-slate-500'}`} />
                          <span className="truncate">Filter &amp; Rekapitulasi</span>
                        </div>
                      </button>

                      {/* Sub-menu 2: Grafik Batang Harian Peserta Diklat */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectSubTab('chart');
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all text-left group ${
                          isActive && dataSubTab === 'chart'
                            ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                        title="Grafik Batang Harian Peserta Diklat"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <BarChart3 className={`w-3.5 h-3.5 shrink-0 ${isActive && dataSubTab === 'chart' ? 'text-teal-400' : 'text-slate-500'}`} />
                          <span className="truncate">Grafik Batang Harian</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Sidebar: User Profile & Status */}
        <div className="p-4 border-t border-slate-800/90 bg-slate-950/50 space-y-3">
          {/* User Account if logged in */}
          {user ? (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-8 h-8 rounded-full border border-teal-400/40 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-white truncate text-xs">
                    {user.displayName || 'Pengguna Admin'}
                  </p>
                  <p className="text-[10px] text-teal-400 flex items-center gap-1 truncate">
                    <ShieldCheck className="w-2.5 h-2.5" /> Akun Terhubung
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                  title="Keluar / Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={onLogin}
              disabled={isAuthenticating}
              type="button"
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Masuk Sebagai Admin</span>
            </button>
          )}

          {/* GPS Status Indicator */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
            <span className="flex items-center gap-1.5 text-teal-400">
              <MapPin className="w-3.5 h-3.5" />
              <span>GPS Satelit Aktif</span>
            </span>
            <span className="text-[10px] text-slate-400">
              v2.1 Diklat
            </span>
          </div>
        </div>
      </aside>
    </>
  );
};
