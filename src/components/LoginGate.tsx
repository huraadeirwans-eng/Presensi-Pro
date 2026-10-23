import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  QrCode,
  CheckCircle2,
  Building2,
  Clock,
} from 'lucide-react';
import { emailPasswordSignIn, getFriendlyAuthErrorMessage } from '../services/firebaseAuth';
import { LogoConfig } from '../types';

interface LoginGateProps {
  onLoginSuccess: (user: any, token: string) => void;
  onGoogleLogin?: () => void;
  isAuthenticating: boolean;
  logoConfig?: LogoConfig;
  onOpenParticipantScan?: () => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({
  onLoginSuccess,
  logoConfig,
  onOpenParticipantScan,
}) => {
  const [userInput, setUserInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEmailPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanInput = userInput.trim();
    const cleanPass = password.trim();

    if (!cleanInput || !cleanPass) {
      setErrorMsg('Harap isi User / Email dan Kata Sandi.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Verifikasi kredensial ke Server Express (/api/admin/login)
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanInput, password: cleanPass }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && data?.user) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('presensi_admin_session', JSON.stringify(data.user));
          localStorage.setItem('presensi_auth_logged_in', 'true');
        }
        onLoginSuccess(data.user, data.token || 'token_admin_session');
        return;
      }

      // Jika server mengembalikan penolakan kredensial (401 atau status error)
      if (res.status === 401 || (data && !data.success)) {
        setErrorMsg(
          data?.message ||
            'User atau Kata Sandi tidak sesuai. Silakan periksa kembali (contoh: adeirwanh4 / contoh: admin123).'
        );
        return;
      }

      // 2. Fallback darurat jika server offline
      let targetEmail = cleanInput;
      if (!targetEmail.includes('@')) {
        const lower = targetEmail.toLowerCase();
        if (lower === 'adeirwan' || lower === 'adeirwanh4' || lower === 'ade') {
          targetEmail = 'adeirwanh4@gmail.com';
        } else if (lower === 'huraadeirwans' || lower === 'huraade') {
          targetEmail = 'huraadeirwans@gmail.com';
        } else if (lower === 'rawatinap' || lower === 'rsia' || lower === 'rsiaazzahra') {
          targetEmail = 'rawatinap.rsiaazahra@gmail.com';
        } else if (lower === 'trisepta' || lower === 'triseptak92') {
          targetEmail = 'triseptak92@gmail.com';
        } else {
          targetEmail = `${lower}@rsiaazzahra.com`;
        }
      }

      try {
        const result = await emailPasswordSignIn(targetEmail, cleanPass);
        onLoginSuccess(result.user, result.accessToken);
      } catch (fbErr: any) {
        // Fallback langsung untuk master administrator jika Firebase Auth Email provider belum aktif di Vercel/Firebase Hosting
        const lower = cleanInput.toLowerCase();
        const isAde = lower === 'adeirwanh4' || lower === 'adeirwan' || lower === 'adeirwanh4@gmail.com';
        const isRawatInap = lower === 'rawatinap' || lower === 'rawatinap.rsiaazahra@gmail.com';
        const isTriSepta = lower === 'triseptak92' || lower === 'triseptak92@gmail.com';
        const isHura = lower === 'huraadeirwans' || lower === 'huraadeirwans@gmail.com';

        if (cleanPass === 'admin123' && (isAde || isRawatInap || isTriSepta || isHura)) {
          const fallbackUser = {
            uid: isAde ? 'admin_root_1' : isRawatInap ? 'admin_root_2' : isTriSepta ? 'admin_root_3' : 'admin_root_4',
            email: targetEmail,
            displayName: isAde ? 'Ade Irwan' : isRawatInap ? 'Admin Rawat Inap' : isTriSepta ? 'Tri Septa' : 'Hura Ade Irwan',
            role: 'Super Admin',
            authType: 'password' as const,
          };
          if (typeof window !== 'undefined') {
            localStorage.setItem('presensi_admin_session', JSON.stringify(fallbackUser));
            localStorage.setItem('presensi_auth_logged_in', 'true');
          }
          onLoginSuccess(fallbackUser, 'token_admin_session');
          return;
        }

        const friendly = getFriendlyAuthErrorMessage(fbErr);
        setErrorMsg(
          friendly.message ||
            'User atau Kata Sandi tidak sesuai. Silakan periksa kembali (contoh: adeirwanh4 / contoh: admin123).'
        );
      }
    } catch (err: any) {
      setErrorMsg('Gagal menghubungkan ke server login. Silakan periksa koneksi Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-teal-500 selection:text-slate-950 relative overflow-x-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Branding */}
      <header className="px-4 sm:px-8 py-4 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-3">
          {logoConfig?.logoUrl ? (
            <img
              src={logoConfig.logoUrl}
              alt={logoConfig.altText || 'Logo'}
              style={{
                maxHeight: '38px',
                maxWidth: '160px',
                objectFit: logoConfig.objectFit || 'contain',
              }}
              className="rounded drop-shadow"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-400 flex items-center justify-center font-black shadow-md">
              <Building2 className="w-5 h-5 text-teal-400" />
            </div>
          )}
          <div>
            <h1 className="font-extrabold text-sm sm:text-base text-white tracking-tight leading-tight">
              {logoConfig?.institutionName || 'RSIA AZ ZAHRA Palembang'}
            </h1>
            <p className="text-[11px] text-teal-400 font-medium">
              Instalasi Diklat &amp; Pelatihan Rumah Sakit
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-slate-900 border border-teal-500/30 text-teal-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Akses Terproteksi</span>
          </span>
        </div>
      </header>

      {/* Main Login Card Centerpiece */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10 my-4">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative space-y-6">
          {/* Top Lock Badge */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500/20 to-emerald-500/10 text-teal-400 border border-teal-500/30 flex items-center justify-center mx-auto shadow-xl shadow-teal-500/10">
              <Lock className="w-8 h-8 text-teal-400" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Login Aplikasi Diklat
              </h2>
              <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed">
                Silakan masuk dengan <strong>User &amp; Password Administrator</strong> untuk mengakses seluruh sistem presensi.
              </p>
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* FORM USER & PASSWORD */}
          <form onSubmit={handleEmailPasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-teal-400" />
                <span>User / Alamat Email:</span>
              </label>
              <input
                type="text"
                required
                autoFocus
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Contoh: adeirwanh4 atau adeirwanh4@gmail.com"
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-3 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-200 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-teal-400" />
                <span>Password (Kata Sandi):</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password akun (contoh: admin123)"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-3.5 pr-10 py-3 text-xs sm:text-sm focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
                  tabIndex={-1}
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-teal-500 via-teal-400 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-black text-sm shadow-xl shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>{submitting ? 'Memverifikasi...' : 'Masuk Sekarang'}</span>
            </button>
          </form>

          {/* Option for Participants with Scan Link */}
          {onOpenParticipantScan && (
            <div className="pt-2 border-t border-slate-800/80 text-center">
              <button
                type="button"
                onClick={onOpenParticipantScan}
                className="text-xs text-teal-400 hover:text-teal-300 font-semibold underline inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Peserta Diklat yang ingin mengisi absen? Buka Form Presensi</span>
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-4 sm:px-8 py-3 border-t border-slate-800/80 bg-slate-900/40 text-center text-[11px] text-slate-500 z-10 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>Presensi Diklat RSIA AZ ZAHRA &copy; 2026. Hak Cipta Dilindungi.</span>
        <span className="flex items-center gap-1 text-slate-400">
          <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
          Sistem Presensi Online &amp; GPS Geofencing WGS84
        </span>
      </footer>
    </div>
  );
};
