import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  Banknote,
  BookCheck,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  Lock,
  PiggyBank,
  Plus,
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
import { supabase } from '../../lib/supabaseClient';
import { getKoperasiProfile, type KoperasiProfile } from '../../services/settingsService';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';
import {
  computeYearEndPreview,
  createDefaultRatSettings,
  executeYearEndClosing,
  getFiscalYearClosingsHistory,
  getOrInitYearEndSettings,
  getPriorYearAdjustments,
  recalculatePreviewWithSettings,
  recordPriorYearAdjustment,
  saveYearEndSettings,
  validateRatSettings,
  type FiscalYearClosingRecord,
  type PriorYearAdjustmentDirection,
  type PriorYearAdjustmentRecord,
  type PriorYearAdjustmentTarget,
  type RatShuSettings,
  type ShuPayoutMethod,
  type YearEndClosingPreview,
} from '../../services/yearEndClosingService';
import { exportYearEndRatBeritaAcaraPdf } from '../../utils/yearEndClosingPdfExporter';
import {
  calculateMonthlySnapshot,
  getMonthNameId,
  getMonthlyClosingsByYear,
  MONTH_NAMES_ID,
  type MonthlyClosingRecord,
} from '../../services/monthlyClosingService';
import { exportMonthlyClosingPdf } from '../../utils/monthlyClosingPdfExporter';

export interface TutupBukuProps {
  initialFiscalYear?: number;
  initialSettings?: RatShuSettings | null;
  initialPreview?: YearEndClosingPreview | null;
  initialClosingsHistory?: FiscalYearClosingRecord[];
  initialMonthlyArchives?: MonthlyClosingRecord[];
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
  initialMonthlyArchives = [],
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
  const [monthlyArchives, setMonthlyArchives] = useState<MonthlyClosingRecord[]>(
    initialMonthlyArchives
  );
  const [isLoadingArchives, setIsLoadingArchives] = useState<boolean>(false);
  const [printingArchiveMonth, setPrintingArchiveMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(!initialPreview);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(
    initialConfirmModalOpen
  );
  const [confirmClosingPhrase, setConfirmClosingPhrase] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>(initialNotes);
  const [memberSearch, setMemberSearch] = useState<string>('');
  const [koperasiProfile, setKoperasiProfile] = useState<Partial<KoperasiProfile> | undefined>(
    undefined
  );
  const [priorAdjustments, setPriorAdjustments] = useState<PriorYearAdjustmentRecord[]>([]);
  const [adjModalOpen, setAdjModalOpen] = useState<boolean>(false);
  const [adjTarget, setAdjTarget] = useState<PriorYearAdjustmentTarget>('CASH_VAULT');
  const [adjDirection, setAdjDirection] = useState<PriorYearAdjustmentDirection>('INCREASE');
  const [adjMemberId, setAdjMemberId] = useState<string>('');
  const [adjMemberSearch, setAdjMemberSearch] = useState<string>('');
  const [adjDepositTypeCode, setAdjDepositTypeCode] = useState<string>('POKOK');
  const [adjAmount, setAdjAmount] = useState<string>('');
  const [adjReferenceNo, setAdjReferenceNo] = useState<string>('');
  const [adjReason, setAdjReason] = useState<string>('');
  const [savingAdj, setSavingAdj] = useState<boolean>(false);
  const [memberOptions, setMemberOptions] = useState<Array<{ id: string; nrp: string; nama: string }>>([]);

  const loadYearData = useCallback(async (targetYear: number) => {
    setLoading(true);
    setIsLoadingArchives(true);
    try {
      const archivesPromise = getMonthlyClosingsByYear(targetYear);
      const profilePromise = getKoperasiProfile().catch(() => undefined);
      const adjustmentsPromise = getPriorYearAdjustments(targetYear).catch(() => []);
      const [loadedSettings, history, loadedProfile] = await Promise.all([
        getOrInitYearEndSettings(targetYear),
        getFiscalYearClosingsHistory(),
        profilePromise,
      ]);

      const [preview, archives, loadedAdjustments] = await Promise.all([
        computeYearEndPreview(targetYear, loadedSettings),
        archivesPromise,
        adjustmentsPromise,
      ]);

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

      if (loadedProfile) {
        setKoperasiProfile(loadedProfile);
      }
      setRawPreview(preview);
      setClosingsHistory(history);
      setMonthlyArchives(archives);
      setPriorAdjustments(loadedAdjustments);
    } catch (err: any) {
      console.error('Gagal memuat pratinjau tutup buku:', err);
      showToast(err?.message || 'Gagal memuat data tutup buku akhir tahun.', 'error');
    } finally {
      setLoading(false);
      setIsLoadingArchives(false);
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

  const monthlyArchiveMap = useMemo(() => {
    const map = new Map<number, MonthlyClosingRecord>();
    for (const item of monthlyArchives) {
      map.set(item.period_month, item);
    }
    return map;
  }, [monthlyArchives]);

  const approvedArchiveCount = monthlyArchiveMap.size;

  const referenceArchive = useMemo(() => {
    const dec = monthlyArchiveMap.get(12);
    if (dec) return dec;
    if (monthlyArchives.length === 0) return null;
    return [...monthlyArchives].sort((a, b) => a.period_month - b.period_month)[
      monthlyArchives.length - 1
    ];
  }, [monthlyArchiveMap, monthlyArchives]);

  const archiveCashDiff = useMemo(() => {
    if (!referenceArchive || !preview) return null;
    return (
      Math.round(preview.closingCashBalance) -
      Math.round(referenceArchive.closing_cash_balance)
    );
  }, [referenceArchive, preview]);

  const handleDownloadMonthlyArchivePdf = async (rec: MonthlyClosingRecord) => {
    setPrintingArchiveMonth(rec.period_month);
    try {
      const [profile, snapshot] = await Promise.all([
        getKoperasiProfile().catch(() => undefined),
        calculateMonthlySnapshot(rec.fiscal_year, rec.period_month),
      ]);
      exportMonthlyClosingPdf({
        snapshot,
        record: rec,
        profile,
        autoSave: true,
      });
      showToast(
        `Berita Acara ${getMonthNameId(rec.period_month)} ${rec.fiscal_year} berhasil diunduh.`,
        'success'
      );
    } catch (err: any) {
      console.error('Monthly archive PDF export error:', err);
      showToast(err?.message || 'Gagal mengunduh PDF Berita Acara bulanan.', 'error');
    } finally {
      setPrintingArchiveMonth(null);
    }
  };

  const handlePctChange = (
    field: keyof Pick<
      RatShuSettings,
      | 'reserve_fund_pct'
      | 'member_borrower_pct'
      | 'member_depositor_pct'
      | 'management_fund_pct'
      | 'employee_fund_pct'
      | 'social_fund_pct'
      | 'education_fund_pct'
    >,
    rawValue: string
  ) => {
    if (isClosed) return;
    const parsed = rawValue === '' ? 0 : Number(rawValue);
    const safeNum = Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0;
    setSettings((prev) => {
      const next = {
        ...prev,
        [field]: safeNum,
      };
      const memberTotal = Math.round((next.member_borrower_pct + next.member_depositor_pct) * 100) / 100;
      const otherTotal =
        Math.round(
          (next.management_fund_pct +
            next.employee_fund_pct +
            next.social_fund_pct +
            next.education_fund_pct) *
            100
        ) / 100;
      const bizPct = memberTotal > 0 ? Math.round((next.member_borrower_pct / memberTotal) * 10000) / 100 : 0;
      return {
        ...next,
        member_shu_pct: memberTotal,
        other_fund_pct: otherTotal,
        member_business_pct: bizPct,
        member_capital_pct: memberTotal > 0 ? Math.round((100 - bizPct) * 100) / 100 : 0,
      };
    });
  };

  const handleResetAdArtDefaults = () => {
    if (isClosed) return;
    const defaults = createDefaultRatSettings(fiscalYear);
    setSettings((prev) => ({
      ...defaults,
      id: prev.id,
      payout_method: prev.payout_method,
      target_deposit_type_code: prev.target_deposit_type_code,
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
      const profile =
        koperasiProfile ?? (await getKoperasiProfile().catch(() => undefined));
      if (profile && !koperasiProfile) {
        setKoperasiProfile(profile);
      }
      exportYearEndRatBeritaAcaraPdf({
        preview,
        settings,
        monthlyArchives,
        closingNotes: closingNotes || preview.closingRecord?.notes || undefined,
        profile,
        autoSave: true,
      });
      showToast('Berita Acara RAT & Lampiran berhasil diunduh', 'success');
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast(err?.message || 'Gagal mencetak Berita Acara RAT (PDF).', 'error');
    }
  };

  const expectedConfirmPhrase = `TUTUP BUKU ${fiscalYear}`;
  const isConfirmPhraseMatched = confirmClosingPhrase.trim() === expectedConfirmPhrase;

  const handleExecuteClosing = async () => {
    if (isClosed || executing || !validation.valid || !isConfirmPhraseMatched) return;
    setExecuting(true);
    try {
      const result = await executeYearEndClosing(fiscalYear, settings, closingNotes);
      setRawPreview(result.preview);
      setIsConfirmModalOpen(false);
      setConfirmClosingPhrase('');
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

  const filteredMemberOptions = useMemo(() => {
    const q = adjMemberSearch.trim().toLowerCase();
    if (!q) return memberOptions.slice(0, 50);
    return memberOptions
      .filter(
        (m) =>
          m.nama.toLowerCase().includes(q) ||
          m.nrp.toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [memberOptions, adjMemberSearch]);

  const openAdjustmentModal = async () => {
    setAdjTarget('CASH_VAULT');
    setAdjDirection('INCREASE');
    setAdjMemberId('');
    setAdjMemberSearch('');
    setAdjDepositTypeCode('POKOK');
    setAdjAmount('');
    setAdjReferenceNo('');
    setAdjReason('');
    setAdjModalOpen(true);

    if (memberOptions.length === 0) {
      try {
        const tbl: any = supabase?.from?.('anggota');
        if (tbl && typeof tbl.select === 'function') {
          let q = tbl.select('id, nrp, nama').order('nama', { ascending: true });
          const { data } = await q;
          if (Array.isArray(data) && data.length > 0) {
            setMemberOptions(
              data.map((m: any) => ({
                id: String(m.id),
                nrp: String(m.nrp || ''),
                nama: String(m.nama || ''),
              }))
            );
            return;
          }
        }
      } catch {
        // fallback ke preview.memberRows
      }
      if (preview?.memberRows?.length) {
        setMemberOptions(
          preview.memberRows.map((r) => ({
            id: r.memberId,
            nrp: r.nrp,
            nama: r.nama,
          }))
        );
      }
    }
  };

  const handleSaveAdjustment = async () => {
    if (savingAdj) return;
    const numericAmount = Number(String(adjAmount).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showToast('Nominal koreksi harus lebih besar dari Rp 0.', 'error');
      return;
    }
    if (!adjReferenceNo.trim()) {
      showToast('Nomor Dokumen / Berita Acara Koreksi wajib diisi.', 'error');
      return;
    }
    if (!adjReason.trim()) {
      showToast('Uraian alasan penyesuaian wajib diisi.', 'error');
      return;
    }
    if (adjTarget === 'MEMBER_SAVINGS' && !adjMemberId) {
      showToast('Pilih anggota terlebih dahulu untuk koreksi saldo simpanan.', 'error');
      return;
    }

    setSavingAdj(true);
    try {
      await recordPriorYearAdjustment({
        closedFiscalYear: fiscalYear,
        adjustmentTarget: adjTarget,
        direction: adjDirection,
        amount: numericAmount,
        referenceNo: adjReferenceNo.trim(),
        reason: adjReason.trim(),
        memberId: adjTarget === 'MEMBER_SAVINGS' ? adjMemberId : undefined,
        depositTypeCode: adjTarget === 'MEMBER_SAVINGS' ? adjDepositTypeCode : undefined,
      });
      const refreshed = await getPriorYearAdjustments(fiscalYear);
      setPriorAdjustments(refreshed);
      setAdjModalOpen(false);
      showToast(
        `Jurnal Penyesuaian Awal Tahun ${fiscalYear + 1} (1 Jan ${fiscalYear + 1}) berhasil dicatat tanpa mengubah laporan ${fiscalYear}.`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal menyimpan jurnal penyesuaian pasca-RAT:', err);
      showToast(err?.message || 'Gagal mencatat jurnal penyesuaian pasca-RAT.', 'error');
    } finally {
      setSavingAdj(false);
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

        {/* ── POST-RAT PRIOR-PERIOD ADJUSTMENT CARD & HISTORY ── */}
        {isClosed && preview?.closingRecord && (
          <section
            aria-label="Jurnal Penyesuaian Awal Tahun Buku Baru"
            data-testid="prior-year-adjustment-section"
            className="bg-white rounded-2xl border border-purple-200/80 shadow-sm overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-purple-100 bg-purple-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-purple-950 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-700" />
                  Jurnal Penyesuaian Awal Tahun Buku {preview.fiscalYear + 1} (Koreksi Pasca-RAT {preview.fiscalYear})
                </h2>
                <p className="text-xs text-purple-900/80 mt-0.5">
                  Laporan RAT Tahun Buku {preview.fiscalYear} tetap terkunci utuh. Jika ditemukan kesalahan fatal setelah RAT, catat koreksinya di sini sebagai Jurnal Penyesuaian per 1 Januari {preview.fiscalYear + 1}.
                </p>
              </div>
              <button
                type="button"
                data-testid="open-prior-adjustment-modal-btn"
                onClick={openAdjustmentModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Catat Jurnal Penyesuaian (1 Jan {preview.fiscalYear + 1})
              </button>
            </div>

            <div className="p-5">
              {priorAdjustments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-xs text-slate-500">
                  Belum ada Jurnal Penyesuaian Pasca-RAT yang dicatat untuk Tahun Buku {preview.fiscalYear}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                        <th className="py-2.5 px-3 font-semibold">Tgl Efektif</th>
                        <th className="py-2.5 px-3 font-semibold">No. Referensi</th>
                        <th className="py-2.5 px-3 font-semibold">Objek &amp; Anggota</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Arah &amp; Nominal</th>
                        <th className="py-2.5 px-3 font-semibold">Alasan Koreksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {priorAdjustments.map((adj) => {
                        const targetLabel =
                          adj.adjustment_target === 'CASH_VAULT'
                            ? 'Kas Brankas'
                            : adj.adjustment_target === 'MEMBER_SAVINGS'
                            ? `Simpanan Anggota (${adj.deposit_type_code || '-'})`
                            : 'Cadangan Modal (Non-Kas)';
                        const isInc = adj.direction === 'INCREASE';
                        return (
                          <tr key={adj.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                              01/01/{adj.effective_year}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800 whitespace-nowrap">
                              {adj.reference_no}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <div className="font-semibold">{targetLabel}</div>
                              {adj.adjustment_target === 'MEMBER_SAVINGS' && (adj.member_nama || adj.member_nrp) && (
                                <div className="text-[11px] text-slate-500">
                                  {adj.member_nrp ? `${adj.member_nrp} — ` : ''}
                                  {adj.member_nama || '-'}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  isInc
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {isInc ? '+' : '-'} {formatRp(adj.amount)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                              {adj.reason}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
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
              {!isClosed && (
                <button
                  type="button"
                  onClick={handleResetAdArtDefaults}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                >
                  Reset Default AD/ART (20/30/25/10/5/5/5)
                </button>
              )}
            </div>
          </div>

          <div className="p-5 space-y-5">
            {/* 7 Pos Alokasi SHU Sesuai AD/ART */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  1. ALOKASI SHU SESUAI AD/ART (TOTAL HARUS 100%)
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  Bagian Anggota:{' '}
                  <strong className="text-slate-700">
                    {Math.round((settings.member_borrower_pct + settings.member_depositor_pct) * 100) / 100}%
                  </strong>{' '}
                  • Dana Pengurus/Karyawan/Sosial/Pendidikan:{' '}
                  <strong className="text-slate-700">
                    {Math.round(
                      (settings.management_fund_pct +
                        settings.employee_fund_pct +
                        settings.social_fund_pct +
                        settings.education_fund_pct) *
                        100
                    ) / 100}
                    %
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  {
                    id: 'reserve-fund-pct',
                    field: 'reserve_fund_pct' as const,
                    label: 'Cadangan Modal (%)',
                    value: settings.reserve_fund_pct,
                    amount: preview?.reserveFundAmount ?? 0,
                  },
                  {
                    id: 'member-borrower-pct',
                    field: 'member_borrower_pct' as const,
                    label: 'Anggota Peminjam (%)',
                    value: settings.member_borrower_pct,
                    amount: preview?.memberBorrowerPool ?? preview?.jasaUsahaPool ?? 0,
                  },
                  {
                    id: 'member-depositor-pct',
                    field: 'member_depositor_pct' as const,
                    label: 'Anggota Penyimpan (%)',
                    value: settings.member_depositor_pct,
                    amount: preview?.memberDepositorPool ?? preview?.jasaModalPool ?? 0,
                  },
                  {
                    id: 'management-fund-pct',
                    field: 'management_fund_pct' as const,
                    label: 'Dana Pengurus (%)',
                    value: settings.management_fund_pct,
                    amount: preview?.managementFundAmount ?? 0,
                  },
                  {
                    id: 'employee-fund-pct',
                    field: 'employee_fund_pct' as const,
                    label: 'Dana Karyawan (%)',
                    value: settings.employee_fund_pct,
                    amount: preview?.employeeFundAmount ?? 0,
                  },
                  {
                    id: 'social-fund-pct',
                    field: 'social_fund_pct' as const,
                    label: 'Dana Sosial (%)',
                    value: settings.social_fund_pct,
                    amount: preview?.socialFundAmount ?? 0,
                  },
                  {
                    id: 'education-fund-pct',
                    field: 'education_fund_pct' as const,
                    label: 'Dana Pendidikan (%)',
                    value: settings.education_fund_pct,
                    amount: preview?.educationFundAmount ?? 0,
                  },
                ].map((pot) => (
                  <div
                    key={pot.id}
                    className="rounded-lg border border-slate-200 bg-white p-2.5 flex flex-col justify-between"
                  >
                    <div>
                      <label
                        htmlFor={pot.id}
                        className="block text-[11px] font-semibold text-slate-700 mb-1.5 leading-tight"
                      >
                        {pot.label}
                      </label>
                      <input
                        id={pot.id}
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        disabled={isClosed}
                        value={pot.value}
                        onChange={(e) => handlePctChange(pot.field, e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500"
                      />
                    </div>
                    <p className="text-[11px] font-semibold text-emerald-700 mt-1.5 tabular-nums truncate">
                      {formatRp(pot.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Metode Penyaluran SHU Anggota */}
            <div className="space-y-2.5">
              <span className="block text-xs font-bold uppercase tracking-wider text-slate-600">
                2. METODE PENYALURAN SHU ANGGOTA
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

            {/* REFERENSI & PEMERIKSAAN 12 ARSIP REKAP AKHIR BULAN */}
            <section
              aria-label="Referensi Pemeriksaan Arsip Rekap Akhir Bulan"
              data-testid="monthly-archives-reference-panel"
              className="bg-white rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-outline-variant/20 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-primary flex items-center gap-2">
                    <CalendarCheck2 className="w-4 h-4 text-emerald-600" />
                    Referensi Pemeriksaan: Arsip Rekap Akhir Bulan ({fiscalYear})
                  </h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Tinjau catatan evaluasi rapat bulanan pengurus sebelum mengesahkan Tutup Buku &amp; Pembagian SHU RAT.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isLoadingArchives ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Memuat arsip bulanan...
                    </span>
                  ) : approvedArchiveCount === 12 ? (
                    <span
                      data-testid="monthly-archives-completeness-badge"
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      12 / 12 Bulan Lengkap Disahkan
                    </span>
                  ) : (
                    <>
                      <span
                        data-testid="monthly-archives-completeness-badge"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        {approvedArchiveCount} / 12 Bulan Disahkan
                      </span>
                      {inRouter ? (
                        <Link
                          to="/admin/tutup-bulan"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-50 transition-colors whitespace-nowrap"
                        >
                          Kelola Rekap Bulanan →
                        </Link>
                      ) : (
                        <a
                          href="/admin/tutup-bulan"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 text-xs font-bold hover:bg-amber-50 transition-colors whitespace-nowrap"
                        >
                          Kelola Rekap Bulanan →
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>

              {(referenceArchive !== null || approvedArchiveCount < 12) && (
                <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  {referenceArchive !== null && archiveCashDiff !== null ? (
                    archiveCashDiff === 0 ? (
                      <span
                        data-testid="monthly-archive-cash-consistency"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold w-fit"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        Saldo Kas {getMonthNameId(referenceArchive.period_month)} Konsisten dengan Neraca Akhir Tahun (Selisih Rp 0)
                      </span>
                    ) : (
                      <span
                        data-testid="monthly-archive-cash-consistency"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-semibold w-fit"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        Selisih kas vs arsip {getMonthNameId(referenceArchive.period_month)}: {formatRp(archiveCashDiff)}
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500">
                      Belum ada arsip rekap bulanan yang disahkan pada tahun buku {fiscalYear}.
                    </span>
                  )}

                  {approvedArchiveCount < 12 && (
                    <span className="text-slate-500">
                      Pemeriksaan lunak (soft check): tutup buku tahunan tetap dapat dieksekusi bila koperasi mulai aktif di tengah tahun.
                    </span>
                  )}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Bulan
                      </th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Status Rekap
                      </th>
                      <th className="text-left px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        No. Berita Acara &amp; Tgl Rapat
                      </th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Kas Akhir Bulan
                      </th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Simpanan Anggota
                      </th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Piutang Pinjaman
                      </th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        SHU Bulan Ini
                      </th>
                      <th className="text-right px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        SHU Akumulasi (YTD)
                      </th>
                      <th className="text-center px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MONTH_NAMES_ID.map((monthName, idx) => {
                      const m = idx + 1;
                      const rec = monthlyArchiveMap.get(m) ?? null;
                      const targetUrl = `/admin/tutup-bulan?year=${fiscalYear}&month=${m}`;
                      return (
                        <tr
                          key={m}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            idx % 2 === 1 ? 'bg-slate-50/30' : ''
                          }`}
                        >
                          <td className="px-3.5 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                            {monthName} {fiscalYear}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            {rec ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Disahkan ✓
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                Belum Direkap
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-xs text-slate-700 whitespace-nowrap">
                            {rec ? (
                              <div>
                                <div className="font-semibold text-slate-800">
                                  {rec.minutes_number || '-'}
                                </div>
                                {rec.meeting_date && (
                                  <div className="text-[11px] text-slate-500">
                                    Rapat: {formatDateId(rec.meeting_date)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-800 font-medium whitespace-nowrap">
                            {rec ? formatRp(rec.closing_cash_balance) : '-'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-800 font-medium whitespace-nowrap">
                            {rec ? formatRp(rec.total_savings_balance) : '-'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums text-slate-800 font-medium whitespace-nowrap">
                            {rec ? formatRp(rec.total_loan_receivable) : '-'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums font-medium whitespace-nowrap text-slate-800">
                            {rec ? formatRp(rec.monthly_net_shu) : '-'}
                          </td>
                          <td className="px-3.5 py-2.5 text-right tabular-nums font-bold whitespace-nowrap text-emerald-700">
                            {rec ? formatRp(rec.ytd_net_shu) : '-'}
                          </td>
                          <td className="px-3.5 py-2.5 whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {rec ? (
                                <>
                                  <button
                                    type="button"
                                    disabled={printingArchiveMonth === m}
                                    onClick={() => handleDownloadMonthlyArchivePdf(rec)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                                  >
                                    <Printer className="w-3 h-3" />
                                    {printingArchiveMonth === m ? '...' : 'PDF'}
                                  </button>
                                  {inRouter ? (
                                    <Link
                                      to={targetUrl}
                                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
                                    >
                                      Detail
                                    </Link>
                                  ) : (
                                    <a
                                      href={targetUrl}
                                      className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700"
                                    >
                                      Detail
                                    </a>
                                  )}
                                </>
                              ) : inRouter ? (
                                <Link
                                  to={targetUrl}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-[11px] font-semibold text-amber-800"
                                >
                                  Rekap Sekarang →
                                </Link>
                              ) : (
                                <a
                                  href={targetUrl}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-[11px] font-semibold text-amber-800"
                                >
                                  Rekap Sekarang →
                                </a>
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
                        Jasa Penyimpan ({settings.member_depositor_pct}%)
                      </th>
                      <th className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Jasa Peminjam ({settings.member_borrower_pct}%)
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
                  onClick={() => {
                    setConfirmClosingPhrase('');
                    setIsConfirmModalOpen(true);
                  }}
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
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmClosingPhrase('');
                }}
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

              <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
                <label
                  htmlFor="confirm-closing-phrase-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Untuk menghindari ketidaksengajaan, ketik ulang teks berikut untuk melanjutkan:
                </label>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-1.5 border border-slate-200">
                  <code className="text-xs font-bold tracking-wide text-slate-900 select-all">
                    {expectedConfirmPhrase}
                  </code>
                  {isConfirmPhraseMatched && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Cocok
                    </span>
                  )}
                </div>
                <input
                  id="confirm-closing-phrase-input"
                  data-testid="confirm-closing-phrase-input"
                  type="text"
                  value={confirmClosingPhrase}
                  onChange={(e) => setConfirmClosingPhrase(e.target.value)}
                  disabled={executing}
                  autoComplete="off"
                  placeholder={`Ketik ${expectedConfirmPhrase}`}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="p-4 px-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={executing}
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  setConfirmClosingPhrase('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                data-testid="confirm-execute-closing-btn"
                disabled={executing || !isConfirmPhraseMatched}
                onClick={handleExecuteClosing}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Lock className="w-4 h-4" />
                {executing ? 'Memproses Tutup Buku...' : 'Ya, Eksekusi Tutup Buku Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL JURNAL PENYESUAIAN AWAL TAHUN BUKU BARU (PASCA-RAT) ── */}
      {adjModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="prior-adj-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-purple-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-700 text-white flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="prior-adj-modal-title" className="text-base font-bold text-purple-950">
                    Jurnal Penyesuaian Awal Tahun {fiscalYear + 1}
                  </h3>
                  <p className="text-xs text-purple-800">
                    Tanggal Efektif: <strong>01 Januari {fiscalYear + 1}</strong> (Koreksi Pasca-RAT {fiscalYear})
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={savingAdj}
                onClick={() => setAdjModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-sm max-h-[75vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Objek Penyesuaian
                </label>
                <select
                  value={adjTarget}
                  onChange={(e) => setAdjTarget(e.target.value as PriorYearAdjustmentTarget)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                >
                  <option value="CASH_VAULT">Koreksi Saldo Kas Brankas</option>
                  <option value="MEMBER_SAVINGS">Koreksi Saldo Simpanan Anggota</option>
                  <option value="RESERVE_EQUITY">Koreksi Cadangan Modal (Non-Kas)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Arah Koreksi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjDirection('INCREASE')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      adjDirection === 'INCREASE'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Penambahan (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjDirection('DECREASE')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                      adjDirection === 'DECREASE'
                        ? 'bg-rose-50 border-rose-500 text-rose-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Pengurangan (-)
                  </button>
                </div>
              </div>

              {adjTarget === 'MEMBER_SAVINGS' && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Cari &amp; Pilih Anggota
                    </label>
                    <input
                      type="text"
                      value={adjMemberSearch}
                      onChange={(e) => setAdjMemberSearch(e.target.value)}
                      placeholder="Ketik NRP atau Nama Anggota..."
                      className="w-full px-3 py-1.5 mb-2 rounded-lg border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    />
                    <select
                      value={adjMemberId}
                      onChange={(e) => setAdjMemberId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    >
                      <option value="">-- Pilih Anggota --</option>
                      {filteredMemberOptions.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nrp ? `${m.nrp} — ` : ''}{m.nama}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Jenis Simpanan
                    </label>
                    <select
                      value={adjDepositTypeCode}
                      onChange={(e) => setAdjDepositTypeCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                    >
                      <option value="POKOK">Simpanan Pokok (POKOK)</option>
                      <option value="WAJIB">Simpanan Wajib (WAJIB)</option>
                      <option value="BELANJA">Simpanan Belanja (BELANJA)</option>
                      <option value="LEBARAN">Simpanan Lebaran (LEBARAN)</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nominal Koreksi (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="Contoh: 500000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  No. Berita Acara / Referensi Koreksi
                </label>
                <input
                  type="text"
                  value={adjReferenceNo}
                  onChange={(e) => setAdjReferenceNo(e.target.value)}
                  placeholder={`Contoh: BA-KOR/01/${fiscalYear + 1}`}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Uraian Alasan Penyesuaian
                </label>
                <textarea
                  rows={3}
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="Jelaskan kesalahan pencatatan yang dikoreksi dan dasar berita acaranya..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                />
              </div>
            </div>

            <div className="p-4 px-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={savingAdj}
                onClick={() => setAdjModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                data-testid="save-prior-adjustment-btn"
                disabled={savingAdj}
                onClick={handleSaveAdjustment}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs sm:text-sm font-bold shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {savingAdj ? 'Menyimpan...' : 'Simpan Jurnal Penyesuaian'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
