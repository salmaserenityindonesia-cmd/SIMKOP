import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, X, ShieldAlert, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';

export interface BulkDisbursementConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { cycleName: string; cutOffDate: string; notes?: string }) => Promise<void>;
  totalMembers: number;
  totalAmount: number;
  isSubmitting?: boolean;
  error?: string | null;
  defaultCycleName?: string;
  defaultCutOffDate?: string;
}

export default function BulkDisbursementConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  totalMembers,
  totalAmount,
  isSubmitting = false,
  error = null,
  defaultCycleName,
  defaultCutOffDate
}: BulkDisbursementConfirmModalProps) {
  const currentYear = new Date().getFullYear();
  const [cycleName, setCycleName] = useState(defaultCycleName || `Pencairan THR Idul Fitri ${currentYear}`);
  const [cutOffDate, setCutOffDate] = useState(defaultCutOffDate || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [verificationInput, setVerificationInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCycleName(defaultCycleName || `Pencairan THR Idul Fitri ${currentYear}`);
      setCutOffDate(defaultCutOffDate || new Date().toISOString().slice(0, 10));
      setNotes('');
      setVerificationInput('');
    }
  }, [isOpen, defaultCycleName, defaultCutOffDate, currentYear]);

  if (!isOpen) return null;

  const REQUIRED_CONFIRM_PHRASE = 'CAIRKAN LEBARAN';
  const isPhraseMatched = verificationInput.trim() === REQUIRED_CONFIRM_PHRASE;
  const isReadyToSubmit = isPhraseMatched && cycleName.trim().length > 0 && cutOffDate.length > 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isReadyToSubmit) return;
    await onConfirm({
      cycleName: cycleName.trim(),
      cutOffDate,
      notes: notes.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-red-100 animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-disbursement-title"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-xl">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 id="bulk-disbursement-title" className="text-lg font-bold">
                Konfirmasi Eksekusi Pencairan Massal
              </h2>
              <p className="text-xs text-red-100">
                Pencairan 100% Simpanan Lebaran Anggota Aktif
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Critical Warning Alert */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-red-900">PERINGATAN KRITIS</p>
              <p className="leading-relaxed">
                Tindakan ini akan mencairkan 100% saldo simpanan lebaran untuk seluruh anggota aktif dan mereset saldo menjadi Rp 0.
              </p>
              <p className="text-xs text-red-700">
                Mutasi penarikan akan dicatat ke buku transaksi simpanan masing-masing anggota secara permanen.
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Execution Summary Cards */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                Total Anggota Penerima
              </span>
              <p className="text-xl font-bold text-slate-800 mt-0.5">
                {totalMembers.toLocaleString('id-ID')} Anggota
              </p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
                Total Dana Dicairkan
              </span>
              <p className="text-xl font-bold text-emerald-600 mt-0.5">
                Rp {totalAmount.toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          {/* Form Fields: Cycle Name & Cut-off Date */}
          <div className="space-y-4">
            <div>
              <label htmlFor="cycle-name-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Nama Siklus Pencairan <span className="text-red-500">*</span>
              </label>
              <input
                id="cycle-name-input"
                type="text"
                value={cycleName}
                onChange={(e) => setCycleName(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all disabled:bg-slate-100"
                placeholder="Contoh: Pencairan THR Idul Fitri 2026"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="cutoff-date-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Tanggal Cut-off <span className="text-red-500">*</span>
                </label>
                <input
                  id="cutoff-date-input"
                  type="date"
                  value={cutOffDate}
                  onChange={(e) => setCutOffDate(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all disabled:bg-slate-100"
                  required
                />
              </div>

              <div>
                <label htmlFor="notes-input" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  id="notes-input"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 text-sm font-medium focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-all disabled:bg-slate-100"
                  placeholder="Misal: Batch 1 - Hari Raya 1447H"
                />
              </div>
            </div>
          </div>

          {/* Type-To-Confirm Section */}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="type-confirm-input" className="block text-xs font-bold uppercase tracking-wider text-amber-900">
                Ketik Kata Verifikasi:
              </label>
              <span className="font-mono font-black text-xs px-2 py-0.5 bg-amber-200 text-amber-900 rounded">
                {REQUIRED_CONFIRM_PHRASE}
              </span>
            </div>
            <p className="text-xs text-amber-800">
              Ketik secara tepat <strong className="font-semibold text-amber-950">"{REQUIRED_CONFIRM_PHRASE}"</strong> untuk membuka tombol persetujuan eksekusi:
            </p>
            <div className="relative">
              <input
                id="type-confirm-input"
                type="text"
                value={verificationInput}
                onChange={(e) => setVerificationInput(e.target.value)}
                disabled={isSubmitting}
                autoComplete="off"
                className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 font-mono font-bold tracking-wide text-sm outline-none transition-all ${
                  isPhraseMatched
                    ? 'border-emerald-500 ring-2 ring-emerald-500/30'
                    : 'border-amber-300 focus:ring-2 focus:ring-amber-500'
                }`}
                placeholder={`Ketik "${REQUIRED_CONFIRM_PHRASE}"`}
              />
              {isPhraseMatched && (
                <div className="absolute right-3 top-2.5 flex items-center text-emerald-600 text-xs font-bold gap-1">
                  <CheckCircle2 className="w-4 h-4" /> Cocok
                </div>
              )}
            </div>
          </div>

          {/* Loading Indicator when Submitting */}
          {isSubmitting && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-3 text-blue-800 text-sm animate-pulse">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600 shrink-0" />
              <div>
                <p className="font-semibold">Sedang Memproses Pencairan Massal...</p>
                <p className="text-xs text-blue-600">
                  Sistem sedang menjalankan pembukuan mutasi batch untuk seluruh {totalMembers} anggota penerima. Jangan tutup jendela ini.
                </p>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isReadyToSubmit}
              className={`px-5 py-2.5 rounded-xl font-bold text-sm text-white flex items-center gap-2 shadow-sm transition-all ${
                isReadyToSubmit
                  ? 'bg-red-600 hover:bg-red-700 shadow-red-200 cursor-pointer'
                  : 'bg-slate-300 cursor-not-allowed text-slate-500'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Mengeksekusi...
                </>
              ) : (
                <>
                  Konfirmasi & Eksekusi Sekarang
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
