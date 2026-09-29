import { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getMonthlyDepositCommitments, MonthlyDepositCommitment, addDepositTransaction } from '../../services/koperasiService';
import { Search, Loader2, Download, FileText, Plus, ArrowUpDown } from 'lucide-react';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import { formatCurrency } from '../../utils/formatCurrency';

export default function DashboardSimpanan() {
  const [commitments, setCommitments] = useState<MonthlyDepositCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Payment Modal State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCommitment, setSelectedCommitment] = useState<MonthlyDepositCommitment | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Default to current month/year
  const [targetMonth, setTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [targetYear, setTargetYear] = useState<number>(new Date().getFullYear());

  useEffect(() => {
    loadData();
  }, [targetMonth, targetYear]);

  async function loadData() {
    try {
      setLoading(true);
      const data = await getMonthlyDepositCommitments(targetMonth, targetYear);
      setCommitments(data);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  let filteredList = commitments.filter(c => 
    c.anggota?.nama?.toLowerCase().includes(search.toLowerCase()) || 
    c.anggota?.nrp?.toLowerCase().includes(search.toLowerCase()) ||
    c.deposit_name.toLowerCase().includes(search.toLowerCase())
  );

  if (sortConfig !== null) {
    filteredList.sort((a, b) => {
      let aValue: any = '';
      let bValue: any = '';

      switch (sortConfig.key) {
        case 'anggota':
          aValue = a.anggota?.nama?.toLowerCase() || '';
          bValue = b.anggota?.nama?.toLowerCase() || '';
          break;
        case 'jenis':
          aValue = a.deposit_name.toLowerCase();
          bValue = b.deposit_name.toLowerCase();
          break;
        case 'tagihan':
          aValue = a.commitment_amount;
          bValue = b.commitment_amount;
          break;
        case 'sudah_bayar':
          aValue = a.total_paid;
          bValue = b.total_paid;
          break;
        case 'sisa_tagihan':
          aValue = a.remaining_balance;
          bValue = b.remaining_balance;
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Reset page when filters or sorting changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, sortConfig, targetMonth, targetYear]);

  const totalFiltered = filteredList.length;
  const totalPages = Math.ceil(totalFiltered / itemsPerPage);
  const paginatedList = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleOpenPayment = (commitment: MonthlyDepositCommitment) => {
    setSelectedCommitment(commitment);
    setPaymentAmount(commitment.remaining_balance > 0 ? commitment.remaining_balance : 0);
    setIsPaymentModalOpen(true);
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCommitment) return;
    
    if (paymentAmount <= 0) {
      alert("Nominal pembayaran harus lebih dari 0");
      return;
    }

    try {
      setIsSubmitting(true);
      await addDepositTransaction(
        selectedCommitment.member_deposit_id,
        paymentAmount,
        targetMonth,
        targetYear,
        'deposit',
        `Pembayaran parsial/penuh ${selectedCommitment.deposit_name} Bulan ${targetMonth}/${targetYear}`
      );
      
      setIsPaymentModalOpen(false);
      loadData();
      alert("Pembayaran berhasil dicatat!");
    } catch (err: any) {
      alert(err.message || 'Gagal memproses pembayaran');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const data = filteredList.map(c => ({
      'NRP': c.anggota?.nrp || '-',
      'Nama': c.anggota?.nama || '-',
      'Jenis Simpanan': c.deposit_name,
      'Tagihan': c.commitment_amount,
      'Sudah Dibayar': c.total_paid,
      'Sisa Tagihan': c.remaining_balance,
      'Status': c.status === 'lunas' ? 'Lunas' : 'Belum Lunas'
    }));
    exportToExcel(data, `Tagihan_Simpanan_${targetMonth}_${targetYear}`);
  };

  const handleExportPDF = () => {
    const headers = ['NRP', 'Nama', 'Jenis Simpanan', 'Tagihan', 'Sudah Dibayar', 'Sisa', 'Status'];
    const data = filteredList.map(c => [
      c.anggota?.nrp || '-',
      c.anggota?.nama || '-',
      c.deposit_name,
      formatCurrency(c.commitment_amount),
      formatCurrency(c.total_paid),
      formatCurrency(c.remaining_balance),
      c.status === 'lunas' ? 'Lunas' : 'Belum'
    ]);
    exportToPDF(headers, data, `Tagihan_Simpanan_${targetMonth}_${targetYear}`, `Tagihan Simpanan Bulan ${targetMonth} Tahun ${targetYear}`);
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Tagihan Simpanan Bulanan</h1>
          <p className="text-[var(--color-text-secondary)]">Kelola setoran simpanan anggota per bulan (parsial/penuh)</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium text-sm transition-colors"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
        {/* Toolbar */}
        <div className="p-4 border-b border-gray-200 flex flex-wrap justify-between items-center bg-gray-50 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Cari anggota / jenis..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter Bulan:</label>
            <select 
              value={targetMonth} 
              onChange={(e) => setTargetMonth(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i+1} value={i+1}>Bulan {i+1}</option>
              ))}
            </select>
            <select 
              value={targetYear} 
              onChange={(e) => setTargetYear(parseInt(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
            >
              {[targetYear - 1, targetYear, targetYear + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('anggota')}>
                  <div className="flex items-center gap-1">Anggota <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                </th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('jenis')}>
                  <div className="flex items-center gap-1">Jenis Simpanan <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                </th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-right cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('tagihan')}>
                  <div className="flex items-center justify-end gap-1">Tagihan <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                </th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-right cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('sudah_bayar')}>
                  <div className="flex items-center justify-end gap-1">Sudah Bayar <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                </th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-right cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('sisa_tagihan')}>
                  <div className="flex items-center justify-end gap-1">Sisa Tagihan <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                </th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center cursor-pointer hover:bg-gray-200 transition-colors" onClick={() => handleSort('status')}>
                  <div className="flex items-center justify-center gap-1">Status <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                </th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat tagihan bulan {targetMonth}/{targetYear}...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    Tidak ada data tagihan simpanan untuk bulan ini.
                  </td>
                </tr>
              ) : (
                paginatedList.map((c) => (
                  <tr key={`${c.member_id}-${c.deposit_type_id}`} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm">
                      <div className="font-medium text-gray-900">{c.anggota?.nama || '-'}</div>
                      <div className="text-gray-500 text-xs">NRP: {c.anggota?.nrp || '-'}</div>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-700">{c.deposit_name}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-right">{formatCurrency(c.commitment_amount)}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 text-right">{formatCurrency(c.total_paid)}</td>
                    <td className="py-3 px-4 text-sm font-semibold text-red-600 text-right">{formatCurrency(c.remaining_balance)}</td>
                    <td className="py-3 px-4 text-sm text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        c.status === 'lunas' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {c.status === 'lunas' ? 'Lunas' : 'Belum Lunas'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-center">
                      {c.status !== 'lunas' && (
                        <button 
                          onClick={() => handleOpenPayment(c)}
                          className="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Bayar
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
        <div className="p-4 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4 text-sm bg-gray-50">
          <div className="flex items-center gap-2 text-gray-600">
            <span>
              Menampilkan {totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, totalFiltered)} dari {totalFiltered} data
            </span>
            <select 
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 border border-gray-300 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] bg-white"
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
              className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="font-medium px-2 text-gray-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      {isPaymentModalOpen && selectedCommitment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="font-semibold text-gray-800">Bayar Cicilan Simpanan</h2>
              <button 
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleProcessPayment} className="p-6">
              <div className="space-y-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <span className="text-gray-600">Anggota:</span>
                    <span className="font-semibold">{selectedCommitment.anggota?.nama}</span>
                    
                    <span className="text-gray-600">Jenis:</span>
                    <span className="font-semibold">{selectedCommitment.deposit_name}</span>
                    
                    <span className="text-gray-600">Periode:</span>
                    <span className="font-semibold">Bulan {targetMonth} Tahun {targetYear}</span>
                    
                    <span className="text-gray-600">Sisa Tagihan:</span>
                    <span className="font-semibold text-red-600">{formatCurrency(selectedCommitment.remaining_balance)}</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nominal Pembayaran (Rp)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedCommitment.remaining_balance > 0 ? selectedCommitment.remaining_balance : undefined}
                    required
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseInt(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-xs text-gray-500 mt-1">Bisa bayar penuh atau sebagian (parsial).</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  disabled={isSubmitting}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                  disabled={isSubmitting || paymentAmount <= 0}
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSubmitting ? 'Memproses...' : 'Proses Pembayaran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
