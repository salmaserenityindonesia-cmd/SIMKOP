import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RotateCcw,
  Plus,
  Search,
  Eye,
  Edit3,
  PackageCheck,
  CheckCircle,
  Clock,
  Trash2,
  Boxes,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  X,
  Loader2,
  Calendar,
  Building2,
  Receipt,
  FileCheck,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  getPurchaseReturns,
  getPurchaseReturnDetail,
  completeReturnClaim,
  updatePurchaseReturn,
  PurchaseReturn,
  ClaimStatus,
  PurchaseReturnType,
} from '../../services/purchaseReturnService';
import { supabase } from '../../lib/supabaseClient';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import { useFeedback } from '../../context/FeedbackContext';

export default function ManajemenReturPembelian() {
  const navigate = useNavigate();
  const { showToast } = useFeedback();

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string } | null>(null);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Detail Modal state
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Edit Modal state
  const [editingReturn, setEditingReturn] = useState<PurchaseReturn | null>(null);
  const [editReturnNumber, setEditReturnNumber] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Complete Claim Modal state ("Terima Barang Pengganti")
  const [claimReturn, setClaimReturn] = useState<PurchaseReturn | null>(null);
  const [claimNotes, setClaimNotes] = useState('');
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [isProcessingClaim, setIsProcessingClaim] = useState(false);

  useEffect(() => {
    fetchReturns();
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

  const fetchReturns = async () => {
    try {
      setLoading(true);
      const data = await getPurchaseReturns();
      setReturns(data);
    } catch (err: any) {
      console.error('Gagal mengambil data retur pembelian:', err);
      showToast(err.message || 'Gagal memuat data retur pembelian', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Metrics Calculation
  const totalInvoices = returns.length;
  const totalAmount = returns.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
  const waitingClaimCount = returns.filter((r) => r.claim_status === 'MENUNGGU_PENGGANTIAN').length;
  const completedClaimCount = returns.filter((r) => r.claim_status === 'SELESAI_DIGANTI').length;

  // Filtered returns
  const filteredReturns = returns.filter((item) => {
    const matchesSearch =
      (item.return_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.supplier_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.original_invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || item.claim_status === statusFilter;
    const matchesType = typeFilter === 'ALL' || item.return_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Pagination
  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage) || 1;
  const paginatedReturns = filteredReturns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Detail Modal handler
  const handleOpenDetailModal = async (ret: PurchaseReturn) => {
    setIsLoadingDetail(true);
    setIsDetailModalOpen(true);
    try {
      const fullDetail = await getPurchaseReturnDetail(ret.id);
      setSelectedReturn(fullDetail || ret);
    } catch {
      setSelectedReturn(ret);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Edit Modal handler
  const handleOpenEditModal = (ret: PurchaseReturn) => {
    if (ret.claim_status === 'SELESAI_DIGANTI') {
      showToast('Retur yang klaimnya sudah selesai tidak dapat diedit.', 'warning');
      return;
    }
    setEditingReturn(ret);
    setEditReturnNumber(ret.return_number);
    setEditNotes(ret.notes || '');
    setEditReason('');
    setIsEditModalOpen(true);
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReturn) return;

    if (!editReturnNumber.trim()) {
      showToast('Nomor retur tidak boleh kosong.', 'warning');
      return;
    }

    if (editReason.trim().length < 10) {
      showToast('Alasan perubahan minimal 10 karakter.', 'warning');
      return;
    }

    try {
      setIsSavingEdit(true);
      await updatePurchaseReturn(
        editingReturn.id,
        {
          return_number: editReturnNumber.trim(),
          notes: editNotes.trim(),
        },
        currentUser?.id,
        editReason.trim()
      );
      showToast('Data retur pembelian berhasil diperbarui.', 'success');
      setIsEditModalOpen(false);
      fetchReturns();
    } catch (err: any) {
      showToast(err.message || 'Gagal memperbarui data retur.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Complete Claim Modal handler ("Terima Barang Pengganti")
  const handleOpenClaimModal = async (ret: PurchaseReturn) => {
    if (ret.return_type !== 'PIUTANG_PENGGANTIAN' || ret.claim_status !== 'MENUNGGU_PENGGANTIAN') {
      return;
    }
    setIsProcessingClaim(true);
    setIsClaimModalOpen(true);
    setClaimNotes('');
    try {
      const fullDetail = await getPurchaseReturnDetail(ret.id);
      setClaimReturn(fullDetail || ret);
    } catch {
      setClaimReturn(ret);
    } finally {
      setIsProcessingClaim(false);
    }
  };

  const handleConfirmClaim = async () => {
    if (!claimReturn) return;
    try {
      setIsProcessingClaim(true);
      const result = await completeReturnClaim(claimReturn.id, currentUser?.id, claimNotes.trim());
      showToast(
        `Klaim selesai! Sebanyak ${result.total_restocked_qty || 'semua'} unit barang telah otomatis ditambahkan kembali ke stok gudang.`,
        'success'
      );
      setIsClaimModalOpen(false);
      fetchReturns();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyelesaikan klaim retur.', 'error');
    } finally {
      setIsProcessingClaim(false);
    }
  };

  // Export handlers
  const handleExportExcel = () => {
    const dataToExport = filteredReturns.map((r, idx) => ({
      No: idx + 1,
      'No. Retur': r.return_number,
      Tanggal: r.return_date,
      Supplier: r.supplier_name,
      'No. Faktur Asal': r.original_invoice_number || '-',
      'Jenis Retur': r.return_type === 'PIUTANG_PENGGANTIAN' ? 'Piutang Penggantian' : 'Barang Rusak',
      'Status Klaim':
        r.claim_status === 'SELESAI_DIGANTI'
          ? 'Selesai Diganti'
          : r.claim_status === 'MENUNGGU_PENGGANTIAN'
          ? 'Menunggu Penggantian'
          : 'Hapus Buku',
      'Total Nilai (Rp)': r.total_amount,
      Catatan: r.notes || '-',
    }));
    exportToExcel(dataToExport, `Retur_Pembelian_${new Date().toISOString().split('T')[0]}`);
  };

  const handleExportPDF = () => {
    const headers = ['No', 'No. Retur', 'Tanggal', 'Supplier', 'Faktur Asal', 'Jenis', 'Status', 'Total (Rp)'];
    const data = filteredReturns.map((r, idx) => [
      (idx + 1).toString(),
      r.return_number,
      r.return_date,
      r.supplier_name,
      r.original_invoice_number || '-',
      r.return_type === 'PIUTANG_PENGGANTIAN' ? 'Penggantian' : 'Barang Rusak',
      r.claim_status === 'SELESAI_DIGANTI'
        ? 'Selesai'
        : r.claim_status === 'MENUNGGU_PENGGANTIAN'
        ? 'Menunggu'
        : 'Hapus Buku',
      r.total_amount.toLocaleString('id-ID'),
    ]);

    exportToPDF(headers, data, `Retur_Pembelian_${new Date().toISOString().split('T')[0]}`, 'Laporan Retur Pembelian Supplier');
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-on-surface">Manajemen Retur Pembelian</h1>
                <p className="text-sm text-on-surface-variant">
                  Riwayat pengembalian barang rusak ke supplier & pemantauan otomatisasi klaim restock
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-[#217346] text-white px-3.5 py-2 rounded-lg text-sm font-medium shadow hover:bg-[#1e6b41] transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-[#db4437] text-white px-3.5 py-2 rounded-lg text-sm font-medium shadow hover:bg-[#c53929] transition-colors"
            >
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
            <button
              onClick={() => navigate('/admin/retur-pembelian/input')}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg text-sm font-medium shadow hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Buat Retur Baru
            </button>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface p-5 rounded-2xl shadow-sm border border-outline-variant/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Total Faktur Retur</p>
              <h3 className="text-2xl font-bold text-on-surface mt-1">{totalInvoices}</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Seluruh transaksi retur</p>
            </div>
            <div className="p-3 bg-primary/10 text-primary rounded-xl">
              <Receipt className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-surface p-5 rounded-2xl shadow-sm border border-outline-variant/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Total Nilai Retur</p>
              <h3 className="text-2xl font-bold text-on-surface mt-1">Rp {totalAmount.toLocaleString('id-ID')}</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Nilai perolehan barang retur</p>
            </div>
            <div className="p-3 bg-secondary/10 text-secondary rounded-xl">
              <Boxes className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-surface p-5 rounded-2xl shadow-sm border border-outline-variant/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-700 uppercase tracking-wider">Menunggu Penggantian</p>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{waitingClaimCount}</h3>
              <p className="text-xs text-amber-600/80 mt-0.5">Klaim barang pengganti aktif</p>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-surface p-5 rounded-2xl shadow-sm border border-outline-variant/40 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Klaim Selesai Diganti</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">{completedClaimCount}</h3>
              <p className="text-xs text-emerald-600/80 mt-0.5">Stok telah terisi kembali</p>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-surface p-4 rounded-2xl shadow-sm border border-outline-variant/40 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Cari no. retur, supplier, faktur asal..."
              className="w-full pl-9 pr-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-sm text-on-surface placeholder:text-outline focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant whitespace-nowrap">Status Klaim:</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none"
              >
                <option value="ALL">Semua Status</option>
                <option value="MENUNGGU_PENGGANTIAN">Menunggu Penggantian</option>
                <option value="SELESAI_DIGANTI">Selesai Diganti</option>
                <option value="HAPUS_BUKU">Hapus Buku</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-on-surface-variant whitespace-nowrap">Jenis:</span>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-primary outline-none"
              >
                <option value="ALL">Semua Jenis</option>
                <option value="PIUTANG_PENGGANTIAN">Piutang Penggantian</option>
                <option value="BARANG_RUSAK">Barang Rusak</option>
              </select>
            </div>
          </div>
        </div>

        {/* Returns Table */}
        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant/40 overflow-hidden">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm">Memuat riwayat faktur retur...</p>
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className="py-16 text-center text-on-surface-variant">
              <RotateCcw className="w-12 h-12 mx-auto text-outline-variant mb-2" />
              <p className="font-medium text-base text-on-surface">Belum ada faktur retur pembelian</p>
              <p className="text-sm text-on-surface-variant mt-1">
                {searchTerm || statusFilter !== 'ALL' || typeFilter !== 'ALL'
                  ? 'Tidak ada data yang cocok dengan kriteria filter Anda.'
                  : 'Klik tombol "Buat Retur Baru" untuk mencatat retur pembelian pertama Anda.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-xs font-semibold text-on-surface-variant border-b border-outline-variant/30">
                    <th className="py-3.5 px-4">Tanggal</th>
                    <th className="py-3.5 px-4">No. Retur</th>
                    <th className="py-3.5 px-4">Supplier</th>
                    <th className="py-3.5 px-4">No. Faktur Asal</th>
                    <th className="py-3.5 px-4">Jenis Retur</th>
                    <th className="py-3.5 px-4">Status Klaim</th>
                    <th className="py-3.5 px-4 text-right">Total Nilai</th>
                    <th className="py-3.5 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 text-sm">
                  {paginatedReturns.map((item) => {
                    const isWaitingClaim =
                      item.return_type === 'PIUTANG_PENGGANTIAN' && item.claim_status === 'MENUNGGU_PENGGANTIAN';
                    const isCompleted = item.claim_status === 'SELESAI_DIGANTI';

                    return (
                      <tr key={item.id} className="hover:bg-surface-container-low/50 transition-colors">
                        <td className="py-3.5 px-4 text-on-surface whitespace-nowrap">{item.return_date}</td>
                        <td className="py-3.5 px-4 font-mono font-medium text-primary whitespace-nowrap">
                          {item.return_number}
                        </td>
                        <td className="py-3.5 px-4 text-on-surface font-medium">{item.supplier_name}</td>
                        <td className="py-3.5 px-4 text-on-surface-variant font-mono text-xs">
                          {item.original_invoice_number || '-'}
                        </td>
                        <td className="py-3.5 px-4">
                          {item.return_type === 'PIUTANG_PENGGANTIAN' ? (
                            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full text-xs font-medium inline-block">
                              Piutang Penggantian
                            </span>
                          ) : (
                            <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-xs font-medium inline-block">
                              Barang Rusak
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {item.claim_status === 'MENUNGGU_PENGGANTIAN' && (
                            <span className="bg-amber-500/10 text-amber-700 border border-amber-300 px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                              Menunggu Penggantian
                            </span>
                          )}
                          {item.claim_status === 'SELESAI_DIGANTI' && (
                            <span className="bg-emerald-500/10 text-emerald-700 border border-emerald-300 px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
                              <CheckCircle className="w-3 h-3 text-emerald-600" />
                              Selesai Diganti
                            </span>
                          )}
                          {item.claim_status === 'HAPUS_BUKU' && (
                            <span className="bg-slate-500/10 text-slate-700 border border-slate-300 px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
                              Hapus Buku
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right font-medium text-on-surface whitespace-nowrap">
                          Rp {item.total_amount.toLocaleString('id-ID')}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {/* Tombol Terima Barang Pengganti (Khusus PIUTANG_PENGGANTIAN & MENUNGGU) */}
                            {isWaitingClaim && (
                              <button
                                onClick={() => handleOpenClaimModal(item)}
                                title="Terima Barang Pengganti & Tambah Stok"
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold px-2"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>Terima Pengganti</span>
                              </button>
                            )}

                            {/* Tombol Lihat Detail */}
                            <button
                              onClick={() => handleOpenDetailModal(item)}
                              title="Lihat Detail Faktur Retur"
                              className="p-1.5 hover:bg-surface-container text-on-surface-variant hover:text-primary rounded-lg transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Tombol Edit / Koreksi */}
                            <button
                              onClick={() => handleOpenEditModal(item)}
                              disabled={isCompleted}
                              title={
                                isCompleted
                                  ? 'Retur yang klaimnya sudah selesai tidak dapat diedit'
                                  : 'Koreksi Data Retur'
                              }
                              className={`p-1.5 rounded-lg transition-colors ${
                                isCompleted
                                  ? 'text-outline/40 cursor-not-allowed'
                                  : 'hover:bg-surface-container text-on-surface-variant hover:text-secondary'
                              }`}
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls */}
          {filteredReturns.length > itemsPerPage && (
            <div className="p-4 border-t border-outline-variant/30 flex items-center justify-between text-xs text-on-surface-variant">
              <div>
                Menampilkan {(currentPage - 1) * itemsPerPage + 1} -{' '}
                {Math.min(currentPage * itemsPerPage, filteredReturns.length)} dari {filteredReturns.length} faktur retur
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1.5 border border-outline rounded hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Sebelumnya
                </button>
                {Array.from({ length: totalPages }).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentPage(idx + 1)}
                    className={`w-7 h-7 rounded text-xs font-medium ${
                      currentPage === idx + 1
                        ? 'bg-primary text-on-primary'
                        : 'hover:bg-surface-container text-on-surface'
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1.5 border border-outline rounded hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Selanjutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: DETAIL FAKTUR RETUR */}
      {isDetailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-outline-variant/40 animate-in fade-in-50 duration-150">
            <div className="p-5 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg text-on-surface">Detail Retur Pembelian</h3>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingDetail || !selectedReturn ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-xs text-on-surface-variant">Memuat rincian produk retur...</p>
              </div>
            ) : (
              <div className="p-6 flex flex-col gap-6">
                {/* Header Information Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/40 text-xs">
                  <div>
                    <span className="text-on-surface-variant">No. Retur:</span>
                    <p className="font-mono font-bold text-primary text-sm mt-0.5">{selectedReturn.return_number}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">Tanggal:</span>
                    <p className="font-medium text-on-surface mt-0.5">{selectedReturn.return_date}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">Supplier:</span>
                    <p className="font-medium text-on-surface mt-0.5">{selectedReturn.supplier_name}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">No. Faktur Asal:</span>
                    <p className="font-mono text-on-surface mt-0.5">{selectedReturn.original_invoice_number || '-'}</p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">Jenis Retur:</span>
                    <p className="mt-0.5">
                      {selectedReturn.return_type === 'PIUTANG_PENGGANTIAN' ? (
                        <span className="text-blue-700 font-medium">Piutang Penggantian</span>
                      ) : (
                        <span className="text-rose-700 font-medium">Barang Rusak</span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-on-surface-variant">Status Klaim:</span>
                    <p className="mt-0.5">
                      {selectedReturn.claim_status === 'SELESAI_DIGANTI' ? (
                        <span className="text-emerald-700 font-bold">Selesai Diganti</span>
                      ) : selectedReturn.claim_status === 'MENUNGGU_PENGGANTIAN' ? (
                        <span className="text-amber-700 font-bold">Menunggu Penggantian</span>
                      ) : (
                        <span className="text-slate-700 font-medium">Hapus Buku</span>
                      )}
                    </p>
                  </div>
                  {selectedReturn.replacement_received_at && (
                    <div className="col-span-2 sm:col-span-3 bg-emerald-50 text-emerald-800 p-2.5 rounded-lg border border-emerald-200">
                      <span className="font-medium">Tanggal Diterima Pengganti:</span>{' '}
                      {new Date(selectedReturn.replacement_received_at).toLocaleString('id-ID')}
                    </div>
                  )}
                  {selectedReturn.notes && (
                    <div className="col-span-2 sm:col-span-3">
                      <span className="text-on-surface-variant">Catatan Umum:</span>
                      <p className="text-on-surface mt-0.5 italic">{selectedReturn.notes}</p>
                    </div>
                  )}
                </div>

                {/* Items Table */}
                <div>
                  <h4 className="font-semibold text-sm text-on-surface mb-2">Rincian Barang yang Diretur</h4>
                  <div className="border border-outline-variant/40 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-surface-container-low text-on-surface-variant font-semibold">
                        <tr className="border-b border-outline-variant/30">
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Produk</th>
                          <th className="py-2.5 px-3 text-right">Qty</th>
                          <th className="py-2.5 px-3 text-right">Harga Beli Satuan</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                          <th className="py-2.5 px-3">Alasan Retur</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {(selectedReturn.items || []).map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="py-2 px-3 text-on-surface-variant">{idx + 1}</td>
                            <td className="py-2 px-3 text-on-surface font-medium">
                              <div>{it.product_name || 'Produk'}</div>
                              {it.sku && <div className="text-[10px] font-mono text-on-surface-variant">{it.sku}</div>}
                            </td>
                            <td className="py-2 px-3 text-right font-medium text-on-surface">{it.qty}</td>
                            <td className="py-2 px-3 text-right text-on-surface">
                              Rp {it.cost_per_unit.toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-right font-bold text-on-surface">
                              Rp {(it.qty * it.cost_per_unit).toLocaleString('id-ID')}
                            </td>
                            <td className="py-2 px-3 text-on-surface-variant italic">{it.reason || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-surface-container-low font-bold">
                        <tr>
                          <td colSpan={4} className="py-2.5 px-3 text-right text-on-surface">
                            Total Retur:
                          </td>
                          <td className="py-2.5 px-3 text-right text-primary text-sm font-bold">
                            Rp {selectedReturn.total_amount.toLocaleString('id-ID')}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <div className="p-4 border-t border-outline-variant/30 flex justify-end bg-surface-container-low sticky bottom-0">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-5 py-2 bg-secondary text-on-secondary rounded-lg text-xs font-semibold hover:bg-secondary/90 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT / KOREKSI FAKTUR RETUR */}
      {isEditModalOpen && editingReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl border border-outline-variant/40 animate-in fade-in-50 duration-150">
            <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-secondary" />
                <h3 className="font-bold text-base text-on-surface">Koreksi Data Faktur Retur</h3>
              </div>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit} className="p-5 flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-on-surface">Nomor Retur</label>
                <input
                  type="text"
                  value={editReturnNumber}
                  onChange={(e) => setEditReturnNumber(e.target.value)}
                  className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-sm text-on-surface focus:border-primary outline-none"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-on-surface">Catatan Faktur</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Tambahkan catatan koreksi..."
                  className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-sm text-on-surface focus:border-primary outline-none resize-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-on-surface">
                  Alasan Perubahan Data <span className="text-error">*</span>
                </label>
                <textarea
                  rows={2}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Jelaskan alasan koreksi data ini (wajib, min. 10 karakter)..."
                  className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-sm text-on-surface focus:border-primary outline-none resize-none"
                  required
                />
                <span className="text-[10px] text-on-surface-variant">
                  {editReason.trim().length} / 10 karakter minimum
                </span>
              </div>

              <div className="mt-2 flex justify-end gap-2 pt-2 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-outline rounded-lg text-on-surface hover:bg-surface-container font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit || editReason.trim().length < 10}
                  className="px-5 py-2 bg-primary text-on-primary rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isSavingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: KONFIRMASI TERIMA BARANG PENGGANTI (RESTOCK OTOMATIS) */}
      {isClaimModalOpen && claimReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-lg shadow-2xl border border-emerald-500/30 animate-in fade-in-50 duration-150">
            <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-800">
                <PackageCheck className="w-6 h-6 text-emerald-600" />
                <h3 className="font-bold text-base">Terima Barang Pengganti dari Supplier</h3>
              </div>
              <button
                onClick={() => setIsClaimModalOpen(false)}
                className="p-1 text-emerald-700 hover:text-emerald-900 rounded-lg hover:bg-emerald-500/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <p className="font-semibold">Otomatisasi Restock Gudang</p>
                  <p className="text-amber-800/90 mt-0.5">
                    Barang fisik pengganti dari supplier <strong>{claimReturn.supplier_name}</strong> telah diterima
                    dengan baik? Stok produk berikut akan <strong>otomatis ditambahkan kembali</strong> ke inventori
                    gudang dan status klaim diubah menjadi <strong>SELESAI_DIGANTI</strong>.
                  </p>
                </div>
              </div>

              {/* Rincian Produk yang Akan Direstock */}
              <div>
                <p className="font-semibold text-on-surface mb-2">Daftar Barang & Kuantitas yang Ditambahkan:</p>
                <div className="border border-outline-variant/40 rounded-xl overflow-hidden divide-y divide-outline-variant/20 bg-surface-container-lowest">
                  {(claimReturn.items || []).map((it, idx) => (
                    <div key={it.id || idx} className="p-2.5 px-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-on-surface">{it.product_name || 'Produk'}</p>
                        {it.sku && <p className="text-[10px] font-mono text-on-surface-variant">SKU: {it.sku}</p>}
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-xs">
                          +{it.qty} unit
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-on-surface">Catatan Penerimaan Pengganti (Opsional)</label>
                <input
                  type="text"
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="Misal: Diterima oleh Pak Budi, kondisi barang baru segel utuh"
                  className="px-3 py-2 bg-surface-container-lowest border border-outline rounded-lg text-xs text-on-surface focus:border-emerald-500 outline-none"
                />
              </div>

              <div className="mt-3 flex justify-end gap-2 pt-3 border-t border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setIsClaimModalOpen(false)}
                  disabled={isProcessingClaim}
                  className="px-4 py-2 border border-outline rounded-lg text-on-surface hover:bg-surface-container font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClaim}
                  disabled={isProcessingClaim}
                  className="px-5 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors shadow flex items-center gap-1.5"
                >
                  {isProcessingClaim ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Memproses Restock...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Konfirmasi Penerimaan & Tambah Stok
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
