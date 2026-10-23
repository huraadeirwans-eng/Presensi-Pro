import React from 'react';
import { User } from 'firebase/auth';
import {
  QrCode,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  LogOut,
  MapPin,
  Calendar,
  UserCheck,
  ShieldCheck,
  Layers,
  Table,
} from 'lucide-react';

interface NavbarProps {
  user: User | null;
  activeTab: 'scan' | 'kiosk' | 'badge' | 'data' | 'settings';
  setActiveTab: (tab: 'scan' | 'kiosk' | 'badge' | 'data' | 'settings') => void;
  onLogin: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
  isAuthenticating: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  setActiveTab,
  onLogin,
  onLogout,
  onOpenSettings,
  isAuthenticating,
}) => {
  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md">
      {/* Top Banner / Status Info */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-teal-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <QrCode className="w-6 h-6 text-teal-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-white">
                  Presensi<span className="text-teal-400">Diklat</span>
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  DIKLAT PELATIHAN
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Absensi Pelatihan Online Otomatis GPS Real-Time
              </p>
            </div>
          </div>

          {/* Center / Right: Cloud Status & Google Account */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Realtime Cloud Sync Badge */}
            <div className="hidden md:flex items-center gap-1.5 bg-slate-800/90 border border-emerald-500/30 rounded-lg px-2.5 py-1 text-xs text-slate-300" title="Sinkronisasi Cloud Otomatis (Firebase Firestore) Aktif untuk Seluruh Perangkat">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">Firebase Cloud Sync</span>
            </div>

            {/* Google Sign In / User Profile */}
            {user ? (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg p-1.5 pl-2 sm:pl-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-7 h-7 rounded-full border border-teal-400/50"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:block text-left text-xs pr-1">
                  <div className="font-semibold text-slate-200 truncate max-w-[130px]">
                    {user.displayName || 'Pengguna'}
                  </div>
                  <div className="text-[10px] text-teal-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> Akun Terhubung
                  </div>
                </div>
                <button
                  onClick={onLogout}
                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors"
                  title="Keluar / Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={onLogin}
                disabled={isAuthenticating}
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Masuk Admin</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-slate-950 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm font-medium">
            <button
              onClick={() => setActiveTab('scan')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeTab === 'scan'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Presensi Diklat</span>
              <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wide bg-slate-900/40 rounded">
                Scan di Sini
              </span>
            </button>

            <button
              onClick={() => setActiveTab('kiosk')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeTab === 'kiosk'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Layar Proyektor Diklat</span>
            </button>

            <button
              onClick={() => setActiveTab('badge')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeTab === 'badge'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Kartu Peserta Diklat</span>
            </button>

            <button
              onClick={() => setActiveTab('data')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeTab === 'data'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Rekapitulasi Presensi</span>
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg whitespace-nowrap transition-all ${
                activeTab === 'settings'
                  ? 'bg-teal-500 text-slate-950 font-bold shadow-md shadow-teal-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Pengaturan</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};
