import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Search,
  Eye,
  X,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Database,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  scanAllOrphanRecords,
  deleteOrphanRecords,
  syncUnreceiptedInstallments,
  buildOrphanScanSummary,
  type OrphanRecordItem,
  type OrphanModuleCategory,
} from '../../services/orphanAuditService';

export interface AuditDataOrphanProps {
  initialItems?: OrphanRecordItem[];
  initialScannedAt?: string;
  skipInitialScan?: boolean;
}

const MODULE_OPTIONS: Array<'ALL' | OrphanModuleCategory> = [
  'ALL',
  'Angsuran Tanpa Kwitansi/Kas',
  'Arus Kas Pinjaman',
  'Arus Kas Simpanan',
  'Arus Kas Retail/Bon',
  'Kontrak Pinjaman',
  'Rekening Simpanan',
  'Jadwal Angsuran',
  'Pembayaran Angsuran',
  'Transaksi Simpanan',
];

function formatAuditDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).slice(0, 10) || '-';
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AuditDataOrphan({
  initialItems,
  initialScannedAt,
  skipInitialScan = false,
}: AuditDataOrphanProps = {}) {
  const { showToast } = useFeedback();
  const inRouter = useInRouterContext();

  const [items, setItems] = useState<OrphanRecordItem[]>(initialItems ?? []);
  const [scannedAt, setScannedAt] = useState<string>(initialScannedAt ?? '');
  const [loading, setLoading] = useState<boolean>(
    initialItems === undefined && !skipInitialScan
  );
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const [moduleFilter, setModuleFilter] = useState<'ALL' | OrphanModuleCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [detailItem, setDetailItem] = useState<OrphanRecordItem | null>(null);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<OrphanRecordItem[] | null>(null);
  const [pendingSyncItems, setPendingSyncItems] = useState<OrphanRecordItem[] | null>(null);

  const runScan = useCallback(async () => {
    setLoading(true);
    try {
      const result = await scanAllOrphanRecords();
      setItems(result.items);
      setScannedAt(result.scannedAt);
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error('Gagal memindai data orphan:', err);
      showToast(
        'Gagal memindai data orphan: ' + (err?.message || 'Terjadi kesalahan sistem'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (initialItems === undefined && !skipInitialScan) {
      runScan();
    }
  }, [initialItems, skipInitialScan, runScan]);

  const summary = useMemo(() => buildOrphanScanSummary(items), [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (moduleFilter !== 'ALL' && item.moduleCategory !== moduleFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.referenceCode.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.reason.toLowerCase().includes(q) ||
        item.missingTarget.toLowerCase().includes(q) ||
        item.sourceTable.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q)
      );
    });
  }, [items, moduleFilter, searchQuery]);

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const item of filteredItems) {
          next.delete(item.id);
        }
      } else {
        for (const item of filteredItems) {
          next.add(item.id);
        }
      }
      return next;
    });
  };

  const toggleSelectRow = (id: string) => {
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

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const selectedDeleteItems = useMemo(
    () =>
      selectedItems.filter(
        (item) => (item.anomalyType ?? 'orphan_delete') === 'orphan_delete'
      ),
    [selectedItems]
  );

  const selectedSyncItems = useMemo(
    () =>
      selectedItems.filter(
        (item) => item.anomalyType === 'missing_receipt_and_cashflow'
      ),
    [selectedItems]
  );

  const pendingSyncSummary = useMemo(() => {
    const targetItems = pendingSyncItems ?? [];
    let totalAmount = 0;
    let receiptsToCreate = 0;
    let cashFlowsToCreate = 0;

    for (const item of targetItems) {
      totalAmount += Number(item.amount || 0);
      if (item.rawRecord?.hasReceipt !== true) receiptsToCreate += 1;
      if (item.rawRecord?.hasCashFlow !== true) cashFlowsToCreate += 1;
    }

    return {
      totalItems: targetItems.length,
      totalAmount,
      receiptsToCreate,
      cashFlowsToCreate,
    };
  }, [pendingSyncItems]);

  const pendingDeleteSummary = useMemo(() => {
    const targetItems = pendingDeleteItems ?? [];
    return buildOrphanScanSummary(targetItems);
  }, [pendingDeleteItems]);

  const handleConfirmSync = async () => {
    if (!pendingSyncItems || pendingSyncItems.length === 0) return;
    setIsSyncing(true);
    try {
      const res = await syncUnreceiptedInstallments(pendingSyncItems);
      if (res.errors.length > 0) {
        showToast(
          `Sebagian sinkronisasi gagal: ${res.errors.join('; ')}`,
          res.syncedCount > 0 ? 'warning' : 'error'
        );
      } else {
        showToast(
          `Berhasil menyinkronkan ${res.syncedCount} angsuran (${res.createdReceiptsCount} kwitansi & ${res.createdCashFlowsCount} arus kas).`,
          'success'
        );
      }
      setPendingSyncItems(null);
      await runScan();
    } catch (err: any) {
      showToast(
        'Gagal menyinkronkan angsuran: ' + (err?.message || 'Kesalahan sistem'),
        'error'
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteItems || pendingDeleteItems.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await deleteOrphanRecords(pendingDeleteItems);
      if (res.errors.length > 0) {
        showToast(
          `Sebagian penghapusan gagal: ${res.errors.join('; ')}`,
          res.deletedCount > 0 ? 'warning' : 'error'
        );
      } else {
        showToast(
          `Berhasil menghapus ${res.deletedCount} data orphan dari database.`,
          'success'
        );
      }
      setPendingDeleteItems(null);
      await runScan();
    } catch (err: any) {
      showToast(
        'Gagal menghapus data orphan: ' + (err?.message || 'Kesalahan sistem'),
        'error'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header & Primary Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {inRouter ? (
                <Link
                  to="/admin/laporan-keuangan"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Laporan Keuangan
                </Link>
              ) : (
                <a
                  href="/admin/laporan-keuangan"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-primary transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Laporan Keuangan
                </a>
              )}
              <span className="text-slate-300">/</span>
              <span className="text-xs font-semibold text-rose-600">Audit Integritas Referensi</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-rose-600 shrink-0" />
              Verifikasi &amp; Audit Data Orphan
            </h1>
            <p className="text-sm text-slate-600">
              Deteksi mutasi arus kas, pinjaman, dan simpanan yang kehilangan referensi induk di database
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {scannedAt && (
              <span className="text-xs text-slate-500 bg-slate-100 px-3 py-2 rounded-lg border border-slate-200">
                Terakhir dipindai: <strong className="text-slate-700">{formatAuditDate(scannedAt)}</strong>
              </span>
            )}
            <button
              type="button"
              onClick={runScan}
              disabled={loading || isDeleting || isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Pindai Ulang Sekarang
            </button>
            {(summary.missingSyncCount > 0 || selectedSyncItems.length > 0) && (
              <button
                type="button"
                onClick={() => setPendingSyncItems(selectedSyncItems)}
                disabled={selectedSyncItems.length === 0 || isSyncing || isDeleting}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                Sinkronkan Terpilih ({selectedSyncItems.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setPendingDeleteItems(selectedDeleteItems)}
              disabled={selectedDeleteItems.length === 0 || isDeleting || isSyncing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih ({selectedDeleteItems.length})
            </button>
          </div>
        </div>

        {/* 4-Column Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Data Orphan Ditemukan
              </span>
              {summary.totalCount === 0 ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Database Bersih &amp; Sinkron
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Perlu Perhatian Admin
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-900">{summary.totalCount}</span>
              <span className="text-xs text-slate-500">baris temuan lintas modul</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Angsuran Belum Tersinkron
              </span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-extrabold text-emerald-700">
                  {summary.missingSyncCount}
                </span>
                <span className="text-xs text-slate-500">
                  periode ({formatCurrency(summary.missingSyncAmount)})
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Angsuran lunas tanpa kwitansi / arus kas
                </p>
                {summary.missingSyncCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setModuleFilter('Angsuran Tanpa Kwitansi/Kas')}
                    className="text-[11px] font-semibold text-emerald-700 hover:underline shrink-0 cursor-pointer"
                  >
                    Filter
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Dampak Kas Masuk Orphan
              </span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <ArrowDownLeft className="w-4 h-4" />
              </span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-emerald-700">
                {formatCurrency(summary.cashInImpact)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Menggelembungkan total kas masuk &amp; saldo brankas
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Dampak Kas Keluar Orphan
              </span>
              <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <ArrowUpRight className="w-4 h-4" />
              </span>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-rose-700">
                {formatCurrency(summary.cashOutImpact)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Mengurangi total saldo kas secara semu
              </p>
            </div>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-400" />
                <label htmlFor="orphan-module-filter" className="text-xs font-semibold text-slate-600">
                  Kategori Modul:
                </label>
                <select
                  id="orphan-module-filter"
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value as 'ALL' | OrphanModuleCategory)}
                  className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  {MODULE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt === 'ALL' ? 'Semua Modul' : opt}
                    </option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-500">
                Menampilkan <strong>{filteredItems.length}</strong> dari{' '}
                <strong>{items.length}</strong> temuan
              </span>
            </div>

            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode referensi CF-..., LOAN-..., atau deskripsi..."
                aria-label="Cari data orphan"
                className="w-full pl-9 pr-8 py-2 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Audit Table */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
              <p className="text-sm font-medium">Memindai integritas referensi lintas modul...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Tidak Ditemukan Data Orphan — Seluruh Referensi Database Valid
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Seluruh mutasi arus kas, kontrak pinjaman, jadwal angsuran, dan rekening simpanan memiliki referensi induk yang konsisten.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="py-14 px-6 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700">
                Tidak ada temuan yang cocok dengan filter atau kata kunci pencarian.
              </p>
              <button
                type="button"
                onClick={() => {
                  setModuleFilter('ALL');
                  setSearchQuery('');
                }}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Reset Filter
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="Pilih semua data orphan"
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                      />
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">Tanggal</th>
                    <th className="py-3 px-3 whitespace-nowrap">Kode Referensi</th>
                    <th className="py-3 px-3 whitespace-nowrap">Modul / Tabel</th>
                    <th className="py-3 px-3 min-w-[220px]">Deskripsi Transaksi</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap">Nominal (Rp)</th>
                    <th className="py-3 px-3 min-w-[240px]">Alasan Orphan (Target Hilang)</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredItems.map((item) => {
                    const checked = selectedIds.has(item.id);
                    const isSyncItem = item.anomalyType === 'missing_receipt_and_cashflow';
                    return (
                      <tr
                        key={`${item.sourceTable}-${item.id}`}
                        className={`transition-colors ${
                          isSyncItem
                            ? checked
                              ? 'bg-emerald-50/60 hover:bg-emerald-50/70'
                              : 'hover:bg-emerald-50/30'
                            : checked
                              ? 'bg-rose-50/50 hover:bg-rose-50/60'
                              : 'hover:bg-rose-50/30'
                        }`}
                      >
                        <td className="py-3 px-4 align-top">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelectRow(item.id)}
                            aria-label={`Pilih ${item.referenceCode}`}
                            className={`rounded border-slate-300 mt-0.5 ${
                              isSyncItem
                                ? 'text-emerald-600 focus:ring-emerald-500'
                                : 'text-rose-600 focus:ring-rose-500'
                            }`}
                          />
                        </td>
                        <td className="py-3 px-3 align-top text-slate-600 whitespace-nowrap">
                          {formatAuditDate(item.transactionDate)}
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[11px] font-bold text-slate-800">
                            {item.referenceCode}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{item.moduleCategory}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            public.{item.sourceTable}
                          </div>
                          <span
                            className={`inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              isSyncItem
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {isSyncItem ? 'Sinkronisasi Kwitansi & Kas' : 'Data Orphan'}
                          </span>
                        </td>
                        <td className="py-3 px-3 align-top text-slate-700">
                          {item.description}
                        </td>
                        <td className="py-3 px-3 align-top text-right whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {formatCurrency(item.amount)}
                          </div>
                          {item.direction === 'in' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                              Kas Masuk
                            </span>
                          )}
                          {item.direction === 'out' && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700">
                              Kas Keluar
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 align-top">
                          <span
                            className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold mb-1 ${
                              isSyncItem
                                ? 'bg-teal-50 border-teal-200 text-teal-800'
                                : 'bg-amber-50 border-amber-200 text-amber-800'
                            }`}
                          >
                            {isSyncItem
                              ? `Belum Tercatat: ${item.missingTarget}`
                              : `Target Hilang: ${item.missingTarget}`}
                          </span>
                          <p className="text-slate-600 leading-relaxed">{item.reason}</p>
                        </td>
                        <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailItem(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Detail
                            </button>
                            {isSyncItem ? (
                              <button
                                type="button"
                                onClick={() => setPendingSyncItems([item])}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Sinkronkan
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setPendingDeleteItems([item])}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Hapus
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
          )}
        </div>
      </div>

      {/* Modal Detail Metadata Record */}
      {detailItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detail Metadata Data Orphan"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-bold text-slate-800">
                  {detailItem.referenceCode}
                </span>
                <h2 className="text-sm font-bold text-slate-900">Detail Record Orphan</h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                aria-label="Tutup modal detail"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Record UUID</span>
                  <span className="font-mono font-semibold text-slate-800 break-all">
                    {detailItem.id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Tabel Sumber</span>
                  <span className="font-mono font-semibold text-slate-800">
                    public.{detailItem.sourceTable}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Kategori Modul</span>
                  <span className="font-semibold text-slate-800">{detailItem.moduleCategory}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Target Induk Hilang</span>
                  <span className="font-semibold text-rose-700">{detailItem.missingTarget}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                <strong className="block mb-1">Diagnosis Anomali:</strong>
                {detailItem.reason}
              </div>

              <div>
                <span className="text-slate-600 font-semibold block mb-1.5">
                  Raw Database Payload (JSON):
                </span>
                <pre className="bg-slate-900 text-slate-100 p-3.5 rounded-xl overflow-x-auto text-[11px] font-mono leading-relaxed">
                  {JSON.stringify(detailItem.rawRecord, null, 2)}
                </pre>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Tutup
              </button>
              {detailItem.anomalyType === 'missing_receipt_and_cashflow' ? (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailItem;
                    setDetailItem(null);
                    setPendingSyncItems([target]);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Sinkronkan Record Ini
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const target = detailItem;
                    setDetailItem(null);
                    setPendingDeleteItems([target]);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Hapus Record Ini
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Sinkronisasi Kwitansi & Arus Kas */}
      {pendingSyncItems && pendingSyncItems.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Sinkronisasi Kwitansi & Arus Kas"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl border border-emerald-200 shadow-2xl max-w-2xl w-full overflow-hidden">
            <div className="px-5 py-4 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <h2 className="text-sm font-bold">
                  Konfirmasi Sinkronisasi {pendingSyncItems.length} Angsuran Lunas
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPendingSyncItems(null)}
                disabled={isSyncing}
                aria-label="Tutup konfirmasi sinkronisasi"
                className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Sistem akan menerbitkan rekaman kwitansi (<span className="font-mono">loan_repayments</span>) dan/atau mutasi kas masuk (<span className="font-mono">cash_flow</span>) secara idempoten sesuai tanggal jatuh tempo masing-masing periode:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">Kwitansi Baru</span>
                  <strong className="text-slate-900">{pendingSyncSummary.receiptsToCreate} baris</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Mutasi Arus Kas Baru</span>
                  <strong className="text-slate-900">{pendingSyncSummary.cashFlowsToCreate} baris</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Total Nominal Angsuran</span>
                  <strong className="text-emerald-700">{formatCurrency(pendingSyncSummary.totalAmount)}</strong>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {pendingSyncItems.map((item) => {
                  const sch = item.rawRecord?.schedule;
                  const loan = item.rawRecord?.loan;
                  const loanNumber = String(loan?.loan_number || item.referenceCode);
                  const periodNum = Number(sch?.period_number || 0);
                  const previewReceipt =
                    item.rawRecord?.previewReceiptNumber ||
                    `KW-MIGRASI/${loanNumber}/B${periodNum}`;
                  const previewDate =
                    item.rawRecord?.previewCashFlowDate ||
                    String(sch?.due_date || item.transactionDate || '-').slice(0, 10);
                  const hasReceipt = item.rawRecord?.hasReceipt === true;
                  const hasCashFlow = item.rawRecord?.hasCashFlow === true;

                  return (
                    <div
                      key={`${item.sourceTable}-${item.id}`}
                      className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold text-slate-900 truncate">
                          {item.description}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {previewReceipt}
                          </span>
                          <span className="text-slate-500">
                            Tgl Kas: <strong className="text-slate-700">{previewDate}</strong>
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              hasReceipt
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {hasReceipt ? 'Kwitansi Ada' : 'Buat Kwitansi'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              hasCashFlow
                                ? 'bg-slate-100 text-slate-500'
                                : 'bg-teal-50 text-teal-700 border border-teal-200'
                            }`}
                          >
                            {hasCashFlow ? 'Kas Ada' : 'Catat Arus Kas'}
                          </span>
                        </div>
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingSyncItems(null)}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menyinkronkan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Konfirmasi &amp; Terapkan Sinkronisasi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Penghapusan */}
      {pendingDeleteItems && pendingDeleteItems.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Hapus Data Orphan"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 bg-rose-50 border-b border-rose-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h2 className="text-sm font-bold">
                  Konfirmasi Hapus {pendingDeleteItems.length} Data Orphan
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteItems(null)}
                disabled={isDeleting}
                aria-label="Tutup konfirmasi hapus"
                className="p-1 rounded-lg text-rose-600 hover:bg-rose-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700 leading-relaxed">
                Tindakan ini akan menghapus permanen baris yatim berikut dari database agar laporan arus kas dan integritas tabel kembali sinkron:
              </p>

              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {pendingDeleteItems.map((item) => (
                  <div
                    key={`${item.sourceTable}-${item.id}`}
                    className="px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-slate-800 mr-2">
                        {item.referenceCode}
                      </span>
                      <span className="text-slate-500 truncate">{item.sourceTable}</span>
                    </div>
                    <span className="font-semibold text-slate-900 shrink-0">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>

              {(pendingDeleteSummary.cashInImpact > 0 ||
                pendingDeleteSummary.cashOutImpact > 0) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-800">
                    Dampak Penyesuaian Saldo Kas Brankas:
                  </div>
                  {pendingDeleteSummary.cashInImpact > 0 && (
                    <div className="text-rose-700">
                      • Total Kas Masuk berkurang:{' '}
                      <strong>-{formatCurrency(pendingDeleteSummary.cashInImpact)}</strong>
                    </div>
                  )}
                  {pendingDeleteSummary.cashOutImpact > 0 && (
                    <div className="text-emerald-700">
                      • Total Kas Keluar berkurang:{' '}
                      <strong>-{formatCurrency(pendingDeleteSummary.cashOutImpact)}</strong>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteItems(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Ya, Hapus Permanen
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
