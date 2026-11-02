import { supabase } from '../lib/supabaseClient';
import {
  getRateTiers,
  getApplicableRate,
  SavingsRateTier
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
 * Menghitung total nominal dari bulan-bulan yang tercentang
 */
export function calculateTotalChecked(
  checkedKeys: Iterable<string>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[]
): number {
  let total = 0;
  for (const key of checkedKeys) {
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
 * Algoritma FIFO: Mulai dari bulan awal yang valid (setelah tanggal bergabung),
 * centang berurutan ke bulan-bulan berikutnya dengan nominal tarif aktif periode tersebut
 * hingga total tercentang tepat menyamai saldo impor tanpa melebihi saldo.
 */
export function matchAutomaticFifo(
  targetBalance: number,
  months: Array<{ year: number; month: number; key: string }>,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[],
  joinDate?: string | Date | null
): string[] {
  if (targetBalance <= 0) return [];

  let remaining = targetBalance;
  const matchedKeys: string[] = [];

  // Urutkan bulan secara kronologis
  const sortedMonths = [...months].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));

  for (const m of sortedMonths) {
    if (isMonthBeforeJoin(m.year, m.month, joinDate)) {
      continue;
    }

    const rate = getApplicableRate(depositTypeCode, m.year, m.month, rateTiers);
    if (rate <= 0) continue;

    if (remaining >= rate) {
      matchedKeys.push(m.key);
      remaining -= rate;
    } else {
      // Saldo tidak mencukupi untuk bulan penuh ini, hentikan FIFO
      break;
    }
  }

  return matchedKeys;
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
 * Menjalankan rekonsiliasi otomatis saldo buku besar simpanan massal untuk seluruh anggota aktif
 * menggunakan algoritma FIFO bertingkat dengan pemrosesan per batch.
 */
export async function bulkAutoReconcileAllMembers(
  depositTypeCode: string,
  onProgress?: (progress: BulkReconcileProgress) => void,
  options?: BulkReconcileOptions
): Promise<BulkReconcileResult> {
  const codeUpper = (depositTypeCode || 'ALL').toUpperCase();
  let normalizedTypes: Array<'WAJIB' | 'BELANJA' | 'LEBARAN'> = [];
  if (codeUpper === 'ALL') {
    normalizedTypes = ['WAJIB', 'BELANJA', 'LEBARAN'];
  } else if (codeUpper === 'WAJIB' || codeUpper === 'SW') {
    normalizedTypes = ['WAJIB'];
  } else if (codeUpper === 'BELANJA' || codeUpper === 'SB') {
    normalizedTypes = ['BELANJA'];
  } else if (codeUpper === 'LEBARAN' || codeUpper === 'SL') {
    normalizedTypes = ['LEBARAN'];
  } else {
    normalizedTypes = [codeUpper as any];
  }

  // 1. Ambil seluruh anggota aktif dari public.anggota
  let membersQuery: any = supabase
    .from('anggota')
    .select('id, nrp, nama, created_at, tgl_awal_anggota, status, membership_status');

  if (typeof membersQuery.order === 'function') {
    membersQuery = membersQuery.order('nrp', { ascending: true });
  }

  const { data: membersData, error: membersError } = await membersQuery;
  if (membersError) {
    throw new Error(`Gagal memuat data anggota: ${membersError.message || membersError}`);
  }

  const activeMembers = (membersData || []).filter((m: any) => {
    const st = (m.status || '').toLowerCase();
    const mst = (m.membership_status || '').toUpperCase();
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

  // 2. Ambil tarif simpanan aktif bertingkat
  const rateTiers = await getRateTiers();

  // 3. Persiapkan konfigurasi batching
  const batchSize = options?.batchSize && options.batchSize > 0 ? options.batchSize : 50;
  let processedCount = 0;
  let totalSuccess = 0;
  let totalFailed = 0;
  const errors: Array<{ memberId: string; memberName: string; error: string }> = [];

  // 4. Proses anggota per batch
  for (let i = 0; i < totalMembers; i += batchSize) {
    const batch = activeMembers.slice(i, i + batchSize);
    const batchIds = batch.map(m => m.id);

    let memberDepositsData: any[] = [];
    try {
      const { data, error: mdError } = await supabase
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
        `)
        .in('member_id', batchIds);

      if (mdError) {
        throw mdError;
      }
      memberDepositsData = data || [];
    } catch (batchErr: any) {
      for (const m of batch) {
        processedCount++;
        totalFailed++;
        errors.push({
          memberId: m.id,
          memberName: m.nama || m.nrp || 'Unknown',
          error: batchErr?.message || String(batchErr)
        });
        onProgress?.({
          processed: processedCount,
          total: totalMembers,
          currentMemberName: m.nama || m.nrp || ''
        });
      }
      continue;
    }

    // Kelompokkan member_deposits berdasarkan member_id
    const depositsByMember = new Map<string, any[]>();
    for (const md of memberDepositsData) {
      const list = depositsByMember.get(md.member_id) || [];
      list.push(md);
      depositsByMember.set(md.member_id, list);
    }

    // Proses masing-masing anggota dalam batch
    for (const member of batch) {
      try {
        const mDeposits = depositsByMember.get(member.id) || [];
        const effectiveJoinDate = member.tgl_awal_anggota || member.created_at || null;
        const joinYear = effectiveJoinDate ? new Date(effectiveJoinDate).getFullYear() : 2024;
        const resolvedStartYear = options?.startYear ?? (isNaN(joinYear) ? 2024 : Math.min(joinYear, 2024));
        const resolvedEndYear = options?.endYear ?? Math.max(new Date().getFullYear(), 2025);

        const monthGrid = generateMonthGrid(resolvedStartYear, resolvedEndYear);

        for (const targetType of normalizedTypes) {
          const md = mDeposits.find(d => resolveDepositTypeCode(d.deposit_types) === targetType);
          if (!md) {
            continue;
          }

          const txs: any[] = Array.isArray(md.deposit_transactions) ? md.deposit_transactions : [];

          // Tentukan saldo awal/impor dari mutasi migrasi riil atau akumulasi saldo riil
          const migrationTx = txs.find((t: any) => {
            const d = (t.description || '').toLowerCase();
            return d.includes('migra') || d.includes('saldo awal') || d.includes('historical') || d.includes('one-time');
          });

          let targetBalance = 0;
          if (migrationTx) {
            targetBalance = Number(migrationTx.amount || 0);
          } else {
            const nonMatrixTxs = txs.filter((t: any) => {
              const d = (t.description || '').toLowerCase();
              return !d.includes('setoran matriks') && !d.includes('rekonsiliasi otomatis');
            });
            const baseTxs = nonMatrixTxs.length > 0 ? nonMatrixTxs : txs;
            let net = 0;
            for (const t of baseTxs) {
              const amt = Number(t.amount || 0);
              if (t.transaction_type === 'withdrawal') net -= amt;
              else net += amt;
            }
            targetBalance = Math.max(0, net);
          }

          if (targetBalance <= 0) {
            continue;
          }

          // Hitung bulan yang berhak lunas menggunakan algoritma FIFO
          const matchedKeys = matchAutomaticFifo(
            targetBalance,
            monthGrid,
            targetType,
            rateTiers,
            effectiveJoinDate
          );

          // Hapus transaksi matriks lama pada rentang grid (lindungi mutasi migrasi riil)
          const oldMatrixTxIds = txs
            .filter((t: any) => {
              if (t.transaction_type !== 'deposit') return false;
              const y = Number(t.for_year);
              if (y < resolvedStartYear || y > resolvedEndYear) return false;
              const desc = (t.description || '').toLowerCase();
              if (desc.includes('migra') || desc.includes('saldo awal') || desc.includes('historical') || desc.includes('one-time')) {
                return false;
              }
              return desc.includes('setoran matriks') || desc.includes('rekonsiliasi otomatis');
            })
            .map((t: any) => t.id)
            .filter(Boolean);

          if (oldMatrixTxIds.length > 0) {
            const { error: delErr } = await supabase
              .from('deposit_transactions')
              .delete()
              .in('id', oldMatrixTxIds);
            if (delErr) throw delErr;
          }

          // Simpan transaksi baru untuk setiap bulan yang dicocokkan FIFO
          const txsToInsert = matchedKeys.map(key => {
            const [yStr, mStr] = key.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10);
            const rate = getApplicableRate(targetType, y, m, rateTiers);
            return {
              member_deposit_id: md.id,
              amount: rate,
              for_month: m,
              for_year: y,
              transaction_type: 'deposit',
              description: `Setoran Matriks ${targetType} ${MONTH_NAMES[m - 1]} ${y}`
            };
          });

          if (txsToInsert.length > 0) {
            const { error: insErr } = await supabase
              .from('deposit_transactions')
              .insert(txsToInsert);
            if (insErr) throw insErr;
          }
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
        processedCount++;
        onProgress?.({
          processed: processedCount,
          total: totalMembers,
          currentMemberName: member.nama || member.nrp || ''
        });
      }
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
