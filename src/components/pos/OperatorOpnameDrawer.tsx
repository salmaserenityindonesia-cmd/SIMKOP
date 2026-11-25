import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react';
import type { OperatorBlindTask } from '../../services/stockOpnameService';

interface OperatorOpnameDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: OperatorBlindTask[];
  operatorName: string;
  isLoading?: boolean;
  onRefresh: () => void;
  onSubmitCount: (taskId: string, qty: number, notes?: string) => Promise<void>;
  onSubmitRecount: (taskId: string, qty: number, notes?: string) => Promise<void>;
}

type TaskFilterTab = 'all' | 'pending' | 'done' | 'recount';

export default function OperatorOpnameDrawer({
  isOpen,
  onClose,
  tasks,
  operatorName,
  isLoading = false,
  onRefresh,
  onSubmitCount,
  onSubmitRecount,
}: OperatorOpnameDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<TaskFilterTab>('all');
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (!isOpen) return;
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
        if (noteDrafts[t.id] === undefined && t.notes) {
          setNoteDrafts((nPrev) => ({ ...nPrev, [t.id]: t.notes || '' }));
        }
      }
      return next;
    });
    const timer = setTimeout(() => searchInputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [isOpen, tasks]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const progress = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(
      (t) =>
        t.status === 'counted' ||
        t.status === 'recounted' ||
        t.status === 'resolved'
    ).length;
    const recountPending = tasks.filter((t) => t.is_recount_task && t.status === 'recount_requested').length;
    const cycleNumber = tasks[0]?.cycle_number ?? 1;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, recountPending, cycleNumber, pct };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tasks.filter((t) => {
      if (filterTab === 'pending' && t.status !== 'pending') return false;
      if (filterTab === 'done' && t.status !== 'counted' && t.status !== 'recounted' && t.status !== 'resolved') {
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
  }, [tasks, searchQuery, filterTab]);

  if (!isOpen) return null;

  const handleBarcodeEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const code = searchQuery.trim().toLowerCase();
    if (!code) return;
    const exact = tasks.find((t) => t.sku.toLowerCase() === code);
    if (exact) {
      e.preventDefault();
      setHighlightedTaskId(exact.id);
      setFilterTab('all');
      setTimeout(() => {
        qtyInputRefs.current[exact.id]?.focus();
        qtyInputRefs.current[exact.id]?.select();
      }, 60);
    }
  };

  const handleSaveRow = async (task: OperatorBlindTask) => {
    const raw = (qtyDrafts[task.id] ?? '').trim();
    if (raw === '') return;
    const parsed = Math.round(Number(raw));
    if (!Number.isFinite(parsed) || parsed < 0) return;

    setSavingTaskId(task.id);
    try {
      const noteText = noteDrafts[task.id];
      if (task.is_recount_task || task.status === 'recount_requested') {
        await onSubmitRecount(task.id, parsed, noteText);
      } else {
        await onSubmitCount(task.id, parsed, noteText);
      }
    } finally {
      setSavingTaskId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tugas Cek Fisik Harian Blind Count"
        className="w-full max-w-2xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Tugas Cek Fisik Harian (Blind Count)
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30">
                <EyeOff className="w-3 h-3" />
                Stok Sistem Tersembunyi
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Operator: <strong className="text-white">{operatorName}</strong> • Siklus #{progress.cycleNumber} • Hitung langsung fisik barang di rak/gudang.
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              title="Muat ulang daftar tugas"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup drawer opname"
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Progress & Search */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 space-y-3 shrink-0">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">
                Progres Hari Ini: {progress.completed} / {progress.total} Barang Selesai
              </span>
              <span className="font-bold text-emerald-700 tabular-nums">{progress.pct}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
            {progress.recountPending > 0 && (
              <div className="text-[11px] font-semibold text-amber-700 flex items-center gap-1.5 pt-0.5">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ada {progress.recountPending} item diminta hitung ulang (Re-Count) oleh Admin.</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleBarcodeEnter}
                placeholder="Scan Barcode / SKU atau ketik Nama Produk / Kategori (Enter untuk fokus)..."
                className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-[11px] font-semibold">
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
                  className={`px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                    filterTab === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Task List (Strict Blind Count: NO system stock displayed!) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              <div className="inline-block w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-2" />
              <p>Memuat daftar tugas cek fisik...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm bg-white rounded-xl border border-slate-200 p-6">
              <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Tidak ada item cek fisik pada filter ini</p>
              <p className="text-xs text-slate-400 mt-1">
                {tasks.length === 0
                  ? 'Belum ada tugas opname terjadwal untuk shift hari ini.'
                  : 'Coba ubah kata kunci pencarian atau tab filter.'}
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isResolved = task.status === 'resolved';
              const isDone =
                task.status === 'counted' ||
                task.status === 'recounted' ||
                task.status === 'resolved';
              const isSaving = savingTaskId === task.id;
              const isHighlighted = highlightedTaskId === task.id;
              const draftVal = qtyDrafts[task.id] ?? '';
              const canSave = !isResolved && !isSaving && draftVal.trim() !== '';

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-xl border p-4 shadow-2xs transition-all space-y-3 ${
                    task.is_recount_task && task.status === 'recount_requested'
                      ? 'border-amber-300 ring-1 ring-amber-200'
                      : isHighlighted
                        ? 'border-emerald-500 ring-2 ring-emerald-200'
                        : isDone
                          ? 'border-emerald-200/80 bg-emerald-50/20'
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
                          Tercatat
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

                  {/* Input Hitung Fisik */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-1">
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        {task.is_recount_task ? 'Qty Hasil Hitung Ulang' : 'Jumlah Fisik di Rak'} ({task.unit})
                      </label>
                      <input
                        ref={(el) => {
                          qtyInputRefs.current[task.id] = el;
                        }}
                        type="number"
                        min={0}
                        step={1}
                        disabled={isResolved || isSaving}
                        value={draftVal}
                        onChange={(e) =>
                          setQtyDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && canSave) {
                            e.preventDefault();
                            handleSaveRow(task);
                          }
                        }}
                        placeholder="0"
                        className="w-full px-3 py-2 text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Catatan Kondisi (Opsional)
                      </label>
                      <input
                        type="text"
                        disabled={isResolved || isSaving}
                        value={noteDrafts[task.id] ?? ''}
                        onChange={(e) =>
                          setNoteDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        placeholder="Misal: rak atas + gudang belakang"
                        className="w-full px-3 py-2 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <button
                        type="button"
                        disabled={!canSave}
                        onClick={() => handleSaveRow(task)}
                        className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{isSaving ? 'Menyimpan...' : isDone ? 'Perbarui' : 'Simpan'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
