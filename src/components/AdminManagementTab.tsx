import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  Search,
  Lock,
  UserCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminUserRecord } from '../types';
import { registerAdminWithEmailPassword, auth } from '../services/firebaseAuth';
import {
  saveAdminUserToCloud,
  deleteAdminUserFromCloud,
  subscribeAdminUsersRealtime,
} from '../services/firestoreSync';
import { ForgotPasswordModal } from './ForgotPasswordModal';

export const AdminManagementTab: React.FC = () => {
  const [admins, setAdmins] = useState<AdminUserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Change password modal state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalUser, setPasswordModalUser] = useState('adeirwanh4');

  // Delete modal state
  const [adminToDelete, setAdminToDelete] = useState<AdminUserRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'Super Admin' | 'Admin Diklat' | 'Petugas Presensi'>('Admin Diklat');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch initial admins from server
  const fetchAdminsFromServer = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users');
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.admins && Array.isArray(data.admins)) {
          setAdmins(data.admins);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat daftar admin dari server:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminsFromServer();

    // Subscribe to realtime cloud updates from Firestore
    const unsubscribe = subscribeAdminUsersRealtime((cloudAdmins) => {
      if (cloudAdmins && Array.isArray(cloudAdmins) && cloudAdmins.length > 0) {
        setAdmins((prev) => {
          if (prev.length === 0) return cloudAdmins;

          // Merge: Preserve server state deletions, only sync updated fields for valid admins
          const map = new Map<string, AdminUserRecord>();
          prev.forEach((a) => map.set(a.email.toLowerCase(), a));

          cloudAdmins.forEach((ca) => {
            const key = ca.email.toLowerCase();
            if (map.has(key)) {
              map.set(key, { ...map.get(key)!, ...ca });
            }
          });
          return Array.from(map.values());
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password.trim();
    const cleanName = name.trim();

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFeedback({ type: 'error', message: 'Masukkan format email yang valid (contoh: nama@rsiaazzahra.com).' });
      return;
    }

    if (!cleanPass || cleanPass.length < 6) {
      setFeedback({ type: 'error', message: 'Kata sandi minimal harus 6 karakter.' });
      return;
    }

    if (cleanPass !== confirmPassword.trim()) {
      setFeedback({ type: 'error', message: 'Konfirmasi kata sandi tidak cocok. Silakan periksa kembali.' });
      return;
    }

    // Check if email already exists in list
    const existing = admins.find((a) => a.email.toLowerCase() === cleanEmail);
    if (existing) {
      setFeedback({
        type: 'error',
        message: `Admin dengan email "${cleanEmail}" sudah terdaftar sebelumnya.`,
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Register user in Firebase Authentication
      let registeredUid = '';
      try {
        const authRes = await registerAdminWithEmailPassword(cleanEmail, cleanPass, cleanName);
        registeredUid = authRes.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-in-use') {
          console.info('Email already exists in Firebase Auth, registering as admin record.');
        } else {
          console.warn('Catatan: Firebase Auth registrasi sekunder:', authErr?.code || authErr?.message);
        }
      }

      const newAdmin: AdminUserRecord = {
        id: registeredUid || `admin_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        email: cleanEmail,
        name: cleanName || cleanEmail.split('@')[0],
        role: role,
        authType: 'email_password',
        password: cleanPass,
        createdAt: new Date().toISOString(),
        isActive: true,
      };

      // 2. Save to Firestore Cloud
      try {
        await saveAdminUserToCloud(newAdmin);
      } catch (cloudErr) {
        console.warn('Peringatan saat menyimpan admin ke Firestore:', cloudErr);
      }

      // 3. Save to backend server persistent storage
      const serverRes = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin),
      });

      if (!serverRes.ok) {
        const errData = await serverRes.json().catch(() => null);
        throw new Error(errData?.error || errData?.message || 'Gagal menyimpan data admin ke server.');
      }

      const serverData = await serverRes.json().catch(() => null);
      if (serverData?.admins) {
        setAdmins(serverData.admins);
      } else {
        setAdmins((prev) => [newAdmin, ...prev.filter((a) => a.email.toLowerCase() !== cleanEmail)]);
      }

      setFeedback({
        type: 'success',
        message: `✓ Admin "${cleanName || cleanEmail}" dengan peran ${role} berhasil didaftarkan! Akun ini dapat langsung login menggunakan Email dan Kata Sandi tersebut.`,
      });

      // Reset form
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setName('');
      setRole('Admin Diklat');
    } catch (err: any) {
      console.error('Gagal menambahkan admin:', err);
      let errMsg = err.message || 'Terjadi kesalahan saat menambahkan admin.';
      if (err.code === 'auth/weak-password') {
        errMsg = 'Kata sandi terlalu lemah. Minimal 6 karakter.';
      } else if (err.code === 'auth/invalid-email') {
        errMsg = 'Format alamat email tidak valid.';
      }
      setFeedback({ type: 'error', message: errMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCurrentUserEmail = (): string => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('presensi_admin_session');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.email) return String(parsed.email).toLowerCase();
        }
      } catch {}
    }
    return (auth.currentUser?.email || '').toLowerCase();
  };

  const promptDeleteAdmin = (admin: AdminUserRecord) => {
    if (admins.length <= 1) {
      setFeedback({
        type: 'error',
        message: 'Minimal harus ada 1 akun administrator di sistem. Anda tidak dapat menghapus akun terakhir.',
      });
      return;
    }

    const currentEmail = getCurrentUserEmail();
    if (currentEmail && admin.email.toLowerCase() === currentEmail) {
      setFeedback({
        type: 'error',
        message: 'Anda sedang menggunakan akun ini untuk login. Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif.',
      });
      return;
    }

    setAdminToDelete(admin);
  };

  const handleConfirmDelete = async () => {
    if (!adminToDelete) return;
    const target = adminToDelete;
    setIsDeleting(true);
    setFeedback(null);

    try {
      // 1. Delete from Server
      let updatedAdmins: AdminUserRecord[] | null = null;
      let deleteSuccess = false;
      let errorReason = '';

      // Coba delete via ID
      let res = await fetch(`/api/admin/users/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target.email }),
      });

      if (!res.ok) {
        // Fallback coba delete via Email jika ID berbeda format
        res = await fetch(`/api/admin/users/${encodeURIComponent(target.email)}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: target.email }),
        });
      }

      if (res.ok) {
        const data = await res.json().catch(() => null);
        deleteSuccess = true;
        if (data?.admins && Array.isArray(data.admins)) {
          updatedAdmins = data.admins;
        }
      } else {
        const errJson = await res.json().catch(() => null);
        errorReason = errJson?.error || 'Gagal menghapus admin dari server.';
        throw new Error(errorReason);
      }

      // 2. Delete from Firestore Cloud
      try {
        await deleteAdminUserFromCloud(target.id, target.email);
      } catch (cloudErr) {
        console.warn('Peringatan saat menghapus admin dari Firestore:', cloudErr);
      }

      // 3. Update React local state immediately
      if (updatedAdmins) {
        setAdmins(updatedAdmins);
      } else {
        setAdmins((prev) =>
          prev.filter(
            (a) =>
              a.id !== target.id &&
              a.email.toLowerCase() !== target.email.toLowerCase()
          )
        );
      }

      setFeedback({
        type: 'success',
        message: `✓ Akun administrator "${target.name} (${target.email})" berhasil dihapus dari sistem.`,
      });
      setAdminToDelete(null);
    } catch (err: any) {
      console.error('Error saat konfirmasi hapus admin:', err);
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal menghapus akun administrator.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (admin: AdminUserRecord) => {
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(admin.id)}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.admins) {
          setAdmins(data.admins);
        } else {
          setAdmins((prev) =>
            prev.map((a) => (a.id === admin.id ? { ...a, isActive: !a.isActive } : a))
          );
        }
        setFeedback({
          type: 'success',
          message: `✓ Status admin ${admin.email} berhasil diubah.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: 'Gagal mengubah status admin: ' + err.message });
    }
  };

  const copyEmailToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredAdmins = admins.filter((admin) => {
    const matchQuery =
      admin.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      admin.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchRole = roleFilter === 'all' || admin.role === roleFilter;
    return matchQuery && matchRole;
  });

  return (
    <div className="space-y-6">
      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs sm:text-sm animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span className="leading-relaxed">{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* KARTU: FASILITAS UBAH KATA SANDI ADMINISTRATOR */}
      <div className="bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-900 border border-teal-500/40 rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/40 shrink-0 shadow-lg shadow-teal-500/15">
              <KeyRound className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">Fasilitas Ubah Kata Sandi Administrator</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30">
                  Aktif
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Ganti kata sandi akun admin (contoh: <strong>adeirwanh4</strong> / <code>admin123</code>) atau akun admin terdaftar lainnya.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setPasswordModalUser('adeirwanh4');
              setShowPasswordModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 self-start sm:self-auto shrink-0"
          >
            <KeyRound className="w-4 h-4" />
            <span>Ubah Kata Sandi Sekarang</span>
          </button>
        </div>
      </div>

      {/* FORM: TAMBAH ADMIN BARU MENGGUNAKAN EMAIL DAN PASSWORD */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              OTORISASI &amp; HAK AKSES SISTEM
            </span>
            <h3 className="text-base sm:text-lg font-bold text-white mt-1 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-teal-400" />
              Tambah Administrator Baru (Email &amp; Password)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Daftarkan akun admin baru menggunakan email &amp; kata sandi. Admin yang didaftarkan dapat langsung masuk dan mengelola sistem presensi diklat.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/30 text-teal-300 text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-400" />
              Firebase Auth &amp; Cloud Sync
            </span>
          </div>
        </div>

        <form onSubmit={handleAddAdmin} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Field: Nama Lengkap */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-teal-400" />
                <span>Nama Lengkap / Panggilan Admin:</span>
                <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: dr. Budi Santoso / Ade Irwan"
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 transition-colors shadow-inner"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Nama yang akan ditampilkan di profil dan laporan.
              </p>
            </div>

            {/* Field: Alamat Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-teal-400" />
                <span>Alamat Email Admin:</span>
                <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Contoh: admin.diklat@rsiaazzahra.com"
                className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl px-3.5 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 transition-colors shadow-inner font-mono"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Email ini digunakan sebagai username saat masuk ke aplikasi.
              </p>
            </div>

            {/* Field: Kata Sandi (Password) */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-teal-400" />
                  <span>Kata Sandi (Password):</span>
                  <span className="text-rose-400">*</span>
                </span>
                <span className="text-[10px] text-slate-400">Min. 6 Karakter</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ketik kata sandi (min. 6 karakter)"
                  className="w-full bg-slate-950 border border-slate-700 text-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none focus:border-teal-400 transition-colors shadow-inner font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  tabIndex={-1}
                  title={showPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Field: Konfirmasi Kata Sandi */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-400" />
                  <span>Ulangi Kata Sandi (Konfirmasi):</span>
                  <span className="text-rose-400">*</span>
                </span>
                {confirmPassword && password === confirmPassword && (
                  <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> Cocok
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ketik ulang kata sandi di atas"
                  className={`w-full bg-slate-950 border text-white rounded-xl pl-3.5 pr-10 py-2.5 text-xs sm:text-sm focus:outline-none transition-colors shadow-inner font-mono ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-rose-500 focus:border-rose-400'
                      : 'border-slate-700 focus:border-teal-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  tabIndex={-1}
                  title={showConfirmPassword ? 'Sembunyikan sandi' : 'Tampilkan sandi'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Field: Peran / Jabatan */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
                <span>Peran / Tingkat Hak Akses:</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    role === 'Super Admin'
                      ? 'bg-amber-500/10 border-amber-500/70 text-amber-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="adminRole"
                    value="Super Admin"
                    checked={role === 'Super Admin'}
                    onChange={() => setRole('Super Admin')}
                    className="mt-0.5 text-amber-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-xs text-white block">Super Admin</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      Akses mutlak: kelola akun admin, hapus presensi, konfigurasi geofence &amp; logo.
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    role === 'Admin Diklat'
                      ? 'bg-teal-500/10 border-teal-500/70 text-teal-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="adminRole"
                    value="Admin Diklat"
                    checked={role === 'Admin Diklat'}
                    onChange={() => setRole('Admin Diklat')}
                    className="mt-0.5 text-teal-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-xs text-white block">Admin Diklat (Panitia)</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      Kelola jadwal sesi diklat, ekspor Excel, buat ID Card peserta, &amp; pantau rekapitulasi.
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                    role === 'Petugas Presensi'
                      ? 'bg-blue-500/10 border-blue-500/70 text-blue-200'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="adminRole"
                    value="Petugas Presensi"
                    checked={role === 'Petugas Presensi'}
                    onChange={() => setRole('Petugas Presensi')}
                    className="mt-0.5 text-blue-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-bold text-xs text-white block">Petugas Presensi / Operator</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      Memandu scan QR peserta di lokasi acara, verifikasi data, &amp; menampilkan proyektor.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              💡 <em>Admin baru dapat langsung masuk melalui tombol <strong>&quot;Masuk Admin&quot;</strong> di bilah atas aplikasi dengan memasukkan email dan kata sandi di atas.</em>
            </p>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-400 hover:from-teal-400 hover:to-emerald-300 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Mendaftarkan Admin...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Daftarkan Admin Baru</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* SECTION: DAFTAR ADMINISTRATOR SISTEM */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
              Daftar Administrator Terdaftar ({filteredAdmins.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Kelola status dan akun pengurus presensi diklat RSIA AZ ZAHRA Palembang.
            </p>
          </div>
          <button
            onClick={fetchAdminsFromServer}
            disabled={loading}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            title="Segarkan daftar admin"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Segarkan Data</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari berdasarkan nama atau alamat email..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400 cursor-pointer"
            >
              <option value="all">Semua Peran</option>
              <option value="Super Admin">Super Admin</option>
              <option value="Admin Diklat">Admin Diklat</option>
              <option value="Petugas Presensi">Petugas Presensi</option>
            </select>
          </div>
        </div>

        {/* Admin List Cards / Table */}
        {loading && admins.length === 0 ? (
          <div className="py-12 text-center text-slate-400 space-y-2">
            <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
            <p className="text-xs">Memuat daftar administrator...</p>
          </div>
        ) : filteredAdmins.length === 0 ? (
          <div className="py-8 text-center text-slate-400 bg-slate-950/40 rounded-xl border border-slate-800/80 p-6">
            <ShieldAlert className="w-10 h-10 text-slate-500 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-300">Tidak ada administrator yang cocok</p>
            <p className="text-xs text-slate-500 mt-1">
              Coba sesuaikan kata kunci pencarian atau filter peran di atas.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredAdmins.map((admin) => {
              const currentActiveEmail = getCurrentUserEmail();
              const isSelf = Boolean(currentActiveEmail && admin.email.toLowerCase() === currentActiveEmail);
              return (
                <div
                  key={admin.id || admin.email}
                  className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    !admin.isActive
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                      : isSelf
                      ? 'bg-gradient-to-r from-teal-500/10 via-slate-900 to-slate-950 border-teal-500/40 shadow-sm'
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                        isSelf
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/50'
                          : admin.role === 'Super Admin'
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : admin.role === 'Admin Diklat'
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                      }`}
                    >
                      {admin.name ? admin.name.charAt(0).toUpperCase() : 'A'}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">{admin.name}</span>
                        {isSelf && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30">
                            👑 Akun Anda
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            admin.role === 'Super Admin'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : admin.role === 'Admin Diklat'
                              ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                              : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          }`}
                        >
                          {admin.role}
                        </span>

                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                            admin.authType === 'email_password'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {admin.authType === 'email_password' ? '🔑 Email & Password' : '🌐 Akun Google'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                        <span>{admin.email}</span>
                        <button
                          type="button"
                          onClick={() => copyEmailToClipboard(admin.email, admin.id)}
                          className="hover:text-teal-400 transition-colors cursor-pointer"
                          title="Salin alamat email"
                        >
                          {copiedId === admin.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400 inline" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 inline" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(admin)}
                      disabled={isSelf}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        admin.isActive
                          ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                      } ${isSelf ? 'cursor-not-allowed opacity-70' : ''}`}
                      title={isSelf ? 'Akun yang sedang Anda gunakan selalu aktif' : 'Klik untuk ubah status aktif/nonaktif'}
                    >
                      {admin.isActive ? '🟢 Aktif' : '⚪ Nonaktif'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPasswordModalUser(admin.email);
                        setShowPasswordModal(true);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/15 border border-transparent hover:border-amber-500/30 transition-all cursor-pointer"
                      title={`Lupa / Reset kata sandi untuk ${admin.email}`}
                    >
                      <KeyRound className="w-4 h-4" />
                    </button>

                    {!isSelf ? (
                      <button
                        type="button"
                        onClick={() => promptDeleteAdmin(admin)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 border border-transparent hover:border-rose-500/30 transition-all cursor-pointer"
                        title={`Hapus administrator ${admin.name || admin.email}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <span
                        className="p-1.5 rounded-lg text-slate-600 cursor-not-allowed opacity-40 inline-flex"
                        title="Akun Anda yang sedang aktif tidak dapat dihapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL KONFIRMASI HAPUS ADMIN */}
      {adminToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
          onClick={() => !isDeleting && setAdminToDelete(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-white">Hapus Administrator</h4>
                  <p className="text-xs text-slate-400">Konfirmasi pencabutan hak akses sistem</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAdminToDelete(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Nama Admin:</span>
                <span className="text-xs font-bold text-white">{adminToDelete.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Email:</span>
                <span className="text-xs font-mono text-teal-300">{adminToDelete.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Peran:</span>
                <span className="text-[11px] px-2 py-0.5 rounded font-bold bg-slate-800 text-slate-300 border border-slate-700">
                  {adminToDelete.role}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Apakah Anda yakin ingin menghapus admin ini? Akun ini tidak akan dapat login lagi ke sistem presensi diklat RSIA AZ ZAHRA.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setAdminToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white text-xs font-bold shadow-lg shadow-rose-900/30 transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Admin</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fasilitas Lupa Password / Reset Kata Sandi Administrator Modal */}
      <ForgotPasswordModal
        isOpen={showPasswordModal}
        isAdmin={true}
        onClose={() => setShowPasswordModal(false)}
        defaultUser={passwordModalUser || 'adeirwanh4'}
        onPasswordReset={(_newPass, user) => {
          setFeedback({
            type: 'success',
            message: `✓ Kata sandi untuk ${user} berhasil direset / diperbarui!`,
          });
        }}
      />
    </div>
  );
};
