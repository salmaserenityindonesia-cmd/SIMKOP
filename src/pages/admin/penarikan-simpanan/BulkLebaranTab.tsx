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
  History, 
  Landmark, 
  ShieldAlert, 
  Info,
  Clock,
  ArrowUpRight,
  Filter,
  Ban,
  Check
} from 'lucide-react';
import { supabase } from '../../../lib/supabaseClient';
import { 
  bulkWithdrawalService,
  LebaranSimulationSummary,
  LebaranSimulationMember,
  LebaranDisbursementCycle
} from '../../../services/bulkWithdrawalService';
import BulkDisbursementConfirmModal from './BulkDisbursementConfirmModal';

export default function BulkLebaranTab() {
  const [simulation, setSimulation] = useState<LebaranSimulationSummary | null>(null);
  const [lastCycle, setLastCycle] = useState<LebaranDisbursementCycle | null>(null);
  const [cyclesHistory, setCyclesHistory] = useState<LebaranDisbursementCycle[]>([]);
  
  const [isLoadingSimulation, setIsLoadingSimulation] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [loanFilter, setLoanFilter] = useState<'all' | 'with_loan' | 'no_loan'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [targetCycleForExecution, setTargetCycleForExecution] = useState<LebaranDisbursementCycle | null>(null);

  // Load Initial Data
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await Promise.all([
      loadSimulation(),
      loadCyclesData()
    ]);
  };

  const loadSimulation = async () => {
    setIsLoadingSimulation(true);
    setExecutionError(null);
    try {
      const sim = await bulkWithdrawalService.simulateLebaranDisbursement();
      setSimulation(sim);
    } catch (err: any) {
      console.error('Error simulating bulk withdrawal:', err);
      setExecutionError(err.message || 'Gagal menghitung simulasi simpanan lebaran');
    } finally {
      setIsLoadingSimulation(false);
    }
  };

  const loadCyclesData = async () => {
    setIsLoadingHistory(true);
    try {
      const [history, last] = await Promise.all([
        bulkWithdrawalService.getLebaranDisbursementCycles(),
        bulkWithdrawalService.getLastCompletedLebaranCycle()
      ]);
      setCyclesHistory(history);
      setLastCycle(last);
    } catch (err: any) {
      console.error('Error loading disbursement cycles:', err);
    } finally {
      setIsLoadingHistory(false);
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

  // Pagination
  const totalPages = Math.ceil(filteredMembers.length / pageSize) || 1;
  const paginatedMembers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredMembers.slice(start, start + pageSize);
  }, [filteredMembers, currentPage, pageSize]);

  // Handle Export to CSV
  const handleExportCSV = () => {
    if (!simulation?.members || simulation.members.length === 0) return;
    
    const headers = [
      'No',
      'NRP',
      'Nama Anggota',
      'Pangkat',
      'Bank',
      'Nomor Rekening',
      'Saldo Dicairkan (100%)',
      'Saldo Setelah Cair',
      'Status Pinjaman',
      'Sisa Hutang Pinjaman (Rp)'
    ];

    const rows = simulation.members.map((m, idx) => [
      idx + 1,
      `"${m.nrp || ''}"`,
      `"${(m.nama || '').replace(/"/g, '""')}"`,
      `"${(m.pangkat || '').replace(/"/g, '""')}"`,
      `"${(m.bankName || 'Bank BRI').replace(/"/g, '""')}"`,
      `'${m.bankAccount || ''}`,
      m.saldoLebaran,
      0,
      m.hasActiveLoan ? 'Ada Pinjaman Aktif' : 'Bebas Pinjaman',
      m.activeLoanRemaining || 0
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Nominatif_Pencairan_Lebaran_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Open Execution Modal for new cycle or draft
  const handleOpenExecutionModal = (draftCycle?: LebaranDisbursementCycle) => {
    setTargetCycleForExecution(draftCycle || null);
    setExecutionError(null);
    setIsConfirmModalOpen(true);
  };

  // Execute Bulk Disbursement
  const handleConfirmDisbursement = async (payload: {
    cycleName: string;
    cutOffDate: string;
    notes?: string;
  }) => {
    setIsExecuting(true);
    setExecutionError(null);
    setSuccessMessage(null);

    try {
      let currentUserId: string | undefined;
      try {
        const { data: userData } = await supabase.auth.getUser();
        currentUserId = userData?.user?.id;
      } catch (_) {}

      let cycleId = targetCycleForExecution?.id;

      // 1. If not executing existing draft, create draft first
      if (!cycleId) {
        const newCycle = await bulkWithdrawalService.createDisbursementDraft({
          cycleName: payload.cycleName,
          cutOffDate: payload.cutOffDate,
          notes: payload.notes,
          createdBy: currentUserId
        });
        cycleId = newCycle.id;
      }

      // 2. Approve and Execute
      const result = await bulkWithdrawalService.approveAndExecuteDisbursement(cycleId, currentUserId);

      // 3. Update feedback
      setSuccessMessage(
        `Sukses! Siklus "${payload.cycleName}" berhasil dieksekusi (${result.executionMode === 'rpc' ? 'Engine Database Atomik' : 'Proses Terstruktur'}). Total ${result.totalMembers} anggota telah dicairkan senilai Rp ${result.totalAmount.toLocaleString('id-ID')}.`
      );

      // Close modal
      setIsConfirmModalOpen(false);
      setTargetCycleForExecution(null);

      // Reload all data
      await loadAllData();
    } catch (err: any) {
      console.error('Error executing bulk disbursement:', err);
      setExecutionError(err.message || 'Terjadi kesalahan saat memproses pencairan massal simpanan lebaran.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Reject / Cancel a Draft Cycle
  const handleRejectDraft = async (cycleId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin membatalkan draf siklus pencairan ini?')) return;
    try {
      await bulkWithdrawalService.rejectDisbursementDraft(cycleId, 'Dibatalkan oleh admin');
      await loadCyclesData();
    } catch (err: any) {
      alert(err.message || 'Gagal membatalkan draf siklus');
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
                  Siklus Terakhir Dicairkan:{' '}
                  <span className="text-emerald-100 font-bold">
                    {new Date(lastCycle.cut_off_date).toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </span>{' '}
                  ({lastCycle.cycle_name}) — Total{' '}
                  <span className="text-yellow-300 font-bold">
                    Rp {lastCycle.total_amount.toLocaleString('id-ID')}
                  </span>{' '}
                  ({lastCycle.total_members} Anggota)
                </>
              ) : (
                'Belum ada riwayat siklus pencairan massal simpanan lebaran sebelumnya.'
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            disabled={isLoadingSimulation || isLoadingHistory}
            className="px-3.5 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Muat ulang seluruh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSimulation ? 'animate-spin' : ''}`} />
            Segarkan
          </button>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-start justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <p className="text-sm font-semibold">{successMessage}</p>
          </div>
          <button 
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Error Alert */}
      {executionError && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-900 rounded-2xl flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm font-semibold">{executionError}</p>
          </div>
          <button 
            onClick={() => setExecutionError(null)}
            className="text-red-700 hover:text-red-900 text-xs font-bold"
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
            100% Saldo simpanan lebaran dicairkan
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
            Akumulasi setoran simpanan lebaran
          </p>
        </div>
      </div>

      {/* Main Action Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <div className="relative min-w-[260px] flex-1 max-w-md">
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

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-medium">
            <button
              onClick={() => { setLoanFilter('all'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                loanFilter === 'all'
                  ? 'bg-white text-slate-800 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({simulation?.members.length || 0})
            </button>
            <button
              onClick={() => { setLoanFilter('no_loan'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                loanFilter === 'no_loan'
                  ? 'bg-white text-emerald-700 shadow-sm font-bold'
                  : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              Bebas Pinjaman ({simulation?.members.filter(m => !m.hasActiveLoan).length || 0})
            </button>
            <button
              onClick={() => { setLoanFilter('with_loan'); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-lg transition-all ${
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
            onClick={loadSimulation}
            disabled={isLoadingSimulation}
            className="px-4 py-2 border border-slate-200 text-slate-700 font-medium rounded-xl text-sm hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            title="Refresh data nominatif simulasi"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingSimulation ? 'animate-spin' : ''}`} />
            <span>Refresh Simulasi</span>
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!simulation?.members || simulation.members.length === 0}
            className="px-4 py-2 border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold rounded-xl text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>Ekspor Nominatif</span>
          </button>

          <button
            onClick={() => handleOpenExecutionModal()}
            disabled={isLoadingSimulation || !simulation || simulation.totalMembers === 0}
            className="px-5 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl text-sm shadow-sm shadow-red-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Eksekusi Pencairan Massal</span>
          </button>
        </div>
      </div>

      {/* Tabel Daftar Nominatif */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-800 text-base">
              Daftar Nominatif Penerima Pencairan Simpanan Lebaran
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan {filteredMembers.length} dari {simulation?.totalMembers || 0} anggota penerima yang memenuhi syarat
            </p>
          </div>
          {filteredMembers.length > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
              Halaman {currentPage} dari {totalPages}
            </span>
          )}
        </div>

        {isLoadingSimulation ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Sedang memuat data simulasi simpanan lebaran...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Coins className="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-500" />
            <p className="text-base font-semibold text-slate-600">Tidak ada data nominatif</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchQuery || loanFilter !== 'all'
                ? 'Tidak ada anggota yang cocok dengan filter pencarian.'
                : 'Belum ada saldo simpanan lebaran aktif yang siap dicairkan.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">NRP</th>
                  <th className="py-3 px-4">Nama Anggota</th>
                  <th className="py-3 px-4">Bank & Rekening</th>
                  <th className="py-3 px-4 text-right">Saldo Dicairkan (100%)</th>
                  <th className="py-3 px-4 text-center">Saldo Akhir</th>
                  <th className="py-3 px-4">Catatan Pinjaman</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedMembers.map((member, idx) => {
                  const absoluteIndex = (currentPage - 1) * pageSize + idx + 1;
                  return (
                    <tr 
                      key={member.memberId}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3.5 px-4 text-center text-slate-400 text-xs font-mono">
                        {absoluteIndex}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-700">
                        {member.nrp || '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{member.nama}</div>
                        <div className="text-xs text-slate-400">{member.pangkat || 'Anggota'}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <Landmark className="w-3.5 h-3.5 text-slate-400" />
                          <span>{member.bankName}</span>
                        </div>
                        <div className="text-xs text-slate-500 font-mono">
                          {member.bankAccount ? member.bankAccount : (
                            <span className="text-amber-600 italic">Belum ada no rekening</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-600">
                        Rp {member.saldoLebaran.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-xs rounded font-medium">
                          Rp 0
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {member.hasActiveLoan ? (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              Ada Pinjaman (Sisa Rp {member.activeLoanRemaining.toLocaleString('id-ID')})
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-medium">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Bebas Pinjaman</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Menampilkan {paginatedMembers.length} dari {filteredMembers.length} baris
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                Sebelumnya
              </button>
              <span className="text-xs font-semibold px-2 text-slate-700">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabel Riwayat Siklus Pencairan Massal */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Riwayat Siklus Pencairan Massal Simpanan Lebaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Daftar siklus pencairan yang pernah diajukan dan diproses sebelumnya
              </p>
            </div>
          </div>
          <button
            onClick={loadCyclesData}
            disabled={isLoadingHistory}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            Refresh Riwayat
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="py-12 flex justify-center items-center text-slate-400">
            <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cyclesHistory.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Belum ada riwayat siklus pencairan massal lebaran yang tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4">Tanggal Cut-off</th>
                  <th className="py-3 px-4">Nama Siklus</th>
                  <th className="py-3 px-4 text-center">Jumlah Anggota</th>
                  <th className="py-3 px-4 text-right">Total Dana Dicairkan</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cyclesHistory.map((cycle) => {
                  let badge = (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">
                      {cycle.status}
                    </span>
                  );

                  if (cycle.status === 'COMPLETED') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Selesai
                      </span>
                    );
                  } else if (cycle.status === 'APPROVED') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-blue-600" /> Disetujui
                      </span>
                    );
                  } else if (cycle.status === 'DRAFT') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Draf
                      </span>
                    );
                  } else if (cycle.status === 'REJECTED') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-lg">
                        <Ban className="w-3.5 h-3.5 text-red-600" /> Dibatalkan
                      </span>
                    );
                  }

                  return (
                    <tr key={cycle.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-700 text-xs">
                        {cycle.cut_off_date ? new Date(cycle.cut_off_date).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        }) : '-'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-800">
                        {cycle.cycle_name}
                        {cycle.notes && (
                          <div className="text-xs text-slate-400 font-normal">{cycle.notes}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                        {cycle.total_members.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-800">
                        Rp {cycle.total_amount.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {badge}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {cycle.status === 'DRAFT' ? (
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleOpenExecutionModal(cycle)}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              Eksekusi
                            </button>
                            <button
                              onClick={() => handleRejectDraft(cycle.id)}
                              className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Terkunci</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <BulkDisbursementConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => {
          setIsConfirmModalOpen(false);
          setTargetCycleForExecution(null);
        }}
        onConfirm={handleConfirmDisbursement}
        totalMembers={targetCycleForExecution ? targetCycleForExecution.total_members : (simulation?.totalMembers || 0)}
        totalAmount={targetCycleForExecution ? targetCycleForExecution.total_amount : (simulation?.totalAmount || 0)}
        isSubmitting={isExecuting}
        error={executionError}
        defaultCycleName={targetCycleForExecution?.cycle_name}
        defaultCutOffDate={targetCycleForExecution?.cut_off_date}
      />
    </div>
  );
}
