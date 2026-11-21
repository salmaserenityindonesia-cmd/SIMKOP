import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Coins, 
  Wallet, 
  TrendingUp, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Search, 
  Download, 
  RefreshCw, 
  Landmark, 
  ShieldAlert, 
  Info
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { exportToExcel } from '../../../lib/exportUtils';
import { 
  bulkWithdrawalService,
  formatCycleDisplayDate,
  resolveCycleEffectiveDate,
  LebaranSimulationSummary,
  LebaranSimulationMember,
  LebaranDisbursementCycle
} from '../../../services/bulkWithdrawalService';
import BulkDisbursementConfirmModal from './BulkDisbursementConfirmModal';

interface BulkLebaranTabProps {
  onCyclesUpdated?: () => void;
}

function getLocalTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function BulkLebaranTab({ onCyclesUpdated }: BulkLebaranTabProps) {
  const [simulation, setSimulation] = useState<LebaranSimulationSummary | null>(null);
  const [lastCycle, setLastCycle] = useState<LebaranDisbursementCycle | null>(null);
  const [massCutoffDate, setMassCutoffDate] = useState<string>(() => getLocalTodayDateString());
  
  const [isLoadingSimulation, setIsLoadingSimulation] = useState(false);
  const [isLoadingLastCycle, setIsLoadingLastCycle] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter State Nominatif
  const [searchQuery, setSearchQuery] = useState('');
  const [loanFilter, setLoanFilter] = useState<'all' | 'with_loan' | 'no_loan'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [targetCycleForExecution, setTargetCycleForExecution] = useState<LebaranDisbursementCycle | null>(null);

  // Load Initial Last Cycle on mount
  useEffect(() => {
    loadLastCycle();
  }, []);

  // Re-run Simulation whenever Cut-Off Date changes
  useEffect(() => {
    loadSimulation(massCutoffDate);
  }, [massCutoffDate]);

  const loadAllData = async () => {
    await Promise.all([
      loadSimulation(massCutoffDate),
      loadLastCycle()
    ]);
  };

  const loadSimulation = async (targetDate?: string) => {
    setIsLoadingSimulation(true);
    setExecutionError(null);
    try {
      const effectiveCutOff = targetDate ?? massCutoffDate;
      const sim = await bulkWithdrawalService.simulateLebaranDisbursement(effectiveCutOff);
      setSimulation(sim);
    } catch (err: any) {
      console.error('Error loading lebaran simulation:', err);
      setExecutionError(err.message || 'Gagal memuat simulasi pencairan lebaran.');
    } finally {
      setIsLoadingSimulation(false);
    }
  };

  const loadLastCycle = async () => {
    setIsLoadingLastCycle(true);
    try {
      const last = await bulkWithdrawalService.getLastCompletedLebaranCycle();
      setLastCycle(last);
    } catch (err: any) {
      console.error('Error loading last completed cycle:', err);
    } finally {
      setIsLoadingLastCycle(false);
    }
  };

  // Filtered Members
  const filteredMembers = useMemo(() => {
    if (!simulation?.members) return [];
    return simulation.members.filter(m => {
      const matchSearch = 
        m.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.nrp.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.bankAccount.toLowerCase().includes(searchQuery.toLowerCase());

      let matchLoan = true;
      if (loanFilter === 'with_loan') {
        matchLoan = m.hasActiveLoan;
      } else if (loanFilter === 'no_loan') {
        matchLoan = !m.hasActiveLoan;
      }

      return matchSearch && matchLoan;
    });
  }, [simulation?.members, searchQuery, loanFilter]);

  // Paginated Members
  const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  // Export Excel (.xlsx)
  const handleExportExcel = () => {
    if (!simulation?.members || simulation.members.length === 0) {
      alert('Tidak ada data nominatif untuk diekspor.');
      return;
    }

    const rows = filteredMembers.map((m, idx) => ({
      'No': idx + 1,
      'NRP': m.nrp,
      'Nama Anggota': m.nama,
      'Pangkat': m.pangkat,
      'Nomor Rekening': m.bankAccount,
      'Nama Bank': m.bankName,
      'Saldo Saat Ini (Rp)': m.currentTotalBalance ?? m.saldoLebaran,
      'Hak Cair s/d Cut-Off (Rp)': m.eligibleAmount ?? m.saldoLebaran,
      'Sisa Pasca-Cair (Rp)': m.remainingAfterDisbursement ?? 0,
      'Rincian Komponen Cair': m.breakdownSummary || m.depositHistorySummary || '-',
      'Status Pinjaman Aktif': m.hasActiveLoan ? 'ADA PINJAMAN' : 'BEBAS PINJAMAN',
      'Sisa Hutang Pinjaman (Rp)': m.activeLoanRemaining
    }));

    exportToExcel(rows, `Nominatif_Pencairan_Lebaran_${massCutoffDate || new Date().toISOString().slice(0, 10)}`);
  };

  // Open Execution Modal
  const handleOpenExecutionModal = (cycle?: LebaranDisbursementCycle) => {
    setExecutionError(null);
    setTargetCycleForExecution(cycle || null);
    setIsConfirmModalOpen(true);
  };

  // Confirm Disbursement Execution
  const handleConfirmDisbursement = async (payload: {
    cycleName: string;
    cutOffDate: string;
    notes?: string;
  }) => {
    setIsExecuting(true);
    setExecutionError(null);
    setSuccessMessage(null);

    try {
      let currentUserId: string | null = null;
      try {
        const { data: userData } = await supabase.auth.getUser();
        currentUserId = userData?.user?.id || null;
      } catch (_) {}

      let cycleId = targetCycleForExecution?.id;

      if (!cycleId) {
        const newCycle = await bulkWithdrawalService.createDisbursementDraft({
          cycleName: payload.cycleName,
          cutOffDate: payload.cutOffDate,
          notes: payload.notes
        });
        cycleId = newCycle.id;
      }

      const result = await bulkWithdrawalService.approveAndExecuteDisbursement(
        cycleId,
        currentUserId || undefined,
        payload.cutOffDate
      );

      setSuccessMessage(
        `Sukses! Siklus "${payload.cycleName}" berhasil dieksekusi (${result.executionMode === 'rpc' ? 'Engine Database Atomik' : 'Proses Terstruktur'}). Total ${result.totalMembers} anggota telah dicairkan senilai Rp ${result.totalAmount.toLocaleString('id-ID')}.`
      );

      setIsConfirmModalOpen(false);
      setTargetCycleForExecution(null);

      await loadAllData();
      onCyclesUpdated?.();
    } catch (err: any) {
      console.error('Error executing bulk disbursement:', err);
      setExecutionError(err.message || 'Terjadi kesalahan saat memproses pencairan massal simpanan lebaran.');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner: Status Siklus Terakhir */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center gap-3.5">
          <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl shrink-0">
            <Calendar className="w-6 h-6 text-emerald-200" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 bg-emerald-900/40 px-2.5 py-0.5 rounded-full">
                Status Siklus Terakhir
              </span>
              {lastCycle && (
                <span className="flex items-center gap-1 text-xs text-emerald-200 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Selesai
                </span>
              )}
            </div>
            <p className="font-semibold text-base md:text-lg mt-1 text-white">
              {lastCycle ? (
                <>
                  Pencairan Terakhir: <span className="underline decoration-emerald-400 decoration-2">{lastCycle.cycle_name}</span> ({formatCycleDisplayDate(lastCycle)})
                </>
              ) : (
                'Belum ada riwayat siklus pencairan lebaran yang tercatat'
              )}
            </p>
            {lastCycle && (
              <p className="text-xs text-emerald-100/90 mt-0.5">
                Total terealisasi: {lastCycle.total_members.toLocaleString('id-ID')} anggota • Rp {Number(lastCycle.total_amount || 0).toLocaleString('id-ID')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center">
          <button
            onClick={loadAllData}
            disabled={isLoadingSimulation || isLoadingLastCycle}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-medium backdrop-blur-md transition-all flex items-center gap-1.5 border border-white/15 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSimulation || isLoadingLastCycle ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {/* Alert Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {executionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{executionError}</p>
          </div>
          <button
            onClick={() => setExecutionError(null)}
            className="text-red-500 hover:text-red-700 font-bold text-xs"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Metric Cards (Simulasi) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total Anggota */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Total Anggota Penerima
            </span>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-800 tracking-tight">
            {isLoadingSimulation ? (
              <span className="inline-block w-24 h-8 bg-slate-200 animate-pulse rounded" />
            ) : (
              `${(simulation?.totalMembers || 0).toLocaleString('id-ID')} `
            )}
            <span className="text-sm font-normal text-slate-500">Anggota</span>
          </p>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
            Anggota aktif dengan saldo &gt; Rp 0
          </p>
        </div>

        {/* Total Dana Siap Cair */}
        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Total Dana Lebaran Siap Cair
            </span>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-emerald-600 tracking-tight">
            {isLoadingSimulation ? (
              <span className="inline-block w-36 h-8 bg-slate-200 animate-pulse rounded" />
            ) : (
              `Rp ${(simulation?.totalAmount || 0).toLocaleString('id-ID')}`
            )}
          </p>
          <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1 font-medium">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            Hak cair terkumpul s/d {formatCycleDisplayDate({ cut_off_date: massCutoffDate })}
          </p>
        </div>

        {/* Rata-rata per Anggota */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Rata-Rata Tabungan / Anggota
            </span>
            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-slate-800 tracking-tight">
            {isLoadingSimulation ? (
              <span className="inline-block w-32 h-8 bg-slate-200 animate-pulse rounded" />
            ) : (
              `Rp ${(simulation?.averageAmount || 0).toLocaleString('id-ID')}`
            )}
          </p>
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-purple-500" />
            Hak cair rata-rata per anggota s/d cut-off
          </p>
        </div>
      </div>

      {/* Main Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Cari NRP, Nama, atau Rekening..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-2 bg-emerald-50/70 border border-emerald-200 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-emerald-600 shrink-0" />
            <label
              htmlFor="mass-cutoff-date-input"
              className="text-xs font-bold text-emerald-900 whitespace-nowrap"
            >
              Tanggal Pencairan / Cut-Off
            </label>
            <input
              id="mass-cutoff-date-input"
              type="date"
              value={massCutoffDate}
              onChange={(e) => {
                const nextDate = e.target.value;
                if (nextDate) {
                  setMassCutoffDate(nextDate);
                  setCurrentPage(1);
                }
              }}
              className="bg-white border border-emerald-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => { setLoanFilter('all'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                loanFilter === 'all'
                  ? 'bg-white text-slate-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({simulation?.members.length || 0})
            </button>
            <button
              onClick={() => { setLoanFilter('no_loan'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                loanFilter === 'no_loan'
                  ? 'bg-white text-emerald-700 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              Bebas Pinjaman ({simulation?.members.filter(m => !m.hasActiveLoan).length || 0})
            </button>
            <button
              onClick={() => { setLoanFilter('with_loan'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                loanFilter === 'with_loan'
                  ? 'bg-white text-amber-700 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              Ada Pinjaman ({simulation?.members.filter(m => m.hasActiveLoan).length || 0})
            </button>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => loadSimulation(massCutoffDate)}
            disabled={isLoadingSimulation}
            className="px-4 py-2 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Refresh data nominatif simulasi"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSimulation ? 'animate-spin' : ''}`} />
            Refresh Simulasi
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isLoadingSimulation || !simulation || simulation.members.length === 0}
            className="px-4 py-2 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Unduh daftar nominatif ke format file Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            Ekspor Nominatif
          </button>

          <button
            onClick={() => handleOpenExecutionModal()}
            disabled={isLoadingSimulation || !simulation || simulation.totalMembers === 0}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl text-sm shadow-sm shadow-red-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Coins className="w-4 h-4" />
            Eksekusi Pencairan Massal
          </button>
        </div>
      </div>

      {/* Table Nominatif Penerima */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-base">
              Daftar Nominatif Penerima Pencairan Simpanan Lebaran
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan {paginatedMembers.length} dari {filteredMembers.length} anggota yang berhak menerima pencairan THR (Cut-Off: {formatCycleDisplayDate({ cut_off_date: massCutoffDate })})
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg">
            Halaman {currentPage} dari {totalPages}
          </span>
        </div>

        {isLoadingSimulation ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
            <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">Memuat dan menghitung nominatif saldo simpanan lebaran...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Anggota</th>
                  <th className="py-3 px-4">Rekening Tujuan</th>
                  <th className="py-3 px-4 text-right">Saldo Saat Ini</th>
                  <th className="py-3 px-4 text-right">Saldo Hak Cair (s/d Cut-Off)</th>
                  <th className="py-3 px-4 text-right">Sisa Tabungan Pasca-Cair</th>
                  <th className="py-3 px-4 text-right">Rincian Komponen Cair</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400 text-sm">
                      Tidak ada anggota yang memenuhi kriteria pencarian / filter saldo simpanan lebaran.
                    </td>
                  </tr>
                ) : (
                  paginatedMembers.map((member, idx) => {
                    const globalIdx = (currentPage - 1) * pageSize + idx + 1;
                    const currentBalance = member.currentTotalBalance ?? member.saldoLebaran;
                    const eligibleAmt = member.eligibleAmount ?? member.saldoLebaran;
                    const remainingAmt = member.remainingAfterDisbursement ?? 0;
                    return (
                      <tr key={member.memberId} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 text-center text-slate-400 text-xs font-mono">
                          {globalIdx}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">{member.nama}</div>
                          <div className="text-xs text-slate-500 font-mono">
                            NRP: {member.nrp} • {member.pangkat}
                          </div>
                          {member.hasActiveLoan && (
                            <div className="mt-1">
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-medium rounded-md"
                                title={`Sisa Hutang: Rp ${member.activeLoanRemaining.toLocaleString('id-ID')}`}
                              >
                                <ShieldAlert className="w-3 h-3 text-amber-600" />
                                Ada pinjaman aktif
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {member.bankAccount ? (
                            <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-700">
                              <Landmark className="w-3.5 h-3.5 text-slate-400" />
                              <span>{member.bankName || 'Bank'}</span>
                              <span className="font-bold text-slate-900">{member.bankAccount}</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium rounded">
                              <AlertTriangle className="w-3 h-3 text-amber-500" /> Belum ada rekening
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-semibold text-slate-600 text-sm">
                            Rp {currentBalance.toLocaleString('id-ID')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-black text-emerald-600 text-base">
                            Rp {eligibleAmt.toLocaleString('id-ID')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="font-bold text-indigo-700 text-sm">
                            Rp {remainingAmt.toLocaleString('id-ID')}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/90 border border-indigo-200/80 text-indigo-800 font-mono text-xs font-semibold">
                            <span>{member.breakdownSummary || member.depositHistorySummary || '-'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredMembers.length > pageSize && (
          <div className="px-6 py-4 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              Menampilkan {(currentPage - 1) * pageSize + 1} s/d {Math.min(currentPage * pageSize, filteredMembers.length)} dari {filteredMembers.length} data
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Sebelumnya
              </button>
              <span className="font-semibold text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal Eksekusi Pencairan Massal */}
      <BulkDisbursementConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setTargetCycleForExecution(null);
        }}
        onConfirm={handleConfirmDisbursement}
        totalMembers={targetCycleForExecution ? targetCycleForExecution.total_members : (simulation?.totalMembers || 0)}
        totalAmount={targetCycleForExecution ? targetCycleForExecution.total_amount : (simulation?.totalAmount || 0)}
        totalRemaining={targetCycleForExecution ? 0 : (simulation?.totalRemainingAfterDisbursement || 0)}
        isSimulating={isLoadingSimulation}
        isSubmitting={isExecuting}
        error={executionError}
        defaultCycleName={targetCycleForExecution?.cycle_name}
        defaultCutOffDate={
          targetCycleForExecution
            ? (resolveCycleEffectiveDate(targetCycleForExecution) || massCutoffDate)
            : massCutoffDate
        }
        onCutOffDateChange={(nextDate) => {
          if (!targetCycleForExecution && nextDate) {
            setMassCutoffDate(nextDate);
          }
        }}
      />
    </div>
  );
}
