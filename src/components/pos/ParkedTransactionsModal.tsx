import React, { useState, useEffect } from 'react';
import {
  ParkedSale,
  getParkedSales,
  resumeParkedSale,
  cancelAndRestockParkedSale
} from '../../services/posParkedService';
import { CartItem } from '../../pages/pos';
import { useFeedback } from '../../context/FeedbackContext';
import {
  PauseCircle,
  X,
  Clock,
  RotateCcw,
  Trash2,
  User,
  ShoppingBag,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface ParkedTransactionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReload: (items: CartItem[], memberId?: string | null) => void;
}

export default function ParkedTransactionsModal({
  isOpen,
  onClose,
  onReload,
}: ParkedTransactionsModalProps) {
  const { showToast } = useFeedback();
  const [parkedList, setParkedList] = useState<ParkedSale[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadParked();
    }
  }, [isOpen]);

  const loadParked = async () => {
    setIsLoading(true);
    try {
      const data = await getParkedSales();
      setParkedList(data);
    } catch (err: any) {
      showToast('Gagal memuat daftar belanja ditahan', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async (sale: ParkedSale) => {
    setActionLoadingId(sale.id);
    try {
      const res = await resumeParkedSale(sale.id);
      if (res.success && res.cartItems) {
        showToast(`Transaksi #${sale.sale_number} berhasil dimuat kembali ke kasir.`, 'success');
        onReload(res.cartItems, res.memberId);
        onClose();
      } else {
        showToast(res.error || 'Gagal memuat transaksi.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelAndRestock = async (sale: ParkedSale) => {
    setActionLoadingId(sale.id);
    try {
      const res = await cancelAndRestockParkedSale(sale.id);
      if (res.success) {
        showToast(`Transaksi #${sale.sale_number} dibatalkan & ${res.restoredCount} stok barang dikembalikan ke katalog.`, 'success');
        await loadParked();
      } else {
        showToast(res.error || 'Gagal membatalkan transaksi.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan saat membatalkan transaksi', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatRemainingTime = (expiresAt: string) => {
    if (!expiresAt) return { text: 'Tanpa Batas', expired: false };
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) {
      return { text: 'Kadaluwarsa', expired: true };
    }
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 60) {
      return { text: `Tersisa ${diffMinutes} mnt`, expired: false };
    }
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return { text: `Tersisa ${hours}j ${mins}m`, expired: false };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl shadow-2xl border border-outline-variant/30 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-secondary/10 text-secondary">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-on-surface">Daftar Transaksi Ditahan (Parked)</h2>
                <span className="px-2 py-0.5 rounded-full bg-secondary/15 text-secondary text-xs font-bold font-mono">
                  {parkedList.length}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant">
                Stok barang direservasi sementara. Transaksi kadaluwarsa otomatis dibatalkan dan stok dikembalikan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadParked}
              disabled={isLoading}
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
              title="Segarkan daftar"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container rounded-lg transition-colors"
              title="Tutup (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-3">
          {isLoading && parkedList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-xs text-on-surface-variant">Memeriksa daftar transaksi tertahan...</p>
            </div>
          ) : parkedList.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 border-2 border-dashed border-outline-variant/30 rounded-xl">
              <div className="p-3 rounded-full bg-surface-container-high text-on-surface-variant">
                <ShoppingBag className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface">Tidak Ada Belanjaan Ditahan</h3>
                <p className="text-xs text-on-surface-variant max-w-sm">
                  Saat kasir melayani antrean lain, tekan tombol <strong>Tahan [F8]</strong> untuk menyimpan belanjaan sementara tanpa membatalkan barang.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {parkedList.map(sale => {
                const timeStatus = formatRemainingTime(sale.expires_at);
                const isItemLoading = actionLoadingId === sale.id;

                return (
                  <div
                    key={sale.id}
                    className={`p-4 rounded-xl border transition-all ${
                      timeStatus.expired
                        ? 'bg-error-container/10 border-error/30'
                        : 'bg-surface-container-low/40 border-outline-variant/30 hover:border-outline-variant/60'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/20">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                            #{sale.sale_number}
                          </span>
                          <span className="text-xs font-semibold text-on-surface flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-on-surface-variant" />
                            {sale.member_name || sale.customer_note || 'Pelanggan Umum'}
                          </span>
                        </div>
                        <div className="text-[11px] text-on-surface-variant flex items-center gap-2">
                          <Clock className="w-3 h-3" />
                          <span>Disimpan: {new Date(sale.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 font-mono ${
                          timeStatus.expired
                            ? 'bg-error/15 text-error border border-error/30'
                            : 'bg-secondary/15 text-secondary border border-secondary/30'
                        }`}>
                          <Clock className="w-3 h-3" />
                          <span>{timeStatus.text}</span>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-bold text-on-surface font-mono">
                            Rp {Number(sale.total_amount || 0).toLocaleString('id-ID')}
                          </div>
                          <div className="text-[10px] text-on-surface-variant">
                            {sale.items.reduce((s, i) => s + i.quantity, 0)} item
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Items Preview */}
                    <div className="py-2.5 flex flex-wrap gap-1.5 items-center text-xs">
                      {sale.items.map((item, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-surface-container-high/60 border border-outline-variant/20 text-[11px] text-on-surface"
                        >
                          {item.product_name} <strong className="text-primary font-mono">×{item.quantity}</strong>
                        </span>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleCancelAndRestock(sale)}
                        disabled={isItemLoading}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg text-error hover:bg-error-container/30 border border-error/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        title="Hapus transaksi ini dan kembalikan kuantitas barang ke stok katalog"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus & Restock</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResume(sale)}
                        disabled={isItemLoading}
                        className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-surface-container-lowest flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                        title="Kembalikan barang ke kasir aktif untuk melanjutkan pembayaran"
                      >
                        <RotateCcw className={`w-3.5 h-3.5 ${isItemLoading ? 'animate-spin' : ''}`} />
                        <span>Muat Kembali</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/50 flex items-center justify-between text-xs text-on-surface-variant">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-secondary" />
            <span>Shortcut Tahan: <strong>F8</strong></span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-medium transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

