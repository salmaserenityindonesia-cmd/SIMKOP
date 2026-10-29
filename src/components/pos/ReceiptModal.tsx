import React, { useState, useEffect } from 'react';
import { useFeedback } from '../../context/FeedbackContext';
import { generateReceiptPdf, ReceiptItem, ReceiptPaymentInfo } from '../../utils/receiptPdfGenerator';
import { getKoperasiProfile, KoperasiProfile, DEFAULT_KOPERASI_PROFILE } from '../../services/settingsService';

interface ReceiptModalProps {
  isOpen: boolean;
  cart: ReceiptItem[];
  onClose: () => void;
  subtotal: number;
  discount: number;
  discountPercentage?: number;
  total: number;
  payment?: ReceiptPaymentInfo | null;
  saleNumber?: string | null;
  memberName?: string | null;
  cashierName?: string | null;
  profile?: KoperasiProfile | null;
}

export default function ReceiptModal({
  isOpen,
  cart,
  onClose,
  subtotal,
  discount,
  discountPercentage,
  total,
  payment,
  saleNumber,
  memberName,
  cashierName = 'Kasir Utama',
  profile
}: ReceiptModalProps) {
  const { showToast } = useFeedback();
  const [koperasiProfile, setKoperasiProfile] = useState<KoperasiProfile>(profile || DEFAULT_KOPERASI_PROFILE);

  useEffect(() => {
    if (profile) {
      setKoperasiProfile(profile);
    } else if (isOpen) {
      getKoperasiProfile().then(p => setKoperasiProfile(p));
    }
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const currentSaleNumber = saleNumber || `INV-${Date.now()}`;
  const effectiveDiscountPct = discountPercentage ?? (subtotal > 0 && discount > 0 ? Math.round((discount / subtotal) * 100) : 5);

  const handleWA = () => {
    let text = `${koperasiProfile.nama_koperasi}\n`;
    text += `No. Trx: ${currentSaleNumber}\n\n`;
    cart.forEach(c => text += `- ${c.name} (x${c.qty}): Rp ${(c.qty * c.price).toLocaleString('id-ID')}\n`);
    if (discount > 0) {
      text += `\nSubtotal: Rp ${subtotal.toLocaleString('id-ID')}\n`;
      text += `Diskon Anggota (${effectiveDiscountPct}%): - Rp ${discount.toLocaleString('id-ID')}\n`;
    }
    text += `\nTotal: Rp ${total.toLocaleString('id-ID')}\n`;
    if (koperasiProfile.telepon) {
      text += `Kontak: ${koperasiProfile.telepon}\n`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handlePDF = () => {
    try {
      generateReceiptPdf({
        saleNumber: currentSaleNumber,
        date: new Date(),
        cashierName: cashierName || 'Kasir Utama',
        memberName: memberName || undefined,
        cart,
        subtotal,
        discount,
        discountPercentage: effectiveDiscountPct,
        total,
        payment: payment || undefined,
        profile: koperasiProfile
      });
      showToast("Struk PDF berhasil diunduh", "success");
    } catch (err) {
      console.error("Gagal membuat PDF struk:", err);
      showToast("Gagal membuat struk PDF", "error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-primary/70 backdrop-blur-sm flex items-center justify-center p-3 lg:p-4">
      <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/60 shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in duration-150">
        <div className="bg-primary-container text-surface-container-lowest px-4 py-3 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary-fixed text-[20px]">receipt_long</span>
            <span className="font-title-md text-title-md">Struk Transaksi Selesai</span>
          </div>
          <button className="text-surface-container-lowest/80 hover:text-surface-container-lowest" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <div id="printable-receipt" className="p-4 bg-surface-container-low/50 overflow-y-auto custom-scrollbar flex-1 print:bg-white print:p-0">
          <div className="bg-surface-container-lowest p-5 rounded-lg border border-outline-variant/40 shadow-xs font-mono text-[12px] text-primary print:shadow-none print:border-none">
            {/* Header Koperasi */}
            <div className="text-center pb-3 border-b border-dashed border-outline-variant/80 space-y-1">
              <div className="font-bold text-[14px] leading-tight break-words">
                {koperasiProfile.nama_koperasi}
              </div>
              <div className="text-[11px] text-outline leading-normal break-words whitespace-pre-line">
                {koperasiProfile.alamat}
              </div>
              {(koperasiProfile.telepon || koperasiProfile.terminal_name) && (
                <div className="text-[10px] text-outline/80 pt-0.5 flex flex-wrap items-center justify-center gap-x-2">
                  {koperasiProfile.telepon && <span>Telp: {koperasiProfile.telepon}</span>}
                  {koperasiProfile.telepon && koperasiProfile.terminal_name && <span>|</span>}
                  {koperasiProfile.terminal_name && <span>{koperasiProfile.terminal_name}</span>}
                </div>
              )}
            </div>

            {/* Metadata Transaksi */}
            <div className="py-2 border-b border-dashed border-outline-variant/80 text-[11px] text-outline space-y-1">
              <div className="flex justify-between">
                <span>No. Trx:</span>
                <span className="font-mono text-primary font-bold">{currentSaleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu:</span>
                <span>{new Date().toLocaleString('id-ID')}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>{cashierName}</span>
              </div>
              {memberName && (
                <div className="flex justify-between">
                  <span>Anggota:</span>
                  <span className="text-primary font-medium">{memberName}</span>
                </div>
              )}
            </div>
            
            {/* Cart Items */}
            <div className="py-3 border-b border-dashed border-outline-variant/80 space-y-2">
              {cart.map((item, idx) => (
                <div key={idx}>
                  <div className="font-bold">{item.name}</div>
                  <div className="flex justify-between text-[11px] text-outline">
                    <span>{item.qty} {item.unit || ''} x Rp {item.price.toLocaleString('id-ID')}</span>
                    <span className="font-bold text-primary">Rp {(item.qty * item.price).toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Totals */}
            <div className="py-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span>Subtotal Kotor:</span>
                <span>Rp {subtotal.toLocaleString('id-ID')}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-secondary">
                  <span>Diskon Anggota ({effectiveDiscountPct}%):</span>
                  <span>- Rp {discount.toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between font-extrabold text-[13px] pt-1 border-t border-outline-variant/40 text-primary">
                <span>TOTAL AKHIR:</span>
                <span>Rp {total.toLocaleString('id-ID')}</span>
              </div>
            </div>

            {/* Payment Details */}
            {payment && (
              <div className="py-2.5 space-y-1 text-[11px] border-t border-dashed border-outline-variant/80">
                <div className="font-bold mb-1">Metode Pembayaran</div>
                {payment.paidCash !== undefined && payment.paidCash > 0 && (
                  <div className="flex justify-between">
                    <span>Tunai:</span>
                    <span>Rp {payment.paidCash.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {payment.paidDeposit !== undefined && payment.paidDeposit > 0 && (
                  <div className="flex justify-between">
                    <span>Simpanan Belanja:</span>
                    <span>Rp {payment.paidDeposit.toLocaleString('id-ID')}</span>
                  </div>
                )}
                {payment.paidCredit !== undefined && payment.paidCredit > 0 && (
                  <div className="flex justify-between">
                    <span>Bon Toko (Gaji):</span>
                    <span>Rp {payment.paidCredit.toLocaleString('id-ID')}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold pt-1 border-t border-outline-variant/40 mt-1">
                  <span>Kembalian:</span>
                  <span>
                    Rp {Math.max(
                      0,
                      ((payment.paidCash || 0) + (payment.paidDeposit || 0) + (payment.paidCredit || 0)) - total
                    ).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            )}

            {/* Footer Notes */}
            {koperasiProfile.footer_notes && (
              <div className="text-center pt-2.5 border-t border-dashed border-outline-variant/80 text-[10px] text-outline italic break-words whitespace-pre-line">
                {koperasiProfile.footer_notes}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-surface border-t border-outline-variant/30 flex flex-col gap-2 shrink-0 print:hidden">
          <button className="w-full py-2.5 bg-primary text-surface-container-lowest rounded-lg font-title-sm flex items-center justify-center gap-2 hover:bg-primary-container transition-colors shadow-sm" onClick={handlePrint}>
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>Direct Thermal Print (58/80mm)</span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-title-sm text-[13px] flex items-center justify-center gap-1.5 transition-colors" onClick={handleWA}>
              <span className="material-symbols-outlined text-[16px]">chat</span>
              <span>Kirim WhatsApp</span>
            </button>
            <button className="py-2 bg-surface-container-lowest border border-outline-variant text-primary hover:bg-surface-container rounded-lg font-title-sm text-[13px] flex items-center justify-center gap-1.5 transition-colors" onClick={handlePDF}>
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Download PDF</span>
            </button>
          </div>
          <button className="text-center text-label-md text-outline hover:text-primary py-1" onClick={onClose}>
            Selesai & Buka Transaksi Baru
          </button>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          #receiptModal { position: absolute; left: 0; top: 0; background: white; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
        }
      `}} />
    </div>
  );
}
