import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnggota, fetchAllAnggotaPaged, updateAnggota, Anggota } from '../../services/koperasiService';
import { Search, Loader2, Plus, Edit2, Eye, X, Download, Upload, RotateCcw } from 'lucide-react';
import { getMembersComprehensiveReport, createMember, resetAllMembersData } from '../../services/memberService';
import { exportMembersToExcel, exportMembersToPdf } from '../../services/memberExporter';
import { getKoperasiProfile } from '../../services/settingsService';
import MemberMigrationModal from '../../components/members/MemberMigrationModal';
import MemberMigrationDetailModal from '../../components/members/MemberMigrationDetailModal';
import DangerConfirmModal from '../../components/common/DangerConfirmModal';
import { exportMemberTemplate, parseMemberUpload, executeMigration, MemberParseResult } from '../../services/memberExcelService';
import { useFeedback } from '../../context/FeedbackContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { getActiveSavingsRateTiers } from '../../services/savingsRateService';

export async function triggerMemberExportExcel(
  memberIds: string[],
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void,
  setIsExporting?: (loading: boolean) => void
) {
  setIsExporting?.(true);
  try {
    const comprehensiveData = await getMembersComprehensiveReport(memberIds);
    await exportMembersToExcel(comprehensiveData);
    showToast('Laporan Excel 14 kolom berhasil diunduh.', 'success');
  } catch (err: any) {
    console.error('Export Excel error:', err);
    showToast(err?.message || 'Gagal mengekspor laporan Excel', 'error');
  } finally {
    setIsExporting?.(false);
  }
}

export async function triggerMemberExportPdf(
  memberIds: string[],
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void,
  setIsExporting?: (loading: boolean) => void
) {
  setIsExporting?.(true);
  try {
    const comprehensiveData = await getMembersComprehensiveReport(memberIds);
    const profile = await getKoperasiProfile();
    await exportMembersToPdf(comprehensiveData, profile);
    showToast('Laporan PDF Landscape 14 kolom berhasil diunduh.', 'success');
  } catch (err: any) {
    console.error('Export PDF error:', err);
    showToast(err?.message || 'Gagal mengekspor laporan PDF', 'error');
  } finally {
    setIsExporting?.(false);
  }
}

export async function triggerResetAllMembers(
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  setIsResetting?: (val: boolean) => void,
  onSuccess?: () => Promise<void> | void
) {
  setIsResetting?.(true);
  try {
    const res = await resetAllMembersData();
    showToast(
      res.message || 'Seluruh data anggota, simpanan, dan pinjaman berhasil dikosongkan.',
      'success'
    );
    if (onSuccess) {
      await onSuccess();
    }
    return res;
  } catch (err: any) {
    console.error('Reset members error:', err);
    showToast(err?.message || 'Gagal mengosongkan data anggota', 'error');
    throw err;
  } finally {
    setIsResetting?.(false);
  }
}

export interface ManajemenAnggotaProps {
  initialShowModal?: boolean;
  initialResetModalOpen?: boolean;
  initialActivePokokRate?: number;
}

export default function ManajemenAnggota({
  initialShowModal = false,
  initialResetModalOpen = false,
  initialActivePokokRate,
}: ManajemenAnggotaProps = {}) {
  const { showToast } = useFeedback();
  const [anggotaList, setAnggotaList] = useState<Anggota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activePokokRate, setActivePokokRate] = useState<number | null>(initialActivePokokRate ?? null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Modal State
  const [showModal, setShowModal] = useState(initialShowModal);
  const [editingAnggota, setEditingAnggota] = useState<Anggota | null>(null);
  const [formData, setFormData] = useState({
    nrp: '',
    nama: '',
    pangkat: '',
    status: 'aktif',
    master_thp: 0,
    bank_account_number: '',
    tgl_awal_anggota: new Date().toISOString().slice(0, 10),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parseResult, setParseResult] = useState<MemberParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Reset Data State
  const [isResetModalOpen, setIsResetModalOpen] = useState(initialResetModalOpen);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [data, rates] = await Promise.all([
        fetchAllAnggotaPaged(),
        initialActivePokokRate !== undefined ? Promise.resolve(null) : getActiveSavingsRateTiers().catch(() => null)
      ]);
      setAnggotaList(data);
      if (rates && (rates['POKOK'] || rates['SP'])) {
        setActivePokokRate(rates['POKOK'] || rates['SP']);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  const fetchMembers = loadData;

  const handleOpenAddModal = () => {
    setEditingAnggota(null);
    setFormData({
      nrp: '',
      nama: '',
      pangkat: '',
      status: 'aktif',
      master_thp: 0,
      bank_account_number: '',
      tgl_awal_anggota: new Date().toISOString().slice(0, 10),
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (anggota: Anggota) => {
    setEditingAnggota(anggota);
    setFormData({
      nrp: anggota.nrp || '',
      nama: anggota.nama,
      pangkat: anggota.pangkat || '',
      status: anggota.status || 'aktif',
      master_thp: anggota.master_thp || 0,
      bank_account_number: anggota.bank_account_number || '',
      tgl_awal_anggota: anggota.created_at ? anggota.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setShowModal(true);
  };

  // Detail Migrasi Awal Modal State
  const [selectedMigrationMember, setSelectedMigrationMember] = useState<Anggota | null>(null);
  const [isMigrationDetailOpen, setIsMigrationDetailOpen] = useState(false);

  const handleOpenMigrationDetail = (anggota: Anggota) => {
    setSelectedMigrationMember(anggota);
    setIsMigrationDetailOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      if (editingAnggota) {
        await updateAnggota(editingAnggota.id, {
          nrp: formData.nrp,
          nama: formData.nama,
          pangkat: formData.pangkat,
          status: formData.status,
          master_thp: formData.master_thp,
          bank_account_number: formData.bank_account_number,
        });
        showToast('Data anggota berhasil diperbarui.', 'success');
      } else {
        await createMember({
          nrp: formData.nrp,
          nama: formData.nama,
          pangkat: formData.pangkat,
          master_thp: formData.master_thp,
          bank_account_number: formData.bank_account_number,
          tgl_awal_anggota: formData.tgl_awal_anggota,
        });
        showToast('Anggota baru berhasil ditambahkan.', 'success');
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan anggota', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredList = anggotaList.filter(a => 
    a.nama.toLowerCase().includes(search.toLowerCase()) || 
    (a.nrp && a.nrp.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);
  const paginatedList = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return 'Aktif';
      case 'PENDING_RESIGNED': return 'Menunggu Resign';
      case 'READY_TO_RESIGN': return 'Siap Resign';
      case 'RESIGNED': return 'Resign';
      case 'BLOCKED': return 'Diblokir';
      default: return 'Aktif';
    }
  };

  const handleExportExcel = async () => {
    await triggerMemberExportExcel(
      filteredList.map(a => a.id),
      showToast,
      setIsExportingExcel
    );
  };

  const handleExportPDF = async () => {
    await triggerMemberExportPdf(
      filteredList.map(a => a.id),
      showToast,
      setIsExportingPdf
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseMemberUpload(file);
      setParseResult(result);
      setIsImportModalOpen(true);
    } catch (error: any) {
      showToast(error.message || 'Gagal memproses file Excel', 'error');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportConfirm = async () => {
    if (!parseResult) return;
    
    setIsImporting(true);
    setImportProgress({ current: 0, total: parseResult.rows.length });
    try {
      await executeMigration(parseResult, (current, total) => {
        setImportProgress({ current, total });
      });
      setIsImportModalOpen(false);
      await fetchMembers();
      const totalAnggota = parseResult.rows.length;
      const totalPinjaman = parseResult.rows.filter(r => r.jumlah_pinjaman > 0).length;
      const message = totalPinjaman > 0
        ? `Berhasil mengimpor ${totalAnggota} anggota dan menyinkronkan ${totalPinjaman} data pinjaman migrasi!`
        : `Berhasil mengimpor ${totalAnggota} anggota!`;
      showToast(message, 'success');
    } catch (error: any) {
      showToast(error.message || 'Gagal mengimpor anggota', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleConfirmReset = async () => {
    try {
      await triggerResetAllMembers(showToast, setIsResetting, async () => {
        setIsResetModalOpen(false);
        await fetchMembers();
      });
    } catch {
      // Error is handled with toast inside triggerResetAllMembers
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Manajemen Anggota</h1>
        <p className="text-[var(--color-text-secondary)]">Kelola data induk anggota koperasi</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari anggota (Nama / NRP)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-64"
            />
          </div>
          <div className="flex space-x-2">
            <button
              onClick={exportMemberTemplate}
              className="flex items-center px-4 py-2 border border-[var(--color-primary)] text-[var(--color-primary)] rounded-md hover:bg-blue-50 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4 mr-2" />
              Template
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
              className="flex items-center px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4 mr-2" />
              Import
            </button>
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              disabled={isExportingPdf}
              className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              PDF
            </button>
            <button
              onClick={() => setIsResetModalOpen(true)}
              title="Kosongkan seluruh data anggota, simpanan, dan pinjaman"
              className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-sm transition-colors shadow-xs cursor-pointer shrink-0"
            >
              <RotateCcw className="w-4 h-4 text-rose-600" />
              <span>Reset Data</span>
            </button>
            <button
              onClick={handleOpenAddModal}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 font-medium text-sm shadow-xs transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Tambah Anggota</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">NRP</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Pangkat</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nomor Rekening</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Status</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Terdaftar</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    Tidak ada data anggota.
                  </td>
                </tr>
              ) : (
                paginatedList.map((anggota) => (
                  <tr key={anggota.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{anggota.nrp}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.nama}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.pangkat || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 font-medium">
                      {anggota.bank_account_number || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        anggota.membership_status === 'ACTIVE' || !anggota.membership_status ? 'bg-green-100 text-green-800' :
                        anggota.membership_status === 'PENDING_RESIGNED' ? 'bg-orange-100 text-orange-800' :
                        anggota.membership_status === 'READY_TO_RESIGN' ? 'bg-blue-100 text-blue-800' :
                        anggota.membership_status === 'RESIGNED' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {getStatusText(anggota.membership_status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.created_at ? new Date(anggota.created_at).toLocaleDateString('id-ID') : '-'}</td>
                    <td className="py-3 px-4 text-sm text-center">
                      <div className="flex justify-center items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenMigrationDetail(anggota)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Lihat Detail Data Migrasi Awal"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEditModal(anggota)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Data Anggota"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 text-gray-600">
            <span>
              Menampilkan {filteredList.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, filteredList.length)} dari {filteredList.length} anggota
            </span>
            <select 
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 bg-transparent border-none font-medium text-gray-900 outline-none cursor-pointer focus:ring-0"
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
              className="px-3 py-1 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-sm font-medium px-2 text-gray-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-100">
              <h3 className="font-semibold text-lg text-gray-900">
                {editingAnggota ? 'Edit Anggota' : 'Tambah Anggota Baru'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4">
              <div className="space-y-4">
                {!editingAnggota && (
                  <div className="p-3 bg-blue-50/80 rounded-lg border border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-blue-600 shrink-0 mt-0.5">info</span>
                    <div>
                      <p className="font-semibold text-blue-900">Inisialisasi Simpanan Anggota</p>
                      <p className="text-blue-700 mt-0.5">
                        Rekening Simpanan Pokok ({activePokokRate ? formatCurrency(activePokokRate) : 'Rp 100.000'}) dan Simpanan Wajib akan otomatis dihubungkan sesuai tarif aktif koperasi.
                      </p>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NRP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nrp}
                    onChange={(e) => setFormData({...formData, nrp: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan NRP anggota"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama}
                    onChange={(e) => setFormData({...formData, nama: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pangkat
                  </label>
                  <input
                    type="text"
                    value={formData.pangkat}
                    onChange={(e) => setFormData({...formData, pangkat: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: Sertu, Kopda, dll"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nomor Rekening Bank (Opsional)
                  </label>
                  <input
                    type="text"
                    value={formData.bank_account_number}
                    onChange={(e) => setFormData({...formData, bank_account_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: 115738953714"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gaji Pokok (Master THP) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.master_thp}
                    onChange={(e) => setFormData({...formData, master_thp: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: 5000000"
                  />
                  <p className="text-xs text-gray-500 mt-1">Gaji pokok akan digunakan untuk memvalidasi kelayakan limit pemotongan saat pengajuan pinjaman.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Bergabung <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.tgl_awal_anggota}
                    onChange={(e) => setFormData({...formData, tgl_awal_anggota: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-950 transition-colors text-sm font-medium flex items-center cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MemberMigrationModal 
        isOpen={isImportModalOpen}
        parseResult={parseResult}
        onClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
          }
        }}
        onConfirm={handleImportConfirm}
        isImporting={isImporting}
        importProgress={importProgress}
      />

      <MemberMigrationDetailModal
        isOpen={isMigrationDetailOpen}
        member={selectedMigrationMember}
        onClose={() => setIsMigrationDetailOpen(false)}
      />

      <DangerConfirmModal
        isOpen={isResetModalOpen}
        title="Reset Seluruh Data Anggota"
        message="PERINGATAN: Tindakan ini akan mengosongkan seluruh master data anggota, rekening simpanan, pinjaman, dan riwayat mutasi terkait secara permanen. Transaksi kasir POS akan tetap dipertahankan dengan melepaskan relasi anggota (sales.member_id = NULL) sehingga omzet toko tidak berkurang."
        confirmationKeyword="HAPUS SEMUA DATA ANGGOTA"
        confirmButtonLabel="Ya, Kosongkan Sekarang"
        isLoading={isResetting}
        onConfirm={handleConfirmReset}
        onClose={() => {
          if (!isResetting) {
            setIsResetModalOpen(false);
          }
        }}
      />
    </AdminLayout>
  );
}
