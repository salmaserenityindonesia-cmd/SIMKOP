import { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getCommitmentStats, CommitmentStats } from '../../services/koperasiService';
import { getDashboardStats, DashboardStats } from '../../services/dashboardService';
import { getPaidOffLoansReport } from '../../services/paidOffLoansReportService';
import { useCart } from '../../lib/cartStore';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { generateDatabaseBackup } from '../../services/backupService';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';
import { fetchAllPaginated } from '../../utils/supabasePagination';

interface ActiveMemberRow {
  id: string;
  status?: string | null;
}

interface ActiveLoanRow {
  id: string;
  member_id: string | null;
  status?: string | null;
  principal_amount?: number | null;
  amount?: number | null;
  sisa_pinjaman?: number | null;
}

interface LoanScheduleRow {
  id: string;
  loan_id: string;
  target_amount?: number | null;
  paid_amount?: number | null;
}

interface DepositTypeRow {
  id: string;
  code?: string | null;
}

interface MemberDepositRow {
  id: string;
  member_id: string | null;
  deposit_type_id: string | null;
}

interface DepositTransactionRow {
  id: string;
  member_deposit_id: string | null;
  transaction_type?: string | null;
  amount?: number | null;
}

interface NetMemberSavingsSummary {
  totalAll: number;
  pokok: number;
  wajib: number;
  belanja: number;
  lebaran: number;
}

const EMPTY_SAVINGS_BREAKDOWN: NetMemberSavingsSummary = {
  totalAll: 0,
  pokok: 0,
  wajib: 0,
  belanja: 0,
  lebaran: 0,
};

const ACTIVE_LOAN_STATUSES = new Set(['berjalan', 'active', 'approved', 'disbursed']);
const LOAN_ID_CHUNK_SIZE = 80;

function isMissingColumnError(err: unknown): boolean {
  const error = err as { code?: string; message?: string } | null;
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === 'PGRST204' || code === '42703' || message.includes('column');
}

async function fetchTotalActiveLoanReceivable(): Promise<number> {
  const members = await fetchAllPaginated<ActiveMemberRow>((from, to) =>
    supabase
      .from('anggota')
      .select('id, status')
      .order('id', { ascending: true })
      .range(from, to)
  );

  const activeMemberIds = new Set<string>();
  for (const m of members) {
    if (m?.id && String(m.status || '').trim().toLowerCase() === 'aktif') {
      activeMemberIds.add(String(m.id));
    }
  }

  if (activeMemberIds.size === 0) {
    return 0;
  }

  let loans: ActiveLoanRow[];
  try {
    loans = await fetchAllPaginated<ActiveLoanRow>((from, to) =>
      supabase
        .from('loans')
        .select('id, member_id, status, principal_amount, amount, sisa_pinjaman')
        .order('id', { ascending: true })
        .range(from, to)
    );
  } catch (err) {
    if (!isMissingColumnError(err)) {
      throw err;
    }
    loans = await fetchAllPaginated<ActiveLoanRow>((from, to) =>
      supabase
        .from('loans')
        .select('*')
        .order('id', { ascending: true })
        .range(from, to)
    );
  }

  const activeLoans = loans.filter(
    (loan) =>
      Boolean(loan?.id) &&
      Boolean(loan?.member_id) &&
      ACTIVE_LOAN_STATUSES.has(String(loan.status || '').trim().toLowerCase()) &&
      activeMemberIds.has(String(loan.member_id))
  );

  if (activeLoans.length === 0) {
    return 0;
  }

  const activeLoanIds = activeLoans.map((loan) => String(loan.id));
  const schedulesByLoan = new Map<string, LoanScheduleRow[]>();

  for (let i = 0; i < activeLoanIds.length; i += LOAN_ID_CHUNK_SIZE) {
    const chunk = activeLoanIds.slice(i, i + LOAN_ID_CHUNK_SIZE);
    const chunkSchedules = await fetchAllPaginated<LoanScheduleRow>((from, to) =>
      supabase
        .from('loan_schedules')
        .select('id, loan_id, target_amount, paid_amount')
        .in('loan_id', chunk)
        .order('id', { ascending: true })
        .range(from, to)
    );

    for (const schedule of chunkSchedules) {
      if (!schedule?.loan_id) continue;
      const key = String(schedule.loan_id);
      const list = schedulesByLoan.get(key) || [];
      list.push(schedule);
      schedulesByLoan.set(key, list);
    }
  }

  let sumRemaining = 0;
  for (const loan of activeLoans) {
    const schedulesForLoan = schedulesByLoan.get(String(loan.id)) || [];
    const principalOrAmount = Number(loan.principal_amount ?? loan.amount ?? 0);
    const totalAkad =
      schedulesForLoan.length > 0
        ? Math.max(
            principalOrAmount,
            schedulesForLoan.reduce((sum, s) => sum + Number(s.target_amount || 0), 0)
          )
        : principalOrAmount;
    const totalPaid = schedulesForLoan.reduce(
      (sum, s) => sum + Number(s.paid_amount || 0),
      0
    );
    const remaining =
      schedulesForLoan.length > 0
        ? Math.max(0, Math.round(totalAkad - totalPaid))
        : Math.max(0, Math.round(Number(loan.sisa_pinjaman ?? totalAkad)));
    sumRemaining += remaining;
  }

  return sumRemaining;
}

async function fetchNetMemberSavings(): Promise<NetMemberSavingsSummary> {
  const members = await fetchAllPaginated<ActiveMemberRow>((from, to) =>
    supabase
      .from('anggota')
      .select('id, status')
      .order('id', { ascending: true })
      .range(from, to)
  );

  const activeMemberIds = new Set<string>();
  for (const m of members) {
    if (m?.id && String(m.status || '').trim().toLowerCase() === 'aktif') {
      activeMemberIds.add(String(m.id));
    }
  }

  if (activeMemberIds.size === 0) {
    return EMPTY_SAVINGS_BREAKDOWN;
  }

  const [depositTypes, memberDeposits] = await Promise.all([
    fetchAllPaginated<DepositTypeRow>((from, to) =>
      supabase
        .from('deposit_types')
        .select('id, code')
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPaginated<MemberDepositRow>((from, to) =>
      supabase
        .from('member_deposits')
        .select('id, member_id, deposit_type_id')
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ]);

  const depositTypeCodeById = new Map<string, string>();
  for (const dt of depositTypes) {
    if (dt?.id) {
      depositTypeCodeById.set(String(dt.id), String(dt.code || '').trim().toUpperCase());
    }
  }

  const validMemberDepositMap = new Map<string, { depositCode: string }>();
  for (const md of memberDeposits) {
    if (md?.id && md?.member_id && activeMemberIds.has(String(md.member_id))) {
      const depositCode = depositTypeCodeById.get(String(md.deposit_type_id || '')) || '';
      validMemberDepositMap.set(String(md.id), { depositCode });
    }
  }

  if (validMemberDepositMap.size === 0) {
    return EMPTY_SAVINGS_BREAKDOWN;
  }

  const allDepositTransactions = await fetchAllPaginated<DepositTransactionRow>((from, to) =>
    supabase
      .from('deposit_transactions')
      .select('id, member_deposit_id, transaction_type, amount')
      .order('id', { ascending: true })
      .range(from, to)
  );

  let netPokok = 0;
  let netWajib = 0;
  let netBelanja = 0;
  let netLebaran = 0;

  for (const tx of allDepositTransactions) {
    const md = validMemberDepositMap.get(String(tx.member_deposit_id || ''));
    if (!md) continue;

    const amt = Number(tx.amount || 0);
    const txType = String(tx.transaction_type || '').trim().toLowerCase();
    const signedAmt = txType === 'deposit' ? amt : txType === 'withdrawal' ? -amt : 0;

    if (md.depositCode === 'POKOK') netPokok += signedAmt;
    else if (md.depositCode === 'WAJIB') netWajib += signedAmt;
    else if (md.depositCode === 'BELANJA') netBelanja += signedAmt;
    else if (md.depositCode === 'LEBARAN') netLebaran += signedAmt;
  }

  const safePokok = Math.max(0, Math.round(netPokok));
  const safeWajib = Math.max(0, Math.round(netWajib));
  const safeBelanja = Math.max(0, Math.round(netBelanja));
  const safeLebaran = Math.max(0, Math.round(netLebaran));

  return {
    totalAll: safePokok + safeWajib + safeBelanja + safeLebaran,
    pokok: safePokok,
    wajib: safeWajib,
    belanja: safeBelanja,
    lebaran: safeLebaran,
  };
}

export default function AdminDashboard() {
  const { showToast, showConfirm } = useFeedback();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [commitmentStats, setCommitmentStats] = useState<CommitmentStats | null>(null);
  const [paidOffLoansCount, setPaidOffLoansCount] = useState<number>(0);
  const [totalActiveLoanReceivable, setTotalActiveLoanReceivable] = useState<number>(0);
  const [savingsBreakdown, setSavingsBreakdown] = useState<NetMemberSavingsSummary>(EMPTY_SAVINGS_BREAKDOWN);
  const [loading, setLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const { parkedTransactions } = useCart();

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    Promise.all([
      getDashboardStats(),
      getCommitmentStats(currentMonth, currentYear),
      getPaidOffLoansReport(currentYear).catch((err) => {
        console.warn('Failed to load paid-off loans count:', err);
        return null;
      }),
      fetchTotalActiveLoanReceivable().catch((err) => {
        console.warn('Failed to load active loan receivable:', err);
        return 0;
      }),
      fetchNetMemberSavings().catch((err) => {
        console.warn('Failed to load net member savings:', err);
        return EMPTY_SAVINGS_BREAKDOWN;
      }),
    ]).then(([dashboardData, commitmentData, paidOffData, activeLoanReceivable, netSavings]) => {
      setStats(dashboardData);
      setCommitmentStats(commitmentData);
      setPaidOffLoansCount(paidOffData?.totalPaidOffLoans ?? 0);
      setTotalActiveLoanReceivable(activeLoanReceivable);
      setSavingsBreakdown(netSavings);
      setLoading(false);
    }).catch(error => {
      console.error('Failed to load dashboard stats:', error);
      setLoading(false);
    });
  }, [currentMonth, currentYear]);

  const handleBackup = async () => {
    const confirmed = await showConfirm({
      title: 'Konfirmasi Backup',
      message: 'Apakah Anda yakin ingin membackup seluruh database? Proses ini mungkin memerlukan waktu beberapa saat.',
      confirmText: 'Backup',
    });
    if (!confirmed) {
      return;
    }

    setIsBackingUp(true);
    try {
      const url = await generateDatabaseBackup();
      const a = document.createElement('a');
      a.href = url;
      a.download = `simkop_backup_${new Date().toISOString().replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup berhasil diunduh!', 'success');
    } catch (error: any) {
      showToast('Terjadi kesalahan saat backup: ' + error.message, 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <AdminLayout>
      {/* DASHBOARD HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-label-sm font-label-sm bg-surface-container text-on-surface-variant">Tahun Buku 2026</span>
            <span className="text-label-sm font-label-sm text-outline">• Harian Operasional</span>
          </div>
          <h1 className="text-headline-md font-headline-md text-primary tracking-tight">Dashboard Operasional</h1>
          <p className="text-body-md font-body-md text-on-surface-variant">Ringkasan aktivitas unit Simpan Pinjam dan unit Retail (POS)</p>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackup}
            disabled={isBackingUp}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isBackingUp ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
            ) : (
              <span className="material-symbols-outlined text-[20px]">cloud_download</span>
            )}
            {isBackingUp ? 'Proses Backup...' : 'Backup Database'}
          </button>
        </div>
      </div>

      {/* KPI SUMMARY CARDS */}
      {loading ? (
        <div className="py-12 text-center text-on-surface-variant">Memuat data dashboard...</div>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Card 1: Penjualan Hari Ini */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#10B981]"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Omset POS Hari Ini</span>
                <span className="p-2 rounded-lg bg-[#ECFDF5] text-[#047857]">
                  <span className="material-symbols-outlined text-[20px]">shopping_cart_checkout</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">
                Rp {(stats?.totalPenjualanHariIni ?? 0).toLocaleString('id-ID')}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Penjualan retail berjalan</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
              <Link to="/admin/laporan-retail" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Lihat Laporan <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Card 2: Pinjaman Aktif */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-primary"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Pinjaman Aktif</span>
                <span className="p-2 rounded-lg bg-surface-container-low text-primary">
                  <span className="material-symbols-outlined text-[20px]">request_quote</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">
                {stats?.totalPinjamanAktif ?? 0}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Berkas pinjaman berjalan</div>
              <div className="mt-2 pt-2 border-t border-slate-100">
                <div className="text-[11px] font-medium text-slate-500">Sisa Piutang Aktif</div>
                <div className="text-sm font-bold text-slate-900 tabular-nums">
                  Rp {totalActiveLoanReceivable.toLocaleString('id-ID')}
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex flex-col gap-1.5 text-label-sm">
              <Link to="/admin/approval" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Kelola Pinjaman <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
              <Link
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline"
                to="/admin/laporan-pinjaman-lunas"
              >
                <span>{paidOffLoansCount} Kontrak Lunas Penuh ({currentYear})</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Card 3: Stok Kritis */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-error"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Stok Kritis</span>
                <span className="p-2 rounded-lg bg-error/10 text-error">
                  <span className="material-symbols-outlined text-[20px]">inventory_2</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-error font-semibold tracking-tight">
                {stats?.stokKritis ?? 0}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Produk butuh restock</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
              <Link to="/admin/produk" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Cek Inventori <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>

          {/* Card 4: Transaksi Tersimpan */}
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 left-0 right-0 h-1 bg-secondary"></div>
            <div>
              <div className="flex items-center justify-between text-on-surface-variant mb-2">
                <span className="text-label-md font-label-md">Transaksi Tersimpan</span>
                <span className="p-2 rounded-lg bg-secondary-container/30 text-secondary">
                  <span className="material-symbols-outlined text-[20px]">pause_circle</span>
                </span>
              </div>
              <div className="text-headline-md font-headline-md text-primary font-semibold tracking-tight">
                {parkedTransactions.length}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant mt-0.5">Catatan kasir diparkir</div>
            </div>
            <div className="mt-4 pt-3 border-t border-outline-variant/30 flex items-center justify-between text-label-sm">
              <Link to="/admin/kasir?view=parked" className="text-primary hover:underline flex items-center gap-1 font-medium">
                Lihat Belanja Ditahan <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* COMMITMENT STATS (PHASE 8 Analytics) */}
      {!loading && (
        <section className="mt-8">
          <h2 className="text-title-lg font-title-lg text-primary mb-4">Status Komitmen Bulan Ini ({currentMonth}/{currentYear})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Deposit Commitments */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm">
              <h3 className="text-title-md font-title-md text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">savings</span>
                Simpanan Wajib
              </h3>
              <div className="flex gap-4 items-center">
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-[#10B981]">{commitmentStats?.deposit.lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Sudah Lunas</div>
                </div>
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-error">{commitmentStats?.deposit.belum_lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Belum Lunas</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">
                      Total Saldo Bersih Simpanan Anggota
                    </div>
                    <div className="text-sm font-bold text-emerald-700 tabular-nums">
                      Rp {savingsBreakdown.totalAll.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <Link
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    to="/admin/compliance-matrix"
                  >
                    <span>Matriks Simpanan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>

                {/* Sub-baris Rincian 4 Jenis Simpanan */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <Link
                    className="group block rounded-lg bg-slate-50 hover:bg-slate-100/90 border border-slate-200/70 hover:border-slate-400 px-2.5 py-1.5 transition-all cursor-pointer"
                    title="Buka Matriks Simpanan (Status Simpanan Pokok)"
                    to="/admin/compliance-matrix"
                  >
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <span>Pokok</span>
                      <ArrowRight className="w-3 h-3 text-slate-500 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-xs font-bold text-slate-800 tabular-nums mt-0.5">
                      Rp {savingsBreakdown.pokok.toLocaleString('id-ID')}
                    </div>
                  </Link>
                  <Link
                    className="group block rounded-lg bg-emerald-50/60 hover:bg-emerald-100/80 border border-emerald-200/70 hover:border-emerald-400 px-2.5 py-1.5 transition-all cursor-pointer"
                    title="Buka Matriks Simpanan Wajib"
                    to="/admin/compliance-matrix"
                  >
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      <span>Wajib</span>
                      <ArrowRight className="w-3 h-3 text-emerald-600 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-xs font-bold text-emerald-900 tabular-nums mt-0.5">
                      Rp {savingsBreakdown.wajib.toLocaleString('id-ID')}
                    </div>
                  </Link>
                  <Link
                    className="group block rounded-lg bg-teal-50/60 hover:bg-teal-100/80 border border-teal-200/70 hover:border-teal-400 px-2.5 py-1.5 transition-all cursor-pointer"
                    title="Buka Buku Besar Simpanan Belanja"
                    to="/admin/buku-besar-belanja"
                  >
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                      <span>Belanja</span>
                      <ArrowRight className="w-3 h-3 text-teal-600 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-xs font-bold text-teal-900 tabular-nums mt-0.5">
                      Rp {savingsBreakdown.belanja.toLocaleString('id-ID')}
                    </div>
                  </Link>
                  <Link
                    className="group block rounded-lg bg-amber-50/60 hover:bg-amber-100/80 border border-amber-200/70 hover:border-amber-400 px-2.5 py-1.5 transition-all cursor-pointer"
                    title="Buka Matriks Simpanan Lebaran"
                    to="/admin/compliance-matrix"
                  >
                    <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                      <span>Lebaran</span>
                      <ArrowRight className="w-3 h-3 text-amber-600 opacity-75 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="text-xs font-bold text-amber-900 tabular-nums mt-0.5">
                      Rp {savingsBreakdown.lebaran.toLocaleString('id-ID')}
                    </div>
                  </Link>
                </div>
              </div>
            </div>

            {/* Loan Commitments */}
            <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/40 p-5 shadow-sm">
              <h3 className="text-title-md font-title-md text-on-surface mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">account_balance_wallet</span>
                Cicilan Pinjaman
              </h3>
              <div className="flex gap-4 items-center">
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-[#10B981]">{commitmentStats?.loan.lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Terbayar (Bln Ini)</div>
                </div>
                <div className="flex-1 bg-surface-container-low rounded-lg p-4 text-center">
                  <div className="text-headline-sm font-semibold text-error">{commitmentStats?.loan.belum_lunas || 0}</div>
                  <div className="text-label-sm text-on-surface-variant">Belum Terbayar</div>
                </div>
              </div>
              {(commitmentStats?.loan.lunas || 0) === 0 &&
                (commitmentStats?.loan.belum_lunas || 0) === 0 &&
                (commitmentStats?.loan.active_loans || 0) > 0 && (
                  <p className="mt-3 text-label-sm text-on-surface-variant flex items-center gap-1.5 bg-surface-container-low/70 rounded-lg px-3 py-2">
                    <span className="material-symbols-outlined text-[16px] text-primary shrink-0">info</span>
                    <span>
                      Tidak ada tagihan jatuh tempo bulan ini ({commitmentStats?.loan.active_loans} kontrak berjalan mulai tagihan bulan berikutnya)
                    </span>
                  </p>
                )}
            </div>
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
