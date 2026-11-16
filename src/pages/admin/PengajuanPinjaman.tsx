import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { loanService, MIN_REMAINING_THP, calculateTHPEligibility, getActiveLoanTypes, getLoanSettings } from '../../services/loanService';
import { LoanType } from '../../services/koperasiService';
import { extractMemberTHP } from '../../services/memberService';
import {
  getMemberLebaranRates,
  loadSavingsRateConfig,
  resolveMemberSavingsRate
} from '../../services/savingsRateService';
import { supabase } from '../../lib/supabaseClient';
import { Loader2, Plus, Calculator, AlertCircle, CheckCircle } from 'lucide-react';

export const formatCurrency = (val: number) => {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
};

export const calculateAvailableTenors = (maxTenor?: number): number[] => {
  if (typeof maxTenor !== 'number' || maxTenor <= 0) return [];
  if (maxTenor < 6) return [maxTenor];
  const tenors: number[] = [];
  for (let t = 6; t <= maxTenor; t += 6) {
    tenors.push(t);
  }
  return tenors.length > 0 ? tenors : [6];
};

export interface ActiveLoanBreakdownItem {
  id: string;
  loanNumber: string;
  typeName: string;
  tenor: number;
  monthlyInstallment: number;
  remainingPrincipal: number;
}

export interface SimulationPanelProps {
  thpData: {
    master_thp: number;
    active_installments: number;
    angsuran_lain_lain?: number;
    savings_deduction?: number;
    remaining_thp: number;
  } | null;
  activeLoanBreakdown?: ActiveLoanBreakdownItem[];
  newInstallment: number;
  amount?: number | '';
  tenor?: number | '';
  onSelectTenor?: (tenor: number) => void;
  maxTenor?: number;
  minRemainingThp?: number;
}

export function SimulationPanel({
  thpData,
  activeLoanBreakdown = [],
  newInstallment,
  amount,
  tenor,
  onSelectTenor,
  maxTenor,
  minRemainingThp = MIN_REMAINING_THP
}: SimulationPanelProps) {
  const externalInstallments = Number(thpData?.angsuran_lain_lain ?? 0);
  const currentRemainingThp = thpData
    ? (thpData.angsuran_lain_lain !== undefined
        ? thpData.master_thp - thpData.active_installments - externalInstallments - (thpData.savings_deduction || 0)
        : thpData.remaining_thp)
    : 0;

  const eligibility = thpData 
    ? calculateTHPEligibility(currentRemainingThp, newInstallment, minRemainingThp)
    : { finalRemainingThp: 0, isEligible: false, shortfall: minRemainingThp };

  // Helper mencari tenor yang memenuhi syarat kelayakan (THP >= minRemainingThp)
  // Bersumber dinamis dari master produk pinjaman (default hingga 36 bulan jika standalone)
  const effectiveMaxTenor = typeof maxTenor === 'number' ? maxTenor : 36;
  const availableTenors = calculateAvailableTenors(effectiveMaxTenor);
  let recommendedTenor: number | null = null;

  const principal = typeof amount === 'number' && amount > 0
    ? amount
    : (newInstallment > 0 && typeof tenor === 'number' && tenor > 0 ? newInstallment * tenor : 0);

  if (!eligibility.isEligible && thpData && principal > 0) {
    const currentTenorNum = typeof tenor === 'number' ? tenor : 0;
    const viable = availableTenors.filter(t => {
      const monthly = principal / t;
      return (currentRemainingThp - monthly) >= minRemainingThp;
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
          <div className="py-2.5 border-b border-gray-200 space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-rose-600 font-medium">Cicilan Berjalan</span>
              <span className="text-rose-600 font-semibold tabular-nums">
                - {formatCurrency(thpData.active_installments)}
              </span>
            </div>

            {activeLoanBreakdown.length > 0 && (
              <div className="pl-2.5 border-l-2 border-rose-200 space-y-1 pt-0.5">
                {activeLoanBreakdown.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between text-[11px] text-slate-600 gap-2"
                  >
                    <div className="truncate">
                      <span className="font-semibold text-slate-700">{item.typeName}</span>
                      <span className="text-slate-400 ml-1">
                        ({item.loanNumber} • {item.tenor} Bln)
                      </span>
                    </div>
                    <span className="font-medium text-rose-600 shrink-0 tabular-nums">
                      Rp {item.monthlyInstallment.toLocaleString('id-ID')}/bln
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-sm py-2 border-b border-slate-100">
            <span className="text-rose-600 font-medium">Angsuran Lain-lain</span>
            <span className="font-semibold text-rose-600 tabular-nums">
              - Rp {externalInstallments.toLocaleString('id-ID')}
            </span>
          </div>
          <div className="flex justify-between pb-2 border-b border-gray-200">
            <span className="text-gray-600">Iuran Simpanan Rutin</span>
            <span className="font-medium text-rose-600">- {formatCurrency(thpData.savings_deduction || 0)}</span>
          </div>
          <div className="flex justify-between pb-2 border-b border-gray-200">
            <span className="font-medium text-gray-700">Sisa THP Saat Ini</span>
            <span className="font-bold text-gray-900">{formatCurrency(currentRemainingThp)}</span>
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
                  Sisa THP setelah pemotongan ({formatCurrency(eligibility.finalRemainingThp)}) berada di atas batas minimum {formatCurrency(minRemainingThp)}.
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
                  {' '}dari batas minimum {formatCurrency(minRemainingThp)}).
                </p>
                {recommendedTenor && (
                  <div className="mt-2.5 pt-2 border-t border-rose-200/80 text-rose-800">
                    <div className="font-medium text-xs sm:text-sm text-amber-900 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200/70">
                      💡 <strong>Rekomendasi:</strong> Pilih tenor {recommendedTenor} bulan atau lebih agar cicilan per bulan menjadi lebih ringan dan memenuhi syarat sisa THP minimal {formatCurrency(minRemainingThp)}.
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

export async function submitLoanApplication(
  selectedAnggota: string,
  purpose: string,
  amount: number | '',
  tenor: number | '',
  selectedLoanTypeId: string,
  maxTenor: number,
  minThreshold?: number
) {
  if (!selectedAnggota || !purpose || !amount || !tenor || !selectedLoanTypeId) {
    throw new Error('Silakan lengkapi seluruh kolom formulir termasuk jenis pinjaman.');
  }

  if (Number(tenor) < 1) {
    throw new Error('Masukkan minimal 1 bulan tenor pinjaman.');
  }

  if (Number(tenor) > maxTenor) {
    throw new Error(`Tenor yang dipilih (${tenor} bulan) melebihi batas maksimal ${maxTenor} bulan untuk jenis pinjaman ini.`);
  }

  return minThreshold !== undefined
    ? await loanService.applyLoan(selectedAnggota, purpose, Number(amount), Number(tenor), selectedLoanTypeId, minThreshold)
    : await loanService.applyLoan(selectedAnggota, purpose, Number(amount), Number(tenor), selectedLoanTypeId);
}

export interface PengajuanPinjamanProps {
  initialAnggotaList?: any[];
  initialSelectedAnggota?: string;
  initialThpData?: {
    master_thp: number;
    active_installments: number;
    angsuran_lain_lain?: number;
    savings_deduction?: number;
    remaining_thp: number;
  } | null;
  initialAmount?: number | '';
  initialTenor?: number | '';
  initialTenorMode?: 'PRESET' | 'CUSTOM';
  initialCustomTenorInput?: string;
  initialPurpose?: string;
  initialLoanTypes?: LoanType[];
  initialSelectedLoanTypeId?: string;
  initialMinRemainingThp?: number;
}

export default function PengajuanPinjaman({
  initialAnggotaList,
  initialSelectedAnggota,
  initialThpData,
  initialAmount,
  initialTenor,
  initialTenorMode,
  initialCustomTenorInput,
  initialPurpose,
  initialLoanTypes,
  initialSelectedLoanTypeId,
  initialMinRemainingThp
}: PengajuanPinjamanProps = {}) {
  const [loanTypes, setLoanTypes] = useState<LoanType[]>(initialLoanTypes || []);
  const [selectedLoanTypeId, setSelectedLoanTypeId] = useState<string>(initialSelectedLoanTypeId || '');
  const [anggotaList, setAnggotaList] = useState<any[]>(initialAnggotaList || []);
  const [selectedAnggota, setSelectedAnggota] = useState<string>(initialSelectedAnggota || '');
  
  const [purpose, setPurpose] = useState(initialPurpose || '');
  const [amount, setAmount] = useState<number | ''>(initialAmount ?? '');
  const [tenor, setTenor] = useState<number | ''>(initialTenor ?? '');
  const [tenorMode, setTenorMode] = useState<'PRESET' | 'CUSTOM'>(initialTenorMode || 'PRESET');
  const [customTenorInput, setCustomTenorInput] = useState<string>(initialCustomTenorInput || '');
  const [minRemainingThp, setMinRemainingThp] = useState<number>(initialMinRemainingThp ?? MIN_REMAINING_THP);

  const selectedLoanType = loanTypes.find(lt => String(lt.id) === String(selectedLoanTypeId));
  const maxTenor = Number(selectedLoanType?.max_duration_months || 12);
  const availableTenors = calculateAvailableTenors(selectedLoanType?.max_duration_months);

  const effectiveTenor =
    tenorMode === 'CUSTOM'
      ? Math.floor(Number(customTenorInput) || 0)
      : Number(tenor || 0);

  const isTenorValid =
    Boolean(selectedLoanTypeId) &&
    effectiveTenor >= 1 &&
    effectiveTenor <= maxTenor;

  const handleLoanTypeChange = (newTypeId: string) => {
    setSelectedLoanTypeId(newTypeId);
    if (!newTypeId) {
      setTenor('');
      return;
    }
    const newType = loanTypes.find(lt => String(lt.id) === String(newTypeId));
    const newMaxTenor = Number(newType?.max_duration_months || 12);
    const newAvailableTenors = calculateAvailableTenors(newType?.max_duration_months);
    if (tenorMode === 'PRESET' && typeof tenor === 'number' && (tenor > newMaxTenor || !newAvailableTenors.includes(tenor))) {
      setTenor('');
    }
    // In CUSTOM mode, if Number(customTenorInput) > newMaxTenor, keep customTenorInput so the max-limit warning shows and submit stays locked.
  };
  
  const [masterThp, setMasterThp] = useState<number>(() => {
    if (initialThpData) return initialThpData.master_thp;
    if (initialSelectedAnggota && initialAnggotaList) {
      const sel = initialAnggotaList.find(a => String(a.id) === String(initialSelectedAnggota));
      if (sel) return extractMemberTHP(sel);
    }
    return 0;
  });

  const [thpData, setThpData] = useState<{
    master_thp: number;
    active_installments: number;
    angsuran_lain_lain?: number;
    savings_deduction?: number;
    remaining_thp: number;
  } | null>(() => {
    if (initialThpData) return initialThpData;
    if (initialSelectedAnggota && initialAnggotaList) {
      const sel = initialAnggotaList.find(a => String(a.id) === String(initialSelectedAnggota));
      if (sel) {
        const num = extractMemberTHP(sel);
        const externalInstallments = Number(sel.angsuran_lain_lain ?? 0);
        const defaultSavings = 200000;
        return {
          master_thp: num,
          active_installments: 0,
          angsuran_lain_lain: externalInstallments,
          savings_deduction: defaultSavings,
          remaining_thp: num - externalInstallments - defaultSavings
        };
      }
    }
    return null;
  });
  
  const [activeLoanBreakdown, setActiveLoanBreakdown] = useState<ActiveLoanBreakdownItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAnggota();
    if (initialLoanTypes === undefined) {
      loadLoanTypes();
    }
    if (initialMinRemainingThp === undefined) {
      loadLoanSettings();
    }
  }, []);

  async function loadLoanSettings() {
    try {
      const settings = await getLoanSettings();
      if (settings && typeof settings.minRemainingThp === 'number') {
        setMinRemainingThp(settings.minRemainingThp);
      }
    } catch (err) {
      console.error('Gagal memuat pengaturan pinjaman:', err);
    }
  }

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
      setActiveLoanBreakdown([]);
    }
  }, [selectedAnggota]);

  async function loadAnggota() {
    let { data, error } = await supabase
      .from('anggota')
      .select('id, nrp, nama, pangkat, take_home_pay, master_thp, salary, angsuran_lain_lain, bank_account_number, status, membership_status')
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

    if (data) {
      const activeOnly = data.filter(
        (m: any) =>
          (!m.status || String(m.status).toLowerCase() === 'aktif') &&
          (!m.membership_status || String(m.membership_status).toUpperCase() === 'ACTIVE')
      );
      setAnggotaList(activeOnly);
    }
  }

  const handleSelectMember = (memberId: string) => {
    setSelectedAnggota(memberId);
    setActiveLoanBreakdown([]);
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
      const externalInstallments = Number(selectedMember.angsuran_lain_lain ?? 0);
      const defaultSavings = 200000;
      setThpData({
        master_thp: numericThp,
        active_installments: 0,
        angsuran_lain_lain: externalInstallments,
        savings_deduction: defaultSavings,
        remaining_thp: numericThp - externalInstallments - defaultSavings
      });
    }
  };

  async function checkTHP(memberId: string) {
    try {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      // Refresh ketentuan Simpanan Lebaran personal sebelum menghitung potongan rutin THP
      // Sekaligus ambil rincian pinjaman aktif beserta nama jenis pinjamannya
      const [rateConfig, personalLebaranRates, activeLoansRes] = await Promise.all([
        loadSavingsRateConfig().catch(() => null),
        getMemberLebaranRates(undefined, true).catch(() => []),
        supabase
          .from('loans')
          .select(`
            id,
            loan_number,
            principal_amount,
            amount,
            agreed_tenor_months,
            tenor,
            planned_installment_amount,
            monthly_target,
            sisa_pinjaman,
            status,
            loan_types:loan_type_id (
              id,
              code,
              name
            )
          `)
          .eq('member_id', memberId)
          .in('status', ['active', 'approved'])
          .order('created_at', { ascending: true }),
      ]);

      if (activeLoansRes.error) {
        console.error('Gagal memuat rincian pinjaman aktif:', activeLoansRes.error);
      }

      const activeRows = (activeLoansRes.data || []).filter((loan: any) => {
        if (loan.sisa_pinjaman === null || loan.sisa_pinjaman === undefined) {
          return true;
        }
        return Number(loan.sisa_pinjaman) > 0;
      });

      const breakdown: ActiveLoanBreakdownItem[] = activeRows.map((loan: any) => {
        const principal = Number(loan.principal_amount ?? loan.amount ?? 0);
        const months = Number(loan.agreed_tenor_months ?? loan.tenor ?? 1);
        const monthlyInstallment = Math.round(
          Number(loan.planned_installment_amount ?? loan.monthly_target ?? (months > 0 ? principal / months : 0))
        );
        const typeName = loan.loan_types?.name || 'Pinjaman Koperasi';

        return {
          id: String(loan.id),
          loanNumber: loan.loan_number || '-',
          typeName,
          tenor: months,
          monthlyInstallment,
          remainingPrincipal: Number(loan.sisa_pinjaman ?? 0),
        };
      });

      setActiveLoanBreakdown(breakdown);
      const totalExistingInstallment = breakdown.reduce(
        (sum, item) => sum + item.monthlyInstallment,
        0
      );

      const data = await loanService.getMemberTHP(memberId);
      const selectedMember = anggotaList.find(a => String(a.id) === String(memberId));
      let numericThp = data.master_thp;

      if (!numericThp && selectedMember) {
        numericThp = extractMemberTHP(selectedMember);
      }

      setMasterThp(numericThp);
      const currentInstallments = Number(data.active_installments || 0) || totalExistingInstallment;
      const externalInstallments = Number(
        (data as any)?.angsuran_lain_lain ?? selectedMember?.angsuran_lain_lain ?? 0
      );
      const memberLebaranRate = resolveMemberSavingsRate(
        selectedMember?.id || memberId,
        'LEBARAN',
        currentYear,
        currentMonth,
        {
          globalTiers: rateConfig?.tiers,
          depositTypes: rateConfig?.depositTypes,
          memberLebaranRates: personalLebaranRates,
        }
      );
      const routineSavingsDeduction =
        data.savings_deduction || (200000 + (memberLebaranRate > 0 ? memberLebaranRate : 0));
      const currentRemainingThp =
        numericThp - currentInstallments - externalInstallments - routineSavingsDeduction;

      setThpData({
        master_thp: numericThp,
        active_installments: currentInstallments,
        angsuran_lain_lain: externalInstallments,
        savings_deduction: routineSavingsDeduction,
        remaining_thp: currentRemainingThp
      });
    } catch (err: any) {
      console.error(err);
    }
  }

  const calculateCicilan = () => {
    if (!amount || effectiveTenor <= 0) return 0;
    return Math.round(Number(amount) / effectiveTenor);
  };

  const thpRemainingForEligibility = thpData
    ? (thpData.angsuran_lain_lain !== undefined
        ? thpData.master_thp - thpData.active_installments - Number(thpData.angsuran_lain_lain ?? 0) - (thpData.savings_deduction || 0)
        : thpData.remaining_thp)
    : 0;

  const eligibility = thpData 
    ? calculateTHPEligibility(thpRemainingForEligibility, calculateCicilan(), minRemainingThp)
    : { finalRemainingThp: 0, isEligible: false, shortfall: minRemainingThp };

  const isTHPEligible = () => eligibility.isEligible;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isTenorValid) {
      setError(`Tenor pinjaman harus berada di antara 1 hingga ${maxTenor} bulan.`);
      return;
    }
    if (thpData !== null && !isTHPEligible()) {
      setError(`Pengajuan ditolak: Sisa THP setelah pemotongan (${formatCurrency(eligibility.finalRemainingThp)}) kurang dari batas minimal ${formatCurrency(minRemainingThp)}.`);
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      await submitLoanApplication(selectedAnggota, purpose, amount, effectiveTenor, selectedLoanTypeId, maxTenor, minRemainingThp);
      setSuccess('Pengajuan pinjaman berhasil dibuat dan menunggu persetujuan.');
      
      // Reset form
      setSelectedLoanTypeId('');
      setPurpose('');
      setAmount('');
      setTenor('');
      setTenorMode('PRESET');
      setCustomTenorInput('');
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
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Tenor (Bulan) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={tenorMode === 'CUSTOM' ? 'CUSTOM' : tenor}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'CUSTOM') {
                        setTenorMode('CUSTOM');
                        setTenor('');
                        if (!customTenorInput) setCustomTenorInput('3');
                      } else {
                        setTenorMode('PRESET');
                        setTenor(val ? Number(val) : '');
                      }
                    }}
                    disabled={!selectedLoanTypeId}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                    required
                  >
                    <option value="">
                      {selectedLoanTypeId ? '-- Pilih Tenor --' : '-- Pilih Jenis Pinjaman Terlebih Dahulu --'}
                    </option>
                    {availableTenors.map((t) => (
                      <option key={t} value={t}>
                        {t} Bulan
                      </option>
                    ))}
                    {selectedLoanTypeId && (
                      <option value="CUSTOM">
                        Custom (Tentukan Sendiri: 1 – {maxTenor} Bulan)
                      </option>
                    )}
                  </select>

                  {tenorMode === 'CUSTOM' && selectedLoanTypeId && (
                    <div className="pt-1 space-y-1">
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={maxTenor}
                          step={1}
                          value={customTenorInput}
                          onChange={(e) => setCustomTenorInput(e.target.value)}
                          placeholder={`Masukkan jumlah bulan (1 - ${maxTenor})`}
                          className={`w-full px-3.5 py-2.5 pr-16 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 ${
                            effectiveTenor < 1 || effectiveTenor > maxTenor
                              ? 'border-rose-300 bg-rose-50/40 text-rose-800 focus:ring-rose-500'
                              : 'border-blue-300 bg-blue-50/30 text-slate-900 focus:ring-blue-500'
                          }`}
                          required
                        />
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                          Bulan
                        </span>
                      </div>
                      {effectiveTenor > maxTenor ? (
                        <p className="text-xs text-rose-600 font-medium">
                          Tenor custom tidak boleh melebihi batas maksimal jenis pinjaman ini ({maxTenor} Bulan).
                        </p>
                      ) : effectiveTenor < 1 ? (
                        <p className="text-xs text-rose-600 font-medium">
                          Masukkan minimal 1 bulan tenor pinjaman.
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-500">
                          Batas tenor yang diizinkan untuk <strong>{selectedLoanType?.name}</strong>: 1 s/d {maxTenor} Bulan.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !selectedAnggota || !selectedLoanTypeId || !isTenorValid || (thpData !== null && !isTHPEligible())}
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
            activeLoanBreakdown={activeLoanBreakdown}
            newInstallment={calculateCicilan()}
            amount={amount}
            tenor={effectiveTenor || ''}
            onSelectTenor={(t) => {
              setTenorMode('PRESET');
              setTenor(t);
            }}
            maxTenor={selectedLoanType ? selectedLoanType.max_duration_months : undefined}
            minRemainingThp={minRemainingThp}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
