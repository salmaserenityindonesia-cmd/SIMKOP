import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Produk, getProduk, addProduk, updateProduk, deleteProduk, catatRestock, RiwayatStok, getRiwayatStok } from '../../services/koperasiService';

export default function ManajemenProduk() {
  const [products, setProducts] = useState<Produk[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produk | null>(null);

  // Restock state
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Produk | null>(null);
  const [restockQty, setRestockQty] = useState(0);
  const [restockHargaBeli, setRestockHargaBeli] = useState(0);
  const [restockNoFaktur, setRestockNoFaktur] = useState('');
  const [restockTanggal, setRestockTanggal] = useState(new Date().toISOString().split('T')[0]);

  // Riwayat Stok state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Produk | null>(null);
  const [stockHistory, setStockHistory] = useState<RiwayatStok[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form state
  const [nama, setNama] = useState('');
  const [barcode, setBarcode] = useState('');
  const [hargaJual, setHargaJual] = useState(0);
  const [stok, setStok] = useState(0);
  const [stokMinimum, setStokMinimum] = useState(0);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await getProduk();
      setProducts(data);
    } catch (error) {
      console.error('Failed to fetch products', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setNama('');
    setBarcode('');
    setHargaJual(0);
    setStok(0);
    setStokMinimum(0);
    setIsModalOpen(true);
  };

  const openEditModal = (product: Produk) => {
    setEditingProduct(product);
    setNama(product.nama);
    setBarcode(product.barcode);
    setHargaJual(product.hargaJual);
    setStok(product.stok);
    setStokMinimum(product.stokMinimum);
    setIsModalOpen(true);
  };

  const openRestockModal = (product: Produk) => {
    setRestockProduct(product);
    setRestockQty(0);
    setRestockHargaBeli(0);
    setRestockNoFaktur('');
    setRestockTanggal(new Date().toISOString().split('T')[0]);
    setIsRestockModalOpen(true);
  };

  const openHistoryModal = async (product: Produk) => {
    setHistoryProduct(product);
    setIsHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const data = await getRiwayatStok(product.id);
      setStockHistory(data);
    } catch (error) {
      console.error('Failed to load stock history', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await updateProduk(editingProduct.id, { nama, barcode, hargaJual, stok, stokMinimum });
      } else {
        await addProduk({ nama, barcode, hargaJual, stok, stokMinimum });
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (error) {
      console.error('Error saving product', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus produk ini?')) {
      try {
        await deleteProduk(id);
        fetchProducts();
      } catch (error) {
        console.error('Error deleting product', error);
      }
    }
  };

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    try {
      await catatRestock({
        produkId: restockProduct.id,
        qty: restockQty,
        hargaBeli: restockHargaBeli,
        noFaktur: restockNoFaktur,
        tanggal: restockTanggal
      });
      setIsRestockModalOpen(false);
      fetchProducts();
    } catch (error: any) {
      alert(error.message || 'Error recording restock');
      console.error('Error recording restock', error);
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display-sm font-display-sm text-primary">Katalog Produk</h1>
            <p className="text-body-lg text-on-surface-variant mt-2">Kelola master data produk dan inventory</p>
          </div>
          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Tambah Produk
          </button>
        </div>

        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                  <th className="p-4 font-label-md">SKU/Barcode</th>
                  <th className="p-4 font-label-md">Nama Produk</th>
                  <th className="p-4 font-label-md text-right">Harga Jual</th>
                  <th className="p-4 font-label-md text-right">Stok</th>
                  <th className="p-4 font-label-md text-right">Min. Stok</th>
                  <th className="p-4 font-label-md text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-on-surface-variant">Memuat data produk...</td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-on-surface-variant">Belum ada produk yang terdaftar.</td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="p-4 text-body-md text-on-surface font-mono text-sm">{p.barcode}</td>
                      <td className="p-4 text-title-sm font-medium text-on-surface">{p.nama}</td>
                      <td className="p-4 text-body-md text-on-surface text-right">
                        Rp {p.hargaJual.toLocaleString('id-ID')}
                      </td>
                      <td className="p-4 text-body-md text-on-surface text-right font-medium">
                        {p.stok}
                      </td>
                      <td className="p-4 text-body-md text-on-surface-variant text-right">
                        {p.stokMinimum}
                      </td>
                      <td className="p-4 flex items-center justify-center gap-2">
                        <button 
                          onClick={() => openHistoryModal(p)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-tertiary hover:bg-tertiary/10 transition-colors"
                          title="Kartu Stok (Riwayat)"
                        >
                          <span className="material-symbols-outlined text-[18px]">history</span>
                        </button>
                        <button 
                          onClick={() => openRestockModal(p)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-secondary hover:bg-secondary/10 transition-colors"
                          title="Restock Produk"
                        >
                          <span className="material-symbols-outlined text-[18px]">inventory_2</span>
                        </button>
                        <button 
                          onClick={() => openEditModal(p)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                          title="Edit Produk"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDelete(p.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-error hover:bg-error/10 transition-colors"
                          title="Hapus Produk"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
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

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col">
            <div className="p-6 border-b border-outline-variant/30">
              <h2 className="text-title-lg font-title-lg text-on-surface">
                {editingProduct ? 'Edit Produk' : 'Tambah Produk Baru'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col flex-1 p-6 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">Nama Produk</label>
                <input 
                  type="text" 
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">SKU / Barcode</label>
                <input 
                  type="text" 
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-mono"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">Harga Jual (Rp)</label>
                <input 
                  type="number" 
                  value={hargaJual}
                  onChange={(e) => setHargaJual(Number(e.target.value))}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  min="0"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Stok Awal</label>
                  <input 
                    type="number" 
                    value={stok}
                    onChange={(e) => setStok(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="0"
                    disabled={!!editingProduct} // Disable stok edit for existing product
                    required
                  />
                  {editingProduct && (
                    <span className="text-[11px] text-outline">Ubah via Restock</span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Min. Stok (Alert)</label>
                  <input 
                    type="number" 
                    value={stokMinimum}
                    onChange={(e) => setStokMinimum(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/30 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-primary font-label-lg hover:bg-primary/5 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRestockModalOpen && restockProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col">
            <div className="p-6 border-b border-outline-variant/30">
              <h2 className="text-title-lg font-title-lg text-on-surface">
                Restock: {restockProduct.nama}
              </h2>
            </div>
            
            <form onSubmit={handleRestockSubmit} className="flex flex-col flex-1 p-6 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">Tanggal Restock</label>
                <input 
                  type="date" 
                  value={restockTanggal}
                  onChange={(e) => setRestockTanggal(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">No. Faktur (Supplier)</label>
                <input 
                  type="text" 
                  value={restockNoFaktur}
                  onChange={(e) => setRestockNoFaktur(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Mis. INV/2026/09/123"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Qty Masuk</label>
                  <input 
                    type="number" 
                    value={restockQty}
                    onChange={(e) => setRestockQty(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="1"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Harga Beli Satuan (Rp)</label>
                  <input 
                    type="number" 
                    value={restockHargaBeli}
                    onChange={(e) => setRestockHargaBeli(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline-variant/30 mt-4">
                <button 
                  type="button"
                  onClick={() => setIsRestockModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-primary font-label-lg hover:bg-primary/5 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
                >
                  Simpan Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isHistoryModalOpen && historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
              <div>
                <h2 className="text-title-lg font-title-lg text-on-surface">Kartu Stok</h2>
                <p className="text-body-md text-on-surface-variant mt-1">{historyProduct.nama}</p>
              </div>
              <button onClick={() => setIsHistoryModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {loadingHistory ? (
                <div className="text-center py-8 text-on-surface-variant">Memuat riwayat stok...</div>
              ) : stockHistory.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant">Belum ada riwayat pergerakan stok.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                      <th className="p-3 font-label-md">Tanggal</th>
                      <th className="p-3 font-label-md">Keterangan</th>
                      <th className="p-3 font-label-md text-center">Tipe</th>
                      <th className="p-3 font-label-md text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockHistory.map(h => (
                      <tr key={h.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                        <td className="p-3 text-body-md text-on-surface">{h.tanggal}</td>
                        <td className="p-3 text-body-md text-on-surface">{h.keterangan}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${h.tipe === 'in' ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
                            {h.tipe === 'in' ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td className="p-3 text-body-md font-medium text-right text-on-surface">{h.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
