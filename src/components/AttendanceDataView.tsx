import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileDown,
  Table,
  Search,
  Filter,
  MapPin,
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Eye,
  X,
  Calendar,
  Building2,
  RotateCcw,
  ArrowDown,
  ArrowUp,
  Trash2,
  CheckSquare,
  Square,
  AlertOctagon,
  Info,
  ExternalLink,
  BarChart3,
  Printer,
  Upload,
} from 'lucide-react';
import { DailyAttendanceChart } from './DailyAttendanceChart';
import { AttendanceRecord, LogoConfig } from '../types';
import {
  getSavedAttendanceLogs,
  saveAttendanceLogsBatch,
  syncAttendanceWithServer,
  deleteAttendanceLog,
  deleteMultipleAttendanceLogs,
  clearAttendanceLogs,
  getDeletedAttendanceIds,
  syncDeletedIdsFromServer,
  getSavedLogoConfig,
  defaultLogoConfig,
  validateCoordinatesGeofence,
  calculateAttendanceKeterangan,
  getTargetStartTimeForRecord,
} from '../services/storage';
import { UNIT_KERJA_OPTIONS } from './AttendanceDialogModal';
import { Pure2DGpsMap } from './Pure2DGpsMap';
import {
  fetchAttendanceFromCloud,
  deleteAttendanceFromCloud,
  clearAllAttendanceFromCloud,
} from '../services/firestoreSync';

/**
 * Ekstraksi timestamp presensi menjadi epoch millisecond untuk pengurutan akurat
 */
export const getRecordTimestampMillis = (record: AttendanceRecord): number => {
  const raw = (record.timestamp || '').trim();

  if (raw) {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw.replace(' ', 'T'));
      if (!isNaN(d.getTime())) return d.getTime();
    }

    const cleaned = raw.replace(',', ' ').replace(/\s+/g, ' ').trim();
    const parts = cleaned.split(' ');
    const dateStr = parts[0];
    const timeStr = parts[1] || '';

    if (dateStr && (dateStr.includes('/') || dateStr.includes('-'))) {
      const isSlash = dateStr.includes('/');
      const dateParts = dateStr.split(isSlash ? '/' : '-').map((s) => parseInt(s, 10));

      if (dateParts.length === 3) {
        let day = 1;
        let month = 0;
        let year = 1970;

        if (dateParts[0] > 1000) {
          year = dateParts[0];
          month = dateParts[1] - 1;
          day = dateParts[2];
        } else {
          day = dateParts[0];
          month = dateParts[1] - 1;
          year = dateParts[2] < 100 ? 2000 + dateParts[2] : dateParts[2];
        }

        let hour = 0;
        let minute = 0;
        let second = 0;

        if (timeStr) {
          const tParts = timeStr.replace(/\./g, ':').split(':').map((s) => parseInt(s, 10));
          if (!isNaN(tParts[0])) hour = tParts[0];
          if (!isNaN(tParts[1])) minute = tParts[1];
          if (!isNaN(tParts[2])) second = tParts[2];
        }

        const calculated = new Date(year, month, day, hour, minute, second).getTime();
        if (!isNaN(calculated) && calculated > 0) {
          return calculated;
        }
      }
    }

    const fallbackDate = new Date(raw);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate.getTime();
    }
  }

  if (record.id) {
    const idMatch = record.id.match(/(?:att|row)_.*?(\d{11,13})/);
    if (idMatch) {
      const val = parseInt(idMatch[1], 10);
      if (!isNaN(val) && val > 0) return val;
    }
    const genericMatch = record.id.match(/(\d{12,13})/);
    if (genericMatch) {
      const val = parseInt(genericMatch[1], 10);
      if (!isNaN(val) && val > 0) return val;
    }
  }

  return 0;
};

/**
 * Mengurutkan records berdasarkan waktu terbaru (atas) ke sebelumnya
 */
export const sortAttendanceRecords = (
  recordsList: AttendanceRecord[],
  order: 'desc' | 'asc' = 'desc'
): AttendanceRecord[] => {
  return [...recordsList].sort((a, b) => {
    const timeA = getRecordTimestampMillis(a);
    const timeB = getRecordTimestampMillis(b);
    if (order === 'desc') {
      return timeB - timeA;
    }
    return timeA - timeB;
  });
};

/**
 * Memformat tanggal ke format DD/MM/YYYY secara konsisten
 */
export const formatDateDDMMYYYY = (
  rawTimestamp?: string,
  trainingDate?: string,
  recordId?: string
): string => {
  if (trainingDate && trainingDate !== '-' && trainingDate.trim() !== '') {
    const clean = trainingDate.trim();
    const parts = clean.split(/[\/\-,\s]+/).filter(Boolean);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
      return `${parts[0].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[2]}`;
    }
  }

  if (rawTimestamp && rawTimestamp !== '-' && rawTimestamp.trim() !== '') {
    const clean = rawTimestamp.trim();

    const dmyMatch = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[1].padStart(2, '0')}/${dmyMatch[2].padStart(2, '0')}/${dmyMatch[3]}`;
    }

    const ymdMatch = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      return `${ymdMatch[3].padStart(2, '0')}/${ymdMatch[2].padStart(2, '0')}/${ymdMatch[1]}`;
    }

    const cleaned = clean.replace(',', ' ').trim();
    const parsed = new Date(cleaned.replace(' ', 'T'));
    if (!isNaN(parsed.getTime())) {
      const d = String(parsed.getDate()).padStart(2, '0');
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const y = parsed.getFullYear();
      return `${d}/${m}/${y}`;
    }

    const firstSeg = clean.split(/[\s,]+/)[0];
    if (firstSeg && firstSeg.length >= 8) {
      return firstSeg;
    }
  }

  if (recordId) {
    const idMatch = recordId.match(/(?:att|row)_.*?(\d{11,13})/);
    if (idMatch) {
      const val = parseInt(idMatch[1], 10);
      if (!isNaN(val) && val > 0) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        }
      }
    }
    const genericMatch = recordId.match(/(\d{12,13})/);
    if (genericMatch) {
      const val = parseInt(genericMatch[1], 10);
      if (!isNaN(val) && val > 0) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        }
      }
    }
  }

  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Memformat waktu presensi ke format (00:00) satuan WIB
 */
export const formatTimeWIB = (entryTime?: string, rawTimestamp?: string): string => {
  if (entryTime && entryTime !== '-') {
    const cleaned = entryTime.replace(/WIB/i, '').trim();
    const match = cleaned.match(/(\d{1,2})[:\.](\d{1,2})/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')} WIB`;
    }
  }

  if (rawTimestamp && rawTimestamp !== '-') {
    const timeMatch = rawTimestamp.match(/(\d{1,2})[:\.](\d{1,2})(?:[:\.]\d{1,2})?/);
    if (timeMatch) {
      return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')} WIB`;
    }

    const cleaned = rawTimestamp.replace(',', ' ').trim();
    const parsed = new Date(cleaned.replace(' ', 'T'));
    if (!isNaN(parsed.getTime())) {
      const h = String(parsed.getHours()).padStart(2, '0');
      const m = String(parsed.getMinutes()).padStart(2, '0');
      return `${h}:${m} WIB`;
    }
  }

  return '-';
};

interface AttendanceDataViewProps {
  subTab?: 'rekap' | 'chart';
  onSubTabChange?: (tab: 'rekap' | 'chart') => void;
}

export const AttendanceDataView: React.FC<AttendanceDataViewProps> = ({
  subTab = 'rekap',
  onSubTabChange,
}) => {
  const [activeViewTab, setActiveViewTab] = useState<'rekap' | 'chart'>(subTab);

  useEffect(() => {
    if (subTab) {
      setActiveViewTab(subTab);
    }
  }, [subTab]);

  const handleTabSwitch = (tab: 'rekap' | 'chart') => {
    setActiveViewTab(tab);
    if (onSubTabChange) {
      onSubTabChange(tab);
    }
  };

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedKeteranganFilter, setSelectedKeteranganFilter] = useState<'all' | 'tepat' | 'terlambat'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [logoConfig, setLogoConfig] = useState<LogoConfig>(defaultLogoConfig);

  // State Delete & Seleksi
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [recordToDelete, setRecordToDelete] = useState<AttendanceRecord | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showClearAllModal, setShowClearAllModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (syncFeedback) {
      const timer = setTimeout(() => {
        setSyncFeedback(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [syncFeedback]);

  useEffect(() => {
    setLogoConfig(getSavedLogoConfig());
    const handleLogoUpdate = (e: any) => {
      if (e.detail) setLogoConfig(e.detail);
    };
    window.addEventListener('presensi_logo_updated', handleLogoUpdate);
    return () => window.removeEventListener('presensi_logo_updated', handleLogoUpdate);
  }, []);

  // Muat data dari server Express, Firestore Cloud, dan penyimpanan lokal
  const loadRecords = async () => {
    // Sinkronisasi ID yang telah dihapus permanen agar tidak pernah dimuat ulang
    const deletedIds = await syncDeletedIdsFromServer().catch(() => getDeletedAttendanceIds());

    let allRecords: AttendanceRecord[] = [];
    try {
      const res = await fetch('/api/attendance');
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.records && Array.isArray(data.records)) {
          allRecords = data.records.filter((r: any) => r && r.id && !deletedIds.has(r.id));
        }
      }
    } catch {}

    try {
      const cloudRecords = await fetchAttendanceFromCloud();
      if (cloudRecords && Array.isArray(cloudRecords) && cloudRecords.length > 0) {
        const map = new Map<string, AttendanceRecord>();
        allRecords.forEach((r) => {
          if (r.id && !deletedIds.has(r.id)) map.set(r.id, r);
        });
        cloudRecords.forEach((r) => {
          if (r.id && !deletedIds.has(r.id)) {
            map.set(r.id, { ...map.get(r.id), ...r });
          }
        });
        allRecords = Array.from(map.values());
      }
    } catch {}

    const combined = syncAttendanceWithServer(allRecords);
    const finalCleanList = combined.filter((r) => r && r.id && !deletedIds.has(r.id));
    setRecords(sortAttendanceRecords(finalCleanList, sortOrder));
  };

  useEffect(() => {
    loadRecords();
    const interval = setInterval(loadRecords, 4000);
    return () => clearInterval(interval);
  }, [sortOrder]);

  useEffect(() => {
    const handleAttendanceUpdate = (e: any) => {
      if (e.detail && Array.isArray(e.detail)) {
        const deletedIds = getDeletedAttendanceIds();
        const filtered = e.detail.filter((r: any) => r && r.id && !deletedIds.has(r.id));
        setRecords(sortAttendanceRecords(filtered, sortOrder));
      }
    };
    window.addEventListener('presensi_attendance_updated', handleAttendanceUpdate);
    return () => window.removeEventListener('presensi_attendance_updated', handleAttendanceUpdate);
  }, [sortOrder]);

  // Hapus 1 baris record secara permanen (tidak akan kembali lagi)
  const confirmDeleteRecord = async () => {
    if (!recordToDelete) return;
    setIsDeleting(true);
    const targetId = recordToDelete.id;
    const targetName = recordToDelete.name;
    try {
      // 1. Tandai ID dihapus permanen di storage & disinkronkan ke server
      deleteAttendanceLog(targetId);

      // 2. Hapus dari server Express
      await fetch(`/api/attendance/${encodeURIComponent(targetId)}`, {
        method: 'DELETE',
      }).catch(console.warn);

      // 3. Hapus dari Firestore Cloud dan buat tombstone permanen
      await deleteAttendanceFromCloud(targetId).catch(console.warn);

      // 4. Update UI seketika
      setRecords((prev) => prev.filter((r) => r.id !== targetId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });

      if (selectedRecord?.id === targetId) {
        setSelectedRecord(null);
      }

      setSyncFeedback({
        type: 'success',
        message: `✓ Data presensi "${targetName}" berhasil dihapus permanen.`,
      });
      setRecordToDelete(null);
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Gagal menghapus data: ' + (err.message || 'Terjadi kesalahan'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Hapus banyak baris record terpilih (Bulk Delete) secara permanen
  const confirmDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const idsArray = Array.from(selectedIds);

      // 1. Tandai lokal & kirim ke server
      deleteMultipleAttendanceLogs(idsArray);

      // 2. Request DELETE ke server
      await fetch('/api/attendance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsArray }),
      }).catch(console.warn);

      // 3. Hapus dari Firestore Cloud
      await Promise.all(idsArray.map((id) => deleteAttendanceFromCloud(id).catch(console.warn)));

      const idSet = new Set(idsArray);
      setRecords((prev) => prev.filter((r) => !idSet.has(r.id)));
      setSelectedIds(new Set());

      if (selectedRecord && idSet.has(selectedRecord.id)) {
        setSelectedRecord(null);
      }

      setSyncFeedback({
        type: 'success',
        message: `✓ Berhasil menghapus ${idsArray.length} data presensi terpilih secara permanen.`,
      });
      setShowBulkDeleteModal(false);
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Gagal menghapus data terpilih: ' + (err.message || 'Terjadi kesalahan'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Kosongkan seluruh data presensi (Clear All) secara permanen
  const confirmClearAll = async () => {
    setIsDeleting(true);
    try {
      // 1. Bersihkan lokal
      clearAttendanceLogs();

      // 2. Kosongkan server
      await fetch('/api/attendance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      }).catch(console.warn);

      // 3. Kosongkan Firestore Cloud
      await clearAllAttendanceFromCloud().catch(console.warn);

      setRecords([]);
      setSelectedIds(new Set());
      setSelectedRecord(null);

      setSyncFeedback({
        type: 'success',
        message: '✓ Seluruh rekap data presensi berhasil dikosongkan secara permanen.',
      });
      setShowClearAllModal(false);
    } catch (err: any) {
      setSyncFeedback({
        type: 'error',
        message: 'Gagal mengosongkan data: ' + (err.message || 'Terjadi kesalahan'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectRecord = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllFiltered = (filteredList: AttendanceRecord[]) => {
    if (filteredList.length === 0) return;
    const allFilteredSelected = filteredList.every((r) => selectedIds.has(r.id));
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredList.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredList.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const availableDepartments = useMemo(() => {
    const fromOptions = (UNIT_KERJA_OPTIONS.filter((o) => o !== 'Lainnya') as unknown) as string[];
    const fromRecords = records.map((r) => r.department).filter(Boolean);
    return Array.from(new Set([...fromOptions, ...fromRecords])).sort();
  }, [records]);

  const parseRecordDate = (timestamp: string): Date | null => {
    if (!timestamp) return null;
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) return d;
    const dateStr = String(timestamp).split(/[\s,T]+/)[0] || '';
    if (dateStr && dateStr.includes('-')) {
      const [y, m, day] = dateStr.split('-').map(Number);
      if (y && m && day) return new Date(y, m - 1, day);
    }
    if (dateStr && dateStr.includes('/')) {
      const [day, m, y] = dateStr.split('/').map(Number);
      if (y && m && day) return new Date(y, m - 1, day);
    }
    return null;
  };

  const isWithinDateRange = (recordTimestamp: string | undefined | null, startStr: string, endStr: string): boolean => {
    if (!startStr && !endStr) return true;
    const ts = String(recordTimestamp || '').trim();
    if (!ts) return false;
    const recDate = parseRecordDate(ts);
    if (!recDate) {
      if (startStr && !ts.includes(startStr)) return false;
      if (endStr && !ts.includes(endStr)) return false;
      return true;
    }
    const recTime = new Date(recDate.getFullYear(), recDate.getMonth(), recDate.getDate()).getTime();

    if (startStr) {
      const [sy, sm, sd] = startStr.split('-').map(Number);
      const startTime = new Date(sy, sm - 1, sd).getTime();
      if (recTime < startTime) return false;
    }
    if (endStr) {
      const [ey, em, ed] = endStr.split('-').map(Number);
      const endTime = new Date(ey, em - 1, ed).getTime();
      if (recTime > endTime) return false;
    }
    return true;
  };

  const setPresetToday = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  };

  const setPresetLast7Days = () => {
    const today = new Date();
    const past = new Date(today);
    past.setDate(past.getDate() - 6);
    setStartDate(past.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  const setPresetThisMonth = () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(today.toISOString().split('T')[0]);
  };

  const resetAllFilters = () => {
    setSearchTerm('');
    setSelectedDepartment('');
    setSelectedKeteranganFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = Boolean(
    searchTerm.trim() || selectedDepartment || startDate || endDate || selectedKeteranganFilter !== 'all'
  );

  const filteredRecords = useMemo(() => {
    const list = records.filter((r) => {
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchSearch =
          (r.name ? String(r.name).toLowerCase().includes(term) : false) ||
          (r.identityNumber ? String(r.identityNumber).toLowerCase().includes(term) : false) ||
          (r.profession ? String(r.profession).toLowerCase().includes(term) : false) ||
          (r.eventName ? String(r.eventName).toLowerCase().includes(term) : false) ||
          (r.department ? String(r.department).toLowerCase().includes(term) : false) ||
          (r.keterangan ? String(r.keterangan).toLowerCase().includes(term) : false) ||
          (r.address ? String(r.address).toLowerCase().includes(term) : false);
        if (!matchSearch) return false;
      }

      if (selectedDepartment) {
        if ((r.department || '').trim().toLowerCase() !== selectedDepartment.trim().toLowerCase()) {
          return false;
        }
      }

      if (!isWithinDateRange(r.timestamp, startDate, endDate)) {
        return false;
      }

      if (selectedKeteranganFilter !== 'all') {
        const evalK = calculateAttendanceKeterangan(
          r.entryTime,
          r.targetStartTime || getTargetStartTimeForRecord(r),
          r.timestamp
        );
        const isLate =
          r.status === 'Terlambat' ||
          evalK.isLate ||
          (r.keterangan && (r.keterangan.startsWith('Terlambat') || r.keterangan.startsWith('Telah di ikuti')));
        if (selectedKeteranganFilter === 'tepat' && isLate) return false;
        if (selectedKeteranganFilter === 'terlambat' && !isLate) return false;
      }

      return true;
    });

    return sortAttendanceRecords(list, sortOrder);
  }, [records, searchTerm, selectedDepartment, selectedKeteranganFilter, startDate, endDate, sortOrder]);

  // Pagination dinamis & adaptif: otomatis mengisi penuh layar tanpa celah/jarak kosong
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const [autoRowsPerPage, setAutoRowsPerPage] = useState<number>(14);
  const [rowsPerPageMode, setRowsPerPageMode] = useState<string>(() => {
    try {
      return localStorage.getItem('presensi_rekap_rows_per_page') || 'auto';
    } catch {
      return 'auto';
    }
  });

  // Hitung jumlah baris ideal secara real-time berdasarkan tinggi kontainer tabel menggunakan ResizeObserver
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;

    const calculateAutoRows = () => {
      const containerH = el.clientHeight;
      if (containerH > 50) {
        setContainerHeight(containerH);
        // Thead ~38px, setiap baris ~36px (h-9)
        const availableHeight = containerH - 38;
        if (availableHeight > 80) {
          const rows = Math.max(8, Math.floor(availableHeight / 36));
          setAutoRowsPerPage(rows);
        }
      }
    };

    calculateAutoRows();
    const ro = new ResizeObserver(() => {
      calculateAutoRows();
    });
    ro.observe(el);

    const timer = setTimeout(calculateAutoRows, 100);
    window.addEventListener('resize', calculateAutoRows);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
      window.removeEventListener('resize', calculateAutoRows);
    };
  }, []);

  const [currentPage, setCurrentPage] = useState(1);

  // Jumlah baris fisik yang pas mengisi kontainer layar
  const rowsFittingContainer = useMemo(() => {
    if (containerHeight <= 50) return autoRowsPerPage;
    const available = containerHeight - 38;
    return Math.max(8, Math.floor(available / 36));
  }, [containerHeight, autoRowsPerPage]);

  const effectiveRowsPerPage = useMemo(() => {
    if (rowsPerPageMode === 'all') {
      return Math.max(filteredRecords.length, 1);
    }
    if (rowsPerPageMode === 'auto') {
      return rowsFittingContainer;
    }
    const parsed = parseInt(rowsPerPageMode, 10);
    return isNaN(parsed) || parsed <= 0 ? rowsFittingContainer : parsed;
  }, [rowsPerPageMode, rowsFittingContainer, filteredRecords.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedDepartment, selectedKeteranganFilter, startDate, endDate, sortOrder, rowsPerPageMode]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / effectiveRowsPerPage));
  const startIndex = (currentPage - 1) * effectiveRowsPerPage;
  const paginatedRecords = useMemo(() => {
    return filteredRecords.slice(startIndex, startIndex + effectiveRowsPerPage);
  }, [filteredRecords, startIndex, effectiveRowsPerPage]);

  // Hitung baris pengisi agar tabel selalu mengisi penuh sampai ke bilah pagination bawah (tanpa jarak kosong)
  const emptyRowCount = useMemo(() => {
    if (paginatedRecords.length === 0) return 0;
    // Target pengisian adalah yang terbesar antara effectiveRowsPerPage dan kapasitas fisik kontainer
    const targetCapacity = rowsPerPageMode === 'all'
      ? Math.max(paginatedRecords.length, rowsFittingContainer)
      : Math.max(effectiveRowsPerPage, rowsFittingContainer);
    return Math.max(0, targetCapacity - paginatedRecords.length);
  }, [rowsPerPageMode, effectiveRowsPerPage, rowsFittingContainer, paginatedRecords.length]);

  // Ekspor Tabel Rekapitulasi Presensi ke format file Excel (.xlsx) resmi
  const exportToExcel = () => {
    const dataToExport = filteredRecords;
    if (dataToExport.length === 0) {
      setSyncFeedback({
        type: 'error',
        message: 'Tidak ada data presensi yang sesuai dengan kriteria filter untuk diekspor ke Excel.',
      });
      return;
    }

    const excelRows = dataToExport.map((r, idx) => {
      const fullAddress = r.address || '-';
      const mapsUrl = r.mapsUrl || (r.latitude && r.latitude !== 0 ? `https://maps.google.com/?q=${r.latitude},${r.longitude}` : '-');
      const evalK = calculateAttendanceKeterangan(
        r.entryTime,
        r.targetStartTime || getTargetStartTimeForRecord(r),
        r.timestamp
      );
      const keteranganText = r.keterangan || evalK.keterangan || (r.status === 'Terlambat' ? 'Telah di ikuti beberapa menit' : 'Tepat Waktu');

      return {
        'No': idx + 1,
        'Tanggal': formatDateDDMMYYYY(r.timestamp, r.trainingDate, r.id),
        'Waktu Presensi (WIB)': formatTimeWIB(r.entryTime, r.timestamp),
        'Nama Peserta Diklat': r.name || '-',
        'Nomor Induk Karyawan (NIK)': r.identityNumber || '-',
        'Unit Kerja': r.department || '-',
        'Profesi': r.profession || '-',
        'Judul Diklat': r.eventName || 'Diklat Pelatihan',
        'Status Kehadiran': r.status || 'Hadir',
        'Keterangan': keteranganText,
        'Latitude': r.latitude && r.latitude !== 0 ? r.latitude : '-',
        'Longitude': r.longitude && r.longitude !== 0 ? r.longitude : '-',
        'Akurasi': r.accuracy > 0 ? `±${Math.round(r.accuracy)} m` : '-',
        'Alamat Terdeteksi GPS': fullAddress,
        'Link Google Maps': mapsUrl,
        'Perangkat': r.deviceInfo || '-',
        'Timestamp Sistem': r.timestamp || '-',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Format Autofit Content: Hitung otomatis lebar setiap kolom sesuai panjang isi data terpanjang
    const columnKeys = Object.keys(excelRows[0] || {});
    worksheet['!cols'] = columnKeys.map((colKey) => {
      let maxContentLen = colKey.length;
      excelRows.forEach((row) => {
        const val = (row as Record<string, any>)[colKey];
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str.length > maxContentLen) {
            maxContentLen = Math.min(str.length, 60); // Batas maksimal proporsional per kolom
          }
        }
      });
      // Autofit: panjang teks terpanjang + padding ruang baca
      return { wch: Math.max(maxContentLen + 3, 8) };
    });

    // Wrap Teks ke bawah pada semua sel data jika isi teks lebih panjang dari lebar kolom
    for (const cellAddress in worksheet) {
      if (cellAddress.startsWith('!')) continue;
      const cell = worksheet[cellAddress];
      if (cell && typeof cell === 'object') {
        cell.s = {
          alignment: {
            wrapText: true,
            vertical: 'center',
          },
        };
      }
    }

    // Konfigurasi 1 lembar kerja saat dibuka/dicetak (Fit to 1 page wide)
    worksheet['!pageSetup'] = {
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
    };

    // Jadikan 1 lembar kerja tunggal (Single Worksheet)
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekapitulasi Presensi');

    let filename = `Rekapitulasi_Presensi_Diklat`;
    if (selectedDepartment) {
      filename += `_${selectedDepartment.replace(/[^a-zA-Z0-9]/g, '_')}`;
    }
    if (selectedKeteranganFilter !== 'all') {
      filename += `_${selectedKeteranganFilter === 'tepat' ? 'TepatWaktu' : 'Terlambat'}`;
    }
    if (startDate && endDate) {
      filename += `_${startDate}_sd_${endDate}`;
    } else if (startDate) {
      filename += `_mulai_${startDate}`;
    } else {
      filename += `_${new Date().toISOString().split('T')[0]}`;
    }
    filename += `.xlsx`;

    XLSX.writeFile(workbook, filename);

    setSyncFeedback({
      type: 'success',
      message: `✓ Berhasil mengekspor 1 lembar kerja Rekapitulasi Presensi (${dataToExport.length} baris) dengan Wrap Teks ke Excel (.xlsx)!`,
    });
  };

  const handlePrintWorksheet = () => {
    window.print();
  };

  const importFileRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      let importedRows: any[] = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        importedRows = Array.isArray(parsed) ? parsed : (parsed.records || []);
      } else {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        importedRows = XLSX.utils.sheet_to_json(worksheet);
      }

      if (!importedRows || importedRows.length === 0) {
        setSyncFeedback({
          type: 'error',
          message: 'Berkas kosong atau tidak ditemukan data baris di dalamnya.',
        });
        return;
      }

      const now = new Date();
      const defaultDateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
      const defaultTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const newRecords: AttendanceRecord[] = importedRows.map((row: any, idx: number) => {
        const name = String(row['Nama'] || row['Nama Peserta'] || row['Name'] || row.name || `Peserta ${idx + 1}`).trim();
        const nik = String(row['NIK'] || row['NIP'] || row['Nomor Induk'] || row['NIM'] || row.identityNumber || '-').trim();
        const dept = String(row['Unit Kerja'] || row['Department'] || row['Ruangan'] || row.department || 'Rawat Inap').trim();
        const event = String(row['Materi Diklat'] || row['Materi'] || row['Judul Diklat'] || row.eventName || 'Pelatihan Rumah Sakit').trim();
        const dateStr = String(row['Tanggal Pelatihan'] || row['Tanggal'] || row.trainingDate || defaultDateStr).trim();
        const timeStr = String(row['Jam Masuk'] || row['Jam'] || row.entryTime || defaultTimeStr).trim();
        const status = (String(row['Status'] || row.status || 'Hadir').toLowerCase().includes('terlambat') ? 'Terlambat' : 'Hadir') as 'Hadir' | 'Terlambat';
        const ket = String(row['Keterangan'] || row.keterangan || (status === 'Terlambat' ? 'Terlambat' : 'Tepat Waktu')).trim();
        const addr = String(row['Alamat'] || row['Lokasi'] || row.address || 'RSIA AZ ZAHRA').trim();

        return {
          id: row.id || `att_imp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: row.timestamp || `${dateStr} ${timeStr}:00`,
          name,
          email: row.email || `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@rsiaazzahra.com`,
          identityNumber: nik,
          department: dept,
          eventName: event,
          trainingDate: dateStr,
          entryTime: timeStr,
          targetStartTime: row.targetStartTime || '08:00',
          status,
          keterangan: ket,
          latitude: parseFloat(row.latitude) || -6.2,
          longitude: parseFloat(row.longitude) || 106.8,
          accuracy: parseFloat(row.accuracy) || 15,
          address: addr,
          mapsUrl: row.mapsUrl || `https://www.google.com/maps?q=-6.2,106.8`,
          deviceInfo: row.deviceInfo || 'Import File Excel',
          syncedToSheets: false,
        };
      });

      const updated = saveAttendanceLogsBatch(newRecords);
      setRecords(updated);

      fetch('/api/attendance/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: newRecords }),
      }).catch(console.warn);

      setSyncFeedback({
        type: 'success',
        message: `✓ Berhasil mengunggah dan mengimpor ${newRecords.length} baris data presensi dari berkas "${file.name}"!`,
      });
    } catch (err: any) {
      console.error('Import file error:', err);
      setSyncFeedback({
        type: 'error',
        message: `Gagal membaca berkas: ${err.message || 'Format tidak didukung'}. Pastikan berkas berupa .xlsx, .csv, atau .json.`,
      });
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  const totalCount = records.length;
  const tepatCount = records.filter((r) => {
    const evalK = calculateAttendanceKeterangan(
      r.entryTime,
      r.targetStartTime || getTargetStartTimeForRecord(r),
      r.timestamp
    );
    const isLate =
      r.status === 'Terlambat' ||
      evalK.isLate ||
      (r.keterangan && (r.keterangan.startsWith('Terlambat') || r.keterangan.startsWith('Telah di ikuti')));
    return !isLate;
  }).length;
  const terlambatCount = totalCount - tepatCount;

  return (
    <div className="w-full h-full flex flex-col min-h-0 overflow-hidden space-y-1.5 p-0.5 text-white">
      {/* Print Stylesheet for 1 lembar kerja penuh */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 6mm;
          }
          body {
            background: white !important;
            color: black !important;
            overflow: visible !important;
          }
          aside, header, footer, button, .no-print {
            display: none !important;
          }
          .rekap-print-area {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            border: none !important;
            box-shadow: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            color: black !important;
            font-size: 9pt !important;
          }
          th, td {
            border: 1px solid #cbd5e1 !important;
            padding: 4px 6px !important;
            color: black !important;
            background: white !important;
          }
          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
          }
          tr {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Toast / Banner Feedback */}
      {syncFeedback && (
        <div
          className={`p-2 px-3 rounded-xl border flex items-center justify-between gap-3 animate-in fade-in duration-200 text-xs shrink-0 ${
            syncFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : syncFeedback.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-teal-500/10 border-teal-500/30 text-teal-300'
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {syncFeedback.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />}
            {syncFeedback.type === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-400" />}
            {syncFeedback.type === 'info' && <Info className="w-3.5 h-3.5 shrink-0 text-teal-400" />}
            <span>{syncFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Tutup pemberitahuan"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Unified Executive Worksheet Toolbar (Compact, Full-Width, No Wasted Margin) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-2 sm:p-2.5 shadow-md space-y-2 shrink-0">
        {/* Row 1: Title, View Switcher, KPI Pills & Action Icons (Hanya Icon untuk Cetak & Ekspor) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          {/* Sisi Kiri: Judul, Badge & Mode Switcher */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0 shadow-sm">
              {activeViewTab === 'chart' ? (
                <BarChart3 className="w-4 h-4" />
              ) : (
                <Table className="w-4 h-4" />
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <h2 className="text-sm sm:text-base font-black tracking-tight text-white whitespace-nowrap">
                {activeViewTab === 'chart' ? 'Grafik Batang Harian Peserta Diklat' : 'Rekapitulasi Presensi Diklat'}
              </h2>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-teal-500/15 text-teal-300 border border-teal-500/30 uppercase tracking-wide">
                {activeViewTab === 'chart' ? 'Statistik & Analisis' : 'Lembar Kerja'}
              </span>
            </div>

            {/* View Mode Switcher: Tabel Rekap vs Grafik Batang */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs shrink-0">
              <button
                type="button"
                onClick={() => handleTabSwitch('rekap')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  activeViewTab === 'rekap'
                    ? 'bg-teal-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>Tabel Rekap</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    activeViewTab === 'rekap' ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {totalCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch('chart')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  activeViewTab === 'chart'
                    ? 'bg-teal-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Grafik Batang</span>
              </button>
            </div>
          </div>

          {/* Sisi Kanan: Ringkasan KPI dan Tombol Aksi (Hanya Icon untuk Cetak & Ekspor) */}
          <div className="flex items-center justify-between lg:justify-end gap-2.5 shrink-0 flex-wrap">
            {/* KPI Stat Pills */}
            <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-300 font-medium">
                Total: <strong className="text-white">{totalCount}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-medium">
                Tepat: <strong className="text-emerald-400">{tepatCount}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/25 text-rose-300 font-medium">
                Terlambat: <strong className="text-rose-400">{terlambatCount}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/25 text-teal-300 font-medium hidden sm:inline-block">
                Terfilter: <strong className="text-teal-300">{filteredRecords.length}</strong>
              </span>
            </div>

            {/* Separator Divider */}
            <div className="h-5 w-px bg-slate-800 hidden sm:block" />

            {/* Action Buttons: HANYA PAKAI ICON */}
            <div className="flex items-center gap-1.5">
              {records.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearAllModal(true)}
                  className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                  title="Kosongkan seluruh data presensi"
                  aria-label="Kosongkan seluruh data presensi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Unggah / Impor Data Excel (.xlsx, .csv, .json) - Hanya Icon */}
              <button
                type="button"
                onClick={() => importFileRef.current?.click()}
                disabled={isImporting}
                className="w-8 h-8 rounded-lg bg-teal-600 hover:bg-teal-500 text-white flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                title="Unggah / Impor File Data Presensi (.xlsx, .csv, .json)"
                aria-label="Unggah File Data Presensi"
              >
                {isImporting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 text-teal-100" />
                )}
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.json"
                onChange={handleFileImport}
                className="hidden"
              />

              {/* Cetak Lembar Kerja - Hanya Icon */}
              <button
                type="button"
                onClick={handlePrintWorksheet}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 hover:text-white border border-slate-700 flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer"
                title="Cetak Lembar Kerja"
                aria-label="Cetak Lembar Kerja"
              >
                <Printer className="w-4 h-4 text-teal-400" />
              </button>

              {/* Ekspor Excel (.xlsx) - Hanya Icon */}
              <button
                type="button"
                onClick={exportToExcel}
                className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md transition-all active:scale-95 cursor-pointer"
                title="Ekspor Excel (.xlsx)"
                aria-label="Ekspor Excel (.xlsx)"
              >
                <FileDown className="w-4 h-4 text-emerald-100" />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Compact Filter Controls Grid (Uniform Height h-8) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2 text-xs">
          {/* Keyword Search */}
          <div className="lg:col-span-4 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama peserta, NIK, materi..."
              className="w-full h-8 bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 rounded-lg pl-8 pr-7 text-xs focus:outline-none focus:border-teal-400 transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Unit Kerja */}
          <div className="lg:col-span-3">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full h-8 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 text-xs focus:outline-none focus:border-teal-400 transition-colors cursor-pointer"
            >
              <option value="">Semua Unit Kerja ({records.length})</option>
              {availableDepartments.map((dept) => {
                const count = records.filter(
                  (r) => (r.department || '').trim().toLowerCase() === dept.trim().toLowerCase()
                ).length;
                return (
                  <option key={dept} value={dept}>
                    {dept} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Keterangan Ketepatan */}
          <div className="lg:col-span-2">
            <select
              value={selectedKeteranganFilter}
              onChange={(e) => setSelectedKeteranganFilter(e.target.value as any)}
              className="w-full h-8 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2.5 text-xs focus:outline-none focus:border-teal-400 transition-colors cursor-pointer"
            >
              <option value="all">Semua Keterangan</option>
              <option value="tepat">✓ Tepat Waktu ({tepatCount})</option>
              <option value="terlambat">⏰ Terlambat ({terlambatCount})</option>
            </select>
          </div>

          {/* Rentang Tanggal & Reset */}
          <div className="lg:col-span-3 flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-1/2 h-8 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2 text-[11px] focus:outline-none focus:border-teal-400 font-mono"
              title="Dari Tanggal"
            />
            <span className="text-slate-500 text-[10px]">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-1/2 h-8 bg-slate-950 border border-slate-700 text-slate-100 rounded-lg px-2 text-[11px] focus:outline-none focus:border-teal-400 font-mono"
              title="Sampai Tanggal"
            />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="h-8 px-2.5 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 border border-teal-500/30 text-[11px] font-bold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                title="Reset semua filter"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {activeViewTab === 'chart' ? (
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          <DailyAttendanceChart
            records={records}
            filteredRecords={filteredRecords}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      ) : (
        <>
          {/* Sticky Bulk Action Bar if selection exists */}
      {selectedIds.size > 0 && (
        <div className="bg-rose-950/70 border border-rose-500/40 rounded-xl p-2 px-3 flex flex-wrap items-center justify-between gap-2 text-white shadow-lg animate-in slide-in-from-top-1 text-xs">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-rose-400" />
            <span className="font-bold text-rose-100">
              {selectedIds.size} baris data presensi terpilih
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => setShowBulkDeleteModal(true)}
              className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-1 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* Table of Records: Format Resmi Rekapitulasi Presensi Diklat (Full Sheet) */}
      <div className="rekap-print-area bg-slate-900 border border-slate-800 rounded-xl shadow-xl flex-1 min-h-0 flex flex-col overflow-hidden text-white">

            {/* Kop Judul Resmi Khusus Mode Cetak Landscape */}
            <div className="hidden print:block p-3 border-b-2 border-black mb-2 text-black bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-base font-black tracking-tight uppercase">Rekapitulasi Presensi Diklat Pelatihan</h1>
                  <p className="text-xs text-gray-700">Format Resmi Laporan Kehadiran Karyawan &amp; Peserta Diklat</p>
                </div>
                <div className="text-right text-[11px] text-gray-600">
                  <p>Halaman {currentPage} dari {totalPages}</p>
                  <p>Total Data: {filteredRecords.length} Peserta</p>
                </div>
              </div>
            </div>

            <div ref={tableContainerRef} className="overflow-x-auto overflow-y-auto flex-1 min-h-0 select-text">
              <table className="w-full table-auto border-collapse text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-800 sticky top-0 z-20">
                  <tr>
                    <th className="no-print py-2 px-2.5 w-px text-center sticky left-0 z-20 bg-slate-950 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSelectAllFiltered(filteredRecords)}
                        className="p-1 hover:text-white text-slate-400 transition-colors cursor-pointer"
                        title={
                          filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id))
                            ? 'Batalkan semua pilihan'
                            : 'Pilih semua baris'
                        }
                      >
                        {filteredRecords.length > 0 && filteredRecords.every((r) => selectedIds.has(r.id)) ? (
                          <CheckSquare className="w-4 h-4 text-teal-400" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                    </th>
                    <th className="py-2 px-2 text-center w-px text-slate-500 font-mono text-[10px] whitespace-nowrap">No</th>
                    <th className="py-2 px-2.5 whitespace-nowrap text-teal-300">
                      <div className="flex items-center gap-1.5 normal-case font-bold">
                        <Calendar className="w-3.5 h-3.5 text-teal-400" />
                        <span>Tanggal</span>
                      </div>
                    </th>
                    {/* Jam Masuk (WIB) - Header Wrap Teks */}
                    <th
                      className="py-2 px-2 cursor-pointer hover:text-white select-none transition-colors group whitespace-normal break-words max-w-[85px]"
                      onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                      title="Klik untuk mengubah urutan waktu (Terbaru / Terlama)"
                    >
                      <div className="flex items-center gap-1 font-bold text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                        <span className="leading-tight">Jam Masuk (WIB)</span>
                        {sortOrder === 'desc' ? (
                          <ArrowDown className="w-3 h-3 text-teal-400 shrink-0" />
                        ) : (
                          <ArrowUp className="w-3 h-3 text-amber-400 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th className="py-2 px-2.5 whitespace-nowrap"><span className="normal-case font-bold">Nama Peserta Diklat</span></th>
                    {/* Nomor Induk Karyawan (NIK) - Header Wrap Teks */}
                    <th className="py-2 px-2 whitespace-normal break-words max-w-[95px]"><span className="normal-case font-semibold leading-tight block">Nomor Induk Karyawan (NIK)</span></th>
                    <th className="py-2 px-2.5 whitespace-nowrap"><span className="normal-case font-semibold">Unit Kerja</span></th>
                    {/* Kolom Profesi - Jelas Terlihat */}
                    <th className="py-2 px-2.5 whitespace-nowrap text-emerald-300"><span className="normal-case font-bold text-emerald-300">Profesi</span></th>
                    <th className="py-2 px-2.5 whitespace-nowrap"><span className="normal-case font-bold">Judul Diklat</span></th>
                    <th className="py-2 px-2.5 whitespace-nowrap text-center"><span className="normal-case font-semibold">Status Kehadiran</span></th>
                    <th className="py-2 px-2.5 whitespace-nowrap"><span className="normal-case font-bold text-teal-300">Keterangan</span></th>
                    {/* Lokasi Terverifikasi - Diperpanjang & Tidak di-wrap teks */}
                    <th className="py-2 px-2.5 whitespace-nowrap min-w-[320px]"><span className="normal-case font-semibold">Lokasi Terverifikasi</span></th>
                    <th className="no-print py-2 px-2.5 text-center whitespace-nowrap w-px sticky right-0 z-20 bg-slate-950">Aksi</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {paginatedRecords.length > 0 ? (
                    paginatedRecords.map((item, index) => {
                      const isChecked = selectedIds.has(item.id);
                      const rowNumber = startIndex + index + 1;
                      const evalK = calculateAttendanceKeterangan(
                        item.entryTime,
                        item.targetStartTime || getTargetStartTimeForRecord(item),
                        item.timestamp
                      );
                      const isLate =
                        item.status === 'Terlambat' ||
                        evalK.isLate ||
                        (item.keterangan && item.keterangan.startsWith('Terlambat'));
                      const label = item.keterangan || evalK.keterangan;
                      const mapsUrl =
                        item.mapsUrl ||
                        (item.latitude && item.longitude && Number(item.latitude) !== 0 && Number(item.longitude) !== 0
                          ? `https://www.google.com/maps?q=${Number(item.latitude).toFixed(6)},${Number(item.longitude).toFixed(6)}`
                          : '');

                      return (
                        <tr
                          key={item.id}
                          className={`transition-colors text-xs h-9 ${
                            isChecked ? 'bg-rose-950/20 hover:bg-rose-950/30' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="no-print py-1.5 sm:py-2 px-2.5 text-center sticky left-0 z-10 bg-slate-900 w-px whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleSelectRecord(item.id)}
                              className="p-1 hover:text-white transition-colors cursor-pointer"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-teal-400" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                              )}
                            </button>
                          </td>

                          <td className="py-1.5 sm:py-2 px-2 text-center text-slate-400 font-mono text-[11px] font-bold w-px whitespace-nowrap">
                            {rowNumber}
                          </td>

                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap font-mono text-xs">
                            <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 font-semibold border border-teal-500/20 inline-block whitespace-nowrap">
                              {formatDateDDMMYYYY(item.timestamp, item.trainingDate, item.id)}
                            </span>
                          </td>

                          {/* Jam Masuk (WIB) - Wrap Teks */}
                          <td className="py-1.5 sm:py-2 px-2 font-mono text-xs text-slate-200 whitespace-normal break-words max-w-[85px]">
                            <div className="flex flex-col gap-0.5 font-bold leading-tight">
                              <span>{formatTimeWIB(item.entryTime, item.timestamp)}</span>
                              {index === 0 && sortOrder === 'desc' && (
                                <span className="px-1 py-0.2 rounded text-[8px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/30 w-fit tracking-tight">
                                  Terbaru
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                            <span className="font-bold text-slate-100 text-xs sm:text-sm whitespace-nowrap">
                              {item.name}
                            </span>
                          </td>

                          {/* Nomor Induk Karyawan (NIK) - Wrap Teks */}
                          <td className="py-1.5 sm:py-2 px-2 whitespace-normal break-words max-w-[95px] font-mono text-teal-300 text-xs">
                            <span className="break-all">{item.identityNumber ? item.identityNumber : '-'}</span>
                          </td>

                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-xs font-medium inline-block whitespace-nowrap">
                              {item.department || '-'}
                            </span>
                          </td>

                          {/* Kolom Profesi - Jelas Terlihat */}
                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                            <span className="px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-bold inline-block whitespace-nowrap shadow-sm">
                              {item.profession || '-'}
                            </span>
                          </td>

                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                            <span className="font-medium text-slate-200 text-xs whitespace-nowrap" title={item.eventName}>
                              {item.eventName || 'Diklat Pelatihan'}
                            </span>
                          </td>

                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap text-center">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold border inline-block whitespace-nowrap ${
                                isLate
                                   ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                   : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {item.status || (isLate ? 'Terlambat' : 'Hadir')}
                            </span>
                          </td>

                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold border whitespace-nowrap ${
                                isLate
                                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              }`}
                            >
                              {isLate ? (
                                <Clock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              )}
                              <span className="font-medium whitespace-nowrap">{label}</span>
                            </span>
                          </td>

                          {/* Lokasi Terverifikasi - Diperpanjang & Tidak di-wrap teks */}
                          <td className="py-1.5 sm:py-2 px-2.5 whitespace-nowrap min-w-[320px]">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                              <span className="text-slate-200 text-xs whitespace-nowrap" title={item.address}>
                                {item.address || '-'}
                              </span>
                              {item.accuracy > 0 && (
                                <span className="text-[10px] text-slate-400 ml-1 whitespace-nowrap">
                                  (±{Math.round(item.accuracy)}m)
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="no-print py-1.5 sm:py-2 px-2.5 text-center whitespace-nowrap sticky right-0 z-10 bg-slate-900 w-px">
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setSelectedRecord(item)}
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer"
                                title="Lihat Detail & Peta Lokasi"
                              >
                                <Eye className="w-3.5 h-3.5 text-teal-400" />
                                <span>Detail</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setRecordToDelete(item)}
                                className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 text-xs font-semibold transition-all inline-flex items-center gap-1 active:scale-95 cursor-pointer"
                                title="Hapus baris data presensi ini"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                                <span>Hapus</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        <p className="font-semibold text-base text-slate-300">
                          {hasActiveFilters
                            ? 'Tidak Ada Data Presensi yang Sesuai dengan Kriteria Filter'
                            : 'Belum Ada Catatan Presensi'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                          {hasActiveFilters
                            ? 'Coba sesuaikan kata kunci pencarian, rentang tanggal, atau pilihan unit kerja.'
                            : 'Data akan otomatis tercatat saat peserta melakukan scan QR Code presensi.'}
                        </p>
                        {hasActiveFilters && (
                          <button
                            type="button"
                            onClick={resetAllFilters}
                            className="mt-3 px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Hapus Semua Filter</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )}

                  {/* Pengisi baris grid bersih untuk melengkapi tabel agar tidak ada ruang kosong menganga */}
                  {emptyRowCount > 0 &&
                    Array.from({ length: emptyRowCount }).map((_, i) => (
                      <tr
                        key={`empty-grid-${i}`}
                        className="border-b border-slate-800/40 text-slate-700/60 select-none pointer-events-none hover:bg-transparent h-9 print:hidden"
                      >
                        <td className="no-print py-1.5 px-2.5 text-center sticky left-0 z-10 bg-slate-900/90 w-px text-slate-800 font-mono text-[10px]">
                          ·
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-600 font-mono text-[11px] font-bold w-px whitespace-nowrap">
                          {startIndex + paginatedRecords.length + i + 1}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-800 text-xs font-mono">—</td>
                        <td className="py-1.5 px-2 text-slate-800 text-xs font-mono">—</td>
                        <td className="py-1.5 px-2.5 text-slate-800/50 text-xs font-mono">—</td>
                        <td className="py-1.5 px-2 text-slate-800 text-xs font-mono">—</td>
                        <td className="py-1.5 px-2.5 text-slate-800 text-xs">—</td>
                        <td className="py-1.5 px-2.5 text-slate-800 text-xs">—</td>
                        <td className="py-1.5 px-2.5 text-slate-800 text-xs">—</td>
                        <td className="py-1.5 px-2.5 text-center text-slate-800 text-xs">—</td>
                        <td className="py-1.5 px-2.5 text-slate-800 text-xs">—</td>
                        <td className="py-1.5 px-2.5 text-slate-800 text-xs">—</td>
                        <td className="no-print py-1.5 px-2.5 text-center sticky right-0 z-10 bg-slate-900/90 w-px text-slate-800">
                          —
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls - Menampilkan 1 Lembar Kerja & Navigasi Halaman */}
            <div className="no-print px-3 py-1.5 sm:py-2 bg-slate-950 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400 shrink-0 select-none">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-medium text-slate-300 text-[11px] sm:text-xs">
                  Menampilkan{' '}
                  <strong className="text-white">
                    {filteredRecords.length > 0 ? startIndex + 1 : 0}
                  </strong>{' '}
                  -{' '}
                  <strong className="text-white">
                    {Math.min(startIndex + effectiveRowsPerPage, filteredRecords.length)}
                  </strong>{' '}
                  dari total <strong className="text-teal-400">{filteredRecords.length}</strong> data presensi
                </span>

                <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-slate-800">
                  <span className="text-[11px] text-slate-400">Tampilkan:</span>
                  <select
                    value={rowsPerPageMode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRowsPerPageMode(val);
                      try {
                        localStorage.setItem('presensi_rekap_rows_per_page', val);
                      } catch {}
                      setCurrentPage(1);
                    }}
                    className="bg-slate-900 border border-slate-700 text-teal-300 rounded-lg px-2 py-0.5 text-xs focus:outline-none focus:border-teal-400 cursor-pointer font-medium"
                  >
                    <option value="auto">Auto (Pas Layar Penuh - {rowsFittingContainer} baris)</option>
                    <option value="10">10 baris</option>
                    <option value="15">15 baris</option>
                    <option value="20">20 baris</option>
                    <option value="25">25 baris</option>
                    <option value="50">50 baris</option>
                    <option value="all">Semua ({filteredRecords.length} data - Scroll)</option>
                  </select>
                </div>

                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-teal-300 border border-slate-700 hidden sm:inline-block">
                  {rowsPerPageMode === 'all'
                    ? 'Semua Data Ditampilkan'
                    : `Halaman ${currentPage} dari ${totalPages}`}
                </span>
              </div>

              {/* Page buttons */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5 select-none flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                    title="Halaman Pertama (Terbaru)"
                  >
                    « Pertama
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                    title="Halaman Sebelumnya"
                  >
                    ‹ Prev
                  </button>

                  {/* Dynamic page numbers */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      return p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1;
                    })
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
                                : 'bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300'
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
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                    title="Halaman Selanjutnya"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer text-xs font-semibold"
                    title="Halaman Terakhir"
                  >
                    Terakhir »
                  </button>
                </div>
              )}
            </div>
        </div>
        </>
      )}

      {/* Record Detail Modal with Map View */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden text-white flex flex-col max-h-[90vh]">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-teal-400" />
                Detail Presensi &amp; Peta Lokasi
              </h3>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs sm:text-sm">
              {selectedRecord.latitude !== 0 && selectedRecord.longitude !== 0 && (
                <div className="w-full h-56 rounded-xl overflow-hidden border border-slate-700 relative">
                  <Pure2DGpsMap
                    latitude={selectedRecord.latitude}
                    longitude={selectedRecord.longitude}
                    accuracy={selectedRecord.accuracy || 10}
                    mapsUrl={selectedRecord.mapsUrl}
                    height="100%"
                    title={`Peta Presensi - ${selectedRecord.name}`}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-slate-300">
                <div>
                  <span className="text-slate-400 text-[11px] block">Nama Peserta:</span>
                  <strong className="text-white font-semibold text-sm">{selectedRecord.name}</strong>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">NIK:</span>
                  <span className="font-mono text-teal-300 font-semibold">{selectedRecord.identityNumber || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Unit Kerja:</span>
                  <span className="px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 font-semibold border border-teal-500/20 text-xs inline-block mt-0.5">
                    {selectedRecord.department || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Profesi:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-semibold border border-emerald-500/20 text-xs inline-block mt-0.5">
                    {selectedRecord.profession || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Tanggal:</span>
                  <span className="font-mono text-teal-300 font-semibold">{formatDateDDMMYYYY(selectedRecord.timestamp, selectedRecord.trainingDate, selectedRecord.id)}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Jam Masuk (WIB):</span>
                  <span className="font-mono text-teal-300 font-semibold">{formatTimeWIB(selectedRecord.entryTime, selectedRecord.timestamp)}</span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400 text-[11px] block">Keterangan Jam Masuk:</span>
                  {(() => {
                    const evalK = calculateAttendanceKeterangan(
                      selectedRecord.entryTime,
                      selectedRecord.targetStartTime || getTargetStartTimeForRecord(selectedRecord),
                      selectedRecord.timestamp
                    );
                    const isLate =
                      selectedRecord.status === 'Terlambat' ||
                      evalK.isLate ||
                      (selectedRecord.keterangan && selectedRecord.keterangan.startsWith('Terlambat'));
                    const label = selectedRecord.keterangan || evalK.keterangan;
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold border ${
                            isLate
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {isLate ? <Clock className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          <span>{label}</span>
                        </span>
                        <span className="text-xs text-slate-300 font-mono">
                          (Target Jam Masuk: <strong className="text-teal-300">{evalK.targetStartTime}</strong>)
                        </span>
                      </div>
                    );
                  })()}
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-800/80">
                  <span className="text-slate-400 text-[11px] block">Materi / Judul Diklat:</span>
                  <span className="text-white font-medium">{selectedRecord.eventName}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 text-[11px] block mb-1">Alamat Terdeteksi:</span>
                <p className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-slate-200 leading-relaxed text-xs">
                  {selectedRecord.address}
                </p>
              </div>

              {selectedRecord.latitude !== 0 && (
                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span>
                    Koordinat: {selectedRecord.latitude.toFixed(6)}, {selectedRecord.longitude.toFixed(6)} (±{Math.round(selectedRecord.accuracy)}m)
                  </span>
                  <a
                    href={selectedRecord.mapsUrl || `https://www.google.com/maps?q=${selectedRecord.latitude},${selectedRecord.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400 hover:text-teal-300 font-semibold flex items-center gap-1"
                  >
                    Google Maps <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              {/* Geofence Status */}
              {selectedRecord.latitude !== 0 && (() => {
                const geo = validateCoordinatesGeofence(
                  selectedRecord.latitude,
                  selectedRecord.longitude,
                  undefined,
                  selectedRecord.accuracy || 85
                );
                return (
                  <div
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      geo.isInRadius
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      {geo.isInRadius ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      )}
                      <span>
                        {geo.isInRadius
                          ? `Terverifikasi di Area RS: ${geo.nearestLocation?.name}`
                          : `Di Luar Radius Titik RS: ${geo.nearestLocation?.name || 'Area RS'}`}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{geo.message}</p>
                  </div>
                );
              })()}
            </div>

            <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const target = selectedRecord;
                  setSelectedRecord(null);
                  setRecordToDelete(target);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 font-semibold text-xs transition-all inline-flex items-center gap-1.5 active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Hapus Presensi Ini</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus 1 Baris Presensi */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl overflow-hidden text-white">
            <div className="bg-rose-950/40 px-6 py-4 border-b border-rose-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-rose-100">
                  Konfirmasi Hapus Presensi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs sm:text-sm">
              <p className="text-slate-300">
                Apakah Anda yakin ingin menghapus data presensi peserta ini dari rekap data?
              </p>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-1 font-mono text-xs">
                <div className="text-white font-bold text-sm font-sans">{recordToDelete.name}</div>
                <div className="text-teal-400">Unit: {recordToDelete.department || '-'}</div>
                <div className="text-slate-400">Waktu: {recordToDelete.timestamp}</div>
                <div className="text-slate-400">NIK: {recordToDelete.identityNumber || '-'}</div>
              </div>
              <p className="text-[11px] text-slate-400 italic">
                *Catatan: Baris data ini akan dihapus dari server dan browser ini.
              </p>
            </div>

            <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteRecord}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Data'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Terpilih (Bulk Delete) */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/30 rounded-2xl shadow-2xl overflow-hidden text-white">
            <div className="bg-rose-950/40 px-6 py-4 border-b border-rose-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                  <AlertOctagon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-rose-100">
                  Hapus {selectedIds.size} Data Terpilih
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isDeleting}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs sm:text-sm">
              <p className="text-slate-300">
                Apakah Anda yakin ingin menghapus <strong className="text-white font-bold">{selectedIds.size} baris</strong> data presensi yang telah Anda pilih?
              </p>
              <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">
                Tindakan ini tidak dapat dibatalkan. Baris terpilih akan dihapus permanen.
              </p>
            </div>

            <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteSelected}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : `Hapus (${selectedIds.size}) Data`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Kosongkan Semua Rekap (Clear All) */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-2xl shadow-2xl overflow-hidden text-white">
            <div className="bg-rose-950/60 px-6 py-4 border-b border-rose-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/25 text-rose-400 border border-rose-500/40 flex items-center justify-center">
                  <AlertOctagon className="w-4 h-4 text-rose-400" />
                </div>
                <h3 className="font-bold text-base text-rose-100">
                  Kosongkan Semua Data Rekapitulasi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                disabled={isDeleting}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 text-xs sm:text-sm">
              <p className="text-slate-300">
                Peringatan: Seluruh data kehadiran sejumlah <strong className="text-white font-bold">{records.length} baris</strong> akan dihapus dari rekap aplikasi.
              </p>
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-[11px] text-amber-200">
                Gunakan fungsi ini jika Anda ingin memulai sesi diklat / pelatihan yang baru dengan tabel kosong bersih.
              </div>
            </div>

            <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmClearAll}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Mengosongkan...' : 'Ya, Kosongkan Semua'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
