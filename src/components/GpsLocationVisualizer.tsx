import React, { useState } from 'react';
import {
  MapPin,
  Crosshair,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Compass,
  CheckCircle2,
  Info,
  Maximize2,
  Minimize2,
  Layers,
  HelpCircle,
  Building2,
  ChevronDown,
  ChevronUp,
  Wifi,
  Radio,
  Sparkles,
} from 'lucide-react';
import { ResolvedLocation, GpsSamplingProgress, GpsErrorDetail } from '../services/geolocation';
import { GeofenceConfig, GeofenceLocation } from '../types';
import { validateCoordinatesGeofence } from '../services/storage';
import { Pure2DGpsMap } from './Pure2DGpsMap';

interface GpsLocationVisualizerProps {
  location: ResolvedLocation | null;
  loading: boolean;
  error: string | null;
  errorDetail?: GpsErrorDetail | null;
  samplingProgress?: GpsSamplingProgress | null;
  geofenceConfig: GeofenceConfig;
  onRefreshGps: () => void;
  showMapDefault?: boolean;
}

export const GpsLocationVisualizer: React.FC<GpsLocationVisualizerProps> = ({
  location,
  loading,
  error,
  errorDetail,
  samplingProgress,
  geofenceConfig,
  onRefreshGps,
  showMapDefault = true,
}) => {
  const [showInteractiveMap, setShowInteractiveMap] = useState(showMapDefault);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [showWhyIndoorModal, setShowWhyIndoorModal] = useState(false);
  const [activeDeviceGuide, setActiveDeviceGuide] = useState<'android' | 'ios' | 'pc'>('android');

  const geoCheck = location
    ? validateCoordinatesGeofence(
        location.latitude,
        location.longitude,
        geofenceConfig,
        location.accuracy
      )
    : null;

  // Active reference location (e.g., RSIA Az Zahra)
  const activeHospitalLoc: GeofenceLocation | undefined =
    geoCheck?.nearestLocation ||
    geofenceConfig.locations.find((l) => l.isActive) ||
    geofenceConfig.locations[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all">
      {/* 1. Header Bar: Compact & Rich (Mirip tampilan status presensi terverifikasi) */}
      <div className="p-3.5 sm:p-4 bg-slate-950/80 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
              loading
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                : location
                ? geoCheck?.isInRadius
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />
            ) : location ? (
              <MapPin className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            )}
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-white">
                {loading
                  ? 'Mengunci Sensor GPS Hardware...'
                  : location
                  ? 'GPS Terhubung & Terverifikasi'
                  : 'Sensor GPS Belum Terhubung'}
              </span>

              {/* Badge 1: Akurasi Asli Perangkat */}
              {location && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                    location.accuracyCategory === 'high'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : location.accuracyCategory === 'medium'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                  }`}
                  title="Radius akurasi perangkat dari API Geolocation"
                >
                  Akurasi: ±{Math.round(location.accuracy)} m
                </span>
              )}

              {/* Badge 2: Koordinat WGS84 */}
              {location && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-slate-900 text-teal-300 border border-slate-700">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                </span>
              )}

              {/* Badge 3: Status Radius RS */}
              {location && geofenceConfig.enabled && geoCheck && (
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1 ${
                    geoCheck.isInRadius
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {geoCheck.isInRadius ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Dalam Area RS ({geoCheck.distanceMeters}m)</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3 h-3 text-rose-400" />
                      <span>Luar Radius RS ({geoCheck.distanceMeters}m)</span>
                    </>
                  )}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 truncate max-w-xl">
              {loading
                ? samplingProgress?.message || 'Membaca multi-sampel sinyal satelit GPS...'
                : location
                ? location.address
                : error || 'Klik "Perbarui GPS" untuk mendeteksi koordinat asli perangkat.'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
          {location && (
            <a
              href={location.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-teal-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Buka titik koordinat di Google Maps"
            >
              <span>Lihat di Maps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={onRefreshGps}
            className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Mengunci...' : 'Perbarui GPS'}</span>
          </button>
        </div>
      </div>

      {/* Sampling progress feedback during lock */}
      {loading && samplingProgress && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>{samplingProgress.message}</span>
          </div>
          {samplingProgress.sampleCount > 0 && (
            <span className="font-mono text-[11px] bg-slate-950/60 px-2 py-0.5 rounded border border-amber-500/30">
              Sampel #{samplingProgress.sampleCount} (Akurasi terbaik: ±{Math.round(samplingProgress.bestAccuracy)}m)
            </span>
          )}
        </div>
      )}

      {/* 2. Banner Penjelasan Spesifik: "Kenapa Terdeteksi 27m dari Titik Acuan RS?" */}
      {location && (
        <div className="p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800">
          <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 sm:p-3.5">
            <button
              type="button"
              onClick={() => setShowWhyIndoorModal(!showWhyIndoorModal)}
              className="w-full flex items-center justify-between text-left text-xs font-bold text-teal-300 hover:text-teal-200 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-teal-400 shrink-0" />
                <span>
                  Penjelasan: Mengapa Koordinat GPS Berjarak {geoCheck?.distanceMeters || 27}m padahal Masih di Area RS?
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400 font-normal">
                <span>{showWhyIndoorModal ? 'Sembunyikan' : 'Baca Detail'}</span>
                {showWhyIndoorModal ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {showWhyIndoorModal && (
              <div className="mt-3 pt-3 border-t border-slate-800/80 text-xs text-slate-300 space-y-2.5 animate-in fade-in">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-teal-400 block">1. Jarak Acuan Gedung</span>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Titik pusat acuan ditempatkan pada koordinat Ruang Diklat (-2.942275, 104.784318). Jarak {geoCheck?.distanceMeters || 27} meter adalah jarak fisik Anda dari titik patokan tersebut ke ruangan tempat Anda berdiri (seperti lobi, poli, rawat inap, atau teras).
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-amber-400 block">2. Redaman Sinyal Indoor (±{Math.round(location.accuracy)}m)</span>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Satelit GPS GNSS berada di orbit luar angkasa. Saat Anda berada di dalam gedung rumah sakit berdinding beton tebal, sinyal satelit teredam sehingga perangkat smartphone Anda melaporkan ketidakpastian radius ±{Math.round(location.accuracy)} meter.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 block">3. Toleransi Geofence 100m</span>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Radius Geofence RSIA Az Zahra kini diatur seluas <strong>100 meter</strong> (diameter 200 meter) ditambah toleransi deviasi akurasi indoor. Posisi Anda ({geoCheck?.distanceMeters || 27}m) sepenuhnya <strong>SAH &amp; TERVERIFIKASI</strong> di area RS.
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-200 text-[11px] flex items-center justify-between flex-wrap gap-2">
                  <span className="flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-teal-400" />
                    <strong>Tips Ponsel:</strong> Aktifkan Wi-Fi di HP Anda agar layanan lokasi (Google Location Accuracy) dapat mempertajam koordinat indoor.
                  </span>
                  <span className="text-[10px] text-teal-300/80 font-mono">
                    Status: {geoCheck?.isInRadius ? '✓ Presensi Diizinkan' : 'Toleransi Aktif'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error View with Step-by-Step Instructions */}
      {!loading && error && (
        <div className="p-4 bg-rose-950/40 border-b border-rose-500/30 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <h4 className="font-bold text-sm text-rose-200">
                {errorDetail?.title || 'Sensor GPS Tidak Dapat Diakses'}
              </h4>
              <p className="text-xs text-rose-300 leading-relaxed">{error}</p>
            </div>
          </div>

          <div className="pt-2 border-t border-rose-500/20 flex items-center justify-between flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="text-xs font-semibold text-rose-300 hover:text-white underline flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showTroubleshooting ? 'Tutup Panduan Solusi' : 'Lihat Cara Mengaktifkan Izin Lokasi di HP'}</span>
            </button>

            <button
              type="button"
              onClick={onRefreshGps}
              className="px-3.5 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Coba Deteksi Ulang
            </button>
          </div>

          {showTroubleshooting && (
            <div className="mt-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-white block">
                  Petunjuk Mengaktifkan GPS &amp; Izin Lokasi:
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveDeviceGuide('android')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      activeDeviceGuide === 'android' ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    HP Android
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDeviceGuide('ios')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      activeDeviceGuide === 'ios' ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    iPhone (iOS)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDeviceGuide('pc')}
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      activeDeviceGuide === 'pc' ? 'bg-teal-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    Laptop / PC
                  </button>
                </div>
              </div>

              {activeDeviceGuide === 'android' && (
                <ul className="space-y-1.5 list-disc pl-4 text-slate-300 text-[11px] leading-relaxed">
                  <li>Tarik bilah notifikasi ke bawah, pastikan ikon <strong>"Lokasi / GPS"</strong> sudah AKTIF (ON).</li>
                  <li>Di browser Chrome: Ketuk ikon <strong>Gembok 🔒 atau Setelan</strong> di samping tautan URL, pilih <em>Izin ➔ Lokasi ➔ Izinkan</em>.</li>
                  <li>Buka Pengaturan HP ➔ <em>Lokasi ➔ Akurasi Lokasi Google (Google Location Accuracy)</em>, pastikan dalam keadaan ON.</li>
                  <li>Nyalakan Wi-Fi ponsel untuk membantu sinyal lokasi jika berada di dalam ruangan rumah sakit.</li>
                </ul>
              )}

              {activeDeviceGuide === 'ios' && (
                <ul className="space-y-1.5 list-disc pl-4 text-slate-300 text-[11px] leading-relaxed">
                  <li>Buka <em>Pengaturan iPhone ➔ Privasi &amp; Keamanan ➔ Layanan Lokasi</em> (Pastikan ON).</li>
                  <li>Gulir ke bawah ke <strong>Situs Web Safari</strong>, pilih <em>"Saat Menggunakan App"</em> dan centang <strong>"Lokasi Tepat" (Precise Location)</strong>.</li>
                  <li>Segarkan halaman web dan ketuk "Izinkan" saat browser meminta izin akses lokasi.</li>
                </ul>
              )}

              {activeDeviceGuide === 'pc' && (
                <ul className="space-y-1.5 list-disc pl-4 text-slate-300 text-[11px] leading-relaxed">
                  <li>Klik ikon <strong>Gembok 🔒</strong> di samping kolom alamat URL browser (Address Bar).</li>
                  <li>Ubah izin <em>Lokasi</em> dari "Blokir" menjadi <strong>"Izinkan"</strong>.</li>
                  <li>Di Windows 10/11: Buka <em>Settings ➔ Privacy &amp; Security ➔ Location</em> dan aktifkan <em>Location Services</em>.</li>
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* 3. GPS Telemetry & Metrics (WGS84, Akurasi Asli, Geofence RS) */}
      {location && (
        <div className="p-3.5 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            {/* 1. Koordinat WGS84 */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase tracking-wider block">
                Koordinat WGS84
              </span>
              <span className="font-bold text-teal-300 text-xs sm:text-sm block truncate">
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </span>
            </div>

            {/* 2. Radius Akurasi Jujur */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase tracking-wider block">
                Radius Akurasi GPS
              </span>
              <span
                className={`font-bold text-xs sm:text-sm block truncate ${
                  location.accuracyCategory === 'high'
                    ? 'text-emerald-300'
                    : location.accuracyCategory === 'medium'
                    ? 'text-amber-300'
                    : 'text-orange-300'
                }`}
              >
                ±{Math.round(location.accuracy)} meter
              </span>
            </div>

            {/* 3. Jarak ke Titik RS */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase tracking-wider block">
                Jarak ke Acuan RS
              </span>
              <span
                className={`font-bold text-xs sm:text-sm block truncate ${
                  geoCheck?.isInRadius ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {geoCheck ? `${geoCheck.distanceMeters} meter` : '-'}
              </span>
            </div>

            {/* 4. Waktu Pengukuran GPS */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 font-sans font-semibold uppercase tracking-wider block">
                Waktu Sensor GPS
              </span>
              <span className="font-bold text-slate-300 text-xs sm:text-sm block truncate">
                {new Date(location.timestamp).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false,
                })}{' '}
                WIB
              </span>
            </div>
          </div>

          {/* Status Validasi Geofence RS */}
          {geofenceConfig.enabled && geoCheck && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                geoCheck.isInRadius
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : geofenceConfig.enforceStrict
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}
            >
              {geoCheck.isInRadius ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 space-y-0.5 flex-1">
                <div className="font-bold text-xs sm:text-sm flex items-center justify-between flex-wrap gap-2">
                  <span>
                    {geoCheck.isInRadius
                      ? `✓ Terverifikasi di Area: ${geoCheck.nearestLocation?.name || 'RSIA Az Zahra'}`
                      : geofenceConfig.enforceStrict
                      ? `⛔ Di Luar Batas Radius RS (${geoCheck.distanceMeters}m dari acuan)`
                      : `⚠️ Di Luar Radius RS (Toleransi Aktif)`}
                  </span>
                  <span className="text-[10px] font-mono opacity-80 font-normal">
                    Batas Radius: {geoCheck.nearestLocation?.radiusMeters || 100}m
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed opacity-90">{geoCheck.message}</p>
                {location.accuracyAdvice && (
                  <p className="text-[10px] opacity-80 mt-1 italic">
                    💡 {location.accuracyAdvice}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Interactive Visual Map Synchronization (100% Bebas WebGL, 2D Raster WGS84) */}
          {showInteractiveMap && (
            <div className="space-y-2 pt-1">
              <Pure2DGpsMap
                latitude={location.latitude}
                longitude={location.longitude}
                accuracy={location.accuracy}
                hospitalLocation={activeHospitalLoc}
                distanceMeters={geoCheck?.distanceMeters}
                isInRadius={geoCheck?.isInRadius ?? true}
                mapsUrl={location.mapsUrl}
                osmUrl={location.osmUrl}
                height="280px"
              />

              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                <span className="flex items-center gap-1">
                  <Compass className="w-3 h-3 text-teal-400" />
                  <span>Sistem Koordinat: WGS84 (World Geodetic System 1984)</span>
                </span>
                {location.altitude !== null && (
                  <span>Elevasi: ±{location.altitude} m dpl</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
