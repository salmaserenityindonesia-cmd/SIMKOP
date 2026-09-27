import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { loanService } from '../../services/loanService';
import { supabase } from '../../lib/supabaseClient';
import { Loader2, Plus, Calculator, AlertCircle, CheckCircle } from 'lucide-react';

export default function PengajuanPinjaman() {
  const [anggotaList, setAnggotaList] = useState<any[]>([]);
  const [selectedAnggota, setSelectedAnggota] = useState<string>('');
  
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [tenor, setTenor] = useState<number | ''>('');
  
  const [thpData, setThpData] = useState<{ master_thp: number, active_installments: number, remaining_thp: number } | null>(null);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAnggota();
  }, []);

  useEffect(() => {
    if (selectedAnggota) {
      checkTHP(selectedAnggota);
    } else {
      setThpData(null);
    }
  }, [selectedAnggota]);

  async function loadAnggota() {
    const { data } = await supabase.from('anggota').select('*').order('nama');
    if (data) setAnggotaList(data);
  }

  async function checkTHP(memberId: string) {
    try {
      const data = await loanService.getMemberTHP(memberId);
      setThpData(data);
    } catch (err: any) {
      console.error(err);
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  };

  const calculateCicilan = () => {
    if (!amount || !tenor) return 0;
    return amount / Number(tenor);
  };

  const isTHPEligible = () => {
    if (!thpData) return false;
    const cicilan = calculateCicilan();
    return (thpData.remaining_thp - cicilan) >= 1500000;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnggota || !purpose || !amount || !tenor) return;

    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await loanService.applyLoan(selectedAnggota, purpose, Number(amount), Number(tenor));
      setSuccess('Pengajuan pinjaman berhasil dibuat dan menunggu persetujuan.');
      
      // Reset form
      setPurpose('');
      setAmount('');
      setTenor('');
      if (selectedAnggota) checkTHP(selectedAnggota);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pengajuan Pinjaman Baru</h1>
        <p className="text-gray-500">Ajukan pinjaman dengan validasi sisa THP otomatis.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-medium">Pengajuan Gagal</h3>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}
            
            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg flex items-start gap-3">
                <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-medium">Berhasil</h3>
                  <p className="text-sm">{success}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Anggota Pemohon</label>
                <select 
                  required
                  value={selectedAnggota}
                  onChange={e => setSelectedAnggota(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Pilih Anggota --</option>
                  {anggotaList.map(a => (
                    <option key={a.id} value={a.id}>{a.nrp} - {a.nama}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keperluan Pinjaman (Tujuan Pembelian)</label>
                <input 
                  type="text"
                  required
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                  placeholder="Contoh: Pembelian Sepeda Motor"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plafon Pinjaman (Rp)</label>
                  <input 
                    type="number"
                    min="1"
                    required
                    value={amount}
                    onChange={e => setAmount(Number(e.target.value) || '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tenor (Bulan)</label>
                  <select 
                    required
                    value={tenor}
                    onChange={e => setTenor(Number(e.target.value) || '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Pilih Tenor --</option>
                    <option value="6">6 Bulan</option>
                    <option value="10">10 Bulan</option>
                    <option value="12">12 Bulan</option>
                    <option value="24">24 Bulan</option>
                    <option value="36">36 Bulan</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !selectedAnggota}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 transition-colors"
                >
                  {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                  Ajukan Pinjaman
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Calculator className="w-5 h-5 text-blue-600" />
              Simulasi & Kelayakan
            </h3>

            {!thpData ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Pilih anggota terlebih dahulu untuk melihat kelayakan THP.
              </p>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex justify-between pb-2 border-b border-gray-200">
                  <span className="text-gray-600">Gaji Pokok (Master THP)</span>
                  <span className="font-semibold">{formatCurrency(thpData.master_thp)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-gray-200 text-red-600">
                  <span>Cicilan Berjalan</span>
                  <span>- {formatCurrency(thpData.active_installments)}</span>
                </div>
                <div className="flex justify-between pb-2 border-b border-gray-200">
                  <span className="font-medium text-gray-700">Sisa THP Saat Ini</span>
                  <span className="font-bold text-gray-900">{formatCurrency(thpData.remaining_thp)}</span>
                </div>

                <div className="pt-4">
                  <div className="flex justify-between pb-2 border-b border-gray-200 text-orange-600 font-medium">
                    <span>Estimasi Cicilan Baru</span>
                    <span>- {formatCurrency(calculateCicilan())}</span>
                  </div>
                </div>

                <div className="flex justify-between py-2 text-base">
                  <span className="font-bold text-gray-900">Sisa THP Akhir</span>
                  <span className={`font-bold ${isTHPEligible() ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(thpData.remaining_thp - calculateCicilan())}
                  </span>
                </div>

                <div className={`p-3 rounded-lg flex items-start gap-2 mt-4 ${isTHPEligible() ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {isTHPEligible() ? (
                    <>
                      <CheckCircle className="w-5 h-5 shrink-0" />
                      <p className="text-xs font-medium">Memenuhi Syarat! Sisa THP berada di atas ambang batas minimal Rp1.500.000.</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <p className="text-xs font-medium">Tidak Memenuhi Syarat. Sisa THP setelah pemotongan kurang dari Rp1.500.000.</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
