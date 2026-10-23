import React, { useState, useEffect } from 'react';
import {
  X,
  HelpCircle,
  KeyRound,
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  RotateCcw,
  Send,
  Check,
} from 'lucide-react';

export interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultUser?: string;
  isAdmin?: boolean;
  onPasswordReset?: (newPassword: string, username: string) => void;
  onPasswordChanged?: (newPassword: string, username: string) => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  defaultUser = 'adeirwanh4',
  isAdmin = false,
  onPasswordReset,
  onPasswordChanged,
}) => {
  const [username, setUsername] = useState(defaultUser || 'adeirwanh4');
  const [mode, setMode] = useState<'new_password' | 'restore_default'>('new_password');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);

  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Countdown timer for resending OTP
  useEffect(() => {
    if (otpCountdown > 0) {
      const timer = setTimeout(() => setOtpCountdown(otpCountdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [otpCountdown]);

  useEffect(() => {
    if (isOpen) {
      if (defaultUser) {
        setUsername(defaultUser);
      }
      setNewPassword('');
      setConfirmPassword('');
      setOtp('');
      setErrorMsg(null);
      setSuccessMsg(null);
      setOtpSent(false);
      setDevOtpHint(null);
      setMode('new_password');
    }
  }, [isOpen, defaultUser]);

  if (!isOpen) return null;

  // Request OTP from server (strictly to adeirwanh4@gmail.com)
  const handleRequestOtp = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSendingOtp(true);

    try {
      const res = await fetch('/api/admin/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'adeirwanh4@gmail.com' }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Gagal mengirimkan kode OTP ke email adeirwanh4@gmail.com.');
      }

      setOtpSent(true);
      setOtpCountdown(60); // 60 seconds cooldown
      setSuccessMsg(`Kode OTP 6-digit berhasil dikirimkan ke email adeirwanh4@gmail.com! Silakan periksa Kotak Masuk atau Folder Spam.`);

      if (data.devOtp) {
        setDevOtpHint(data.devOtp);
      }
    } catch (err: any) {
      console.error('Request OTP error:', err);
      setErrorMsg(err.message || 'Gagal menghubungi server untuk mengirimkan kode OTP.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Handle Submit Reset Password with OTP
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanUser = username.trim();
    if (!cleanUser) {
      setErrorMsg('Silakan masukkan User / Email Administrator.');
      return;
    }

    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setErrorMsg('Kode OTP 6-digit wajib diisi! Silakan klik tombol "Kirim Kode OTP ke adeirwanh4@gmail.com" terlebih dahulu.');
      return;
    }

    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMsg('Format kode OTP tidak valid. Harap masukkan 6 digit angka.');
      return;
    }

    let passToSet = '';
    const resetToDefault = Boolean(isAdmin) && mode === 'restore_default';

    if (resetToDefault) {
      passToSet = 'admin123';
    } else {
      const cleanNew = newPassword.trim();
      const cleanConfirm = confirmPassword.trim();

      if (!cleanNew) {
        setErrorMsg('Silakan masukkan kata sandi baru yang diinginkan.');
        return;
      }

      if (cleanNew.length < 4) {
        setErrorMsg('Kata sandi baru minimal harus 4 karakter.');
        return;
      }

      if (cleanNew !== cleanConfirm) {
        setErrorMsg('Konfirmasi kata sandi tidak cocok. Harap periksa kembali.');
        return;
      }

      passToSet = cleanNew;
    }

    setLoading(true);
    try {
      const adminSessionRaw = typeof window !== 'undefined' ? localStorage.getItem('presensi_admin_session') : null;
      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: cleanUser,
          newPassword: passToSet,
          resetToDefault,
          otp: cleanOtp,
          isAdmin: Boolean(isAdmin),
          adminToken: adminSessionRaw ? 'admin_session_active' : undefined,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || 'Gagal mengatur ulang kata sandi administrator.');
      }

      const msg = data?.message || `Password berhasil diverifikasi dengan OTP dan diatur ulang menjadi "${passToSet}"!`;
      setSuccessMsg(msg);
      if (typeof window !== 'undefined') {
        localStorage.setItem('presensi_admin_custom_password', passToSet);
      }

      if (onPasswordReset) {
        onPasswordReset(passToSet, cleanUser);
      }
      if (onPasswordChanged) {
        onPasswordChanged(passToSet, cleanUser);
      }

      // Auto close dialog after 2.5 seconds
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err: any) {
      console.error('Lupa Password Reset error:', err);
      setErrorMsg(err.message || 'Terjadi kendala saat memverifikasi OTP dan mengatur ulang password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading && !sendingOtp) {
          onClose();
        }
      }}
    >
      <div
        className="bg-slate-900 border border-slate-700/90 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative text-white space-y-4 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={loading || sendingOtp}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          title="Tutup dialog"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-1.5 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/15">
            <KeyRound className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Verifikasi Keamanan OTP Email Super Admin</span>
          </div>

          <h3 className="text-xl font-black tracking-tight text-white pt-1">
            Lupa Password Administrator
          </h3>
          <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
            Fungsi lupa password diproteksi penuh. Anda harus memasukkan <strong>Kode OTP</strong> yang dikirimkan ke email <strong>adeirwanh4@gmail.com</strong>.
          </p>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-start gap-2.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold block">{successMsg}</span>
              <p className="text-[11px] text-emerald-200/90 leading-relaxed">
                Password baru telah aktif untuk user <code>{username}</code>. Anda dapat langsung login.
              </p>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Info Bawaan Sistem - HANYA DITAMPILKAN KEPADA ADMIN */}
        {isAdmin && (
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 space-y-1.5 animate-in fade-in">
            <div className="flex items-center justify-between text-slate-300">
              <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Password Standar Bawaan Sistem:</span>
              </span>
              <span className="font-mono font-bold text-teal-300 bg-teal-500/15 px-2.5 py-0.5 rounded-lg border border-teal-500/30">
                admin123
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Sebagai Administrator, Anda juga dapat memulihkan ke <code>admin123</code> dengan tetap menyertakan kode OTP verifikasi email.
            </p>
          </div>
        )}

        {/* Mode Selector Tabs - HANYA TERLIHAT & BISA DILAKUKAN OLEH ADMIN */}
        {isAdmin && (
          <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl gap-1 animate-in fade-in">
            <button
              type="button"
              onClick={() => setMode('new_password')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'new_password'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Buat Password Baru</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('restore_default')}
              className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                mode === 'restore_default'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Pulihkan ke Bawaan</span>
            </button>
          </div>
        )}

        {/* Form Lupa Password */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* User / Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-teal-400" />
                <span>User / Akun Administrator Target:</span>
              </span>
              <span className="text-[10px] text-teal-400/80 font-mono">adeirwanh4</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Contoh: adeirwanh4 atau adeirwanh4@gmail.com"
              className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 font-mono transition-colors"
            />
          </div>

          {/* SECTION OTP: PENGIRIMAN & INPUT KODE OTP */}
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-teal-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-teal-300">
                <ShieldCheck className="w-4 h-4 text-teal-400" />
                <span>Email Tujuan OTP:</span>
              </div>
              <span className="font-mono text-[11px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                adeirwanh4@gmail.com
              </span>
            </div>

            {/* Tombol Kirim Kode OTP */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={sendingOtp || otpCountdown > 0}
                onClick={handleRequestOtp}
                className="w-full py-2 px-3 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/40 text-teal-300 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {sendingOtp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mengirimkan OTP...</span>
                  </>
                ) : otpCountdown > 0 ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>OTP Terkirim (Kirim Ulang dalam {otpCountdown}s)</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5 text-teal-400" />
                    <span>{otpSent ? 'Kirim Ulang Kode OTP ke Email' : 'Kirim Kode OTP ke adeirwanh4@gmail.com'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Hint / Dev Helper for Immediate Testing */}
            {devOtpHint && (
              <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-[11px] text-teal-300 flex items-center justify-between">
                <span>Kode OTP Anda: <strong className="font-mono text-xs text-white">{devOtpHint}</strong></span>
                <button
                  type="button"
                  onClick={() => setOtp(devOtpHint)}
                  className="px-2 py-0.5 bg-teal-500 text-slate-950 font-bold text-[10px] rounded cursor-pointer hover:bg-teal-400"
                >
                  Isi Otomatis
                </button>
              </div>
            )}

            {/* Kolom Input Kode OTP */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
                <span>Masukkan Kode OTP 6 Digit:</span>
                <span className="text-[10px] text-slate-400">Wajib diisi</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 digit angka (contoh: 849201)"
                  className="w-full bg-slate-900 border border-teal-500/50 text-teal-300 font-mono font-bold tracking-widest text-center rounded-xl py-2.5 text-base sm:text-lg focus:outline-none focus:border-teal-400 shadow-inner transition-colors"
                />
              </div>
            </div>
          </div>

          {mode === 'new_password' ? (
            <>
              {/* Kata Sandi Baru */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-teal-400" />
                  <span>Password Baru yang Diinginkan:</span>
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Masukkan password baru (minimal 4 karakter)"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Konfirmasi Kata Sandi Baru */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>Ulangi Password Baru (Konfirmasi):</span>
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang password baru di atas"
                    className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-300">
                <RotateCcw className="w-4 h-4" />
                <span>Konfirmasi Pemulihan ke Password Bawaan</span>
              </div>
              <p className="leading-relaxed text-slate-300 text-[11px]">
                Dengan opsi ini, password untuk akun <code>{username}</code> akan direset kembali ke password standar bawaan:
              </p>
              <div className="font-mono font-bold text-sm text-center py-2 bg-slate-950/80 rounded-lg border border-amber-500/40 text-amber-300">
                admin123
              </div>
              <p className="text-[10px] text-slate-400">
                Pemulihan tetap memvalidasi kode OTP yang dikirimkan ke <strong>adeirwanh4@gmail.com</strong>.
              </p>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              disabled={loading || sendingOtp}
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || sendingOtp || !otp.trim()}
              className={`flex-2 py-2.5 rounded-xl font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98 ${
                mode === 'restore_default'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 shadow-amber-500/20'
                  : 'bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 shadow-teal-500/20'
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Memverifikasi OTP...</span>
                </>
              ) : mode === 'restore_default' ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  <span>Verifikasi OTP &amp; Pulihkan</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Verifikasi OTP &amp; Reset Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
