import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ensureDailyOpnameAssignments,
  getActiveCycleProgress,
  getLocalDateStr,
  getOperatorOpnameKpis,
  getOpnameComparisonList,
  getOpnameOperators,
  requestTaskRecount,
  resolveBulkZeroVarianceTasks,
  resolveOpnameTask,
  type OperatorKpiRow,
  type OpnameComparisonRow,
  type OpnameCycleProgress,
  type OpnameOperator,
  type OpnameResolutionChoice,
} from '../../services/stockOpnameService';
import { formatCurrency } from '../../utils/formatCurrency';

const getDaysAgoDateStr = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return getLocalDateStr(d);
};

const getMonthStartStr = (): string => {
  const d = new Date();
  return getLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

const formatDateTimeId = (iso?: string | null): string => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function TaskStatusBadge({ row }: { row: OpnameComparisonRow }) {
  switch (row.status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
          <Clock className="w-3 h-3" />
          Menunggu Hitung
        </span>
      );
    case 'counted':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800">
          <ClipboardCheck className="w-3 h-3" />
          Sudah Dihitung
        </span>
      );
    case 'recount_requested':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
          <RotateCcw className="w-3 h-3" />
          Menunggu Re-Count
        </span>
      );
    case 'recounted':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">
          <RotateCcw className="w-3 h-3" />
          Hasil Re-Count Siap
        </span>
      );
    case 'resolved':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Disahkan (
          {row.resolution_choice === 'use_system'
            ? 'Sistem'
            : row.resolution_choice === 'use_recount'
              ? 'Re-Count'
              : 'Pengamatan'}
          )
        </span>
      );
  }
}

export default function StockOpnameAudit() {
  const { showToast } = useFeedback();
  const [activeTab, setActiveTab] = useState<'audit' | 'kpi'>('audit');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  // Shared Date Range & Filters
  const [startDate, setStartDate] = useState<string>(() => getDaysAgoDateStr(14));
  const [endDate, setEndDate] = useState<string>(() => getLocalDateStr());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operatorFilter, setOperatorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data States
  const [operators, setOperators] = useState<OpnameOperator[]>([]);
  const [cycleProgress, setCycleProgress] = useState<OpnameCycleProgress | null>(null);
  const [comparisonRows, setComparisonRows] = useState<OpnameComparisonRow[]>([]);
  const [kpiRows, setKpiRows] = useState<OperatorKpiRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isBulkApproving, setIsBulkApproving] = useState<boolean>(false);

  // Re-Count Modal State
  const [recountModalRow, setRecountModalRow] = useState<OpnameComparisonRow | null>(null);
  const [recountMode, setRecountMode] = useState<'assign_operator' | 'admin_direct'>('assign_operator');
  const [selectedRecountOperatorId, setSelectedRecountOperatorId] = useState<string>('');
  const [adminRecountQty, setAdminRecountQty] = useState<string>('');
  const [recountNotes, setRecountNotes] = useState<string>('');
  const [isSubmittingRecount, setIsSubmittingRecount] = useState<boolean>(false);

  // Decision Confirmation Modal State
  const [confirmDecision, setConfirmDecision] = useState<{
    row: OpnameComparisonRow;
    choice: OpnameResolutionChoice;
  } | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<string>('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState<boolean>(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.id) {
        setCurrentUserId(data.user.id);
      }
    });
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ops, progress, comparisons, kpis] = await Promise.all([
        getOpnameOperators(),
        getActiveCycleProgress(),
        getOpnameComparisonList({
          startDate,
          endDate,
          status: statusFilter,
          operatorId: operatorFilter,
        }),
        getOperatorOpnameKpis(startDate, endDate),
      ]);
      setOperators(ops);
      setCycleProgress(progress);
      setComparisonRows(comparisons);
      setKpiRows(kpis);
    } catch (err: any) {
      showToast(err?.message || 'Gagal memuat data audit stock opname', 'error');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, statusFilter, operatorFilter, showToast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleSyncAssignments = async () => {
    setIsSyncing(true);
    try {
      const res = await ensureDailyOpnameAssignments();
      showToast(
        `Sinkronisasi selesai: ${res.assignedCount} tugas baru dijadwalkan & ${res.deferredCount} tugas tertunda dialihkan (Siklus #${res.cycleNumber}).`,
        'success'
      );
      await fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyinkronkan penugasan harian', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredComparisonRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return comparisonRows;
    return comparisonRows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.product_name.toLowerCase().includes(q) ||
        r.category_group.toLowerCase().includes(q) ||
        r.assigned_operator_name.toLowerCase().includes(q)
    );
  }, [comparisonRows, searchQuery]);

  const summary = useMemo(() => {
    const awaitingVerification = comparisonRows.filter(
      (r) => r.status === 'counted' || r.status === 'recounted'
    );
    const zeroVarianceReady = awaitingVerification.filter(
      (r) => r.status === 'counted' && r.variance_at_count === 0
    );
    const discrepancyReady = awaitingVerification.filter(
      (r) =>
        (r.status === 'counted' && r.variance_at_count !== 0) ||
        r.status === 'recounted'
    );
    const recountRequested = comparisonRows.filter(
      (r) => r.status === 'recount_requested'
    );
    const totalPendingCount = comparisonRows.filter((r) => r.status === 'pending');

    return {
      awaitingVerificationCount: awaitingVerification.length,
      zeroVarianceIds: zeroVarianceReady.map((r) => r.id),
      zeroVarianceCount: zeroVarianceReady.length,
      discrepancyCount: discrepancyReady.length,
      recountRequestedCount: recountRequested.length,
      pendingCount: totalPendingCount.length,
    };
  }, [comparisonRows]);

  const handleBulkApproveZeroVariance = async () => {
    if (summary.zeroVarianceIds.length === 0) return;
    setIsBulkApproving(true);
    try {
      const count = await resolveBulkZeroVarianceTasks(
        summary.zeroVarianceIds,
        currentUserId
      );
      showToast(`${count} item dengan selisih 0 berhasil disahkan.`, 'success');
      await fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengesahkan item selisih 0', 'error');
    } finally {
      setIsBulkApproving(false);
    }
  };

  const handleOpenRecountModal = (row: OpnameComparisonRow) => {
    setRecountModalRow(row);
    const peer = operators.find((o) => o.id !== row.assigned_operator_id);
    setSelectedRecountOperatorId(peer?.id || operators[0]?.id || '');
    setAdminRecountQty(
      row.recount_qty !== null
        ? String(row.recount_qty)
        : row.observed_qty !== null
          ? String(row.observed_qty)
          : ''
    );
    setRecountMode('assign_operator');
    setRecountNotes(row.notes || '');
  };

  const handleSubmitRecountModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recountModalRow) return;
    setIsSubmittingRecount(true);
    try {
      if (recountMode === 'assign_operator') {
        if (!selectedRecountOperatorId) {
          showToast('Pilih operator pengusul re-count terlebih dahulu.', 'warning');
          return;
        }
        await requestTaskRecount(
          recountModalRow.id,
          selectedRecountOperatorId,
          recountNotes
        );
        showToast('Permintaan Re-Count berhasil dikirim ke operator terpilih.', 'success');
      } else {
        const qty = Math.round(Number(adminRecountQty));
        if (!Number.isFinite(qty) || qty < 0) {
          showToast('Masukkan angka fisik hasil verifikasi ulang yang valid (>= 0).', 'warning');
          return;
        }
        await resolveOpnameTask({
          taskId: recountModalRow.id,
          choice: 'use_recount',
          resolvedBy: currentUserId,
          adminRecountQty: qty,
          notes: recountNotes,
        });
        showToast('Verifikasi ulang Admin disahkan sebagai angka kebenaran akhir.', 'success');
      }
      setRecountModalRow(null);
      await fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Gagal memproses re-count', 'error');
    } finally {
      setIsSubmittingRecount(false);
    }
  };

  const handleExecuteDecision = async () => {
    if (!confirmDecision) return;
    setIsSubmittingDecision(true);
    try {
      await resolveOpnameTask({
        taskId: confirmDecision.row.id,
        choice: confirmDecision.choice,
        resolvedBy: currentUserId,
        notes: decisionNotes || confirmDecision.row.notes || undefined,
      });
      showToast(
        confirmDecision.choice === 'use_system'
          ? 'Keputusan "Pakai Angka Sistem" berhasil disahkan.'
          : 'Penyesuaian stok opname berhasil disahkan & dicatat ke Mutasi + SHU.',
        'success'
      );
      setConfirmDecision(null);
      setDecisionNotes('');
      await fetchAll();
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengesahkan keputusan rekonsiliasi', 'error');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  const cyclePct =
    cycleProgress && cycleProgress.totalActiveProducts > 0
      ? Math.min(
          100,
          Math.round((cycleProgress.assignedInCycle / cycleProgress.totalActiveProducts) * 100)
        )
      : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                Perpetual Cycle Counting
              </span>
              {cycleProgress && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Siklus #{cycleProgress.cycleNumber} • {cycleProgress.assignedInCycle}/
                  {cycleProgress.totalActiveProducts} SKU Tersapu ({cyclePct}%)
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Audit Stock Opname Harian, Re-Count &amp; KPI Operator
            </h1>
            <p className="text-sm text-slate-500 max-w-3xl">
              Bandingkan hasil hitung fisik blind count operator terhadap snapshot stok sistem dan mutasi transaksi pasca-hitung, sahkan penyesuaian ke mutasi gudang &amp; SHU, serta pantau skor KPI operator otomatis.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleSyncAssignments}
              disabled={isSyncing || loading}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Tugas Hari Ini'}</span>
            </button>
            <button
              type="button"
              onClick={fetchAll}
              disabled={loading}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>Komparasi &amp; Rekonsiliasi Selisih</span>
              {summary.awaitingVerificationCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950">
                  {summary.awaitingVerificationCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kpi')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === 'kpi'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Award className="w-4 h-4" />
              <span>Evaluasi &amp; Peringkat KPI Operator</span>
            </button>
          </div>

          {/* Shared Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-slate-700 text-xs"
            />
            <span className="text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2 py-1 rounded border border-slate-200 text-slate-700 text-xs"
            />
            <button
              type="button"
              onClick={() => {
                setStartDate(getLocalDateStr());
                setEndDate(getLocalDateStr());
              }}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => {
                setStartDate(getMonthStartStr());
                setEndDate(getLocalDateStr());
              }}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium cursor-pointer"
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════
            TAB 1: KOMPARASI & KEPUTUSAN SELISIH
           ══════════════════════════════════════════════════ */}
        {activeTab === 'audit' && (
          <div className="space-y-5">
            {/* 4 Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-sky-500 shadow-2xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Menunggu Verifikasi Admin
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-2">
                  {summary.awaitingVerificationCount}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  +{summary.pendingCount} masih antre dihitung operator
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-emerald-500 shadow-2xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Cocok (Selisih 0)
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-2">
                  {summary.zeroVarianceCount}
                </div>
                <div className="text-xs text-emerald-700/80 mt-1">
                  Siap disahkan massal tanpa ubah stok
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-rose-500 shadow-2xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Selisih Perlu Keputusan
                </div>
                <div className="text-2xl font-bold text-rose-700 mt-2">
                  {summary.discrepancyCount}
                </div>
                <div className="text-xs text-rose-700/80 mt-1">
                  Pilih Sistem, Pengamatan, atau Re-Count
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 border-l-4 border-l-amber-500 shadow-2xs">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Dalam Pemeriksaan Ulang
                </div>
                <div className="text-2xl font-bold text-amber-700 mt-2">
                  {summary.recountRequestedCount}
                </div>
                <div className="text-xs text-amber-700/80 mt-1">
                  Menunggu hasil hitung pengusul ulang
                </div>
              </div>
            </div>

            {/* Filter & Bulk Action Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5 flex-1">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari SKU, Nama Produk, Kategori, Operator..."
                    className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-teal-500 focus:bg-white"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
                >
                  <option value="all">Semua Status</option>
                  <option value="counted">Sudah Dihitung (Butuh Audit)</option>
                  <option value="recount_requested">Menunggu Re-Count</option>
                  <option value="recounted">Hasil Re-Count Siap</option>
                  <option value="pending">Belum Dihitung</option>
                  <option value="resolved">Sudah Disahkan</option>
                </select>

                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  className="px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
                >
                  <option value="all">Semua Operator</option>
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.nama}
                    </option>
                  ))}
                </select>
              </div>

              {summary.zeroVarianceCount > 0 && (
                <button
                  type="button"
                  onClick={handleBulkApproveZeroVariance}
                  disabled={isBulkApproving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>
                    {isBulkApproving
                      ? 'Mengesahkan...'
                      : `Sahkan ${summary.zeroVarianceCount} Item Cocok (Selisih 0)`}
                  </span>
                </button>
              )}
            </div>

            {/* Comparison Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {loading ? (
                <div className="py-20 text-center text-slate-500 text-sm">
                  <Loader2 className="w-8 h-8 animate-spin text-teal-600 mx-auto mb-2" />
                  <p>Memuat data komparasi stok dan mutasi berjalan...</p>
                </div>
              ) : filteredComparisonRows.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">
                    Belum ada catatan opname pada rentang tanggal ini
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Klik &ldquo;Sinkronkan Tugas Hari Ini&rdquo; atau tunggu operator membuka shift kasir.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Jadwal &amp; Jam Hitung</th>
                        <th className="px-4 py-3">Operator</th>
                        <th className="px-4 py-3">Produk &amp; Kategori</th>
                        <th className="px-4 py-3 text-right">Sistem Saat Hitung</th>
                        <th className="px-4 py-3 text-right">Pengamatan Fisik</th>
                        <th className="px-4 py-3 text-right">Selisih Murni</th>
                        <th className="px-4 py-3">Mutasi Pasca-Hitung</th>
                        <th className="px-4 py-3 text-right">Stok Sekarang</th>
                        <th className="px-4 py-3 text-right">Dampak HPP</th>
                        <th className="px-4 py-3 text-center">Keputusan Admin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredComparisonRows.map((row) => {
                        const mut = row.mutations_since_count;
                        const activeVariance =
                          row.status === 'resolved'
                            ? row.applied_delta
                            : row.recount_variance !== null
                              ? row.recount_variance
                              : row.variance_at_count;

                        const canResolve =
                          row.status === 'counted' ||
                          row.status === 'recounted' ||
                          row.status === 'recount_requested';

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/70 align-top">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="font-semibold text-slate-800">{row.scheduled_date}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {row.counted_at
                                  ? `Hitung: ${formatDateTimeId(row.counted_at)}`
                                  : 'Belum dihitung'}
                              </div>
                              <div className="mt-1.5">
                                <TaskStatusBadge row={row} />
                              </div>
                            </td>

                            <td className="px-4 py-3">
                              <div className="font-semibold text-slate-800">
                                {row.assigned_operator_name}
                              </div>
                              {row.reassigned_from_operator_name && (
                                <div className="text-[11px] text-sky-700 mt-0.5">
                                  Alihan dari: {row.reassigned_from_operator_name}
                                </div>
                              )}
                              {row.recount_operator_name && (
                                <div className="text-[11px] text-purple-700 mt-0.5">
                                  Re-Count: {row.recount_operator_name}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 min-w-[200px]">
                              <div className="font-semibold text-slate-900">{row.product_name}</div>
                              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                  {row.sku}
                                </span>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
                                  {row.category_group}
                                </span>
                              </div>
                              {row.notes && (
                                <div className="text-[11px] text-slate-500 italic mt-1">
                                  &ldquo;{row.notes}&rdquo;
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-700 whitespace-nowrap">
                              {row.system_stock_snapshot !== null
                                ? `${row.system_stock_snapshot} ${row.unit}`
                                : '-'}
                              {row.recount_system_snapshot !== null && (
                                <div className="text-[11px] font-normal text-purple-700 mt-0.5">
                                  Saat Re-Count: {row.recount_system_snapshot}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                              {row.observed_qty !== null ? `${row.observed_qty} ${row.unit}` : '-'}
                              {row.recount_qty !== null && (
                                <div className="text-[11px] font-bold text-purple-700 mt-0.5">
                                  Re-Count: {row.recount_qty} {row.unit}
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                              {activeVariance === null ? (
                                <span className="text-slate-400">-</span>
                              ) : activeVariance === 0 ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                                  0 (Cocok)
                                </span>
                              ) : activeVariance > 0 ? (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800">
                                  <TrendingUp className="w-3 h-3" />+{activeVariance}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                                  <TrendingDown className="w-3 h-3" />
                                  {activeVariance}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 min-w-[170px]">
                              {!row.counted_at ? (
                                <span className="text-slate-400 text-[11px]">-</span>
                              ) : mut.pembelian === 0 &&
                                mut.pengganti_retur === 0 &&
                                mut.penjualan === 0 &&
                                mut.retur_supplier === 0 ? (
                                <span className="text-[11px] text-slate-400">
                                  Tidak ada mutasi pasca-hitung
                                </span>
                              ) : (
                                <div className="space-y-0.5 text-[11px]">
                                  {mut.pembelian > 0 && (
                                    <div className="text-emerald-700 font-medium">
                                      +Beli: +{mut.pembelian}
                                    </div>
                                  )}
                                  {mut.pengganti_retur > 0 && (
                                    <div className="text-sky-700 font-medium">
                                      +Pengganti: +{mut.pengganti_retur}
                                    </div>
                                  )}
                                  {mut.penjualan > 0 && (
                                    <div className="text-rose-700 font-medium">
                                      -Jual POS: -{mut.penjualan}
                                    </div>
                                  )}
                                  {mut.retur_supplier > 0 && (
                                    <div className="text-amber-700 font-medium">
                                      -Retur: -{mut.retur_supplier}
                                    </div>
                                  )}
                                  <div className="font-bold text-slate-700 pt-0.5 border-t border-slate-100">
                                    Net: {mut.netDeltaSinceCount >= 0 ? `+${mut.netDeltaSinceCount}` : mut.netDeltaSinceCount}
                                  </div>
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                              <div className="font-bold text-slate-900">
                                {row.current_system_stock} {row.unit}
                              </div>
                              {row.status !== 'resolved' &&
                                row.projected_stock_if_observed !== null && (
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    Proyeksi fisik:{' '}
                                    <strong className="text-indigo-700">
                                      {row.projected_stock_if_recount ??
                                        row.projected_stock_if_observed}
                                    </strong>
                                  </div>
                                )}
                            </td>

                            <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                              {row.estimated_variance_value === 0 ? (
                                <span className="text-slate-400 text-xs">Rp 0</span>
                              ) : (
                                <span
                                  className={`font-bold text-xs ${
                                    row.estimated_variance_value > 0
                                      ? 'text-emerald-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {row.estimated_variance_value > 0 ? '+' : ''}
                                  {formatCurrency(row.estimated_variance_value)}
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {row.status === 'resolved' ? (
                                <div className="text-center text-[11px] text-emerald-700 font-semibold">
                                  Final: {row.final_approved_qty} {row.unit}
                                  <div className="text-[10px] text-slate-400 font-normal">
                                    {formatDateTimeId(row.resolved_at)}
                                  </div>
                                </div>
                              ) : !canResolve ? (
                                <div className="text-center text-[11px] text-slate-400">
                                  Menunggu input kasir
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5 min-w-[150px]">
                                  {row.observed_qty !== null && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDecisionNotes('');
                                        setConfirmDecision({ row, choice: 'use_system' });
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
                                    >
                                      Pakai Angka Sistem
                                    </button>
                                  )}
                                  {row.recount_qty !== null ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDecisionNotes('');
                                        setConfirmDecision({ row, choice: 'use_recount' });
                                      }}
                                      className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                                    >
                                      Sahkan Hasil Re-Count
                                    </button>
                                  ) : (
                                    row.observed_qty !== null && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDecisionNotes('');
                                          setConfirmDecision({ row, choice: 'use_observed' });
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                                      >
                                        Pakai Angka Pengamatan
                                      </button>
                                    )
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRecountModal(row)}
                                    className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold transition-colors cursor-pointer"
                                  >
                                    Hitung Ulang (Re-Count)
                                  </button>
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
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB 2: KPI OPERATOR OTOMATIS
           ══════════════════════════════════════════════════ */}
        {activeTab === 'kpi' && (
          <div className="space-y-5">
            {/* Formula Banner */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                  <UserCheck className="w-4 h-4" />
                  <span>Formula Penilaian KPI Operator Otomatis</span>
                </div>
                <h2 className="text-lg font-bold">
                  Papan Peringkat Kualitas &amp; Kedisiplinan Stock Opname
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl">
                  Skor dihitung otomatis dari rekaman pengesahan Admin (Ground Truth) dan log kehadiran shift kasir pada periode terpilih.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs shrink-0">
                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 font-semibold">
                  Akurasi: <strong className="text-emerald-300">60%</strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 font-semibold">
                  Disiplin Kuota: <strong className="text-sky-300">25%</strong>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 font-semibold">
                  Temuan Valid: <strong className="text-amber-300">15%</strong>
                </span>
              </div>
            </div>

            {/* KPI Leaderboard Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              {loading ? (
                <div className="py-20 text-center text-slate-500 text-sm">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-2" />
                  <p>Menghitung KPI operator...</p>
                </div>
              ) : kpiRows.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  <Award className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="font-semibold text-slate-700">
                    Belum ada operator terdaftar untuk dinilai
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-4 py-3 w-14 text-center">Rank</th>
                        <th className="px-4 py-3">Nama Operator</th>
                        <th className="px-4 py-3 text-right">Tugas Terjadwal</th>
                        <th className="px-4 py-3 text-right">Selesai Tepat Waktu</th>
                        <th className="px-4 py-3 text-right">Temuan Valid / Lapor</th>
                        <th className="px-4 py-3 text-right">Akurasi (60%)</th>
                        <th className="px-4 py-3 text-right">Disiplin (25%)</th>
                        <th className="px-4 py-3 text-right">Temuan (15%)</th>
                        <th className="px-4 py-3 text-right">Skor KPI Akhir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kpiRows.map((kpi, idx) => (
                        <tr key={kpi.operator_id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3.5 text-center font-bold">
                            <span
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs ${
                                idx === 0
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : idx === 1
                                    ? 'bg-slate-200 text-slate-800'
                                    : idx === 2
                                      ? 'bg-orange-100 text-orange-800'
                                      : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              #{idx + 1}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-slate-900">{kpi.operator_name}</div>
                            <div className="text-[11px] text-slate-500">
                              Audit Disahkan: {kpi.resolved_primary_count} • Re-Count: {kpi.recount_completed_count}
                              {kpi.reassigned_away_count > 0 && ` • Dialihkan saat libur: ${kpi.reassigned_away_count}`}
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-medium text-slate-700">
                            {kpi.total_scheduled_tasks} SKU
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-sky-700">
                            {kpi.completed_on_time_count} / {kpi.total_scheduled_tasks}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            <span className="font-semibold text-emerald-700">
                              {kpi.verified_real_findings_count}
                            </span>{' '}
                            <span className="text-slate-400">/ {kpi.reported_discrepancies_count}</span>
                            {kpi.missed_discrepancy_count > 0 && (
                              <div className="text-[10px] text-rose-600">
                                Terlewat: {kpi.missed_discrepancy_count}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">
                            {kpi.accuracy_score.toFixed(1)}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">
                            {kpi.discipline_score.toFixed(1)}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-slate-800">
                            {kpi.discovery_score.toFixed(1)}
                          </td>
                          <td className="px-4 py-3.5 text-right tabular-nums">
                            <span
                              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                kpi.total_kpi_score >= 85
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : kpi.total_kpi_score >= 70
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {kpi.total_kpi_score.toFixed(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Re-Count / Pemeriksaan Ulang */}
      {recountModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold">Pemeriksaan Ulang (Re-Count / Pengusul Baru)</h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {recountModalRow.product_name} ({recountModalRow.sku})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRecountModalRow(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitRecountModal} className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Sistem Saat Hitung</span>
                  <strong className="text-slate-900">
                    {recountModalRow.system_stock_snapshot ?? '-'} {recountModalRow.unit}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Pengamatan #1</span>
                  <strong className="text-slate-900">
                    {recountModalRow.observed_qty ?? '-'} {recountModalRow.unit}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Stok Sekarang</span>
                  <strong className="text-indigo-700">
                    {recountModalRow.current_system_stock} {recountModalRow.unit}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecountMode('assign_operator')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    recountMode === 'assign_operator'
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Tugaskan ke Operator Pengusul Baru
                </button>
                <button
                  type="button"
                  onClick={() => setRecountMode('admin_direct')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    recountMode === 'admin_direct'
                      ? 'border-purple-600 bg-purple-50 text-purple-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Input Hasil Re-Count Langsung (Admin)
                </button>
              </div>

              {recountMode === 'assign_operator' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Pilih Operator Pemeriksa Ulang
                  </label>
                  <select
                    value={selectedRecountOperatorId}
                    onChange={(e) => setSelectedRecountOperatorId(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-xl bg-white"
                  >
                    {operators.map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.nama}
                        {op.id === recountModalRow.assigned_operator_id ? ' (Pengamat Pertama)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Jumlah Fisik Verifikasi Akhir Sekarang ({recountModalRow.unit})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={adminRecountQty}
                    onChange={(e) => setAdminRecountQty(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-bold border border-slate-300 rounded-xl"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Angka ini langsung menjadi ground truth akhir untuk menetapkan stok final dan mengevaluasi akurasi pengamat pertama.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan Audit / Re-Count
                </label>
                <textarea
                  rows={2}
                  value={recountNotes}
                  onChange={(e) => setRecountNotes(e.target.value)}
                  placeholder="Alasan pemeriksaan ulang atau temuan di gudang..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRecountModalRow(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRecount}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingRecount
                    ? 'Memproses...'
                    : recountMode === 'assign_operator'
                      ? 'Kirim Tugas Re-Count'
                      : 'Sahkan Angka Re-Count'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Pengesahan Keputusan */}
      {confirmDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm sm:text-base font-bold">
                  Konfirmasi Keputusan Rekonsiliasi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDecision(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs sm:text-sm">
              <p className="text-slate-700">
                Anda akan mengesahkan keputusan{' '}
                <strong className="text-slate-900">
                  {confirmDecision.choice === 'use_system'
                    ? 'Pakai Angka Sistem'
                    : confirmDecision.choice === 'use_recount'
                      ? 'Sahkan Hasil Re-Count'
                      : 'Pakai Angka Pengamatan Operator'}
                </strong>{' '}
                untuk produk <strong>{confirmDecision.row.product_name}</strong>.
              </p>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Stok Sistem Sekarang:</span>
                  <strong className="text-slate-800">
                    {confirmDecision.row.current_system_stock} {confirmDecision.row.unit}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Penyesuaian Delta Opname:</span>
                  <strong className="text-indigo-700">
                    {(() => {
                      const delta =
                        confirmDecision.choice === 'use_system'
                          ? 0
                          : confirmDecision.choice === 'use_recount'
                            ? confirmDecision.row.recount_variance ?? 0
                            : confirmDecision.row.variance_at_count ?? 0;
                      return `${delta > 0 ? `+${delta}` : delta} ${confirmDecision.row.unit}`;
                    })()}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Proyeksi Stok Setelah Disahkan:</span>
                  <strong className="text-emerald-700">
                    {(() => {
                      const delta =
                        confirmDecision.choice === 'use_system'
                          ? 0
                          : confirmDecision.choice === 'use_recount'
                            ? confirmDecision.row.recount_variance ?? 0
                            : confirmDecision.row.variance_at_count ?? 0;
                      return `${Math.max(0, confirmDecision.row.current_system_stock + delta)} ${confirmDecision.row.unit}`;
                    })()}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Pengesahan (Opsional)
                </label>
                <input
                  type="text"
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  placeholder="Misal: Disetujui setelah cek kartu stok"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setConfirmDecision(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={isSubmittingDecision}
                  onClick={handleExecuteDecision}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingDecision ? 'Menyimpan...' : 'Ya, Sahkan Keputusan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
