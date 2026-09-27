import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Produk, getProduk, addProduk, updateProduk, deleteProduk, RiwayatStok, getRiwayatStok, ProductCategory, getProductCategories } from '../../services/koperasiService';

export default function ManajemenProduk() {
  const [products, setProducts] = useState<Produk[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produk | null>(null);

  // Riwayat Stok state
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyProduct, setHistoryProduct] = useState<Produk | null>(null);
  const [stockHistory, setStockHistory] = useState<RiwayatStok[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sellPrice, setSellPrice] = useState(0);
  const [buyPrice, setBuyPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [minStockAlert, setMinStockAlert] = useState(0);
  const [unit, setUnit] = useState('pcs');

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const [data, catData] = await Promise.all([
        getProduk(),
        getProductCategories()
      ]);
      setProducts(data);
      setCategories(catData);
    } catch (error) {
      console.error('Failed to fetch products', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setName('');
    setSku('');
    setCategoryId('');
    setSellPrice(0);
    setBuyPrice(0);
    setStock(0);
    setMinStockAlert(0);
    setUnit('pcs');
    setIsModalOpen(true);
  };

  const openEditModal = (product: Produk) => {
    setEditingProduct(product);
    setName(product.name);
    setSku(product.sku);
    setCategoryId(product.category_id || '');
    setSellPrice(product.sell_price);
    setBuyPrice(product.buy_price);
    setStock(product.stock);
    setMinStockAlert(product.min_stock_alert);
    setUnit(product.unit || 'pcs');
    setIsModalOpen(true);
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
      const productData = {
        name,
        sku,
        category_id: categoryId || null,
        sell_price: sellPrice,
        buy_price: buyPrice,
        stock,
        min_stock_alert: minStockAlert,
        unit,
        is_active: true
      };

      if (editingProduct) {
        await updateProduk(editingProduct.id, productData);
      } else {
        await addProduk(productData);
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (error: any) {
      console.error('Error saving product', error);
      alert(error.message || 'Gagal menyimpan produk');
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

        {products.filter(p => p.stock <= p.min_stock_alert).length > 0 && !loading && (
          <div className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center gap-3 text-error">
            <span className="material-symbols-outlined">warning</span>
            <div className="flex-1">
              <p className="font-medium text-body-lg">
                {products.filter(p => p.stock <= p.min_stock_alert).length} produk perlu restock!
              </p>
              <p className="text-body-md text-error/80">
                Stok berada di bawah atau sama dengan batas minimum. Buka Manajemen Pembelian untuk restock.
              </p>
            </div>
          </div>
        )}

        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                  <th className="p-4 font-label-md">SKU/Barcode</th>
                  <th className="p-4 font-label-md">Nama Produk</th>
                  <th className="p-4 font-label-md text-right">Harga Beli</th>
                  <th className="p-4 font-label-md text-right">Harga Jual</th>
                  <th className="p-4 font-label-md text-right">Stok</th>
                  <th className="p-4 font-label-md text-right">Min. Stok</th>
                  <th className="p-4 font-label-md text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-on-surface-variant">Memuat data produk...</td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-on-surface-variant">Belum ada produk yang terdaftar.</td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="p-4 text-body-md text-on-surface font-mono text-sm">{p.sku}</td>
                      <td className="p-4 text-title-sm font-medium text-on-surface">{p.name}</td>
                      <td className="p-4 text-body-md text-on-surface text-right">
                        Rp {p.buy_price?.toLocaleString('id-ID') || 0}
                      </td>
                      <td className="p-4 text-body-md text-on-surface text-right">
                        Rp {p.sell_price?.toLocaleString('id-ID') || 0}
                      </td>
                      <td className="p-4 text-body-md text-right font-medium">
                        {p.stock <= p.min_stock_alert ? (
                          <span className="inline-flex items-center gap-1 text-error bg-error/10 px-2 py-0.5 rounded" title="Stok menipis">
                            <span className="material-symbols-outlined text-[14px]">warning</span>
                            {p.stock}
                          </span>
                        ) : (
                          <span className="text-on-surface">{p.stock}</span>
                        )}
                        <span className="text-xs text-on-surface-variant ml-1">{p.unit}</span>
                      </td>
                      <td className="p-4 text-body-md text-on-surface-variant text-right">
                        {p.min_stock_alert}
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">Kategori</label>
                <select 
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                >
                  <option value="">Pilih Kategori (Opsional)</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">SKU / Barcode</label>
                  <input 
                    type="text" 
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-mono"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Satuan</label>
                  <input 
                    type="text" 
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    placeholder="pcs, kg, dll"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Harga Beli (Rp)</label>
                  <input 
                    type="number" 
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="0"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Harga Jual (Rp)</label>
                  <input 
                    type="number" 
                    value={sellPrice}
                    onChange={(e) => setSellPrice(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="0"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Stok Awal</label>
                  <input 
                    type="number" 
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                    min="0"
                    disabled={!!editingProduct} // Disable stok edit for existing product
                    required
                  />
                  {editingProduct && (
                    <span className="text-[11px] text-outline">Ubah via Restock Pembelian</span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-label-md font-label-md text-on-surface-variant">Min. Stok (Alert)</label>
                  <input 
                    type="number" 
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(Number(e.target.value))}
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

      {isHistoryModalOpen && historyProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center">
              <div>
                <h2 className="text-title-lg font-title-lg text-on-surface">Kartu Stok</h2>
                <p className="text-body-md text-on-surface-variant mt-1">{historyProduct.name}</p>
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
