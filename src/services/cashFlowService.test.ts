import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetFinancialTransactions } from './cashFlowService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('cashFlowService - resetFinancialTransactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls RPC reset_financial_transactions with adminId when provided', async () => {
    const mockRpcResponse = {
      success: true,
      message: 'Seluruh transaksi kas keuangan, penjualan kasir, dan penarikan simpanan berhasil direset.',
      sales_deleted: 15,
      withdrawals_deleted: 4,
      cash_flow_deleted: 28,
      shifts_deleted: 2,
    };

    (supabase.rpc as any).mockResolvedValueOnce({
      data: mockRpcResponse,
      error: null,
    });

    const result = await resetFinancialTransactions('admin-uuid-123');

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('reset_financial_transactions', {
      p_admin_id: 'admin-uuid-123',
    });
    expect(result.success).toBe(true);
    expect(result.sales_deleted).toBe(15);
    expect(result.withdrawals_deleted).toBe(4);
    expect(result.cash_flow_deleted).toBe(28);
    expect(result.shifts_deleted).toBe(2);
  });

  it('calls RPC reset_financial_transactions with null when adminId is undefined or omitted', async () => {
    const mockRpcResponse = {
      success: true,
      message: 'Reset berhasil',
      sales_deleted: 0,
      withdrawals_deleted: 0,
      cash_flow_deleted: 0,
    };

    (supabase.rpc as any).mockResolvedValueOnce({
      data: mockRpcResponse,
      error: null,
    });

    const result = await resetFinancialTransactions();

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('reset_financial_transactions', {
      p_admin_id: null,
    });
    expect(result.success).toBe(true);
  });

  it('handles error response from Supabase RPC gracefully', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'Permission denied for function reset_financial_transactions' },
    });

    const result = await resetFinancialTransactions('admin-uuid-456');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permission denied');
  });

  it('provides helpful message when RPC is missing from schema cache', async () => {
    (supabase.rpc as any).mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.reset_financial_transactions(p_admin_id) in the schema cache',
      },
    });

    const result = await resetFinancialTransactions('admin-uuid-456');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Fungsi database reset_financial_transactions belum dipasang pada database Supabase');
  });

  it('handles caught exceptions when RPC call throws', async () => {
    (supabase.rpc as any).mockRejectedValueOnce(new Error('Network error connecting to database'));

    const result = await resetFinancialTransactions();

    expect(result.success).toBe(false);
    expect(result.message).toContain('Network error connecting to database');
  });
});
