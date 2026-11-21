import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  CheckSquare,
  Square,
  FileText,
  History,
  AlertTriangle,
  Receipt,
  CreditCard,
  Trash2,
  Calendar,
  User,
  ShieldCheck,
  Loader2,
  Sparkles
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import {
  getRateTiers,
  getApplicableRate,
  buildSavingsRateResolver,
  getMemberLebaranRates,
  resolveMemberSavingsRate,
  resolveMemberLebaranRateInfo,
  SavingsRateTier,
  DepositTypeRateRef,
  MemberLebaranRate,
  DEFAULT_RATE_TIERS
} from '../../services/savingsRateService';
import {
  calculateTotalChecked,
  calculateFifoAllocation,
  matchAutomaticFifo,
  generateMemberTimeline,
  saveMonthDepositWithEvidence,
  cancelMonthDepositWithReason,
  getMonthAuditHistory,
  isSystemDefaultDescription,
  isMonthBeforeCutOff,
  getInitialSavingsCutOffDate,
  recordMatrixCancellationReversalsForTxs,
  syncMatrixDepositsToCashFlow,
  isProtectedSavingsTransaction,
  CheckMonthPayload,
  MonthAuditHistoryItem
} from '../../services/savingsMatrixService';
import { isOpeningOrMigrationDepositDescription } from '../../utils/depositCashFlowFormat';
import { parseCutoffDateInfo } from '../../services/complianceService';
import { formatCurrency } from '../../utils/formatCurrency';
import { SavingsDifferenceAuditModal } from './SavingsDifferenceAuditModal';
import MemberLebaranRateModal, { getIndonesianMonthLabel } from '../members/MemberLebaranRateModal';

export type DepositTabType = 'WAJIB' | 'BELANJA' | 'LEBARAN';
export type { MonthAuditHistoryItem, CheckMonthPayload };

export interface SavingsLedgerMatrixModalProps {
  memberId: string;
  memberNrp: string;
  memberName: string;
  joinDate?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  initialActiveTab?: DepositTabType;
  initialRateTiers?: SavingsRateTier[];
  initialDepositTypes?: DepositTypeRateRef[];
  initialDbBalances?: Partial<Record<DepositTabType, number>>;
  initialCheckedMonths?: Partial<Record<DepositTabType, string[]>>;
  initialMonthAmounts?: Partial<Record<DepositTabType, Record<string, number> | Map<string, number>>>;
  initialLoading?: boolean;
  initialEvidenceModalOpen?: boolean;
  initialSelectedCellForEvidence?: { year: number; month: number; label: string; rate: number } | null;
  initialUncheckModalOpen?: boolean;
  initialSelectedCellForUncheck?: { year: number; month: number; label: string; key: string } | null;
  initialHistoryModalOpen?: boolean;
  initialSelectedCellForHistory?: { year: number; month: number; label: string } | null;
  initialAuditHistory?: MonthAuditHistoryItem[];
  initialDiffModalOpen?: boolean;
  initialCutoffDate?: string | null;
  initialOpeningBalances?: Partial<Record<DepositTabType, number>>;
  initialWithdrawals?: Partial<Record<DepositTabType, number>>;
  initialMemberLebaranRates?: MemberLebaranRate[];
}

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'
];

export const FULL_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Helper untuk mendapatkan nama bulan (1-12)
 */
export const getMonthName = (monthNum: number | null | undefined): string => {
  if (!monthNum || monthNum < 1 || monthNum > 12) return '';
  return FULL_MONTH_NAMES[monthNum - 1] || MONTH_NAMES[monthNum - 1] || '';
};

/**
 * Format nominal tarif menjadi label ringkas (misal 150000 -> Rp 150k)
 */
export function formatRateBadge(rate: number): string {
  if (rate >= 1000) {
    const k = rate / 1000;
    return `Rp ${k % 1 === 0 ? k : k.toFixed(1)}k`;
  }
  return `Rp ${rate.toLocaleString('id-ID')}`;
}

/**
 * Tentukan kelas warna badge nominal tarif berdasarkan jenis simpanan dan periode
 * (Contoh: badge kuning Rp 150k s/d Okt 2025, badge hijau Rp 200k mulai Nov 2025)
 */
export function getBadgeColorClass(
  depositTypeCode: string,
  year: number,
  month: number,
  _rate: number,
  rateTiers?: SavingsRateTier[]
): string {
  const code = (depositTypeCode || '').toUpperCase();
  if (rateTiers && rateTiers.length > 0) {
    const targetIdx = year * 12 + month;
    const matchingTier = rateTiers.find(t => {
      if ((t.deposit_type_code || '').toUpperCase() !== code) return false;
      const startIdx = t.start_year * 12 + t.start_month;
      const endIdx = t.end_year && t.end_month ? t.end_year * 12 + t.end_month : Infinity;
      return targetIdx >= startIdx && targetIdx <= endIdx;
    });

    if (matchingTier) {
      if (!matchingTier.end_year) {
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      }
      return 'bg-amber-100 text-amber-800 border-amber-300';
    }
  }

  if (code === 'WAJIB') {
    if (year < 2025 || (year === 2025 && month <= 10)) {
      return 'bg-amber-100 text-amber-800 border-amber-300';
    }
    return 'bg-emerald-100 text-emerald-800 border-emerald-300';
  }
  if (code === 'BELANJA') {
    return 'bg-blue-100 text-blue-800 border-blue-300';
  }
  if (code === 'LEBARAN') {
    return 'bg-purple-100 text-purple-800 border-purple-300';
  }
  return 'bg-slate-100 text-slate-800 border-slate-300';
}

/**
 * Memeriksa apakah suatu periode (tahun, bulan) berada sebelum tanggal masuk anggota
 */
export function isMonthBeforeJoin(
  year: number,
  month: number,
  joinDate?: string | Date | null
): boolean {
  if (!joinDate) return false;
  const d = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  if (isNaN(d.getTime())) return false;

  const joinYear = d.getFullYear();
  const joinMonth = d.getMonth() + 1;

  const targetIndex = year * 12 + month;
  const joinIndex = joinYear * 12 + joinMonth;

  return targetIndex < joinIndex;
}

/**
 * Menghasilkan daftar bulan dalam format grid (default terurut kronologis asc, atau desc)
 */
export function generateMonthGrid(
  startYear: number,
  endYear: number,
  order: 'asc' | 'desc' = 'asc'
): Array<{ year: number; month: number; label: string; key: string }> {
  const list: Array<{ year: number; month: number; label: string; key: string }> = [];
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      list.push({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m - 1]}-${String(y).slice(-2)}`,
        key: `${y}-${String(m).padStart(2, '0')}`
      });
    }
  }
  if (order === 'desc') {
    return list.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }
  return list;
}

export {
  calculateTotalChecked,
  calculateFifoAllocation,
  matchAutomaticFifo,
  generateMemberTimeline,
  isMonthBeforeCutOff,
  getInitialSavingsCutOffDate
};

export default function SavingsLedgerMatrixModal({
  memberId,
  memberNrp,
  memberName,
  joinDate,
  onClose,
  onSuccess,
  initialActiveTab = 'WAJIB',
  initialRateTiers,
  initialDepositTypes,
  initialDbBalances,
  initialCheckedMonths,
  initialMonthAmounts,
  initialLoading,
  initialEvidenceModalOpen,
  initialSelectedCellForEvidence,
  initialUncheckModalOpen,
  initialSelectedCellForUncheck,
  initialHistoryModalOpen,
  initialSelectedCellForHistory,
  initialAuditHistory,
  initialDiffModalOpen,
  initialCutoffDate,
  initialOpeningBalances,
  initialWithdrawals,
  initialMemberLebaranRates
}: SavingsLedgerMatrixModalProps) {
  const [activeTab, setActiveTab] = useState<DepositTabType>(initialActiveTab);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState<boolean>(initialDiffModalOpen ?? false);
  const [isLebaranRateModalOpen, setIsLebaranRateModalOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState(initialLoading ?? true);
  const [syncing, setSyncing] = useState(false);
  const [rateTiers, setRateTiers] = useState<SavingsRateTier[]>(initialRateTiers || DEFAULT_RATE_TIERS);
  const [depositTypes, setDepositTypes] = useState<DepositTypeRateRef[]>(initialDepositTypes || []);
  const [memberLebaranRates, setMemberLebaranRates] = useState<MemberLebaranRate[]>(
    initialMemberLebaranRates || []
  );

  useEffect(() => {
    if (initialDepositTypes && initialDepositTypes.length > 0) {
      setDepositTypes(initialDepositTypes);
    }
  }, [initialDepositTypes]);

  useEffect(() => {
    if (initialMemberLebaranRates) {
      setMemberLebaranRates(initialMemberLebaranRates);
    }
  }, [initialMemberLebaranRates]);

  const rateResolver = useMemo(
    () => buildSavingsRateResolver(rateTiers, depositTypes, memberLebaranRates),
    [rateTiers, depositTypes, memberLebaranRates]
  );

  const getEffectiveCellRate = (tab: DepositTabType, year: number, month: number): number =>
    resolveMemberSavingsRate(memberId, tab, year, month, {
      globalTiers: rateTiers,
      depositTypes,
      memberLebaranRates
    });

  useEffect(() => {
    if (initialRateTiers && initialRateTiers.length > 0) {
      setRateTiers(initialRateTiers);
    }
  }, [initialRateTiers]);

  const activeTabRateTiers = useMemo(() => {
    if (!rateTiers || rateTiers.length === 0) return [];
    return rateTiers
      .filter(t => (t.deposit_type_code || '').toUpperCase() === activeTab)
      .sort((a, b) => (a.start_year * 12 + a.start_month) - (b.start_year * 12 + b.start_month));
  }, [rateTiers, activeTab]);

  // State Dialog Bukti Setoran
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(initialEvidenceModalOpen ?? false);
  const [selectedCellForEvidence, setSelectedCellForEvidence] = useState<{
    year: number;
    month: number;
    label: string;
    rate: number;
  } | null>(initialSelectedCellForEvidence ?? null);
  const [evidenceAmount, setEvidenceAmount] = useState<number>(initialSelectedCellForEvidence?.rate ?? 0);
  const [evidenceReferenceNo, setEvidenceReferenceNo] = useState<string>('');
  const [evidencePaymentMethod, setEvidencePaymentMethod] = useState<string>('tunai');
  const [evidenceNotes, setEvidenceNotes] = useState<string>('');
  const [savingEvidence, setSavingEvidence] = useState(false);

  // State Dialog Konfirmasi Pembatalan (Uncheck)
  const [uncheckModalOpen, setUncheckModalOpen] = useState(initialUncheckModalOpen ?? false);
  const [selectedCellForUncheck, setSelectedCellForUncheck] = useState<{
    year: number;
    month: number;
    label: string;
    key: string;
  } | null>(initialSelectedCellForUncheck ?? null);
  const [uncheckReason, setUncheckReason] = useState('');
  const [unchecking, setUnchecking] = useState(false);

  // State Modal Riwayat Audit
  const [historyModalOpen, setHistoryModalOpen] = useState(initialHistoryModalOpen ?? false);
  const [selectedCellForHistory, setSelectedCellForHistory] = useState<{
    year: number;
    month: number;
    label: string;
  } | null>(initialSelectedCellForHistory ?? null);
  const [auditHistory, setAuditHistory] = useState<MonthAuditHistoryItem[]>(initialAuditHistory ?? []);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Deduplikasi cerdas untuk tampilan riwayat audit agar tidak menampilkan kartu pembatalan ganda
  const displayedAuditHistory = useMemo(() => {
    return auditHistory.filter((log, idx, arr) => {
      if (log.action !== 'DELETE') return true;
      const closeSiblings = arr.filter((other, oIdx) => {
        if (oIdx === idx || other.action !== 'DELETE') return false;
        const timeDiff = Math.abs(
          new Date(other.createdAt).getTime() - new Date(log.createdAt).getTime()
        );
        return timeDiff <= 10000 && other.forMonth === log.forMonth && other.forYear === log.forYear;
      });

      if (closeSiblings.length === 0) return true;

      const isCurrentDefault = isSystemDefaultDescription(log.notes);
      const hasCustomSibling = closeSiblings.some(s => !isSystemDefaultDescription(s.notes));

      if (isCurrentDefault && hasCustomSibling) return false;

      // Jika entri saat ini memiliki alasan custom dan ada entri saudara yang default, prioritaskan entri custom ini
      if (!isCurrentDefault && closeSiblings.some(s => isSystemDefaultDescription(s.notes))) {
        return true;
      }

      const firstMatchingIdx = arr.findIndex((other) => {
        if (other.action !== 'DELETE') return false;
        const timeDiff = Math.abs(
          new Date(other.createdAt).getTime() - new Date(log.createdAt).getTime()
        );
        return timeDiff <= 10000 && other.forMonth === log.forMonth && other.forYear === log.forYear;
      });

      return idx === firstMatchingIdx;
    });
  }, [auditHistory]);

  // Map deposit type code -> member_deposit_id
  const [memberDepositMap, setMemberDepositMap] = useState<Record<string, string>>({});
  
  // Saldo referensi permanen / baseline yang tidak boleh di-nol-kan saat uncheck all
  const baselineBalancesRef = React.useRef<Record<DepositTabType, number>>({
    WAJIB: initialDbBalances?.WAJIB ?? 0,
    BELANJA: initialDbBalances?.BELANJA ?? 0,
    LEBARAN: initialDbBalances?.LEBARAN ?? 0
  });

  // Saldo terdaftar di database (saldo impor/migrasi) per jenis simpanan
  const [dbBalances, setDbBalances] = useState<Record<DepositTabType, number>>({
    WAJIB: initialDbBalances?.WAJIB ?? 0,
    BELANJA: initialDbBalances?.BELANJA ?? 0,
    LEBARAN: initialDbBalances?.LEBARAN ?? 0
  });

  // Cut-off date Saldo Awal Simpanan dan Saldo Awal Utuh per jenis simpanan (default resmi Maret 2026)
  const [cutoffDate, setCutoffDate] = useState<string | null>(initialCutoffDate || '2026-03-01');
  const [openingBalances, setOpeningBalances] = useState<Record<DepositTabType, number>>({
    WAJIB: initialOpeningBalances?.WAJIB ?? 0,
    BELANJA: initialOpeningBalances?.BELANJA ?? 0,
    LEBARAN: initialOpeningBalances?.LEBARAN ?? 0
  });
  const [withdrawals, setWithdrawals] = useState<Record<DepositTabType, number>>({
    WAJIB: initialWithdrawals?.WAJIB ?? 0,
    BELANJA: initialWithdrawals?.BELANJA ?? 0,
    LEBARAN: initialWithdrawals?.LEBARAN ?? 0
  });

  useEffect(() => {
    if (initialCutoffDate !== undefined) {
      setCutoffDate(initialCutoffDate || '2026-03-01');
    }
  }, [initialCutoffDate]);

  useEffect(() => {
    if (initialOpeningBalances) {
      setOpeningBalances(prev => ({
        WAJIB: initialOpeningBalances.WAJIB ?? prev.WAJIB,
        BELANJA: initialOpeningBalances.BELANJA ?? prev.BELANJA,
        LEBARAN: initialOpeningBalances.LEBARAN ?? prev.LEBARAN
      }));
    }
  }, [initialOpeningBalances]);

  useEffect(() => {
    if (initialWithdrawals) {
      setWithdrawals(prev => ({
        WAJIB: initialWithdrawals.WAJIB ?? prev.WAJIB,
        BELANJA: initialWithdrawals.BELANJA ?? prev.BELANJA,
        LEBARAN: initialWithdrawals.LEBARAN ?? prev.LEBARAN
      }));
    }
  }, [initialWithdrawals]);

  // State bulan tercentang per jenis simpanan: Set of 'YYYY-MM'
  const [checkedMonths, setCheckedMonths] = useState<Record<DepositTabType, Set<string>>>({
    WAJIB: new Set(initialCheckedMonths?.WAJIB || []),
    BELANJA: new Set(initialCheckedMonths?.BELANJA || []),
    LEBARAN: new Set(initialCheckedMonths?.LEBARAN || [])
  });

  // State nominal transaksi per bulan (untuk mendukung nominal riil parsial)
  const [monthAmounts, setMonthAmounts] = useState<Record<DepositTabType, Map<string, number>>>(() => {
    const initMap: Record<DepositTabType, Map<string, number>> = {
      WAJIB: new Map(),
      BELANJA: new Map(),
      LEBARAN: new Map()
    };
    if (initialMonthAmounts) {
      (['WAJIB', 'BELANJA', 'LEBARAN'] as DepositTabType[]).forEach(tab => {
        const tabAmounts = initialMonthAmounts[tab];
        if (tabAmounts) {
          if (tabAmounts instanceof Map) {
            initMap[tab] = new Map(tabAmounts);
          } else {
            initMap[tab] = new Map(Object.entries(tabAmounts));
          }
        }
      });
    }
    return initMap;
  });

  const [resolvedJoinDate, setResolvedJoinDate] = useState<string | null>(joinDate || null);

  // Hitung timeline bulan untuk grid (selalu dimulai dari periode cut-off saldo awal, minimal Mar-26)
  const { startYear, endYear, timelineMonths, allGridMonths } = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const eYear = Math.max(2026, currentYear);
    const effectiveTimelineCutoff = cutoffDate || '2026-03-01';
    const months = generateMemberTimeline(effectiveTimelineCutoff, resolvedJoinDate, eYear);
    const sYear = months.length > 0 ? months[0].year : 2026;
    return { startYear: sYear, endYear: eYear, timelineMonths: months, allGridMonths: months };
  }, [cutoffDate, resolvedJoinDate]);

  // Penanda waktu bulan berjalan untuk auto-scroll dan penanda visual
  const today = useMemo(() => new Date(), []);
  const currentCalYear = today.getFullYear();
  const currentCalMonth = today.getMonth() + 1; // 1 - 12

  const activeLebaranRateInfo = useMemo(
    () =>
      resolveMemberLebaranRateInfo(memberId, currentCalYear, currentCalMonth, {
        globalTiers: rateTiers,
        depositTypes,
        memberLebaranRates
      }),
    [memberId, currentCalYear, currentCalMonth, rateTiers, depositTypes, memberLebaranRates]
  );

  // Reference React untuk kontainer scroll tabel dan kolom bulan berjalan
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const currentMonthColRef = useRef<HTMLTableHeaderCellElement | null>(null);

  // Auto-scroll ke kolom bulan berjalan saat modal selesai dimuat atau saat tab aktif berganti
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        if (typeof currentMonthColRef.current?.scrollIntoView === 'function') {
          currentMonthColRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [loading, activeTab, cutoffDate]);

  // Load tiers, member deposit accounts, and existing transactions
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        // 1. Ambil rate tiers & ketentuan Simpanan Lebaran personal anggota
        const [tiers, personalRates] = await Promise.all([
          getRateTiers(undefined, false),
          memberId ? getMemberLebaranRates(memberId, false).catch(() => [] as MemberLebaranRate[]) : Promise.resolve([] as MemberLebaranRate[])
        ]);
        if (isMounted) {
          setRateTiers(tiers && tiers.length > 0 ? tiers : DEFAULT_RATE_TIERS);
          setMemberLebaranRates(personalRates);
        }

        // 2. Jika joinDate belum ada, ambil dari tabel anggota
        let effectiveJoin = joinDate;
        if (!effectiveJoin && memberId) {
          try {
            const { data: memberRecord } = await supabase
              .from('anggota')
              .select('created_at, tgl_awal_anggota')
              .eq('id', memberId)
              .single();
            if (memberRecord) {
              effectiveJoin = memberRecord.tgl_awal_anggota || memberRecord.created_at;
              if (isMounted) setResolvedJoinDate(effectiveJoin);
            }
          } catch (err) {
            console.warn('Could not fetch member join date:', err);
          }
        }

        // 3. Ambil data deposit types untuk mapping id
        const { data: dTypes } = await supabase
          .from('deposit_types')
          .select('id, name, code, default_amount, is_active');
        setDepositTypes(dTypes || []);
        const dtList = dTypes || [];
        const findDtId = (keywords: string[], fallbackCode: string) => {
          const match = dtList.find((dt: any) => {
            const c = (dt.code || '').toUpperCase();
            const n = (dt.name || '').toLowerCase();
            return keywords.some(k => c === k.toUpperCase() || n.includes(k.toLowerCase()));
          });
          return match?.id || fallbackCode;
        };

        const wajibTypeId = findDtId(['WAJIB', 'SW'], 'wajib');
        const belanjaTypeId = findDtId(['BELANJA', 'SB'], 'belanja');
        const lebaranTypeId = findDtId(['LEBARAN', 'SL', 'HARI RAYA'], 'lebaran');

        // 4. Ambil member_deposits beserta deposit_transactions
        const { data: memberDepositsData, error: mdError } = await supabase
          .from('member_deposits')
          .select(`
            id,
            deposit_type_id,
            deposit_types ( id, name, code ),
            deposit_transactions (
              id,
              amount,
              for_month,
              for_year,
              transaction_type,
              description,
              created_at
            )
          `)
          .eq('member_id', memberId);

        if (mdError) {
          console.warn('Gagal memuat member_deposits:', mdError);
        }

        const map: Record<string, string> = {};
        const newDbBalances: Record<DepositTabType, number> = {
          WAJIB: initialDbBalances?.WAJIB ?? 0,
          BELANJA: initialDbBalances?.BELANJA ?? 0,
          LEBARAN: initialDbBalances?.LEBARAN ?? 0
        };
        const newOpeningBalances: Record<DepositTabType, number> = {
          WAJIB: initialOpeningBalances?.WAJIB ?? 0,
          BELANJA: initialOpeningBalances?.BELANJA ?? 0,
          LEBARAN: initialOpeningBalances?.LEBARAN ?? 0
        };
        const newWithdrawals: Record<DepositTabType, number> = {
          WAJIB: initialWithdrawals?.WAJIB ?? 0,
          BELANJA: initialWithdrawals?.BELANJA ?? 0,
          LEBARAN: initialWithdrawals?.LEBARAN ?? 0
        };
        const newCheckedMonths: Record<DepositTabType, Set<string>> = {
          WAJIB: new Set(initialCheckedMonths?.WAJIB || []),
          BELANJA: new Set(initialCheckedMonths?.BELANJA || []),
          LEBARAN: new Set(initialCheckedMonths?.LEBARAN || [])
        };
        const newMonthAmounts: Record<DepositTabType, Map<string, number>> = {
          WAJIB: new Map(),
          BELANJA: new Map(),
          LEBARAN: new Map()
        };

        const allMemberTxs: any[] = [];
        if (memberDepositsData && memberDepositsData.length > 0) {
          for (const md of memberDepositsData as any[]) {
            if (Array.isArray(md.deposit_transactions)) {
              allMemberTxs.push(...md.deposit_transactions);
            }
          }
        }

        const effectiveCutoffDate =
          initialCutoffDate || (await getInitialSavingsCutOffDate(allMemberTxs)) || '2026-03-01';

        if (memberDepositsData && memberDepositsData.length > 0) {
          for (const md of memberDepositsData as any[]) {
            const typeObj = Array.isArray(md.deposit_types) ? md.deposit_types[0] : md.deposit_types;
            const typeName = (typeObj?.name || '').toLowerCase();
            const typeCode = (typeObj?.code || '').toUpperCase();

            let tab: DepositTabType | null = null;
            if (typeCode === 'WAJIB' || typeCode === 'SW' || typeName.includes('wajib')) {
              tab = 'WAJIB';
            } else if (typeCode === 'BELANJA' || typeCode === 'SB' || typeName.includes('belanja')) {
              tab = 'BELANJA';
            } else if (typeCode === 'LEBARAN' || typeCode === 'SL' || typeName.includes('lebaran') || typeName.includes('hari raya')) {
              tab = 'LEBARAN';
            }

            if (!tab) continue;
            map[tab] = md.id;

            const txs: any[] = Array.isArray(md.deposit_transactions) ? md.deposit_transactions : [];

            const isOpeningTx = (t: any) => isOpeningOrMigrationDepositDescription(t.description);

            let net = 0;
            let openingAmt = 0;
            let preCutoffMonthlyNet = 0;
            let totalWithdrawalsAmt = 0;
            for (const t of txs) {
              const amt = Number(t.amount || 0);
              if (t.transaction_type === 'withdrawal') net -= amt;
              else net += amt;

              if (effectiveCutoffDate) {
                const hasExplicitMonth =
                  t.for_month !== null && t.for_month !== undefined && !isNaN(Number(t.for_month));
                const isPreCutoffUnallocated =
                  t.transaction_type === 'deposit' && !hasExplicitMonth;
                if (isOpeningTx(t) || isPreCutoffUnallocated) {
                  openingAmt += t.transaction_type === 'withdrawal' ? -amt : amt;
                } else if (t.transaction_type === 'withdrawal') {
                  if (
                    t.for_year &&
                    t.for_month &&
                    isMonthBeforeCutOff(Number(t.for_year), Number(t.for_month), effectiveCutoffDate)
                  ) {
                    preCutoffMonthlyNet -= amt;
                  } else {
                    totalWithdrawalsAmt += amt;
                  }
                } else if (
                  t.for_year &&
                  t.for_month &&
                  isMonthBeforeCutOff(Number(t.for_year), Number(t.for_month), effectiveCutoffDate)
                ) {
                  preCutoffMonthlyNet += amt;
                }
              } else if (t.transaction_type === 'withdrawal' && !isOpeningTx(t)) {
                totalWithdrawalsAmt += amt;
              }
            }

            if (effectiveCutoffDate) {
              const effectiveOpeningAmt =
                openingAmt > 0 ? openingAmt : Math.max(0, preCutoffMonthlyNet);
              const resolvedOpening = Math.max(effectiveOpeningAmt, initialOpeningBalances?.[tab] || 0);
              newOpeningBalances[tab] = resolvedOpening;
            }

            if (txs.length > 0) {
              newWithdrawals[tab] = totalWithdrawalsAmt;
              newDbBalances[tab] = net;
              baselineBalancesRef.current[tab] = net;
            }

            // Ambil bulan-bulan yang tercentang dari deposit_transactions beserta nominal riilnya
            // (Dalam mode Cut-Off, abaikan bulan sebelum cut-off, transaksi saldo awal, dan penarikan)
            for (const t of txs) {
              if (isProtectedSavingsTransaction(t, effectiveCutoffDate)) {
                continue;
              }
              const key = `${t.for_year}-${String(t.for_month).padStart(2, '0')}`;
              newCheckedMonths[tab].add(key);
              newMonthAmounts[tab].set(
                key,
                (newMonthAmounts[tab].get(key) || 0) + Number(t.amount || 0)
              );
            }
          }
        }

        if (isMounted) {
          setMemberDepositMap(map);
          setCutoffDate(effectiveCutoffDate);
          setOpeningBalances(newOpeningBalances);
          setWithdrawals(newWithdrawals);
          setDbBalances(newDbBalances);
          setCheckedMonths(newCheckedMonths);
          setMonthAmounts(newMonthAmounts);
        }
      } catch (err) {
        console.error('Error initializing SavingsLedgerMatrixModal:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [memberId, joinDate]);

  // Perhitungan saldo saat ini untuk tab aktif
  const currentCheckedSet = checkedMonths[activeTab] || new Set();
  const currentMonthAmounts = monthAmounts[activeTab] || new Map<string, number>();
  const totalChecked = useMemo(() => {
    return calculateTotalChecked(
      currentCheckedSet,
      activeTab,
      rateTiers,
      currentMonthAmounts,
      depositTypes,
      memberId,
      memberLebaranRates
    );
  }, [currentCheckedSet, activeTab, rateTiers, currentMonthAmounts, depositTypes, memberId, memberLebaranRates]);

  const currentOpeningBalance = openingBalances[activeTab] || 0;
  const currentWithdrawals = withdrawals[activeTab] || 0;
  const hasCutoffMode = Boolean(cutoffDate) || currentOpeningBalance > 0;
  const parsedCutoffInfo = useMemo(() => parseCutoffDateInfo(cutoffDate), [cutoffDate]);
  const totalAccumulation = currentOpeningBalance + totalChecked - currentWithdrawals;
  const targetDbBalance = dbBalances[activeTab] || 0;
  const balanceDifference =
    (hasCutoffMode ? totalAccumulation : totalChecked - currentWithdrawals) - targetDbBalance;
  const isBalanced = balanceDifference === 0;

  // Handler buka form bukti setoran
  const handleOpenEvidenceModal = (year: number, month: number, label: string) => {
    const rate = getEffectiveCellRate(activeTab, year, month);
    setSelectedCellForEvidence({ year, month, label, rate });
    setEvidenceAmount(rate);
    setEvidenceReferenceNo(`KW-${year}/${String(month).padStart(2, '0')}/${memberNrp || '01'}`);
    setEvidencePaymentMethod('tunai');
    setEvidenceNotes('');
    setEvidenceModalOpen(true);
  };

  const resolveActiveDepositTypeName = (): string => {
    const matchingDepositType = depositTypes.find((dt) => {
      const c = String(dt.code || '').toUpperCase();
      const n = String(dt.name || '').toLowerCase();
      if (activeTab === 'WAJIB') return c === 'WAJIB' || c === 'SW' || n.includes('wajib');
      if (activeTab === 'BELANJA') return c === 'BELANJA' || c === 'SB' || n.includes('belanja');
      return c === 'LEBARAN' || c === 'SL' || n.includes('lebaran') || n.includes('hari raya');
    });
    const fallbackTypeName =
      activeTab === 'WAJIB'
        ? 'Simpanan Wajib'
        : activeTab === 'BELANJA'
        ? 'Simpanan Belanja Bulanan'
        : 'Simpanan Hari Raya (Lebaran)';
    return matchingDepositType?.name || fallbackTypeName;
  };

  // Handler simpan bukti setoran
  const handleSubmitEvidence = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCellForEvidence) return;
    const { year, month } = selectedCellForEvidence;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) {
      console.warn(`member_deposit_id not found for ${activeTab}`);
      return;
    }

    setSavingEvidence(true);
    try {
      const amt = Number(evidenceAmount) > 0 ? Number(evidenceAmount) : selectedCellForEvidence.rate;
      const previousAmt = currentCheckedSet.has(key)
        ? (currentMonthAmounts.get(key) ?? selectedCellForEvidence.rate)
        : 0;

      await saveMonthDepositWithEvidence({
        memberDepositId,
        year,
        month,
        amount: amt,
        referenceNo: evidenceReferenceNo.trim() || undefined,
        paymentMethod: evidencePaymentMethod,
        notes: evidenceNotes.trim() || undefined,
        description: `Setoran Matriks ${activeTab} ${MONTH_NAMES[month - 1]} ${year}`,
        memberNrp,
        memberName,
        depositTypeName: resolveActiveDepositTypeName()
      });

      setCheckedMonths(prev => {
        const nextSet = new Set(prev[activeTab] || []);
        nextSet.add(key);
        return { ...prev, [activeTab]: nextSet };
      });
      setMonthAmounts(prev => {
        const nextMap = new Map(prev[activeTab] || []);
        nextMap.set(key, amt);
        return { ...prev, [activeTab]: nextMap };
      });
      setDbBalances(prev => {
        const nextBal = (prev[activeTab] || 0) + (amt - previousAmt);
        baselineBalancesRef.current[activeTab] = nextBal;
        return { ...prev, [activeTab]: nextBal };
      });

      setEvidenceModalOpen(false);
      setSelectedCellForEvidence(null);
      onSuccess?.();
    } catch (err) {
      console.error('Gagal menyimpan bukti setoran:', err);
    } finally {
      setSavingEvidence(false);
    }
  };

  // Handler buka modal konfirmasi uncheck
  const handleOpenUncheckModal = (year: number, month: number, label: string, key: string) => {
    setSelectedCellForUncheck({ year, month, label, key });
    setUncheckReason('');
    setUncheckModalOpen(true);
  };

  // Handler konfirmasi pembatalan uncheck
  const handleConfirmUncheck = async () => {
    if (!selectedCellForUncheck) return;
    const trimmedReason = uncheckReason.trim();
    if (trimmedReason.length < 3) return;

    const { year, month, key } = selectedCellForUncheck;
    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) return;

    setUnchecking(true);
    try {
      const removedAmt =
        currentMonthAmounts.get(key) ?? getEffectiveCellRate(activeTab, year, month);
      const res = await cancelMonthDepositWithReason(
        memberDepositId,
        year,
        month,
        trimmedReason,
        {
          memberNrp,
          memberName,
          depositTypeName: resolveActiveDepositTypeName()
        }
      );

      setCheckedMonths(prev => {
        const nextSet = new Set(prev[activeTab] || []);
        nextSet.delete(key);
        return { ...prev, [activeTab]: nextSet };
      });
      setMonthAmounts(prev => {
        const nextMap = new Map(prev[activeTab] || []);
        nextMap.delete(key);
        return { ...prev, [activeTab]: nextMap };
      });
      if (res.cancelledCount > 0) {
        const deductedAmt =
          res.reversedAmount && res.reversedAmount > 0 ? res.reversedAmount : removedAmt;
        setDbBalances(prev => {
          const nextBal = (prev[activeTab] || 0) - deductedAmt;
          baselineBalancesRef.current[activeTab] = nextBal;
          return { ...prev, [activeTab]: nextBal };
        });
      }

      setUncheckModalOpen(false);
      setSelectedCellForUncheck(null);
      setUncheckReason('');
      onSuccess?.();
    } catch (err) {
      console.error('Gagal membatalkan centang:', err);
    } finally {
      setUnchecking(false);
    }
  };

  // Handler buka drawer riwayat audit
  const handleOpenHistoryModal = async (year: number, month: number, label: string) => {
    setSelectedCellForHistory({ year, month, label });
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    setAuditHistory([]);
    try {
      const memberDepositId = memberDepositMap[activeTab];
      if (memberDepositId) {
        const items = await getMonthAuditHistory(memberDepositId, year, month);
        setAuditHistory(items);
      }
    } catch (err) {
      console.error('Gagal mengambil riwayat audit bulan:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Handler toggle satu cell checkbox (buka dialog sesuai status centang saat ini)
  const handleToggleMonth = (year: number, month: number, key: string, label?: string) => {
    if (isMonthBeforeCutOff(year, month, cutoffDate)) {
      return;
    }
    const isCurrentlyChecked = currentCheckedSet.has(key);
    const monthLabel = label || `${MONTH_NAMES[month - 1]}-${String(year).slice(-2)}`;
    if (isCurrentlyChecked) {
      handleOpenUncheckModal(year, month, monthLabel, key);
    } else {
      handleOpenEvidenceModal(year, month, monthLabel);
    }
  };

  // Helper sinkronisasi batch ke Supabase (murni tambah/hapus bulan pasca cut-off tanpa menyentuh Saldo Awal & Penarikan)
  const syncBatchToDatabase = async (newCheckedKeys: string[], customAmounts?: Map<string, number>) => {
    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) return;

    setSyncing(true);
    try {
      const effectiveCutoff = hasCutoffMode ? cutoffDate : null;
      // Filter hanya bulan pasca cut-off jika mode Cut-Off Saldo Awal aktif
      const safeKeys = cutoffDate
        ? newCheckedKeys.filter((k) => {
            const [yStr, mStr] = k.split('-');
            return !isMonthBeforeCutOff(parseInt(yStr, 10), parseInt(mStr, 10), cutoffDate);
          })
        : newCheckedKeys;
      const safeKeySet = new Set(safeKeys);

      let existingRows: any[] = [];
      try {
        const dtTable: any = supabase?.from?.('deposit_transactions');
        if (dtTable && typeof dtTable.select === 'function') {
          const selQ: any = dtTable.select('id, amount, for_year, for_month, transaction_type, description');
          if (selQ && typeof selQ.eq === 'function') {
            const res: any = await selQ.eq('member_deposit_id', memberDepositId);
            if (!res?.error && Array.isArray(res?.data)) {
              existingRows = res.data;
            }
          }
        }
      } catch {
        existingRows = [];
      }

      const existingRoutine = existingRows.filter(
        (t: any) => !isProtectedSavingsTransaction(t, effectiveCutoff)
      );

      const existingRoutineByKey = new Map<string, any[]>();
      const obsoleteRoutineTxs: any[] = [];

      for (const tx of existingRoutine) {
        const fy = Number(tx.for_year);
        const fm = Number(tx.for_month);
        const txKey = `${fy}-${String(fm).padStart(2, '0')}`;
        const inGridYearRange = fy >= startYear && fy <= endYear;
        if (inGridYearRange && !safeKeySet.has(txKey)) {
          obsoleteRoutineTxs.push(tx);
        } else {
          const list = existingRoutineByKey.get(txKey) || [];
          list.push(tx);
          existingRoutineByKey.set(txKey, list);
        }
      }

      // 1. Hapus HANYA transaksi setoran rutin bulanan pasca cut-off yang tidak lagi dicentang
      const obsoleteIds = obsoleteRoutineTxs
        .map((t: any) => String(t?.id || ''))
        .filter(Boolean);
      const removedSum = obsoleteRoutineTxs.reduce(
        (sum: number, t: any) => sum + Number(t?.amount || 0),
        0
      );

      if (obsoleteIds.length > 0) {
        await recordMatrixCancellationReversalsForTxs({
          memberDepositId,
          txs: obsoleteRoutineTxs,
          reason: 'Penyesuaian Sinkronisasi Matriks Simpanan',
          memberNrp,
          memberName,
          depositTypeName: resolveActiveDepositTypeName()
        });
        const delQuery: any = supabase.from('deposit_transactions').delete();
        if (typeof delQuery?.in === 'function') {
          const { error: delErr } = await delQuery.in('id', obsoleteIds);
          if (delErr) throw delErr;
        } else if (typeof delQuery?.eq === 'function') {
          for (const obsoleteId of obsoleteIds) {
            await supabase.from('deposit_transactions').delete().eq('id', obsoleteId);
          }
        }
      }

      // 2. Sisipkan HANYA bulan tercentang yang belum tercatat di database (guard idempoten)
      const keysToInsert = safeKeys.filter((key) => !existingRoutineByKey.has(key));
      const txsToInsert = keysToInsert.map(key => {
        const [yStr, mStr] = key.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const rate = getEffectiveCellRate(activeTab, y, m);
        const amt = customAmounts ? (customAmounts.get(key) ?? rate) : rate;
        const isPartial = amt < rate && amt > 0;
        return {
          member_deposit_id: memberDepositId,
          amount: amt,
          for_month: m,
          for_year: y,
          transaction_type: 'deposit',
          description: isPartial
            ? 'Rekonsiliasi Otomatis (Setoran Parsial)'
            : `Setoran Matriks ${activeTab} ${MONTH_NAMES[m - 1]} ${y}`
        };
      });

      const insertedSum = txsToInsert.reduce(
        (sum: number, tx: any) => sum + Number(tx.amount || 0),
        0
      );

      if (txsToInsert.length > 0) {
        const { error: insErr } = await supabase.from('deposit_transactions').insert(txsToInsert);
        if (insErr) throw insErr;
        await syncMatrixDepositsToCashFlow().catch(() => {});
      }

      if (insertedSum !== removedSum) {
        setDbBalances(prev => {
          const nextBal = (prev[activeTab] || 0) + insertedSum - removedSum;
          baselineBalancesRef.current[activeTab] = nextBal;
          return { ...prev, [activeTab]: nextBal };
        });
      }

      onSuccess?.();
    } catch (err) {
      console.error('Failed to sync batch to database:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Quick Action 1: Centang Semua s/d Bulan Ini (mulai setelah cut-off jika mode cut-off aktif)
  const handleCheckAllUpToNow = async () => {
    const now = new Date();
    const nowYear = now.getFullYear();
    const nowMonth = now.getMonth() + 1;

    const matchedKeys: string[] = [];
    const updatedAmounts = new Map(currentMonthAmounts);
    for (const m of allGridMonths) {
      if (isMonthBeforeJoin(m.year, m.month, resolvedJoinDate)) {
        continue;
      }
      if (isMonthBeforeCutOff(m.year, m.month, cutoffDate)) {
        continue;
      }
      if (m.year < nowYear || (m.year === nowYear && m.month <= nowMonth)) {
        matchedKeys.push(m.key);
        if (!currentCheckedSet.has(m.key) || !updatedAmounts.has(m.key)) {
          const rate = getEffectiveCellRate(activeTab, m.year, m.month);
          updatedAmounts.set(m.key, rate);
        }
      }
    }

    setCheckedMonths(prev => ({
      ...prev,
      [activeTab]: new Set(matchedKeys)
    }));
    setMonthAmounts(prev => ({
      ...prev,
      [activeTab]: updatedAmounts
    }));

    await syncBatchToDatabase(matchedKeys, updatedAmounts);
  };

  // Quick Action 2: Batal Centang Semua (Lindungi Saldo Awal, Penarikan, & Baseline Balance)
  const handleUncheckAll = async () => {
    const currentBaseline = baselineBalancesRef.current[activeTab] || dbBalances[activeTab] || 0;

    // 1. Kosongkan state centang lokal (hanya centang pasca saldo awal): Total Tercentang = 0
    setCheckedMonths(prev => ({
      ...prev,
      [activeTab]: new Set()
    }));
    setMonthAmounts(prev => ({
      ...prev,
      [activeTab]: new Map()
    }));

    // 2. Pertahankan Saldo Database yang mencerminkan Saldo Awal - Penarikan (Saldo Awal TIDAK BOLEH menjadi 0!)
    const expectedRemainingBalance = hasCutoffMode
      ? currentOpeningBalance - currentWithdrawals
      : Math.max(currentBaseline, currentOpeningBalance);
    baselineBalancesRef.current[activeTab] = expectedRemainingBalance;
    setDbBalances(prev => ({
      ...prev,
      [activeTab]: expectedRemainingBalance
    }));

    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) return;

    setSyncing(true);
    try {
      const effectiveCutoff = hasCutoffMode ? cutoffDate : null;
      let deletableTxs: any[] = [];
      let deletableIds: string[] = [];

      const dtTable: any = supabase?.from?.('deposit_transactions');
      if (dtTable && typeof dtTable.select === 'function') {
        const selQ: any = dtTable.select('id, amount, for_year, for_month, transaction_type, description');
        if (selQ && typeof selQ.eq === 'function') {
          const res: any = await selQ.eq('member_deposit_id', memberDepositId);
          const rows = Array.isArray(res?.data) ? res.data : [];
          deletableTxs = rows.filter(
            (t: any) => !isProtectedSavingsTransaction(t, effectiveCutoff)
          );
          deletableIds = deletableTxs
            .map((t: any) => String(t?.id || ''))
            .filter(Boolean);
        }
      }

      if (deletableIds.length > 0) {
        await recordMatrixCancellationReversalsForTxs({
          memberDepositId,
          txs: deletableTxs,
          reason: 'Batal Centang Semua (Matriks Simpanan)',
          memberNrp,
          memberName,
          depositTypeName: resolveActiveDepositTypeName()
        });

        const delQuery: any = supabase.from('deposit_transactions').delete();
        if (typeof delQuery?.in === 'function') {
          const { error: delErr } = await delQuery.in('id', deletableIds);
          if (delErr) throw delErr;
        } else if (typeof delQuery?.eq === 'function') {
          for (const delId of deletableIds) {
            await supabase.from('deposit_transactions').delete().eq('id', delId);
          }
        }
      }

      onSuccess?.();
    } catch (err) {
      console.error('Failed to uncheck all months and preserve baseline balance:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Format tampilan tanggal bergabung
  const formattedJoinDate = useMemo(() => {
    if (!resolvedJoinDate) return '-';
    const d = new Date(resolvedJoinDate);
    if (isNaN(d.getTime())) return '-';
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }, [resolvedJoinDate]);

  // Format tampilan tanggal pengesahan saldo awal (cut-off)
  const formattedCutoffDate = useMemo(() => {
    if (parsedCutoffInfo?.formattedDate) return parsedCutoffInfo.formattedDate;
    if (cutoffDate) return cutoffDate;
    if (formattedJoinDate && formattedJoinDate !== '-') return formattedJoinDate;
    return `1 Jan ${startYear}`;
  }, [parsedCutoffInfo, cutoffDate, formattedJoinDate, startYear]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-sm">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-800">Buku Besar Matriks Simpanan (Checkbox Grid)</h2>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full border border-emerald-300">
                  Real-time
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Pencocokan mutasi setoran simpanan rutin per bulan dengan nominal tarif aktif bertingkat.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Member Profile Bar */}
        <div className="px-6 py-3.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">Anggota: </span>
                <span className="font-bold text-slate-800">{memberName}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">NRP: </span>
                <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                  {memberNrp}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <div>
                <span className="text-slate-500">Tgl Bergabung: </span>
                <span className="font-semibold text-slate-700">{formattedJoinDate}</span>
              </div>
            </div>
          </div>

          {/* Saldo Comparison Header Bar */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
            {hasCutoffMode ? (
              <>
                <div className="flex items-center gap-1.5 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="text-[11px] text-indigo-700">
                    {parsedCutoffInfo && (parsedCutoffInfo.year !== 2026 || parsedCutoffInfo.month !== 3)
                      ? `Saldo Awal (Cut-Off ${parsedCutoffInfo.formattedDate}):`
                      : 'Saldo Awal Cut-Off (Per Mar-26):'}
                  </span>
                  <span className="font-bold text-indigo-900 font-mono text-xs">{formatCurrency(currentOpeningBalance)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500">Total Tercentang (Pasca Saldo Awal): </span>
                  <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(totalChecked)}</span>
                </div>
                {currentWithdrawals > 0 && (
                  <div>
                    <span className="text-[11px] text-rose-600">Penarikan/Pencairan: </span>
                    <span className="font-bold text-rose-700 font-mono text-xs" data-testid="modal-total-withdrawals">
                      -{formatCurrency(currentWithdrawals)}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-[11px] text-slate-500">Total Akumulasi Simpanan: </span>
                  <span className="font-bold text-emerald-700 font-mono text-xs">{formatCurrency(totalAccumulation)}</span>
                </div>
                <span className="text-slate-300">vs</span>
                <div>
                  <span className="text-[11px] text-slate-500">Saldo Database: </span>
                  <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(targetDbBalance)}</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[11px] text-slate-500">Total Tercentang: </span>
                  <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(totalChecked)}</span>
                </div>
                <span className="text-slate-300">vs</span>
                <div>
                  <span className="text-[11px] text-slate-500">Saldo Database: </span>
                  <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(targetDbBalance)}</span>
                </div>
              </>
            )}
            <div className="ml-1">
              {isBalanced ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Sesuai / Seimbang
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsDiffModalOpen(true)}
                  title="Klik untuk melihat rincian faktor penyebab selisih"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
                >
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                  <span>
                    Selisih {formatCurrency(Math.abs(balanceDifference))}{' '}
                    {(hasCutoffMode ? totalAccumulation : totalChecked) === 0 && targetDbBalance > 0
                      ? '(Belum Dialokasikan)'
                      : `(${balanceDifference > 0 ? 'Lebih' : 'Kurang'})`}
                  </span>
                  <span className="text-[10px] bg-amber-200/70 text-amber-900 px-1.5 py-0.5 rounded-full font-medium ml-1">
                    Lihat Faktor ↗
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-3 bg-slate-100/60 border-b border-slate-200 flex items-center justify-between">
          <div className="flex gap-2">
            {(
              [
                { code: 'WAJIB', label: 'Simpanan Wajib' },
                { code: 'BELANJA', label: 'Simpanan Belanja' },
                { code: 'LEBARAN', label: 'Simpanan Lebaran' }
              ] as const
            ).map(tab => (
              <button
                key={tab.code}
                onClick={() => setActiveTab(tab.code)}
                className={`px-4 py-2 text-xs font-semibold rounded-t-xl transition-colors border-t border-x ${
                  activeTab === tab.code
                    ? 'bg-white text-emerald-700 border-slate-200 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/50'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Actions Toolbar */}
          <div className="flex items-center gap-2 pb-2">
            <button
              onClick={handleCheckAllUpToNow}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              Centang Semua s/d Bulan Ini
            </button>
            <button
              onClick={handleUncheckAll}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium shadow-sm transition-colors disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5" />
              Batal Centang Semua
            </button>
          </div>
        </div>

        {/* Modal Main Content: Horizontal Checkbox Grid */}
        <div className="flex-1 overflow-auto p-6 bg-slate-50/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              <p className="text-sm text-slate-500 font-medium">Memuat data matriks buku besar simpanan...</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              
              {/* Petunjuk Tarif */}
              <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {cutoffDate
                      ? `Grid Buku Besar Simpanan (Mulai Cut-Off ${formattedCutoffDate})`
                      : `Grid Buku Besar Simpanan (${startYear} – ${endYear})`}
                  </span>
                  {activeTab === 'LEBARAN' && (
                    <div className="flex flex-wrap items-center gap-2" data-testid="member-lebaran-rate-bar">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          activeLebaranRateInfo.isPersonal
                            ? 'bg-purple-100 text-purple-800 border-purple-300'
                            : 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                      >
                        <Sparkles className="w-3 h-3 shrink-0" />
                        {activeLebaranRateInfo.isPersonal && activeLebaranRateInfo.matchedPersonal
                          ? `${formatCurrency(activeLebaranRateInfo.rate)}/bln • Ketentuan Pribadi Anggota (Berlaku sejak ${getIndonesianMonthLabel(
                              activeLebaranRateInfo.matchedPersonal.effective_month
                            )} ${activeLebaranRateInfo.matchedPersonal.effective_year})`
                          : `${formatCurrency(activeLebaranRateInfo.rate)}/bln • Mengikuti Tarif Global Pengaturan`}
                      </span>
                      <button
                        type="button"
                        data-testid="btn-edit-personal-lebaran-rate"
                        onClick={() => setIsLebaranRateModalOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        <Sparkles className="w-3 h-3" />
                        Ubah Tarif Lebaran Pribadi
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap" data-testid="legend-rate-tiers">
                  <span className="text-[11px] text-slate-400">Keterangan Badge Tarif Aktif:</span>
                  {activeTabRateTiers && activeTabRateTiers.length > 0 ? (
                    activeTabRateTiers.map((tier, idx) => {
                      const rateNum = Number(tier.monthly_rate ?? (tier as any).monthly_amount ?? 0);
                      const rateK = rateNum >= 1000
                        ? `Rp ${(rateNum / 1000).toLocaleString('id-ID')}k`
                        : `Rp ${rateNum.toLocaleString('id-ID')}`;

                      const startLabel = `${getMonthName(tier.start_month)} ${tier.start_year}`;
                      const periodText = tier.end_year && tier.end_month
                        ? `(${startLabel} - ${getMonthName(tier.end_month)} ${tier.end_year})`
                        : `(Mulai ${startLabel})`;

                      const isCurrentActive = !tier.end_year;
                      return (
                        <span
                          key={tier.id || idx}
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            isCurrentActive
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-amber-50 border-amber-300 text-amber-800'
                          }`}
                        >
                          {rateK} {periodText}
                        </span>
                      );
                    })
                  ) : (() => {
                    const fallbackRate = rateResolver.getRateForPeriod(activeTab, currentCalYear, currentCalMonth);
                    return (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 border border-emerald-300 text-emerald-800">
                        {fallbackRate > 0 ? `${formatRateBadge(fallbackRate)} (Default Master Produk)` : 'Tarif belum diatur'}
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Table Grid Horizontal */}
              <div ref={scrollContainerRef} className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-100 z-10 py-2.5 px-3 text-left border-r border-slate-200 min-w-[130px]">
                        Tahun &amp; Item
                      </th>
                      <th
                        data-testid="opening-balance-col-header"
                        className="px-4 py-3 text-center bg-indigo-50/80 border-r border-slate-200 min-w-[150px]"
                      >
                        <div className="text-xs font-bold text-indigo-900">Saldo Awal</div>
                        <div className="text-[10px] font-medium text-indigo-600">
                          Sah per {formattedCutoffDate}
                        </div>
                      </th>
                      {timelineMonths.map(m => {
                        const isCurrentMonth = m.year === currentCalYear && m.month === currentCalMonth;
                        return (
                          <th
                            key={m.key}
                            ref={isCurrentMonth ? currentMonthColRef : null}
                            data-testid={isCurrentMonth ? 'current-month-col' : undefined}
                            className={`py-2.5 px-2 border-r border-slate-200 min-w-[76px] whitespace-nowrap transition-colors ${
                              isCurrentMonth
                                ? 'bg-emerald-50/80 ring-2 ring-inset ring-emerald-500 font-extrabold text-emerald-950'
                                : ''
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center gap-0.5">
                              <div>{m.label}</div>
                              {isCurrentMonth && (
                                <span className="inline-block px-1 py-0.2 text-[9px] font-bold rounded bg-emerald-600 text-white uppercase tracking-wider">
                                  Bulan Ini
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hover:bg-slate-50/60 transition-colors">
                      <td className="sticky left-0 bg-white z-10 py-4 px-3 text-left font-semibold text-slate-800 border-r border-b border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                        <div>
                          <span>Setoran Rutin</span>
                          <div className="text-[10px] text-slate-400 font-normal">Centang jika lunas</div>
                        </div>
                      </td>

                      <td
                        data-testid="opening-balance-col-cell"
                        className="px-4 py-4 text-center bg-indigo-50/40 border-r border-b border-slate-200"
                      >
                        <div className="text-sm font-extrabold text-indigo-900">
                          Rp {Number(currentOpeningBalance || 0).toLocaleString('id-ID')}
                        </div>
                        <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                          Akumulasi Lampau Sah
                        </div>
                      </td>

                      {timelineMonths.map(m => {
                        const beforeJoin = !cutoffDate && isMonthBeforeJoin(m.year, m.month, resolvedJoinDate);
                        const isChecked = currentCheckedSet.has(m.key);
                        const rate = getEffectiveCellRate(activeTab, m.year, m.month);
                        const txAmount = currentMonthAmounts.get(m.key);
                        const isPartial = isChecked && typeof txAmount === 'number' && txAmount > 0 && txAmount < rate;
                        const isPersonalLebaran =
                          activeTab === 'LEBARAN' &&
                          resolveMemberLebaranRateInfo(memberId, m.year, m.month, {
                            globalTiers: rateTiers,
                            depositTypes,
                            memberLebaranRates
                          }).isPersonal;
                        const badgeClass = isPartial
                          ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                          : isPersonalLebaran
                          ? 'bg-purple-100 text-purple-800 border-purple-300'
                          : getBadgeColorClass(activeTab, m.year, m.month, rate, rateTiers);
                        const badgeLabel = isPartial
                          ? `Parsial: Rp ${Number(txAmount).toLocaleString('id-ID')} / ${Number(rate).toLocaleString('id-ID')}`
                          : formatRateBadge(rate);
                        const isCurrentMonth = m.year === currentCalYear && m.month === currentCalMonth;

                        if (beforeJoin) {
                          return (
                            <td
                              key={m.key}
                              className={`py-3 px-1 border-r border-b border-slate-100 bg-slate-50 text-slate-300 font-mono text-sm align-middle select-none ${
                                isCurrentMonth ? 'ring-1 ring-inset ring-emerald-400/30' : ''
                              }`}
                              title="Sebelum tanggal bergabung anggota"
                            >
                              -
                            </td>
                          );
                        }

                        return (
                          <td
                            key={m.key}
                            className={`py-3 px-1 border-r border-b border-slate-100 align-middle transition-colors ${
                              isCurrentMonth ? 'ring-1 ring-inset ring-emerald-400/40' : ''
                            } ${
                              isPartial
                                ? 'bg-amber-50/50'
                                : isChecked
                                ? 'bg-emerald-50/40'
                                : isCurrentMonth
                                ? 'bg-emerald-50/20'
                                : 'bg-white'
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <div className="flex items-center gap-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => handleToggleMonth(m.year, m.month, m.key, m.label)}
                                  className={`w-4 h-4 rounded cursor-pointer transition-transform hover:scale-110 ${
                                    isPartial
                                      ? 'text-amber-600 accent-amber-600 border-amber-400 focus:ring-amber-500'
                                      : 'text-emerald-600 accent-emerald-600 border-slate-300 focus:ring-emerald-500'
                                  }`}
                                  aria-label={`Checkbox ${m.label}`}
                                  title={
                                    isPartial
                                      ? `Parsial: Rp ${Number(txAmount).toLocaleString('id-ID')} dari Rp ${Number(rate).toLocaleString('id-ID')}`
                                      : isChecked
                                      ? `Tercentang (${m.label}). Klik untuk membatalkan setoran.`
                                      : `Belum disetor. Klik untuk input bukti setoran (${m.label}).`
                                  }
                                  data-testid={isPartial ? `partial-checkbox-${m.key}` : `checkbox-${m.key}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleOpenHistoryModal(m.year, m.month, m.label)}
                                  className="p-0.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                                  title={`Riwayat Audit & Bukti (${m.label})`}
                                  data-testid={`history-btn-${m.key}`}
                                  aria-label={`Riwayat Audit ${m.label}`}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded border leading-none font-mono ${badgeClass} ${
                                  isPartial ? 'whitespace-nowrap shadow-2xs font-bold text-amber-900 bg-amber-100 border-amber-300' : 'font-semibold'
                                }`}
                                title={
                                  isPartial
                                    ? `Setoran Parsial: Rp ${Number(txAmount).toLocaleString('id-ID')} dari kewajiban Rp ${Number(rate).toLocaleString('id-ID')} (Kurang Rp ${Number(rate - txAmount).toLocaleString('id-ID')})`
                                    : undefined
                                }
                                data-testid={isPartial ? `partial-badge-${m.key}` : undefined}
                              >
                                {badgeLabel}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500">
            Perubahan checkbox langsung disimpan secara otomatis ke database (mutasi mutlak per bulan).
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-medium rounded-xl transition-colors shadow-sm"
          >
            Tutup
          </button>
        </div>

      </div>

      {/* Modal Dialog 1: Form Bukti Setoran (Evidence Input) */}
      {evidenceModalOpen && selectedCellForEvidence && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div data-testid="evidence-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Dokumentasi Bukti Setoran</h3>
                  <p className="text-xs text-slate-500">
                    {activeTab} • Periode {selectedCellForEvidence.label}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setEvidenceModalOpen(false);
                  setSelectedCellForEvidence(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                data-testid="evidence-cancel-x-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEvidence} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Setoran (Rp) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  data-testid="evidence-amount-input"
                  value={evidenceAmount}
                  onChange={e => setEvidenceAmount(Number(e.target.value))}
                  min={1}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                />
                <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1">
                  <span>Tarif Standar: {formatCurrency(selectedCellForEvidence.rate)}</span>
                  {evidenceAmount < selectedCellForEvidence.rate && evidenceAmount > 0 && (
                    <span className="text-amber-600 font-medium">Setoran Parsial / Kurang Bayar</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Bukti / Kwitansi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  data-testid="evidence-ref-input"
                  value={evidenceReferenceNo}
                  onChange={e => setEvidenceReferenceNo(e.target.value)}
                  placeholder="Contoh: KW-2026/11/01"
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Metode Pembayaran <span className="text-rose-500">*</span>
                </label>
                <select
                  data-testid="evidence-method-select"
                  value={evidencePaymentMethod}
                  onChange={e => setEvidencePaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none bg-white transition-colors"
                >
                  <option value="tunai">Tunai / Kasir</option>
                  <option value="potong_gaji">Potong Gaji</option>
                  <option value="transfer">Transfer Bank</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <input
                  type="text"
                  data-testid="evidence-notes-input"
                  value={evidenceNotes}
                  onChange={e => setEvidenceNotes(e.target.value)}
                  placeholder="Keterangan transaksi atau rekonsiliasi..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceModalOpen(false);
                    setSelectedCellForEvidence(null);
                  }}
                  disabled={savingEvidence}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
                  data-testid="evidence-cancel-btn"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingEvidence}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  data-testid="evidence-submit-btn"
                >
                  {savingEvidence && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Simpan Setoran
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Dialog 2: Konfirmasi Pembatalan Centang (Uncheck) */}
      {uncheckModalOpen && selectedCellForUncheck && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div data-testid="uncheck-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100 bg-rose-50/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-600 text-white rounded-lg shadow-xs">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Konfirmasi Pembatalan Setoran</h3>
                  <p className="text-xs text-rose-700 font-medium">
                    Periode {selectedCellForUncheck.label} ({activeTab})
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setUncheckModalOpen(false);
                  setSelectedCellForUncheck(null);
                  setUncheckReason('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                data-testid="uncheck-cancel-x-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 leading-relaxed">
                <strong>Perhatian:</strong> Tindakan ini akan membatalkan centang dan menghapus mutasi transaksi setoran untuk periode ini. Baris setoran asli tetap dipertahankan dan sistem akan mencatat <strong>Jurnal Balik (Koreksi / Pembatalan)</strong> di Laporan Keuangan Arus Kas serta menyimpannya dalam <strong>Jejak Audit (Audit Logs)</strong>.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan Pembatalan <span className="text-rose-500">* (Wajib diisi, minimal 3 karakter)</span>
                </label>
                <textarea
                  data-testid="uncheck-reason-input"
                  rows={3}
                  minLength={3}
                  value={uncheckReason}
                  onChange={e => setUncheckReason(e.target.value)}
                  placeholder="Jelaskan alasan pembatalan centang (misal: Salah input bulan, koreksi nominal, atau mutasi ganda)..."
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none transition-colors"
                />
                {uncheckReason.trim().length > 0 && uncheckReason.trim().length < 3 && (
                  <p className="mt-1 text-[11px] font-medium text-rose-600">
                    Alasan pembatalan minimal 3 karakter.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setUncheckModalOpen(false);
                    setSelectedCellForUncheck(null);
                    setUncheckReason('');
                  }}
                  disabled={unchecking}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-slate-300"
                  data-testid="uncheck-cancel-btn"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUncheck}
                  disabled={uncheckReason.trim().length < 3 || unchecking}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  data-testid="uncheck-confirm-btn"
                >
                  {unchecking && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <Trash2 className="w-3.5 h-3.5" />
                  Konfirmasi Pembatalan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog 3: Penampil Riwayat Audit & Bukti Setoran */}
      {historyModalOpen && selectedCellForHistory && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div data-testid="history-modal" className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-xs">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Riwayat Audit &amp; Bukti Setoran</h3>
                  <p className="text-xs text-slate-500">
                    {activeTab} • Periode {selectedCellForHistory.label}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setHistoryModalOpen(false);
                  setSelectedCellForHistory(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                data-testid="history-modal-close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3" data-testid="history-item-list">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-2 text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                  <p className="text-xs">Memuat jejak audit periode...</p>
                </div>
              ) : displayedAuditHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Belum ada riwayat transaksi atau jejak perubahan untuk periode ini.
                </div>
              ) : (
                displayedAuditHistory.map((item, idx) => {
                  const isDelete = item.action === 'DELETE';
                  const isUpdate = item.action === 'UPDATE';
                  return (
                    <div
                      key={item.id || idx}
                      data-testid={`audit-item-${item.id || idx}`}
                      className={`p-3.5 rounded-xl border text-xs transition-colors ${
                        isDelete
                          ? 'bg-rose-50/50 border-rose-200'
                          : isUpdate
                          ? 'bg-amber-50/50 border-amber-200'
                          : 'bg-emerald-50/50 border-emerald-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isDelete
                                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                : isUpdate
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            {isDelete ? 'Pembatalan' : isUpdate ? 'Penyesuaian' : 'Setoran Aktif'}
                          </span>
                          <span className="font-semibold text-slate-700">
                            {item.performerName || 'Pengelola'}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(item.createdAt).toLocaleString('id-ID', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-slate-600 bg-white/70 p-2.5 rounded-lg border border-slate-200/60 mb-1.5">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Nominal:</span>
                          <span className="font-mono font-bold text-slate-800">
                            {item.amount !== undefined ? formatCurrency(item.amount) : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">No. Kwitansi / Referensi:</span>
                          <span className="font-mono font-semibold text-slate-800">
                            {item.referenceNo || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Metode Bayar:</span>
                          <span className="capitalize font-medium text-slate-700">
                            {item.paymentMethod ? item.paymentMethod.replace('_', ' ') : '-'}
                          </span>
                        </div>
                      </div>

                      {item.notes && (
                        <div className="mt-1 text-slate-600">
                          <span className="text-[10px] text-slate-400 block">
                            {isDelete ? 'Alasan Pembatalan:' : 'Catatan:'}
                          </span>
                          <p className="font-medium text-slate-700 italic bg-white/50 px-2 py-1 rounded border border-slate-200/50">
                            "{item.notes}"
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setHistoryModalOpen(false);
                  setSelectedCellForHistory(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Drill-Down Faktor Selisih Simpanan */}
      {isDiffModalOpen && (
        <SavingsDifferenceAuditModal
          isOpen={isDiffModalOpen}
          onClose={() => setIsDiffModalOpen(false)}
          memberId={memberId}
          memberNrp={memberNrp}
          memberName={memberName}
          depositTypeCode={activeTab}
          memberDepositId={memberDepositMap[activeTab]}
          totalChecked={hasCutoffMode ? currentOpeningBalance + totalChecked : totalChecked}
          dbBalance={targetDbBalance}
          difference={balanceDifference}
        />
      )}

      {/* Modal Pengaturan Simpanan Lebaran Pribadi */}
      {isLebaranRateModalOpen && (
        <MemberLebaranRateModal
          isOpen={isLebaranRateModalOpen}
          onClose={() => setIsLebaranRateModalOpen(false)}
          member={{
            id: memberId,
            nrp: memberNrp,
            nama: memberName
          }}
          onSuccess={async () => {
            const refreshedRates = await getMemberLebaranRates(memberId, true).catch(() => [] as MemberLebaranRate[]);
            setMemberLebaranRates(refreshedRates);
            onSuccess?.();
          }}
        />
      )}

    </div>
  );
}
