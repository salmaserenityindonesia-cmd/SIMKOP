import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  loanService,
  MIN_REMAINING_THP,
  calculateTHPEligibility,
  getActiveLoanTypes,
  getLoanSettings,
  isGoodsMarkupLoanType,
  calculateGoodsMarkupScheduleSplit,
  ACTIVE_RUNNING_LOAN_STATUSES,
  ACTIVE_RUNNING_LOAN_STATUSES_ENUM_SAFE,
  isRunningLoanStatus,
  computeRealRemainingPrincipal
} from '../../services/loanService';
import { LoanType, FinancingScheme } from '../../services/koperasiService';
import { extractMemberTHP } from '../../services/memberService';
import {
  getMemberLebaranRates,
  loadSavingsRateConfig,
  resolveMemberSavingsRate
} from '../../services/savingsRateService';
import { supabase } from '../../lib/supabaseClient';
import { Loader2, Plus, Calculator, AlertCircle, CheckCircle } from 'lucide-react';
import MemberSelectAutosuggest from '../../components/common/MemberSelectAutosuggest';
import { DEFAULT_MAX_LOAN_AGE_YEARS, validateMaxLoanAge } from '../../utils/loanEligibility';

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
  loanTypeId?: string;
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
  sameTypeActiveLoans?: ActiveLoanBreakdownItem[];
  selectedLoanTypeName?: string;
  newInstallment: number;
  amount?: number | '';
  tenor?: number | '';
  onSelectTenor?: (tenor: number) => void;
  maxTenor?: number;
  minRemainingThp?: number;
  isGoodsMarkup?: boolean;
  itemDescription?: string;
  costPrice?: number;
  markupAmount?: number;
}

export function SimulationPanel({
  thpData,
  activeLoanBreakdown = [],
  sameTypeActiveLoans = [],
  selectedLoanTypeName,
  newInstallment,
  amount,
  tenor,
  onSelectTenor,
  maxTenor,
  minRemainingThp = MIN_REMAINING_THP,
  isGoodsMarkup = false,
  itemDescription,
  costPrice,
  markupAmount
}: SimulationPanelProps) {
  const externalInstallments = Number(thpData?.angsuran_lain_lain ?? 0);
  const sameTypeLoanIds = new Set(sameTypeActiveLoans.map((l) => l.id));
  const sameTypeSettlementTotal = sameTypeActiveLoans.reduce(
    (sum, item) => sum + Number(item.remainingPrincipal || 0),
    0
  );
  const replacedMonthlyInstallment = sameTypeActiveLoans.reduce(
    (sum, item) => sum + Number(item.monthlyInstallment || 0),
    0
  );
  const baseRemainingThp = thpData
    ? (thpData.angsuran_lain_lain !== undefined
        ? thpData.master_thp - thpData.active_installments - externalInstallments - (thpData.savings_deduction || 0)
        : thpData.remaining_thp)
    : 0;
  // Cicilan kontrak lama sejenis dikecualikan karena digantikan oleh angsuran pinjaman baru
  const currentRemainingThp = baseRemainingThp + replacedMonthlyInstallment;
  const effectiveExistingInstallments = thpData
    ? Math.max(0, thpData.active_installments - replacedMonthlyInstallment)
    : 0;
  const grossDisbursementBase = isGoodsMarkup
    ? Number(costPrice || 0)
    : Number(amount || 0);
  const netDisbursedToMember = Math.max(0, grossDisbursementBase - sameTypeSettlementTotal);
  const isTopUpValid =
    sameTypeSettlementTotal === 0 || grossDisbursementBase > sameTypeSettlementTotal;

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
              <span className="text-rose-600 font-medium">
                {replacedMonthlyInstallment > 0 ? 'Cicilan Berjalan (Jenis Lain)' : 'Cicilan Berjalan'}
              </span>
              <span className="text-rose-600 font-semibold tabular-nums">
                - {formatCurrency(effectiveExistingInstallments)}
              </span>
            </div>

            {activeLoanBreakdown.length > 0 && (
              <div className="pl-2.5 border-l-2 border-rose-200 space-y-1 pt-0.5">
                {activeLoanBreakdown.map((item) => {
                  const isReplaced = sameTypeLoanIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between text-[11px] gap-2 ${
                        isReplaced ? 'text-indigo-600 line-through opacity-75' : 'text-slate-600'
                      }`}
                    >
                      <div className="truncate">
                        <span className="font-semibold">{item.typeName}</span>
                        <span className="ml-1 opacity-75">
                          ({item.loanNumber} • {item.tenor} Bln)
                        </span>
                        {isReplaced && (
                          <span className="ml-1 no-underline inline-block font-semibold text-indigo-700">
                            [Dilunasi Top-Up]
                          </span>
                        )}
                      </div>
                      <span className="font-medium shrink-0 tabular-nums">
                        Rp {item.monthlyInstallment.toLocaleString('id-ID')}/bln
                      </span>
                    </div>
                  );
                })}
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
            {isGoodsMarkup && Number(costPrice || 0) > 0 && (
              <div className="mb-3 p-3 rounded-lg bg-teal-50/80 border border-teal-200 text-xs space-y-1">
                <div className="font-bold text-teal-900">
                  Skema Pembiayaan Barang (Markup Margin)
                </div>
                {itemDescription && (
                  <div className="text-teal-800 truncate">
                    Barang: <strong>{itemDescription}</strong>
                  </div>
                )}
                <div className="flex justify-between text-teal-700">
                  <span>Harga Modal Supplier:</span>
                  <span className="font-semibold">{formatCurrency(Number(costPrice || 0))}</span>
                </div>
                <div className="flex justify-between text-teal-700">
                  <span>Margin Keuntungan:</span>
                  <span className="font-semibold">{formatCurrency(Number(markupAmount || 0))}</span>
                </div>
                <div className="flex justify-between text-teal-900 font-bold pt-1 border-t border-teal-200">
                  <span>Harga Jual Akad:</span>
                  <span>{formatCurrency(Number(costPrice || 0) + Number(markupAmount || 0))}</span>
                </div>
              </div>
            )}
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

          {sameTypeSettlementTotal > 0 && (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-2 text-xs">
              <div className="font-bold text-indigo-900">
                Mode Perpanjangan / Top-Up ({selectedLoanTypeName || sameTypeActiveLoans[0]?.typeName || 'Sejenis'})
              </div>
              <p className="text-indigo-700 leading-relaxed">
                <strong>Pemotongan Pelunasan Pinjaman Lama Sejenis</strong> — pinjaman berjalan sejenis milik anggota akan otomatis dilunasi sampai angsuran terakhir dari pencairan pinjaman baru ini:
              </p>
              <div className="space-y-1 pt-1 border-t border-indigo-200/70">
                <div className="flex justify-between text-slate-700">
                  <span>Nilai Pencairan Pinjaman Baru:</span>
                  <span className="font-semibold">Rp {grossDisbursementBase.toLocaleString('id-ID')}</span>
                </div>
                {sameTypeActiveLoans.map((oldLoan) => (
                  <div key={oldLoan.id} className="flex justify-between text-rose-700">
                    <span>Potongan Pelunasan {oldLoan.loanNumber}:</span>
                    <span className="font-semibold">
                      - Rp {Number(oldLoan.remainingPrincipal).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-emerald-800 font-bold pt-1 border-t border-indigo-200">
                  <span>Sisa Uang Diterima Peminjam:</span>
                  <span>Rp {netDisbursedToMember.toLocaleString('id-ID')}</span>
                </div>
              </div>
              {!isTopUpValid && grossDisbursementBase > 0 && (
                <p className="text-rose-600 font-semibold pt-1">
                  {isGoodsMarkup
                    ? `Harga modal / nilai pencairan baru harus lebih besar dari sisa pinjaman lama (Rp ${sameTypeSettlementTotal.toLocaleString('id-ID')}).`
                    : `Plafon pinjaman baru harus lebih besar dari sisa pinjaman lama (Rp ${sameTypeSettlementTotal.toLocaleString('id-ID')}).`}
                </p>
              )}
            </div>
          )}

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
  minThreshold?: number,
  topUpOptions?: {
    refinancedLoanId?: string | null;
    topupSettlementAmount?: number;
    replacedMonthlyInstallment?: number;
  },
  goodsOptions?: {
    financingScheme?: FinancingScheme;
    itemDescription?: string;
    costPrice?: number;
    markupAmount?: number;
  }
) {
  const isGoodsMarkup = goodsOptions?.financingScheme === 'GOODS_MARKUP';

  if (isGoodsMarkup) {
    const itemDesc = String(goodsOptions?.itemDescription || '').trim();
    const cost = Math.round(Number(goodsOptions?.costPrice || 0));
    const margin = Math.round(Number(goodsOptions?.markupAmount ?? 0));
    if (!selectedAnggota || !selectedLoanTypeId || !tenor || !itemDesc || cost <= 0 || margin < 0) {
      throw new Error('Silakan lengkapi nama barang, harga modal supplier, margin, dan tenor pembiayaan barang.');
    }
  } else if (!selectedAnggota || !purpose || !amount || !tenor || !selectedLoanTypeId) {
    throw new Error('Silakan lengkapi seluruh kolom formulir termasuk jenis pinjaman.');
  }

  if (Number(tenor) < 1) {
    throw new Error('Masukkan minimal 1 bulan tenor pinjaman.');
  }

  if (Number(tenor) > maxTenor) {
    throw new Error(`Tenor yang dipilih (${tenor} bulan) melebihi batas maksimal ${maxTenor} bulan untuk jenis pinjaman ini.`);
  }

  if (isGoodsMarkup) {
    const totalAkad = Math.round(Number(goodsOptions?.costPrice || 0)) + Math.round(Number(goodsOptions?.markupAmount ?? 0));
    const effectivePurpose = purpose.trim() || `Pembiayaan Barang: ${String(goodsOptions?.itemDescription || '').trim()}`;
    return await loanService.applyLoan(
      selectedAnggota,
      effectivePurpose,
      totalAkad,
      Number(tenor),
      selectedLoanTypeId,
      minThreshold ?? MIN_REMAINING_THP,
      topUpOptions,
      goodsOptions
    );
  }

  if (topUpOptions) {
    return await loanService.applyLoan(
      selectedAnggota,
      purpose,
      Number(amount),
      Number(tenor),
      selectedLoanTypeId,
      minThreshold ?? MIN_REMAINING_THP,
      topUpOptions
    );
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
  initialMaxLoanAgeYears?: number;
  initialItemDescription?: string;
  initialCostPrice?: number | '';
  initialMarkupMode?: 'AMOUNT' | 'PERCENT';
  initialMarkupAmount?: number | '';
  initialMarkupPercent?: number | '';
  initialActiveLoanBreakdown?: ActiveLoanBreakdownItem[];
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
  initialMinRemainingThp,
  initialMaxLoanAgeYears,
  initialItemDescription,
  initialCostPrice,
  initialMarkupMode,
  initialMarkupAmount,
  initialMarkupPercent,
  initialActiveLoanBreakdown
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
  const [maxLoanAgeYears, setMaxLoanAgeYears] = useState<number>(initialMaxLoanAgeYears ?? DEFAULT_MAX_LOAN_AGE_YEARS);

  const [itemDescription, setItemDescription] = useState<string>(initialItemDescription || '');
  const [costPrice, setCostPrice] = useState<number | ''>(initialCostPrice ?? '');
  const [markupMode, setMarkupMode] = useState<'AMOUNT' | 'PERCENT'>(initialMarkupMode || 'AMOUNT');
  const [markupAmount, setMarkupAmount] = useState<number | ''>(initialMarkupAmount ?? '');
  const [markupPercent, setMarkupPercent] = useState<number | ''>(initialMarkupPercent ?? '');

  const selectedLoanType = loanTypes.find(lt => String(lt.id) === String(selectedLoanTypeId));
  const isGoodsMarkup = isGoodsMarkupLoanType(selectedLoanType);
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

  const numericCostPrice = Math.max(0, Number(costPrice || 0));
  const computedMarkupAmount = isGoodsMarkup
    ? markupMode === 'PERCENT'
      ? Math.round((numericCostPrice * Math.max(0, Number(markupPercent || 0))) / 100)
      : Math.max(0, Math.round(Number(markupAmount || 0)))
    : 0;
  const computedMarkupPercent =
    numericCostPrice > 0 ? (computedMarkupAmount / numericCostPrice) * 100 : 0;
  const totalCreditPrice = numericCostPrice + computedMarkupAmount;
  const effectiveAmount = isGoodsMarkup ? totalCreditPrice : Number(amount || 0);
  const isGoodsFormValid =
    !isGoodsMarkup ||
    (itemDescription.trim().length > 0 && numericCostPrice > 0 && computedMarkupAmount >= 0);

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
    if (
      isGoodsMarkupLoanType(newType) &&
      Number(newType?.default_markup_percent || 0) > 0 &&
      markupAmount === '' &&
      markupPercent === ''
    ) {
      setMarkupMode('PERCENT');
      setMarkupPercent(Number(newType!.default_markup_percent));
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
  
  const [activeLoanBreakdown, setActiveLoanBreakdown] = useState<ActiveLoanBreakdownItem[]>(
    initialActiveLoanBreakdown || []
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadAnggota();
    if (initialLoanTypes === undefined) {
      loadLoanTypes();
    }
    if (initialMinRemainingThp === undefined || initialMaxLoanAgeYears === undefined) {
      loadLoanSettings();
    }
  }, []);

  async function loadLoanSettings() {
    try {
      const settings = await getLoanSettings();
      if (initialMinRemainingThp === undefined && settings && typeof settings.minRemainingThp === 'number') {
        setMinRemainingThp(settings.minRemainingThp);
      }
      if (initialMaxLoanAgeYears === undefined && settings && typeof settings.maxLoanAgeYears === 'number') {
        setMaxLoanAgeYears(settings.maxLoanAgeYears);
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
      .select('id, nrp, nama, tanggal_lahir, take_home_pay, master_thp, salary, angsuran_lain_lain, bank_account_number, status, membership_status')
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
      const fetchRunningMemberLoans = async (statuses: string[]) =>
        await supabase
          .from('loans')
          .select(`
            id,
            loan_number,
            loan_type_id,
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
            ),
            loan_schedules (
              id,
              target_amount,
              paid_amount,
              status
            )
          `)
          .eq('member_id', memberId)
          .in('status', statuses)
          .order('created_at', { ascending: true });

      const [rateConfig, personalLebaranRates, initialActiveLoansRes] = await Promise.all([
        loadSavingsRateConfig().catch(() => null),
        getMemberLebaranRates(undefined, true).catch(() => []),
        fetchRunningMemberLoans(ACTIVE_RUNNING_LOAN_STATUSES),
      ]);

      let activeLoansRes = initialActiveLoansRes;
      if (
        activeLoansRes?.error &&
        (String(activeLoansRes.error.code || '') === '22P02' ||
          String(activeLoansRes.error.message || '').toLowerCase().includes('invalid input value for enum'))
      ) {
        activeLoansRes = await fetchRunningMemberLoans(ACTIVE_RUNNING_LOAN_STATUSES_ENUM_SAFE);
      }

      if (activeLoansRes.error) {
        console.error('Gagal memuat rincian pinjaman aktif:', activeLoansRes.error);
      }

      const breakdown: ActiveLoanBreakdownItem[] = (activeLoansRes.data || [])
        .filter((loan: any) => !loan?.status || isRunningLoanStatus(loan.status))
        .map((loan: any) => {
          const principal = Number(loan.principal_amount ?? loan.amount ?? 0);
          const months = Number(loan.agreed_tenor_months ?? loan.tenor ?? 1);
          const actualRemainingPrincipal = computeRealRemainingPrincipal(loan);

          const monthlyInstallment = Math.round(
            Number(loan.planned_installment_amount ?? loan.monthly_target ?? (months > 0 ? principal / months : 0))
          );
          const typeName = loan.loan_types?.name || 'Pinjaman Koperasi';

          return {
            id: String(loan.id),
            loanNumber: loan.loan_number || '-',
            loanTypeId: loan.loan_type_id
              ? String(loan.loan_type_id)
              : loan.loan_types?.id
                ? String(loan.loan_types.id)
                : undefined,
            typeName,
            tenor: months,
            monthlyInstallment,
            remainingPrincipal: actualRemainingPrincipal,
          };
        })
        .filter((item) => item.remainingPrincipal > 0);

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
    if (!effectiveAmount || effectiveTenor <= 0) return 0;
    return Math.round(Number(effectiveAmount) / effectiveTenor);
  };

  const monthlySplitPreview =
    isGoodsMarkup && effectiveTenor > 0 && numericCostPrice > 0
      ? calculateGoodsMarkupScheduleSplit(numericCostPrice, computedMarkupAmount, effectiveTenor)[0]
      : null;

  const sameTypeActiveLoans = selectedLoanTypeId
    ? activeLoanBreakdown.filter(
        (item) =>
          item.loanTypeId &&
          String(item.loanTypeId) === String(selectedLoanTypeId) &&
          Number(item.remainingPrincipal || 0) > 0
      )
    : [];
  const sameTypeSettlementTotal = sameTypeActiveLoans.reduce(
    (sum, item) => sum + Number(item.remainingPrincipal || 0),
    0
  );
  const replacedMonthlyInstallment = sameTypeActiveLoans.reduce(
    (sum, item) => sum + Number(item.monthlyInstallment || 0),
    0
  );
  const grossDisbursementBase = isGoodsMarkup ? numericCostPrice : Number(amount || 0);
  const isTopUpValid =
    sameTypeSettlementTotal === 0 || grossDisbursementBase > sameTypeSettlementTotal;

  const baseThpRemainingForEligibility = thpData
    ? (thpData.angsuran_lain_lain !== undefined
        ? thpData.master_thp - thpData.active_installments - Number(thpData.angsuran_lain_lain ?? 0) - (thpData.savings_deduction || 0)
        : thpData.remaining_thp)
    : 0;
  const thpRemainingForEligibility = baseThpRemainingForEligibility + replacedMonthlyInstallment;

  const eligibility = thpData 
    ? calculateTHPEligibility(thpRemainingForEligibility, calculateCicilan(), minRemainingThp)
    : { finalRemainingThp: 0, isEligible: false, shortfall: minRemainingThp };

  const isTHPEligible = () => eligibility.isEligible;

  const selectedMemberObj = anggotaList.find((a) => String(a.id) === String(selectedAnggota));
  const ageEligibility = validateMaxLoanAge(
    selectedMemberObj?.tanggal_lahir,
    effectiveTenor,
    maxLoanAgeYears
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGoodsFormValid) {
      setError('Silakan lengkapi Nama Barang dan Harga Beli / Modal Supplier yang valid.');
      return;
    }
    if (!isTenorValid) {
      setError(`Tenor pinjaman harus berada di antara 1 hingga ${maxTenor} bulan.`);
      return;
    }
    if (!ageEligibility.eligible) {
      setError(
        ageEligibility.errorMessage ||
          `Pengajuan ditolak: Proyeksi usia anggota saat lunas melebihi batas maksimal ${maxLoanAgeYears} tahun.`
      );
      return;
    }
    if (!isTopUpValid) {
      setError(
        isGoodsMarkup
          ? `Harga modal / nilai pencairan baru harus lebih besar dari sisa pinjaman lama (Rp ${sameTypeSettlementTotal.toLocaleString('id-ID')}).`
          : `Plafon pinjaman baru harus lebih besar dari sisa pinjaman lama (Rp ${sameTypeSettlementTotal.toLocaleString('id-ID')}).`
      );
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
      const topUpOptions = sameTypeSettlementTotal > 0
        ? {
            refinancedLoanId: sameTypeActiveLoans[0]?.id || null,
            topupSettlementAmount: sameTypeSettlementTotal,
            replacedMonthlyInstallment,
          }
        : undefined;
      const settlementSummary = sameTypeActiveLoans
        .map((l) => `${l.loanNumber} (Rp ${Number(l.remainingPrincipal).toLocaleString('id-ID')})`)
        .join(', ');
      const netDisbursed = Math.max(0, grossDisbursementBase - sameTypeSettlementTotal);
      const basePurpose = isGoodsMarkup
        ? (purpose.trim() || `Pembiayaan Barang: ${itemDescription.trim()}`)
        : purpose;
      const effectivePurpose = sameTypeSettlementTotal > 0
        ? `${basePurpose} [Top-Up Kompensasi: ${settlementSummary} | Cair Bersih: Rp ${netDisbursed.toLocaleString('id-ID')}]`
        : basePurpose;
      const goodsOptions = isGoodsMarkup
        ? {
            financingScheme: 'GOODS_MARKUP' as FinancingScheme,
            itemDescription: itemDescription.trim(),
            costPrice: numericCostPrice,
            markupAmount: computedMarkupAmount,
          }
        : undefined;
      await submitLoanApplication(
        selectedAnggota,
        effectivePurpose,
        isGoodsMarkup ? totalCreditPrice : amount,
        effectiveTenor,
        selectedLoanTypeId,
        maxTenor,
        minRemainingThp,
        topUpOptions,
        goodsOptions
      );
      setSuccess(
        isGoodsMarkup
          ? 'Pengajuan pembiayaan barang berhasil dibuat dan menunggu persetujuan.'
          : 'Pengajuan pinjaman berhasil dibuat dan menunggu persetujuan.'
      );
      
      // Reset form
      setSelectedLoanTypeId('');
      setPurpose('');
      setAmount('');
      setTenor('');
      setTenorMode('PRESET');
      setCustomTenorInput('');
      setItemDescription('');
      setCostPrice('');
      setMarkupMode('AMOUNT');
      setMarkupAmount('');
      setMarkupPercent('');
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
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Anggota Pemohon <span className="text-rose-500">*</span>
                </label>
                <MemberSelectAutosuggest
                  members={anggotaList}
                  selectedMemberId={selectedAnggota}
                  onSelectMember={(member) => handleSelectMember(member ? member.id : '')}
                  placeholder="Ketik NRP atau Nama Anggota..."
                />
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
                {selectedLoanType && (
                  <div className="mt-2">
                    {isGoodsMarkup ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200">
                        Pembiayaan Barang (Markup Margin) — 0% Bunga (Murabahah)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        0% Bunga — Tanpa Biaya Tambahan
                      </span>
                    )}
                  </div>
                )}
              </div>

              {isGoodsMarkup ? (
                <div className="p-4 sm:p-5 rounded-xl bg-teal-50/50 border border-teal-200 space-y-5">
                  <div className="flex items-center justify-between border-b border-teal-200/70 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-teal-900">
                        Rincian Pengadaan &amp; Markup Harga Barang
                      </h3>
                      <p className="text-xs text-teal-700 mt-0.5">
                        Kas koperasi dicairkan ke supplier sebesar Harga Modal; anggota mengangsur berdasarkan Harga Jual Akad tanpa bunga.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nama / Spesifikasi Barang <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={itemDescription}
                      onChange={e => setItemDescription(e.target.value)}
                      placeholder="Contoh: Sepeda Motor Honda Beat / Kulkas 2 Pintu"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Harga Beli / Modal Supplier (Rp) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={costPrice}
                        onChange={e => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Contoh: 2000000"
                        className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-medium text-gray-700">
                          Margin Keuntungan Koperasi
                        </label>
                        <div className="inline-flex rounded-lg border border-teal-200 bg-white p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setMarkupMode('AMOUNT')}
                            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                              markupMode === 'AMOUNT' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Rp
                          </button>
                          <button
                            type="button"
                            onClick={() => setMarkupMode('PERCENT')}
                            className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                              markupMode === 'PERCENT' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            %
                          </button>
                        </div>
                      </div>
                      {markupMode === 'AMOUNT' ? (
                        <input
                          type="number"
                          min="0"
                          value={markupAmount}
                          onChange={e => setMarkupAmount(e.target.value === '' ? '' : Number(e.target.value))}
                          placeholder="Contoh: 300000"
                          className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                        />
                      ) : (
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={markupPercent}
                            onChange={e => setMarkupPercent(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="Contoh: 15"
                            className="w-full px-4 py-2 pr-10 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">%</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Kotak Ringkasan Otomatis Akad Pembiayaan Barang */}
                  <div className="bg-white rounded-xl border border-teal-200 p-4 space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                      <span>Harga Beli / Modal Supplier</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(numericCostPrice)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>
                        Margin Markup Koperasi ({computedMarkupPercent.toFixed(1)}%)
                      </span>
                      <span className="font-semibold text-teal-700 tabular-nums">+ {formatCurrency(computedMarkupAmount)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-slate-900 font-bold">
                      <span>Harga Jual Kredit (Total Akad)</span>
                      <span className="text-teal-800 tabular-nums">{formatCurrency(totalCreditPrice)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600 pt-1">
                      <span>Angsuran Tetap per Bulan {effectiveTenor > 0 ? `(${effectiveTenor} Bln)` : ''}</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        {effectiveTenor > 0 ? `${formatCurrency(calculateCicilan())}/bln` : '-'}
                      </span>
                    </div>
                    {monthlySplitPreview && (
                      <div className="text-[11px] text-slate-500 flex justify-end">
                        Rincian bln ke-1: Pokok {formatCurrency(monthlySplitPreview.principal_portion)} + Margin {formatCurrency(monthlySplitPreview.margin_portion)}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Catatan Tambahan / Supplier (Opsional)
                    </label>
                    <input
                      type="text"
                      value={purpose}
                      onChange={e => setPurpose(e.target.value)}
                      placeholder="Contoh: Pengadaan via Toko Elektronik Jaya"
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>
              ) : (
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
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {!isGoodsMarkup && (
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
                )}
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

                  {selectedAnggota && effectiveTenor > 0 && (
                    ageEligibility.hasBirthDate && ageEligibility.projectedEndAgeYears !== null ? (
                      <div
                        className={`mt-2 p-3 rounded-xl border text-xs flex items-start gap-2 ${
                          ageEligibility.eligible
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        }`}
                      >
                        {ageEligibility.eligible ? (
                          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-0.5">
                          <div className="font-semibold">
                            {ageEligibility.formattedSummary} (Batas Maks: {maxLoanAgeYears} Thn)
                          </div>
                          {!ageEligibility.eligible && ageEligibility.errorMessage && (
                            <p className="text-rose-700 font-medium leading-relaxed">
                              {ageEligibility.errorMessage}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-slate-500">
                        Tanggal lahir anggota belum diisi (validasi usia dilewati).
                      </p>
                    )
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !selectedAnggota || !selectedLoanTypeId || !isGoodsFormValid || !isTenorValid || !isTopUpValid || !ageEligibility.eligible || (thpData !== null && !isTHPEligible())}
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
            sameTypeActiveLoans={sameTypeActiveLoans}
            selectedLoanTypeName={selectedLoanType?.name}
            newInstallment={calculateCicilan()}
            amount={isGoodsMarkup ? totalCreditPrice : amount}
            tenor={effectiveTenor || ''}
            onSelectTenor={(t) => {
              setTenorMode('PRESET');
              setTenor(t);
            }}
            maxTenor={selectedLoanType ? selectedLoanType.max_duration_months : undefined}
            minRemainingThp={minRemainingThp}
            isGoodsMarkup={isGoodsMarkup}
            itemDescription={itemDescription}
            costPrice={numericCostPrice}
            markupAmount={computedMarkupAmount}
          />
        </div>
      </div>
    </AdminLayout>
  );
}
