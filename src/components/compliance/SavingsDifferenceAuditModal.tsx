import React, { useState, useEffect } from 'react';
import {
  X,
  Receipt,
  ShoppingBag,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  User,
  CreditCard,
  Eye,
  FileText
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  getSavingsDiscrepancyBreakdown,
  DiscrepancyWithdrawalItem,
  SavingsDiscrepancyBreakdown
} from '../../services/savingsMatrixService';
import {
  getSaleDetailByInvoice,
  SaleDetail
} from '../../services/shoppingSavingsLedgerService';

export interface SavingsDifferenceAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  memberNrp: string;
  memberName: string;
  depositTypeCode: string; // e.g. 'BELANJA', 'WAJIB', 'LEBARAN'
  memberDepositId?: string;
  totalChecked: number;
  dbBalance: number;
  difference: number;
  initialBreakdown?: SavingsDiscrepancyBreakdown;
  initialLoading?: boolean;
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const SavingsDifferenceAuditModal: React.FC<SavingsDifferenceAuditModalProps> = ({
  isOpen,
  onClose,
  memberId,
  memberNrp,
  memberName,
  depositTypeCode,
  memberDepositId,
  totalChecked,
  dbBalance,
  difference,
  initialBreakdown,
  initialLoading = false
}) => {
  const [loading, setLoading] = useState(initialLoading);
  const [deductions, setDeductions] = useState<DiscrepancyWithdrawalItem[]>(
    initialBreakdown?.withdrawals || []
  );
  const [totalSpent, setTotalSpent] = useState<number>(
    initialBreakdown?.totalSpent || 0
  );
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState<boolean>(false);
  const [receiptDetail, setReceiptDetail] = useState<SaleDetail | null>(null);

  // Load breakdown data when modal opens
  useEffect(() => {
    if (!isOpen) {
      setSelectedInvoice(null);
      setReceiptDetail(null);
      return;
    }

    if (initialBreakdown) {
      setDeductions(initialBreakdown.withdrawals || []);
      setTotalSpent(initialBreakdown.totalSpent || 0);
      setLoading(false);
      return;
    }

    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      try {
        const data = await getSavingsDiscrepancyBreakdown(
          memberId,
          memberDepositId,
          depositTypeCode
        );
        if (isMounted) {
          setDeductions(data.withdrawals || []);
          setTotalSpent(data.totalSpent || 0);
        }
      } catch (err) {
        console.error('Gagal mengambil rincian selisih simpanan:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, memberId, memberDepositId, depositTypeCode, initialBreakdown]);

  // Load receipt detail when an invoice is clicked
  const handleOpenReceipt = async (invoiceNo: string) => {
    setSelectedInvoice(invoiceNo);
    setLoadingReceipt(true);
    setReceiptDetail(null);
    try {
      const detail = await getSaleDetailByInvoice(invoiceNo);
      setReceiptDetail(detail);
    } catch (err) {
      console.warn('Gagal memuat detail struk kasir:', err);
    } finally {
      setLoadingReceipt(false);
    }
  };

  if (!isOpen) return null;

  const balanceCheck = totalChecked - totalSpent;
  const isBalanced = balanceCheck === dbBalance;
  const unexplainedDiff = balanceCheck - dbBalance;

  const typeLabel =
    depositTypeCode.toUpperCase() === 'BELANJA'
      ? 'Simpanan Belanja'
      : depositTypeCode.toUpperCase() === 'WAJIB'
      ? 'Simpanan Wajib'
      : depositTypeCode.toUpperCase() === 'LEBARAN'
      ? 'Simpanan Lebaran'
      : `Simpanan ${depositTypeCode}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Modal */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/15">
              <Receipt className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 id="audit-modal-title" className="text-lg font-bold tracking-tight">
                Rincian Faktor Selisih Simpanan
              </h2>
              <p className="text-xs text-slate-300">
                Audit penyebab perbedaan antara Total Tercentang (Iuran Masuk) dengan Saldo Riil Database
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member & Account Info Banner */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 font-medium text-slate-700">
              <User className="w-4 h-4 text-slate-400" />
              <span>Anggota:</span>
              <span className="font-bold text-slate-900">{memberName}</span>
              <span className="text-slate-400 font-mono">({memberNrp || '-'})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Rekening:</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {typeLabel}
              </span>
            </div>
          </div>
          <div className="text-slate-500">
            Status Komparasi:{' '}
            <span
              className={`font-semibold ${
                difference > 0 ? 'text-amber-700' : 'text-slate-700'
              }`}
            >
              Selisih {formatCurrency(Math.abs(difference))} ({difference > 0 ? 'Lebih' : 'Kurang'})
            </span>
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Summary / Reconciliation Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Kartu 1 (Total Tercentang) */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-[11px] font-medium text-slate-500 mb-1">
                1. Total Tercentang
              </div>
              <div className="text-base font-bold text-slate-800 font-mono">
                Rp {totalChecked.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Akumulasi iuran komitmen
              </div>
            </div>

            {/* Kartu 2 (Pengurang Belanja/Tarik) */}
            <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/60">
              <div className="text-[11px] font-medium text-rose-700 mb-1 flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5" />
                2. Pengurang (Belanja/Tarik)
              </div>
              <div className="text-base font-bold text-rose-600 font-mono">
                - Rp {totalSpent.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-rose-500 mt-1">
                {deductions.length} transaksi pemakaian
              </div>
            </div>

            {/* Kartu 3 (Saldo Riil Database) */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
              <div className="text-[11px] font-medium text-slate-500 mb-1">
                3. Saldo Riil Database
              </div>
              <div className="text-base font-bold text-slate-800 font-mono">
                Rp {dbBalance.toLocaleString('id-ID')}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">
                Saldo bersih mengendap
              </div>
            </div>

            {/* Kartu 4 (Neraca Rekonsiliasi) */}
            <div
              className={`p-3.5 rounded-xl border ${
                isBalanced
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-amber-200 bg-amber-50/60'
              }`}
            >
              <div className="text-[11px] font-medium text-slate-600 mb-1 flex items-center gap-1">
                {isBalanced ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>4. Neraca Rekonsiliasi</span>
              </div>
              <div
                className={`text-sm font-bold ${
                  isBalanced ? 'text-emerald-700' : 'text-amber-800'
                }`}
              >
                {isBalanced ? 'SEIMBANG / SESUAI' : `Selisih Rp ${Math.abs(unexplainedDiff).toLocaleString('id-ID')}`}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {isBalanced
                  ? 'Total Tercentang - Pemakaian Belanja = Saldo Riil Database'
                  : 'Ada selisih lain di luar pemakaian'}
              </div>
            </div>
          </div>

          {/* Infobox Edukatif Akuntansi */}
          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs flex gap-3 items-start">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">
                Penjelasan Logika Akuntansi &amp; Sistem Matriks:
              </p>
              <p className="leading-relaxed text-amber-800">
                {depositTypeCode.toUpperCase() === 'BELANJA' ? (
                  <>
                    Selisih ini terjadi secara sah karena anggota telah menggunakan saldo{' '}
                    <strong>Simpanan Belanja</strong> untuk bertransaksi di Kasir POS Toko sebesar{' '}
                    <strong className="underline">Rp {totalSpent.toLocaleString('id-ID')}</strong>. Kotak
                    iuran bulanan pada matriks tetap tercentang lunas karena kewajiban setoran
                    anggota terpenuhi penuh, sedangkan saldo bersih database berkurang saat barang
                    dibeli di kasir.
                  </>
                ) : (
                  <>
                    Selisih ini terjadi secara sah karena adanya transaksi penarikan saldo simpanan
                    sebesar{' '}
                    <strong className="underline">Rp {totalSpent.toLocaleString('id-ID')}</strong>. Kotak
                    iuran bulanan pada matriks tetap tercentang lunas sesuai riwayat setoran
                    komitmen anggota.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Table Transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <span>Rincian Transaksi Pengurang Saldo (Faktor Selisih)</span>
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                Total: {deductions.length} Transaksi
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                <span>Memuat data mutasi pembentuk selisih...</span>
              </div>
            ) : deductions.length === 0 ? (
              <div className="py-10 px-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <ShoppingBag className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">
                  Tidak ada transaksi pengeluaran/belanja tercatat
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Selisih mungkin bersumber dari selisih migrasi awal atau setoran belum teralokasi.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 font-semibold">
                        <th className="py-2.5 px-3">Tanggal &amp; Jam</th>
                        <th className="py-2.5 px-3">No. Referensi / Struk</th>
                        <th className="py-2.5 px-3">Keterangan / Uraian</th>
                        <th className="py-2.5 px-3">Metode</th>
                        <th className="py-2.5 px-3 text-right">Nominal Keluar</th>
                        <th className="py-2.5 px-2 text-center w-20">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deductions.map((tx: DiscrepancyWithdrawalItem) => (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap font-mono text-[11px]">
                            {formatDateTime(tx.transaction_date || tx.created_at)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-800 whitespace-nowrap">
                            {tx.reference_no || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            <div>
                              <span className="font-medium text-slate-700">
                                {tx.description || (tx.is_pos_sale ? 'Belanja Kasir POS' : 'Pengeluaran Simpanan')}
                              </span>
                              {tx.cashier_name && (
                                <span className="block text-[10px] text-slate-400">
                                  Kasir: {tx.cashier_name}
                                </span>
                              )}
                              {tx.notes && (
                                <span className="block text-[10px] text-slate-400 italic">
                                  {tx.notes}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {tx.is_pos_sale ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                                  <ShoppingBag className="w-3 h-3" />
                                  Kasir POS Toko
                                </span>
                                {tx.payment_method && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {tx.payment_method}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 w-fit">
                                  <CreditCard className="w-3 h-3" />
                                  Penarikan Tunai
                                </span>
                                {tx.payment_method && (
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    {tx.payment_method}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                            - Rp {Number(tx.amount || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {tx.reference_no && tx.is_pos_sale ? (
                              <button
                                type="button"
                                onClick={() => handleOpenReceipt(tx.reference_no!)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors"
                                title="Lihat rincian struk kasir"
                              >
                                <Eye className="w-3 h-3 text-slate-500" />
                                Struk
                              </button>
                            ) : (
                              <span className="text-slate-300 text-[11px]">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-800">
                        <td colSpan={4} className="py-2.5 px-3 text-right">
                          Total Faktor Pengurang:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 text-xs">
                          - Rp {totalSpent.toLocaleString('id-ID')}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            Sistem Matriks Simpanan • SIMKOP Compliance &amp; Audit Engine
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            Tutup Dialog Audit
          </button>
        </div>
      </div>

      {/* Sub-modal: Drill-Down Struk Belanja POS */}
      {selectedInvoice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-dialog-title"
          className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Struk Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <h4 id="receipt-dialog-title" className="text-sm font-bold">
                  Struk Belanja Kasir POS
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Struk Content */}
            <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4 text-xs font-mono">
              {loadingReceipt ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                  <span>Mengambil data struk penjualan...</span>
                </div>
              ) : receiptDetail ? (
                <div className="space-y-3">
                  <div className="text-center pb-3 border-b border-dashed border-slate-300">
                    <div className="font-bold text-sm text-slate-900 font-sans">
                      TOKO KOPERASI KARTIKA
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      No: {receiptDetail.sale_number}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {formatDateTime(receiptDetail.created_at)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Kasir: {receiptDetail.cashier_name} | Anggota: {receiptDetail.member_name}
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 py-2 border-b border-dashed border-slate-300">
                    {receiptDetail.items && receiptDetail.items.length > 0 ? (
                      receiptDetail.items.map((item, idx) => (
                        <div key={item.id || idx} className="flex justify-between items-start text-[11px]">
                          <div>
                            <div className="font-semibold text-slate-800">{item.product_name}</div>
                            <div className="text-[10px] text-slate-500">
                              {item.quantity} x {Number(item.unit_price).toLocaleString('id-ID')}
                            </div>
                          </div>
                          <div className="font-bold text-slate-900 font-mono">
                            {Number(item.subtotal).toLocaleString('id-ID')}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-slate-400 text-center py-2 text-[11px]">
                        Rincian item tidak tercatat
                      </div>
                    )}
                  </div>

                  {/* Payment totals */}
                  <div className="space-y-1 pt-1 text-[11px]">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Belanja:</span>
                      <span className="font-bold text-slate-800">
                        {formatCurrency(receiptDetail.total_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded">
                      <span>Potong Simpanan Belanja:</span>
                      <span>- {formatCurrency(receiptDetail.paid_deposit)}</span>
                    </div>
                    {receiptDetail.paid_cash > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>Bayar Tunai:</span>
                        <span>{formatCurrency(receiptDetail.paid_cash)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-500">
                  <p>Struk dengan nomor <strong>{selectedInvoice}</strong> tidak ditemukan di database penjualan.</p>
                </div>
              )}
            </div>

            {/* Struk Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-medium transition-colors"
              >
                Tutup Struk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

