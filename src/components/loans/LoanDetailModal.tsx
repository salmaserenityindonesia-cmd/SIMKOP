import React, { useState, useEffect } from 'react';
import { loanService } from '../../services/loanService';
import { X, Loader2, DollarSign } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';
import { useFeedback } from '../../context/FeedbackContext';

// Helper modal for partial payments
function PartialPaymentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  defaultAmount, 
  title, 
  description,
  scheduleId
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  onSubmit: (amount: number, scheduleId?: string) => Promise<void>; 
  defaultAmount: number;
  title: string;
  description: string;
  scheduleId?: string;
}) {
  const { showToast } = useFeedback();
  const [amountStr, setAmountStr] = useState(defaultAmount.toString());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmountStr(defaultAmount.toString());
    }
  }, [isOpen, defaultAmount]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(amountStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(val) || val <= 0) {
      showToast('Jumlah tidak valid', 'warning');
      return;
    }
    setLoading(true);
    try {
      await onSubmit(val, scheduleId);
      showToast('Pembayaran berhasil disimpan', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan pembayaran', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmountStr(val);
  };

  const formatRupiah = (val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return '';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num).replace('Rp', '').trim();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-md text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-sm text-gray-600">{description}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Bayar (Rp)</label>
            <input
              type="text"
              required
              value={formatRupiah(amountStr)}
              onChange={handleAmountChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            />
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 font-medium disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading || !amountStr || parseInt(amountStr, 10) <= 0}
              className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-md hover:bg-opacity-90 font-medium flex items-center disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
              Proses Bayar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface LoanDetailModalProps {
  isOpen: boolean;
  loanId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LoanDetailModal({
  isOpen,
  loanId,
  onClose,
  onSuccess
}: LoanDetailModalProps) {
  const [pinjaman, setPinjaman] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePayment, setActivePayment] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen && loanId) {
      loadData(loanId);
    } else {
      setPinjaman(null);
      setSchedules([]);
      setError(null);
      setActivePayment(null);
    }
  }, [isOpen, loanId]);

  const loadData = async (targetId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [pinjamanData, schedulesData] = await Promise.all([
        loanService.getLoanById(targetId),
        loanService.getLoanSchedules(targetId)
      ]);
      setPinjaman(pinjamanData);
      setSchedules(schedulesData || []);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat detail pinjaman');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async (amount: number, scheduleId?: string) => {
    if (!loanId) return;
    const targetScheduleId = scheduleId || activePayment?.schedule_id;
    if (targetScheduleId) {
      await loanService.paySchedule(loanId, targetScheduleId, amount, 'CASH', 'Pelunasan parsial jadwal periode terkait');
    } else {
      await loanService.makePayment(loanId, amount, 'CASH', 'Pembayaran cicilan pinjaman (Admin)');
    }

    // Refresh UI & Parent
    await loadData(loanId);
    onSuccess?.();
  };

  if (!isOpen) return null;

  const schedule = schedules;
  const lunasCount = schedules.filter(s => s.status === 'paid').length;
  const sisaCicilan = Math.max(0, (pinjaman?.tenor || 0) - lunasCount);
  const totalPaid = schedules.reduce((sum, s) => sum + Number(s.paid_amount || 0), 0);
  const totalTarget = schedules.reduce((sum, s) => sum + Number(s.target_amount || 0), 0);
  const principalAmount = Number(pinjaman?.principal_amount || pinjaman?.amount || totalTarget);
  const sisaPinjaman = Math.max(0, principalAmount - totalPaid);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Detail Pinjaman</h2>
            {pinjaman?.anggota && (
              <p className="text-sm text-gray-500">
                {pinjaman.anggota?.nama} ({pinjaman.anggota?.no_anggota || pinjaman.anggota?.nrp})
              </p>
            )}
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-gray-200 rounded-lg text-gray-500 transition-colors"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : error || !pinjaman ? (
            <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg">
              {error || 'Data pinjaman tidak ditemukan'}
            </div>
          ) : (
            <>
              {/* Ringkasan Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Status Pinjaman</p>
                    <StatusBadge status={pinjaman.status} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Jenis Pinjaman</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {pinjaman.loan_types?.name || 'Reguler'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Total Pinjaman</p>
                    <p className="text-base font-bold text-gray-900">
                      Rp {principalAmount.toLocaleString('id-ID')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tenor</p>
                    <p className="text-base font-bold text-gray-900">
                      {pinjaman.tenor} Bulan
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Sisa Cicilan</p>
                    <p className="text-base font-bold text-gray-900">
                      Rp {sisaPinjaman.toLocaleString('id-ID')}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {sisaCicilan} Bulan tersisa
                    </p>
                  </div>
                </div>
              </div>

              {/* Jadwal Angsuran Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                  <h3 className="text-base font-semibold text-gray-900">Jadwal Angsuran</h3>
                  <span className="text-xs text-gray-500">
                    {lunasCount} dari {schedule.length} periode lunas
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-4 py-3 font-medium text-center">Bulan Ke</th>
                        <th className="px-4 py-3 font-medium">Periode</th>
                        <th className="px-4 py-3 font-medium">Tagihan</th>
                        <th className="px-4 py-3 font-medium">Total Dibayar</th>
                        <th className="px-4 py-3 font-medium">Sisa Tagihan</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {schedule.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 text-gray-900 font-medium text-center">
                            {item.period_number}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {item.due_date}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            Rp {Number(item.target_amount).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-green-600 font-medium">
                            Rp {Number(item.paid_amount).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3 text-red-500 font-medium">
                            Rp {Math.max(0, Math.round(Number(item.target_amount) - Number(item.paid_amount))).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3">
                            {item.status === 'paid' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Lunas
                              </span>
                            ) : item.status === 'partial' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Parsial
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                Belum Lunas
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.status !== 'paid' && (
                              <button
                                onClick={() => setActivePayment({ 
                                  schedule_id: item.id, 
                                  remaining: Math.max(0, Math.round(Number(item.target_amount) - Number(item.paid_amount))) 
                                })}
                                className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                              >
                                Bayar Parsial
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {schedule.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                            Jadwal angsuran tidak tersedia.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <PartialPaymentModal 
        isOpen={activePayment !== null}
        onClose={() => setActivePayment(null)}
        onSubmit={handleProcessPayment}
        defaultAmount={activePayment ? activePayment.remaining : 0}
        scheduleId={activePayment?.schedule_id}
        title="Pembayaran Cicilan Pinjaman"
        description={activePayment ? `Pembayaran cicilan untuk tagihan Rp ${activePayment.remaining.toLocaleString('id-ID')}` : ''}
      />
    </div>
  );
}

