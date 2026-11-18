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
const CUTOFF_CASH_FLOW_DESCRIPTION = 'Saldo Awal Simpanan Anggota (Cut-Off Per 1 Maret 2026)';
const CUTOFF_DEPOSIT_TX_DESCRIPTION = 'Saldo Awal Cut-Off (s/d Feb 2026)';

function isPostgrestColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
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

function isOpeningDepositTransaction(tx: any): boolean {
  if (tx?.transaction_type !== 'deposit') return false;
  const desc = String(tx?.description || '').toLowerCase();
  if (
    desc.includes('saldo awal') ||
    desc.includes('migra') ||
    desc.includes('historical') ||
    desc.includes('one-time')
  ) {
    return true;
  }
  if (tx?.for_month === null || tx?.for_month === undefined) {
    return true;
  }
  const fy = tx?.for_year !== null && tx?.for_year !== undefined ? Number(tx.for_year) : NaN;
  const fm = tx?.for_month !== null && tx?.for_month !== undefined ? Number(tx.for_month) : NaN;
  if (!isNaN(fy) && !isNaN(fm) && fy === 2026 && fm <= 2) {
    return true;
  }
  return false;
}

/**
 * Menyinkronkan total Saldo Awal Simpanan Cut-Off ke tabel `public.cash_flow`
 * (`category = 'SALDO_AWAL_SIMPANAN'`, `created_at = '2026-03-01T00:00:00.000Z'`)
 * secara idempoten berbasis selisih. Sekaligus memulihkan mutasi `deposit_transactions`
 * jika ada saldo cache `member_deposits.balance > 0` yang belum tercatat mutasinya.
 */
export async function syncInitialSavingsOpeningCashFlow(
  overrideTotalOpening?: number,
  _effectiveDateStr?: string
): Promise<SyncInitialSavingsCashFlowResult> {
  try {
    if (!supabase || typeof supabase.from !== 'function') {
      return { synced: false, totalOpening: 0, diff: 0 };
    }

    // 1. Muat seluruh transaksi simpanan untuk menghitung total saldo awal cut-off
    const { data: txRows } = await safeFetchAllPaged<any>(
      'deposit_transactions',
      'id, member_deposit_id, transaction_type, amount, for_year, for_month, description, created_at'
    );
    const allTxs = [...txRows];

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
          for_year: 2026,
          for_month: 2,
          description: CUTOFF_DEPOSIT_TX_DESCRIPTION,
          created_at: CUTOFF_CASH_FLOW_CREATED_AT,
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
      if (!isOpeningDepositTransaction(tx)) return sum;
      return sum + Math.round(Number(tx.amount || 0));
    }, 0);

    const parsedOverride =
      overrideTotalOpening !== undefined && overrideTotalOpening !== null
        ? Math.round(Number(overrideTotalOpening) || 0)
        : 0;
    const totalOpening = Math.round(
      parsedOverride > 0 ? Math.max(queriedOpeningTotal, parsedOverride) : queriedOpeningTotal
    );

    if (totalOpening <= 0) {
      return { synced: false, totalOpening: 0, diff: 0 };
    }

    // 3. Cek entri rekap SALDO_AWAL_SIMPANAN di public.cash_flow
    const cfTable: any = supabase.from('cash_flow');
    if (!cfTable || typeof cfTable.select !== 'function') {
      return { synced: false, totalOpening, diff: 0 };
    }

    let existingRows: any[] = [];
    let selectErr: any = null;

    const q1: any = cfTable.select('*');
    if (q1 && typeof q1.eq === 'function') {
      const res = await q1.eq('category', 'SALDO_AWAL_SIMPANAN');
      existingRows = Array.isArray(res?.data) ? res.data : [];
      selectErr = res?.error || null;
    } else if (q1 && typeof q1.then === 'function') {
      const res = await q1;
      existingRows = (Array.isArray(res?.data) ? res.data : []).filter(
        (r: any) => r?.category === 'SALDO_AWAL_SIMPANAN'
      );
      selectErr = res?.error || null;
    }

    if (selectErr && isPostgrestColumnError(selectErr)) {
      const qFallback: any = cfTable.select('id, amount, category, direction, created_at');
      if (qFallback && typeof qFallback.eq === 'function') {
        const res = await qFallback.eq('category', 'SALDO_AWAL_SIMPANAN');
        existingRows = Array.isArray(res?.data) ? res.data : [];
        selectErr = res?.error || null;
      }
    }

    if (selectErr) {
      return { synced: false, totalOpening, diff: 0 };
    }

    // 4a. Insert jika belum ada
    if (existingRows.length === 0) {
      if (typeof cfTable.insert !== 'function') {
        return { synced: false, totalOpening, diff: 0 };
      }

      let insRes = await cfTable.insert({
        direction: 'in',
        category: 'SALDO_AWAL_SIMPANAN',
        amount: totalOpening,
        description: CUTOFF_CASH_FLOW_DESCRIPTION,
        created_at: CUTOFF_CASH_FLOW_CREATED_AT,
      });

      if (insRes?.error && isPostgrestColumnError(insRes.error)) {
        insRes = await cfTable.insert({
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: totalOpening,
          created_at: CUTOFF_CASH_FLOW_CREATED_AT,
        });
      }

      if (insRes?.error) {
        return { synced: false, totalOpening, diff: 0 };
      }

      return { synced: true, totalOpening, diff: totalOpening };
    }

    // 4b. Update idempoten berbasis selisih jika sudah ada
    const primaryRow = existingRows[0];
    if (existingRows.length > 1 && typeof cfTable.delete === 'function') {
      const dupIds = existingRows.slice(1).map((r: any) => r?.id).filter(Boolean);
      if (dupIds.length > 0) {
        try {
          const delQ = cfTable.delete();
          if (delQ && typeof delQ.in === 'function') {
            await delQ.in('id', dupIds);
          }
        } catch {
          // Non-blocking duplicate cleanup
        }
      }
    }

    const previousAmount = Math.round(Number(primaryRow?.amount || 0));
    const diff = totalOpening - previousAmount;

    if (diff !== 0 && primaryRow?.id && typeof cfTable.update === 'function') {
      let updRes: any = null;
      const updQ = cfTable.update({
        amount: totalOpening,
        description: CUTOFF_CASH_FLOW_DESCRIPTION,
        created_at: CUTOFF_CASH_FLOW_CREATED_AT,
      });
      if (updQ && typeof updQ.eq === 'function') {
        updRes = await updQ.eq('id', primaryRow.id);
      }

      if (updRes?.error && isPostgrestColumnError(updRes.error)) {
        const updFallback = cfTable.update({
          amount: totalOpening,
          created_at: CUTOFF_CASH_FLOW_CREATED_AT,
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

    return { synced: existingRows.length > 1, totalOpening, diff: 0 };
  } catch (err) {
    console.warn('Warning syncInitialSavingsOpeningCashFlow:', err);
    return { synced: false, totalOpening: 0, diff: 0 };
  }
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
