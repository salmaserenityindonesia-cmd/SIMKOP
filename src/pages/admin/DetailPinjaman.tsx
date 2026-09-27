import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import { loanService } from '../../services/loanService';
import { ArrowLeft, Loader2, DollarSign } from 'lucide-react';
import StatusBadge from '../../components/ui/StatusBadge';

// Helper modal for partial payments
function PaymentModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  defaultAmount, 
  title, 
  description 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSubmit: (amount: number) => Promise<void>, 
  defaultAmount: number,
  title: string,
  description: string
}) {
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
      alert("Jumlah tidak valid");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(val);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Gagal menyimpan pembayaran');
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
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

export default function DetailPinjaman() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [pinjaman, setPinjaman] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activePayment, setActivePayment] = useState<any | null>(null);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (loanId: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const pinjamanData = await loanService.getLoanById(loanId);
      setPinjaman(pinjamanData);
      
      const schedulesData = await loanService.getLoanSchedules(loanId);
      setSchedules(schedulesData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessPayment = async (amount: number) => {
    if (!id) return;
    
    await loanService.makePayment(id, amount, 'cash', 'Pembayaran cicilan pinjaman (Admin)');

    // Reload
    await loadData(id);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !pinjaman) {
    return (
      <AdminLayout>
        <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg">
          {error || 'Data pinjaman tidak ditemukan'}
        </div>
      </AdminLayout>
    );
  }

  const schedule = schedules;
  let lunasCount = schedules.filter(s => s.status === 'paid').length;
  const sisaCicilan = (pinjaman.tenor || 0) - lunasCount;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="Kembali"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Detail Pinjaman</h1>
            <p className="text-gray-500">
              {pinjaman.anggota?.nama} ({pinjaman.anggota?.no_anggota || pinjaman.anggota?.nrp})
            </p>
          </div>
        </div>

        {/* Ringkasan Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Status Pinjaman</p>
              <StatusBadge status={pinjaman.status} />
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Jenis Pinjaman</p>
              <p className="text-base font-medium text-gray-900">
                {pinjaman.loan_types?.name || 'Reguler'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Total Pinjaman</p>
              <p className="text-xl font-bold text-gray-900">
                Rp {Number(pinjaman.amount).toLocaleString('id-ID')}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Tenor</p>
              <p className="text-xl font-bold text-gray-900">
                {pinjaman.tenor} Bulan
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Sisa Cicilan</p>
              <p className="text-xl font-bold text-gray-900">
                {sisaCicilan} Bulan
              </p>
            </div>
          </div>
        </div>

        {/* Jadwal Angsuran Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">Jadwal Angsuran</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50 text-gray-600 text-sm">
                <tr>
                  <th className="px-6 py-4 font-medium">Bulan Ke</th>
                  <th className="px-6 py-4 font-medium">Periode</th>
                  <th className="px-6 py-4 font-medium">Tagihan</th>
                  <th className="px-6 py-4 font-medium">Total Dibayar</th>
                  <th className="px-6 py-4 font-medium">Sisa Tagihan</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {schedule.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-900 font-medium text-center">
                      {item.period_number}
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {item.due_date}
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      Rp {Number(item.target_amount).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-green-600 font-medium">
                      Rp {Number(item.paid_amount).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-red-500 font-medium">
                      Rp {Math.max(0, Number(item.target_amount) - Number(item.paid_amount)).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4">
                      {item.status === 'paid' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Lunas
                        </span>
                      ) : item.status === 'partial' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          Parsial
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Belum Lunas
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {item.status !== 'paid' && (
                        <button
                          onClick={() => setActivePayment({ schedule_id: item.id, remaining: Number(item.target_amount) - Number(item.paid_amount) })}
                          className="inline-flex items-center px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          Bayar Parsial
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {schedule.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      Jadwal angsuran tidak tersedia.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PaymentModal 
        isOpen={activePayment !== null}
        onClose={() => setActivePayment(null)}
        onSubmit={handleProcessPayment}
        defaultAmount={activePayment ? activePayment.remaining : 0}
        title="Pembayaran Cicilan Pinjaman"
        description={activePayment ? `Pembayaran cicilan untuk tagihan Rp ${activePayment.remaining.toLocaleString('id-ID')}` : ''}
      />
    </AdminLayout>
  );
}
