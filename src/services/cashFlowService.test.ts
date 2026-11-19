import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resetFinancialTransactions,
  syncOpeningSavingsBalanceToCashFlow,
  isOpeningDepositTransaction,
} from './cashFlowService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
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

describe('cashFlowService - syncOpeningSavingsBalanceToCashFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupMockStore(initialState: {
    depositTransactions?: any[];
    memberDeposits?: any[];
    cashFlow?: any[];
    systemSettings?: any[];
    failDescriptionColumn?: boolean;
  }) {
    const dtStore = [...(initialState.depositTransactions || [])];
    const mdStore = [...(initialState.memberDeposits || [])];
    const cfStore = [...(initialState.cashFlow || [])];
    const ssStore = [...(initialState.systemSettings || [])];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'deposit_transactions') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async (from: number, to: number) => ({
              data: dtStore.slice(from, to + 1),
              error: null,
            })),
          }),
          insert: vi.fn().mockImplementation(async (payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            dtStore.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            range: vi.fn().mockImplementation(async (from: number, to: number) => ({
              data: mdStore.slice(from, to + 1),
              error: null,
            })),
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: ssStore.find((r) => r.key === val) || null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (initialState.failDescriptionColumn && cols === '*') {
              return {
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: null,
                    error: { code: 'PGRST204', message: 'Could not find the description column' },
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockImplementation((_col: string, val: string) => ({
                order: vi.fn().mockResolvedValue({
                  data: cfStore.filter((r) => r.category === val),
                  error: null,
                }),
              })),
            };
          }),
          insert: vi.fn().mockImplementation(async (payload: any) => {
            if (initialState.failDescriptionColumn && 'description' in payload) {
              return {
                error: { code: 'PGRST204', message: 'Could not find the description column' },
              };
            }
            cfStore.push({ id: `cf-${cfStore.length + 1}`, ...payload });
            return { error: null };
          }),
          update: vi.fn().mockImplementation((payload: any) => ({
            eq: vi.fn().mockImplementation(async (_col: string, id: string) => {
              if (initialState.failDescriptionColumn && 'description' in payload) {
                return {
                  error: { code: '42703', message: 'column "description" does not exist' },
                };
              }
              const row = cfStore.find((r) => r.id === id);
              if (row) Object.assign(row, payload);
              return { error: null };
            }),
          })),
          delete: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockImplementation(async (col: string, val: string) => {
              for (let i = cfStore.length - 1; i >= 0; i--) {
                if (cfStore[i][col] === val) cfStore.splice(i, 1);
              }
              return { error: null };
            }),
            in: vi.fn().mockImplementation(async (col: string, vals: string[]) => {
              for (let i = cfStore.length - 1; i >= 0; i--) {
                if (vals.includes(cfStore[i][col])) cfStore.splice(i, 1);
              }
              return { error: null };
            }),
          })),
        };
      }
      return {};
    });

    return { dtStore, cfStore };
  }

  it('inserts exactly 1 consolidated SALDO_AWAL_SIMPANAN cash_flow row on first import', async () => {
    const { cfStore } = setupMockStore({
      depositTransactions: [
        { member_deposit_id: 'md-p', transaction_type: 'deposit', amount: 100000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
        { member_deposit_id: 'md-w', transaction_type: 'deposit', amount: 500000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
        { member_deposit_id: 'md-b', transaction_type: 'deposit', amount: 250000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
        { member_deposit_id: 'md-l', transaction_type: 'deposit', amount: 150000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      ],
    });

    const res = await syncOpeningSavingsBalanceToCashFlow('2026-03-01');

    expect(res).toEqual({ synced: true, totalOpening: 1000000, diff: 1000000 });
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0]).toMatchObject({
      direction: 'in',
      category: 'SALDO_AWAL_SIMPANAN',
      amount: 1000000,
      description: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
      created_at: '2026-03-01T00:00:00.000Z',
    });
  });

  it('updates existing SALDO_AWAL_SIMPANAN row idempotently on both upward and downward revisions without duplicates', async () => {
    const dt = [
      { member_deposit_id: 'md-1', transaction_type: 'deposit', amount: 850000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
    ];
    const { cfStore } = setupMockStore({ depositTransactions: dt });

    await syncOpeningSavingsBalanceToCashFlow('2026-03-01');
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0].amount).toBe(850000);

    // Revisi naik -> 1.200.000
    dt[0].amount = 1200000;
    const upRes = await syncOpeningSavingsBalanceToCashFlow('2026-03-01');
    expect(upRes).toEqual({ synced: true, totalOpening: 1200000, diff: 350000 });
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0].amount).toBe(1200000);

    // Revisi turun -> 600.000
    dt[0].amount = 600000;
    const downRes = await syncOpeningSavingsBalanceToCashFlow('2026-03-01');
    expect(downRes).toEqual({ synced: true, totalOpening: 600000, diff: -600000 });
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0].amount).toBe(600000);
  });

  it('updates created_at when cutOffDateStr changes even if nominal amount is unchanged', async () => {
    const { cfStore } = setupMockStore({
      depositTransactions: [
        { member_deposit_id: 'md-1', transaction_type: 'deposit', amount: 500000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      ],
      cashFlow: [
        {
          id: 'cf-1',
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: 500000,
          description: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      ],
    });

    const res = await syncOpeningSavingsBalanceToCashFlow('2026-04-01');
    expect(res).toEqual({ synced: true, totalOpening: 500000, diff: 0 });
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0].created_at).toBe('2026-04-01T00:00:00.000Z');
  });

  it('deletes existing SALDO_AWAL_SIMPANAN row when totalOpening becomes 0 (e.g. after Reset Data)', async () => {
    const { cfStore } = setupMockStore({
      depositTransactions: [],
      cashFlow: [
        {
          id: 'cf-old',
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: 1500000,
          created_at: '2026-03-01T00:00:00.000Z',
        },
      ],
    });

    const res = await syncOpeningSavingsBalanceToCashFlow();
    expect(res).toEqual({ synced: true, totalOpening: 0, diff: -1500000 });
    expect(cfStore).toHaveLength(0);
  });

  it('deduplicates multiple existing SALDO_AWAL_SIMPANAN rows into a single row', async () => {
    const { cfStore } = setupMockStore({
      depositTransactions: [
        { member_deposit_id: 'md-1', transaction_type: 'deposit', amount: 900000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      ],
      cashFlow: [
        {
          id: 'cf-1',
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: 900000,
          description: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
          created_at: '2026-03-01T00:00:00.000Z',
        },
        {
          id: 'cf-dup-2',
          direction: 'in',
          category: 'SALDO_AWAL_SIMPANAN',
          amount: 900000,
          description: 'Duplicate row',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      ],
    });

    const res = await syncOpeningSavingsBalanceToCashFlow('2026-03-01');
    expect(res.synced).toBe(true);
    expect(res.totalOpening).toBe(900000);
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0].id).toBe('cf-1');
  });

  it('excludes post-cutoff Setoran Simpanan Pokok and post-cutoff monthly deposits while summing opening/pre-cutoff txs', async () => {
    const { cfStore } = setupMockStore({
      depositTransactions: [
        // Included: cut-off
        { transaction_type: 'deposit', amount: 400000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
        // Included: for_year < 2026
        { transaction_type: 'deposit', amount: 100000, for_year: 2025, for_month: 12, description: 'Import Matriks Buku Besar' },
        // Included: for_year === 2026 && for_month <= 2
        { transaction_type: 'deposit', amount: 50000, for_year: 2026, for_month: 1, description: 'Import Matriks Buku Besar' },
        // Excluded: post-cutoff Setoran Simpanan Pokok (for_month: null)
        { transaction_type: 'deposit', amount: 100000, for_year: null, for_month: null, description: 'Setoran Simpanan Pokok' },
        // Excluded: post-cutoff Pelunasan Simpanan Pokok
        { transaction_type: 'deposit', amount: 100000, for_year: null, for_month: null, description: 'Pelunasan Simpanan Pokok Anggota' },
        // Excluded: post-cutoff monthly deposit (March 2026)
        { transaction_type: 'deposit', amount: 75000, for_year: 2026, for_month: 3, description: 'Setoran Rutin Bulanan' },
      ],
    });

    expect(
      isOpeningDepositTransaction(
        { transaction_type: 'deposit', amount: 100000, for_year: null, for_month: null, description: 'Setoran Simpanan Pokok' },
        '2026-03-01'
      )
    ).toBe(false);

    const res = await syncOpeningSavingsBalanceToCashFlow('2026-03-01');
    expect(res.totalOpening).toBe(550000);
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0].amount).toBe(550000);
  });

  it('falls back cleanly without description column on PGRST204 / 42703 schema errors', async () => {
    const { cfStore } = setupMockStore({
      depositTransactions: [
        { transaction_type: 'deposit', amount: 300000, for_year: 2026, for_month: 2, description: 'Saldo Awal Cut-Off (s/d Feb 2026)' },
      ],
      failDescriptionColumn: true,
    });

    const insRes = await syncOpeningSavingsBalanceToCashFlow('2026-03-01');
    expect(insRes).toEqual({ synced: true, totalOpening: 300000, diff: 300000 });
    expect(cfStore).toHaveLength(1);
    expect(cfStore[0]).toEqual({
      id: 'cf-1',
      direction: 'in',
      category: 'SALDO_AWAL_SIMPANAN',
      amount: 300000,
      created_at: '2026-03-01T00:00:00.000Z',
    });
  });
});
