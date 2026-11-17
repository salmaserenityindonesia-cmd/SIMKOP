import React, { useState, useEffect, useMemo } from 'react';
import { X, Users, Search, Download, Landmark, Coins } from 'lucide-react';
import { 
  LebaranDisbursementCycle, 
  LebaranDisbursementItem, 
  bulkWithdrawalService 
} from '../../../services/bulkWithdrawalService';

interface CycleRecipientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  cycle: LebaranDisbursementCycle | null;
}

export default function CycleRecipientsModal({
  isOpen,
  onClose,
  cycle
}: CycleRecipientsModalProps) {
  const [recipients, setRecipients] = useState<LebaranDisbursementItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  useEffect(() => {
    setCurrentPage(1);
    if (isOpen && cycle?.id) {
      loadRecipients(cycle.id);
    } else {
      setRecipients([]);
      setSearchQuery('');
      setError(null);
    }
  }, [isOpen, cycle?.id]);

  const loadRecipients = async (cycleId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const items = await bulkWithdrawalService.getCycleRecipients(cycleId);
      setRecipients(items);
    } catch (err: any) {
      console.error('Error loading cycle recipients:', err);
      setError(err.message || 'Gagal memuat rincian penerima siklus.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRecipients = useMemo(() => {
    if (!searchQuery.trim()) return recipients;
    const q = searchQuery.toLowerCase();
    return recipients.filter(r => 
      (r.member_name || '').toLowerCase().includes(q) ||
      (r.nrp || '').toLowerCase().includes(q) ||
      (r.bank_account || '').toLowerCase().includes(q)
    );
  }, [recipients, searchQuery]);

  const totalFilteredAmount = useMemo(() => {
    return filteredRecipients.reduce((sum, r) => sum + Number(r.amount_disbursed || 0), 0);
  }, [filteredRecipients]);

  const totalRecipientsCount = filteredRecipients.length;
  const totalRecipientPages = Math.max(1, Math.ceil(totalRecipientsCount / pageSize));
  const safeRecipientPage = Math.min(currentPage, totalRecipientPages);
  const recipientStartIndex = (safeRecipientPage - 1) * pageSize;
  const recipientEndIndex = Math.min(recipientStartIndex + pageSize, totalRecipientsCount);

  const paginatedRecipients = useMemo(
    () => filteredRecipients.slice(recipientStartIndex, recipientEndIndex),
    [filteredRecipients, recipientStartIndex, recipientEndIndex]
  );

  const handleExportCSV = () => {
    if (filteredRecipients.length === 0) return;
    const cycleDate = cycle?.disbursement_date || (cycle?.cut_off_date ? cycle.cut_off_date.slice(0, 10) : 'siklus');
    const headers = ['No', 'NRP', 'Nama Anggota', 'Nomor Rekening', 'Nominal Dicairkan (Rp)'];
    const rows = filteredRecipients.map((r, idx) => [
      idx + 1,
      `"${r.nrp || '-'}"`,
      `"${(r.member_name || '-').replace(/"/g, '""')}"`,
      `'${r.bank_account || '-'}`,
      r.amount_disbursed
    ]);

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Penerima_Lebaran_${cycleDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !cycle) return null;

  const displayDate = cycle.disbursement_date 
    ? new Date(cycle.disbursement_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : cycle.cut_off_date 
      ? new Date(cycle.cut_off_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
      : '-';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl">
              <Users className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-white">
                Daftar Penerima Pencairan Simpanan Lebaran
              </h3>
              <p className="text-xs text-emerald-200 mt-0.5">
                {cycle.cycle_name} • Tanggal Pencairan: {displayDate}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subheader & Summary bar */}
        <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              Total Penerima: <strong className="text-slate-900">{recipients.length} Anggota</strong>
            </span>
            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-emerald-600" />
              Total Dana: <strong className="text-emerald-700">Rp {Number(cycle.total_amount || 0).toLocaleString('id-ID')}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              disabled={filteredRecipients.length === 0}
              className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              Ekspor CSV
            </button>
          </div>
        </div>

        {/* Filter Search */}
        <div className="px-6 py-3 border-b border-slate-100 flex items-center">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari NRP, Nama, atau Rekening..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
            />
          </div>
          {searchQuery && (
            <span className="text-xs text-slate-500 ml-3">
              Ditemukan {filteredRecipients.length} data (Total Rp {totalFilteredAmount.toLocaleString('id-ID')})
            </span>
          )}
        </div>

        {/* Content Table */}
        <div className="p-6 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-2">
              <div className="w-7 h-7 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Memuat daftar anggota penerima...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs font-medium">
              {error}
            </div>
          ) : filteredRecipients.length === 0 ? (
            <div className="py-14 text-center text-slate-400 text-xs">
              {searchQuery ? 'Tidak ada anggota penerima yang cocok dengan kata kunci.' : 'Belum ada rincian penerima yang tercatat pada siklus ini.'}
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3">NRP</th>
                    <th className="py-2.5 px-3">Nama Anggota</th>
                    <th className="py-2.5 px-3">Rekening Bank</th>
                    <th className="py-2.5 px-3 text-right">Nominal Dicairkan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRecipients.map((rec, idx) => (
                    <tr key={rec.id || `${recipientStartIndex + idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{recipientStartIndex + idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-700">{rec.nrp || '-'}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{rec.member_name || '-'}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        <div className="flex items-center gap-1">
                          <Landmark className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{rec.bank_account || '-'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        Rp {Number(rec.amount_disbursed || 0).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 text-xs text-slate-600">
                <div className="flex items-center gap-3">
                  <span>
                    Menampilkan{' '}
                    <strong className="font-semibold text-slate-800">
                      {totalRecipientsCount > 0 ? recipientStartIndex + 1 : 0}-{recipientEndIndex}
                    </strong>{' '}
                    dari <strong className="font-semibold text-slate-800">{totalRecipientsCount}</strong> penerima
                  </span>
                  <select
                    aria-label="Jumlah baris per halaman"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={10}>10 / halaman</option>
                    <option value={25}>25 / halaman</option>
                    <option value={50}>50 / halaman</option>
                    <option value={100}>100 / halaman</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={safeRecipientPage <= 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1.5 font-semibold text-slate-800">
                    Halaman {safeRecipientPage} / {totalRecipientPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalRecipientPages, prev + 1))}
                    disabled={safeRecipientPage >= totalRecipientPages}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

