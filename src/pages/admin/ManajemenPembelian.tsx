import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getFakturPembelian, catatRestockFaktur, FakturPembelian, getProduk, Produk } from '../../services/koperasiService';

export default function ManajemenPembelian() {
  const [fakturList, setFakturList] = useState<FakturPembelian[]>([]);
  const [products, setProducts] = useState<Produk[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Mode
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [noFaktur, setNoFaktur] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
  
  // Cart items
  const [items, setItems] = useState<{ produkId: string; qty: number; hargaBeli: number }[]>([]);

  // Item Form Modal
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [hargaBeli, setHargaBeli] = useState(0);

  // View Detail Modal
  const [selectedFaktur, setSelectedFaktur] = useState<FakturPembelian | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [fakturData, produkData] = await Promise.all([
        getFakturPembelian(),
        getProduk()
      ]);
      setFakturList(fakturData);
      setProducts(produkData);
    } catch (error) {
      console.error('Failed to fetch data', error);
    } finally {
      setLoading(false);
    }
  };

  const getProductName = (id: string) => products.find(p => p.id === id)?.name || 'Produk Unknown';

  const handleOpenForm = () => {
    setNoFaktur('');
    setTanggal(new Date().toISOString().split('T')[0]);
    setItems([]);
    setIsFormOpen(true);
  };

  const handleOpenItemModal = () => {
    setSelectedProductId(products[0]?.id || '');
    setQty(1);
    setHargaBeli(products[0]?.buy_price || 0);
    setIsItemModalOpen(true);
  };

  const handleProductChange = (id: string) => {
    setSelectedProductId(id);
    const prod = products.find(p => p.id === id);
    if (prod) {
      setHargaBeli(prod.buy_price);
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    
    // Cek jika produk sudah ada di cart
    const existingIndex = items.findIndex(i => i.produkId === selectedProductId);
    if (existingIndex > -1) {
      const newItems = [...items];
      newItems[existingIndex].qty += qty;
      newItems[existingIndex].hargaBeli = hargaBeli; // update to latest typed price
      setItems(newItems);
    } else {
      setItems([...items, { produkId: selectedProductId, qty, hargaBeli }]);
    }
    setIsItemModalOpen(false);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSubmitFaktur = async () => {
    if (!noFaktur.trim()) {
      alert('Nomor Faktur harus diisi');
      return;
    }
    if (items.length === 0) {
      alert('Belum ada barang yang ditambahkan');
      return;
    }

    try {
      await catatRestockFaktur({
        noFaktur,
        tanggal,
        items
      });
      setIsFormOpen(false);
      fetchData();
    } catch (error: any) {
      alert(error.message || 'Terjadi kesalahan saat menyimpan faktur');
    }
  };

  const cartTotal = items.reduce((sum, item) => sum + (item.qty * item.hargaBeli), 0);

  if (isFormOpen) {
    return (
      <AdminLayout>
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-display-sm font-display-sm text-primary">Input Faktur Pembelian</h1>
              <p className="text-body-lg text-on-surface-variant mt-2">Catat barang masuk dari supplier</p>
            </div>
            <button 
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-primary font-label-lg hover:bg-primary/5 rounded-lg transition-colors"
            >
              Kembali
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 flex flex-col gap-4 bg-surface p-6 rounded-2xl shadow-sm border border-outline-variant">
              <h2 className="text-title-md font-medium text-on-surface border-b border-outline-variant/30 pb-3">Informasi Faktur</h2>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">No. Faktur</label>
                <input 
                  type="text" 
                  value={noFaktur}
                  onChange={(e) => setNoFaktur(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="INV/2026/..."
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">Tanggal</label>
                <input 
                  type="date" 
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  required
                />
              </div>
            </div>

            <div className="md:col-span-2 flex flex-col gap-4 bg-surface p-6 rounded-2xl shadow-sm border border-outline-variant">
              <div className="flex justify-between items-center border-b border-outline-variant/30 pb-3">
                <h2 className="text-title-md font-medium text-on-surface">Daftar Barang</h2>
                <button 
                  onClick={handleOpenItemModal}
                  className="flex items-center gap-1 bg-secondary/10 text-secondary px-3 py-1.5 rounded text-sm font-medium hover:bg-secondary/20 transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                  Tambah Barang
                </button>
              </div>

              {items.length === 0 ? (
                <div className="py-8 text-center text-on-surface-variant">
                  <p>Belum ada barang di faktur ini.</p>
                  <p className="text-sm">Klik "Tambah Barang" untuk mulai memasukkan produk.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant text-label-md text-on-surface-variant">
                        <th className="py-2 font-medium">Produk</th>
                        <th className="py-2 font-medium text-right">Qty</th>
                        <th className="py-2 font-medium text-right">Harga Beli</th>
                        <th className="py-2 font-medium text-right">Subtotal</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-b border-outline-variant/30">
                          <td className="py-3 text-body-md text-on-surface">{getProductName(item.produkId)}</td>
                          <td className="py-3 text-body-md text-on-surface text-right">{item.qty}</td>
                          <td className="py-3 text-body-md text-on-surface text-right">Rp {item.hargaBeli.toLocaleString('id-ID')}</td>
                          <td className="py-3 text-body-md font-medium text-on-surface text-right">
                            Rp {(item.qty * item.hargaBeli).toLocaleString('id-ID')}
                          </td>
                          <td className="py-3 text-right">
                            <button 
                              onClick={() => handleRemoveItem(idx)}
                              className="text-error hover:bg-error/10 p-1 rounded transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="py-4 text-right font-medium text-on-surface">Total Faktur:</td>
                        <td className="py-4 text-right font-bold text-primary text-title-md">
                          Rp {cartTotal.toLocaleString('id-ID')}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <button 
                  onClick={handleSubmitFaktur}
                  disabled={items.length === 0 || !noFaktur}
                  className="bg-primary text-on-primary px-8 py-2.5 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Simpan Faktur Pembelian
                </button>
              </div>
            </div>
          </div>
        </div>

        {isItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden shadow-lg border border-outline-variant/30">
              <div className="p-4 border-b border-outline-variant/30 flex justify-between items-center">
                <h3 className="font-medium text-on-surface">Tambah Barang Masuk</h3>
                <button onClick={() => setIsItemModalOpen(false)} className="text-on-surface-variant">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleAddItem} className="p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md text-on-surface-variant">Produk</label>
                  <select 
                    value={selectedProductId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 outline-none"
                    required
                  >
                    <option value="" disabled>Pilih Produk</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-label-md text-on-surface-variant">Qty</label>
                    <input 
                      type="number" 
                      value={qty}
                      onChange={(e) => setQty(Number(e.target.value))}
                      className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 outline-none"
                      min="1"
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-label-md text-on-surface-variant">Harga Beli Satuan</label>
                    <input 
                      type="number" 
                      value={hargaBeli}
                      onChange={(e) => setHargaBeli(Number(e.target.value))}
                      className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 outline-none"
                      min="0"
                      required
                    />
                  </div>
                </div>
                
                <button 
                  type="submit"
                  className="mt-2 bg-secondary text-on-secondary py-2 rounded-lg font-medium hover:bg-secondary/90 transition-colors"
                >
                  Tambahkan ke Faktur
                </button>
              </form>
            </div>
          </div>
        )}
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display-sm font-display-sm text-primary">Manajemen Pembelian</h1>
            <p className="text-body-lg text-on-surface-variant mt-2">Riwayat faktur pembelian / barang masuk</p>
          </div>
          <button 
            onClick={handleOpenForm}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">post_add</span>
            Input Faktur Baru
          </button>
        </div>

        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                  <th className="p-4 font-label-md">Tanggal</th>
                  <th className="p-4 font-label-md">No. Faktur</th>
                  <th className="p-4 font-label-md text-right">Jml Item</th>
                  <th className="p-4 font-label-md text-right">Total Nilai</th>
                  <th className="p-4 font-label-md text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant">Memuat data faktur...</td>
                  </tr>
                ) : fakturList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant">Belum ada riwayat pembelian.</td>
                  </tr>
                ) : (
                  fakturList.map((faktur) => (
                    <tr key={faktur.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="p-4 text-body-md text-on-surface">{faktur.tanggal}</td>
                      <td className="p-4 text-title-sm font-medium text-on-surface">{faktur.noFaktur}</td>
                      <td className="p-4 text-body-md text-on-surface text-right">{faktur.items.length} Macam</td>
                      <td className="p-4 text-body-md font-medium text-on-surface text-right">
                        Rp {faktur.totalNilai.toLocaleString('id-ID')}
                      </td>
                      <td className="p-4 flex items-center justify-center gap-2">
                        <button 
                          onClick={() => setSelectedFaktur(faktur)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-tertiary hover:bg-tertiary/10 transition-colors"
                          title="Lihat Detail Faktur"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedFaktur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-lowest">
              <div>
                <h2 className="text-title-lg font-title-lg text-on-surface">Detail Faktur</h2>
                <p className="text-body-md text-on-surface-variant mt-1 font-mono">{selectedFaktur.noFaktur} - {selectedFaktur.tanggal}</p>
              </div>
              <button onClick={() => setSelectedFaktur(null)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-outline-variant text-label-md text-on-surface-variant">
                    <th className="py-2 font-medium">Produk</th>
                    <th className="py-2 font-medium text-right">Qty</th>
                    <th className="py-2 font-medium text-right">Harga Beli</th>
                    <th className="py-2 font-medium text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedFaktur.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-outline-variant/30">
                      <td className="py-3 text-body-md text-on-surface">{getProductName(item.produkId)}</td>
                      <td className="py-3 text-body-md text-on-surface text-right">{item.qty}</td>
                      <td className="py-3 text-body-md text-on-surface text-right">Rp {item.hargaBeli.toLocaleString('id-ID')}</td>
                      <td className="py-3 text-body-md font-medium text-on-surface text-right">
                        Rp {(item.qty * item.hargaBeli).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-4 text-right font-medium text-on-surface">Total:</td>
                    <td className="py-4 text-right font-bold text-primary text-title-md">
                      Rp {selectedFaktur.totalNilai.toLocaleString('id-ID')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
