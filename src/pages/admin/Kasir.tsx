import React, { useState } from 'react';
import { useCart } from '../../lib/cartStore';
import { saveTransaction } from '../../services/koperasiService';

export default function Kasir() {
  const cart = useCart();
  const [barcode, setBarcode] = useState('');
  const [showParkModal, setShowParkModal] = useState(false);
  const [showParkedList, setShowParkedList] = useState(false);
  const [parkNote, setParkNote] = useState('');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCheckout = async () => {
    const payment = parseInt(paymentAmount.replace(/\D/g, ''), 10) || 0;
    if (payment < cart.total) {
      alert('Jumlah bayar kurang dari total transaksi.');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await saveTransaction(cart.items, cart.total, payment);
      alert('Transaksi berhasil disimpan!');
      cart.clearCart();
      setShowCheckoutModal(false);
      setPaymentAmount('');
    } catch (error: any) {
      alert(error.message || 'Gagal menyimpan transaksi');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    
    // TODO: implement real lookup logic
    cart.addItem({ 
      id: `barcode-${barcode}`, 
      name: `Produk Scan ${barcode}`, 
      price: 15000 
    });
    
    setBarcode('');
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Left Column: Catalog & Barcode */}
      <div className="flex-1 lg:w-2/3 flex flex-col gap-4">
        {/* Barcode Input */}
        <div className="bg-surface-container-lowest p-4 rounded-xl shadow-sm border border-outline-variant/30">
          <form onSubmit={handleBarcodeSubmit} className="flex gap-4">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">barcode_scanner</span>
              <input
                type="text"
                autoFocus
                placeholder="Scan barcode atau cari produk..."
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-body-lg"
              />
            </div>
            <button 
              type="submit"
              className="px-6 py-3 bg-primary text-on-primary rounded-lg font-title-sm shadow-sm hover:bg-primary/90 transition-colors"
            >
              Cari
            </button>
          </form>
        </div>

        {/* Product Catalog Grid Placeholder */}
        <div className="flex-1 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 overflow-y-auto">
          <h2 className="text-title-md font-title-md text-on-surface mb-4">Katalog Produk</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Placeholders */}
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div 
                key={i} 
                onClick={() => cart.addItem({ id: String(i), name: `Produk Dummy ${i}`, price: 10000 * i })}
                className="bg-surface-container-low rounded-lg p-4 border border-outline-variant/20 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 transition-colors"
              >
                <div className="w-16 h-16 bg-surface-container-high rounded-md flex items-center justify-center text-outline">
                  <span className="material-symbols-outlined text-3xl">inventory_2</span>
                </div>
                <div className="text-center">
                  <p className="font-title-sm text-on-surface">Produk {i}</p>
                  <p className="font-label-md text-primary">Rp 10.000</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column: Cart / Checkout */}
      <div className="w-full lg:w-1/3 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col relative">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-title-md font-title-md text-on-surface">Keranjang Belanja</h2>
          <button 
            onClick={() => setShowParkedList(true)}
            className="flex items-center gap-2 text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors bg-primary/5 border border-primary/20"
          >
            <span className="material-symbols-outlined text-sm">bookmark</span>
            <span className="font-label-md">Tersimpan ({cart.parkedTransactions.length})</span>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto pr-2">
          {cart.items.length === 0 ? (
            <div className="h-full border-2 border-dashed border-outline-variant/30 rounded-lg flex flex-col items-center justify-center text-outline-variant">
              <span className="material-symbols-outlined text-5xl mb-2">shopping_cart</span>
              <p className="font-body-md text-center">Keranjang masih kosong.<br/>Scan barcode untuk menambah produk.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {cart.items.map((item) => (
                <div key={item.id} className="flex flex-col p-3 border border-outline-variant/30 rounded-lg bg-surface">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-title-sm text-on-surface line-clamp-2">{item.name}</span>
                    <button 
                      onClick={() => cart.removeItem(item.id)}
                      className="text-error hover:bg-error/10 p-1 rounded-md transition-colors"
                    >
                      <span className="material-symbols-outlined text-xl">delete</span>
                    </button>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-label-md text-on-surface-variant">
                      Rp {item.price.toLocaleString('id-ID')}
                    </span>
                    <div className="flex items-center gap-2 bg-surface-container rounded-lg p-1">
                      <button 
                        onClick={() => cart.updateQty(item.id, item.qty - 1)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-surface-container-highest rounded transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">remove</span>
                      </button>
                      <span className="font-title-sm w-6 text-center">{item.qty}</span>
                      <button 
                        onClick={() => cart.updateQty(item.id, item.qty + 1)}
                        className="w-7 h-7 flex items-center justify-center hover:bg-surface-container-highest rounded transition-colors"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-right">
                    <span className="font-title-sm text-primary">
                      Rp {item.subtotal.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-6 mt-4 border-t border-outline-variant/30 flex flex-col gap-3">
          <div className="flex justify-between items-center mb-2">
            <span className="font-title-md text-on-surface-variant">Total</span>
            <span className="font-headline-sm text-primary">
              Rp {cart.total.toLocaleString('id-ID')}
            </span>
          </div>
          <button 
            onClick={() => setShowCheckoutModal(true)}
            disabled={cart.items.length === 0}
            className="w-full py-4 bg-primary text-on-primary rounded-lg font-title-md shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Bayar Transaksi
          </button>
          <button 
            onClick={() => setShowParkModal(true)}
            disabled={cart.items.length === 0}
            className="w-full py-3 bg-surface-container-high text-on-surface rounded-lg font-title-sm hover:bg-surface-container-highest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Simpan Transaksi (Park)
          </button>
        </div>
      </div>

      {/* Modals */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl p-6 shadow-xl border border-outline-variant/30">
            <h3 className="text-title-lg font-title-lg text-on-surface mb-6">Pembayaran</h3>
            
            <div className="mb-4">
              <p className="text-body-md text-on-surface-variant mb-1">Total Tagihan</p>
              <p className="text-headline-sm text-primary font-bold">Rp {cart.total.toLocaleString('id-ID')}</p>
            </div>
            
            <div className="mb-6">
              <label className="block text-body-md text-on-surface-variant mb-2">Jumlah Bayar</label>
              <input
                type="text"
                autoFocus
                value={paymentAmount}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  setPaymentAmount(val ? Number(val).toLocaleString('id-ID') : '');
                }}
                placeholder="0"
                className="w-full p-4 rounded-lg border border-outline-variant bg-surface text-title-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            
            <div className="mb-8 p-4 bg-surface-container rounded-lg">
              <p className="text-body-md text-on-surface-variant mb-1">Kembalian</p>
              <p className={`text-title-lg font-bold ${
                (parseInt(paymentAmount.replace(/\D/g, ''), 10) || 0) >= cart.total 
                  ? 'text-green-600' 
                  : 'text-error'
              }`}>
                Rp {((parseInt(paymentAmount.replace(/\D/g, ''), 10) || 0) - cart.total).toLocaleString('id-ID')}
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowCheckoutModal(false); setPaymentAmount(''); }}
                disabled={isSubmitting}
                className="px-5 py-3 text-on-surface-variant hover:bg-surface-container rounded-lg font-title-sm transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button 
                onClick={handleCheckout}
                disabled={isSubmitting || (parseInt(paymentAmount.replace(/\D/g, ''), 10) || 0) < cart.total}
                className="px-6 py-3 bg-primary text-on-primary rounded-lg font-title-md shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? 'Memproses...' : 'Selesaikan Pembayaran'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showParkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-2xl p-6 shadow-xl border border-outline-variant/30">
            <h3 className="text-title-lg font-title-lg text-on-surface mb-4">Simpan Transaksi</h3>
            <p className="text-body-md text-on-surface-variant mb-4">Masukkan catatan untuk transaksi ini agar mudah ditemukan nanti.</p>
            <input
              type="text"
              autoFocus
              value={parkNote}
              onChange={(e) => setParkNote(e.target.value)}
              placeholder="Contoh: Meja 4 / Pesanan Ibu Budi"
              className="w-full p-3 rounded-lg border border-outline-variant bg-surface focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-body-md mb-6"
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => { setShowParkModal(false); setParkNote(''); }}
                className="px-5 py-2.5 text-on-surface-variant hover:bg-surface-container rounded-lg font-title-sm transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={() => {
                  cart.parkCurrentTransaction(parkNote || 'Tanpa Catatan');
                  setShowParkModal(false);
                  setParkNote('');
                }}
                className="px-5 py-2.5 bg-primary text-on-primary rounded-lg font-title-sm shadow-sm hover:bg-primary/90 transition-colors"
              >
                Simpan (Park)
              </button>
            </div>
          </div>
        </div>
      )}

      {showParkedList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-surface-container-lowest w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl p-6 shadow-xl border border-outline-variant/30">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-title-lg font-title-lg text-on-surface">Transaksi Tersimpan</h3>
              <button 
                onClick={() => setShowParkedList(false)}
                className="text-on-surface-variant hover:bg-surface-container p-2 rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2">
              {cart.parkedTransactions.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-outline-variant border-2 border-dashed border-outline-variant/30 rounded-xl">
                  <span className="material-symbols-outlined text-4xl mb-2">bookmark_border</span>
                  <p className="font-body-md">Tidak ada transaksi tersimpan.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {cart.parkedTransactions.map((tx) => (
                    <div key={tx.id} className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex justify-between items-center">
                      <div>
                        <p className="font-title-md text-on-surface mb-1">{tx.note}</p>
                        <div className="flex gap-4 text-label-md text-on-surface-variant">
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">schedule</span> {new Date(tx.timestamp).toLocaleTimeString('id-ID')}</span>
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">inventory_2</span> {tx.items.length} Item</span>
                          <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">payments</span> Rp {tx.items.reduce((s, i) => s + i.subtotal, 0).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          if (cart.items.length > 0) {
                            if (!window.confirm('Keranjang aktif saat ini tidak kosong. Mengambil transaksi tersimpan akan menggantikan keranjang aktif. Lanjutkan?')) {
                              return;
                            }
                          }
                          cart.resumeTransaction(tx.id);
                          setShowParkedList(false);
                        }}
                        className="px-4 py-2 bg-primary/10 text-primary font-title-sm rounded-lg hover:bg-primary/20 transition-colors whitespace-nowrap"
                      >
                        Resume
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
