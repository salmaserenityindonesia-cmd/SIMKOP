import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Package,
  PiggyBank,
  Printer,
  RefreshCw,
  Save,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import { getKoperasiProfile } from '../../services/settingsService';
import {
  calculateMonthlySnapshot,
  getMonthNameId,
  getMonthlyClosingsByYear,
  MONTH_NAMES_ID,
  saveMonthlyClosing,
  type MonthlyClosingRecord,
  type MonthlyClosingSnapshot,
} from '../../services/monthlyClosingService';
import { exportMonthlyClosingPdf } from '../../utils/monthlyClosingPdfExporter';

const formatRp = (n: number): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

const formatDateTimeId = (raw?: string | null): string => {
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function getAvailableYears(selectedYear: number): number[] {
  const nowYear = new Date().getFullYear();
  const years = new Set<number>([nowYear - 1, nowYear, nowYear + 1, selectedYear]);
  return Array.from(years).sort((a, b) => b - a);
}

function getTodayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function MonthlyClosing() {
  const { showToast } = useFeedback();
  const now = new Date();

  const [fiscalYear, setFiscalYear] = useState<number>(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number>(now.getMonth() + 1);
  const [snapshot, setSnapshot] = useState<MonthlyClosingSnapshot | null>(null);
  const [yearlyClosings, setYearlyClosings] = useState<MonthlyClosingRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [printingRowMonth, setPrintingRowMonth] = useState<number | null>(null);

  // Form notulensi rapat evaluasi bulanan
  const [minutesNumber, setMinutesNumber] = useState<string>('');
  const [meetingDate, setMeetingDate] = useState<string>(getTodayIsoDate());
  const [attendees, setAttendees] = useState<string>('');
  const [evaluationNotes, setEvaluationNotes] = useState<string>('');

  const availableYears = useMemo(() => getAvailableYears(fiscalYear), [fiscalYear]);

  const currentRecord = useMemo(
    () => yearlyClosings.find((c) => c.period_month === periodMonth) ?? null,
    [yearlyClosings, periodMonth]
  );

  const closingByMonthMap = useMemo(() => {
    const map = new Map<number, MonthlyClosingRecord>();
    for (const c of yearlyClosings) {
      map.set(c.period_month, c);
    }
    return map;
  }, [yearlyClosings]);

  const syncFormFromRecord = useCallback(
    (rec: MonthlyClosingRecord | null, targetYear: number, targetMonth: number) => {
      const mm = String(targetMonth).padStart(2, '0');
      if (rec) {
        setMinutesNumber(rec.minutes_number ?? '');
        setMeetingDate(rec.meeting_date ?? getTodayIsoDate());
        setAttendees(rec.attendees ?? '');
        setEvaluationNotes(rec.evaluation_notes ?? '');
      } else {
        setMinutesNumber(`BA-EVAL/${targetYear}/${mm}`);
        setMeetingDate(getTodayIsoDate());
        setAttendees('');
        setEvaluationNotes('');
      }
    },
    []
  );

  const loadMonthData = useCallback(
    async (targetYear: number, targetMonth: number) => {
      setLoading(true);
      try {
        const [calcSnapshot, closings] = await Promise.all([
          calculateMonthlySnapshot(targetYear, targetMonth),
          getMonthlyClosingsByYear(targetYear),
        ]);
        setSnapshot(calcSnapshot);
        setYearlyClosings(closings);
        const rec = closings.find((c) => c.period_month === targetMonth) ?? null;
        syncFormFromRecord(rec, targetYear, targetMonth);
      } catch (err: any) {
        console.error('Gagal memuat data rekap akhir bulan:', err);
        showToast(err?.message || 'Gagal menghitung snapshot rekap akhir bulan.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [showToast, syncFormFromRecord]
  );

  useEffect(() => {
    loadMonthData(fiscalYear, periodMonth);
  }, [fiscalYear, periodMonth, loadMonthData]);

  const handleSaveMonthlyClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshot) return;

    setSaving(true);
    try {
      const saved = await saveMonthlyClosing({
        snapshot,
        minutesNumber,
        meetingDate,
        attendees,
        evaluationNotes,
      });

      setYearlyClosings((prev) => {
        const others = prev.filter((item) => item.period_month !== saved.period_month);
        return [...others, saved].sort((a, b) => a.period_month - b.period_month);
      });

      showToast(
        `Rekap Akhir Bulan ${getMonthNameId(periodMonth)} ${fiscalYear} berhasil ${
          currentRecord ? 'diperbarui' : 'disahkan & diarsipkan'
        }.`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal menyimpan rekap bulanan:', err);
      showToast(err?.message || 'Gagal menyimpan pengesahan rekap akhir bulan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintCurrentPdf = async () => {
    if (!snapshot) return;
    try {
      const profile = await getKoperasiProfile();
      exportMonthlyClosingPdf({
        snapshot,
        record: currentRecord,
        profile,
        minutesNumber,
        meetingDate,
        attendees,
        evaluationNotes,
        autoSave: true,
      });
      showToast('Berita Acara Rekap Bulanan (PDF) berhasil diunduh.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mencetak PDF Berita Acara.', 'error');
    }
  };

  const handleDownloadRowPdf = async (rec: MonthlyClosingRecord) => {
    setPrintingRowMonth(rec.period_month);
    try {
      const [profile, rowSnapshot] = await Promise.all([
        getKoperasiProfile(),
        rec.period_month === periodMonth && snapshot
          ? Promise.resolve(snapshot)
          : calculateMonthlySnapshot(rec.fiscal_year, rec.period_month),
      ]);

      exportMonthlyClosingPdf({
        snapshot: rowSnapshot,
        record: rec,
        profile,
        autoSave: true,
      });
      showToast(
        `Berita Acara ${getMonthNameId(rec.period_month)} ${rec.fiscal_year} berhasil diunduh.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh PDF arsip bulan.', 'error');
    } finally {
      setPrintingRowMonth(null);
    }
  };

  const selectedMonthName = getMonthNameId(periodMonth);

  return (
    <AdminLayout>
      <div className="space-y-6 pb-12">
        {/* Header & Period Selectors */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CalendarCheck2 className="w-3.5 h-3.5" />
                  SOFT ARCHIVE • TANPA PEMBAGIAN SHU
                </span>
                {currentRecord ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Sudah Disahkan
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="w-3.5 h-3.5" />
                    Belum Direkap
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                Rekap Akhir Bulan & Berita Acara Rapat Pengurus
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Potret neraca bulanan, arus kas brankas, kewajiban simpanan, piutang, dan evaluasi SHU
                tanpa membagi SHU dan tanpa menolkan laba tahun berjalan.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Pilih Bulan"
                value={periodMonth}
                onChange={(e) => setPeriodMonth(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {MONTH_NAMES_ID.map((name, idx) => (
                  <option key={name} value={idx + 1}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Pilih Tahun Buku"
                value={fiscalYear}
                onChange={(e) => setFiscalYear(Number(e.target.value))}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => loadMonthData(fiscalYear, periodMonth)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs sm:text-sm font-semibold text-slate-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Sinkronkan Ulang
              </button>

              <button
                type="button"
                onClick={handlePrintCurrentPdf}
                disabled={loading || !snapshot}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                Cetak Berita Acara (PDF)
              </button>
            </div>
          </div>
        </div>

        {loading || !snapshot ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-600">
              Menghitung posisi neraca dan kinerja {selectedMonthName} {fiscalYear}...
            </p>
          </div>
        ) : (
          <>
            {/* Bagian 1: Ringkasan Kas & Posisi Neraca Akhir Bulan */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                  1. Ringkasan Kas & Posisi Neraca Akhir Bulan ({snapshot.cutoffDate})
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Saldo Kas Akhir Brankas */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Saldo Kas Akhir Brankas
                    </span>
                    <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <Wallet className="w-4 h-4" />
                    </span>
                  </div>
                  <p className="text-xl font-bold text-slate-900">
                    {formatRp(snapshot.closingCashBalance)}
                  </p>
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Saldo Awal Bulan</span>
                      <span className="font-medium">{formatRp(snapshot.openingCashBalance)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>Kas Masuk Bulan Ini</span>
                      <span className="font-medium">+{formatRp(snapshot.monthlyCashIn)}</span>
                    </div>
                    <div className="flex justify-between text-rose-700">
                      <span>Kas Keluar Bulan Ini</span>
                      <span className="font-medium">-{formatRp(snapshot.monthlyCashOut)}</span>
                    </div>
                  </div>
                </div>

                {/* Kewajiban Simpanan Anggota */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Kewajiban Simpanan Anggota
                    </span>
                    <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                      <PiggyBank className="w-4 h-4" />
                    </span>
                  </div>
                  <p className="text-xl font-bold text-slate-900">
                    {formatRp(snapshot.totalSavingsBalance)}
                  </p>
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Pokok:</span>
                      <span className="font-medium">{formatRp(snapshot.savingsPokok)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wajib:</span>
                      <span className="font-medium">{formatRp(snapshot.savingsWajib)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Belanja:</span>
                      <span className="font-medium">{formatRp(snapshot.savingsBelanja)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lebaran:</span>
                      <span className="font-medium">{formatRp(snapshot.savingsLebaran)}</span>
                    </div>
                  </div>
                </div>

                {/* Sisa Piutang Pinjaman & Bon Toko */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Sisa Piutang Pinjaman & Bon Toko
                    </span>
                    <span className="p-2 rounded-xl bg-amber-50 text-amber-600">
                      <FileText className="w-4 h-4" />
                    </span>
                  </div>
                  <p className="text-xl font-bold text-slate-900">
                    {formatRp(snapshot.totalLoanReceivable + snapshot.totalStoreCreditReceivable)}
                  </p>
                  <div className="pt-2 border-t border-slate-100 space-y-1 text-xs text-slate-600">
                    <div className="flex justify-between">
                      <span>Pinjaman ({snapshot.activeLoanCount} berkas)</span>
                      <span className="font-medium">{formatRp(snapshot.totalLoanReceivable)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Piutang Bon Toko</span>
                      <span className="font-medium">
                        {formatRp(snapshot.totalStoreCreditReceivable)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Valuasi Persediaan Barang Gudang */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500">
                      Valuasi Persediaan Barang
                    </span>
                    <span className="p-2 rounded-xl bg-purple-50 text-purple-600">
                      <Package className="w-4 h-4" />
                    </span>
                  </div>
                  <p className="text-xl font-bold text-slate-900">
                    {formatRp(snapshot.inventoryValuation)}
                  </p>
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-500">
                    Total nilai aset persediaan aktif dihitung dari{' '}
                    <span className="font-semibold text-slate-700">SUM(stok × harga beli)</span>.
                  </div>
                </div>
              </div>
            </section>

            {/* Bagian 2: Kinerja Usaha & Akumulasi SHU Sementara */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                  2. Kinerja Usaha & Akumulasi SHU Sementara
                </h2>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <Info className="w-3.5 h-3.5" />
                  SHU tetap terakumulasi & tidak dinolkan hingga disahkan di RAT akhir tahun
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bulan Terpilih */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">
                        Kinerja Bulan Terpilih
                      </p>
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedMonthName} {fiscalYear}
                      </h3>
                    </div>
                    <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                      <TrendingUp className="w-5 h-5" />
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Omzet Penjualan POS</span>
                      <span className="font-medium text-slate-900">
                        {formatRp(snapshot.monthlyRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>HPP / Harga Modal Barang</span>
                      <span className="font-medium text-rose-700">
                        -{formatRp(snapshot.monthlyCogs)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-700 font-medium pt-1 border-t border-slate-100">
                      <span>Laba Kotor Toko Retail</span>
                      <span>{formatRp(snapshot.monthlyGrossProfit)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Realisasi Margin Pembiayaan</span>
                      <span className="font-medium text-emerald-700">
                        +{formatRp(snapshot.monthlyFinancingMargin)}
                      </span>
                    </div>
                    {snapshot.monthlyOpnameImpact !== 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Koreksi Stock Opname</span>
                        <span className="font-medium">
                          {formatRp(snapshot.monthlyOpnameImpact)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Beban Operasional</span>
                      <span className="font-medium text-rose-700">
                        -{formatRp(snapshot.monthlyOpex)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                      <span className="font-bold text-slate-900">
                        SHU / Laba Bulan {selectedMonthName}
                      </span>
                      <span
                        className={`text-lg font-bold ${
                          snapshot.monthlyNetShu >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatRp(snapshot.monthlyNetShu)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Year-to-Date */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase">
                        Akumulasi Tahun Berjalan (YTD)
                      </p>
                      <h3 className="text-base font-bold text-slate-900">
                        Januari s/d {selectedMonthName} {fiscalYear}
                      </h3>
                    </div>
                    <span className="p-2 rounded-xl bg-slate-900 text-white">
                      <Archive className="w-5 h-5" />
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Akumulasi Omzet POS (YTD)</span>
                      <span className="font-medium text-slate-900">
                        {formatRp(snapshot.ytdRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Akumulasi HPP Barang (YTD)</span>
                      <span className="font-medium text-rose-700">
                        -{formatRp(snapshot.ytdCogs)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-700 font-medium pt-1 border-t border-slate-100">
                      <span>Akumulasi Laba Kotor (YTD)</span>
                      <span>{formatRp(snapshot.ytdGrossProfit)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Akumulasi Margin Pembiayaan (YTD)</span>
                      <span className="font-medium text-emerald-700">
                        +{formatRp(snapshot.ytdFinancingMargin)}
                      </span>
                    </div>
                    {snapshot.ytdOpnameImpact !== 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Akumulasi Koreksi Opname (YTD)</span>
                        <span className="font-medium">{formatRp(snapshot.ytdOpnameImpact)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-600">
                      <span>Akumulasi Beban Operasional (YTD)</span>
                      <span className="font-medium text-rose-700">
                        -{formatRp(snapshot.ytdOpex)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200">
                      <span className="font-bold text-slate-900">
                        Akumulasi SHU Tahun Berjalan (YTD)
                      </span>
                      <span
                        className={`text-lg font-bold ${
                          snapshot.ytdNetShu >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatRp(snapshot.ytdNetShu)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Bagian 3: Form Pengesahan & Notulensi Rapat Evaluasi Bulanan */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    3. Pengesahan & Notulensi Rapat Evaluasi Bulanan
                  </h2>
                  <p className="text-xs text-slate-500">
                    Menyimpan snapshot neraca dan berita acara rapat sebagai Soft Archive (transaksi
                    bulan terpilih tetap dapat dikoreksi bila ada jurnal penyesuaian).
                  </p>
                </div>
                {currentRecord && (
                  <span className="text-xs text-slate-500">
                    Terakhir diperbarui: {formatDateTimeId(currentRecord.updated_at)}
                  </span>
                )}
              </div>

              <form onSubmit={handleSaveMonthlyClosing} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nomor Berita Acara
                    </label>
                    <input
                      type="text"
                      value={minutesNumber}
                      onChange={(e) => setMinutesNumber(e.target.value)}
                      placeholder={`BA-EVAL/${fiscalYear}/${String(periodMonth).padStart(2, '0')}`}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Tanggal Rapat Evaluasi
                    </label>
                    <input
                      type="date"
                      value={meetingDate}
                      onChange={(e) => setMeetingDate(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Pengurus & Pengawas yang Hadir
                    </label>
                    <input
                      type="text"
                      value={attendees}
                      onChange={(e) => setAttendees(e.target.value)}
                      placeholder="Ketua, Bendahara, Sekretaris, Pengawas..."
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catatan Evaluasi / Keputusan Rapat
                  </label>
                  <textarea
                    rows={3}
                    value={evaluationNotes}
                    onChange={(e) => setEvaluationNotes(e.target.value)}
                    placeholder="Catat hasil evaluasi kas, stok opname, penagihan piutang, atau tindak lanjut pengurus bulan ini..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handlePrintCurrentPdf}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Cetak Berita Acara (PDF)
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving
                      ? 'Menyimpan...'
                      : currentRecord
                        ? 'Perbarui Snapshot & Berita Acara'
                        : 'Sahkan & Simpan Rekap Bulan Ini'}
                  </button>
                </div>
              </form>
            </section>

            {/* Bagian 4: Tabel Arsip 12 Bulan Tahun Buku */}
            <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    4. Arsip Rekap Bulanan Tahun Buku {fiscalYear}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Status pengesahan evaluasi bulanan Januari – Desember {fiscalYear}
                  </p>
                </div>
                <span className="text-xs font-semibold text-slate-600">
                  {yearlyClosings.length} / 12 Bulan Disahkan
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Bulan</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">No. Berita Acara</th>
                      <th className="px-4 py-3 font-semibold text-right">Saldo Kas Akhir</th>
                      <th className="px-4 py-3 font-semibold text-right">SHU Bulan Ini</th>
                      <th className="px-4 py-3 font-semibold text-right">SHU Akumulasi (YTD)</th>
                      <th className="px-4 py-3 font-semibold text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MONTH_NAMES_ID.map((monthName, idx) => {
                      const m = idx + 1;
                      const rec = closingByMonthMap.get(m) ?? null;
                      const isSelected = m === periodMonth;
                      return (
                        <tr
                          key={m}
                          className={
                            isSelected ? 'bg-emerald-50/40' : 'hover:bg-slate-50/70'
                          }
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900">
                            {monthName} {fiscalYear}
                          </td>
                          <td className="px-4 py-3">
                            {rec ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sudah Disahkan
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                                Belum Direkap
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {rec?.minutes_number || '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">
                            {rec ? formatRp(rec.closing_cash_balance) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-800">
                            {rec ? formatRp(rec.monthly_net_shu) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700">
                            {rec ? formatRp(rec.ytd_net_shu) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setPeriodMonth(m)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                              >
                                Lihat / Edit
                              </button>
                              {rec && (
                                <button
                                  type="button"
                                  disabled={printingRowMonth === m}
                                  onClick={() => handleDownloadRowPdf(rec)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <Printer className="w-3 h-3" />
                                  {printingRowMonth === m ? 'Menyiapkan...' : 'Unduh PDF'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
