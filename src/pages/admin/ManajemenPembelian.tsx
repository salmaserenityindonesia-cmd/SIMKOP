import React, { useEffect, useState } from 'react';
import { Edit3, Loader2 } from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getFakturPembelian, catatRestockFaktur, FakturPembelian, getProduk, Produk } from '../../services/koperasiService';
import { updatePurchaseInvoice, getPurchaseAuditLogs, PurchaseAuditLog, isValidUUID } from '../../services/purchaseService';
import { supabase } from '../../lib/supabaseClient';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import { useFeedback } from '../../context/FeedbackContext';

export default function ManajemenPembelian() {
  const { showToast } = useFeedback();
  const [fakturList, setFakturList] = useState<FakturPembelian[]>([]);
  const [products, setProducts] = useState<Produk[]>([]);
  const [loading, setLoading] = useState(true);

  // User state for role check
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Form Mode (New Invoice)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [noFaktur, setNoFaktur] = useState('');
  const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);

  // Cart items
  const [items, setItems] = useState<{ id: string; produkId: string; qty: number; hargaBeli: number }[]>([]);

  // Item Form Modal
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(1);
  const [hargaBeli, setHargaBeli] = useState(0);

  // View Detail Modal
  const [selectedFaktur, setSelectedFaktur] = useState<FakturPembelian | null>(null);
  const [auditLogs, setAuditLogs] = useState<PurchaseAuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Edit Invoice Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFaktur, setEditingFaktur] = useState<FakturPembelian | null>(null);
  const [editNoFaktur, setEditNoFaktur] = useState('');
  const [editTanggal, setEditTanggal] = useState('');
  const [editItems, setEditItems] = useState<{ id?: string; produkId: string; qty: number; hargaBeli: number }[]>([]);
  const [changeReason, setChangeReason] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchData();
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('pengelola')
          .select('nama, role')
          .eq('id', user.id)
          .single();

        setCurrentUser({
          id: user.id,
          name: profile?.nama || user.user_metadata?.nama || user.email || 'Pengelola',
          role: profile?.role || 'admin'
        });
      } else {
        // Fallback for development / demo mode
        setCurrentUser({
          id: 'dev-admin-id',
          name: 'Admin SIMKOP',
          role: 'admin'
        });
      }
    } catch (e) {
      console.warn('Gagal memuat pengguna aktif:', e);
      setCurrentUser({
        id: 'dev-admin-id',
        name: 'Admin SIMKOP',
        role: 'admin'
      });
    }
  };

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
      setItems([...items, {
        id: `temp-${Date.now()}`,
        produkId: selectedProductId,
        qty,
        hargaBeli
      }]);
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
      showToast('Nomor Faktur harus diisi', 'warning');
      return;
    }
    if (items.length === 0) {
      showToast('Belum ada barang yang ditambahkan', 'warning');
      return;
    }

    try {
      await catatRestockFaktur({
        noFaktur,
        tanggal,
        items
      });
      showToast('Faktur pembelian berhasil dicatat', 'success');
      setIsFormOpen(false);
      fetchData();
    } catch (error: any) {
      showToast(error.message || 'Terjadi kesalahan saat menyimpan faktur', 'error');
    }
  };

  const cartTotal = items.reduce((sum, item) => sum + (item.qty * item.hargaBeli), 0);

  const handleOpenDetailModal = async (faktur: FakturPembelian) => {
    setSelectedFaktur(faktur);
    setIsLoadingAudit(true);
    try {
      const logs = await getPurchaseAuditLogs(faktur.id);
      setAuditLogs(logs);
    } catch (e) {
      console.error('Failed to load audit logs:', e);
      setAuditLogs([]);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleOpenEditModal = (faktur: FakturPembelian) => {
    if (currentUser && currentUser.role !== 'admin') {
      showToast('Hanya admin yang dapat mengedit faktur pembelian', 'warning');
      return;
    }
    setEditingFaktur(faktur);
    setEditNoFaktur(faktur.noFaktur);
    setEditTanggal(faktur.tanggal);
    setEditItems(faktur.items.map(it => {
      // Pastikan produkId berupa UUID produk yang valid
      const matched = products.find(p => p.id === it.produkId || p.sku === it.produkId);
      const validProductId = (matched && isValidUUID(matched.id)) ? matched.id : it.produkId;
      return {
        id: it.id,
        produkId: validProductId,
        qty: it.qty,
        hargaBeli: it.hargaBeli
      };
    }));
    setChangeReason('');
    setIsEditModalOpen(true);
  };

  const handleEditItemQtyChange = (index: number, val: number) => {
    setEditItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], qty: val };
      return copy;
    });
  };

  const handleEditItemPriceChange = (index: number, val: number) => {
    setEditItems(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], hargaBeli: val };
      return copy;
    });
  };

  const handleSubmitEditFaktur = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFaktur) return;

    if (!editNoFaktur.trim()) {
      showToast('Nomor Faktur harus diisi', 'warning');
      return;
    }

    if (editItems.length === 0) {
      showToast('Faktur harus memiliki minimal satu item produk', 'warning');
      return;
    }

    if (changeReason.trim().length < 10) {
      showToast('Alasan perubahan wajib diisi minimal 10 karakter', 'warning');
      return;
    }

    for (const item of editItems) {
      if (!item.qty || item.qty <= 0) {
        showToast('Kuantitas setiap item harus lebih besar dari 0', 'warning');
        return;
      }
      if (item.hargaBeli === undefined || item.hargaBeli < 0) {
        showToast('Harga beli tidak boleh negatif', 'warning');
        return;
      }
    }

    setIsSavingEdit(true);
    try {
      // Pastikan setiap item yang dikirim memiliki product_id berupa UUID produk yang valid
      const sanitizedItems = editItems.map(item => {
        const matched = products.find(p => p.id === item.produkId || p.sku === item.produkId);
        const validProductId = (matched && isValidUUID(matched.id)) ? matched.id : item.produkId;
        return {
          ...item,
          produkId: validProductId
        };
      });

      // Sanitasi userId: hanya gunakan jika merupakan UUID valid, jika tidak kirim empty string agar diproses null
      const validUserId = isValidUUID(currentUser?.id) ? currentUser!.id : '';

      await updatePurchaseInvoice(
        editingFaktur.id,
        {
          noFaktur: editNoFaktur.trim(),
          tanggal: editTanggal,
          items: sanitizedItems
        },
        changeReason.trim(),
        {
          id: validUserId,
          name: currentUser?.name || 'Administrator'
        }
      );

      showToast('Faktur pembelian dan stok berhasil diperbarui', 'success');
      setIsEditModalOpen(false);
      setEditingFaktur(null);
      await fetchData();
    } catch (error: any) {
      showToast(error.message || 'Gagal memperbarui faktur pembelian', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const editCartTotal = editItems.reduce((sum, item) => sum + ((item.qty || 0) * (item.hargaBeli || 0)), 0);

  const handleExportExcel = () => {
    const data = fakturList.map(f => ({
      'Tanggal': f.tanggal,
      'No. Faktur': f.noFaktur,
      'Jml Item (Macam)': f.items.length,
      'Total Nilai': f.totalNilai
    }));
    exportToExcel(data, 'Laporan_Pembelian');
  };

  const handleExportPDF = () => {
    const headers = ['Tanggal', 'No. Faktur', 'Jml Item', 'Total Nilai'];
    const data = fakturList.map(f => [
      f.tanggal,
      f.noFaktur,
      `${f.items.length} Macam`,
      `Rp ${f.totalNilai.toLocaleString('id-ID')}`
    ]);
    exportToPDF(headers, data, 'Laporan_Pembelian', 'Laporan Riwayat Pembelian');
  };

  const totalPages = Math.ceil(fakturList.length / itemsPerPage);
  const paginatedFakturList = fakturList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
          <div className="flex gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-[#217346] text-white px-4 py-2 rounded-lg font-label-lg shadow hover:bg-[#1e6b41] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">table_chart</span>
              Export Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-[#db4437] text-white px-4 py-2 rounded-lg font-label-lg shadow hover:bg-[#c53929] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
              Export PDF
            </button>
            <button
              onClick={handleOpenForm}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">post_add</span>
              Input Faktur
            </button>
          </div>
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
                  paginatedFakturList.map((faktur) => (
                    <tr key={faktur.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="p-4 text-body-md text-on-surface">{faktur.tanggal}</td>
                      <td className="p-4 text-title-sm font-medium text-on-surface">{faktur.noFaktur}</td>
                      <td className="p-4 text-body-md text-on-surface text-right">{faktur.items.length} Macam</td>
                      <td className="p-4 text-body-md font-medium text-on-surface text-right">
                        Rp {faktur.totalNilai.toLocaleString('id-ID')}
                      </td>
                      <td className="p-4 flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenDetailModal(faktur)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-tertiary hover:bg-tertiary/10 transition-colors"
                          title="Lihat Detail Faktur"
                        >
                          <span className="material-symbols-outlined text-[18px]">visibility</span>
                        </button>
                        {currentUser?.role === 'admin' ? (
                          <button
                            onClick={() => handleOpenEditModal(faktur)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                            title="Edit Faktur"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        ) : (
                          <button
                            disabled
                            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant/40 cursor-not-allowed opacity-50"
                            title="Hanya admin yang dapat mengedit faktur"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm p-4 border-t border-outline-variant">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span>
                Menampilkan {fakturList.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
                {Math.min(currentPage * itemsPerPage, fakturList.length)} dari {fakturList.length} faktur
              </span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="ml-2 bg-transparent border-none font-medium text-on-surface outline-none cursor-pointer focus:ring-0"
              >
                <option value={10}>10 / halaman</option>
                <option value={25}>25 / halaman</option>
                <option value={50}>50 / halaman</option>
                <option value={100}>100 / halaman</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm bg-surface-container hover:bg-surface-container-high text-on-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="text-sm font-medium px-2 text-on-surface">
                {currentPage} / {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1 text-sm bg-surface-container hover:bg-surface-container-high text-on-surface rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Detail Faktur & Audit Trail */}
      {selectedFaktur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-lowest">
              <div>
                <h2 className="text-title-lg font-title-lg text-on-surface">Detail Faktur</h2>
                <p className="text-body-md text-on-surface-variant mt-1 font-mono">{selectedFaktur.noFaktur} - {selectedFaktur.tanggal}</p>
              </div>
              <button onClick={() => { setSelectedFaktur(null); setAuditLogs([]); }} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-6">
              {/* Daftar Barang */}
              <div>
                <h3 className="text-title-sm font-medium text-on-surface mb-2">Daftar Barang</h3>
                <div className="border border-outline-variant/30 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                        <th className="py-2.5 px-4 font-medium">Produk</th>
                        <th className="py-2.5 px-3 font-medium text-right">Qty</th>
                        <th className="py-2.5 px-3 font-medium text-right">Harga Beli</th>
                        <th className="py-2.5 px-4 font-medium text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFaktur.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-outline-variant/30">
                          <td className="py-3 px-4 text-body-md text-on-surface">{getProductName(item.produkId)}</td>
                          <td className="py-3 px-3 text-body-md text-on-surface text-right">{item.qty}</td>
                          <td className="py-3 px-3 text-body-md text-on-surface text-right">Rp {item.hargaBeli.toLocaleString('id-ID')}</td>
                          <td className="py-3 px-4 text-body-md font-medium text-on-surface text-right">
                            Rp {(item.qty * item.hargaBeli).toLocaleString('id-ID')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-surface-container-lowest/50">
                        <td colSpan={3} className="py-3 px-4 text-right font-medium text-on-surface">Total:</td>
                        <td className="py-3 px-4 text-right font-bold text-primary text-title-md">
                          Rp {selectedFaktur.totalNilai.toLocaleString('id-ID')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Riwayat Perubahan (Audit Trail) */}
              <div className="flex flex-col gap-3 pt-4 border-t border-outline-variant/30">
                <h3 className="text-title-sm font-medium text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">history</span>
                  Riwayat Perubahan (Audit Trail)
                </h3>

                {isLoadingAudit ? (
                  <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 text-center text-on-surface-variant text-body-sm flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    Memuat riwayat perubahan...
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 text-center text-on-surface-variant text-body-sm">
                    Belum ada riwayat koreksi pada faktur ini.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/40 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-label-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-primary">{log.performer_name || 'Pengelola'}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/10 text-secondary font-medium">
                              {log.action === 'UPDATE_PURCHASE' ? 'Koreksi Faktur' : log.action}
                            </span>
                          </div>
                          <span className="text-on-surface-variant text-xs font-mono">
                            {new Date(log.created_at).toLocaleString('id-ID', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </span>
                        </div>
                        <div className="text-body-sm text-on-surface bg-surface p-2.5 rounded-lg border border-outline-variant/20">
                          <span className="font-medium text-on-surface-variant mr-1">Alasan:</span>
                          "{log.notes}"
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Faktur */}
      {isEditModalOpen && editingFaktur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-3xl overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-lowest">
              <div>
                <h2 className="text-title-lg font-title-lg text-on-surface">Edit Faktur Pembelian: {editingFaktur.noFaktur}</h2>
                <p className="text-body-md text-on-surface-variant mt-0.5">
                  Sesuaikan nomor faktur, tanggal, kuantitas, atau harga beli barang
                </p>
              </div>
              <button
                onClick={() => {
                  if (!isSavingEdit) {
                    setIsEditModalOpen(false);
                    setEditingFaktur(null);
                  }
                }}
                className="text-on-surface-variant hover:text-on-surface"
                disabled={isSavingEdit}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSubmitEditFaktur} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-6 overflow-y-auto flex flex-col gap-5">
                {/* Header Inputs: No. Faktur & Tanggal */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-label-md font-label-md text-on-surface-variant">No. Faktur</label>
                    <input
                      type="text"
                      value={editNoFaktur}
                      onChange={(e) => setEditNoFaktur(e.target.value)}
                      className="px-3.5 py-2 bg-surface border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      placeholder="INV/2026/..."
                      required
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-label-md font-label-md text-on-surface-variant">Tanggal</label>
                    <input
                      type="date"
                      value={editTanggal}
                      onChange={(e) => setEditTanggal(e.target.value)}
                      className="px-3.5 py-2 bg-surface border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Items Table */}
                <div className="flex flex-col gap-2">
                  <h3 className="text-title-sm font-medium text-on-surface">Rincian Barang & Penyesuaian</h3>
                  <div className="border border-outline-variant/40 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-lowest border-b border-outline-variant/40 text-label-sm text-on-surface-variant">
                          <th className="py-2.5 px-4 font-medium">Produk</th>
                          <th className="py-2.5 px-3 font-medium text-right w-28">Qty</th>
                          <th className="py-2.5 px-3 font-medium text-right w-36">Harga Beli (Rp)</th>
                          <th className="py-2.5 px-4 font-medium text-right w-36">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editItems.map((item, idx) => (
                          <tr key={item.id || idx} className="border-b border-outline-variant/20 hover:bg-surface-container-lowest/30">
                            <td className="py-2.5 px-4 text-body-sm text-on-surface font-medium">
                              {getProductName(item.produkId)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={(e) => handleEditItemQtyChange(idx, parseInt(e.target.value) || 0)}
                                className="w-20 px-2 py-1 text-right bg-surface border border-outline rounded text-body-sm focus:border-primary outline-none"
                                required
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <input
                                type="number"
                                min="0"
                                value={item.hargaBeli}
                                onChange={(e) => handleEditItemPriceChange(idx, parseInt(e.target.value) || 0)}
                                className="w-28 px-2 py-1 text-right bg-surface border border-outline rounded text-body-sm focus:border-primary outline-none"
                                required
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right text-body-sm font-medium text-on-surface">
                              Rp {((item.qty || 0) * (item.hargaBeli || 0)).toLocaleString('id-ID')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-surface-container-lowest/50">
                          <td colSpan={3} className="py-3 px-4 text-right font-medium text-on-surface text-body-sm">
                            Total Faktur Baru:
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-primary text-title-sm">
                            Rp {editCartTotal.toLocaleString('id-ID')}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Reason Textarea (Required, >= 10 chars) */}
                <div className="flex flex-col gap-1.5 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/30">
                  <div className="flex items-center justify-between">
                    <label className="text-label-md font-label-md text-on-surface">
                      Alasan Perubahan / Koreksi <span className="text-error font-bold">*</span>
                    </label>
                    <span className="text-xs text-on-surface-variant">Wajib diisi</span>
                  </div>
                  <textarea
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    rows={3}
                    className="px-3.5 py-2.5 bg-surface border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
                    placeholder="Jelaskan alasan perubahan faktur (misal: koreksi salah input kuantitas barang dari supplier)..."
                    required
                  />
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className={changeReason.trim().length >= 10 ? 'text-primary font-medium' : 'text-error font-medium'}>
                      {changeReason.trim().length >= 10
                        ? '✓ Alasan memenuhi syarat minimal'
                        : `Minimal 10 karakter - saat ini: ${changeReason.trim().length} karakter`}
                    </span>
                    <span className="text-on-surface-variant font-mono">{changeReason.trim().length} karakter</span>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="p-4 border-t border-outline-variant/30 bg-surface-container-lowest flex justify-end gap-3 items-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingFaktur(null);
                  }}
                  disabled={isSavingEdit}
                  className="px-4 py-2 text-on-surface-variant font-label-lg hover:bg-surface-container rounded-lg transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={changeReason.trim().length < 10 || isSavingEdit || editItems.length === 0 || !editNoFaktur.trim()}
                  className="flex items-center gap-2 bg-primary text-on-primary px-6 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
