import React, { useState } from 'react';
import { useCart } from '../../lib/cartStore';

export default function Kasir() {
  const cart = useCart();
  const [barcode, setBarcode] = useState('');

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
      <div className="w-full lg:w-1/3 bg-surface-container-lowest p-6 rounded-xl shadow-sm border border-outline-variant/30 flex flex-col">
        <h2 className="text-title-md font-title-md text-on-surface mb-4">Keranjang Belanja</h2>
        
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

        <div className="pt-6 mt-4 border-t border-outline-variant/30">
          <div className="flex justify-between items-center mb-4">
            <span className="font-title-md text-on-surface-variant">Total</span>
            <span className="font-headline-sm text-primary">
              Rp {cart.total.toLocaleString('id-ID')}
            </span>
          </div>
          <button 
            disabled={cart.items.length === 0}
            className="w-full py-4 bg-primary text-on-primary rounded-lg font-title-md shadow-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Bayar Transaksi
          </button>
        </div>
      </div>
    </div>
  );
}
