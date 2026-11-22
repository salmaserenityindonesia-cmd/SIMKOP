import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Banknote,
  BookCheck,
  CheckCircle2,
  FileText,
  Landmark,
  Lock,
  PiggyBank,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Unlock,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import { getKoperasiProfile } from '../../services/settingsService';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';
import {
  computeYearEndPreview,
  createDefaultRatSettings,
  executeYearEndClosing,
  getFiscalYearClosingsHistory,
  getOrInitYearEndSettings,
  recalculatePreviewWithSettings,
  saveYearEndSettings,
  validateRatSettings,
  type FiscalYearClosingRecord,
  type RatShuSettings,
  type ShuPayoutMethod,
  type YearEndClosingPreview,
} from '../../services/yearEndClosingService';
import { exportYearEndClosingPdf } from '../../utils/yearEndClosingPdf';

export interface TutupBukuProps {
  initialFiscalYear?: number;
  initialSettings?: RatShuSettings | null;
  initialPreview?: YearEndClosingPreview | null;
  initialClosingsHistory?: FiscalYearClosingRecord[];
  initialConfirmModalOpen?: boolean;
  initialNotes?: string;
}

const formatRp = (n: number): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

const formatDateId = (raw?: string | null): string => {
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

function getAvailableFiscalYears(
  selectedYear: number,
  history: FiscalYearClosingRecord[]
): number[] {
  const nowYear = new Date().getFullYear();
  const years = new Set<number>([
    nowYear - 1,
    nowYear,
    nowYear + 1,
    selectedYear,
  ]);
  for (const h of history) {
    if (Number.isFinite(h.fiscal_year)) {
      years.add(h.fiscal_year);
    }
  }
  return Array.from(years).sort((a, b) => b - a);
}

export default function TutupBuku({
  initialFiscalYear,
  initialSettings = null,
  initialPreview = null,
  initialClosingsHistory = [],
  initialConfirmModalOpen = false,
  initialNotes = '',
}: TutupBukuProps = {}) {
  const { showToast } = useFeedback();
  const inRouter = useInRouterContext();
  const defaultYear = initialFiscalYear ?? new Date().getFullYear();

  const [fiscalYear, setFiscalYear] = useState<number>(defaultYear);
  const [settings, setSettings] = useState<RatShuSettings>(
    initialSettings ?? createDefaultRatSettings(defaultYear)
  );
  const [rawPreview, setRawPreview] = useState<YearEndClosingPreview | null>(
    initialPreview
  );
  const [closingsHistory, setClosingsHistory] = useState<FiscalYearClosingRecord[]>(
    initialClosingsHistory
  );
  const [loading, setLoading] = useState<boolean>(!initialPreview);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(
    initialConfirmModalOpen
  );
  const [closingNotes, setClosingNotes] = useState<string>(initialNotes);
  const [memberSearch, setMemberSearch] = useState<string>('');

  const loadYearData = useCallback(async (targetYear: number) => {
    setLoading(true);
    try {
      const [loadedSettings, history] = await Promise.all([
        getOrInitYearEndSettings(targetYear),
        getFiscalYearClosingsHistory(),
      ]);

      const preview = await computeYearEndPreview(targetYear, loadedSettings);

      if (preview.isClosed && preview.closingRecord) {
        const rec = preview.closingRecord;
        setSettings({
          ...loadedSettings,
          fiscal_year: targetYear,
          reserve_fund_pct: rec.reserve_fund_pct ?? loadedSettings.reserve_fund_pct,
          member_shu_pct: rec.member_shu_pct ?? loadedSettings.member_shu_pct,
          other_fund_pct: rec.other_fund_pct ?? loadedSettings.other_fund_pct,
          member_business_pct: rec.member_business_pct ?? loadedSettings.member_business_pct,
          member_capital_pct: rec.member_capital_pct ?? loadedSettings.member_capital_pct,
          payout_method: rec.payout_method ?? loadedSettings.payout_method,
          target_deposit_type_code:
            rec.target_deposit_type_code ?? loadedSettings.target_deposit_type_code,
        });
      } else {
        setSettings(loadedSettings);
      }

      setRawPreview(preview);
      setClosingsHistory(history);
    } catch (err: any) {
      console.error('Gagal memuat pratinjau tutup buku:', err);
      showToast(err?.message || 'Gagal memuat data tutup buku akhir tahun.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (initialPreview && fiscalYear === defaultYear) {
      return;
    }
    loadYearData(fiscalYear);
  }, [fiscalYear, initialPreview, defaultYear, loadYearData]);

  const preview = useMemo(() => {
    if (!rawPreview) return null;
    if (rawPreview.isClosed) return rawPreview;
    return recalculatePreviewWithSettings(rawPreview, settings);
  }, [rawPreview, settings]);

  const validation = useMemo(() => validateRatSettings(settings), [settings]);
  const isClosed = Boolean(preview?.isClosed);
  const availableYears = useMemo(
    () => getAvailableFiscalYears(fiscalYear, closingsHistory),
    [fiscalYear, closingsHistory]
  );

  const filteredMemberRows = useMemo(() => {
    const rows = preview?.memberRows ?? [];
    const q = memberSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.nama.toLowerCase().includes(q) ||
        r.nrp.toLowerCase().includes(q)
    );
  }, [preview, memberSearch]);

  const filteredTotals = useMemo(() => {
    return filteredMemberRows.reduce(
      (acc, r) => ({
        savings: acc.savings + r.totalSavingsContribution,
        transactions: acc.transactions + r.totalTransactionContribution,
        jasaModal: acc.jasaModal + r.jasaModalAmount,
        jasaUsaha: acc.jasaUsaha + r.jasaUsahaAmount,
        totalShu: acc.totalShu + r.totalShuReceived,
      }),
      { savings: 0, transactions: 0, jasaModal: 0, jasaUsaha: 0, totalShu: 0 }
    );
  }, [filteredMemberRows]);

  const handlePctChange = (
    field: keyof Pick<
      RatShuSettings,
      | 'reserve_fund_pct'
      | 'member_shu_pct'
      | 'other_fund_pct'
      | 'member_business_pct'
      | 'member_capital_pct'
    >,
    rawValue: string
  ) => {
    if (isClosed) return;
    const parsed = rawValue === '' ? 0 : Number(rawValue);
    const safeNum = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
    setSettings((prev) => ({
      ...prev,
      [field]: safeNum,
    }));
  };

  const handlePayoutMethodChange = (method: ShuPayoutMethod) => {
    if (isClosed) return;
    setSettings((prev) => ({
      ...prev,
      payout_method: method,
    }));
  };

  const handleSaveSettings = async () => {
    if (isClosed || savingSettings) return;
    if (!validation.valid) {
      showToast(validation.errors[0], 'error');
      return;
    }
    setSavingSettings(true);
    try {
      const saved = await saveYearEndSettings({ ...settings, fiscal_year: fiscalYear });
      setSettings(saved);
      showToast(`Pengaturan rasio RAT Tahun Buku ${fiscalYear} berhasil disimpan.`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan pengaturan RAT.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handlePrintPdf = async () => {
    if (!preview) return;
    try {
      const profile = await getKoperasiProfile().catch(() => undefined);
      exportYearEndClosingPdf({
        preview,
        settings,
        profile,
        autoSave: true,
      });
      showToast(`Berita Acara RAT Tahun Buku ${fiscalYear} berhasil diunduh (PDF).`, 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast(err?.message || 'Gagal mencetak Berita Acara RAT (PDF).', 'error');
    }
  };

  const handleExecuteClosing = async () => {
    if (isClosed || executing || !validation.valid) return;
    setExecuting(true);
    try {
      const result = await executeYearEndClosing(fiscalYear, settings, closingNotes);
      setRawPreview(result.preview);
      setIsConfirmModalOpen(false);
      const refreshedHistory = await getFiscalYearClosingsHistory();
      setClosingsHistory(refreshedHistory);
      showToast(
        `Tutup Buku Tahun ${fiscalYear} berhasil! Saldo awal ${fiscalYear + 1} resmi dibuka.`,
        'success'
      );
    } catch (err: any) {
      console.error('Year-end closing execution error:', err);
      showToast(err?.message || 'Gagal mengeksekusi tutup buku akhir tahun.', 'error');
    } finally {
      setExecuting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* ── PAGE HEADER & YEAR PICKER ── */}
        <div className="flex flex-col gap-2 pb-4 border-b border-outline-variant/30">
          <div className="flex items-center gap-2 text-[12px] text-on-surface-variant">
            <span className="font-bold text-primary">SIMKOP</span>
            <span className="text-outline-variant">/</span>
            <span>Laporan &amp; Keuangan</span>
            <span className="text-outline-variant">/</span>
            <span className="text-secondary font-semibold">Tutup Buku &amp; SHU RAT</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1
                  className="text-2xl font-bold text-primary"
                  style={{ fontFamily: "'IBM Plex Serif', serif" }}
                >
                  Tutup Buku Akhir Tahun &amp; Pembagian SHU (RAT)
                </h1>
                {isClosed ? (
                  <span
                    data-testid="fiscal-year-status-badge"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    SUDAH TUTUP BUKU (TERKUNCI)
                  </span>
                ) : (
                  <span
                    data-testid="fiscal-year-status-badge"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    TAHUN BUKU AKTIF / TERBUKA
                  </span>
                )}
              </div>
              <p className="text-sm text-on-surface-variant mt-1">
                Konfigurasi rasio RAT, tinjau saldo bawaan ke 1 Januari {fiscalYear + 1} serta hak SHU per anggota, dan eksekusi tutup buku dalam satu klik.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 bg-white border border-outline-variant/40 rounded-xl px-3 py-1.5 shadow-xs">
                <label
                  htmlFor="fiscal-year-select"
                  className="text-xs font-semibold text-slate-600 whitespace-nowrap"
                >
                  Tahun Buku:
                </label>
                <select
                  id="fiscal-year-select"
                  value={fiscalYear}
                  onChange={(e) => setFiscalYear(Number(e.target.value))}
                  className="text-sm font-bold text-primary bg-transparent focus:outline-none cursor-pointer"
                >
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => loadYearData(fiscalYear)}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Muat Ulang
              </button>

              <button
                type="button"
                onClick={handlePrintPdf}
                disabled={!preview || loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Berita Acara RAT (PDF)
              </button>
            </div>
          </div>
        </div>

        {/* ── LOCKED BANNER IF YEAR ALREADY CLOSED ── */}
        {isClosed && preview?.closingRecord && (
          <div
            data-testid="year-closed-lock-banner"
            className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900">
                  Tahun Buku {preview.fiscalYear} Telah Resmi Ditutup &amp; Terkunci (CLOSED)
                </p>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Dieksekusi pada {formatDateId(preview.closingRecord.executed_at)} • Saldo awal Tahun Buku{' '}
                  <strong>{preview.fiscalYear + 1}</strong> otomatis dibawa per{' '}
                  <strong>1 Januari {preview.fiscalYear + 1}</strong> sebesar{' '}
                  <strong>{formatRp(preview.postShuCashBalance)}</strong> (Kas Brankas) &amp;{' '}
                  <strong>{formatRp(preview.postShuMemberSavings)}</strong> (Simpanan Anggota).
                </p>
              </div>
            </div>

            {inRouter ? (
              <Link
                to="/admin/laporan-keuangan"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100/70 transition-colors whitespace-nowrap"
              >
                Buka Laporan Keuangan Terpadu
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            ) : (
              <a
                href="/admin/laporan-keuangan"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-800 text-xs font-bold hover:bg-emerald-100/70 transition-colors whitespace-nowrap"
              >
                Buka Laporan Keuangan Terpadu
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}

        {/* ── INLINE RAT SETTINGS PANEL ── */}
        <section
          aria-label="Konfigurasi Kebijakan RAT"
          className="bg-white rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-outline-variant/20 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-primary flex items-center gap-2">
                <Landmark className="w-4 h-4 text-emerald-600" />
                Konfigurasi Kebijakan RAT &amp; Metode Penyaluran SHU ({fiscalYear})
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {isClosed
                  ? 'Konfigurasi terkunci sesuai hasil eksekusi tutup buku tahun ini.'
                  : 'Ubah persentase alokasi & metode penyaluran langsung di sini — rincian SHU per anggota otomatis menyesuaikan secara real-time.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="main-ratio-total-badge"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  Math.abs(validation.mainTotal - 100) <= 0.01
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-700 border-rose-300'
                }`}
              >
                Total Alokasi: {validation.mainTotal}%
              </span>
              <span
                data-testid="member-subratio-total-badge"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  Math.abs(validation.memberSubTotal - 100) <= 0.01
                    ? 'bg-teal-50 text-teal-800 border-teal-300'
                    : 'bg-rose-50 text-rose-700 border-rose-300'
                }`}
              >
                Sub-Rasio Anggota: {validation.memberSubTotal}%
              </span>
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* Main Ratios & Member Sub-Ratios */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pembagian Utama SHU Bersih */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    1. Alokasi SHU Bersih Koperasi (Harus 100%)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      htmlFor="reserve-fund-pct"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Cadangan Modal (%)
                    </label>
                    <input
                      id="reserve-fund-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      disabled={isClosed}
                      value={settings.reserve_fund_pct}
                      onChange={(e) => handlePctChange('reserve_fund_pct', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="member-shu-pct"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Bagian SHU Anggota (%)
                    </label>
                    <input
                      id="member-shu-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      disabled={isClosed}
                      value={settings.member_shu_pct}
                      onChange={(e) => handlePctChange('member_shu_pct', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="other-fund-pct"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Dana Pengurus/Sosial (%)
                    </label>
                    <input
                      id="other-fund-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      disabled={isClosed}
                      value={settings.other_fund_pct}
                      onChange={(e) => handlePctChange('other_fund_pct', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* Sub-Rasio Bagian Anggota */}
              <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    2. Sub-Rasio Bagian Anggota (Harus 100%)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="member-business-pct"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Jasa Usaha / Transaksi (%)
                    </label>
                    <input
                      id="member-business-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      disabled={isClosed}
                      value={settings.member_business_pct}
                      onChange={(e) => handlePctChange('member_business_pct', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Berdasarkan belanja POS &amp; margin pembiayaan barang
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor="member-capital-pct"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Jasa Modal Simpanan (%)
                    </label>
                    <input
                      id="member-capital-pct"
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      disabled={isClosed}
                      value={settings.member_capital_pct}
                      onChange={(e) => handlePctChange('member_capital_pct', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-100 disabled:text-slate-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Berdasarkan akumulasi simpanan Pokok, Wajib, Belanja &amp; Lebaran
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Metode Penyaluran SHU Anggota */}
            <div className="space-y-2.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                3. Metode Penyaluran SHU Anggota
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${
                    settings.payout_method === 'CASH_PAYOUT'
                      ? 'border-emerald-500 bg-emerald-50/60 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${isClosed ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="payout_method"
                    value="CASH_PAYOUT"
                    disabled={isClosed}
                    checked={settings.payout_method === 'CASH_PAYOUT'}
                    onChange={() => handlePayoutMethodChange('CASH_PAYOUT')}
                    className="mt-1 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">
                        Dibayarkan Tunai / Transfer (Kas Keluar)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Mencatat 1 jurnal kas keluar kategori <code className="font-mono bg-white px-1 rounded border border-slate-200">PEMBAGIAN_SHU_RAT</code> dan mengurangi saldo kas awal tahun baru.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all ${
                    settings.payout_method === 'CREDIT_SAVINGS'
                      ? 'border-indigo-500 bg-indigo-50/60 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  } ${isClosed ? 'opacity-80 cursor-default' : 'cursor-pointer'}`}
                >
                  <input
                    type="radio"
                    name="payout_method"
                    value="CREDIT_SAVINGS"
                    disabled={isClosed}
                    checked={settings.payout_method === 'CREDIT_SAVINGS'}
                    onChange={() => handlePayoutMethodChange('CREDIT_SAVINGS')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <PiggyBank className="w-4 h-4 text-indigo-700 shrink-0" />
                      <span className="text-sm font-bold text-slate-900">
                        Dikreditkan ke Simpanan Anggota (Non-Tunai)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Menambahkan hak SHU langsung ke rekening simpanan anggota (<code className="font-mono bg-white px-1 rounded border border-slate-200">deposit_transactions</code>) tanpa mengurangi kas brankas.
                    </p>
                    {settings.payout_method === 'CREDIT_SAVINGS' && (
                      <div className="mt-2.5 flex items-center gap-2">
                        <label
                          htmlFor="target-deposit-select"
                          className="text-[11px] font-semibold text-indigo-900"
                        >
                          Rekening Tujuan:
                        </label>
                        <select
                          id="target-deposit-select"
                          disabled={isClosed}
                          value={settings.target_deposit_type_code || 'BELANJA'}
                          onChange={(e) =>
                            setSettings((prev) => ({
                              ...prev,
                              target_deposit_type_code: e.target.value,
                            }))
                          }
                          className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-white text-xs font-semibold text-indigo-900 focus:outline-none"
                        >
                          <option value="BELANJA">Simpanan Belanja (SB)</option>
                          <option value="LEBARAN">Simpanan Lebaran (SL)</option>
                          <option value="WAJIB">Simpanan Wajib (SW)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>

            {!validation.valid && (
              <div
                data-testid="rat-validation-error"
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 flex items-center gap-2"
              >
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{validation.errors[0]}</span>
              </div>
            )}

            {!isClosed && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <div className="flex-1 max-w-xl">
                  <input
                    type="text"
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    placeholder="Catatan / Nomor Berita Acara RAT (opsional, misal: Keputusan RAT No. 01/RAT/2026)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={!validation.valid || savingSettings}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-primary/30 bg-primary/5 text-primary text-xs font-bold hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan RAT'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── LOADING STATE ── */}
        {loading && (
          <div className="bg-white rounded-2xl border border-outline-variant/30 py-14 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-600" />
            <span className="text-sm font-medium">
              Menghitung saldo akhir tahun &amp; hak SHU anggota...
            </span>
          </div>
        )}

        {/* ── MAIN PREVIEW & EXECUTION WORKSPACE ── */}
        {!loading && preview && (
          <>
            {/* 4 KARTU AKUN RIIL (CARRY FORWARD KE 1 JAN TAHUN BARU) */}
            <section aria-label="Akun Riil Carry Forward">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                    Akun Riil Akhir Tahun (Carry Forward ke 1 Januari {fiscalYear + 1})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Saldo posisi aset, piutang, dan kewajiban simpanan ini otomatis menjadi saldo awal tahun buku baru.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-600" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
                        Saldo Kas Akhir Brankas
                      </p>
                      <p
                        data-testid="closing-cash-balance"
                        className="text-2xl font-bold text-indigo-950 mt-1.5 tabular-nums"
                        style={{ fontFamily: "'IBM Plex Serif', serif" }}
                      >
                        {formatRp(preview.closingCashBalance)}
                      </p>
                      <p className="text-[11px] text-indigo-600 mt-1">
                        Posisi sebelum pembagian SHU (31 Des {fiscalYear})
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Wallet className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                        Saldo Simpanan Anggota
                      </p>
                      <p
                        data-testid="closing-member-savings"
                        className="text-2xl font-bold text-emerald-950 mt-1.5 tabular-nums"
                        style={{ fontFamily: "'IBM Plex Serif', serif" }}
                      >
                        {formatRp(preview.closingMemberSavings)}
                      </p>
                      <p className="text-[11px] text-emerald-600 mt-1">
                        {settings.payout_method === 'CREDIT_SAVINGS'
                          ? `Setelah kredit SHU: ${formatRp(preview.postShuMemberSavings)}`
                          : 'Pokok + Wajib + Belanja + Lebaran'}
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <PiggyBank className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-amber-200 p-5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
                        Sisa Piutang Pinjaman
                      </p>
                      <p
                        data-testid="closing-loan-receivable"
                        className="text-2xl font-bold text-amber-950 mt-1.5 tabular-nums"
                        style={{ fontFamily: "'IBM Plex Serif', serif" }}
                      >
                        {formatRp(preview.closingLoanReceivable)}
                      </p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        Dibawa utuh ke jadwal angsuran {fiscalYear + 1}
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <FileText className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-orange-200 p-5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
                        Sisa Piutang Bon Toko
                      </p>
                      <p
                        data-testid="closing-store-receivable"
                        className="text-2xl font-bold text-orange-950 mt-1.5 tabular-nums"
                        style={{ fontFamily: "'IBM Plex Serif', serif" }}
                      >
                        {formatRp(preview.closingStoreReceivable)}
                      </p>
                      <p className="text-[11px] text-orange-700 mt-1">
                        Tagihan potong gaji belum lunas
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                      <BookCheck className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* REKAPITULASI AKUN LABA/SHU YANG DITUTUP (DINOLKAN UNTUK TAHUN BARU) */}
            <section
              aria-label="Rekapitulasi SHU Tahun Buku"
              className="bg-white rounded-2xl border border-outline-variant/30 p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                    Akun Laba / SHU Tahun Buku {fiscalYear} (Ditutup &amp; Dinolkan ke Rp 0 untuk {fiscalYear + 1})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Kinerja penjualan retail &amp; pembiayaan barang periode 1 Jan – 31 Des {fiscalYear}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span>
                    Omzet POS: <strong className="text-slate-900">{formatRp(preview.grossSales)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    HPP: <strong className="text-slate-900">{formatRp(preview.cogs)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Margin Barang: <strong className="text-teal-700">{formatRp(preview.goodsFinancingMargin)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Beban Opex: <strong className="text-rose-700">{formatRp(preview.opex)}</strong>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                    SHU Bersih Tahun Buku
                  </p>
                  <p
                    data-testid="net-shu-amount"
                    className="text-xl font-bold text-purple-950 mt-1 tabular-nums"
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}
                  >
                    {formatRp(preview.netShuAmount)}
                  </p>
                  <p className="text-[11px] text-purple-700 mt-1">
                    Laba Kotor + Margin Barang − Opex
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                    Cadangan Modal ({settings.reserve_fund_pct}%)
                  </p>
                  <p
                    data-testid="reserve-fund-amount"
                    className="text-xl font-bold text-emerald-950 mt-1 tabular-nums"
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}
                  >
                    {formatRp(preview.reserveFundAmount)}
                  </p>
                  <p className="text-[11px] text-emerald-700 mt-1">
                    {settings.other_fund_pct > 0
                      ? `Dana Pengurus/Sosial (${settings.other_fund_pct}%): ${formatRp(preview.otherFundAmount)}`
                      : 'Penguatan modal internal koperasi'}
                  </p>
                </div>

                <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                    SHU Dibagikan ke Anggota ({settings.member_shu_pct}%)
                  </p>
                  <p
                    data-testid="member-shu-total"
                    className="text-xl font-bold text-teal-950 mt-1 tabular-nums"
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}
                  >
                    {formatRp(preview.memberShuTotal)}
                  </p>
                  <p className="text-[11px] text-teal-700 mt-1">
                    Usaha: {formatRp(preview.jasaUsahaPool)} • Modal: {formatRp(preview.jasaModalPool)}
                  </p>
                </div>

                <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">
                    Saldo Kas Setelah SHU (1 Jan {fiscalYear + 1})
                  </p>
                  <p
                    data-testid="post-shu-cash-balance"
                    className="text-xl font-bold text-sky-950 mt-1 tabular-nums"
                    style={{ fontFamily: "'IBM Plex Serif', serif" }}
                  >
                    {formatRp(preview.postShuCashBalance)}
                  </p>
                  <p className="text-[11px] text-sky-700 mt-1">
                    {settings.payout_method === 'CASH_PAYOUT'
                      ? 'Saldo awal kas usai pembayaran SHU tunai'
                      : 'Tetap utuh (SHU dikreditkan ke simpanan)'}
                  </p>
                </div>
              </div>
            </section>

            {/* TABEL RINCIAN PEMBAGIAN SHU PER ANGGOTA */}
            <section
              aria-label="Rincian Pembagian SHU per Anggota"
              className="bg-white rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-outline-variant/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-primary flex items-center gap-2">
                    <Users className="w-4 h-4 text-teal-600" />
                    Rincian Pembagian SHU per Anggota Aktif
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Menampilkan {filteredMemberRows.length} dari {preview.memberRows.length} anggota aktif
                  </p>
                </div>

                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Cari NRP atau Nama Anggota..."
                    className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-200 bg-slate-50/50 focus:bg-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {memberSearch && (
                    <button
                      type="button"
                      onClick={() => setMemberSearch('')}
                      aria-label="Hapus pencarian anggota"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        NRP &amp; Nama Anggota
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Kontribusi Simpanan
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Kontribusi Transaksi
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Jasa Modal (Rp)
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Jasa Usaha (Rp)
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Total SHU Diterima (Rp)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMemberRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                          Tidak ada data anggota aktif yang cocok.
                        </td>
                      </tr>
                    ) : (
                      filteredMemberRows.map((row, idx) => (
                        <tr
                          key={row.memberId}
                          className={`border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
                            idx % 2 === 1 ? 'bg-slate-50/40' : ''
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                              {row.nama}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              NRP: {row.nrp || '-'}
                              {row.tanggal_lahir ? ` • Tgl Lahir: ${formatTanggalLahirWithAge(row.tanggal_lahir)}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 font-medium">
                            {formatRp(row.totalSavingsContribution)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700 font-medium">
                            {formatRp(row.totalTransactionContribution)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-indigo-700 font-semibold">
                            {formatRp(row.jasaModalAmount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-teal-700 font-semibold">
                            {formatRp(row.jasaUsahaAmount)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-800 font-bold">
                            {formatRp(row.totalShuReceived)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredMemberRows.length > 0 && (
                    <tfoot className="bg-primary/5 border-t-2 border-primary/20">
                      <tr>
                        <td className="px-4 py-3 font-bold text-primary text-sm">
                          TOTAL ({filteredMemberRows.length} Anggota)
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                          {formatRp(filteredTotals.savings)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                          {formatRp(filteredTotals.transactions)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-800 tabular-nums">
                          {formatRp(filteredTotals.jasaModal)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-teal-800 tabular-nums">
                          {formatRp(filteredTotals.jasaUsaha)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-900 tabular-nums">
                          {formatRp(filteredTotals.totalShu)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>

            {/* 1-CLICK EXECUTION PANEL */}
            {!isClosed && (
              <section
                aria-label="Eksekusi Tutup Buku Satu Klik"
                className="rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-emerald-950 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Eksekusi Tutup Buku &amp; Pembukaan Saldo Awal {fiscalYear + 1}
                  </h3>
                  <p className="text-xs text-slate-600 max-w-2xl">
                    Satu klik akan mengunci laporan tahun {fiscalYear}, membukukan{' '}
                    {settings.payout_method === 'CASH_PAYOUT'
                      ? `kas keluar Pembagian SHU sebesar ${formatRp(preview.memberShuTotal)}`
                      : `kredit simpanan SHU untuk ${preview.memberRows.filter((r) => r.totalShuReceived > 0).length} anggota`}
                    , dan membuka saldo awal tahun buku {fiscalYear + 1} per 1 Januari {fiscalYear + 1}.
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="execute-closing-cta-btn"
                  disabled={!validation.valid || executing}
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-900/15 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Lock className="w-4 h-4" />
                  Eksekusi Tutup Buku Tahun {fiscalYear} &amp; Buka Saldo Awal {fiscalYear + 1}
                </button>
              </section>
            )}
          </>
        )}

        {/* ── RIWAYAT TAHUN BUKU YANG TELAH DITUTUP ── */}
        <section
          aria-label="Riwayat Tutup Buku"
          className="bg-white rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-primary flex items-center gap-2">
                <Archive className="w-4 h-4 text-indigo-600" />
                Riwayat Tahun Buku yang Telah Ditutup
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Arsip resmi tahun buku terkunci (CLOSED) beserta saldo bawaan ke tahun berikutnya
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tahun Buku
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Metode Penyaluran
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    SHU Bersih
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    SHU Anggota
                  </th>
                  <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Saldo Kas Bawaan (1 Jan)
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Tanggal Eksekusi
                  </th>
                </tr>
              </thead>
              <tbody>
                {closingsHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                      Belum ada tahun buku yang ditutup secara permanen.
                    </td>
                  </tr>
                ) : (
                  closingsHistory.map((item) => {
                    const carryCash =
                      item.post_shu_cash_balance ??
                      (item.payout_method === 'CASH_PAYOUT'
                        ? item.closing_cash_balance - item.member_shu_total
                        : item.closing_cash_balance);
                    return (
                      <tr
                        key={item.id}
                        className="border-b border-slate-100 hover:bg-slate-50/60"
                      >
                        <td className="px-4 py-3 font-bold text-primary">
                          <button
                            type="button"
                            onClick={() => setFiscalYear(item.fiscal_year)}
                            className="hover:underline cursor-pointer"
                          >
                            Tahun Buku {item.fiscal_year}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Lock className="w-3 h-3" />
                            CLOSED
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-700">
                          {item.payout_method === 'CASH_PAYOUT'
                            ? 'Tunai / Transfer (Kas Keluar)'
                            : 'Kredit Simpanan Anggota'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-purple-800">
                          {formatRp(item.net_shu_amount)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-teal-800">
                          {formatRp(item.member_shu_total)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-indigo-800">
                          {formatRp(carryCash)}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          {formatDateId(item.executed_at)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ── MODAL KONFIRMASI EKSEKUSI 1-KLIK TUTUP BUKU ── */}
      {isConfirmModalOpen && preview && !isClosed && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-closing-modal-title"
            className="bg-white rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl border border-emerald-200"
          >
            <div className="p-5 border-b border-emerald-100 bg-emerald-50/70 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="confirm-closing-modal-title"
                    className="text-base font-bold text-emerald-950"
                  >
                    Konfirmasi Tutup Buku Tahun {fiscalYear} &amp; Buka Saldo Awal {fiscalYear + 1}
                  </h3>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    Pastikan hasil keputusan RAT telah sesuai sebelum mengunci tahun buku.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={executing}
                onClick={() => setIsConfirmModalOpen(false)}
                aria-label="Tutup modal konfirmasi"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm text-slate-700">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                <div className="flex justify-between">
                  <span>SHU Bersih Tahun Buku {fiscalYear}:</span>
                  <strong className="text-purple-900">{formatRp(preview.netShuAmount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cadangan Modal ({settings.reserve_fund_pct}%):</span>
                  <strong className="text-emerald-800">{formatRp(preview.reserveFundAmount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Bagian SHU Anggota ({settings.member_shu_pct}%):</span>
                  <strong className="text-teal-800">{formatRp(preview.memberShuTotal)}</strong>
                </div>
                {settings.other_fund_pct > 0 && (
                  <div className="flex justify-between">
                    <span>Dana Pengurus/Sosial ({settings.other_fund_pct}%):</span>
                    <strong>{formatRp(preview.otherFundAmount)}</strong>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 flex justify-between">
                  <span>Metode Penyaluran SHU:</span>
                  <strong className="text-slate-900">
                    {settings.payout_method === 'CASH_PAYOUT'
                      ? 'Tunai / Transfer (Kas Keluar)'
                      : `Kredit ke Simpanan (${settings.target_deposit_type_code})`}
                  </strong>
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-1.5 text-xs text-indigo-900">
                <p className="font-bold">Dampak Saldo Awal 1 Januari {fiscalYear + 1}:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Saldo Kas Awal Tahun Baru: <strong>{formatRp(preview.postShuCashBalance)}</strong>
                  </li>
                  <li>
                    Saldo Simpanan Anggota Bawaan: <strong>{formatRp(preview.postShuMemberSavings)}</strong>
                  </li>
                  <li>
                    Piutang Pinjaman &amp; Bon Toko dibawa:{' '}
                    <strong>
                      {formatRp(preview.closingLoanReceivable + preview.closingStoreReceivable)}
                    </strong>
                  </li>
                  <li>
                    Akun Pendapatan, HPP, Beban &amp; SHU Tahun {fiscalYear + 1} dimulai dari <strong>Rp 0</strong>.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Setelah dieksekusi, Tahun Buku {fiscalYear} berstatus <strong>CLOSED (terkunci)</strong> dan tidak dapat ditutup ulang.
                </span>
              </div>
            </div>

            <div className="p-4 px-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={executing}
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                data-testid="confirm-execute-closing-btn"
                disabled={executing}
                onClick={handleExecuteClosing}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                {executing ? 'Memproses Tutup Buku...' : 'Ya, Eksekusi Tutup Buku Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
