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
