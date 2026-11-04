import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  CheckSquare,
  Square,
  RotateCcw,
  Calendar,
  User,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import {
  getRateTiers,
  getApplicableRate,
  SavingsRateTier,
  DEFAULT_RATE_TIERS
} from '../../services/savingsRateService';
import {
  reconcileSingleMemberDeposit,
  calculateTotalChecked,
  calculateFifoAllocation,
  matchAutomaticFifo
} from '../../services/savingsMatrixService';
import { formatCurrency } from '../../utils/formatCurrency';

export type DepositTabType = 'WAJIB' | 'BELANJA' | 'LEBARAN';

export interface SavingsLedgerMatrixModalProps {
  memberId: string;
  memberNrp: string;
  memberName: string;
  joinDate?: string | null;
  onClose: () => void;
  onSuccess?: () => void;
  initialActiveTab?: DepositTabType;
  initialDbBalances?: Partial<Record<DepositTabType, number>>;
  initialCheckedMonths?: Partial<Record<DepositTabType, string[]>>;
  initialMonthAmounts?: Partial<Record<DepositTabType, Record<string, number> | Map<string, number>>>;
  initialLoading?: boolean;
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
  _rate: number
): string {
  const code = (depositTypeCode || '').toUpperCase();
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
 * Menghasilkan daftar bulan dalam format grid terurut kronologis
 */
export function generateMonthGrid(
  startYear: number,
  endYear: number
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
  return list;
}

export {
  calculateTotalChecked,
  calculateFifoAllocation,
  matchAutomaticFifo
};

export default function SavingsLedgerMatrixModal({
  memberId,
  memberNrp,
  memberName,
  joinDate,
  onClose,
  onSuccess,
  initialActiveTab = 'WAJIB',
  initialDbBalances,
  initialCheckedMonths,
  initialMonthAmounts,
  initialLoading
}: SavingsLedgerMatrixModalProps) {
  const [activeTab, setActiveTab] = useState<DepositTabType>(initialActiveTab);
  const [loading, setLoading] = useState(initialLoading ?? true);
  const [syncing, setSyncing] = useState(false);
  const [rateTiers, setRateTiers] = useState<SavingsRateTier[]>(DEFAULT_RATE_TIERS);

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

  // Hitung rentang tahun untuk grid
  const { startYear, endYear, allGridMonths } = useMemo(() => {
    let sYear = 2024;
    if (resolvedJoinDate) {
      const d = new Date(resolvedJoinDate);
      if (!isNaN(d.getTime())) {
        sYear = Math.min(2024, d.getFullYear());
      }
    }
    const currentYear = new Date().getFullYear();
    const eYear = Math.max(2026, currentYear);
    const months = generateMonthGrid(sYear, eYear);
    return { startYear: sYear, endYear: eYear, allGridMonths: months };
  }, [resolvedJoinDate]);

  // Load tiers, member deposit accounts, and existing transactions
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setLoading(true);
      try {
        // 1. Ambil rate tiers
        const tiers = await getRateTiers(undefined, false);
        if (isMounted) {
          setRateTiers(tiers && tiers.length > 0 ? tiers : DEFAULT_RATE_TIERS);
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
        const { data: dTypes } = await supabase.from('deposit_types').select('id, name, code');
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

            // Cari mutasi migrasi/saldo awal atau penampung saldo belum teralokasi
            const migrationTx = txs.find((t: any) => {
              const d = (t.description || '').toLowerCase();
              return (
                d.includes('migra') ||
                d.includes('saldo awal') ||
                d.includes('historical') ||
                d.includes('one-time') ||
                d.includes('belum teralokasi')
              );
            });

            let net = 0;
            for (const t of txs) {
              const amt = Number(t.amount || 0);
              if (t.transaction_type === 'withdrawal') net -= amt;
              else net += amt;
            }

            const migrationAmt = migrationTx ? Number(migrationTx.amount || 0) : 0;
            const computedBalance = Math.max(
              migrationAmt,
              net,
              baselineBalancesRef.current[tab] || 0,
              initialDbBalances?.[tab] || 0
            );

            if (computedBalance > 0) {
              newDbBalances[tab] = computedBalance;
              baselineBalancesRef.current[tab] = computedBalance;
            }

            // Ambil bulan-bulan yang tercentang dari deposit_transactions beserta nominal riilnya
            for (const t of txs) {
              if (t.transaction_type === 'deposit' && t.for_year && t.for_month) {
                const desc = (t.description || '').toLowerCase();
                // Abaikan transaksi saldo awal/penampung belum teralokasi jika tidak mencerminkan setoran bulanan
                const isLumpSumMigration =
                  (desc.includes('migrasi saldo awal (as-is)') && t.amount > 200000) ||
                  desc.includes('belum teralokasi');
                if (!isLumpSumMigration) {
                  const key = `${t.for_year}-${String(t.for_month).padStart(2, '0')}`;
                  newCheckedMonths[tab].add(key);
                  newMonthAmounts[tab].set(key, Number(t.amount || 0));
                }
              }
            }
          }
        }

        if (isMounted) {
          setMemberDepositMap(map);
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
    return calculateTotalChecked(currentCheckedSet, activeTab, rateTiers, currentMonthAmounts);
  }, [currentCheckedSet, activeTab, rateTiers, currentMonthAmounts]);

  const targetDbBalance = dbBalances[activeTab] || 0;
  const balanceDifference = totalChecked - targetDbBalance;
  const isBalanced = balanceDifference === 0;

  // Handler toggle satu cell checkbox
  const handleToggleMonth = async (year: number, month: number, key: string) => {
    const isCurrentlyChecked = currentCheckedSet.has(key);
    const updatedSet = new Set(currentCheckedSet);
    const updatedAmounts = new Map(currentMonthAmounts);
    const applicableRate = getApplicableRate(activeTab, year, month, rateTiers);

    if (isCurrentlyChecked) {
      updatedSet.delete(key);
      updatedAmounts.delete(key);
    } else {
      updatedSet.add(key);
      updatedAmounts.set(key, applicableRate);
    }

    // Optimistic UI update
    setCheckedMonths(prev => ({
      ...prev,
      [activeTab]: updatedSet
    }));
    setMonthAmounts(prev => ({
      ...prev,
      [activeTab]: updatedAmounts
    }));

    // Real-time Supabase sync
    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) {
      console.warn(`member_deposit_id not found for ${activeTab}`);
      return;
    }

    try {
      if (isCurrentlyChecked) {
        // Hapus mutasi transaksi setoran untuk bulan & tahun ini
        await supabase
          .from('deposit_transactions')
          .delete()
          .eq('member_deposit_id', memberDepositId)
          .eq('for_month', month)
          .eq('for_year', year)
          .eq('transaction_type', 'deposit');
      } else {
        // Masukkan mutasi transaksi baru
        await supabase
          .from('deposit_transactions')
          .insert([{
            member_deposit_id: memberDepositId,
            amount: applicableRate,
            for_month: month,
            for_year: year,
            transaction_type: 'deposit',
            description: `Setoran Matriks ${activeTab} ${MONTH_NAMES[month - 1]} ${year}`
          }]);
      }
      onSuccess?.();
    } catch (err) {
      console.error('Failed to sync checkbox toggle with database:', err);
    }
  };

  // Helper sinkronisasi batch ke Supabase
  const syncBatchToDatabase = async (newCheckedKeys: string[], customAmounts?: Map<string, number>) => {
    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) return;

    setSyncing(true);
    try {
      // 1. Hapus transaksi rutin bulanan lama pada rentang tahun grid (kecuali saldo awal migrasi)
      const deleteQuery = supabase
        .from('deposit_transactions')
        .delete()
        .eq('member_deposit_id', memberDepositId)
        .gte('for_year', startYear)
        .lte('for_year', endYear)
        .eq('transaction_type', 'deposit');

      if (typeof (deleteQuery as any).neq === 'function') {
        await (deleteQuery as any).neq('description', 'Migrasi Saldo Awal (As-Is)');
      } else {
        await deleteQuery;
      }

      // Hapus transaksi gelondongan awal migrasi / penampung belum teralokasi (for_month IS NULL)
      // dari tabel deposit_transactions saat rincian bulanan dibentuk agar tidak terhitung ganda
      if (newCheckedKeys.length > 0) {
        try {
          const delQuery: any = supabase.from('deposit_transactions').delete();
          if (typeof delQuery.eq === 'function') {
            const eqQuery = delQuery.eq('member_deposit_id', memberDepositId);
            if (eqQuery && typeof eqQuery.is === 'function') {
              const isQuery = eqQuery.is('for_month', null);
              if (isQuery && typeof isQuery.ilike === 'function') {
                await isQuery.ilike('description', '%');
              } else if (isQuery && typeof isQuery.then === 'function') {
                await isQuery;
              }
            } else if (eqQuery && typeof eqQuery.then === 'function') {
              await eqQuery;
            }
          }
        } catch (delBulkErr) {
          console.warn('Gagal menghapus transaksi migrasi/penampung di modal:', delBulkErr);
        }
      }

      // 2. Insert transaksi untuk seluruh bulan yang baru dicentang
      const txsToInsert = newCheckedKeys.map(key => {
        const [yStr, mStr] = key.split('-');
        const y = parseInt(yStr, 10);
        const m = parseInt(mStr, 10);
        const rate = getApplicableRate(activeTab, y, m, rateTiers);
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

      if (txsToInsert.length > 0) {
        await supabase.from('deposit_transactions').insert(txsToInsert);
      }

      onSuccess?.();
    } catch (err) {
      console.error('Failed to sync batch to database:', err);
    } finally {
      setSyncing(false);
    }
  };

  // Quick Action 1: Centang Semua s/d Bulan Ini
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
      if (m.year < nowYear || (m.year === nowYear && m.month <= nowMonth)) {
        matchedKeys.push(m.key);
        const rate = getApplicableRate(activeTab, m.year, m.month, rateTiers);
        updatedAmounts.set(m.key, rate);
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

  // Quick Action 2: Cocokkan Otomatis dengan Saldo Impor (FIFO Matching)
  const handleAutoMatchWithImportBalance = async () => {
    const currentBaseline = baselineBalancesRef.current[activeTab] || dbBalances[activeTab] || 0;
    setSyncing(true);
    try {
      const res = await reconcileSingleMemberDeposit(memberId, activeTab, {
        rateTiers,
        joinDate: resolvedJoinDate,
        startYear,
        endYear,
        targetBalance: currentBaseline
      });

      const updatedAmounts = new Map<string, number>();
      if (res.allocatedTransactions && res.allocatedTransactions.length > 0) {
        for (const tx of res.allocatedTransactions) {
          updatedAmounts.set(tx.key, tx.amount);
        }
      } else {
        for (const key of res.matchedKeys) {
          const [yStr, mStr] = key.split('-');
          const y = parseInt(yStr, 10);
          const m = parseInt(mStr, 10);
          updatedAmounts.set(key, getApplicableRate(activeTab, y, m, rateTiers));
        }
      }

      setCheckedMonths(prev => ({
        ...prev,
        [activeTab]: new Set(res.matchedKeys)
      }));
      setMonthAmounts(prev => ({
        ...prev,
        [activeTab]: updatedAmounts
      }));

      onSuccess?.();
    } catch (err) {
      console.error('Failed to auto reconcile with import balance:', err);
      // Fallback ke modal internal logic jika terjadi kegagalan
      const fifoRes = calculateFifoAllocation(
        currentBaseline,
        allGridMonths,
        activeTab,
        rateTiers,
        resolvedJoinDate,
        memberDepositMap[activeTab]
      );

      const fallbackAmounts = new Map<string, number>();
      for (const tx of fifoRes.allocatedTransactions) {
        fallbackAmounts.set(tx.key, tx.amount);
      }

      setCheckedMonths(prev => ({
        ...prev,
        [activeTab]: new Set(fifoRes.matchedKeys)
      }));
      setMonthAmounts(prev => ({
        ...prev,
        [activeTab]: fallbackAmounts
      }));

      await syncBatchToDatabase(fifoRes.matchedKeys, fallbackAmounts);
    } finally {
      setSyncing(false);
    }
  };

  // Quick Action 3: Batal Centang Semua (Preserve Baseline Balance)
  const handleUncheckAll = async () => {
    const currentBaseline = baselineBalancesRef.current[activeTab] || dbBalances[activeTab] || 0;

    // 1. Kosongkan state centang lokal: Total Tercentang = 0
    setCheckedMonths(prev => ({
      ...prev,
      [activeTab]: new Set()
    }));
    setMonthAmounts(prev => ({
      ...prev,
      [activeTab]: new Map()
    }));

    // 2. Pertahankan Saldo Database / baselineBalance agar TIDAK BOLEH menjadi 0!
    setDbBalances(prev => ({
      ...prev,
      [activeTab]: currentBaseline
    }));

    const memberDepositId = memberDepositMap[activeTab];
    if (!memberDepositId) return;

    setSyncing(true);
    try {
      // 3. Pada database: Hapus HANYA mutasi yang terikat pada bulan tertentu (for_month IS NOT NULL)
      const delRoutineQuery: any = supabase
        .from('deposit_transactions')
        .delete()
        .eq('member_deposit_id', memberDepositId);

      if (typeof delRoutineQuery.not === 'function') {
        await delRoutineQuery.not('for_month', 'is', null);
      } else if (typeof delRoutineQuery.neq === 'function') {
        await delRoutineQuery.neq('for_month', null);
      } else if (typeof delRoutineQuery.gte === 'function') {
        await delRoutineQuery.gte('for_year', startYear).lte('for_year', endYear);
      } else {
        await delRoutineQuery;
      }

      // Bersihkan penampung belum teralokasi / migrasi lama jika ada agar tidak terduplikasi
      const delUnallocatedQuery: any = supabase
        .from('deposit_transactions')
        .delete()
        .eq('member_deposit_id', memberDepositId);

      if (typeof delUnallocatedQuery.is === 'function') {
        const isQuery = delUnallocatedQuery.is('for_month', null);
        if (isQuery && typeof isQuery.ilike === 'function') {
          await isQuery.ilike('description', '%');
        } else if (isQuery && typeof isQuery.then === 'function') {
          await isQuery;
        }
      }

      // 4. Buat satu baris transaksi penampung saldo awal (dengan for_month = NULL
      // dan deskripsi 'Saldo Simpanan Belum Teralokasi') senilai saldo utuh anggota
      // agar query database tetap mengembalikan saldo riil
      if (currentBaseline > 0) {
        await supabase.from('deposit_transactions').insert([
          {
            member_deposit_id: memberDepositId,
            amount: currentBaseline,
            for_month: null,
            for_year: null,
            transaction_type: 'deposit',
            description: 'Saldo Simpanan Belum Teralokasi'
          }
        ]);
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
          <div className="flex items-center gap-3 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200">
            <div>
              <span className="text-[11px] text-slate-500">Total Tercentang: </span>
              <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(totalChecked)}</span>
            </div>
            <span className="text-slate-300">vs</span>
            <div>
              <span className="text-[11px] text-slate-500">Saldo Database: </span>
              <span className="font-bold text-slate-800 font-mono text-xs">{formatCurrency(targetDbBalance)}</span>
            </div>
            <div className="ml-1">
              {isBalanced ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Sesuai / Seimbang
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                  Selisih {formatCurrency(Math.abs(balanceDifference))}{' '}
                  {totalChecked === 0 && targetDbBalance > 0
                    ? '(Belum Dialokasikan)'
                    : `(${balanceDifference > 0 ? 'Lebih' : 'Kurang'})`}
                </span>
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
              onClick={handleAutoMatchWithImportBalance}
              disabled={syncing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Cocokkan Otomatis dengan Saldo Impor
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
                <span className="font-medium">
                  Grid Matriks Bulan ({startYear} – {endYear})
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-slate-400">Keterangan Badge Tarif Aktif:</span>
                  {activeTab === 'WAJIB' && (
                    <>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                        Rp 150k (s/d Okt 2025)
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Rp 200k (Mulai Nov 2025)
                      </span>
                    </>
                  )}
                  {activeTab === 'BELANJA' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">
                      Rp 25k (Standar)
                    </span>
                  )}
                  {activeTab === 'LEBARAN' && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                      Rp 50k (Standar)
                    </span>
                  )}
                </div>
              </div>

              {/* Table Grid Horizontal */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="sticky left-0 bg-slate-100 z-10 py-2.5 px-3 text-left border-r border-slate-200 min-w-[130px]">
                        Tahun &amp; Item
                      </th>
                      {allGridMonths.map(m => (
                        <th
                          key={m.key}
                          className="py-2.5 px-2 border-r border-slate-200 min-w-[76px] whitespace-nowrap"
                        >
                          <div>{m.label}</div>
                        </th>
                      ))}
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

                      {allGridMonths.map(m => {
                        const beforeJoin = isMonthBeforeJoin(m.year, m.month, resolvedJoinDate);
                        const isChecked = currentCheckedSet.has(m.key);
                        const rate = getApplicableRate(activeTab, m.year, m.month, rateTiers);
                        const txAmount = currentMonthAmounts.get(m.key);
                        const isPartial = isChecked && typeof txAmount === 'number' && txAmount > 0 && txAmount < rate;
                        const badgeClass = isPartial
                          ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                          : getBadgeColorClass(activeTab, m.year, m.month, rate);
                        const badgeLabel = isPartial
                          ? `Parsial: Rp ${Number(txAmount).toLocaleString('id-ID')} / ${Number(rate).toLocaleString('id-ID')}`
                          : formatRateBadge(rate);

                        if (beforeJoin) {
                          return (
                            <td
                              key={m.key}
                              className="py-3 px-1 border-r border-b border-slate-100 bg-slate-50 text-slate-300 font-mono text-sm align-middle select-none"
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
                              isPartial
                                ? 'bg-amber-50/50'
                                : isChecked
                                ? 'bg-emerald-50/40'
                                : 'bg-white'
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center gap-1.5">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleMonth(m.year, m.month, m.key)}
                                className={`w-4 h-4 rounded cursor-pointer transition-transform hover:scale-110 ${
                                  isPartial
                                    ? 'text-amber-600 accent-amber-600 border-amber-400 focus:ring-amber-500'
                                    : 'text-emerald-600 accent-emerald-600 border-slate-300 focus:ring-emerald-500'
                                }`}
                                aria-label={`Checkbox ${m.label}`}
                                title={
                                  isPartial
                                    ? `Parsial: Rp ${Number(txAmount).toLocaleString('id-ID')} dari Rp ${Number(rate).toLocaleString('id-ID')}`
                                    : undefined
                                }
                                data-testid={isPartial ? `partial-checkbox-${m.key}` : `checkbox-${m.key}`}
                              />
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
    </div>
  );
}
