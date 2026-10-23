# Aplikasi Presensi & Diklat RSIA AZ ZAHRA Palembang

Sistem Presensi Pelatihan & Diklat dengan QR Code Dinamis, Validasi Geofencing GPS RSIA AZ ZAHRA, Rekapitulasi Otomatis, dan Integrasi Google Sheets.

---

## 🎯 Peran Arsitektur: GitHub ➔ Firebase ➔ Vercel

| Layanan | Peran & Fungsi Utama |
| :--- | :--- |
| **GitHub** | **Tempat Menyimpan File & Source Code** — Menyimpan seluruh kode program secara aman, memudahkan backup, version control, dan terhubung langsung ke Vercel untuk build otomatis (*CI/CD*). |
| **Firebase** | **Real-time Cloud Sync & Auth** — Memastikan setiap presensi baru yang discan di HP peserta langsung **berubah otomatis seketika di laptop admin dan HP lainnya** tanpa perlu refresh. Juga menangani Google Sign-In & token Sheets. |
| **Vercel** | **Hosting & Deployment (HTTPS)** — Menayangkan website aplikasi secara online 24/7 dengan domain aman HTTPS resmi, sehingga **kamera scanner QR dan GPS di HP peserta langsung terbuka otomatis** dari jaringan mana pun (Wi-Fi maupun kuota 4G/5G). |

---

## 🚀 Panduan Langkah Deployment

### 1️⃣ Langkah 1: Push ke GitHub (Simpan File)

Buka Terminal di folder project ini:

```bash
# 1. Pastikan semua file masuk ke staging
git add .

# 2. Buat commit pertama
git commit -m "feat: Sistem Presensi RSIA AZ ZAHRA siap deploy Vercel"

# 3. Ubah nama branch utama ke main
git branch -M main

# 4. Hubungkan ke repository GitHub Anda (ganti USERNAME dan REPO_NAME)
git remote add origin https://github.com/USERNAME/REPO_NAME.git

# 5. Push ke GitHub
git push -u origin main
```

---

### 2️⃣ Langkah 2: Konfigurasi Firebase Console

Aplikasi ini menggunakan **Firebase Authentication & Firestore** untuk sinkronisasi cloud real-time antar perangkat dan export Sheets.

1. Buka [Firebase Console](https://console.firebase.google.com/).
2. Pilih project Firebase Anda: `advance-rex-66tvw` (Database ID: `ai-studio-presensiqrproabs-45ba0ad9-4693-4ae5-bd94-382d122ea107`).
3. Masuk ke menu **Build** > **Authentication** > tab **Sign-in method**:
   - Pastikan provider **Email/Password** dan **Google** dalam status **Enabled**.
4. Masuk ke tab **Settings** di Authentication > pilih **Authorized Domains**:
   - Klik **Add Domain**.
   - Masukkan domain live Anda (misal: `nama-project.vercel.app` atau domain kustom Anda).
   - *(Penting: Langkah ini memastikan otentikasi Google Sign-In berjalan mulus di URL produksi Vercel).*
5. File `firebase.json`, `.firebaserc`, dan `firestore.rules` sudah siap secara otomatis di dalam repository jika Anda ingin men-deploy via Firebase CLI (`firebase deploy`).

---

### 3️⃣ Langkah 3: Deploy ke Vercel

1. Buka [Vercel](https://vercel.com/) dan login menggunakan akun GitHub Anda.
2. Klik tombol **Add New...** ➔ **Project**.
3. Pilih repository GitHub yang baru saja Anda push.
4. Pada bagian **Configure Project**:
   - **Framework Preset**: Pilih **Vite**.
   - **Root Directory**: `./` (default).
   - **Build Command**: `npm run build` (otomatis terdeteksi).
   - **Output Directory**: `dist` (otomatis terdeteksi).
5. Konfigurasi `vercel.json` dan `api/index.ts` sudah disertakan di repository, sehingga endpoint API backend (`/api/*`) dan client SPA langsung berjalan otomatis tanpa konfigurasi rumit tambahan.
6. Klik **Deploy**!
7. Dalam kurun waktu 1 menit, website Anda sudah aktif dengan URL publik HTTPS resmi dari Vercel (misal: `https://presensi-rsia-azzahra.vercel.app`).

---

## 📱 Keunggulan Akses di HP melalui Vercel (HTTPS)

- **Kamera Langsung Terbuka**: Browser HP (Chrome / Safari) mensyaratkan protokol aman HTTPS agar izin kamera scanner QR bisa dibuka otomatis.
- **GPS Akurat & Instan**: Geolocation GPS dengan radius geofencing 85m RSIA AZ ZAHRA langsung diizinkan oleh sistem operasi Android & iOS.
- **Bisa Diakses dari Jaringan Mana Saja**: Peserta diklat bisa menggunakan paket data 4G/5G seluler maupun Wi-Fi mana saja tanpa kendala firewall `http://192.168.137.1:3000`.

---

## 🛠️ Menjalankan di Komputer Lokal (Development)

```bash
# Install dependencies
npm install

# Jalankan server lokal
npm run dev

# Akses via browser
http://localhost:3000
```
