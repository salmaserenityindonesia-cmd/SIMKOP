import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateShuAllocation,
  computeYearEndPreview,
  createDefaultRatSettings,
  distributeMemberShuRows,
  executeYearEndClosing,
  getFiscalYearClosing,
  recalculatePreviewWithSettings,
  validateRatSettings,
  type YearEndClosingPreview,
} from './yearEndClosingService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('yearEndClosingService — Pure RAT Validation & SHU Allocation', () => {
  it('validates default RAT settings as 100% compliant', () => {
    const defaults = createDefaultRatSettings(2026);
    const res = validateRatSettings(defaults);

    expect(res.valid).toBe(true);
    expect(res.mainTotal).toBe(100);
    expect(res.memberSubTotal).toBe(100);
    expect(res.errors).toEqual([]);
  });

  it('rejects RAT settings when main allocation or member sub-ratios do not total 100%', () => {
    const invalidMain = {
      ...createDefaultRatSettings(2026),
      reserve_fund_pct: 50,
      member_shu_pct: 60,
      other_fund_pct: 0,
    };
    const resMain = validateRatSettings(invalidMain);
    expect(resMain.valid).toBe(false);
    expect(resMain.mainTotal).toBe(110);

    const invalidSub = {
      ...createDefaultRatSettings(2026),
      member_business_pct: 80,
      member_capital_pct: 10,
    };
    const resSub = validateRatSettings(invalidSub);
    expect(resSub.valid).toBe(false);
    expect(resSub.memberSubTotal).toBe(90);
  });

  it('splits net SHU accurately across reserve, other fund, Jasa Usaha, and Jasa Modal pools', () => {
    const settings = {
      ...createDefaultRatSettings(2026),
      reserve_fund_pct: 35,
      member_shu_pct: 60,
      other_fund_pct: 5,
      member_business_pct: 70,
      member_capital_pct: 30,
    };

    const alloc = calculateShuAllocation(10_000_000, settings);
    expect(alloc.reserveFundAmount).toBe(3_500_000);
    expect(alloc.otherFundAmount).toBe(500_000);
    expect(alloc.memberShuTotal).toBe(6_000_000);
    expect(alloc.jasaUsahaPool).toBe(4_200_000);
    expect(alloc.jasaModalPool).toBe(1_800_000);
  });

  it('handles negative net SHU safely without distributing negative pools', () => {
    const settings = createDefaultRatSettings(2026);
    const alloc = calculateShuAllocation(-500_000, settings);

    expect(alloc.distributableShu).toBe(0);
    expect(alloc.reserveFundAmount).toBe(0);
    expect(alloc.memberShuTotal).toBe(0);
    expect(alloc.jasaUsahaPool).toBe(0);
    expect(alloc.jasaModalPool).toBe(0);
  });

  it('distributes SHU proportionally per member and handles zero total savings/transactions', () => {
    const distributed = distributeMemberShuRows(
      [
        {
          memberId: 'm-1',
          nrp: '001',
          nama: 'Budi',
          totalSavingsContribution: 3_000_000,
          totalTransactionContribution: 4_000_000,
        },
        {
          memberId: 'm-2',
          nrp: '002',
          nama: 'Ani',
          totalSavingsContribution: 1_000_000,
          totalTransactionContribution: 0,
        },
      ],
      1_800_000,
      4_200_000
    );

    expect(distributed.totalAllMembersSavings).toBe(4_000_000);
    expect(distributed.totalAllMembersTransactions).toBe(4_000_000);
    const budi = distributed.memberRows.find((r) => r.memberId === 'm-1')!;
    const ani = distributed.memberRows.find((r) => r.memberId === 'm-2')!;
    expect(budi.jasaModalAmount).toBe(1_350_000);
    expect(budi.jasaUsahaAmount).toBe(4_200_000);
    expect(budi.totalShuReceived).toBe(5_550_000);
    expect(ani.jasaModalAmount).toBe(450_000);
    expect(ani.jasaUsahaAmount).toBe(0);
    expect(ani.totalShuReceived).toBe(450_000);

    // Zero denominator edge case
    const zeroDist = distributeMemberShuRows(
      [
        {
          memberId: 'm-1',
          nrp: '001',
          nama: 'Budi',
          totalSavingsContribution: 0,
          totalTransactionContribution: 0,
        },
      ],
      1_000_000,
      2_000_000
    );
    expect(zeroDist.memberRows[0].totalShuReceived).toBe(0);
  });

  it('recalculates post-SHU carry-forward cash and savings balances when switching payout method', () => {
    const basePreview: YearEndClosingPreview = {
      fiscalYear: 2026,
      closingDate: '2026-12-31',
      openingNextYearDate: '2027-01-01',
      isClosed: false,
      closingRecord: null,
      closingCashBalance: 50_000_000,
      postShuCashBalance: 50_000_000,
      closingLoanReceivable: 20_000_000,
      closingStoreReceivable: 5_000_000,
      closingMemberSavings: 40_000_000,
      postShuMemberSavings: 40_000_000,
      grossSales: 100_000_000,
      cogs: 75_000_000,
      grossProfit: 25_000_000,
      goodsFinancingMargin: 5_000_000,
      opex: 10_000_000,
      netShuAmount: 20_000_000,
      reserveFundAmount: 0,
      otherFundAmount: 0,
      memberShuTotal: 0,
      jasaUsahaPool: 0,
      jasaModalPool: 0,
      totalDistributedToMembers: 0,
      totalAllMembersSavings: 0,
      totalAllMembersTransactions: 0,
      memberRows: [
        {
          memberId: 'm-1',
          nrp: '001',
          nama: 'Budi',
          totalSavingsContribution: 40_000_000,
          totalTransactionContribution: 10_000_000,
          jasaModalAmount: 0,
          jasaUsahaAmount: 0,
          totalShuReceived: 0,
        },
      ],
    };

    const cashMode = recalculatePreviewWithSettings(basePreview, {
      ...createDefaultRatSettings(2026),
      payout_method: 'CASH_PAYOUT',
    });
    expect(cashMode.memberShuTotal).toBe(12_000_000);
    expect(cashMode.postShuCashBalance).toBe(38_000_000);
    expect(cashMode.postShuMemberSavings).toBe(40_000_000);

    const creditMode = recalculatePreviewWithSettings(basePreview, {
      ...createDefaultRatSettings(2026),
      payout_method: 'CREDIT_SAVINGS',
    });
    expect(creditMode.postShuCashBalance).toBe(50_000_000);
    expect(creditMode.postShuMemberSavings).toBe(52_000_000);
  });
});

function createChain(result: { data: any; error: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
    then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe('yearEndClosingService — Preview & 1-Click Execution Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes real accounts, net SHU (POS + goods financing margin - opex), and member rows', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'fiscal_year_closings') {
        return createChain({ data: null, error: null });
      }
      if (table === 'rat_shu_settings') {
        return createChain({ data: null, error: null });
      }
      if (table === 'cash_flow') {
        return createChain({
          data: [
            { id: 'cf-1', direction: 'in', amount: 30_000_000, category: 'SALDO_AWAL_SIMPANAN', created_at: '2026-01-05T00:00:00Z' },
            { id: 'cf-2', direction: 'in', amount: 10_000_000, category: 'penjualan_tunai', reference_id: 'sale-1', created_at: '2026-06-10T00:00:00Z' },
            { id: 'cf-3', direction: 'out', amount: 2_000_000, category: 'beban_operasional', created_at: '2026-08-12T00:00:00Z' },
          ],
          error: null,
        });
      }
      if (table === 'sales') {
        return createChain({
          data: [
            {
              id: 'sale-1',
              member_id: 'm-1',
              total_amount: 10_000_000,
              paid_cash: 10_000_000,
              paid_credit: 0,
              sale_status: 'completed',
              created_at: '2026-06-10T00:00:00Z',
            },
            {
              id: 'sale-2',
              member_id: 'm-2',
              total_amount: 4_000_000,
              paid_cash: 0,
              paid_credit: 4_000_000,
              sale_status: 'completed',
              created_at: '2026-07-15T00:00:00Z',
            },
          ],
          error: null,
        });
      }
      if (table === 'sale_items') {
        return createChain({
          data: [
            { sale_id: 'sale-1', product_id: 'p-1', quantity: 10 },
            { sale_id: 'sale-2', product_id: 'p-1', quantity: 4 },
          ],
          error: null,
        });
      }
      if (table === 'products') {
        return createChain({
          data: [{ id: 'p-1', buy_price: 500_000 }], // HPP = 14 * 500k = 7,000,000
          error: null,
        });
      }
      if (table === 'loans') {
        return createChain({
          data: [
            {
              id: 'loan-1',
              member_id: 'm-2',
              principal_amount: 12_000_000,
              sisa_pinjaman: 9_000_000,
              status: 'active',
              disbursed_at: '2026-04-01',
              cost_price: 10_000_000,
              markup_amount: 2_000_000,
            },
          ],
          error: null,
        });
      }
      if (table === 'loan_repayments') {
        return createChain({
          data: [
            {
              id: 'rep-1',
              loan_id: 'loan-1',
              amount_paid: 3_000_000,
              principal_portion: 2_000_000,
              margin_portion: 1_000_000,
              payment_date: '2026-09-01',
              payment_method: 'CASH',
            },
          ],
          error: null,
        });
      }
      if (table === 'store_credit_payments') {
        return createChain({
          data: [{ id: 'scp-1', sale_id: 'sale-2', amount: 1_500_000, payment_date: '2026-09-20' }],
          error: null,
        });
      }
      if (table === 'anggota') {
        return createChain({
          data: [
            { id: 'm-1', nrp: '001', nama: 'Budi Santoso', status: 'aktif', membership_status: 'ACTIVE' },
            { id: 'm-2', nrp: '002', nama: 'Ani Wijaya', status: 'aktif', membership_status: 'ACTIVE' },
            { id: 'm-3', nrp: '003', nama: 'Mantan Anggota', status: 'nonaktif', membership_status: 'RESIGNED' },
          ],
          error: null,
        });
      }
      if (table === 'member_deposits') {
        return createChain({
          data: [
            { id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-1', balance: 6_000_000 },
            { id: 'md-2', member_id: 'm-2', deposit_type_id: 'dt-1', balance: 4_000_000 },
            { id: 'md-3', member_id: 'm-3', deposit_type_id: 'dt-1', balance: 5_000_000 },
          ],
          error: null,
        });
      }
      if (table === 'deposit_transactions') {
        return createChain({
          data: [
            { id: 'tx-1', member_deposit_id: 'md-1', transaction_type: 'deposit', amount: 6_000_000, created_at: '2026-02-01T00:00:00Z' },
            { id: 'tx-2', member_deposit_id: 'md-2', transaction_type: 'deposit', amount: 4_000_000, created_at: '2026-02-01T00:00:00Z' },
          ],
          error: null,
        });
      }
      return createChain({ data: [], error: null });
    });

    const preview = await computeYearEndPreview(2026);

    expect(preview.isClosed).toBe(false);
    expect(preview.closingCashBalance).toBe(38_000_000);
    expect(preview.closingLoanReceivable).toBe(9_000_000);
    expect(preview.closingStoreReceivable).toBe(2_500_000);
    expect(preview.closingMemberSavings).toBe(10_000_000);

    // Omzet 14M - HPP 7M = Laba Kotor 7M + Margin Pembiayaan 1M - Opex 2M = Net SHU 6M
    expect(preview.grossSales).toBe(14_000_000);
    expect(preview.cogs).toBe(7_000_000);
    expect(preview.grossProfit).toBe(7_000_000);
    expect(preview.goodsFinancingMargin).toBe(1_000_000);
    expect(preview.opex).toBe(2_000_000);
    expect(preview.netShuAmount).toBe(6_000_000);

    // 40% cadangan = 2.4M, 60% anggota = 3.6M -> 70% usaha = 2.52M, 30% modal = 1.08M
    expect(preview.reserveFundAmount).toBe(2_400_000);
    expect(preview.memberShuTotal).toBe(3_600_000);
    expect(preview.memberRows).toHaveLength(2);
    expect(preview.postShuCashBalance).toBe(38_000_000 - 3_600_000);
  });

  it('executes 1-click closing with CASH_PAYOUT: inserts PEMBAGIAN_SHU_RAT with direction="out" & audit marker', async () => {
    const insertedClosings: any[] = [];
    const insertedDistributions: any[] = [];
    const insertedCashFlows: any[] = [];
    const insertedAudits: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'fiscal_year_closings') {
        const c = createChain({ data: null, error: null });
        c.insert = vi.fn((payload: any) => {
          insertedClosings.push(payload);
          const row = { id: 'closing-2026-uuid', ...payload, executed_at: '2026-12-31T23:59:00Z' };
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: row, error: null })),
            })),
          };
        });
        return c;
      }
      if (table === 'rat_shu_settings') {
        const c = createChain({ data: null, error: null });
        c.upsert = vi.fn((payload: any) => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: payload, error: null })),
          })),
        }));
        return c;
      }
      if (table === 'shu_member_distributions') {
        return {
          insert: vi.fn(async (rows: any[]) => {
            insertedDistributions.push(...rows);
            return { data: rows, error: null };
          }),
        };
      }
      if (table === 'cash_flow') {
        const c = createChain({
          data: [
            { id: 'cf-1', direction: 'in', amount: 20_000_000, category: 'penjualan_tunai', reference_id: 's-1', created_at: '2026-05-01T00:00:00Z' },
          ],
          error: null,
        });
        c.insert = vi.fn(async (payload: any) => {
          insertedCashFlows.push(payload);
          return { data: payload, error: null };
        });
        return c;
      }
      if (table === 'sales') {
        return createChain({
          data: [{ id: 's-1', member_id: 'm-1', total_amount: 20_000_000, paid_cash: 20_000_000, paid_credit: 0, sale_status: 'completed', created_at: '2026-05-01T00:00:00Z' }],
          error: null,
        });
      }
      if (table === 'sale_items') {
        return createChain({ data: [{ sale_id: 's-1', product_id: 'p-1', quantity: 10 }], error: null });
      }
      if (table === 'products') {
        return createChain({ data: [{ id: 'p-1', buy_price: 1_000_000 }], error: null }); // COGS 10M -> Net SHU 10M
      }
      if (table === 'anggota') {
        return createChain({
          data: [{ id: 'm-1', nrp: '001', nama: 'Budi', status: 'aktif', membership_status: 'ACTIVE' }],
          error: null,
        });
      }
      if (table === 'member_deposits') {
        return createChain({ data: [{ id: 'md-1', member_id: 'm-1', balance: 5_000_000 }], error: null });
      }
      if (table === 'audit_logs') {
        return {
          insert: vi.fn(async (payload: any) => {
            insertedAudits.push(payload);
            return { data: payload, error: null };
          }),
        };
      }
      return createChain({ data: [], error: null });
    });

    const settings = createDefaultRatSettings(2026);
    const result = await executeYearEndClosing(2026, settings, 'Keputusan RAT 2026');

    expect(result.closingRecord.status).toBe('CLOSED');
    expect(result.closingRecord.fiscal_year).toBe(2026);
    expect(result.distributionsCount).toBe(1);
    expect(result.cashFlowInserted).toBe(true);
    expect(result.creditedSavingsCount).toBe(0);
    expect(result.openingMarkerLogged).toBe(true);

    expect(insertedClosings).toHaveLength(1);
    expect(insertedDistributions).toHaveLength(1);
    expect(insertedDistributions[0].total_shu_received).toBe(6_000_000);

    // Must use direction: 'out' (never type: 'out')
    expect(insertedCashFlows).toHaveLength(1);
    expect(insertedCashFlows[0].direction).toBe('out');
    expect(insertedCashFlows[0].type).toBeUndefined();
    expect(insertedCashFlows[0].category).toBe('PEMBAGIAN_SHU_RAT');
    expect(insertedCashFlows[0].amount).toBe(6_000_000);
    expect(insertedCashFlows[0].created_at).toBe('2026-12-31T23:59:00.000Z');

    expect(insertedAudits).toHaveLength(1);
    expect(insertedAudits[0].action).toBe('OPENING_BALANCE_NEW_YEAR');
    expect(insertedAudits[0].new_data.opening_shu_amount).toBe(0);
    expect(insertedAudits[0].new_data.opening_cash_balance).toBe(14_000_000);
  });

  it('executes 1-click closing with CREDIT_SAVINGS: inserts deposit_transactions without touching cash_flow', async () => {
    const insertedCashFlows: any[] = [];
    const insertedDepositTxs: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'fiscal_year_closings') {
        const c = createChain({ data: null, error: null });
        c.insert = vi.fn((payload: any) => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: 'close-2026', ...payload }, error: null })),
          })),
        }));
        return c;
      }
      if (table === 'rat_shu_settings') {
        const c = createChain({ data: null, error: null });
        c.upsert = vi.fn((payload: any) => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: payload, error: null })),
          })),
        }));
        return c;
      }
      if (table === 'shu_member_distributions') {
        return { insert: vi.fn(async () => ({ data: [], error: null })) };
      }
      if (table === 'cash_flow') {
        const c = createChain({
          data: [{ id: 'cf-1', direction: 'in', amount: 15_000_000, category: 'penjualan_tunai', reference_id: 's-1', created_at: '2026-05-01T00:00:00Z' }],
          error: null,
        });
        c.insert = vi.fn(async (payload: any) => {
          insertedCashFlows.push(payload);
          return { data: payload, error: null };
        });
        return c;
      }
      if (table === 'sales') {
        return createChain({
          data: [{ id: 's-1', member_id: 'm-1', total_amount: 15_000_000, paid_cash: 15_000_000, paid_credit: 0, sale_status: 'completed', created_at: '2026-05-01T00:00:00Z' }],
          error: null,
        });
      }
      if (table === 'sale_items') {
        return createChain({ data: [{ sale_id: 's-1', product_id: 'p-1', quantity: 5 }], error: null });
      }
      if (table === 'products') {
        return createChain({ data: [{ id: 'p-1', buy_price: 1_000_000 }], error: null }); // Net SHU 10M
      }
      if (table === 'anggota') {
        return createChain({
          data: [{ id: 'm-1', nrp: '001', nama: 'Budi', status: 'aktif', membership_status: 'ACTIVE' }],
          error: null,
        });
      }
      if (table === 'deposit_types') {
        return createChain({
          data: [{ id: 'dt-sb', code: 'SB', name: 'Simpanan Belanja', can_be_withdrawn: true, is_active: true }],
          error: null,
        });
      }
      if (table === 'member_deposits') {
        const c = createChain({
          data: [{ id: 'md-sb-1', member_id: 'm-1', deposit_type_id: 'dt-sb', balance: 2_000_000 }],
          error: null,
        });
        c.update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
        return c;
      }
      if (table === 'deposit_transactions') {
        const c = createChain({ data: [], error: null });
        c.insert = vi.fn(async (rows: any[]) => {
          insertedDepositTxs.push(...rows);
          return { data: rows, error: null };
        });
        return c;
      }
      if (table === 'audit_logs') {
        return { insert: vi.fn(async () => ({ error: null })) };
      }
      return createChain({ data: [], error: null });
    });

    const settings = {
      ...createDefaultRatSettings(2026),
      payout_method: 'CREDIT_SAVINGS' as const,
      target_deposit_type_code: 'BELANJA',
    };
    const result = await executeYearEndClosing(2026, settings);

    expect(result.cashFlowInserted).toBe(false);
    expect(insertedCashFlows).toHaveLength(0);
    expect(result.creditedSavingsCount).toBe(1);
    expect(insertedDepositTxs).toHaveLength(1);
    expect(insertedDepositTxs[0].member_deposit_id).toBe('md-sb-1');
    expect(insertedDepositTxs[0].transaction_type).toBe('deposit');
    expect(insertedDepositTxs[0].amount).toBe(6_000_000);
    expect(insertedDepositTxs[0].for_year).toBe(2026);
    expect(insertedDepositTxs[0].for_month).toBe(12);
  });

  it('prevents duplicate year-end execution if fiscal year is already CLOSED', async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'fiscal_year_closings') {
        return createChain({
          data: {
            id: 'existing-closing',
            fiscal_year: 2026,
            closing_date: '2026-12-31',
            opening_next_year_date: '2027-01-01',
            status: 'CLOSED',
            payout_method: 'CASH_PAYOUT',
          },
          error: null,
        });
      }
      return createChain({ data: null, error: null });
    });

    const existing = await getFiscalYearClosing(2026);
    expect(existing?.status).toBe('CLOSED');

    await expect(
      executeYearEndClosing(2026, createDefaultRatSettings(2026))
    ).rejects.toThrow(/sudah berstatus CLOSED/i);
  });
});
