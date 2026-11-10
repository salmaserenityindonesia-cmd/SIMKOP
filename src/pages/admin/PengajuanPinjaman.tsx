import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { loanService, MIN_REMAINING_THP, calculateTHPEligibility, getActiveLoanTypes } from '../../services/loanService';
import { LoanType } from '../../services/koperasiService';
import { extractMemberTHP } from '../../services/memberService';
import { supabase } from '../../lib/supabaseClient';
import { Loader2, Plus, Calculator, AlertCircle, CheckCircle } from 'lucide-react';

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
};

export const calculateAvailableTenors = (maxTenor?: number): number[] => {
  const baseTenors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 30, 36];
  if (typeof maxTenor !== 'number') return [];
  return baseTenors.filter(t => t <= maxTenor);
};

export interface SimulationPanelProps {
  thpData: { master_thp: number; active_installments: number; savings_deduction?: number; remaining_thp: number } | null;
  newInstallment: number;
  amount?: number | '';
  tenor?: number | '';
  onSelectTenor?: (tenor: number) => void;
  maxTenor?: number;
}

export function SimulationPanel({
  thpData,
  newInstallment,
  amount,
  tenor,
  onSelectTenor,
  maxTenor
}: SimulationPanelProps) {
  const eligibility = thpData 
    ? calculateTHPEligibility(thpData.remaining_thp, newInstallment, MIN_REMAINING_THP)
    : { finalRemainingThp: 0, isEligible: false, shortfall: MIN_REMAINING_THP };

  // Helper mencari tenor yang memenuhi syarat kelayakan (THP >= Rp 1.500.000)
  const baseAvailableTenors = [6, 10, 12, 18, 24, 30, 36];
  const availableTenors = typeof maxTenor === 'number'
    ? baseAvailableTenors.filter(t => t <= maxTenor)
    : baseAvailableTenors;
  let recommendedTenor: number | null = null;

  const principal = typeof amount === 'number' && amount > 0
    ? amount
    : (newInstallment > 0 && typeof tenor === 'number' && tenor > 0 ? newInstallment * tenor : 0);

  if (!eligibility.isEligible && thpData && principal > 0) {
    const currentTenorNum = typeof tenor === 'number' ? tenor : 0;
    const viable = availableTenors.filter(t => {
      const monthly = principal / t;
      return (thpData.remaining_thp - monthly) >= MIN_REMAINING_THP;
    });

    const higherViable = viable.find(t => t > currentTenorNum);
    recommendedTenor = higherViable || (viable.length > 0 ? viable[0] : null);
  }

  return (
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
            <span className="text-gray-600">Iuran Simpanan Rutin</span>
            <span className="font-medium text-rose-600">- {formatCurrency(thpData.savings_deduction || 0)}</span>
          </div>
          <div className="flex justify-between pb-2 border-b border-gray-200">
            <span className="font-medium text-gray-700">Sisa THP Saat Ini</span>
            <span className="font-bold text-gray-900">{formatCurrency(thpData.remaining_thp)}</span>
          </div>

          <div className="pt-4">
            <div className="flex justify-between pb-2 border-b border-gray-200 text-orange-600 font-medium">
              <span>Estimasi Cicilan Baru</span>
              <span>- {formatCurrency(newInstallment)}</span>
            </div>
          </div>

          <div className="flex justify-between py-2 text-base">
            <span className="font-bold text-gray-900">Sisa THP Akhir</span>
            <span className={`font-bold font-mono ${eligibility.isEligible ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(eligibility.finalRemainingThp)}
            </span>
          </div>

          {eligibility.isEligible ? (
            <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-emerald-800 text-xs sm:text-sm">
              <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-900">Memenuhi Syarat</p>
                <p className="text-emerald-700 text-xs">
                  Sisa THP setelah pemotongan ({formatCurrency(eligibility.finalRemainingThp)}) berada di atas batas minimum {formatCurrency(MIN_REMAINING_THP)}.
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-xs sm:text-sm">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold text-rose-800">
                  Tidak Memenuhi Syarat Batas Minimum THP
                </p>
                <p className="text-rose-600 leading-relaxed">
                  Sisa THP setelah pemotongan diperkirakan hanya{' '}
                  <strong className="font-bold text-rose-700 font-mono">
                    {formatCurrency(eligibility.finalRemainingThp)}
                  </strong>
                  {' '}(kurang{' '}
                  <strong className="font-bold text-rose-700 font-mono">
                    {formatCurrency(eligibility.shortfall)}
                  </strong>
                  {' '}dari batas minimum {formatCurrency(MIN_REMAINING_THP)}).
                </p>
                {recommendedTenor && (
                  <div className="mt-2.5 pt-2 border-t border-rose-200/80 text-rose-800">
                    <div className="font-medium text-xs sm:text-sm text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/70">
                      💡 <strong>Rekomendasi:</strong> Pilih tenor {recommendedTenor} bulan atau lebih agar cicilan per bulan menjadi lebih ringan dan memenuhi syarat sisa THP minimal {formatCurrency(MIN_REMAINING_THP)}.
                      {onSelectTenor && (
                        <button
                          type="button"
                          onClick={() => onSelectTenor(recommendedTenor!)}
                          className="mt-1.5 block text-xs font-semibold text-blue-700 hover:text-blue-800 underline cursor-pointer"
                        >
                          Terapkan Tenor {recommendedTenor} Bulan
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {thpData.master_thp === 0 && (
                  <p className="text-[11px] text-rose-500 italic mt-1.5 pt-1 border-t border-rose-200/60">
                    * Catatan: Data Master THP anggota ini masih Rp 0 di sistem. Silakan update THP anggota terlebih dahulu melalui menu Import Gaji atau Manajemen Anggota.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface PengajuanPinjamanProps {
  initialAnggotaList?: any[];
  initialSelectedAnggota?: string;
  initialThpData?: { master_thp: number; active_installments: number; savings_deduction?: number; remaining_thp: number } | null;
  initialAmount?: number | '';
  initialTenor?: number | '';
  initialPurpose?: string;
  initialLoanTypes?: LoanType[];
  initialSelectedLoanTypeId?: string;
}

export default function PengajuanPinjaman({
  initialAnggotaList,
  initialSelectedAnggota,
  initialThpData,
  initialAmount,
  initialTenor,
  initialPurpose,
  initialLoanTypes,
  initialSelectedLoanTypeId
}: PengajuanPinjamanProps = {}) {
  const [loanTypes, setLoanTypes] = useState<LoanType[]>(initialLoanTypes || []);
  const [selectedLoanTypeId, setSelectedLoanTypeId] = useState<string>(initialSelectedLoanTypeId || '');
  const [anggotaList, setAnggotaList] = useState<any[]>(initialAnggotaList || []);
  const [selectedAnggota, setSelectedAnggota] = useState<string>(initialSelectedAnggota || '');
  
  const [purpose, setPurpose] = useState(initialPurpose || '');
  const [amount, setAmount] = useState<number | ''>(initialAmount ?? '');
  const [tenor, setTenor] = useState<number | ''>(initialTenor ?? '');

  const selectedLoanType = loanTypes.find(lt => String(lt.id) === String(selectedLoanTypeId));
  const maxTenor = selectedLoanType ? selectedLoanType.max_duration_months : 12;
  const availableTenors = calculateAvailableTenors(selectedLoanType?.max_duration_months);

  const handleLoanTypeChange = (newTypeId: string) => {
    setSelectedLoanTypeId(newTypeId);
    if (!newTypeId) {
      setTenor('');
      return;
    }
    const newType = loanTypes.find(lt => String(lt.id) === String(newTypeId));
    if (newType && typeof tenor === 'number' && tenor > newType.max_duration_months) {
      setTenor('');
    }
  };
  
  const [masterThp, setMasterThp] = useState<number>(() => {
    if (initialThpData) return initialThpData.master_thp;
    if (initialSelectedAnggota && initialAnggotaList) {
      const sel = initialAnggotaList.find(a => String(a.id) === String(initialSelectedAnggota));
      if (sel) return extractMemberTHP(sel);
    }
    return 0;
  });

  const [thpData, setThpData] = useState<{ master_thp: number, active_installments: number, savings_deduction?: number, remaining_thp: number } | null>(() => {
    if (initialThpData) return initialThpData;
    if (initialSelectedAnggota && initialAnggotaList) {
      const sel = initialAnggotaList.find(a => String(a.id) === String(initialSelectedAnggota));
      if (sel) {
        const num = extractMemberTHP(sel);
        const defaultSavings = 200000;
        return {
          master_thp: num,
          active_installments: 0,
          savings_deduction: defaultSavings,
          remaining_thp: num - defaultSavings
        };
      }
    }
    return null;
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAnggota();
    if (initialLoanTypes === undefined) {
      loadLoanTypes();
    }
  }, []);

  async function loadLoanTypes() {
    try {
      const types = await getActiveLoanTypes();
      if (types) setLoanTypes(types);
    } catch (err) {
      console.error('Gagal memuat jenis pinjaman:', err);
    }
  }

  useEffect(() => {
    if (selectedAnggota) {
      checkTHP(selectedAnggota);
    } else {
      setMasterThp(0);
      setThpData(null);
    }
  }, [selectedAnggota]);

  async function loadAnggota() {
    let { data, error } = await supabase
      .from('anggota')
      .select('id, nrp, nama, pangkat, take_home_pay, master_thp, salary, bank_account_number')
      .eq('status', 'aktif')
      .order('nama');

    if (error) {
      const fallback = await supabase
        .from('anggota')
        .select('*')
        .eq('status', 'aktif')
        .order('nama');
      data = fallback.data;
    }

    if (data) setAnggotaList(data);
  }

  const handleSelectMember = (memberId: string) => {
    setSelectedAnggota(memberId);
    if (!memberId) {
      setMasterThp(0);
      setThpData(null);
      return;
    }

    const selectedMember = anggotaList.find(a => String(a.id) === String(memberId));
    if (selectedMember) {
      const numericThp = extractMemberTHP(selectedMember);
      setMasterThp(numericThp);

      // Langsung render di panel Simulasi & Kelayakan
      const defaultSavings = 200000;
      setThpData({
        master_thp: numericThp,
        active_installments: 0,
        savings_deduction: defaultSavings,
        remaining_thp: numericThp - defaultSavings
      });
    }
  };

  async function checkTHP(memberId: string) {
    try {
      const data = await loanService.getMemberTHP(memberId);
      const selectedMember = anggotaList.find(a => String(a.id) === String(memberId));
      let numericThp = data.master_thp;

      if (!numericThp && selectedMember) {
        numericThp = extractMemberTHP(selectedMember);
      }

      setMasterThp(numericThp);
      const savingsDeduction = data.savings_deduction || 200000;
      setThpData({
        master_thp: numericThp,
        active_installments: data.active_installments,
        savings_deduction: savingsDeduction,
        remaining_thp: numericThp - data.active_installments - savingsDeduction
      });
    } catch (err: any) {
      console.error(err);
    }
  }

  const calculateCicilan = () => {
    if (!amount || !tenor) return 0;
    return Number(amount) / Number(tenor);
  };

  const eligibility = thpData 
    ? calculateTHPEligibility(thpData.remaining_thp, calculateCicilan(), MIN_REMAINING_THP)
    : { finalRemainingThp: 0, isEligible: false, shortfall: MIN_REMAINING_THP };

  const isTHPEligible = () => eligibility.isEligible;

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
                  onChange={e => handleSelectMember(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Pilih Anggota --</option>
                  {anggotaList.map(a => (
                    <option key={a.id} value={a.id}>{a.nrp} - {a.nama}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jenis Pinjaman <span className="text-red-500">*</span>
                </label>
                <select 
                  required
                  value={selectedLoanTypeId}
                  onChange={e => handleLoanTypeChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- Pilih Jenis Pinjaman --</option>
                  {loanTypes.map(lt => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} (Maks. {lt.max_duration_months} Bulan)
                    </option>
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
                    disabled={!selectedLoanTypeId}
                    onChange={e => setTenor(Number(e.target.value) || '')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <option value="">
                      {!selectedLoanTypeId ? '-- Pilih Jenis Pinjaman Terlebih Dahulu --' : '-- Pilih Tenor --'}
                    </option>
                    {availableTenors.map(t => (
                      <option key={t} value={t}>{t} Bulan</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !selectedAnggota || (thpData !== null && !isTHPEligible())}
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
          <SimulationPanel
            thpData={thpData}
            newInstallment={calculateCicilan()}
            amount={amount}
            tenor={tenor}
            onSelectTenor={(t) => setTenor(t)}
            maxTenor={selectedLoanType ? selectedLoanType.max_duration_months : undefined}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
