import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  LayoutDashboard,
  Loader2,
  LogOut,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingCart,
  Sparkles,
  X,
} from 'lucide-react';
import CameraScannerModal from '../../components/pos/CameraScannerModal';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';
import {
  ensureDailyOpnameAssignments,
  getMyOperatorAccess,
  getOperatorDailyTasks,
  submitOperatorBlindCount,
  submitRecountObservation,
  type CurrentOperatorAccess,
  type OperatorBlindTask,
} from '../../services/stockOpnameService';

type TaskFilterTab = 'all' | 'pending' | 'done' | 'recount';
type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function OperatorOpnameOnlyPage() {
  const navigate = useNavigate();
  const { showToast } = useFeedback();

  const [access, setAccess] = useState<CurrentOperatorAccess | null>(null);
  const [tasks, setTasks] = useState<OperatorBlindTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [filterTab, setFilterTab] = useState<TaskFilterTab>('all');
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [saveStatuses, setSaveStatuses] = useState<Record<string, AutoSaveStatus>>({});
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastSavedQtyRef = useRef<Record<string, number>>({});
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadTasksForOperator = useCallback(
    async (operatorId: string, syncFirst: boolean = true) => {
      setIsLoading(true);
      try {
        if (syncFirst) {
          await ensureDailyOpnameAssignments({ operatorId });
        }
        const list = await getOperatorDailyTasks(operatorId);
        setTasks(list);
      } catch (err: any) {
        showToast(err?.message || 'Gagal memuat tugas cek fisik inventory.', 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    let active = true;

    async function init() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          navigate('/login', { replace: true });
          return;
        }

        const opAccess = await getMyOperatorAccess(
          user.id,
          user.app_metadata?.role || 'operator'
        );
        if (!active) return;

        if (opAccess.role !== 'admin' && !opAccess.can_access_opname) {
          if (opAccess.can_access_pos) {
            navigate('/admin/kasir', { replace: true });
          } else {
            navigate('/login', { replace: true });
          }
          return;
        }

        setAccess(opAccess);
        await loadTasksForOperator(opAccess.id, true);
      } catch (err: any) {
        if (active) {
          showToast(err?.message || 'Gagal memverifikasi sesi operator.', 'error');
          setIsLoading(false);
        }
      }
    }

    init();
    return () => {
      active = false;
    };
  }, [loadTasksForOperator, navigate, showToast]);

  useEffect(() => {
    setQtyDrafts((prev) => {
      const next = { ...prev };
      for (const t of tasks) {
        if (next[t.id] === undefined) {
          if (t.is_recount_task) {
            next[t.id] = t.recount_qty !== null ? String(t.recount_qty) : '';
          } else {
            next[t.id] = t.observed_qty !== null ? String(t.observed_qty) : '';
          }
        }
        if (t.is_recount_task) {
          if (
            t.recount_qty !== null &&
            (t.status === 'recounted' || t.status === 'resolved')
          ) {
            lastSavedQtyRef.current[t.id] = t.recount_qty;
          }
        } else if (
          t.observed_qty !== null &&
          (t.status === 'counted' || t.status === 'resolved')
        ) {
          lastSavedQtyRef.current[t.id] = t.observed_qty;
        }
      }
      return next;
    });
  }, [tasks]);

  useEffect(() => {
    const timers = debounceTimersRef.current;
    return () => {
      Object.values(timers).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const handleSyncTasks = async () => {
    if (!access?.id) return;
    setIsSyncing(true);
    try {
      const res = await ensureDailyOpnameAssignments({ operatorId: access.id });
      const list = await getOperatorDailyTasks(access.id);
      setTasks(list);
      showToast(
        `Tugas tersinkronisasi: ${list.length} item aktif pada Siklus #${res.cycleNumber}.`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyinkronkan tugas harian.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.category_group) set.add(t.category_group);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [tasks]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(
      (t) => t.status === 'counted' || t.status === 'recounted' || t.status === 'resolved'
    ).length;
    const recountPending = tasks.filter(
      (t) => t.is_recount_task && t.status === 'recount_requested'
    ).length;
    const cycleNumber = tasks[0]?.cycle_number ?? 1;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, recountPending, cycleNumber, pct };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (categoryFilter !== 'all' && t.category_group !== categoryFilter) return false;
      if (filterTab === 'pending' && t.status !== 'pending') return false;
      if (
        filterTab === 'done' &&
        t.status !== 'counted' &&
        t.status !== 'recounted' &&
        t.status !== 'resolved'
      ) {
        return false;
      }
      if (filterTab === 'recount' && !t.is_recount_task) return false;
      if (!q) return true;
      return (
        t.sku.toLowerCase().includes(q) ||
        t.product_name.toLowerCase().includes(q) ||
        t.category_group.toLowerCase().includes(q)
      );
    });
  }, [tasks, categoryFilter, filterTab, searchQuery]);

  const focusMatchingSku = (codeRaw: string) => {
    const code = codeRaw.trim().toLowerCase();
    if (!code) return false;
    const exact = tasks.find((t) => t.sku.toLowerCase() === code);
    if (!exact) return false;

    setCategoryFilter('all');
    setFilterTab('all');
    setHighlightedTaskId(exact.id);
    setTimeout(() => {
      qtyInputRefs.current[exact.id]?.focus();
      qtyInputRefs.current[exact.id]?.select();
    }, 80);
    return true;
  };

  const handleBarcodeEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    if (focusMatchingSku(searchQuery)) {
      e.preventDefault();
    }
  };

  const handleCameraScanSuccess = (scannedText: string) => {
    setIsScannerOpen(false);
    setSearchQuery(scannedText);
    if (!focusMatchingSku(scannedText)) {
      showToast(
        `SKU "${scannedText}" tidak ada dalam daftar tugas opname Anda hari ini.`,
        'warning'
      );
    }
  };

  const focusNextInput = useCallback(
    (currentTaskId: string) => {
      const currentIdx = filteredTasks.findIndex((t) => t.id === currentTaskId);
      if (currentIdx === -1) return;
      for (let i = currentIdx + 1; i < filteredTasks.length; i += 1) {
        const candidate = filteredTasks[i];
        if (candidate.status !== 'resolved') {
          const el = qtyInputRefs.current[candidate.id];
          if (el) {
            el.focus();
            el.select();
            return;
          }
        }
      }
    },
    [filteredTasks]
  );

  const triggerQuantityAutoSave = useCallback(
    (task: OperatorBlindTask, rawQtyString: string, immediate: boolean = false) => {
      const existingTimer = debounceTimersRef.current[task.id];
      if (existingTimer) {
        clearTimeout(existingTimer);
        delete debounceTimersRef.current[task.id];
      }

      if (task.status === 'resolved' || !access?.id) return;

      const trimmed = rawQtyString.trim();
      const numericVal = Number(trimmed);
      if (trimmed === '' || Number.isNaN(numericVal) || numericVal < 0) {
        return;
      }

      const parsedQty = Math.floor(numericVal);
      if (lastSavedQtyRef.current[task.id] === parsedQty) {
        setSaveStatuses((prev) =>
          prev[task.id] === 'saved' ? prev : { ...prev, [task.id]: 'saved' }
        );
        return;
      }

      const executeSave = async () => {
        if (lastSavedQtyRef.current[task.id] === parsedQty) return;
        setSaveStatuses((prev) => ({ ...prev, [task.id]: 'saving' }));

        try {
          const isRecount = task.is_recount_task || task.status === 'recount_requested';
          if (isRecount) {
            await submitRecountObservation(task.id, parsedQty, access.id);
          } else {
            await submitOperatorBlindCount(task.id, parsedQty);
          }

          lastSavedQtyRef.current[task.id] = parsedQty;
          setTasks((prev) =>
            prev.map((t) =>
              t.id === task.id
                ? {
                    ...t,
                    status: isRecount ? 'recounted' : 'counted',
                    observed_qty: isRecount ? t.observed_qty : parsedQty,
                    recount_qty: isRecount ? parsedQty : t.recount_qty,
                  }
                : t
            )
          );
          setSaveStatuses((prev) => ({ ...prev, [task.id]: 'saved' }));
        } catch (err: any) {
          setSaveStatuses((prev) => ({ ...prev, [task.id]: 'error' }));
          showToast(err?.message || 'Gagal menyimpan hasil hitung fisik.', 'error');
        }
      };

      if (immediate) {
        void executeSave();
      } else {
        debounceTimersRef.current[task.id] = setTimeout(() => {
          delete debounceTimersRef.current[task.id];
          void executeSave();
        }, 600);
      }
    },
    [access?.id, showToast]
  );

  const todayFormatted = useMemo(
    () =>
      new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    []
  );

  const canSwitchToPos = access?.role === 'admin' || access?.can_access_pos === true;
  const isAdmin = access?.role === 'admin';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* Sticky Full-Width Header */}
      <header className="bg-slate-900 text-white border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                <ClipboardCheck className="w-4 h-4 text-emerald-300" />
              </div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                Cek Fisik Inventory (Blind Count)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                <EyeOff className="w-3 h-3" />
                Stok Sistem Tersembunyi
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                Siklus #{progress.cycleNumber}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Petugas: <strong className="text-white">{access?.nama || 'Operator'}</strong> •{' '}
              {todayFormatted} • Progres:{' '}
              <strong className="text-emerald-300">
                {progress.completed} / {progress.total} Barang Selesai
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSyncTasks}
              disabled={isSyncing || isLoading}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Tugas'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Camera className="w-4 h-4 text-sky-300" />
              <span>Scan Kamera</span>
            </button>

            {canSwitchToPos && (
              <button
                type="button"
                onClick={() => navigate('/admin/kasir', { state: { allowPosSwitch: true } })}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Buka Kasir POS</span>
              </button>
            )}

            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin')}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard Admin</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 flex-1 space-y-4">
        {/* Progress & Mode Notice */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Progres Hari Ini: {progress.completed} / {progress.total} Barang Selesai
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hitung langsung jumlah fisik di rak/gudang tanpa melihat stok sistem. Nilai stok saat simpan otomatis dikunci untuk rekonsiliasi Admin.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-lg font-extrabold text-emerald-700 tabular-nums">
                {progress.pct}%
              </span>
              <button
                type="button"
                onClick={() => access?.id && loadTasksForOperator(access.id, false)}
                disabled={isLoading}
                title="Muat ulang daftar tugas"
                className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress.pct}%` }}
            />
          </div>

          {progress.recountPending > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                Terdapat {progress.recountPending} item diminta hitung ulang (Re-Count) oleh Admin. Prioritaskan item bertanda kuning.
              </span>
            </div>
          )}
        </div>

        {/* Search, Category Filter & Status Tabs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleBarcodeEnter}
              placeholder="Scan Barcode / SKU atau ketik Nama Produk / Kategori (Enter untuk fokus qty)..."
              className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium"
            >
              <option value="all">Semua Kategori ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              {(
                [
                  { id: 'all', label: 'Semua' },
                  { id: 'pending', label: 'Belum' },
                  { id: 'done', label: 'Selesai' },
                  { id: 'recount', label: 'Re-Count' },
                ] as { id: TaskFilterTab; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    filterTab === tab.id
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Blind Count Task Grid */}
        {isLoading ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center text-slate-500 text-sm">
            <div className="inline-block w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-2" />
            <p>Memuat daftar tugas cek fisik inventory...</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 py-16 px-6 text-center text-slate-500 text-sm">
            <ClipboardCheck className="w-11 h-11 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">
              Tidak ada item cek fisik pada filter ini
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {tasks.length === 0
                ? 'Klik "Sinkronkan Tugas" di atas untuk mengambil jadwal cek fisik hari ini.'
                : 'Ubah kata kunci pencarian, kategori, atau tab filter status.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredTasks.map((task) => {
              const isResolved = task.status === 'resolved';
              const isDone =
                task.status === 'counted' ||
                task.status === 'recounted' ||
                task.status === 'resolved';
              const saveStatus = saveStatuses[task.id] ?? 'idle';
              const isHighlighted = highlightedTaskId === task.id;
              const draftVal = qtyDrafts[task.id] ?? '';
              const showSavedBadge =
                saveStatus === 'saved' ||
                (saveStatus === 'idle' &&
                  task.status !== 'pending' &&
                  task.status !== 'recount_requested');

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-2xl border p-4 shadow-2xs transition-all space-y-3 ${
                    task.is_recount_task && task.status === 'recount_requested'
                      ? 'border-amber-300 ring-1 ring-amber-200'
                      : isHighlighted
                        ? 'border-emerald-500 ring-2 ring-emerald-200'
                        : isDone
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {task.sku}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {task.category_group}
                        </span>
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                          Satuan: {task.unit}
                        </span>
                        {task.is_reassigned && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                            Pengalihan{task.reassigned_from_name ? ` (${task.reassigned_from_name})` : ''}
                          </span>
                        )}
                        {task.is_recount_task && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            Re-Count Admin
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {task.product_name}
                      </h3>
                    </div>

                    <div className="shrink-0">
                      {task.status === 'resolved' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Disahkan
                        </span>
                      ) : task.status === 'counted' || task.status === 'recounted' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sudah Dihitung
                        </span>
                      ) : task.status === 'recount_requested' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                          <RotateCcw className="w-3.5 h-3.5" />
                          Hitung Ulang
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600">
                          Belum Dihitung
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5 pt-1">
                    <div className="flex-1 max-w-xs">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {task.is_recount_task ? 'Qty Hitung Ulang' : 'Jumlah Fisik'} ({task.unit})
                      </label>
                      <input
                        ref={(el) => {
                          qtyInputRefs.current[task.id] = el;
                        }}
                        type="number"
                        min={0}
                        step={1}
                        disabled={isResolved}
                        value={draftVal}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQtyDrafts((prev) => ({ ...prev, [task.id]: val }));
                          triggerQuantityAutoSave(task, val, false);
                        }}
                        onBlur={(e) => {
                          triggerQuantityAutoSave(task, e.target.value, true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            triggerQuantityAutoSave(task, e.currentTarget.value, true);
                            focusNextInput(task.id);
                          }
                        }}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100"
                      />
                    </div>

                    <div className="shrink-0 sm:pb-1.5">
                      {saveStatus === 'saving' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Menyimpan...
                        </span>
                      ) : saveStatus === 'error' ? (
                        <button
                          type="button"
                          onClick={() => triggerQuantityAutoSave(task, draftVal, true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Gagal • Ulangi
                        </button>
                      ) : showSavedBadge ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Tersimpan ✓
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <CameraScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleCameraScanSuccess}
      />
    </div>
  );
}
