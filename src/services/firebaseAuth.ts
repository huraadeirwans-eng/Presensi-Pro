import { initializeApp, getApps, getApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';

// Inisialisasi Firebase langsung menggunakan firebase-applet-config.json sesuai standar AI Studio
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Test connection on boot per Firebase skill guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Koneksi Firebase offline atau memeriksa konfigurasi.");
    }
  }
}
if (typeof window !== 'undefined') {
  testConnection();
}

export const SCOPES: string[] = [];

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to indicate ongoing sign-in flow
let isSigningIn = false;
// Cache the access token in memory (never localStorage / sessionStorage)
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      try {
        const token = await user.getIdToken();
        cachedAccessToken = token;
        if (onAuthSuccess) onAuthSuccess(user, token);
      } catch {
        if (cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
        } else if (!isSigningIn) {
          cachedAccessToken = null;
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken || (await result.user.getIdToken());
    if (!token) {
      throw new Error('Gagal mendapatkan token autentikasi Google.');
    }

    cachedAccessToken = token;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Error saat Sign In Google:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Masuk menggunakan Email dan Kata Sandi Administrator
 */
export const emailPasswordSignIn = async (
  email: string,
  pass: string
): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithEmailAndPassword(auth, email.trim(), pass);
    const token = await result.user.getIdToken();
    cachedAccessToken = token;
    return { user: result.user, accessToken: token };
  } catch (error: any) {
    console.warn('Info Sign In Firebase Auth:', error?.code || error?.message || error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Daftarkan Admin Baru dengan Email & Kata Sandi tanpa memutus sesi login admin saat ini
 * Menggunakan secondary Firebase App instance
 */
export const registerAdminWithEmailPassword = async (
  email: string,
  pass: string,
  displayName: string
): Promise<{ uid: string; email: string }> => {
  const secondaryAppName = `admin-reg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  let secondaryApp: any = null;
  try {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const result = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), pass);

    if (displayName.trim()) {
      try {
        await updateProfile(result.user, { displayName: displayName.trim() });
      } catch (profErr) {
        console.warn('Could not set displayName on secondary auth user:', profErr);
      }
    }

    const uid = result.user.uid;
    await signOut(secondaryAuth);
    return { uid, email: email.trim() };
  } catch (err: any) {
    console.error('Gagal mendaftarkan admin baru di Firebase Auth:', err);
    throw err;
  } finally {
    if (secondaryApp) {
      try {
        await deleteApp(secondaryApp);
      } catch {}
    }
  }
};

/**
 * Kirim email reset sandi Firebase ke alamat email admin
 */
export const sendAdminPasswordResetEmail = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email.trim());
  } catch (err: any) {
    console.error('Error sending password reset email:', err);
    throw err;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setAccessTokenInMemory = (token: string | null) => {
  cachedAccessToken = token;
};

export const logout = async () => {
  try {
    await signOut(auth);
  } finally {
    cachedAccessToken = null;
  }
};

export interface FriendlyAuthError {
  code?: string;
  title: string;
  message: string;
  tip: string;
  troubleshootingSteps: string[];
}

export const getFriendlyAuthErrorMessage = (error: any): FriendlyAuthError => {
  const code = String(error?.code || '');
  const rawMsg = String(error?.message || '');

  // 1. Popup diblokir browser
  if (code === 'auth/popup-blocked') {
    return {
      code,
      title: 'Jendela Pop-up Login Diblokir Browser',
      message: 'Browser Anda memblokir jendela Google Sign-In otomatis.',
      tip: 'Chrome atau Edge di browser Anda secara otomatis mencegah pembukaan jendela pop-up.',
      troubleshootingSteps: [
        'Perhatikan ujung kanan Address Bar (kolom URL browser di atas), biasanya muncul ikon tanda silang merah bertuliskan "Pop-up blocked".',
        'Klik ikon tersebut, pilih opsi "Selalu izinkan pop-up dan pengalihan dari situs ini".',
        'Klik tombol Selesai, lalu klik tombol "Coba Masuk Lagi" di bawah.',
      ],
    };
  }

  // 2. Domain tidak terdaftar di Firebase
  if (code === 'auth/unauthorized-domain') {
    const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'domain aplikasi';
    return {
      code,
      title: 'Domain Belum Diizinkan (Unauthorized Domain)',
      message: `Domain "${currentHost}" belum terdaftar di Firebase Console Authorized Domains.`,
      tip: 'Login Google memerlukan pendaftaran domain di Firebase. Namun Anda dapat langsung masuk menggunakan User & Password.',
      troubleshootingSteps: [
        'Solusi Instan: Masuk menggunakan tab "User & Password" di portal login (berfungsi 100% tanpa kendala domain).',
        `Untuk mengaktifkan Login Google: Buka Firebase Console > Authentication > Settings > Authorized domains > Tambahkan domain "${currentHost}".`,
      ],
    };
  }

  // 3. User menutup jendela popup sebelum selesai
  if (code === 'auth/popup-closed-by-user') {
    return {
      code,
      title: 'Jendela Login Ditutup Terlalu Cepat',
      message: 'Jendela verifikasi Google ditutup sebelum Anda memilih akun dan memberikan izin.',
      tip: 'Proses login dibatalkan karena jendela pop-up ditutup.',
      troubleshootingSteps: [
        'Klik tombol "Coba Masuk Lagi" di bawah.',
        'Biarkan jendela Google tetap terbuka hingga Anda selesai memilih akun email Anda.',
        'Klik "Lanjutkan" / "Izinkan" saat diminta verifikasi akun.',
      ],
    };
  }

  // 4. Operasi tidak diizinkan / provider belum aktif
  if (code === 'auth/operation-not-allowed') {
    return {
      code,
      title: 'Penyedia Google Belum Diaktifkan di Firebase',
      message: 'Metode otentikasi Google belum diaktifkan pada konsol Firebase.',
      tip: 'Firebase Authentication memerlukan status Enable pada provider Google.',
      troubleshootingSteps: [
        'Buka Firebase Console -> Project Authentication -> tab Sign-in method.',
        'Pastikan opsi "Google" berstatus Enabled dan simpan konfigurasi.',
      ],
    };
  }

  // 5. Gangguan koneksi internet
  if (code === 'auth/network-request-failed') {
    return {
      code,
      title: 'Gagal Menghubungi Server Google (Koneksi)',
      message: 'Terjadi masalah pada koneksi internet perangkat Anda.',
      tip: 'Komputer tidak dapat melakukan jabat tangan keamanan dengan server Google.',
      troubleshootingSteps: [
        'Periksa apakah komputer Anda terhubung ke internet dengan baik.',
        'Jika menggunakan VPN atau Proxy kantor, coba nonaktifkan sementara.',
        'Segarkan halaman browser (F5) lalu coba masuk kembali.',
      ],
    };
  }

  // 6. Izin akses ditolak / mode testing Google OAuth
  if (rawMsg.includes('access_denied') || rawMsg.includes('testing')) {
    return {
      code: code || 'oauth/access_denied',
      title: 'Izin Akun Google Ditolak (OAuth Testing Mode)',
      message: 'Aplikasi Google Cloud saat ini berada dalam mode pengujian (Testing).',
      tip: 'Hanya email yang didaftarkan sebagai "Test User" di Google Cloud Console yang diizinkan masuk.',
      troubleshootingSteps: [
        'Pastikan Anda login menggunakan akun Google pengembang atau akun yang terdaftar sebagai Test User.',
        'Atau manfaatkan fitur penyimpanan lokal dan tombol download Excel/CSV yang tidak memerlukan login akun Google.',
      ],
    };
  }

  // Fallback umum
  // 7. Password salah / user tidak ditemukan (Email & Password)
  if (
    code === 'auth/invalid-credential' ||
    code === 'auth/wrong-password' ||
    code === 'auth/user-not-found'
  ) {
    return {
      code,
      title: 'Email atau Kata Sandi Salah',
      message: 'Kombinasi email dan kata sandi yang Anda masukkan tidak sesuai atau belum terdaftar.',
      tip: 'Pastikan email dan kata sandi diketik dengan benar dan akun telah didaftarkan oleh Administrator.',
      troubleshootingSteps: [
        'Periksa kembali penulisan huruf besar/kecil (Caps Lock) pada kata sandi.',
        'Pastikan email yang digunakan sudah terdaftar di menu Pengaturan -> Kelola Admin.',
        'Hubungi Super Admin jika Anda lupa kata sandi akun.',
      ],
    };
  }

  // 8. Email sudah terdaftar
  if (code === 'auth/email-already-in-use') {
    return {
      code,
      title: 'Email Sudah Terdaftar',
      message: 'Alamat email ini sudah terdaftar di sistem otentikasi Firebase.',
      tip: 'Gunakan email lain atau masuk langsung menggunakan email tersebut.',
      troubleshootingSteps: [
        'Gunakan alamat email berbeda untuk admin baru yang ingin didaftarkan.',
        'Atau coba langsung masuk dengan email tersebut menggunakan formulir Login Admin.',
      ],
    };
  }

  // 9. Password terlalu lemah
  if (code === 'auth/weak-password') {
    return {
      code,
      title: 'Kata Sandi Terlalu Pendek / Lemah',
      message: 'Firebase mewajibkan kata sandi memiliki panjang minimal 6 karakter.',
      tip: 'Gunakan kombinasi minimal 6 karakter yang aman.',
      troubleshootingSteps: [
        'Ketik kata sandi dengan minimal 6 karakter.',
        'Gunakan kombinasi huruf dan angka agar lebih aman.',
      ],
    };
  }

  // 10. Format email salah
  if (code === 'auth/invalid-email') {
    return {
      code,
      title: 'Format Email Tidak Valid',
      message: 'Format alamat email yang Anda masukkan tidak sesuai standar email.',
      tip: 'Pastikan format email seperti contoh: nama@instansi.com',
      troubleshootingSteps: [
        'Periksa apakah ada spasi atau karakter yang salah ketik pada alamat email.',
      ],
    };
  }

  // 11. Terlalu banyak percobaan gagal
  if (code === 'auth/too-many-requests') {
    return {
      code,
      title: 'Terlalu Banyak Percobaan Masuk',
      message: 'Akses ke akun ini dinonaktifkan sementara karena terlalu banyak percobaan masuk yang gagal.',
      tip: 'Sistem keamanan Firebase mengunci sementara untuk mencegah brute-force.',
      troubleshootingSteps: [
        'Tunggu beberapa menit sebelum mencoba masuk kembali.',
        'Pastikan memasukkan kata sandi yang benar.',
      ],
    };
  }

  return {
    code: code || 'auth/unknown',
    title: 'Tidak Dapat Masuk ke Akun',
    message: rawMsg || 'Terjadi kendala saat melakukan otorisasi akun.',
    tip: 'Hal ini biasanya terjadi karena pemblokiran pop-up browser, cookie pihak ketiga diblokir, atau koneksi jaringan.',
    troubleshootingSteps: [
      'Pastikan membuka web via tautan resmi aplikasi.',
      'Periksa kembali email dan kata sandi Anda jika masuk dengan password.',
      'Gunakan menu "Rekapitulasi Presensi" untuk mengekspor data absensi ke format Excel (.xlsx) tanpa perlu login.',
    ],
  };
};

