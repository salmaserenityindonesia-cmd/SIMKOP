import { supabase } from '../lib/supabaseClient';
import {
  getRateTiers,
  getApplicableRate,
  SavingsRateTier,
  DEFAULT_RATE_TIERS
} from './savingsRateService';

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'
];

export const FULL_MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export interface BulkReconcileProgress {
  processed: number;
  total: number;
  currentMemberName?: string;
}

export interface BulkReconcileResult {
  success: boolean;
  totalMembers: number;
  totalSuccess: number;
  totalFailed: number;
  errors?: Array<{ memberId: string; memberName: string; error: string }>;
}

export interface BulkReconcileOptions {
  batchSize?: number;
  startYear?: number;
  endYear?: number;
}

export interface ReconcileSingleMemberOptions {
  rateTiers?: SavingsRateTier[];
  depTypes?: any[];
  joinDate?: string | null;
  startYear?: number;
  endYear?: number;
  memberDeposits?: any[];
}

export interface ReconcileSingleMemberResult {
  success: boolean;
  memberDepositId?: string;
  matchedKeys: string[];
  insertedCount: number;
  allocatedTransactions?: FifoAllocatedTransaction[];
  totalAllocated?: number;
}

export interface FifoAllocatedTransaction {
  member_deposit_id?: string;
  transaction_type: 'deposit';
  amount: number;
  for_month: number;
  for_year: number;
  description: string;
  key: string;
  applicableRate: number;
  isPartial: boolean;
}

export interface FifoAllocationResult {
  matchedKeys: string[];
  allocatedTransactions: FifoAllocatedTransaction[];
  totalAllocated: number;
  remainingBalance: number;
  partialTransaction?: FifoAllocatedTransaction;
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

/**
 * Menghitung total nominal dari bulan-bulan yang tercentang.
 * Mendukung override nominal parsial riil melalui parameter opsional customAmounts.
 */
export function calculateTotalChecked(
  checkedKeys: Iterable<string>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  customAmounts?: Map<string, number> | Record<string, number>
): number {
  let total = 0;
  for (const key of checkedKeys) {
    if (customAmounts) {
      const customAmt = customAmounts instanceof Map
        ? customAmounts.get(key)
        : customAmounts[key];
      if (typeof customAmt === 'number') {
        total += customAmt;
        continue;
      }
    }
    const [yStr, mStr] = key.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    if (!isNaN(y) && !isNaN(m)) {
      total += getApplicableRate(depositTypeCode, y, m, rateTiers);
    }
  }
  return total;
}

/**
 * Algoritma FIFO komprehensif: Mengalokasikan target saldo ke bulan-bulan kronologis
 * berurutan sesuai tarif aktif bertingkat.
 * Jika terdapat sisa saldo pecahan (remainingBalance < applicableRate && remainingBalance > 0),
 * sisa saldo tersebut dimasukkan ke slot kalender bulan berikutnya dengan status parsial
 * sehingga total alokasi persis seimbang dengan saldo database (selisih = 0).
 */
export function calculateFifoAllocation(
  targetBalance: number,
  months: Array<{ year: number; month: number; key: string }>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  joinDate?: string | Date | null,
  memberDepositId?: string
): FifoAllocationResult {
  if (targetBalance <= 0) {
    return {
      matchedKeys: [],
      allocatedTransactions: [],
      totalAllocated: 0,
      remainingBalance: 0
    };
  }

  let remaining = targetBalance;
  const matchedKeys: string[] = [];
  const allocatedTransactions: FifoAllocatedTransaction[] = [];

  // Urutkan bulan secara kronologis
  const sortedMonths = [...months].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));

  let nextCandidateMonth: { year: number; month: number; key: string } | null = null;
  let lastProcessedMonth: { year: number; month: number } | null = null;

  for (let i = 0; i < sortedMonths.length; i++) {
    const m = sortedMonths[i];
    if (isMonthBeforeJoin(m.year, m.month, joinDate)) {
      continue;
    }

    const rate = getApplicableRate(depositTypeCode, m.year, m.month, rateTiers);
    if (rate <= 0) continue;

    lastProcessedMonth = { year: m.year, month: m.month };

    if (remaining >= rate) {
      matchedKeys.push(m.key);
      allocatedTransactions.push({
        member_deposit_id: memberDepositId,
        transaction_type: 'deposit',
        amount: rate,
        for_month: m.month,
        for_year: m.year,
        description: `Setoran Matriks ${depositTypeCode} ${MONTH_NAMES[m.month - 1]} ${m.year}`,
        key: m.key,
        applicableRate: rate,
        isPartial: false
      });
      remaining -= rate;
    } else {
      // Saldo tidak mencukupi untuk bulan penuh ini, simpan slot bulan ini untuk alokasi sisa parsial
      nextCandidateMonth = m;
      break;
    }
  }

  let partialTransaction: FifoAllocatedTransaction | undefined;

  // Jika masih ada sisa saldo (remaining > 0), alokasikan ke bulan urutan berikutnya sebagai setoran parsial
  if (remaining > 0) {
    let nextYear: number;
    let nextMonth: number;
    let nextKey: string;

    if (nextCandidateMonth) {
      nextYear = nextCandidateMonth.year;
      nextMonth = nextCandidateMonth.month;
      nextKey = nextCandidateMonth.key;
    } else if (lastProcessedMonth) {
      nextYear = lastProcessedMonth.month === 12 ? lastProcessedMonth.year + 1 : lastProcessedMonth.year;
      nextMonth = lastProcessedMonth.month === 12 ? 1 : lastProcessedMonth.month + 1;
      nextKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
    } else {
      const firstValid = sortedMonths.find(m => !isMonthBeforeJoin(m.year, m.month, joinDate));
      if (firstValid) {
        nextYear = firstValid.year;
        nextMonth = firstValid.month;
        nextKey = firstValid.key;
      } else {
        const now = new Date();
        nextYear = now.getFullYear();
        nextMonth = now.getMonth() + 1;
        nextKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      }
    }

    const applicableRate = getApplicableRate(depositTypeCode, nextYear, nextMonth, rateTiers);

    partialTransaction = {
      member_deposit_id: memberDepositId,
      transaction_type: 'deposit',
      amount: remaining,
      for_month: nextMonth,
      for_year: nextYear,
      description: 'Rekonsiliasi Otomatis (Setoran Parsial)',
      key: nextKey,
      applicableRate,
      isPartial: true
    };

    allocatedTransactions.push(partialTransaction);
    matchedKeys.push(nextKey);
    remaining = 0;
  }

  const totalAllocated = allocatedTransactions.reduce((acc, tx) => acc + tx.amount, 0);

  return {
    matchedKeys,
    allocatedTransactions,
    totalAllocated,
    remainingBalance: remaining,
    partialTransaction
  };
}

/**
 * Algoritma FIFO: Mulai dari bulan awal yang valid (setelah tanggal bergabung),
 * centang berurutan ke bulan-bulan berikutnya dengan nominal tarif aktif periode tersebut.
 * Secara default (includePartial=true), menyertakan bulan berikutnya jika terdapat sisa saldo parsial.
 */
export function matchAutomaticFifo(
  targetBalance: number,
  months: Array<{ year: number; month: number; key: string }>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  joinDate?: string | Date | null,
  options?: { includePartial?: boolean }
): string[] {
  const includePartial = options?.includePartial ?? true;
  const res = calculateFifoAllocation(
    targetBalance,
    months,
    depositTypeCode,
    rateTiers,
    joinDate
  );
  if (!includePartial && res.partialTransaction) {
    return res.matchedKeys.filter(k => k !== res.partialTransaction?.key);
  }
  return res.matchedKeys;
}

/**
 * Mengidentifikasi tipe simpanan standar ('WAJIB', 'BELANJA', 'LEBARAN') dari objek deposit_types
 */
export function resolveDepositTypeCode(typeObj: any): 'WAJIB' | 'BELANJA' | 'LEBARAN' | null {
  if (!typeObj) return null;
  const actualObj = Array.isArray(typeObj) ? typeObj[0] : typeObj;
  const name = (actualObj?.name || '').toLowerCase();
  const code = (actualObj?.code || '').toUpperCase();

  if (code === 'WAJIB' || code === 'SW' || name.includes('wajib')) return 'WAJIB';
  if (code === 'BELANJA' || code === 'SB' || name.includes('belanja')) return 'BELANJA';
  if (code === 'LEBARAN' || code === 'SL' || name.includes('lebaran') || name.includes('hari raya')) return 'LEBARAN';
  return null;
}

/**
 * Melakukan rekonsiliasi FIFO otomatis saldo buku besar simpanan untuk satu anggota individual.
 * Logika ini identik dan selaras dengan aksi "Cocokkan Otomatis dengan Saldo Impor" pada modal buku besar individual.
 */
export async function reconcileSingleMemberDeposit(
  memberId: string,
  depositTypeCode: string,
  options?: ReconcileSingleMemberOptions
): Promise<ReconcileSingleMemberResult> {
  const rawType = (depositTypeCode || 'ALL').trim();
  const isAll = !rawType || rawType === 'ALL' || rawType.toLowerCase().includes('semua');

  // Jika ALL / SEMUA, proses WAJIB, BELANJA, dan LEBARAN secara berurutan
  if (isAll) {
    const subTypes: Array<'WAJIB' | 'BELANJA' | 'LEBARAN'> = ['WAJIB', 'BELANJA', 'LEBARAN'];
    let totalInserted = 0;
    const allKeys: string[] = [];
    let lastMdId: string | undefined;

    for (const st of subTypes) {
      const res = await reconcileSingleMemberDeposit(memberId, st, options);
      totalInserted += res.insertedCount;
      allKeys.push(...res.matchedKeys);
      if (res.memberDepositId) lastMdId = res.memberDepositId;
    }

    return {
      success: true,
      memberDepositId: lastMdId,
      matchedKeys: allKeys,
      insertedCount: totalInserted
    };
  }

  const resolved = resolveDepositTypeCode(rawType);
  const targetType = (resolved || rawType.toUpperCase()) as 'WAJIB' | 'BELANJA' | 'LEBARAN';

  // 1. Ambil master rate tiers jika tidak disediakan
  let rateTiers = options?.rateTiers;
  if (!rateTiers || rateTiers.length === 0) {
    try {
      rateTiers = await getRateTiers(undefined, false);
    } catch (err) {
      console.warn('Gagal memuat rate tiers via getRateTiers:', err);
    }

    if (!rateTiers || rateTiers.length === 0) {
      try {
        const { data: tiers } = await supabase
          .from('savings_rate_tiers')
          .select('*')
          .order('start_year', { ascending: true })
          .order('start_month', { ascending: true });
        if (tiers && tiers.length > 0) {
          rateTiers = tiers as any;
        }
      } catch (err) {
        console.warn('Gagal query savings_rate_tiers langsung:', err);
      }
    }

    if (!rateTiers || rateTiers.length === 0) {
      rateTiers = DEFAULT_RATE_TIERS;
    }
  }

  // 2. Ambil master deposit_types jika tidak disediakan
  let dtList = options?.depTypes;
  if (!dtList || dtList.length === 0) {
    try {
      const { data: dTypes } = await supabase
        .from('deposit_types')
        .select('id, name, code');
      dtList = dTypes || [];
    } catch (err) {
      console.warn('Gagal memuat deposit_types:', err);
      dtList = [];
    }
  }

  const findDtId = (keywords: string[], fallbackId: string) => {
    const match = (dtList || []).find((dt: any) => {
      const c = (dt.code || '').toUpperCase();
      const n = (dt.name || '').toLowerCase();
      return keywords.some(k => c === k.toUpperCase() || n.includes(k.toLowerCase()));
    });
    return match?.id || fallbackId;
  };

  let targetDepTypeId: string | undefined;
  if (targetType === 'WAJIB') {
    targetDepTypeId = findDtId(['WAJIB', 'SW'], 'dt-wajib');
  } else if (targetType === 'BELANJA') {
    targetDepTypeId = findDtId(['BELANJA', 'SB'], 'dt-belanja');
  } else if (targetType === 'LEBARAN') {
    targetDepTypeId = findDtId(['LEBARAN', 'SL', 'HARI RAYA'], 'dt-lebaran');
  }

  // 3. Ambil join date jika belum disediakan
  let effectiveJoin = options?.joinDate;
  if (!effectiveJoin && memberId) {
    try {
      let memberQuery: any = supabase
        .from('anggota')
        .select('created_at');

      let memberRecord: any = null;
      if (typeof memberQuery.eq === 'function') {
        const eqQuery = memberQuery.eq('id', memberId);
        if (eqQuery && typeof eqQuery.single === 'function') {
          const resp = await eqQuery.single();
          memberRecord = resp.data;
        } else if (eqQuery && typeof eqQuery.then === 'function') {
          const resp = await eqQuery;
          memberRecord = Array.isArray(resp.data) ? resp.data[0] : resp.data;
        }
      }

      if (memberRecord) {
        effectiveJoin = memberRecord.tgl_awal_anggota || memberRecord.created_at;
      }
    } catch (err) {
      console.warn('Gagal query join date anggota:', err);
    }
  }

  // 4. Ambil data member_deposits untuk member ini
  let mDeposits: any[] = options?.memberDeposits || [];
  if (!mDeposits || mDeposits.length === 0) {
    try {
      let mdQuery: any = supabase
        .from('member_deposits')
        .select(`
          id,
          member_id,
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
        `);

      if (typeof mdQuery.eq === 'function') {
        const resp = await mdQuery.eq('member_id', memberId);
        mDeposits = resp.data || [];
      } else if (typeof mdQuery.in === 'function') {
        const resp = await mdQuery.in('member_id', [memberId]);
        mDeposits = resp.data || [];
      } else {
        const resp = await mdQuery;
        mDeposits = resp.data || [];
      }
    } catch (err) {
      console.warn(`Gagal query member_deposits untuk memberId ${memberId}:`, err);
      mDeposits = [];
    }
  }

  let md = mDeposits.find((d: any) => {
    if (d.member_id && d.member_id !== memberId) return false;
    if (targetDepTypeId && d.deposit_type_id === targetDepTypeId) return true;
    const resolvedCode = resolveDepositTypeCode(d.deposit_types);
    return resolvedCode === targetType;
  });

  // Cari atau buat (upsert) rekening di public.member_deposits jika belum ada
  if (!md && targetDepTypeId) {
    try {
      let existingId: string | null = null;
      const checkQuery: any = supabase
        .from('member_deposits')
        .select('id');

      if (typeof checkQuery.eq === 'function') {
        const eqQuery = checkQuery.eq('member_id', memberId);
        if (eqQuery && typeof eqQuery.eq === 'function') {
          const eqTypeQuery = eqQuery.eq('deposit_type_id', targetDepTypeId);
          const checkRes = typeof eqTypeQuery.maybeSingle === 'function'
            ? await eqTypeQuery.maybeSingle()
            : await eqTypeQuery;
          if (checkRes?.data) {
            const row = Array.isArray(checkRes.data) ? checkRes.data[0] : checkRes.data;
            existingId = row?.id;
          }
        }
      }

      const tableDeposits: any = supabase.from('member_deposits');
      if (!existingId && typeof tableDeposits.insert === 'function') {
        const insQuery: any = tableDeposits
          .insert({
            member_id: memberId,
            deposit_type_id: targetDepTypeId,
            is_terminated: false
          });

        let insRes: any = null;
        if (typeof insQuery.select === 'function') {
          const selQuery = insQuery.select('id');
          insRes = typeof selQuery.maybeSingle === 'function'
            ? await selQuery.maybeSingle()
            : (typeof selQuery.single === 'function' ? await selQuery.single() : await selQuery);
        } else {
          insRes = await insQuery;
        }

        if (insRes?.data) {
          const row = Array.isArray(insRes.data) ? insRes.data[0] : insRes.data;
          existingId = row?.id;
        }
      }

      if (existingId) {
        md = {
          id: existingId,
          member_id: memberId,
          deposit_type_id: targetDepTypeId,
          deposit_types: { id: targetDepTypeId, code: targetType },
          deposit_transactions: []
        };
      }
    } catch (upsertErr) {
      console.warn(`Gagal upsert member_deposits untuk ${memberId} (${targetType}):`, upsertErr);
    }
  }

  if (!md) {
    return { success: true, matchedKeys: [], insertedCount: 0 };
  }

  const txs: any[] = Array.isArray(md.deposit_transactions) ? md.deposit_transactions : [];

  // 5. Tentukan saldo impor/migrasi persis seperti alur modal individual
  const migrationTx = txs.find((t: any) => {
    const d = (t.description || '').toLowerCase();
    return d.includes('migra') || d.includes('saldo awal') || d.includes('historical') || d.includes('one-time');
  });

  let targetBalance = 0;
  if (migrationTx) {
    targetBalance = Number(migrationTx.amount || 0);
  } else {
    let net = 0;
    for (const t of txs) {
      const amt = Number(t.amount || 0);
      if (t.transaction_type === 'withdrawal') net -= amt;
      else net += amt;
    }
    targetBalance = Math.max(0, net);
  }

  if (targetBalance <= 0) {
    return { success: true, memberDepositId: md.id, matchedKeys: [], insertedCount: 0 };
  }

  // 6. Grid rentang tahun
  let sYear = options?.startYear ?? 2024;
  if (!options?.startYear && effectiveJoin) {
    const d = new Date(effectiveJoin);
    if (!isNaN(d.getTime())) {
      sYear = Math.min(2024, d.getFullYear());
    }
  }
  const currentYear = new Date().getFullYear();
  const eYear = options?.endYear ?? Math.max(2026, currentYear);
  const monthGrid = generateMonthGrid(sYear, eYear);

  // 7. Hitung bulan yang tercentang menggunakan algoritma FIFO (termasuk alokasi sisa saldo parsial)
  const fifoResult = calculateFifoAllocation(
    targetBalance,
    monthGrid,
    targetType,
    rateTiers,
    effectiveJoin,
    md.id
  );
  const matchedKeys = fifoResult.matchedKeys;

  // 8. Hapus transaksi rutin bulanan lama pada rentang grid (lindungi mutasi migrasi riil)
  const oldRoutineTxIds = txs
    .filter((t: any) => {
      if (t.transaction_type !== 'deposit') return false;
      const desc = (t.description || '').toLowerCase();
      if (desc.includes('migra') || desc.includes('saldo awal') || desc.includes('historical') || desc.includes('one-time')) {
        return false;
      }
      const y = t.for_year;
      return (y && y >= sYear && y <= eYear) || desc.includes('setoran matriks') || desc.includes('rekonsiliasi otomatis');
    })
    .map((t: any) => t.id)
    .filter(Boolean);

  if (oldRoutineTxIds.length > 0) {
    const delInQuery: any = supabase.from('deposit_transactions').delete();
    if (typeof delInQuery.in === 'function') {
      const { error: delErr } = await delInQuery.in('id', oldRoutineTxIds);
      if (delErr) throw delErr;
    }
  }

  // Juga eksekusi query delete bermetode chained seperti modal jika didukung
  const deleteQuery: any = supabase
    .from('deposit_transactions')
    .delete();

  if (typeof deleteQuery.eq === 'function') {
    const eqQuery = deleteQuery.eq('member_deposit_id', md.id);
    if (eqQuery && typeof eqQuery.gte === 'function') {
      const gteQuery = eqQuery.gte('for_year', sYear);
      if (gteQuery && typeof gteQuery.lte === 'function') {
        const lteQuery = gteQuery.lte('for_year', eYear);
        if (lteQuery && typeof lteQuery.eq === 'function') {
          const typeQuery = lteQuery.eq('transaction_type', 'deposit');
          if (typeQuery && typeof typeQuery.neq === 'function') {
            await typeQuery.neq('description', 'Migrasi Saldo Awal (As-Is)');
          } else if (typeQuery && typeof typeQuery.then === 'function') {
            await typeQuery;
          }
        }
      }
    }
  }

  // 9. Singkirkan transaksi gelondongan migrasi jika matchedKeys > 0
  if (matchedKeys.length > 0) {
    try {
      const bulkMigrationTxIds = txs
        .filter((t: any) => {
          const desc = (t.description || '').toLowerCase();
          const isMigration = desc.includes('migra') || desc.includes('saldo awal');
          return isMigration && (t.for_month === null || t.for_month === undefined || desc.includes('saldo awal migrasi sistem'));
        })
        .map((t: any) => t.id)
        .filter(Boolean);

      if (bulkMigrationTxIds.length > 0) {
        const delByIdQuery: any = supabase.from('deposit_transactions').delete();
        if (typeof delByIdQuery.in === 'function') {
          await delByIdQuery.in('id', bulkMigrationTxIds);
        }
      }

      const delQuery: any = supabase.from('deposit_transactions').delete();
      if (typeof delQuery.eq === 'function') {
        const eqQuery = delQuery.eq('member_deposit_id', md.id);
        if (eqQuery && typeof eqQuery.is === 'function') {
          const isQuery = eqQuery.is('for_month', null);
          if (isQuery && typeof isQuery.ilike === 'function') {
            await isQuery.ilike('description', '%migrasi%');
          } else if (isQuery && typeof isQuery.then === 'function') {
            await isQuery;
          }
        } else if (eqQuery && typeof eqQuery.then === 'function') {
          await eqQuery;
        }
      }
    } catch (delBulkErr) {
      console.warn('Gagal menghapus transaksi migrasi gelondongan:', delBulkErr);
    }
  }

  // 10. Simpan transaksi baru untuk setiap bulan yang dicocokkan FIFO
  const txsToInsert = fifoResult.allocatedTransactions.map(item => ({
    member_deposit_id: md.id,
    amount: item.amount,
    for_month: item.for_month,
    for_year: item.for_year,
    transaction_type: 'deposit',
    description: item.description
  }));

  if (txsToInsert.length > 0) {
    const { error: insErr } = await supabase
      .from('deposit_transactions')
      .insert(txsToInsert);
    if (insErr) throw insErr;
  }

  return {
    success: true,
    memberDepositId: md.id,
    matchedKeys,
    insertedCount: txsToInsert.length,
    allocatedTransactions: fifoResult.allocatedTransactions,
    totalAllocated: fifoResult.totalAllocated
  };
}

export const reconcileMemberSavingsDeposit = reconcileSingleMemberDeposit;
export const autoReconcileMember = reconcileSingleMemberDeposit;

/**
 * Menjalankan rekonsiliasi otomatis saldo buku besar simpanan massal untuk seluruh anggota aktif
 * dengan mengeksekusi logika reconcileSingleMemberDeposit yang identik dengan modal per anggota.
 */
export async function bulkAutoReconcileAllMembers(
  depositTypeCode: string = 'ALL',
  onProgress?: ((progress: BulkReconcileProgress) => void) | ((processed: number, total: number) => void),
  options?: BulkReconcileOptions
): Promise<BulkReconcileResult> {
  const rawType = (depositTypeCode || 'ALL').trim();
  const isAll = !rawType || rawType === 'ALL' || rawType.toLowerCase().includes('semua');
  let typesToProcess: Array<'WAJIB' | 'BELANJA' | 'LEBARAN'> = [];
  if (isAll) {
    typesToProcess = ['WAJIB', 'BELANJA', 'LEBARAN'];
  } else {
    const resolved = resolveDepositTypeCode(rawType);
    if (resolved) {
      typesToProcess = [resolved];
    } else {
      const codeUpper = rawType.toUpperCase();
      if (codeUpper === 'SW' || codeUpper === 'WAJIB') typesToProcess = ['WAJIB'];
      else if (codeUpper === 'SB' || codeUpper === 'BELANJA') typesToProcess = ['BELANJA'];
      else if (codeUpper === 'SL' || codeUpper === 'LEBARAN') typesToProcess = ['LEBARAN'];
      else typesToProcess = [codeUpper as any];
    }
  }

  // 1. Ambil seluruh anggota aktif dari public.anggota
  let membersQuery: any = supabase
    .from('anggota')
    .select('id, nrp, nama, created_at, status, membership_status');

  let membersData: any[] = [];
  let membersError: any = null;

  if (typeof membersQuery.eq === 'function') {
    const eqQuery = membersQuery.eq('status', 'aktif');
    if (eqQuery && typeof eqQuery.order === 'function') {
      const resp = await eqQuery.order('nrp', { ascending: true });
      membersData = resp.data || [];
      membersError = resp.error;
    } else if (eqQuery && typeof eqQuery.then === 'function') {
      const resp = await eqQuery;
      membersData = resp.data || [];
      membersError = resp.error;
    }
  }

  if ((!membersData || membersData.length === 0) && !membersError) {
    if (typeof membersQuery.order === 'function') {
      const resp = await membersQuery.order('nrp', { ascending: true });
      membersData = resp.data || [];
      membersError = resp.error;
    } else if (typeof membersQuery.then === 'function') {
      const resp = await membersQuery;
      membersData = resp.data || [];
      membersError = resp.error;
    }
  }

  if (membersError) {
    throw new Error(`Gagal memuat data anggota: ${membersError.message || membersError}`);
  }

  const activeMembers = (membersData || []).filter((m: any) => {
    const st = (m.status || 'aktif').toLowerCase();
    const mst = (m.membership_status || 'ACTIVE').toUpperCase();
    return st !== 'nonaktif' && mst !== 'RESIGNED';
  });

  const totalMembers = activeMembers.length;
  if (totalMembers === 0) {
    return {
      success: true,
      totalMembers: 0,
      totalSuccess: 0,
      totalFailed: 0,
      errors: []
    };
  }

  // 2. Ambil master data sekali di awal agar efisien dan konsisten
  let depTypes: any[] = [];
  try {
    const { data: dtData } = await supabase
      .from('deposit_types')
      .select('id, code, name');
    depTypes = dtData || [];
  } catch (err) {
    console.warn('Gagal memuat deposit_types:', err);
  }

  let rateTiers: SavingsRateTier[] = [];
  try {
    rateTiers = await getRateTiers(undefined, false);
  } catch (err) {
    console.warn('Gagal memuat rate tiers via getRateTiers:', err);
  }

  if (!rateTiers || rateTiers.length === 0) {
    try {
      const { data: tiers } = await supabase
        .from('savings_rate_tiers')
        .select('*')
        .order('start_year', { ascending: true })
        .order('start_month', { ascending: true });
      if (tiers && tiers.length > 0) {
        rateTiers = tiers as any;
      }
    } catch (err) {
      console.warn('Gagal query savings_rate_tiers langsung:', err);
    }
  }

  if (!rateTiers || rateTiers.length === 0) {
    rateTiers = DEFAULT_RATE_TIERS;
  }

  let totalSuccess = 0;
  let totalFailed = 0;
  const errors: Array<{ memberId: string; memberName: string; error: string }> = [];

  const reportProgress = (processed: number, total: number, memberName?: string) => {
    if (!onProgress) return;
    if (onProgress.length === 2) {
      (onProgress as any)(processed, total);
    } else {
      (onProgress as any)({
        processed,
        total,
        currentMemberName: memberName || ''
      });
    }
  };

  // 3. Proses tiap anggota satu per satu menggunakan fungsi rekonsiliasi yang persis sama dengan modal
  for (let i = 0; i < totalMembers; i++) {
    const member = activeMembers[i];
    try {
      for (const targetType of typesToProcess) {
        await reconcileSingleMemberDeposit(member.id, targetType, {
          rateTiers,
          depTypes,
          joinDate: member.tgl_awal_anggota || member.created_at || null,
          startYear: options?.startYear,
          endYear: options?.endYear
        });
      }
      totalSuccess++;
    } catch (memberErr: any) {
      totalFailed++;
      errors.push({
        memberId: member.id,
        memberName: member.nama || member.nrp || 'Unknown',
        error: memberErr?.message || String(memberErr)
      });
    } finally {
      reportProgress(i + 1, totalMembers, member.nama || member.nrp);
    }
  }

  return {
    success: totalFailed === 0,
    totalMembers,
    totalSuccess,
    totalFailed,
    errors: errors.length > 0 ? errors : undefined
  };
}
