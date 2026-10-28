import React, { useState, useEffect } from 'react';
import { 
  CashierShift, 
  getShiftSalesSummary, 
  closeShift, 
  ShiftReconciliationSummary 
} from '../../services/cashierShiftService';
import { getKoperasiProfile, KoperasiProfile, DEFAULT_KOPERASI_PROFILE } from '../../services/settingsService';
import { useFeedback } from '../../context/FeedbackContext';

interface TutupKasirModalProps {
  isOpen: boolean;
  shift: CashierShift | null;
  onClose: () => void;
  onSuccess: (closedShift: CashierShift) => void;
}

interface Denomination {
  value: number;
  label: string;
  count: number;
}

const DEFAULT_DENOMINATIONS: Omit<Denomination, 'count'>[] = [
  { value: 100000, label: 'Rp 100.000' },
  { value: 50000, label: 'Rp 50.000' },
  { value: 20000, label: 'Rp 20.000' },
  { value: 10000, label: 'Rp 10.000' },
  { value: 5000, label: 'Rp 5.000' },
  { value: 2000, label: 'Rp 2.000' },
  { value: 1000, label: 'Rp 1.000' },
  { value: 500, label: 'Rp 500 (Koin)' },
  { value: 200, label: 'Rp 200 (Koin)' },
  { value: 100, label: 'Rp 100 (Koin)' },
];

export default function TutupKasirModal({
  isOpen,
  shift,
  onClose,
  onSuccess,
}: TutupKasirModalProps) {
  const { showToast } = useFeedback();
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [summary, setSummary] = useState<ShiftReconciliationSummary | null>(null);
  const [actualCash, setActualCash] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [showDenomCalc, setShowDenomCalc] = useState(false);
  const [denominations, setDenominations] = useState<Denomination[]>(
    DEFAULT_DENOMINATIONS.map(d => ({ ...d, count: 0 }))
  );
  const [profile, setProfile] = useState<KoperasiProfile>(DEFAULT_KOPERASI_PROFILE);

  // Load sales summary and koperasi profile on modal open
  useEffect(() => {
    if (!isOpen || !shift) return;

    let isMounted = true;
    setLoadingSummary(true);

    getKoperasiProfile().then(p => {
      if (isMounted) setProfile(p);
    });

    getShiftSalesSummary(shift.id, shift.cashier_id, shift.opened_at)
      .then(res => {
        if (isMounted) {
          setSummary(res);
          // Set initial actual cash to expected cash as quick default recommendation
          setActualCash(res.expectedCash);
          setLoadingSummary(false);
        }
      })
      .catch(err => {
        console.error('Gagal memuat ringkasan penjualan shift:', err);
        if (isMounted) {
          setSummary({
            shiftId: shift.id,
            initialCash: shift.initial_cash || 0,
            cashSales: 0,
            nonCashSales: 0,
            depositSales: 0,
            creditSales: 0,
            totalSales: 0,
            expectedCash: shift.initial_cash || 0,
            actualCash: 0,
            difference: 0,
            transactionCount: 0,
          });
          setActualCash(shift.initial_cash || 0);
          setLoadingSummary(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, shift]);

  if (!isOpen || !shift) return null;

  // Real-time calculations
  const initialCash = summary?.initialCash ?? shift.initial_cash ?? 0;
  const cashSales = summary?.cashSales ?? 0;
  const depositSales = summary?.depositSales ?? 0;
  const creditSales = summary?.creditSales ?? 0;
  const totalSales = summary?.totalSales ?? 0;
  const transactionCount = summary?.transactionCount ?? 0;
  const expectedCash = initialCash + cashSales;
  const difference = actualCash - expectedCash;

  // Handle direct manual actual cash input
  const handleActualCashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9]/g, '');
    const num = rawVal === '' ? 0 : parseInt(rawVal, 10);
    setActualCash(num);
  };

  // Handle denomination count change
  const handleDenomChange = (index: number, count: number) => {
    const nextDenoms = [...denominations];
    nextDenoms[index].count = Math.max(0, count || 0);
    setDenominations(nextDenoms);

    // Recompute total actual cash from denominations
    const totalFromDenoms = nextDenoms.reduce((acc, d) => acc + (d.value * d.count), 0);
    setActualCash(totalFromDenoms);
  };

  // Reset denominations
  const handleResetDenom = () => {
    setDenominations(DEFAULT_DENOMINATIONS.map(d => ({ ...d, count: 0 })));
  };

  // Direct print Z-Report
  const handlePrintZReport = () => {
    window.print();
  };

  // Handle shift closing submission
  const handleSubmitClose = async () => {
    if (actualCash < 0 || isNaN(actualCash)) {
      showToast('Jumlah uang fisik tidak boleh negatif.', 'error');
      return;
    }

    try {
      setSubmitting(true);
      const closed = await closeShift({
        shiftId: shift.id,
        actualCash,
        notes: notes.trim() || undefined,
        cashierId: shift.cashier_id,
      });

      showToast(`Shift ${shift.shift_number} berhasil ditutup!`, 'success');
      onSuccess(closed);
    } catch (err: any) {
      console.error('Gagal menutup shift:', err);
      showToast(err.message || 'Terjadi kesalahan saat menutup shift kasir.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openedDateStr = new Date(shift.opened_at).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const currentDateStr = new Date().toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 bg-primary/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 select-none">
      <div 
        id="tutupKasirModalCard"
        className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in duration-150"
      >
        {/* Header Modal */}
        <div className="bg-primary-container text-surface-container-lowest px-5 py-4 flex items-center justify-between shrink-0 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center border border-amber-400/30">
              <span className="material-symbols-outlined text-2xl">lock_clock</span>
            </div>
            <div>
              <h2 className="font-title-md text-title-md text-surface-container-lowest leading-snug">
                Tutup Shift & Rekonsiliasi Kasir
              </h2>
              <p className="text-xs text-secondary-fixed/90 font-body-sm">
                Hitung uang laci, periksa selisih, dan cetak Z-Report ringkasan shift
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-surface-container-lowest/70 hover:text-surface-container-lowest p-1 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-5 print:p-0">
          
          {/* Shift Identity Bar */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">receipt</span>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-mono">Nomor Shift</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{shift.shift_number}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">person</span>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Kasir</span>
                <span className="font-semibold text-slate-800">{shift.cashier_name || 'Kasir POS'}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-lg">schedule</span>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Waktu Buka</span>
                <span className="text-slate-800 font-mono">{openedDateStr} WIB</span>
              </div>
            </div>
          </div>

          {loadingSummary ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500">
              <span className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
              <span className="text-xs">Mengagregasi total transaksi & penjualan kasir...</span>
            </div>
          ) : (
            <>
              {/* Financial Calculation Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-slate-500 block">Modal Awal Kasir</span>
                  <span className="font-mono font-bold text-base text-slate-800">
                    Rp {initialCash.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Uang kas kecil awal</span>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-emerald-700 block">Penjualan Tunai</span>
                  <span className="font-mono font-bold text-base text-emerald-800">
                    + Rp {cashSales.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-emerald-600 block mt-0.5">{transactionCount} transaksi lunas</span>
                </div>

                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3">
                  <span className="text-[11px] font-medium text-blue-700 block">Estimasi Kas Sistem (Expected)</span>
                  <span className="font-mono font-bold text-base text-blue-900">
                    Rp {expectedCash.toLocaleString('id-ID')}
                  </span>
                  <span className="text-[10px] text-blue-600 block mt-0.5">Modal Awal + Tunai</span>
                </div>
              </div>

              {/* Non-cash breakdown info */}
              {(depositSales > 0 || creditSales > 0) && (
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-600">
                  <span className="font-medium">Pembukuan Non-Tunai Sesi Ini:</span>
                  <div className="flex items-center gap-4 font-mono text-[11px]">
                    {depositSales > 0 && (
                      <span>Simpanan: <strong>Rp {depositSales.toLocaleString('id-ID')}</strong></span>
                    )}
                    {creditSales > 0 && (
                      <span>Bon Toko/Tempo: <strong>Rp {creditSales.toLocaleString('id-ID')}</strong></span>
                    )}
                    <span>Total Omset: <strong>Rp {totalSales.toLocaleString('id-ID')}</strong></span>
                  </div>
                </div>
              )}

              {/* Input Actual Cash Fisik Kasir */}
              <div className="bg-slate-50 border border-slate-300 rounded-xl p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base text-primary">payments</span>
                    <span>Total Uang Fisik di Laci Kasir (Actual Cash)</span>
                    <span className="text-error">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowDenomCalc(!showDenomCalc)}
                    className="text-xs font-medium text-primary hover:text-primary-container flex items-center gap-1 underline underline-offset-2"
                  >
                    <span className="material-symbols-outlined text-sm">calculate</span>
                    <span>{showDenomCalc ? 'Tutup Kalkulator Lembaran' : 'Buka Kalkulator Lembaran'}</span>
                  </button>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-500 text-base">
                    Rp
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={actualCash > 0 ? actualCash.toLocaleString('id-ID') : (actualCash === 0 ? '0' : '')}
                    onChange={handleActualCashChange}
                    placeholder="0"
                    className="w-full pl-12 pr-4 py-2.5 rounded-xl border border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/20 text-slate-900 font-mono font-bold text-xl text-right transition"
                  />
                </div>

                {/* Denominations Calculator Accordion */}
                {showDenomCalc && (
                  <div className="mt-4 pt-4 border-t border-slate-200 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-xs font-semibold text-slate-700">
                        Kalkulator Hitung Lembaran & Koin:
                      </span>
                      <button
                        type="button"
                        onClick={handleResetDenom}
                        className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                      >
                        Reset Hitungan
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {denominations.map((denom, idx) => (
                        <div key={denom.value} className="bg-white p-2 rounded-lg border border-slate-200">
                          <span className="block text-[10px] font-mono text-slate-500 font-medium">{denom.label}</span>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[11px] text-slate-400">x</span>
                            <input
                              type="number"
                              min="0"
                              value={denom.count || ''}
                              onChange={(e) => handleDenomChange(idx, parseInt(e.target.value, 10) || 0)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-xs font-mono font-bold rounded border border-slate-300 text-right focus:outline-none focus:border-primary"
                            />
                          </div>
                          <span className="block text-[10px] text-slate-600 font-mono font-semibold text-right mt-1">
                            Rp {(denom.value * (denom.count || 0)).toLocaleString('id-ID')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Real-Time Difference Banner */}
              <div 
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                  difference === 0
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : difference > 0
                    ? 'bg-blue-50 text-blue-900 border-blue-300'
                    : 'bg-amber-50 text-amber-900 border-amber-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-2xl">
                    {difference === 0 ? 'check_circle' : difference > 0 ? 'arrow_circle_up' : 'warning'}
                  </span>
                  <div>
                    <h4 className="font-bold text-sm leading-tight">
                      {difference === 0 && 'Kas Seimbang (Sesuai Perhitungan)'}
                      {difference > 0 && 'Terdapat Selisih Kas Lebih (Surplus)'}
                      {difference < 0 && 'Terdapat Selisih Kas Kurang (Defisit)'}
                    </h4>
                    <p className="text-xs opacity-90 mt-0.5">
                      {difference === 0 && 'Uang fisik di laci kasir persis sama dengan estimasi sistem.'}
                      {difference > 0 && 'Uang fisik lebih banyak dari pencatatan sistem penjualan.'}
                      {difference < 0 && 'Uang fisik di laci lebih sedikit dari pencatatan sistem penjualan.'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] uppercase block opacity-80 font-mono">Selisih Kas</span>
                  <span className="font-mono font-extrabold text-lg">
                    {difference === 0 ? 'Rp 0' : `${difference > 0 ? '+' : ''}Rp ${difference.toLocaleString('id-ID')}`}
                  </span>
                </div>
              </div>

              {/* Catatan Tutup Kasir */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Catatan Penutupan Kasir (Opsional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Keterangan kondisi laci, alasan selisih kas jika ada, atau informasi serah terima shift..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-primary focus:ring-2 focus:ring-primary/20 text-xs text-slate-800 transition resize-none"
                />
              </div>
            </>
          )}

          {/* Hidden Printable Z-Report Slip (Visible in Print Mode) */}
          <div id="printable-zreport" className="hidden print:block font-mono text-[11px] text-black p-4 leading-tight">
            <div className="text-center pb-2 border-b border-dashed border-black space-y-1">
              <div className="font-bold text-[14px]">{profile.nama_koperasi}</div>
              <div className="text-[10px]">{profile.alamat}</div>
              {profile.telepon && <div className="text-[10px]">Telp: {profile.telepon}</div>}
              <div className="font-bold text-[12px] pt-1">*** LAPORAN Z-REPORT TUTUP KASIR ***</div>
            </div>

            <div className="py-2 border-b border-dashed border-black space-y-0.5 text-[10px]">
              <div className="flex justify-between">
                <span>No. Shift:</span>
                <span className="font-bold">{shift.shift_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>{shift.cashier_name || 'Kasir POS'}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu Buka:</span>
                <span>{openedDateStr}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu Tutup:</span>
                <span>{currentDateStr}</span>
              </div>
              <div className="flex justify-between">
                <span>Jml Transaksi:</span>
                <span>{transactionCount} Transaksi</span>
              </div>
            </div>

            <div className="py-2 border-b border-dashed border-black space-y-1">
              <div className="font-bold text-[10px] uppercase">Rincian Kasir (Cash Flow)</div>
              <div className="flex justify-between">
                <span>Modal Awal Kas:</span>
                <span>Rp {initialCash.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span>Penjualan Tunai:</span>
                <span>+ Rp {cashSales.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-dotted border-black">
                <span>Estimasi Kas (Expected):</span>
                <span>Rp {expectedCash.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Uang Fisik (Actual):</span>
                <span>Rp {actualCash.toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between font-bold pt-1 border-t border-dotted border-black">
                <span>SELISIH KAS:</span>
                <span>{difference === 0 ? 'Rp 0 (SEIMBANG)' : `${difference > 0 ? '+' : ''}Rp ${difference.toLocaleString('id-ID')}`}</span>
              </div>
            </div>

            {(depositSales > 0 || creditSales > 0) && (
              <div className="py-2 border-b border-dashed border-black space-y-0.5 text-[10px]">
                <div className="font-bold uppercase">Non-Tunai (Informasi)</div>
                {depositSales > 0 && (
                  <div className="flex justify-between">
                    <span>Simpanan Belanja:</span>
                    <span>Rp {depositSales.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {creditSales > 0 && (
                  <div className="flex justify-between">
                    <span>Bon Toko/Tempo:</span>
                    <span>Rp {creditSales.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-0.5">
                  <span>Total Omset Shift:</span>
                  <span>Rp {totalSales.toLocaleString('id-ID')}</span>
                </div>
              </div>
            )}

            {notes && (
              <div className="py-2 border-b border-dashed border-black text-[10px]">
                <span className="font-bold">Catatan:</span> {notes}
              </div>
            )}

            <div className="pt-4 grid grid-cols-2 text-center text-[10px] gap-4">
              <div>
                <p>Kasir Bertugas,</p>
                <div className="h-12"></div>
                <p className="border-t border-black pt-1">({shift.cashier_name || 'Kasir POS'})</p>
              </div>
              <div>
                <p>Supervisor / Pengurus,</p>
                <div className="h-12"></div>
                <p className="border-t border-black pt-1">( ........................... )</p>
              </div>
            </div>

            <div className="text-center pt-3 text-[9px] italic">
              Dicetak pada {currentDateStr} WIB
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <button
            type="button"
            onClick={handlePrintZReport}
            disabled={loadingSummary}
            className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition shadow-xs"
          >
            <span className="material-symbols-outlined text-base">print</span>
            <span>Cetak Struk Tutup Kasir (Z-Report)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs transition"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmitClose}
              disabled={submitting || loadingSummary || actualCash < 0 || isNaN(actualCash)}
              className="py-2.5 px-5 rounded-xl bg-primary hover:bg-primary-container text-white font-title-sm text-xs font-semibold shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition active:scale-98"
            >
              {submitting ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Menutup Shift...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">lock</span>
                  <span>Konfirmasi Tutup Shift Kasir</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Print Stylesheet for thermal receipt */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden !important; }
          #printable-zreport, #printable-zreport * { visibility: visible !important; }
          #printable-zreport {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            background: white !important;
            color: black !important;
          }
        }
      `}} />
    </div>
  );
}
