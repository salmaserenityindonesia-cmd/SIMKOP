import { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { loanService, LoanApplicationStatusTab } from '../../services/loanService';
import { Loader2, CheckCircle, XCircle, Download, FileText, Eye } from 'lucide-react';
import StatusBadge, { StatusType } from '../../components/ui/StatusBadge';
import { exportToExcel, exportToPDF } from '../../lib/exportUtils';
import { useFeedback } from '../../context/FeedbackContext';

interface ApprovalPinjamanProps {
  initialTab?: LoanApplicationStatusTab;
  initialPinjamanList?: any[];
  initialCounts?: { pending: number; approved: number };
}

export default function ApprovalPinjaman({
  initialTab = 'PENDING',
  initialPinjamanList,
  initialCounts
}: ApprovalPinjamanProps = {}) {
  const { showToast, showConfirm } = useFeedback();
  const [pinjamanList, setPinjamanList] = useState<any[]>(initialPinjamanList || []);
  const [loading, setLoading] = useState(initialPinjamanList === undefined);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LoanApplicationStatusTab>(initialTab);
  const [counts, setCounts] = useState<{ pending: number; approved: number }>(
    initialCounts || { pending: 0, approved: 0 }
  );

  useEffect(() => {
    if (initialPinjamanList === undefined) {
      loadData(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (initialCounts === undefined && initialPinjamanList === undefined) {
      loanService.getLoanApplications('APPROVED')
        .then(res => {
          if (res) setCounts(prev => ({ ...prev, approved: res.length }));
        })
        .catch(() => {});
    }
  }, []);

  async function loadData(tab: LoanApplicationStatusTab = activeTab) {
    try {
      setLoading(true);
      setError(null);
      const data = await loanService.getLoanApplications(tab);
      setPinjamanList(data || []);

      if (tab === 'PENDING') {
        setCounts(prev => ({ ...prev, pending: (data || []).length }));
      } else if (tab === 'APPROVED') {
        setCounts(prev => ({ ...prev, approved: (data || []).length }));
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data persetujuan');
    } finally {
      setLoading(false);
    }
  }

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    const isApprove = action === 'approved';
    const confirmed = await showConfirm({
      title: isApprove ? 'Setujui Pinjaman' : 'Tolak Pinjaman',
      message: `Apakah Anda yakin ingin ${isApprove ? 'MENYETUJUI' : 'MENOLAK'} pinjaman ini?`,
      confirmText: isApprove ? 'Setujui' : 'Tolak',
      variant: isApprove ? 'primary' : 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(id);
      if (action === 'approved') {
        const startDate = new Date().toISOString().split('T')[0];
        await loanService.approveLoan(id, startDate);
        showToast('Pinjaman berhasil disetujui', 'success');
      } else {
        await loanService.rejectLoan(id);
        showToast('Pinjaman berhasil ditolak', 'success');
      }
      await loadData(activeTab);
      // Refresh approved count in background
      loanService.getLoanApplications('APPROVED')
        .then(res => {
          if (res) setCounts(prev => ({ ...prev, approved: res.length }));
        })
        .catch(() => {});
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const formatRupiah = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const getMappedStatus = (status?: string): StatusType => {
    const s = (status || 'draft').toLowerCase();
    if (s === 'active' || s === 'approved') return 'approved';
    if (s === 'completed' || s === 'paid_off' || s === 'lunas' || s === 'paid') return 'lunas';
    if (s === 'rejected' || s === 'ditolak') return 'rejected';
    return 'pending';
  };

  const handleExportExcel = () => {
    const data = pinjamanList.map(p => ({
      'No. Anggota': p.anggota?.no_anggota || p.anggota?.nrp || '-',
      'Nama Anggota': p.anggota?.nama || '-',
      'Tanggal Pengajuan': formatDate(p.created_at),
      'Tanggal Disetujui': formatDate(p.disbursed_at),
      'Jumlah Pinjaman': p.amount || p.principal_amount || 0,
      'Tenor (Bulan)': p.tenor || p.agreed_tenor_months || 0,
      'Status': p.status || 'draft'
    }));
    const tabSuffix = activeTab === 'PENDING' ? 'Menunggu' : activeTab === 'APPROVED' ? 'Disetujui' : 'Semua';
    exportToExcel(data, `Data_Pinjaman_${tabSuffix}`);
  };

  const handleExportPDF = () => {
    const headers = ['No. Anggota', 'Nama Anggota', 'Tgl Pengajuan', 'Tgl Disetujui', 'Jumlah', 'Tenor', 'Status'];
    const data = pinjamanList.map(p => [
      p.anggota?.no_anggota || p.anggota?.nrp || '-',
      p.anggota?.nama || '-',
      formatDate(p.created_at),
      formatDate(p.disbursed_at),
      formatRupiah(p.amount || p.principal_amount || 0),
      `${p.tenor || p.agreed_tenor_months || 0} Bulan`,
      p.status || 'draft'
    ]);
    const tabTitle = activeTab === 'PENDING' ? 'Menunggu Persetujuan' : activeTab === 'APPROVED' ? 'Sudah Disetujui' : 'Semua Riwayat';
    exportToPDF(headers, data, `Data_Pinjaman_${activeTab}`, `Laporan Persetujuan Pinjaman (${tabTitle})`);
  };

  const getEmptyMessage = () => {
    switch (activeTab) {
      case 'APPROVED':
        return 'Belum ada riwayat permohonan pinjaman yang disetujui.';
      case 'ALL':
        return 'Tidak ada riwayat permohonan pinjaman.';
      case 'PENDING':
      default:
        return 'Tidak ada pengajuan pinjaman yang menunggu persetujuan.';
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Persetujuan Pinjaman</h1>
          <p className="text-[var(--color-text-secondary)]">Kelola persetujuan pinjaman anggota (Khusus Admin)</p>
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

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-3 gap-2">
          <button
            type="button"
            data-testid="tab-pending"
            onClick={() => {
              setActiveTab('PENDING');
              loadData('PENDING');
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'PENDING'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Menunggu Persetujuan
            {counts.pending > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">
                {counts.pending}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="tab-approved"
            onClick={() => {
              setActiveTab('APPROVED');
              loadData('APPROVED');
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'APPROVED'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Sudah Disetujui
            {counts.approved > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                {counts.approved}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="tab-all"
            onClick={() => {
              setActiveTab('ALL');
              loadData('ALL');
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'ALL'
                ? 'border-[var(--color-primary)] text-[var(--color-primary)] font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Semua Riwayat
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">No. Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama Anggota</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Tgl Pengajuan</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Tgl Disetujui</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-right">Jumlah Pinjaman</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Tenor</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Status</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : pinjamanList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    {getEmptyMessage()}
                  </td>
                </tr>
              ) : (
                pinjamanList.map((p) => {
                  const isPending = !p.status || p.status === 'draft' || p.status === 'pending';
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4 text-sm text-gray-900">{p.anggota?.no_anggota || p.anggota?.nrp || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-700">{p.anggota?.nama || '-'}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{formatDate(p.created_at)}</td>
                      <td className="py-3 px-4 text-sm text-gray-600">{formatDate(p.disbursed_at)}</td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right">
                        {formatRupiah(p.amount || p.principal_amount || 0)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-700 text-center">
                        {p.tenor || p.agreed_tenor_months || 0} Bulan
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        <StatusBadge status={getMappedStatus(p.status)} />
                      </td>
                      <td className="py-3 px-4 text-sm text-center">
                        <div className="flex justify-center gap-2">
                          {isPending && (
                            <>
                              <button 
                                onClick={() => handleAction(p.id, 'approved')}
                                disabled={actionLoading === p.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200 rounded-md text-xs font-medium disabled:opacity-50"
                              >
                                {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                Setujui
                              </button>
                              <button 
                                onClick={() => handleAction(p.id, 'rejected')}
                                disabled={actionLoading === p.id}
                                className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-md text-xs font-medium disabled:opacity-50"
                              >
                                {actionLoading === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                Tolak
                              </button>
                            </>
                          )}
                          <a 
                            href={`/admin/pinjaman/${p.id}`}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md text-xs font-medium"
                          >
                            <Eye className="w-3 h-3" />
                            Detail
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
