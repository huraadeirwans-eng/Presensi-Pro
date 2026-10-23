import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  UserCheck,
  Download,
  Printer,
  ShieldCheck,
  Building,
  CreditCard,
  Mail,
  User,
  Sparkles,
} from 'lucide-react';
import {
  getSavedUserProfile,
  saveUserProfile,
  getSavedLogoConfig,
  defaultLogoConfig,
} from '../services/storage';
import { LogoConfig } from '../types';
import { UNIT_KERJA_OPTIONS, PROFESI_OPTIONS } from './AttendanceDialogModal';

export const ParticipantBadgeView: React.FC = () => {
  const [profile, setProfile] = useState(getSavedUserProfile());
  const [badgeQrUrl, setBadgeQrUrl] = useState<string>('');
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(defaultLogoConfig);
  const [unitKerjaSelect, setUnitKerjaSelect] = useState<string>(
    profile.department && UNIT_KERJA_OPTIONS.includes(profile.department as any)
      ? profile.department
      : 'Emergency Unit'
  );
  const [unitLainnya, setUnitLainnya] = useState<string>(
    profile.department && !UNIT_KERJA_OPTIONS.includes(profile.department as any)
      ? profile.department
      : ''
  );
  const [profesiSelect, setProfesiSelect] = useState<string>(
    profile.profession && (PROFESI_OPTIONS as readonly string[]).includes(profile.profession)
      ? profile.profession
      : 'Perawat'
  );
  const [profesiLainnya, setProfesiLainnya] = useState<string>(
    profile.profession && !(PROFESI_OPTIONS as readonly string[]).includes(profile.profession)
      ? profile.profession
      : ''
  );

  useEffect(() => {
    setLogoConfig(getSavedLogoConfig());
    const handleLogoUpdate = (e: any) => {
      if (e.detail) setLogoConfig(e.detail);
    };
    window.addEventListener('presensi_logo_updated', handleLogoUpdate);
    return () => window.removeEventListener('presensi_logo_updated', handleLogoUpdate);
  }, []);

  useEffect(() => {
    const finalUnit = unitKerjaSelect === 'Lainnya' ? unitLainnya : unitKerjaSelect;
    const finalProfesi = profesiSelect === 'Lainnya' ? profesiLainnya : profesiSelect;
    const payload = JSON.stringify({
      type: 'PRESENSI_QR_PARTICIPANT',
      name: profile.name || 'Peserta Diklat',
      identityNumber: profile.identityNumber || '',
      department: finalUnit || '',
      profession: finalProfesi || '',
      generatedAt: Date.now(),
    });

    QRCode.toDataURL(payload, {
      width: 320,
      margin: 1,
      color: {
        dark: '#031b33',
        light: '#ffffff',
      },
    })
      .then((url) => {
        setBadgeQrUrl(url);
      })
      .catch((err) => {
        console.error('Badge QR error:', err);
      });
  }, [profile, unitKerjaSelect, unitLainnya, profesiSelect, profesiLainnya]);

  const handleDownload = () => {
    if (!badgeQrUrl) return;
    const a = document.createElement('a');
    a.href = badgeQrUrl;
    a.download = `Kartu_Peserta_Diklat_${(profile.name || 'Peserta').replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  const activeUnitDisplay = unitKerjaSelect === 'Lainnya' ? unitLainnya : unitKerjaSelect;
  const activeProfesiDisplay = profesiSelect === 'Lainnya' ? profesiLainnya : profesiSelect;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <UserCheck className="w-6 h-6 text-teal-400" />
              Kartu Peserta Diklat Pelatihan
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Kartu identitas digital peserta untuk presensi cepat pada kegiatan pelatihan dan diklat rumah sakit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-teal-400" />
              <span>Simpan QR</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Kartu</span>
            </button>
          </div>
        </div>

        {/* Layout: Edit Info Form & Live ID Card Preview */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-6 space-y-4">
            <h3 className="font-bold text-sm text-teal-300 uppercase tracking-wider">
              Data Peserta Diklat
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nama Lengkap:
              </label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => {
                  const up = { ...profile, name: e.target.value };
                  setProfile(up);
                  saveUserProfile(up);
                }}
                placeholder="Nama Lengkap Peserta"
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                NIK (No. Induk Karyawan):
              </label>
              <input
                type="text"
                value={profile.identityNumber}
                onChange={(e) => {
                  const up = { ...profile, identityNumber: e.target.value };
                  setProfile(up);
                  saveUserProfile(up);
                }}
                placeholder="Nomor Induk Karyawan (NIK)"
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Unit Kerja:
              </label>
              <select
                value={unitKerjaSelect}
                onChange={(e) => {
                  setUnitKerjaSelect(e.target.value);
                  const final = e.target.value === 'Lainnya' ? unitLainnya : e.target.value;
                  const up = { ...profile, department: final };
                  setProfile(up);
                  saveUserProfile(up);
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
              >
                {UNIT_KERJA_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {unitKerjaSelect === 'Lainnya' && (
              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1">
                  Sebutkan Unit Kerja:
                </label>
                <input
                  type="text"
                  value={unitLainnya}
                  onChange={(e) => {
                    setUnitLainnya(e.target.value);
                    const up = { ...profile, department: e.target.value };
                    setProfile(up);
                    saveUserProfile(up);
                  }}
                  placeholder="Ketik unit kerja..."
                  className="w-full bg-slate-950 border border-teal-500/40 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Profesi:
              </label>
              <select
                value={profesiSelect}
                onChange={(e) => {
                  setProfesiSelect(e.target.value);
                  const final = e.target.value === 'Lainnya' ? profesiLainnya : e.target.value;
                  const up = { ...profile, profession: final };
                  setProfile(up);
                  saveUserProfile(up);
                }}
                className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
              >
                {PROFESI_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            {profesiSelect === 'Lainnya' && (
              <div>
                <label className="block text-xs font-semibold text-teal-300 mb-1">
                  Sebutkan Profesi:
                </label>
                <input
                  type="text"
                  value={profesiLainnya}
                  onChange={(e) => {
                    setProfesiLainnya(e.target.value);
                    const up = { ...profile, profession: e.target.value };
                    setProfile(up);
                    saveUserProfile(up);
                  }}
                  placeholder="Ketik profesi..."
                  className="w-full bg-slate-950 border border-teal-500/40 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                />
              </div>
            )}
          </div>

          {/* Right: Badge Card Preview */}
          <div className="md:col-span-6 flex justify-center">
            <div className="w-full max-w-xs bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-teal-500/40 rounded-3xl p-5 shadow-2xl text-center relative overflow-hidden">
              <div className="w-10 h-2 bg-slate-950 rounded-full mx-auto mb-3 border border-slate-700"></div>

              {/* Custom Landscape Logo on Badge (only if user uploaded logo) */}
              {logoConfig.showInBadge && logoConfig.logoUrl && (
                <div className="flex justify-center mb-3 pb-2 border-b border-slate-700/60">
                  <img
                    src={logoConfig.logoUrl}
                    alt={logoConfig.altText || logoConfig.institutionName || 'Logo'}
                    style={{
                      maxWidth: '100%',
                      maxHeight: `${Math.min(logoConfig.height, 42)}px`,
                      objectFit: logoConfig.objectFit,
                    }}
                    className="drop-shadow"
                  />
                </div>
              )}

              <div className="flex items-center justify-between text-left border-b border-slate-700/80 pb-3 mb-4">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-teal-400 tracking-wider block">
                    {logoConfig.institutionName || 'Peserta Diklat'}
                  </span>
                  <span className="text-xs font-bold text-white">
                    {activeUnitDisplay || 'Unit Kerja'}
                  </span>
                </div>
                <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>

              <div className="bg-white p-3 rounded-2xl shadow-inner inline-block mx-auto mb-4">
                {badgeQrUrl ? (
                  <img
                    src={badgeQrUrl}
                    alt="QR Peserta Diklat"
                    className="w-40 h-40 object-contain rounded-lg"
                  />
                ) : (
                  <div className="w-40 h-40 flex items-center justify-center bg-slate-100 text-slate-400 text-xs">
                    Membuat QR...
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <h4 className="font-extrabold text-base text-white tracking-tight">
                  {profile.name || 'Nama Peserta Diklat'}
                </h4>
                <p className="font-mono text-xs text-teal-300 font-bold">
                  {profile.identityNumber ? `NIK: ${profile.identityNumber}` : 'NIK Belum Diisi'}
                </p>
                <div className="flex items-center justify-center gap-1.5 flex-wrap pt-1">
                  <span className="px-2 py-0.5 rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold">
                    {activeProfesiDisplay || 'Perawat'}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                    {activeUnitDisplay || 'Unit Kerja'}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/90 flex items-center justify-center gap-1.5 text-[10px] text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Terverifikasi Diklat Rumah Sakit</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

