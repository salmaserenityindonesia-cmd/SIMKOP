import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFrom,
  mockGetUser,
  mockInsertAuditLog,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
  mockInsertAuditLog: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: mockFrom,
    auth: {
      getUser: mockGetUser,
    },
  },
}));

vi.mock('./auditService', () => ({
  insertAuditLog: mockInsertAuditLog,
}));

import {
  calculateMonthlySnapshot,
  getMonthlyClosingsByYear,
  saveMonthlyClosing,
} from './monthlyClosingService';

function createTableMock(rows: any[], extra: Record<string, any> = {}) {
  const result = { data: rows, error: null };
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    upsert: vi.fn((payload: any) => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: 'closing-1', ...payload },
          error: null,
        })),
      })),
      then: (resolve: any) => resolve({ data: [{ id: 'closing-1', ...payload }], error: null }),
    })),
    then: (resolve: any, reject?: any) => Promise.resolve(result).then(resolve, reject),
    ...extra,
  };
  return builder;
}

describe('monthlyClosingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-user-1' } } });
    mockInsertAuditLog.mockResolvedValue({ data: null, error: null });
  });

  it('computes cash continuity, savings P/W/B/L, receivables, inventory, and monthly vs YTD SHU', async () => {
    const tables: Record<string, any[]> = {
      cash_flow: [
        // Prior month cash in: 5,000,000
        {
          id: 'cf-1',
          created_at: '2026-10-15T10:00:00.000Z',
          category: 'SETORAN_SIMPANAN',
          direction: 'in',
          amount: 5000000,
          reference_id: 'dep-1',
        },
        // Prior month opex: 200,000
        {
          id: 'cf-2',
          created_at: '2026-10-20T10:00:00.000Z',
          category: 'beban_operasional',
          direction: 'out',
          amount: 200000,
          reference_id: null,
        },
        // November POS cash sale: 1,000,000
        {
          id: 'cf-3',
          created_at: '2026-11-10T10:00:00.000Z',
          category: 'penjualan_tunai',
          direction: 'in',
          amount: 1000000,
          reference_id: 'sale-nov',
        },
        // November opex: 150,000
        {
          id: 'cf-4',
          created_at: '2026-11-12T10:00:00.000Z',
          category: 'beban_operasional',
          direction: 'out',
          amount: 150000,
          reference_id: null,
        },
      ],
      sales: [
        // October sale: total 500,000 (cash 500,000 - unlinked to cash_flow)
        {
          id: 'sale-oct',
          member_id: 'm-1',
          total_amount: 500000,
          paid_cash: 500000,
          paid_credit: 0,
          sale_status: 'completed',
          created_at: '2026-10-05T09:00:00.000Z',
        },
        // November sale: total 1,400,000 (cash 1,000,000 linked in cash_flow + credit 400,000)
        {
          id: 'sale-nov',
          member_id: 'm-1',
          total_amount: 1400000,
          paid_cash: 1000000,
          paid_credit: 400000,
          sale_status: 'completed',
          created_at: '2026-11-10T10:00:00.000Z',
        },
      ],
      sale_items: [
        { sale_id: 'sale-oct', product_id: 'prod-1', quantity: 2 }, // COGS 2 * 150k = 300k
        { sale_id: 'sale-nov', product_id: 'prod-1', quantity: 5 }, // COGS 5 * 150k = 750k
      ],
      products: [
        { id: 'prod-1', buy_price: 150000, stock: 10, is_active: true }, // 1,500,000
        { id: 'prod-inactive', buy_price: 50000, stock: 5, is_active: false },
      ],
      anggota: [
        { id: 'm-1', status: 'aktif', membership_status: 'ACTIVE' },
        { id: 'm-resigned', status: 'nonaktif', membership_status: 'RESIGNED' },
      ],
      deposit_types: [
        { id: 'dt-p', code: 'POKOK', name: 'Simpanan Pokok' },
        { id: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib' },
        { id: 'dt-b', code: 'BELANJA', name: 'Simpanan Belanja' },
        { id: 'dt-l', code: 'LEBARAN', name: 'Simpanan Lebaran' },
      ],
      member_deposits: [
        { id: 'md-p', member_id: 'm-1', deposit_type_id: 'dt-p', balance: 0 },
        { id: 'md-w', member_id: 'm-1', deposit_type_id: 'dt-w', balance: 0 },
        { id: 'md-b', member_id: 'm-1', deposit_type_id: 'dt-b', balance: 0 },
        { id: 'md-l', member_id: 'm-1', deposit_type_id: 'dt-l', balance: 0 },
        { id: 'md-resigned', member_id: 'm-resigned', deposit_type_id: 'dt-p', balance: 999999 },
      ],
      deposit_transactions: [
        {
          id: 'tx-1',
          member_deposit_id: 'md-p',
          transaction_type: 'deposit',
          amount: 100000,
          created_at: '2026-01-10T00:00:00.000Z',
        },
        {
          id: 'tx-2',
          member_deposit_id: 'md-w',
          transaction_type: 'deposit',
          amount: 250000,
          created_at: '2026-11-01T00:00:00.000Z',
        },
        {
          id: 'tx-3',
          member_deposit_id: 'md-b',
          transaction_type: 'deposit',
          amount: 300000,
          created_at: '2026-11-05T00:00:00.000Z',
        },
        {
          id: 'tx-4',
          member_deposit_id: 'md-b',
          transaction_type: 'withdrawal',
          amount: 50000,
          created_at: '2026-11-15T00:00:00.000Z',
        },
        {
          id: 'tx-5',
          member_deposit_id: 'md-l',
          transaction_type: 'deposit',
          amount: 400000,
          created_at: '2026-11-20T00:00:00.000Z',
        },
        // December transaction should be excluded for November snapshot
        {
          id: 'tx-dec',
          member_deposit_id: 'md-l',
          transaction_type: 'deposit',
          amount: 900000,
          created_at: '2026-12-01T00:00:00.000Z',
        },
      ],
      loans: [
        {
          id: 'loan-1',
          member_id: 'm-1',
          amount: 2000000,
          principal_amount: 2000000,
          sisa_pinjaman: 1200000,
          status: 'active',
          disbursed_at: '2026-09-01',
        },
      ],
      loan_repayments: [
        {
          id: 'rep-oct',
          loan_id: 'loan-1',
          amount_paid: 300000,
          margin_portion: 40000,
          payment_date: '2026-10-25',
          payment_method: 'POTONG_GAJI',
        },
        {
          id: 'rep-nov',
          loan_id: 'loan-1',
          amount_paid: 300000,
          margin_portion: 50000,
          payment_date: '2026-11-25',
          payment_method: 'POTONG_GAJI',
        },
        // Future repayment in Dec adds back 200k to Nov remaining
        {
          id: 'rep-dec',
          loan_id: 'loan-1',
          amount_paid: 200000,
          margin_portion: 30000,
          payment_date: '2026-12-10',
          payment_method: 'POTONG_GAJI',
        },
      ],
      store_credit_payments: [
        {
          id: 'scp-1',
          sale_id: 'sale-nov',
          amount: 100000,
          payment_date: '2026-11-22',
        },
      ],
      stock_opname_adjustments: [
        {
          id: 'op-1',
          qty_in: 1,
          qty_out: 0,
          unit_cost: 20000,
          created_at: '2026-11-18T10:00:00.000Z',
        },
      ],
    };

    mockFrom.mockImplementation((tableName: string) =>
      createTableMock(tables[tableName] || [])
    );

    const snap = await calculateMonthlySnapshot(2026, 11);

    // Opening cash: 5,000,000 - 200,000 + 500,000 (unlinked Oct POS cash) = 5,300,000
    expect(snap.openingCashBalance).toBe(5300000);
    expect(snap.monthlyCashIn).toBe(1000000);
    expect(snap.monthlyCashOut).toBe(150000);
    expect(snap.closingCashBalance).toBe(6150000);

    // Savings P/W/B/L for active members only
    expect(snap.savingsPokok).toBe(100000);
    expect(snap.savingsWajib).toBe(250000);
    expect(snap.savingsBelanja).toBe(250000);
    expect(snap.savingsLebaran).toBe(400000);
    expect(snap.totalSavingsBalance).toBe(1000000);

    // Loan receivable at Nov 30: current sisa_pinjaman (1,200,000) + Dec repayment (200,000) = 1,400,000
    expect(snap.activeLoanCount).toBe(1);
    expect(snap.totalLoanReceivable).toBe(1400000);

    // Store credit receivable: 400,000 - 100,000 = 300,000
    expect(snap.totalStoreCreditReceivable).toBe(300000);

    // Inventory valuation: 10 * 150,000 = 1,500,000 (inactive excluded)
    expect(snap.inventoryValuation).toBe(1500000);

    // Monthly SHU: rev 1,400,000 - cogs 750,000 + margin 50,000 + opname 20,000 - opex 150,000 = 570,000
    expect(snap.monthlyRevenue).toBe(1400000);
    expect(snap.monthlyCogs).toBe(750000);
    expect(snap.monthlyFinancingMargin).toBe(50000);
    expect(snap.monthlyOpnameImpact).toBe(20000);
    expect(snap.monthlyOpex).toBe(150000);
    expect(snap.monthlyNetShu).toBe(570000);

    // YTD SHU: rev 1,900,000 - cogs 1,050,000 + margin 90,000 + opname 20,000 - opex 350,000 = 610,000
    expect(snap.ytdRevenue).toBe(1900000);
    expect(snap.ytdCogs).toBe(1050000);
    expect(snap.ytdFinancingMargin).toBe(90000);
    expect(snap.ytdOpex).toBe(350000);
    expect(snap.ytdNetShu).toBe(610000);
  });

  it('upserts monthly closing archive and records audit log', async () => {
    const monthlyClosingsBuilder = createTableMock([]);
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'monthly_closings') return monthlyClosingsBuilder;
      return createTableMock([]);
    });

    const saved = await saveMonthlyClosing({
      snapshot: {
        fiscalYear: 2026,
        periodMonth: 11,
        cutoffDate: '2026-11-30',
        openingCashBalance: 5300000,
        monthlyCashIn: 1000000,
        monthlyCashOut: 150000,
        closingCashBalance: 6150000,
        totalSavingsBalance: 1000000,
        savingsPokok: 100000,
        savingsWajib: 250000,
        savingsBelanja: 250000,
        savingsLebaran: 400000,
        activeLoanCount: 1,
        totalLoanReceivable: 1400000,
        totalStoreCreditReceivable: 300000,
        inventoryValuation: 1500000,
        monthlyRevenue: 1400000,
        monthlyCogs: 750000,
        monthlyGrossProfit: 650000,
        monthlyFinancingMargin: 50000,
        monthlyOpnameImpact: 20000,
        monthlyOpex: 150000,
        monthlyNetShu: 570000,
        ytdRevenue: 1900000,
        ytdCogs: 1050000,
        ytdGrossProfit: 850000,
        ytdFinancingMargin: 90000,
        ytdOpnameImpact: 20000,
        ytdOpex: 350000,
        ytdNetShu: 610000,
      },
      minutesNumber: 'BA-EVAL/2026/11',
      meetingDate: '2026-11-30',
      attendees: 'Ketua, Bendahara, Pengawas',
      evaluationNotes: 'Kas brankas sesuai fisik.',
    });

    expect(monthlyClosingsBuilder.upsert).toHaveBeenCalledTimes(1);
    expect(saved.fiscal_year).toBe(2026);
    expect(saved.period_month).toBe(11);
    expect(saved.minutes_number).toBe('BA-EVAL/2026/11');
    expect(mockInsertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        table_name: 'monthly_closings',
        action: 'MONTHLY_CLOSING_ARCHIVE',
        performed_by: 'admin-user-1',
      })
    );
  });

  it('fetches and sorts monthly closings for a fiscal year', async () => {
    mockFrom.mockImplementation((tableName: string) => {
      if (tableName === 'monthly_closings') {
        return createTableMock([
          { id: 'c-11', fiscal_year: 2026, period_month: 11, closing_cash_balance: 6150000 },
          { id: 'c-10', fiscal_year: 2026, period_month: 10, closing_cash_balance: 5300000 },
        ]);
      }
      return createTableMock([]);
    });

    const rows = await getMonthlyClosingsByYear(2026);
    expect(rows.map((r) => r.period_month)).toEqual([10, 11]);
  });
});
