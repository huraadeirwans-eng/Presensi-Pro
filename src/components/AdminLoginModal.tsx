import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { emailPasswordSignIn, getFriendlyAuthErrorMessage } from '../services/firebaseAuth';

export interface AdminSessionUser {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  authType: 'password';
  loginTime?: number;
}

interface AdminLoginModalProps {
  isOpen: boolean;
  isMandatory?: boolean;
  isFullScreen?: boolean;
  tabPreference?: string;
  onClose: () => void;
  onLoginSuccess: (user: any, token: string) => void;
  onGoogleLogin?: () => void;
  isAuthenticating: boolean;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  isMandatory = false,
  isFullScreen = false,
  onClose,
  onLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmailPasswordSubmit = async (e?: React.FormEvent, customUser?: string, customPass?: string) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const cleanEmail = (customUser ?? email).trim();
    const cleanPass = (customPass ?? password).trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMsg('Harap isi User / Email dan Password.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Verifikasi kredensial ke Server Express (/api/admin/login)
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanEmail, password: cleanPass }),
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && data?.user) {
        // Simpan sesi login lokal agar tidak terputus saat reload
        if (typeof window !== 'undefined') {
          localStorage.setItem('presensi_admin_session', JSON.stringify(data.user));
          localStorage.setItem('presensi_auth_logged_in', 'true');
        }
        onLoginSuccess(data.user, data.token || 'token_admin_session');
        onClose();
        return;
      }

      // Jika server mengembalikan penolakan kredensial (401 atau status error)
      if (res.status === 401 || (data && !data.success)) {
        setErrorMsg(
          data?.message ||
            'User atau Password tidak sesuai. Silakan periksa kembali User dan Password Anda (contoh: admin123).'
        );
        return;
      }

      // 2. Fallback darurat jika server offline
      let targetEmail = cleanEmail;
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
        if (typeof window !== 'undefined') {
          localStorage.setItem('presensi_auth_logged_in', 'true');
        }
        onLoginSuccess(result.user, result.accessToken);
        onClose();
        return;
      } catch (fbErr: any) {
        // Fallback langsung untuk master administrator jika Firebase Auth Email provider belum aktif di Vercel/Firebase Hosting
        const lower = cleanEmail.toLowerCase();
        const isAde = lower === 'adeirwanh4' || lower === 'adeirwan' || lower === 'adeirwanh4@gmail.com';
        const isRawatInap = lower === 'rawatinap' || lower === 'rawatinap.rsiaazahra@gmail.com';
        const isTriSepta = lower === 'triseptak92' || lower === 'triseptak92@gmail.com';
        const isHura = lower === 'huraadeirwans' || lower === 'huraadeirwans@gmail.com';

        const savedCustomPass = typeof window !== 'undefined' ? localStorage.getItem('presensi_admin_custom_password') : null;
        const isPasswordValid = cleanPass === 'admin123' || (savedCustomPass && cleanPass === savedCustomPass);

        if (isPasswordValid && (isAde || isRawatInap || isTriSepta || isHura)) {
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
          onClose();
          return;
        }

        const friendly = getFriendlyAuthErrorMessage(fbErr);
        setErrorMsg(
          friendly.message ||
            'User atau Password tidak sesuai. Silakan periksa kembali User dan Password Anda (contoh: admin123).'
        );
      }
    } catch (err: any) {
      setErrorMsg('Gagal terhubung ke server autentikasi. Silakan periksa jaringan Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalBody = (
    <div className="bg-slate-900 border border-slate-700/90 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative text-white space-y-4 my-auto">
      {/* Close Button - Hanya jika TIDAK mandatory */}
      {!isMandatory && (
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          title="Tutup dialog"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      {/* Modal Header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/15 text-teal-400 border border-teal-500/30 flex items-center justify-center mx-auto shadow-lg shadow-teal-500/15">
            <Lock className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>{isMandatory ? 'Wajib Masuk (Log In) Untuk Akses Website' : 'Autentikasi Administrator'}</span>
          </div>

          <h3 className="text-xl font-black tracking-tight text-white pt-1">
            Kotak User &amp; Password
          </h3>
          <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
            {isMandatory
              ? 'Anda harus masuk terlebih dahulu sebelum dapat mengakses seluruh fitur & data pada website Presensi Diklat.'
              : 'Silakan masukkan User dan Password Administrator untuk mengelola sistem Presensi Diklat.'}
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* FORM USER & PASSWORD */}
        <form onSubmit={handleEmailPasswordSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-teal-400" />
              <span>User / Email Administrator:</span>
            </label>
            <input
              type="text"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Contoh: adeirwanh4 atau adeirwanh4@gmail.com"
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 transition-colors font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-teal-400" />
              <span>Password (Kata Sandi):</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan Password (contoh: admin123)"
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Tombol Masuk */}
          <div className="space-y-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>{submitting ? 'Memverifikasi Akses...' : 'Masuk Sekarang (Log In)'}</span>
            </button>
          </div>
        </form>
      </div>
  );

  return (
    <>
      {isFullScreen ? (
        modalBody
      ) : (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
          onClick={(e) => {
            // Jika mandatory (wajib login), jangan tutup dialog saat klik luar
            if (!isMandatory && e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          {modalBody}
        </div>
      )}
    </>
  );
};
