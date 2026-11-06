import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut } from 'lucide-react';
import { openShift, CashierShift } from '../../services/cashierShiftService';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';

interface BukaKasirModalProps {
  isOpen: boolean;
  cashierId?: string | null;
  cashierName?: string;
  userRole?: string;
  isAdmin?: boolean;
  onSuccess: (shift: CashierShift) => void;
  canCancel?: boolean;
  onClose?: () => void;
}

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000];

export default function BukaKasirModal({
  isOpen,
  cashierId,
  cashierName = 'Kasir POS',
  userRole,
  isAdmin: propIsAdmin,
  onSuccess,
  canCancel = false,
  onClose,
}: BukaKasirModalProps) {
  const navigate = useNavigate();
  const { showToast } = useFeedback();
  const [initialCash, setInitialCash] = useState<number>(100000);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [internalIsAdmin, setInternalIsAdmin] = useState<boolean>(false);
  const [isLoggingOut, setIsLoggingOut] = useState<boolean>(false);

  const handleOperatorLogout = async () => {
    try {
      setIsLoggingOut(true);
      localStorage.removeItem('simkop_active_shift_id');
      localStorage.removeItem('simkop_active_shift_data');
      localStorage.removeItem('simkop_pos_cart');
      await supabase.auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Gagal logout kasir:', error);
      navigate('/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  useEffect(() => {
    if (propIsAdmin !== undefined) {
      setInternalIsAdmin(propIsAdmin);
      return;
    }
    if (userRole) {
      setInternalIsAdmin(userRole === 'admin');
      return;
    }

    let isMounted = true;
    async function checkAdminRole() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (user.app_metadata?.role === 'admin') {
          if (isMounted) setInternalIsAdmin(true);
          return;
        }
        const { data: pengelola } = await supabase
          .from('pengelola')
          .select('role')
          .eq('id', user.id)
          .single();
        if (isMounted && pengelola?.role === 'admin') {
          setInternalIsAdmin(true);
        }
      } catch {
        // ignore
      }
    }
    checkAdminRole();
    return () => {
      isMounted = false;
    };
  }, [propIsAdmin, userRole, cashierId]);

  const effectiveIsAdmin = propIsAdmin !== undefined ? propIsAdmin : (userRole ? userRole === 'admin' : internalIsAdmin);

  if (!isOpen) return null;

  const handleQuickSelect = (amount: number) => {
    setInitialCash(amount);
    setErrorMsg(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Extract only digits
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    const num = rawVal === '' ? 0 : parseInt(rawVal, 10);
    setInitialCash(num);
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (initialCash < 0 || isNaN(initialCash)) {
      setErrorMsg('Modal kas kecil tidak boleh bernilai negatif.');
      return;
    }

    try {
      setLoading(true);
      setErrorMsg(null);

      const effectiveCashierId = cashierId || '00000000-0000-0000-0000-000000000000';
      const newShift = await openShift({
        cashierId: effectiveCashierId,
        initialCash,
        notes: notes.trim() || undefined,
        cashierName,
      });

      showToast(`Shift ${newShift.shift_number} berhasil dibuka dengan modal awal Rp ${initialCash.toLocaleString('id-ID')}`, 'success');
      onSuccess(newShift);
    } catch (err: any) {
      console.error('Gagal membuka shift kasir:', err);
      const msg = err.message || 'Terjadi kesalahan saat membuka shift kasir.';
      setErrorMsg(msg);
      showToast(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-primary/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none"
      onClick={(e) => {
        // Hanya izinkan close via click luar jika canCancel bernilai true
        if (canCancel && onClose && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="bg-primary-container text-surface-container-lowest px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-inner">
              <span className="material-symbols-outlined text-secondary-fixed text-2xl">point_of_sale</span>
            </div>
            <div>
              <h2 className="font-title-md text-title-md text-surface-container-lowest leading-snug">
                Buka Shift Kasir Baru
              </h2>
              <p className="text-xs text-secondary-fixed/90 font-body-sm">
                Inisialisasi laci kasir & modal kas kecil operasional
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!effectiveIsAdmin && (
              <button
                type="button"
                onClick={handleOperatorLogout}
                disabled={isLoggingOut}
                title="Keluar (Logout)"
                aria-label="Keluar Akun"
                className="text-surface-container-lowest/80 hover:text-surface-container-lowest hover:bg-white/10 px-2 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 text-xs border border-white/20"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-200" />
                <span className="text-[11px] font-medium text-white">Keluar Akun</span>
              </button>
            )}
            {(canCancel || effectiveIsAdmin) && (
              <button
                type="button"
                onClick={() => {
                  if (effectiveIsAdmin) {
                    navigate('/admin');
                  } else if (onClose) {
                    onClose();
                  }
                }}
                title={effectiveIsAdmin ? "Kembali ke Dashboard" : "Tutup"}
                className="text-surface-container-lowest/70 hover:text-surface-container-lowest p-1 rounded-lg transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Info Petugas & Waktu */}
        <div className="bg-surface-container-low px-5 py-3 border-b border-outline-variant/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-on-surface">
            <span className="material-symbols-outlined text-secondary text-base">account_circle</span>
            <span className="font-medium text-slate-700">Kasir: <strong className="text-slate-900">{cashierName}</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500 font-mono">
            <span className="material-symbols-outlined text-sm">schedule</span>
            <span>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-5">
          {errorMsg && (
            <div className="p-3 bg-error-container/30 border border-error/40 text-error rounded-xl text-xs flex items-start gap-2">
              <span className="material-symbols-outlined text-base shrink-0 mt-0.5">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Input Modal Kas Kecil Awal */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Modal Kas Kecil Awal (Uang Kembalian di Laci) <span className="text-error">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-500 text-sm">
                Rp
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={initialCash > 0 ? initialCash.toLocaleString('id-ID') : (initialCash === 0 ? '0' : '')}
                onChange={handleInputChange}
                placeholder="0"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/20 text-slate-900 font-mono font-bold text-lg text-right transition"
                autoFocus
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Jumlah uang tunai yang tersedia di laci kasir sebelum transaksi pertama dimulai.
            </p>
          </div>

          {/* Quick Buttons Nominal */}
          <div>
            <span className="block text-[11px] font-medium text-slate-600 mb-2">
              Pilihan Cepat Nominal Modal Kasir:
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {QUICK_AMOUNTS.map((amt) => {
                const isSelected = initialCash === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleQuickSelect(amt)}
                    className={`py-2 px-1 rounded-lg text-xs font-mono font-semibold text-center transition-all border ${
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-sm scale-102'
                        : 'bg-surface-container-lowest text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-slate-400'
                    }`}
                  >
                    {amt >= 1000000 ? `${amt / 1000000} Jt` : `${amt / 1000} Rb`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Catatan Shift Opsional */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Catatan Shift (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Pecahan Rp 5.000 x 20 lembar, Rp 10.000 x 10 lembar..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/20 text-xs text-slate-800 transition resize-none"
            />
          </div>

          {/* Ringkasan Konfirmasi */}
          <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
            <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">info</span>
            <div>
              <p className="font-medium text-amber-950">Pencatatan Otomatis Buku Kas:</p>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Modal awal ini akan otomatis dicatat sebagai mutasi kas keluar operasional kasir (Modal Kas Kecil POS).
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div>
              {effectiveIsAdmin ? (
                <button
                  type="button"
                  onClick={() => navigate('/admin')}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm transition-colors cursor-pointer shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4 text-slate-600" />
                  <span>Kembali ke Dashboard</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleOperatorLogout}
                  disabled={isLoggingOut}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-sm transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4 text-rose-600" />
                  <span>{isLoggingOut ? 'Mengeluarkan...' : 'Keluar (Logout)'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5">
              {canCancel && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading || isLoggingOut}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs sm:text-sm transition cursor-pointer"
                >
                  Batal
                </button>
              )}
              <button
                type="submit"
                disabled={loading || isLoggingOut || initialCash < 0 || isNaN(initialCash)}
                className="flex-1 sm:flex-none sm:min-w-[200px] py-2.5 px-6 rounded-xl bg-primary hover:bg-primary-container text-white font-title-sm text-sm font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition active:scale-98 cursor-pointer"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Membuka Shift...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-lg">check_circle</span>
                    <span>Mulai Operasional Kasir</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
