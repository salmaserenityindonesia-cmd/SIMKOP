import { useEffect, useState } from 'react';
import {
  Receipt,
  X,
  Copy,
  Check,
  Info,
  Tag,
} from 'lucide-react';

export type ShuSourceType =
  | 'pos_cash'
  | 'pos_deposit'
  | 'pos_credit'
  | 'pos_split'
  | 'goods_financing';

export interface ShuReferenceLineItem {
  productName: string;
  categoryName?: string;
  qty: number;
  sellPrice: number;
  buyPrice: number;
  subtotalOmzet: number;
  subtotalHpp: number;
  subtotalProfit: number;
}

export interface ShuReferenceRow {
  id: string;
  referenceNumber: string;
  sourceType: ShuSourceType;
  transactionDate: string;
  rawDate: string;
  memberName: string;
  memberNrp: string;
  paymentMethodLabel: string;
  omzet: number;
  hpp: number;
  grossProfit: number;
  marginPercent: number;
  discount?: number;
  repaymentAmount?: number;
  principalPortion?: number;
  loanNumber?: string | null;
  items: ShuReferenceLineItem[];
}

export interface ShuReferenceDetailModalProps {
  referenceItem: ShuReferenceRow | null;
  onClose: () => void;
}

const formatRp = (n: number): string =>
  'Rp ' + Math.round(n).toLocaleString('id-ID');

const extractTimeSuffix = (rawDate?: string | null): string => {
  if (!rawDate || !String(rawDate).includes('T')) return '';
  const d = new Date(rawDate);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return ` (${hh}:${mm})`;
};

export default function ShuReferenceDetailModal({
  referenceItem,
  onClose,
}: ShuReferenceDetailModalProps) {
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setCopied(false);
  }, [referenceItem]);

  useEffect(() => {
    if (!referenceItem) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [referenceItem, onClose]);

  if (!referenceItem) return null;

  const buyerDisplay = referenceItem.memberNrp
    ? `${referenceItem.memberNrp} - ${referenceItem.memberName}`
    : referenceItem.memberName;

  const totalQty = referenceItem.items.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const timeSuffix = extractTimeSuffix(referenceItem.rawDate);

  const handleCopyRef = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referenceItem.referenceNumber);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Non-blocking clipboard error
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm no-print"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shu-ref-modal-title"
        className="bg-white rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-indigo-200/80"
      >
        {/* ── HEADER MODAL ── */}
        <div className="px-6 py-4 bg-slate-900 text-white border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3
                  id="shu-ref-modal-title"
                  className="text-base sm:text-lg font-bold tracking-tight text-white"
                >
                  Rincian Bukti Transaksi Pembentuk SHU
                </h3>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-indigo-500/30 border border-indigo-400/40 font-mono text-xs font-bold text-indigo-100 tracking-wide">
                  {referenceItem.referenceNumber}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>
                  Tanggal: {referenceItem.transactionDate}
                  {timeSuffix}
                </span>
                <span className="text-slate-500">•</span>
                <span>Metode: {referenceItem.paymentMethodLabel}</span>
                <span className="text-slate-500">•</span>
                <span className="text-indigo-200 font-medium">
                  Pembeli: {buyerDisplay}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── BODY MODAL ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/70">
          {/* Kartu Ringkasan Angka (3 Kolom) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-blue-200 p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
                Total Omzet
              </p>
              <p
                className="text-xl font-bold text-blue-900 mt-1 tabular-nums"
                style={{ fontFamily: "'IBM Plex Serif', serif" }}
              >
                {formatRp(referenceItem.omzet)}
              </p>
              <p className="text-[11px] text-blue-600/80 mt-0.5">
                Nilai transaksi bersih
              </p>
            </div>

            <div className="bg-white rounded-xl border border-orange-200 p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-500" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
                Total HPP / Modal
              </p>
              <p
                className="text-xl font-bold text-orange-900 mt-1 tabular-nums"
                style={{ fontFamily: "'IBM Plex Serif', serif" }}
              >
                {formatRp(referenceItem.hpp)}
              </p>
              <p className="text-[11px] text-orange-600/80 mt-0.5">
                Akumulasi harga pokok item
              </p>
            </div>

            <div className="bg-white rounded-xl border border-emerald-200 p-4 shadow-xs relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                Laba Kotor / Kontribusi SHU
              </p>
              <p
                className="text-xl font-bold text-emerald-900 mt-1 tabular-nums"
                style={{ fontFamily: "'IBM Plex Serif', serif" }}
              >
                {formatRp(referenceItem.grossProfit)}
              </p>
              <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                Margin {referenceItem.marginPercent.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Banner Informasi Pembiayaan Barang (Pokok vs Margin SHU) */}
          {referenceItem.sourceType === 'goods_financing' &&
            Number(referenceItem.repaymentAmount || 0) > 0 && (
              <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    Pemisahan Porsi Angsuran Pembiayaan Barang
                    {referenceItem.loanNumber ? ` (${referenceItem.loanNumber})` : ''}
                  </p>
                  <p className="text-teal-800">
                    Total angsuran diterima sebesar{' '}
                    <strong className="tabular-nums">
                      {formatRp(referenceItem.repaymentAmount ?? 0)}
                    </strong>{' '}
                    terdiri atas{' '}
                    <strong className="tabular-nums">
                      Pokok Non-SHU: {formatRp(referenceItem.principalPortion ?? 0)}
                    </strong>{' '}
                    dan{' '}
                    <strong className="tabular-nums">
                      Realisasi Margin SHU: {formatRp(referenceItem.grossProfit)}
                    </strong>
                    .
                  </p>
                </div>
              </div>
            )}

          {/* Banner Informasi Diskon Nota */}
          {(referenceItem.discount ?? 0) > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <Tag className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>Diskon Nota: -{formatRp(referenceItem.discount ?? 0)}</strong> — Total Omzet
                bersih pada ringkasan dan baris TOTAL telah dikurangi potongan diskon transaksi.
              </p>
            </div>
          )}

          {/* Tabel Rincian Item Pembentuk Laba */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200/80 bg-slate-50/80 flex items-center justify-between gap-2">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                Daftar Item Pembentuk Laba
              </h4>
              <span className="text-[11px] font-medium text-slate-500">
                {referenceItem.items.length} item tercatat
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 w-12">NO</th>
                    <th className="text-left px-4 py-2.5">NAMA BARANG / URAIAN</th>
                    <th className="text-left px-4 py-2.5">KATEGORI</th>
                    <th className="text-right px-4 py-2.5">QTY</th>
                    <th className="text-right px-4 py-2.5">HARGA JUAL</th>
                    <th className="text-right px-4 py-2.5">HPP / MODAL</th>
                    <th className="text-right px-4 py-2.5">LABA KOTOR (RP)</th>
                  </tr>
                </thead>
                <tbody>
                  {referenceItem.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-500 text-xs sm:text-sm">
                        Tidak ada rincian item barang untuk referensi transaksi ini.
                      </td>
                    </tr>
                  ) : (
                    referenceItem.items.map((item, idx) => (
                      <tr
                        key={`${item.productName}-${idx}`}
                        className={`border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-50/40' : ''
                        }`}
                      >
                        <td className="px-4 py-2.5 text-slate-500 tabular-nums">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">
                          {item.productName}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80">
                            {item.categoryName || 'Lainnya'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-700">
                          {item.qty}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-blue-700 font-semibold whitespace-nowrap">
                          <div>{formatRp(item.subtotalOmzet)}</div>
                          {item.qty > 1 && (
                            <div className="text-[11px] font-normal text-slate-500">
                              {item.qty} × {formatRp(item.sellPrice)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-orange-700 font-semibold whitespace-nowrap">
                          <div>{formatRp(item.subtotalHpp)}</div>
                          {item.qty > 1 && (
                            <div className="text-[11px] font-normal text-slate-500">
                              {item.qty} × {formatRp(item.buyPrice)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 font-bold whitespace-nowrap">
                          {formatRp(item.subtotalProfit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {referenceItem.items.length > 0 && (
                  <tfoot className="bg-slate-100/90 border-t-2 border-slate-200">
                    <tr>
                      <td colSpan={3} className="px-4 py-3 font-bold text-slate-800 text-xs sm:text-sm">
                        TOTAL
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                        {totalQty}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-800 tabular-nums whitespace-nowrap">
                        {formatRp(referenceItem.omzet)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-orange-800 tabular-nums whitespace-nowrap">
                        {formatRp(referenceItem.hpp)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-800 tabular-nums whitespace-nowrap">
                        {formatRp(referenceItem.grossProfit)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* ── FOOTER MODAL ── */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopyRef}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tersalin!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin No. Referensi</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
