import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RotateCcw,
  Plus,
  Trash2,
  AlertCircle,
  Boxes,
  Building2,
  Calendar,
  FileText,
  DollarSign,
  Loader2,
  X,
  CheckCircle,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import ProductSearchAutocomplete, {
  ProductAutocompleteItem,
} from '../../components/common/ProductSearchAutocomplete';
import { getProduk, Produk } from '../../services/koperasiService';
import {
  createPurchaseReturn,
  generateReturnNumber,
  getSuppliers,
  Supplier,
  PurchaseReturnType,
} from '../../services/purchaseReturnService';
import { supabase } from '../../lib/supabaseClient';
import { useFeedback } from '../../context/FeedbackContext';

interface ReturnCartItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  stockAvailable: number;
  qty: number;
  costPerUnit: number;
  subtotal: number;
  reason: string;
}

export default function InputReturPembelian() {
  const navigate = useNavigate();
  const { showToast } = useFeedback();

  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);
  const [products, setProducts] = useState<Produk[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);

  // Form Fields
  const [returnNumber, setReturnNumber] = useState<string>('');
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [customSupplierName, setCustomSupplierName] = useState<string>('');
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState<string>('');
  const [returnType, setReturnType] = useState<PurchaseReturnType>('PIUTANG_PENGGANTIAN');
  const [notes, setNotes] = useState<string>('');

  // Cart items
  const [cartItems, setCartItems] = useState<ReturnCartItem[]>([]);

  // Item Modal state
  const [isItemModalOpen, setIsItemModalOpen] = useState<boolean>(false);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [itemQty, setItemQty] = useState<number>(1);
  const [itemPrice, setItemPrice] = useState<number>(0);
  const [itemReason, setItemReason] = useState<string>('');
  const [itemQtyError, setItemQtyError] = useState<string>('');

  const qtyInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    fetchInitialData();
    fetchCurrentUser();
  }, []);

  // Update return number when return date changes if not manually modified
  useEffect(() => {
    if (returnDate) {
      setReturnNumber(generateReturnNumber(returnDate));
    }
  }, [returnDate]);

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
          role: profile?.role || 'admin',
        });
      } else {
        setCurrentUser({
          id: 'dev-admin-id',
          name: 'Admin SIMKOP',
          role: 'admin',
        });
      }
    } catch {
      setCurrentUser({
        id: 'dev-admin-id',
        name: 'Admin SIMKOP',
        role: 'admin',
      });
    }
  };

  const fetchInitialData = async () => {
    try {
      setLoadingInitial(true);
      const [prodData, supData] = await Promise.all([
        getProduk(),
        getSuppliers(),
      ]);
      setProducts(prodData || []);
      setSuppliers(supData || []);

      if (supData && supData.length > 0) {
        setSelectedSupplierId(supData[0].id);
        setCustomSupplierName(supData[0].name);
      }
      setReturnNumber(generateReturnNumber(new Date().toISOString().split('T')[0]));
    } catch (err: any) {
      console.error('Gagal mengambil data produk/supplier:', err);
      showToast('Gagal memuat data awal produk & supplier', 'error');
    } finally {
      setLoadingInitial(false);
    }
  };

  const handleSupplierChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedSupplierId(val);
    if (val === 'CUSTOM') {
      setCustomSupplierName('');
    } else {
      const matched = suppliers.find((s) => s.id === val);
      setCustomSupplierName(matched ? matched.name : '');
    }
  };

  // Open Add Item Modal
  const handleOpenItemModal = () => {
    setSelectedProductId('');
    setItemQty(1);
    setItemPrice(0);
    setItemReason('');
    setItemQtyError('');
    setIsItemModalOpen(true);
  };

  // Autocomplete select handler
  const handleSelectProduct = (prod: ProductAutocompleteItem) => {
    setSelectedProductId(prod.id);
    setItemPrice(prod.buy_price || 0);
    setItemQty(1);
    setItemQtyError('');

    const currentStock = prod.stock ?? 0;
    if (currentStock <= 0) {
      setItemQtyError(`Stok produk "${prod.name}" di gudang adalah 0. Tidak ada unit yang dapat diretur.`);
    }

    setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 50);
  };

  const handleQtyChange = (val: number) => {
    setItemQty(val);
    const selectedProd = products.find((p) => p.id === selectedProductId);
    const currentStock = selectedProd ? selectedProd.stock : 0;

    if (val <= 0) {
      setItemQtyError('Kuantitas harus lebih besar dari 0.');
    } else if (val > currentStock) {
      setItemQtyError(`Kuantitas retur melebihi sisa stok di gudang (maksimal: ${currentStock}).`);
    } else {
      setItemQtyError('');
    }
  };

  // Add Item to Cart
  const handleAddItemToCart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) {
      showToast('Pilih produk terlebih dahulu.', 'warning');
      return;
    }

    const selectedProd = products.find((p) => p.id === selectedProductId);
    if (!selectedProd) return;

    if (itemQty <= 0) {
      showToast('Kuantitas retur harus lebih besar dari 0.', 'warning');
      return;
    }

    if (itemQty > selectedProd.stock) {
      showToast(
        `Kuantitas melebihi stok gudang (${selectedProd.stock} unit tersedia).`,
        'warning'
      );
      return;
    }

    // Check if already in cart
    const existingIndex = cartItems.findIndex((it) => it.productId === selectedProductId);
    if (existingIndex > -1) {
      const existing = cartItems[existingIndex];
      const combinedQty = existing.qty + itemQty;
      if (combinedQty > selectedProd.stock) {
        showToast(
          `Total retur untuk produk ini (${combinedQty}) melampaui sisa stok gudang (${selectedProd.stock}).`,
          'warning'
        );
        return;
      }
      const updated = [...cartItems];
      updated[existingIndex] = {
        ...existing,
        qty: combinedQty,
        costPerUnit: itemPrice,
        subtotal: combinedQty * itemPrice,
        reason: itemReason.trim() || existing.reason,
      };
      setCartItems(updated);
    } else {
      setCartItems([
        ...cartItems,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          productId: selectedProd.id,
          productName: selectedProd.name,
          sku: selectedProd.sku,
          stockAvailable: selectedProd.stock,
          qty: itemQty,
          costPerUnit: itemPrice,
          subtotal: itemQty * itemPrice,
          reason: itemReason.trim(),
        },
      ]);
    }

    setIsItemModalOpen(false);
  };

  const handleRemoveCartItem = (index: number) => {
    const updated = [...cartItems];
    updated.splice(index, 1);
    setCartItems(updated);
  };

  const totalCartAmount = cartItems.reduce((sum, it) => sum + it.subtotal, 0);

  // Submit Return Form
  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();

    const activeSupplierName =
      selectedSupplierId === 'CUSTOM'
        ? customSupplierName.trim()
        : suppliers.find((s) => s.id === selectedSupplierId)?.name || customSupplierName.trim();

    if (!activeSupplierName) {
      showToast('Nama supplier harus diisi.', 'warning');
      return;
    }

    if (!returnNumber.trim()) {
      showToast('Nomor retur harus diisi.', 'warning');
      return;
    }

    if (cartItems.length === 0) {
      showToast('Tambahkan minimal satu item produk yang akan diretur.', 'warning');
      return;
    }

    // Double check stock availability
    for (const item of cartItems) {
      const prod = products.find((p) => p.id === item.productId);
      if (prod && item.qty > prod.stock) {
        showToast(
          `Kuantitas retur "${item.productName}" (${item.qty}) melampaui stok yang tersedia (${prod.stock}).`,
          'error'
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      await createPurchaseReturn(
        {
          return_number: returnNumber.trim(),
          return_date: returnDate,
          supplier_id: selectedSupplierId !== 'CUSTOM' ? selectedSupplierId : undefined,
          supplier_name: activeSupplierName,
          original_invoice_number: originalInvoiceNumber.trim() || undefined,
          return_type: returnType,
          notes: notes.trim() || undefined,
          items: cartItems.map((it) => ({
            product_id: it.productId,
            product_name: it.productName,
            sku: it.sku,
            qty: it.qty,
            cost_per_unit: it.costPerUnit,
            reason: it.reason || undefined,
          })),
        },
        currentUser?.id,
        currentUser?.name
      );

      showToast('Faktur retur pembelian berhasil dicatat dan stok inventori telah dipotong.', 'success');
      navigate('/admin/retur-pembelian');
    } catch (err: any) {
      console.error('Gagal mencatat retur pembelian:', err);
      showToast(err.message || 'Terjadi kesalahan saat menyimpan faktur retur.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedProdForModal = products.find((p) => p.id === selectedProductId);

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6 max-w-6xl mx-auto">
        {/* Header Navigation */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/admin/retur-pembelian')}
              className="p-2 hover:bg-surface-container rounded-xl text-on-surface-variant transition-colors"
              title="Kembali ke Riwayat Retur"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-on-surface">Input Retur Pembelian ke Supplier</h1>
              <p className="text-sm text-on-surface-variant">
                Catat pengembalian barang rusak atau klaim penggantian produk ke pihak supplier
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/admin/retur-pembelian')}
            className="px-3.5 py-1.5 border border-outline rounded-lg text-xs font-medium text-on-surface hover:bg-surface-container"
          >
            Batal
          </button>
        </div>

        {loadingInitial ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-on-surface-variant">Menyiapkan formulir retur...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmitReturn} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Form Header Details */}
            <div className="lg:col-span-1 flex flex-col gap-5 bg-surface p-5 rounded-2xl shadow-sm border border-outline-variant/40">
              <h2 className="text-sm font-bold text-on-surface border-b border-outline-variant/30 pb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Informasi Faktur Retur
              </h2>

              {/* Nomor Retur */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface">
                  Nomor Retur <span className="text-error">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={returnNumber}
                    onChange={(e) => setReturnNumber(e.target.value)}
                    className="flex-1 px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs font-mono font-medium text-on-surface focus:border-primary outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setReturnNumber(generateReturnNumber(returnDate))}
                    title="Generate Ulang Nomor Retur"
                    className="p-2 border border-outline rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tanggal Retur */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface">
                  Tanggal Retur <span className="text-error">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none"
                    required
                  />
                </div>
              </div>

              {/* Supplier Selection */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface">
                  Supplier <span className="text-error">*</span>
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={handleSupplierChange}
                  className="w-full px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Masukkan Nama Supplier Lain...</option>
                </select>

                {selectedSupplierId === 'CUSTOM' && (
                  <input
                    type="text"
                    value={customSupplierName}
                    onChange={(e) => setCustomSupplierName(e.target.value)}
                    placeholder="Ketik nama supplier..."
                    className="mt-1 px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none"
                    required
                  />
                )}
              </div>

              {/* Nomor Faktur Asal */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface">
                  Nomor Faktur Pembelian Asal (Referensi)
                </label>
                <input
                  type="text"
                  value={originalInvoiceNumber}
                  onChange={(e) => setOriginalInvoiceNumber(e.target.value)}
                  placeholder="Misal: INV/2026/03/0012"
                  className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none font-mono"
                />
              </div>

              {/* Jenis Retur */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-on-surface">
                  Jenis Retur <span className="text-error">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      returnType === 'PIUTANG_PENGGANTIAN'
                        ? 'bg-blue-50/60 border-blue-400 text-blue-900'
                        : 'bg-surface-container-lowest border-outline-variant hover:bg-surface-container-low'
                    }`}
                  >
                    <input
                      type="radio"
                      name="returnType"
                      value="PIUTANG_PENGGANTIAN"
                      checked={returnType === 'PIUTANG_PENGGANTIAN'}
                      onChange={() => setReturnType('PIUTANG_PENGGANTIAN')}
                      className="mt-0.5 text-primary"
                    />
                    <div className="text-xs">
                      <p className="font-bold">Piutang Penggantian</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        Klaim tukar ganti barang baru dari supplier. Otomatisasi restock akan aktif saat barang pengganti tiba.
                      </p>
                    </div>
                  </label>

                  <label
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      returnType === 'BARANG_RUSAK'
                        ? 'bg-rose-50/60 border-rose-400 text-rose-900'
                        : 'bg-surface-container-lowest border-outline-variant hover:bg-surface-container-low'
                    }`}
                  >
                    <input
                      type="radio"
                      name="returnType"
                      value="BARANG_RUSAK"
                      checked={returnType === 'BARANG_RUSAK'}
                      onChange={() => setReturnType('BARANG_RUSAK')}
                      className="mt-0.5 text-error"
                    />
                    <div className="text-xs">
                      <p className="font-bold">Barang Rusak / Musnah</p>
                      <p className="text-[11px] text-on-surface-variant mt-0.5">
                        Pengurangan stok gudang permanen (kerugian/hapus buku) tanpa menuntut barang pengganti.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Catatan Umum */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-on-surface">Catatan Umum</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Informasi pengiriman retur atau ekspedisi..."
                  className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none resize-none"
                />
              </div>
            </div>

            {/* Right Column: Cart Items & Submission */}
            <div className="lg:col-span-2 flex flex-col gap-5">
              <div className="bg-surface p-5 rounded-2xl shadow-sm border border-outline-variant/40 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                      <Boxes className="w-5 h-5 text-secondary" />
                      Daftar Barang yang Diretur
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      Pilih produk yang rusak atau cacat untuk dikeluarkan dari stok gudang
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenItemModal}
                    className="flex items-center gap-1.5 bg-secondary text-on-secondary px-3.5 py-2 rounded-lg text-xs font-semibold shadow hover:bg-secondary/90 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah Barang
                  </button>
                </div>

                {cartItems.length === 0 ? (
                  <div className="py-16 text-center border-2 border-dashed border-outline-variant/50 rounded-xl">
                    <Boxes className="w-10 h-10 mx-auto text-outline-variant mb-2" />
                    <p className="font-semibold text-sm text-on-surface">Belum ada barang di keranjang retur</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Klik tombol &ldquo;Tambah Barang&rdquo; di atas untuk mencari produk via SKU atau nama produk.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-outline-variant/40 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-surface-container-low text-on-surface-variant font-semibold">
                        <tr className="border-b border-outline-variant/30">
                          <th className="py-3 px-3">No</th>
                          <th className="py-3 px-3">Produk & SKU</th>
                          <th className="py-3 px-3 text-center">Stok Gudang</th>
                          <th className="py-3 px-3 text-right">Qty Retur</th>
                          <th className="py-3 px-3 text-right">Harga Beli Satuan</th>
                          <th className="py-3 px-3 text-right">Subtotal</th>
                          <th className="py-3 px-3">Alasan Retur</th>
                          <th className="py-3 px-3 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {cartItems.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-surface-container-low/40">
                            <td className="py-2.5 px-3 text-on-surface-variant">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <p className="font-medium text-on-surface">{item.productName}</p>
                              <span className="font-mono text-[10px] text-on-surface-variant bg-surface-container px-1 py-0.5 rounded">
                                {item.sku}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center text-on-surface-variant">
                              <span className="bg-surface-container px-2 py-0.5 rounded font-mono text-[11px]">
                                {item.stockAvailable}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-on-surface">{item.qty}</td>
                            <td className="py-2.5 px-3 text-right text-on-surface">
                              Rp {item.costPerUnit.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-primary">
                              Rp {item.subtotal.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2.5 px-3 text-on-surface-variant italic">
                              {item.reason || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCartItem(idx)}
                                className="p-1.5 text-error hover:bg-error/10 rounded-lg transition-colors"
                                title="Hapus dari keranjang"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-surface-container-low font-bold">
                        <tr>
                          <td colSpan={5} className="py-3 px-3 text-right text-on-surface text-sm">
                            Total Nilai Retur:
                          </td>
                          <td className="py-3 px-3 text-right text-primary text-base font-bold">
                            Rp {totalCartAmount.toLocaleString('id-ID')}
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Submit Action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-outline-variant/30">
                  <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                    <AlertCircle className="w-4 h-4 text-primary shrink-0" />
                    <span>Stok produk di inventori akan dipotong otomatis setelah faktur retur disimpan.</span>
                  </div>

                  <button
                    type="submit"
                    disabled={cartItems.length === 0 || isSubmitting}
                    className="w-full sm:w-auto px-7 py-2.5 bg-primary text-on-primary rounded-xl font-semibold text-sm shadow hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Menyimpan Faktur Retur...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Simpan Retur Pembelian
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* MODAL: TAMBAH PRODUK KE KERANJANG RETUR */}
        {isItemModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/40 animate-in fade-in-50 duration-150">
              <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low rounded-t-2xl">
                <h3 className="font-bold text-sm text-on-surface">Pilih Produk yang Diretur</h3>
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddItemToCart} className="p-5 flex flex-col gap-4 text-xs">
                {/* Search Autocomplete */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-on-surface">
                    Cari Produk (Nama / Barcode / SKU) <span className="text-error">*</span>
                  </label>
                  <ProductSearchAutocomplete
                    products={products.map((p) => ({
                      id: p.id,
                      sku: p.sku,
                      name: p.name,
                      buy_price: p.buy_price,
                      stock: p.stock,
                      unit: p.unit,
                    }))}
                    selectedProductId={selectedProductId}
                    onSelect={handleSelectProduct}
                    placeholder="Ketik nama produk atau scan SKU..."
                    autoFocus={true}
                  />
                </div>

                {/* Stock Info Badge */}
                {selectedProdForModal && (
                  <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/40 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-on-surface">{selectedProdForModal.name}</p>
                      <p className="text-[11px] font-mono text-on-surface-variant">
                        SKU: {selectedProdForModal.sku}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-on-surface-variant block">Sisa Stok Gudang</span>
                      <span
                        className={`font-bold text-sm ${
                          selectedProdForModal.stock <= 0 ? 'text-error' : 'text-primary'
                        }`}
                      >
                        {selectedProdForModal.stock} {selectedProdForModal.unit || 'pcs'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Quantity and Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-on-surface">
                      Kuantitas Retur <span className="text-error">*</span>
                    </label>
                    <input
                      ref={qtyInputRef}
                      type="number"
                      min="1"
                      max={selectedProdForModal ? selectedProdForModal.stock : undefined}
                      value={itemQty}
                      onChange={(e) => handleQtyChange(Number(e.target.value))}
                      className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-sm text-on-surface focus:border-primary outline-none"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="font-semibold text-on-surface">
                      Harga Beli Satuan (Rp) <span className="text-error">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={itemPrice}
                      onChange={(e) => setItemPrice(Number(e.target.value))}
                      className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-sm text-on-surface focus:border-primary outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Validation Error Message */}
                {itemQtyError && (
                  <div className="p-2.5 bg-error/10 border border-error/20 rounded-lg text-error text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{itemQtyError}</span>
                  </div>
                )}

                {/* Subtotal Preview */}
                <div className="flex items-center justify-between p-2.5 bg-surface-container-lowest border border-outline-variant/40 rounded-lg">
                  <span className="text-on-surface-variant">Subtotal Perkiraan:</span>
                  <span className="font-bold text-primary text-sm">
                    Rp {(itemQty * itemPrice).toLocaleString('id-ID')}
                  </span>
                </div>

                {/* Reason per item */}
                <div className="flex flex-col gap-1.5">
                  <label className="font-semibold text-on-surface">Alasan Retur Produk</label>
                  <input
                    type="text"
                    value={itemReason}
                    onChange={(e) => setItemReason(e.target.value)}
                    placeholder="Misal: Segel rusak, kemasan penyok, kadaluarsa"
                    className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none"
                  />
                </div>

                <div className="mt-2 flex justify-end gap-2 pt-2 border-t border-outline-variant/30">
                  <button
                    type="button"
                    onClick={() => setIsItemModalOpen(false)}
                    className="px-4 py-2 border border-outline rounded-lg text-on-surface hover:bg-surface-container font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={!selectedProductId || !!itemQtyError || itemQty <= 0}
                    className="px-5 py-2 bg-secondary text-on-secondary rounded-lg font-semibold hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Tambahkan ke Keranjang
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
