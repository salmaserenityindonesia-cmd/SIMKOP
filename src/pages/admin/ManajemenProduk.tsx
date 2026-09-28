import React, { useEffect, useState, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { Produk, getProduk, addProduk, updateProduk, deleteProduk, RiwayatStok, getRiwayatStok, ProductCategory, getProductCategories } from '../../services/koperasiService';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import ProductImportModal from '../../components/products/ProductImportModal';
import { exportProductTemplate, parseProductUpload, batchUpsertProducts, ProductParseResult } from '../../services/productExcelService';

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
  const [historyStartDate, setHistoryStartDate] = useState('');
  const [historyEndDate, setHistoryEndDate] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sellPrice, setSellPrice] = useState(0);
  const [buyPrice, setBuyPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [minStockAlert, setMinStockAlert] = useState(0);
  const [unit, setUnit] = useState('pcs');

  // Import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parseResult, setParseResult] = useState<ProductParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Sorting states
  type SortField = 'name' | 'buy_price' | 'sell_price' | 'stock' | '';
  const [sortField, setSortField] = useState<SortField>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');

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
    setHistoryStartDate('');
    setHistoryEndDate('');
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

  // Hitung filter & saldo awal untuk kartu stok
  let displayedHistory = stockHistory;
  let openingBalance = 0;
  let showOpeningBalance = false;

  if (historyStartDate || historyEndDate) {
    const start = historyStartDate ? new Date(historyStartDate).getTime() : 0;
    // End date covers the whole day
    const end = historyEndDate ? new Date(historyEndDate + 'T23:59:59').getTime() : Infinity;

    if (historyStartDate) {
      showOpeningBalance = true;
      const beforeStart = stockHistory.filter(h => new Date(h.tanggal).getTime() < start);
      beforeStart.forEach(h => {
        if (h.tipe === 'in') openingBalance += h.qty;
        else if (h.tipe === 'out') openingBalance -= h.qty;
      });
    }

    displayedHistory = stockHistory.filter(h => {
      const t = new Date(h.tanggal).getTime();
      return t >= start && t <= end;
    });
  }

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseProductUpload(file);
      setParseResult(result);
      setIsImportModalOpen(true);
    } catch (error: any) {
      alert(error.message || 'Gagal memproses file Excel');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportConfirm = async () => {
    if (!parseResult) return;
    
    setIsImporting(true);
    try {
      await batchUpsertProducts(parseResult);
      setIsImportModalOpen(false);
      fetchProducts();
      alert('Berhasil mengimpor katalog produk!');
    } catch (error: any) {
      alert(error.message || 'Gagal mengimpor produk');
    } finally {
      setIsImporting(false);
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

  const handleExportExcel = () => {
    exportToExcel(products, 'Data_Produk');
  };

  const handleExportPDF = () => {
    const headers = ['SKU/Barcode', 'Nama Produk', 'Harga Beli', 'Harga Jual', 'Stok', 'Min. Stok', 'Satuan'];
    const data = products.map(p => [
      p.sku,
      p.name,
      `Rp ${p.buy_price?.toLocaleString('id-ID') || 0}`,
      `Rp ${p.sell_price?.toLocaleString('id-ID') || 0}`,
      p.stock,
      p.min_stock_alert,
      p.unit || 'pcs'
    ]);
    exportToPDF(headers, data, 'Data_Produk', 'Laporan Data Produk Koperasi');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (!sortField) return 0;
    const modifier = sortDirection === 'asc' ? 1 : -1;
    const valA = a[sortField];
    const valB = b[sortField];
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display-sm font-display-sm text-primary">Katalog Produk</h1>
            <p className="text-body-lg text-on-surface-variant mt-2">Kelola master data produk dan inventory</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={exportProductTemplate}
              className="flex items-center gap-2 bg-surface-container-lowest border border-outline text-primary px-4 py-2 rounded-lg font-label-lg shadow-sm hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              Unduh Template
            </button>
            <input 
              type="file" 
              accept=".xlsx" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-secondary text-on-secondary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-secondary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              Import
            </button>
            <div className="w-px h-6 bg-outline-variant/50 mx-1"></div>
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg font-label-lg shadow hover:bg-green-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              Excel
            </button>
            <button 
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg font-label-lg shadow hover:bg-red-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              PDF
            </button>
            <button 
              onClick={openAddModal}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Tambah Produk
            </button>
          </div>
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

        <div className="flex items-center gap-2 bg-surface px-4 py-2 rounded-xl border border-outline-variant max-w-md">
          <span className="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            type="text"
            placeholder="Cari nama produk atau SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none flex-1 text-body-md text-on-surface"
          />
        </div>

        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                  <th className="p-4 font-label-md">SKU/Barcode</th>
                  <th 
                    className="p-4 font-label-md cursor-pointer hover:bg-surface-container-low transition-colors select-none"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Nama Produk
                      {sortField === 'name' && (
                        <span className="material-symbols-outlined text-[16px]">
                          {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 font-label-md text-right cursor-pointer hover:bg-surface-container-low transition-colors select-none"
                    onClick={() => handleSort('buy_price')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Harga Beli
                      {sortField === 'buy_price' && (
                        <span className="material-symbols-outlined text-[16px]">
                          {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 font-label-md text-right cursor-pointer hover:bg-surface-container-low transition-colors select-none"
                    onClick={() => handleSort('sell_price')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Harga Jual
                      {sortField === 'sell_price' && (
                        <span className="material-symbols-outlined text-[16px]">
                          {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="p-4 font-label-md text-right cursor-pointer hover:bg-surface-container-low transition-colors select-none"
                    onClick={() => handleSort('stock')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Stok
                      {sortField === 'stock' && (
                        <span className="material-symbols-outlined text-[16px]">
                          {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                        </span>
                      )}
                    </div>
                  </th>
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
                ) : sortedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-on-surface-variant">Produk tidak ditemukan untuk pencarian "{searchQuery}".</td>
                  </tr>
                ) : (
                  sortedProducts.map((p) => (
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
            <div className="p-6 border-b border-outline-variant/30">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-title-lg font-title-lg text-on-surface">Kartu Stok</h2>
                  <p className="text-body-md text-on-surface-variant mt-1">{historyProduct.name}</p>
                </div>
                <button onClick={() => setIsHistoryModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              
              {/* Date Filters */}
              <div className="flex gap-4 items-center bg-surface-container-lowest p-3 rounded-lg border border-outline-variant/30">
                <div className="flex items-center gap-2">
                  <label className="text-label-md text-on-surface-variant">Dari:</label>
                  <input 
                    type="date" 
                    value={historyStartDate}
                    onChange={(e) => setHistoryStartDate(e.target.value)}
                    className="px-2 py-1 bg-surface border border-outline-variant rounded focus:outline-primary text-body-sm"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-label-md text-on-surface-variant">Sampai:</label>
                  <input 
                    type="date" 
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="px-2 py-1 bg-surface border border-outline-variant rounded focus:outline-primary text-body-sm"
                  />
                </div>
                {(historyStartDate || historyEndDate) && (
                  <button 
                    onClick={() => { setHistoryStartDate(''); setHistoryEndDate(''); }}
                    className="text-label-sm text-primary hover:underline ml-2"
                  >
                    Reset Filter
                  </button>
                )}
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {loadingHistory ? (
                <div className="text-center py-8 text-on-surface-variant">Memuat riwayat stok...</div>
              ) : stockHistory.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant">Belum ada riwayat pergerakan stok.</div>
              ) : displayedHistory.length === 0 && showOpeningBalance ? (
                <div className="text-center py-8 text-on-surface-variant">
                  Tidak ada transaksi pada periode ini.<br/>
                  <span className="font-bold mt-2 inline-block">Saldo Akhir: {openingBalance}</span>
                </div>
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
                    {/* Opening Balance Row */}
                    {showOpeningBalance && (
                      <tr className="border-b border-outline-variant/80 bg-surface-container-lowest/30">
                        <td className="p-3 text-body-md text-on-surface italic">{new Date(historyStartDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                        <td className="p-3 text-body-md text-on-surface font-medium">Saldo Awal Periode</td>
                        <td className="p-3 text-center">-</td>
                        <td className="p-3 text-body-md font-bold text-right text-primary">{openingBalance}</td>
                      </tr>
                    )}
                    
                    {/* Filtered History Rows */}
                    {displayedHistory.map(h => (
                      <tr key={h.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                        <td className="p-3 text-body-md text-on-surface">
                          <div className="flex flex-col">
                            <span>{new Date(h.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                            <span className="text-xs text-on-surface-variant">{new Date(h.tanggal).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </td>
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
      <ProductImportModal 
        isOpen={isImportModalOpen}
        parseResult={parseResult}
        onClose={() => setIsImportModalOpen(false)}
        onConfirm={handleImportConfirm}
        isSubmitting={isImporting}
      />
    </AdminLayout>
  );
}
