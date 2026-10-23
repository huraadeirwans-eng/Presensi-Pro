import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import {
  BarChart3,
  Calendar,
  TrendingUp,
  Award,
  Users,
  ChevronDown,
  ChevronUp,
  Layers,
  MapPin,
  CheckCircle2,
  Filter,
} from 'lucide-react';
import { AttendanceRecord } from '../types';

interface DailyAttendanceChartProps {
  records: AttendanceRecord[];
  filteredRecords?: AttendanceRecord[];
  hasActiveFilters?: boolean;
}

interface DailyDataPoint {
  dateKey: string; // YYYY-MM-DD
  label: string; // "02 Okt" or "02/10"
  fullDateStr: string; // "Jumat, 02 Oktober 2026"
  totalPeserta: number;
  terverifikasiGps: number;
  tepatWaktu: number;
  terlambat: number;
  departmentBreakdown: Record<string, number>;
}

/**
 * Parsing tanggal dari timestamp presensi menjadi representasi YYYY-MM-DD dan label
 */
const parseDateKey = (timestamp: string, trainingDate?: string): { dateKey: string; fullDateStr: string; label: string } => {
  // 1. Coba dari trainingDate jika tersedia (format DD/MM/YYYY atau YYYY-MM-DD)
  const cleanTraining = (trainingDate || '').trim();
  if (cleanTraining && cleanTraining !== '-') {
    if (/^\d{4}-\d{2}-\d{2}/.test(cleanTraining)) {
      const parts = cleanTraining.split('T')[0].split(' ')[0].split('-');
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return {
          dateKey,
          label: dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
          fullDateStr: dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        };
      }
    }
    const dmy = cleanTraining.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmy) {
      const d = parseInt(dmy[1], 10);
      const m = parseInt(dmy[2], 10) - 1;
      const y = parseInt(dmy[3], 10);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return {
          dateKey,
          label: dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
          fullDateStr: dt.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        };
      }
    }
  }

  const raw = (timestamp || '').trim();

  // 2. Format ISO atau YYYY-MM-DD (e.g. 2026-10-02...)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parts = raw.split('T')[0].split(' ')[0].split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const d = new Date(year, month, day);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    const fullDateStr = d.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return { dateKey, fullDateStr, label };
  }

  // 2. Format Indonesia DD/MM/YYYY atau DD-MM-YYYY
  const cleaned = raw.replace(',', ' ').replace(/\s+/g, ' ').trim();
  const datePart = cleaned.split(' ')[0] || '';
  if (datePart && (datePart.includes('/') || datePart.includes('-'))) {
    const isSlash = datePart.includes('/');
    const tokens = datePart.split(isSlash ? '/' : '-').map((s) => parseInt(s, 10));

    if (tokens.length === 3) {
      let day = tokens[0];
      let month = tokens[1] - 1;
      let year = tokens[2];

      if (tokens[0] > 1000) {
        year = tokens[0];
        month = tokens[1] - 1;
        day = tokens[2];
      } else if (year < 100) {
        year += 2000;
      }

      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
        const fullDateStr = d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return { dateKey, fullDateStr, label };
      }
    }
  }

  // 3. Fallback direct date
  const fallback = new Date(raw);
  if (!isNaN(fallback.getTime())) {
    const year = fallback.getFullYear();
    const month = fallback.getMonth();
    const day = fallback.getDate();
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const label = fallback.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    const fullDateStr = fallback.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return { dateKey, fullDateStr, label };
  }

  // Default fallback to today
  const today = new Date();
  const dateKey = today.toISOString().split('T')[0];
  return {
    dateKey,
    label: today.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
    fullDateStr: today.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
};

export const DailyAttendanceChart: React.FC<DailyAttendanceChartProps> = ({
  records,
  filteredRecords,
  hasActiveFilters,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [rangeFilter, setRangeFilter] = useState<'7' | '14' | '30' | 'all'>('all');
  const [chartMode, setChartMode] = useState<'single' | 'breakdown'>('single');
  const [useFilteredData, setUseFilteredData] = useState(false);

  // Gunakan data hasil filter jika pengguna memilih mode filter dan filter sedang aktif
  const activeRecords = useFilteredData && filteredRecords && hasActiveFilters ? filteredRecords : records;

  // Aggregation of daily records
  const dailyData = useMemo(() => {
    if (!activeRecords || activeRecords.length === 0) return [];

    const map = new Map<string, DailyDataPoint>();

    activeRecords.forEach((record) => {
      const { dateKey, fullDateStr, label } = parseDateKey(record.timestamp, record.trainingDate);

      if (!map.has(dateKey)) {
        map.set(dateKey, {
          dateKey,
          label,
          fullDateStr,
          totalPeserta: 0,
          terverifikasiGps: 0,
          tepatWaktu: 0,
          terlambat: 0,
          departmentBreakdown: {},
        });
      }

      const entry = map.get(dateKey)!;
      entry.totalPeserta += 1;

      if (record.latitude !== 0 && record.accuracy > 0) {
        entry.terverifikasiGps += 1;
      }

      const isLate =
        record.status === 'Terlambat' ||
        (record.keterangan || '').toLowerCase().includes('terlambat');
      if (isLate) {
        entry.terlambat += 1;
      } else {
        entry.tepatWaktu += 1;
      }

      const dept = record.department ? record.department.trim() : 'Lainnya';
      entry.departmentBreakdown[dept] = (entry.departmentBreakdown[dept] || 0) + 1;
    });

    // Sort chronologically (oldest day to newest day for left-to-right timeline)
    const sorted = Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    // Filter by selected range
    if (rangeFilter === 'all') return sorted;
    const limit = parseInt(rangeFilter, 10);
    return sorted.slice(-limit);
  }, [activeRecords, rangeFilter]);

  // Statistics calculation
  const stats = useMemo(() => {
    if (dailyData.length === 0) {
      return {
        totalDays: 0,
        totalPeserta: 0,
        averagePerDay: 0,
        peakDay: null as DailyDataPoint | null,
      };
    }

    const totalDays = dailyData.length;
    const totalPeserta = dailyData.reduce((acc, curr) => acc + curr.totalPeserta, 0);
    const averagePerDay = Math.round(totalPeserta / totalDays);

    let peak = dailyData[0];
    dailyData.forEach((item) => {
      if (item.totalPeserta > peak.totalPeserta) {
        peak = item;
      }
    });

    return {
      totalDays,
      totalPeserta,
      averagePerDay,
      peakDay: peak,
    };
  }, [dailyData]);

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data: DailyDataPoint = payload[0].payload;
      const topDepts = Object.entries(data.departmentBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      return (
        <div className="bg-slate-900/95 border border-slate-700/90 rounded-2xl p-4 shadow-2xl backdrop-blur-md text-xs text-white max-w-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="border-b border-slate-800 pb-2">
            <span className="text-[10px] text-teal-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {data.fullDateStr}
            </span>
            <div className="text-base font-black text-white mt-0.5 flex items-baseline gap-1.5">
              <span>{data.totalPeserta} Peserta</span>
              <span className="text-[10px] font-normal text-slate-400">terdata presensi</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[9px]">Tepat Waktu:</span>
              <span className="font-bold text-emerald-300">
                {data.tepatWaktu} ({data.totalPeserta > 0 ? Math.round((data.tepatWaktu / data.totalPeserta) * 100) : 0}%)
              </span>
            </div>
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[9px]">Terlambat:</span>
              <span className="font-bold text-rose-300">
                {data.terlambat} ({data.totalPeserta > 0 ? Math.round((data.terlambat / data.totalPeserta) * 100) : 0}%)
              </span>
            </div>
          </div>

          {topDepts.length > 0 && (
            <div className="pt-1">
              <span className="text-[10px] text-slate-400 block mb-1 font-semibold">
                Unit Kerja Terbanyak:
              </span>
              <div className="space-y-1">
                {topDepts.map(([dept, count]) => (
                  <div key={dept} className="flex items-center justify-between text-[11px] text-slate-300">
                    <span className="truncate max-w-[140px]">• {dept}</span>
                    <span className="font-mono font-bold text-teal-400">{count} orang</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden text-white transition-all">
      {/* Chart Header Bar */}
      <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between md:justify-start gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm sm:text-base text-white tracking-tight flex items-center gap-1.5">
                  Grafik Batang Harian Peserta Diklat
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  D3 / Recharts
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Visualisasi tren jumlah peserta yang hadir mengikuti diklat pelatihan per hari.
              </p>
            </div>
          </div>

          {/* Mobile Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="md:hidden p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex flex-wrap items-center gap-2 self-end md:self-auto">
          {/* Data Source Switcher: All Data vs Filtered Data */}
          {hasActiveFilters && filteredRecords && (
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-teal-500/30 text-xs">
              <button
                type="button"
                onClick={() => setUseFilteredData(false)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  !useFilteredData
                    ? 'bg-slate-800 text-teal-300 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Tampilkan grafik dari seluruh data presensi"
              >
                Semua ({records.length})
              </button>
              <button
                type="button"
                onClick={() => setUseFilteredData(true)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  useFilteredData
                    ? 'bg-teal-500 text-slate-950 shadow-sm'
                    : 'text-teal-400 hover:text-teal-300'
                }`}
                title="Tampilkan grafik khusus data hasil filter"
              >
                Hasil Filter ({filteredRecords.length})
              </button>
            </div>
          )}

          {/* Mode Switcher: Single Total vs Breakdown */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('single')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                chartMode === 'single'
                  ? 'bg-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Total Peserta
            </button>
            <button
              type="button"
              onClick={() => setChartMode('breakdown')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                chartMode === 'breakdown'
                  ? 'bg-teal-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Tepat &amp; Terlambat
            </button>
          </div>

          {/* Time Range Filter Buttons */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {(['7', '14', '30', 'all'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setRangeFilter(range)}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                  rangeFilter === range
                    ? 'bg-slate-800 text-teal-300 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {range === 'all' ? 'Semua' : `${range} Hari`}
              </button>
            ))}
          </div>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
            title={isExpanded ? 'Sembunyikan Grafik' : 'Tampilkan Grafik'}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Lipat</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Buka</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Collapsible Chart Body */}
      {isExpanded && (
        <div className="p-4 sm:p-6 space-y-5">
          {/* Quick Analytical Insights KPI Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3 text-teal-400" />
                Hari Terdata
              </span>
              <div className="text-lg font-black text-white mt-1">
                {stats.totalDays} <span className="text-xs font-normal text-slate-400">Hari</span>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Users className="w-3 h-3 text-emerald-400" />
                Total Hadir
              </span>
              <div className="text-lg font-black text-emerald-400 mt-1">
                {stats.totalPeserta} <span className="text-xs font-normal text-slate-400">Peserta</span>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-teal-300" />
                Rata-rata Harian
              </span>
              <div className="text-lg font-black text-teal-300 mt-1">
                {stats.averagePerDay} <span className="text-xs font-normal text-slate-400">/ hari</span>
              </div>
            </div>

            <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <Award className="w-3 h-3 text-amber-400" />
                Presensi Tertinggi
              </span>
              <div className="text-lg font-black text-amber-400 mt-1 truncate" title={stats.peakDay ? `${stats.peakDay.label}: ${stats.peakDay.totalPeserta}` : '-'}>
                {stats.peakDay ? (
                  <>
                    {stats.peakDay.totalPeserta}{' '}
                    <span className="text-[10px] font-mono text-slate-300">({stats.peakDay.label})</span>
                  </>
                ) : (
                  '-'
                )}
              </div>
            </div>
          </div>

          {/* Bar Chart Container */}
          {dailyData.length > 0 ? (
            <div className="w-full h-72 sm:h-80 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dailyData}
                  margin={{ top: 15, right: 15, left: -15, bottom: 5 }}
                >
                  <defs>
                    {/* Teal gradient for total peserta */}
                    <linearGradient id="gradientTotalPeserta" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.65} />
                    </linearGradient>

                    {/* Emerald gradient for Tepat Waktu */}
                    <linearGradient id="gradientTepat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#047857" stopOpacity={0.65} />
                    </linearGradient>

                    {/* Rose/Amber gradient for Terlambat */}
                    <linearGradient id="gradientLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#be123c" stopOpacity={0.65} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                  />

                  <YAxis
                    stroke="#64748b"
                    allowDecimals={false}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: '#334155' }}
                  />

                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(51, 65, 85, 0.25)', radius: 8 }}
                  />

                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: '12px', fontSize: '11px' }}
                  />

                  {chartMode === 'single' ? (
                    <Bar
                      name="Jumlah Peserta"
                      dataKey="totalPeserta"
                      fill="url(#gradientTotalPeserta)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                      animationDuration={800}
                    >
                      {dailyData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            stats.peakDay && entry.dateKey === stats.peakDay.dateKey
                              ? '#2dd4bf'
                              : 'url(#gradientTotalPeserta)'
                          }
                        />
                      ))}
                    </Bar>
                  ) : (
                    <>
                      <Bar
                        name="Tepat Waktu"
                        dataKey="tepatWaktu"
                        fill="url(#gradientTepat)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={28}
                        animationDuration={800}
                      />
                      <Bar
                        name="Terlambat"
                        dataKey="terlambat"
                        fill="url(#gradientLate)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={28}
                        animationDuration={800}
                      />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500">
                <BarChart3 className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-400 max-w-sm">
                Belum ada data presensi harian yang tercatat untuk ditampilkan pada grafik batang.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
