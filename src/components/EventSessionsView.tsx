import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  BookOpen,
  Plus,
  Calendar,
  Clock,
  Building,
  Users,
  QrCode,
  Download,
  Copy,
  Check,
  Share2,
  ExternalLink,
  Edit2,
  Trash2,
  Search,
  Sparkles,
  Maximize2,
  AlertCircle,
  X,
} from 'lucide-react';
import { EventSession, AttendanceRecord } from '../types';
import {
  getSavedEvents,
  saveEvents,
  getSavedAttendanceLogs,
  syncAttendanceWithServer,
} from '../services/storage';
import { fetchAttendanceFromCloud } from '../services/firestoreSync';

interface EventSessionsViewProps {
  onSelectEventForKiosk: (eventId: string) => void;
  onOpenScan: (eventId: string) => void;
}

export const EventSessionsView: React.FC<EventSessionsViewProps> = ({
  onSelectEventForKiosk,
  onOpenScan,
}) => {
  const [events, setEvents] = useState<EventSession[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventForModal, setSelectedEventForModal] = useState<EventSession | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [modalQRDataUrl, setModalQRDataUrl] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [publicCloudUrl, setPublicCloudUrl] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      return window.location.origin;
    }
    return 'https://ais-dev-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';
  });
  const [copiedModalLink, setCopiedModalLink] = useState(false);

  // Form Modal State (Add / Edit)
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formOrg, setFormOrg] = useState('Diklat & Pelatihan');
  const [formDesc, setFormDesc] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formStartTime, setFormStartTime] = useState('08:00');
  const [formEndTime, setFormEndTime] = useState('16:00');
  const [formRequireLocation, setFormRequireLocation] = useState(true);

  // Delete Confirmation State
  const [eventToDelete, setEventToDelete] = useState<EventSession | null>(null);

  // Load events and attendance logs
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 4000);

    fetch('/api/network-info')
      .then((r) => (r.ok ? r.json().catch(() => null) : null))
      .then((data) => {
        if (data?.publicUrl) setPublicCloudUrl(data.publicUrl);
      })
      .catch(() => {});

    return () => clearInterval(interval);
  }, []);

  const getBaseOrigin = () => {
    try {
      const customHost = localStorage.getItem('presensi_qr_custom_host') || '';
      if (customHost.trim()) {
        return customHost.trim().replace(/\/+$/, '');
      }
    } catch {}

    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      return window.location.origin;
    }

    return publicCloudUrl || 'https://ais-dev-u4b3ybud5it2qdursrvjgh-197015072071.asia-southeast1.run.app';
  };

  const loadData = async () => {
    const evts = getSavedEvents();
    setEvents(evts);

    let allRecords: AttendanceRecord[] = [];
    try {
      const res = await fetch('/api/attendance');
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.records && Array.isArray(data.records)) {
          allRecords = data.records;
        }
      }
    } catch {}

    try {
      const cloudRecords = await fetchAttendanceFromCloud();
      if (cloudRecords && Array.isArray(cloudRecords) && cloudRecords.length > 0) {
        const map = new Map<string, AttendanceRecord>();
        allRecords.forEach((r) => map.set(r.id, r));
        cloudRecords.forEach((r) => map.set(r.id, { ...map.get(r.id), ...r }));
        allRecords = Array.from(map.values());
      }
    } catch {}

    const combined = syncAttendanceWithServer(allRecords);
    setAttendanceLogs(combined);
  };

  const getAttendeeCountForEvent = (eventTitle: string) => {
    return attendanceLogs.filter(
      (log) => (log.eventName || '').trim().toLowerCase() === eventTitle.trim().toLowerCase()
    ).length;
  };

  const handleOpenAddModal = () => {
    setEditingEventId(null);
    setFormTitle('');
    setFormOrg('Diklat & Pelatihan');
    setFormDesc('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormStartTime('08:00');
    setFormEndTime('16:00');
    setFormRequireLocation(true);
    setShowFormModal(true);
  };

  const handleOpenEditModal = (evt: EventSession) => {
    setEditingEventId(evt.id);
    setFormTitle(evt.title);
    setFormOrg(evt.organization || 'Diklat & Pelatihan');
    setFormDesc(evt.description || '');
    setFormDate(evt.date || new Date().toISOString().split('T')[0]);
    setFormStartTime(evt.startTime || '08:00');
    setFormEndTime(evt.endTime || '16:00');
    setFormRequireLocation(evt.requireLocation ?? true);
    setShowFormModal(true);
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingEventId) {
      // Edit existing
      const updated = events.map((item) => {
        if (item.id === editingEventId) {
          return {
            ...item,
            title: formTitle.trim(),
            organization: formOrg.trim() || 'Diklat & Pelatihan',
            description: formDesc.trim(),
            date: formDate,
            startTime: formStartTime,
            endTime: formEndTime,
            requireLocation: formRequireLocation,
            qrCodePayload: JSON.stringify({
              type: 'PRESENSI_QR_EVENT',
              eventId: item.id,
              title: formTitle.trim(),
              token: 'TOKEN_' + item.id.toUpperCase(),
            }),
          };
        }
        return item;
      });
      setEvents(updated);
      saveEvents(updated);
    } else {
      // Create new
      const newId = 'evt_' + Date.now();
      const newSession: EventSession = {
        id: newId,
        title: formTitle.trim(),
        organization: formOrg.trim() || 'Diklat & Pelatihan',
        description: formDesc.trim(),
        date: formDate,
        startTime: formStartTime,
        endTime: formEndTime,
        requireLocation: formRequireLocation,
        qrCodePayload: JSON.stringify({
          type: 'PRESENSI_QR_EVENT',
          eventId: newId,
          title: formTitle.trim(),
          token: 'TOKEN_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        }),
      };
      const updated = [newSession, ...events];
      setEvents(updated);
      saveEvents(updated);
    }

    setShowFormModal(false);
  };

  const handleDeleteEvent = (id: string) => {
    const updated = events.filter((e) => e.id !== id);
    setEvents(updated);
    saveEvents(updated);
    try {
      const activeStored = localStorage.getItem('presensi_active_event_id');
      if (activeStored === id) {
        if (updated.length > 0) {
          localStorage.setItem('presensi_active_event_id', updated[0].id);
        } else {
          localStorage.removeItem('presensi_active_event_id');
        }
      }
    } catch {}
    setEventToDelete(null);
  };

  const handleOpenQRModal = (evt: EventSession) => {
    setSelectedEventForModal(evt);
    const baseOrigin = getBaseOrigin();
    const payload = `${baseOrigin}/?absen=1&event=${encodeURIComponent(evt.title)}`;

    QRCode.toDataURL(payload, {
      width: 800,
      margin: 2,
      color: {
        dark: '#02132b',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        setModalQRDataUrl(url);
        setShowQRModal(true);
      })
      .catch(console.error);
  };

  const handleDownloadQR = (evt: EventSession) => {
    if (!modalQRDataUrl) return;
    const a = document.createElement('a');
    a.href = modalQRDataUrl;
    a.download = `QR_Sesi_${evt.title.replace(/\s+/g, '_')}.png`;
    a.click();
  };

  const handleCopyLink = (evt: EventSession) => {
    const baseOrigin = getBaseOrigin();
    const link = `${baseOrigin}/?absen=1&event=${encodeURIComponent(evt.title)}`;
    navigator.clipboard.writeText(link);
    setCopiedId(evt.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Urutkan materi diklat: Sesi terbaru di urutan pertama (halaman 1) dan seterusnya
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      const tA = a.id.startsWith('evt_') ? parseInt(a.id.replace('evt_', ''), 10) : 0;
      const tB = b.id.startsWith('evt_') ? parseInt(b.id.replace('evt_', ''), 10) : 0;
      if (tA && tB) return tB - tA; // ID dengan timestamp baru didahulukan
      if (tA && !tB) return -1;
      if (!tA && tB) return 1;
      if (a.date && b.date) {
        const cmp = b.date.localeCompare(a.date);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }, [events]);

  // Filter events by search query
  const filteredEvents = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return sortedEvents;
    return sortedEvents.filter((e) => {
      return (
        e.title.toLowerCase().includes(q) ||
        (e.organization || '').toLowerCase().includes(q) ||
        (e.description || '').toLowerCase().includes(q)
      );
    });
  }, [sortedEvents, searchQuery]);

  // Pagination 4 x 4 = 16 materi per lembar kerja
  const ITEMS_PER_PAGE = 16;
  const [currentPage, setCurrentPage] = useState(1);

  // Reset ke halaman 1 jika filter pencarian berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEvents = useMemo(() => {
    return filteredEvents.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredEvents, startIndex]);

  return (
    <div className="w-full max-w-none space-y-2 text-white pb-4 px-0.5 sm:px-1">
      {/* Sleek Executive Worksheet Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 sm:p-3 shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-black tracking-tight text-white">
                Materi / Sesi Diklat
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-500/15 text-teal-300 border border-teal-500/30 uppercase tracking-wide">
                Lembar Kerja 4 × 4
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span>Total: <strong className="text-white">{events.length}</strong> Materi</span>
              <span>•</span>
              <span>Kehadiran: <strong className="text-emerald-400">{attendanceLogs.length}</strong> Peserta</span>
              {totalPages > 1 && (
                <>
                  <span>•</span>
                  <span className="text-teal-300 font-bold">Halaman {currentPage} dari {totalPages}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Search & Actions Bar */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul materi diklat..."
              className="w-full bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg pl-8 pr-7 py-1.5 text-xs focus:outline-none focus:border-teal-400 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer shrink-0 active:scale-95"
            title="Tambah Sesi Materi Baru"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Sesi</span>
          </button>
        </div>
      </div>

      {/* Event Cards Grid 4 x 4 (Maksimal 16 Item per Lembar Kerja) */}
      {paginatedEvents.length > 0 ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {paginatedEvents.map((evt) => {
              const count = getAttendeeCountForEvent(evt.title);
              const baseOrigin = typeof window !== 'undefined' ? window.location.origin : '';
              const attendanceLink = `${baseOrigin}/?absen=1&event=${encodeURIComponent(evt.title)}`;

              return (
                <div
                  key={evt.id}
                  className="bg-slate-900 border border-slate-800 hover:border-teal-500/50 rounded-xl p-3 shadow-md flex flex-col justify-between transition-all group relative overflow-hidden"
                >
                  {/* Subtle Glow */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-teal-500/10 transition-colors" />

                  <div className="space-y-2">
                    {/* Header: Org badge + attendee count + actions */}
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 truncate max-w-[130px]">
                          {evt.organization || 'Diklat & Pelatihan'}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 shrink-0">
                          {count} Hadir
                        </span>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => handleOpenEditModal(evt)}
                          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                          title="Edit Sesi"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEventToDelete(evt)}
                          className="p-1 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Hapus Sesi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Judul Materi Diklat (Tinggi seragam 2 baris agar rapi 4x4) */}
                    <h3 className="text-xs sm:text-sm font-bold text-white group-hover:text-teal-300 transition-colors leading-snug line-clamp-2 min-h-[2.4rem]" title={evt.title}>
                      {evt.title}
                    </h3>

                    {/* Jadwal Pelaksanaan */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/70">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-teal-400 shrink-0" />
                        <span className="truncate">{evt.date || 'Setiap Hari'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-teal-400 shrink-0" />
                        <span>{evt.startTime}-{evt.endTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenQRModal(evt)}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Lihat QR Code Sesi Ini"
                      >
                        <QrCode className="w-3 h-3 text-teal-400" />
                        <span>QR</span>
                      </button>

                      <button
                        onClick={() => handleCopyLink(evt)}
                        className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        title="Salin Tautan Presensi"
                      >
                        {copiedId === evt.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-slate-400" />
                        )}
                        <span>{copiedId === evt.id ? 'Tersalin' : 'Link'}</span>
                      </button>

                      <a
                        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                          `Presensi Sesi Diklat:\n${evt.title}\nSilakan scan atau buka tautan:\n${attendanceLink}`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors"
                        title="Kirim ke WhatsApp"
                      >
                        <Share2 className="w-3 h-3" />
                      </a>
                    </div>

                    <button
                      onClick={() => onSelectEventForKiosk(evt.id)}
                      className="px-2.5 py-1 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 shadow transition-all active:scale-95 cursor-pointer"
                      title="Tampilkan di Layar Proyektor"
                    >
                      <Maximize2 className="w-3 h-3" />
                      <span>Proyektor</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Bar - Format 4x4 (16 Sesi per Lembar Kerja) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 shadow-md">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-medium text-slate-300">
                Menampilkan sesi{' '}
                <strong className="text-white">
                  {filteredEvents.length > 0 ? startIndex + 1 : 0}
                </strong>{' '}
                -{' '}
                <strong className="text-white">
                  {Math.min(startIndex + ITEMS_PER_PAGE, filteredEvents.length)}
                </strong>{' '}
                dari total <strong className="text-teal-400">{filteredEvents.length}</strong> materi diklat
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                Lembar Kerja: Halaman {currentPage} dari {totalPages} (Format 4 × 4)
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 select-none flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                  title="Halaman Pertama (Terbaru)"
                >
                  « Pertama (Terbaru)
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                  title="Halaman Sebelumnya"
                >
                  ‹ Prev
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showEllipsis = prev && p - prev > 1;
                    return (
                      <React.Fragment key={p}>
                        {showEllipsis && <span className="px-1 text-slate-600">...</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`min-w-7 h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentPage === p
                              ? 'bg-teal-500 text-slate-950 shadow-md font-black'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {p}
                        </button>
                      </React.Fragment>
                    );
                  })}

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                  title="Halaman Selanjutnya"
                >
                  Next ›
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                  title="Halaman Terakhir"
                >
                  Terakhir »
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="font-bold text-base text-slate-300">Tidak ada materi diklat yang cocok</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'Silakan coba kata kunci pencarian yang lain.'
              : 'Belum ada sesi diklat. Klik tombol Tambah Materi Diklat Baru di atas untuk membuat sesi.'}
          </p>
        </div>
      )}

      {/* Modal QR Code Sesi */}
      {showQRModal && selectedEventForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">
                QR Code Presensi Sesi
              </span>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-base text-white">{selectedEventForModal.title}</h3>
              <p className="text-xs text-slate-400">{selectedEventForModal.organization}</p>
            </div>

            <div className="p-3 bg-white rounded-2xl border-2 border-teal-400/40 shadow-inner inline-block mx-auto">
              {modalQRDataUrl && (
                <img
                  src={modalQRDataUrl}
                  alt="QR Code Sesi"
                  className="w-[min(70vw,260px)] h-[min(70vw,260px)] sm:w-72 sm:h-72 object-contain rounded-lg transition-all"
                />
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Scan menggunakan kamera HP Android / iPhone, Google Lens, atau WhatsApp.
            </p>

            {/* Quick URL Box & Actions */}
            <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-left space-y-2">
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                Tautan Presensi Sesi:
              </span>
              <span className="font-mono text-[11px] text-teal-300 block break-all bg-slate-900 px-2 py-1 rounded border border-slate-800">
                {`${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(selectedEventForModal.title)}`}
              </span>

              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const link = `${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(selectedEventForModal.title)}`;
                    navigator.clipboard.writeText(link);
                    setCopiedModalLink(true);
                    setTimeout(() => setCopiedModalLink(false), 2000);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedModalLink ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-teal-400" />}
                  <span>{copiedModalLink ? 'Tautan Disalin!' : 'Salin Tautan'}</span>
                </button>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Presensi Diklat: ${selectedEventForModal.title}\nSilakan scan atau buka tautan berikut untuk absensi:\n${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(selectedEventForModal.title)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                >
                  <Share2 className="w-3 h-3" />
                  <span>WhatsApp</span>
                </a>

                <a
                  href={`${getBaseOrigin()}/?absen=1&event=${encodeURIComponent(selectedEventForModal.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 text-[11px] font-bold flex items-center gap-1 border border-teal-500/40 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Tes Link (Buka)</span>
                </a>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 pt-1 border-t border-slate-800">
              <button
                onClick={() => handleDownloadQR(selectedEventForModal)}
                className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Gambar QR</span>
              </button>

              <button
                onClick={() => {
                  onSelectEventForKiosk(selectedEventForModal.id);
                  setShowQRModal(false);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Tampil di Layar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form Tambah / Edit Materi */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl text-white space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-400" />
                <span>{editingEventId ? 'Edit Materi Diklat' : 'Tambah Materi Diklat Baru'}</span>
              </h3>
              <button
                onClick={() => setShowFormModal(false)}
                className="text-slate-400 hover:text-white p-1 text-sm rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Judul Materi / Sesi Diklat: <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Contoh: Diklat BHD & Code Blue"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Penyelenggara / Unit:
                </label>
                <input
                  type="text"
                  value={formOrg}
                  onChange={(e) => setFormOrg(e.target.value)}
                  placeholder="Contoh: Diklat & Pelatihan / Komite Keperawatan"
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Deskripsi / Keterangan Sesi:
                </label>
                <textarea
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Tuliskan tujuan, materi pembahasan, atau sasaran peserta diklat..."
                  className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Tanggal Pelaksanaan:
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Jam Mulai:
                  </label>
                  <input
                    type="time"
                    value={formStartTime}
                    onChange={(e) => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Jam Selesai:
                  </label>
                  <input
                    type="time"
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-100 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-teal-400"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  {editingEventId ? 'Simpan Perubahan' : 'Buat Sesi Diklat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Hapus Sesi */}
      {eventToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl p-6 max-w-md w-full text-white space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-white">Hapus Sesi Diklat?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Apakah Anda yakin ingin menghapus materi diklat <strong>&quot;{eventToDelete.title}&quot;</strong>? QR Code untuk sesi ini tidak dapat digunakan lagi.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEventToDelete(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteEvent(eventToDelete.id)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
