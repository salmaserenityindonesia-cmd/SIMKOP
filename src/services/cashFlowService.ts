import { supabase } from '../lib/supabaseClient';

export interface ResetFinancialTransactionsResult {
  success: boolean;
  message: string;
  sales_deleted?: number;
  withdrawals_deleted?: number;
  cash_flow_deleted?: number;
  shifts_deleted?: number;
  deleted_sales?: number;
  deleted_withdrawals?: number;
  deleted_cash_flows?: number;
}

export interface SyncInitialSavingsCashFlowResult {
  synced: boolean;
  totalOpening: number;
  diff: number;
}

const CUTOFF_CASH_FLOW_CREATED_AT = '2026-03-01T00:00:00.000Z';
const DEFAULT_CUTOFF_DATE = '2026-03-01';
const CUTOFF_CASH_FLOW_DESCRIPTION =
  'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)';
const SHORT_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des',
];

function isPostgrestColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

function normalizeCutOffDate(dateStr?: string | null): string | null {
  if (typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (isNaN(parsed.getTime())) return null;
  return trimmed;
}

function buildOpeningPeriodMeta(cutOffDateStr: string): {
  cutOffIso: string;
  openingForYear: number;
  openingForMonth: number;
  openingDescription: string;
} {
  const cutOffYear = Number(cutOffDateStr.slice(0, 4));
  const cutOffMonth = Number(cutOffDateStr.slice(5, 7));
  const openingForYear = cutOffMonth > 1 ? cutOffYear : cutOffYear - 1;
  const openingForMonth = cutOffMonth > 1 ? cutOffMonth - 1 : 12;
  const monthLabel = SHORT_MONTH_LABELS[openingForMonth - 1] || 'Feb';
  return {
    cutOffIso: `${cutOffDateStr}T00:00:00.000Z`,
    openingForYear,
    openingForMonth,
    openingDescription: `Saldo Awal Cut-Off (s/d ${monthLabel} ${openingForYear})`,
  };
}

async function resolveSystemCutOffDateStr(): Promise<string | null> {
  try {
    const ssTable: any = supabase?.from?.('system_settings');
    if (!ssTable || typeof ssTable.select !== 'function') return null;

    const query: any = ssTable.select('key, value');
    if (query && typeof query.eq === 'function') {
      const eqQ = query.eq('key', 'initial_savings_effective_date');
      const res =
        typeof eqQ?.maybeSingle === 'function'
          ? await eqQ.maybeSingle()
          : typeof eqQ?.single === 'function'
          ? await eqQ.single()
          : await eqQ;
      const rowData = Array.isArray(res?.data) ? res.data[0] : res?.data;
      return normalizeCutOffDate(rowData?.value ? String(rowData.value) : null);
    }

    if (query && typeof query.then === 'function') {
      const res = await query;
      const rows = Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [];
      const found = rows.find((r: any) => r?.key === 'initial_savings_effective_date');
      return normalizeCutOffDate(found?.value ? String(found.value) : null);
    }
  } catch {
    // Non-blocking fallback
  }
  return null;
}

async function safeFetchAllPaged<T = any>(
  table: string,
  columns: string
): Promise<{ data: T[]; error: any }> {
  try {
    const pageSize = 1000;
    let offset = 0;
    const allRows: T[] = [];

    while (true) {
      const tableRef: any = supabase?.from?.(table);
      if (!tableRef || typeof tableRef.select !== 'function') {
        return { data: [], error: null };
      }

      const query: any = tableRef.select(columns);
      if (query && typeof query.range === 'function') {
        const res = await query.range(offset, offset + pageSize - 1);
        if (res?.error) {
          return { data: allRows, error: res.error };
        }
        const rows = Array.isArray(res?.data) ? res.data : [];
        allRows.push(...rows);
        if (rows.length < pageSize) break;
        offset += pageSize;
      } else if (query && typeof query.then === 'function') {
        const res = await query;
        if (res?.error) {
          return { data: [], error: res.error };
        }
        return { data: Array.isArray(res?.data) ? res.data : [], error: null };
      } else {
        return { data: [], error: null };
      }
    }

    return { data: allRows, error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

export function isOpeningDepositTransaction(
  tx: any,
  cutOffDateStr?: string | null
): boolean {
  if (tx?.transaction_type !== 'deposit') return false;
  const desc = String(tx?.description || '').toLowerCase();
  if (
    desc.includes('saldo awal') ||
    desc.includes('cut-off') ||
    desc.includes('migra') ||
    desc.includes('historical') ||
    desc.includes('one-time')
  ) {
    return true;
  }
  if (
    desc.includes('setoran') ||
    desc.includes('pelunasan') ||
    desc.includes('mandiri') ||
    desc.includes('angsuran')
  ) {
    return false;
  }

  const normalizedCutOff = normalizeCutOffDate(cutOffDateStr) || DEFAULT_CUTOFF_DATE;
  const cutOffYear = Number(normalizedCutOff.slice(0, 4));
  const cutOffMonth = Number(normalizedCutOff.slice(5, 7));

  const fy =
    tx?.for_year !== null && tx?.for_year !== undefined && tx?.for_year !== ''
      ? Number(tx.for_year)
      : NaN;
  const fm =
    tx?.for_month !== null && tx?.for_month !== undefined && tx?.for_month !== ''
      ? Number(tx.for_month)
      : NaN;

  if (!isNaN(fy) && (fy < cutOffYear || (fy === cutOffYear && !isNaN(fm) && fm < cutOffMonth))) {
    return true;
  }

  if (isNaN(fy) && isNaN(fm)) {
    return true;
  }

  return false;
}

/**
 * Menyinkronkan total Saldo Awal Simpanan Cut-Off ke tabel `public.cash_flow`
 * (`category = 'SALDO_AWAL_SIMPANAN'`, `direction = 'in'`) secara idempoten:
 * membentuk 1 baris terkonsolidasi, memperbarui nominal & tanggal cut-off jika berubah,
 * menduplikasi/membersihkan baris ganda, atau menghapusnya jika total saldo awal menjadi 0.
 * Sekaligus memulihkan mutasi `deposit_transactions` jika ada `member_deposits.balance > 0`
 * yang belum tercatat mutasinya.
 */
export async function syncOpeningSavingsBalanceToCashFlow(
  cutOffDateStr?: string,
  overrideTotalOpening?: number
): Promise<SyncInitialSavingsCashFlowResult> {
  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return { synced: false, totalOpening: 0, diff: 0 };
    }

    const normalizedCutOffDate = normalizeCutOffDate(cutOffDateStr);

    // 1. Muat seluruh transaksi simpanan untuk menghitung total saldo awal cut-off
    const { data: txRows, error: txErr } = await safeFetchAllPaged<any>(
      'deposit_transactions',
      'id, member_deposit_id, transaction_type, amount, for_year, for_month, description, created_at'
    );
    if (txErr) {
      return { synced: false, totalOpening: 0, diff: 0 };
    }
    const allTxs = [...txRows];

    const systemCutOffDate = normalizedCutOffDate
      ? normalizedCutOffDate
      : await resolveSystemCutOffDateStr();
    const effectiveCutOffDate = normalizedCutOffDate || systemCutOffDate || DEFAULT_CUTOFF_DATE;
    const recoveryMeta = buildOpeningPeriodMeta(effectiveCutOffDate);

    // 2. Pulihkan mutasi deposit_transactions jika ada member_deposits.balance > 0 tanpa mutasi sama sekali
    const { data: mdRows, error: mdErr } = await safeFetchAllPaged<any>(
      'member_deposits',
      'id, balance'
    );
    if (!mdErr && mdRows.length > 0) {
      const mdIdsWithTx = new Set(
        allTxs.map((t: any) => t?.member_deposit_id).filter(Boolean)
      );
      const missingOpeningTxs = mdRows
        .filter((md: any) => md?.id && Math.round(Number(md.balance || 0)) > 0 && !mdIdsWithTx.has(md.id))
        .map((md: any) => ({
          member_deposit_id: md.id,
          transaction_type: 'deposit',
          amount: Math.round(Number(md.balance)),
          for_year: recoveryMeta.openingForYear,
          for_month: recoveryMeta.openingForMonth,
          description: recoveryMeta.openingDescription,
          created_at: recoveryMeta.cutOffIso,
        }));

      if (missingOpeningTxs.length > 0) {
        const dtTable: any = supabase.from('deposit_transactions');
        if (dtTable && typeof dtTable.insert === 'function') {
          for (let i = 0; i < missingOpeningTxs.length; i += 100) {
            const chunk = missingOpeningTxs.slice(i, i + 100);
            const { error: insErr } = await dtTable.insert(chunk);
            if (!insErr) {
              allTxs.push(...chunk);
            }
          }
        }
      }
    }

    const queriedOpeningTotal = allTxs.reduce((sum: number, tx: any) => {
      if (!isOpeningDepositTransaction(tx, effectiveCutOffDate)) return sum;
      return sum + Math.round(Number(tx.amount || 0));
    }, 0);

    const parsedOverride =
      overrideTotalOpening !== undefined && overrideTotalOpening !== null
        ? Math.round(Number(overrideTotalOpening) || 0)
        : 0;

    const totalOpening =
      allTxs.length > 0
        ? Math.max(0, queriedOpeningTotal)
        : Math.max(0, parsedOverride);

    // 3. Cek entri rekap SALDO_AWAL_SIMPANAN di public.cash_flow
    const cfTable: any = supabase.from('cash_flow');
    if (!cfTable || typeof cfTable.select !== 'function') {
      return { synced: false, totalOpening, diff: 0 };
    }

    const runCfSelect = async (cols: string): Promise<{ data: any[]; error: any } | null> => {
      const q: any = cfTable.select(cols);
      if (q && typeof q.eq === 'function') {
        const eqQ = q.eq('category', 'SALDO_AWAL_SIMPANAN');
        if (eqQ && typeof eqQ.order === 'function') {
          const ordRes = await eqQ.order('created_at', { ascending: true });
          return {
            data: Array.isArray(ordRes?.data) ? ordRes.data : [],
            error: ordRes?.error || null,
          };
        }
        const res = await eqQ;
        return {
          data: Array.isArray(res?.data) ? res.data : [],
          error: res?.error || null,
        };
      }
      if (q && typeof q.then === 'function') {
        const res = await q;
        return {
          data: (Array.isArray(res?.data) ? res.data : []).filter(
            (r: any) => r?.category === 'SALDO_AWAL_SIMPANAN'
          ),
          error: res?.error || null,
        };
      }
      return null;
    };

    let cfSelectResult = await runCfSelect('*');
    if (!cfSelectResult) {
      return { synced: false, totalOpening, diff: 0 };
    }

    if (cfSelectResult.error && isPostgrestColumnError(cfSelectResult.error)) {
      const fallbackResult = await runCfSelect('id, amount, category, direction, created_at');
      if (fallbackResult) {
        cfSelectResult = fallbackResult;
      }
    }

    if (cfSelectResult.error) {
      return { synced: false, totalOpening, diff: 0 };
    }

    const existingRows = cfSelectResult.data;

    // 4a. Jika total opening <= 0 (misal Reset Data atau impor ulang nominal 0), hapus entri pembukaan jika ada
    if (totalOpening <= 0) {
      if (existingRows.length === 0) {
        return { synced: false, totalOpening: 0, diff: 0 };
      }
      const previousTotal = existingRows.reduce(
        (s: number, r: any) => s + Math.round(Number(r?.amount || 0)),
        0
      );
      if (typeof cfTable.delete !== 'function') {
        return { synced: false, totalOpening: 0, diff: 0 };
      }

      const idsToDelete = existingRows.map((r: any) => r?.id).filter(Boolean);
      let deletedAny = false;

      if (idsToDelete.length === 1) {
        const delQ = cfTable.delete();
        if (delQ && typeof delQ.eq === 'function') {
          const delRes = await delQ.eq('id', idsToDelete[0]);
          if (!delRes?.error) deletedAny = true;
        }
      } else if (idsToDelete.length > 1) {
        const delQ = cfTable.delete();
        if (delQ && typeof delQ.in === 'function') {
          const delRes = await delQ.in('id', idsToDelete);
          if (!delRes?.error) deletedAny = true;
        } else if (delQ && typeof delQ.eq === 'function') {
          for (const delId of idsToDelete) {
            const delRes = await cfTable.delete().eq('id', delId);
            if (!delRes?.error) deletedAny = true;
          }
        }
      } else {
        const delQ = cfTable.delete();
        if (delQ && typeof delQ.eq === 'function') {
          const delRes = await delQ.eq('category', 'SALDO_AWAL_SIMPANAN');
          if (!delRes?.error) deletedAny = true;
        }
      }

      return {
        synced: deletedAny,
        totalOpening: 0,
        diff: deletedAny ? -previousTotal : 0,
      };
    }

    const openingTimestamp = normalizedCutOffDate
      ? `${normalizedCutOffDate}T00:00:00.000Z`
      : existingRows[0]?.created_at ||
        (systemCutOffDate ? `${systemCutOffDate}T00:00:00.000Z` : CUTOFF_CASH_FLOW_CREATED_AT);

    // 4b. Insert jika belum ada
    if (existingRows.length === 0) {
      if (typeof cfTable.insert !== 'function') {
        return { synced: false, totalOpening, diff: 0 };
      }

      let insRes = await cfTable.insert({
        direction: 'in',
        category: 'SALDO_AWAL_SIMPANAN',
        amount: Math.round(totalOpening),
        description: CUTOFF_CASH_FLOW_DESCRIPTION,
        created_at: openingTimestamp,
      });

      if (insRes?.error && isPostgrestColumnError(insRes.error)) {
        insRes = await cfTable.insert({
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: Math.round(totalOpening),
          created_at: openingTimestamp,
        });
      }

      if (insRes?.error) {
        return { synced: false, totalOpening, diff: 0 };
      }

      return { synced: true, totalOpening, diff: totalOpening };
    }

    // 4c. Bersihkan duplikat bila ada & perbarui baris utama secara idempoten
    const primaryRow = existingRows[0];
    const hadDuplicates = existingRows.length > 1;
    if (hadDuplicates && typeof cfTable.delete === 'function') {
      const dupIds = existingRows.slice(1).map((r: any) => r?.id).filter(Boolean);
      if (dupIds.length > 0) {
        try {
          const delQ = cfTable.delete();
          if (delQ && typeof delQ.in === 'function') {
            await delQ.in('id', dupIds);
          } else if (delQ && typeof delQ.eq === 'function') {
            for (const dupId of dupIds) {
              await cfTable.delete().eq('id', dupId);
            }
          }
        } catch {
          // Non-blocking duplicate cleanup
        }
      }
    }

    const previousAmount = Math.round(Number(primaryRow?.amount || 0));
    const diff = totalOpening - previousAmount;
    const needsTimestampUpdate =
      normalizedCutOffDate !== null && primaryRow?.created_at !== openingTimestamp;
    const needsDescriptionUpdate =
      primaryRow?.description !== undefined &&
      primaryRow.description !== CUTOFF_CASH_FLOW_DESCRIPTION;

    if (
      (diff !== 0 || needsTimestampUpdate || needsDescriptionUpdate) &&
      primaryRow?.id &&
      typeof cfTable.update === 'function'
    ) {
      let updRes: any = null;
      const updQ = cfTable.update({
        amount: Math.round(totalOpening),
        description: CUTOFF_CASH_FLOW_DESCRIPTION,
        created_at: openingTimestamp,
      });
      if (updQ && typeof updQ.eq === 'function') {
        updRes = await updQ.eq('id', primaryRow.id);
      }

      if (updRes?.error && isPostgrestColumnError(updRes.error)) {
        const updFallback = cfTable.update({
          amount: Math.round(totalOpening),
          created_at: openingTimestamp,
        });
        if (updFallback && typeof updFallback.eq === 'function') {
          updRes = await updFallback.eq('id', primaryRow.id);
        }
      }

      if (updRes?.error) {
        return { synced: false, totalOpening, diff: 0 };
      }

      return { synced: true, totalOpening, diff };
    }

    return { synced: hadDuplicates, totalOpening, diff: 0 };
  } catch (err) {
    console.warn('Warning syncOpeningSavingsBalanceToCashFlow:', err);
    return { synced: false, totalOpening: 0, diff: 0 };
  }
}

export async function syncInitialSavingsOpeningCashFlow(
  overrideTotalOpening?: number,
  effectiveDateStr?: string
): Promise<SyncInitialSavingsCashFlowResult> {
  return syncOpeningSavingsBalanceToCashFlow(effectiveDateStr, overrideTotalOpening);
}

/**
 * Mereset seluruh transaksi keuangan kas (cash_flow), penjualan kasir retail POS
 * (sales, sale_items, cashier_shifts), serta mengembalikan hak simpanan anggota
 * dengan membatalkan/menghapus riwayat penarikan simpanan melalui PostgreSQL RPC atomik
 * `reset_financial_transactions`.
 *
 * @param adminId UUID admin yang memicu reset (opsional, jika tidak ada dikirim null)
 */
export async function resetFinancialTransactions(
  adminId?: string
): Promise<ResetFinancialTransactionsResult> {
  try {
    const { data, error } = await supabase.rpc('reset_financial_transactions', {
      p_admin_id: adminId || null,
    });

    if (error) {
      console.error('Error executing reset_financial_transactions RPC:', error);
      let userMessage = error.message || 'Gagal mereset transaksi keuangan.';
      if (error.code === 'PGRST202' || error.message?.includes('schema cache')) {
        userMessage = 'Fungsi database reset_financial_transactions belum dipasang pada database Supabase. Silakan jalankan file migrasi 040_create_reset_financial_transactions_rpc.sql di SQL Editor Supabase.';
      }
      return {
        success: false,
        message: userMessage,
      };
    }

    if (data && typeof data === 'object') {
      return {
        success: data.success ?? true,
        message: data.message || 'Seluruh transaksi kas keuangan berhasil di-reset.',
        sales_deleted: data.sales_deleted ?? data.deleted_sales ?? 0,
        withdrawals_deleted: data.withdrawals_deleted ?? data.deleted_withdrawals ?? 0,
        cash_flow_deleted: data.cash_flow_deleted ?? data.deleted_cash_flows ?? 0,
        shifts_deleted: data.shifts_deleted ?? 0,
        deleted_sales: data.deleted_sales ?? data.sales_deleted ?? 0,
        deleted_withdrawals: data.deleted_withdrawals ?? data.withdrawals_deleted ?? 0,
        deleted_cash_flows: data.deleted_cash_flows ?? data.cash_flow_deleted ?? 0,
      };
    }

    return {
      success: true,
      message: 'Seluruh transaksi kas keuangan berhasil di-reset.',
      sales_deleted: 0,
      withdrawals_deleted: 0,
      cash_flow_deleted: 0,
    };
  } catch (err: any) {
    console.error('Exception in resetFinancialTransactions:', err);
    return {
      success: false,
      message: err?.message || 'Terjadi kesalahan sistem saat mereset transaksi keuangan.',
    };
  }
}
