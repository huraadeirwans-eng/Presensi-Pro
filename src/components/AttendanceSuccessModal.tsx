import React, { useRef } from 'react';
import {
  CheckCircle2,
  MapPin,
  ExternalLink,
  Printer,
  X,
  Clock,
  User,
  ShieldCheck,
  Building,
} from 'lucide-react';
import { AttendanceRecord } from '../types';

interface AttendanceSuccessModalProps {
  record: AttendanceRecord;
  onClose: () => void;
}

export const AttendanceSuccessModal: React.FC<AttendanceSuccessModalProps> = ({
  record,
  onClose,
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-6 h-6 text-white" />
            <h3 className="font-extrabold text-lg tracking-tight">Presensi Berhasil Dicatat!</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Printable Body */}
        <div className="p-6 overflow-y-auto space-y-5" ref={printRef}>
          {/* Status Badge */}
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between text-emerald-300 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Status: <strong className="text-emerald-200">Kehadiran Sah &amp; Terverifikasi</strong></span>
            </div>
          </div>

          {/* Attendance Receipt Ticket */}
          <div className="border border-slate-700 bg-slate-950 rounded-xl p-4.5 space-y-3.5 text-xs sm:text-sm">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-teal-400 tracking-wider">
                  BUKTI PRESENSI PESERTA DIKLAT PELATIHAN
                </span>
                <h4 className="text-base font-bold text-white mt-0.5">{record.eventName}</h4>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2.5 py-1 font-bold rounded-lg border text-xs ${
                  record.status === 'Terlambat' || (record.keterangan && record.keterangan !== 'Tepat Waktu')
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {record.status}
                </span>
                {record.keterangan && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    record.status === 'Terlambat' || record.keterangan !== 'Tepat Waktu'
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                  }`}>
                    {record.keterangan}
                  </span>
                )}
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3 text-slate-300">
              <div>
                <span className="text-slate-400 text-[11px] block">Nama Peserta Diklat:</span>
                <strong className="text-white text-sm font-semibold">{record.name}</strong>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">NIK (No. Induk Karyawan):</span>
                <span className="text-slate-200 font-mono font-semibold">{record.identityNumber || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Unit Kerja:</span>
                <span className="text-teal-300 font-medium">{record.department || '-'}</span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Keterangan Ketepatan Waktu:</span>
                <span className={`inline-flex items-center gap-1 font-bold text-xs mt-0.5 px-2 py-0.5 rounded ${
                  record.status === 'Terlambat' || (record.keterangan && record.keterangan !== 'Tepat Waktu')
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}>
                  <Clock className="w-3 h-3" />
                  <span>{record.keterangan || (record.status === 'Terlambat' ? 'Telah di ikuti beberapa menit' : 'Tepat Waktu')}</span>
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-slate-800/80">
                <span className="text-slate-400 text-[11px] block">Waktu Presensi &amp; Jam Masuk:</span>
                <span className="text-slate-200 font-medium flex items-center gap-1 text-xs">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{record.timestamp}</span>
                  {record.entryTime && (
                    <span className="text-teal-300 ml-1 font-mono">({record.entryTime})</span>
                  )}
                </span>
              </div>
            </div>

            {/* Location Section */}
            <div className="border-t border-slate-800/80 pt-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px] flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-400" />
                  Lokasi Terdeteksi Otomatis:
                </span>
                {record.accuracy > 0 && (
                  <span className="text-[10px] font-semibold text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                    Akurasi GPS: ±{Math.round(record.accuracy)} m
                  </span>
                )}
              </div>

              <p className="text-slate-200 font-medium leading-relaxed bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-xs">
                {record.address}
              </p>

              {record.latitude !== 0 && (
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>
                    Koordinat: {record.latitude.toFixed(6)}, {record.longitude.toFixed(6)}
                  </span>
                  <a
                    href={record.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 hover:text-teal-300 flex items-center gap-1 font-semibold"
                  >
                    Buka Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Sync details */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>ID Referensi: <code className="font-mono text-slate-300">{record.id}</code></span>
            <span className="text-emerald-400 font-semibold">✅ Status: Tersimpan</span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Bukti</span>
          </button>

          <button
            onClick={onClose}
            className="flex-1 sm:flex-none px-6 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
          >
            Selesai / Scan Lagi
          </button>
        </div>
      </div>
    </div>
  );
};
