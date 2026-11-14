import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockTables {
  anggota: any[];
  deposit_types: any[];
  member_deposits: any[];
  deposit_transactions: any[];
  savings_rate_tiers: any[];
  loans: any[];
  loan_schedules: any[];
  loan_repayments: any[];
  loan_installments: any[];
  monthly_loan_commitments: any[];
  cash_flow: any[];
  system_settings: any[];
  koperasi_profile: any[];
}

const insertedLog: { table: string; payload: any }[] = [];
const updatedLog: { table: string; payload: any; filters: Record<string, any> }[] = [];

let tables: MockTables;

function resetTables(overrides: Partial<MockTables> = {}) {
  insertedLog.length = 0;
  updatedLog.length = 0;
  tables = {
    anggota: [
      {
        id: 'mem-1',
        nama: 'Budi Santoso',
        nrp: '88010023',
        pangkat: 'Sertu',
        created_at: '2026-11-05T08:00:00Z',
      },
    ],
    deposit_types: [
      { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok', default_amount: 500000, is_active: true },
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 200000, is_active: true },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja', default_amount: 25000, is_active: true },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 50000, is_active: true },
    ],
    member_deposits: [
      { id: 'md-pokok', member_id: 'mem-1', deposit_type_id: 'dt-pokok', balance: 200000 },
      { id: 'md-wajib', member_id: 'mem-1', deposit_type_id: 'dt-wajib', balance: 50000 },
      { id: 'md-belanja', member_id: 'mem-1', deposit_type_id: 'dt-belanja', balance: 25000 },
      { id: 'md-lebaran', member_id: 'mem-1', deposit_type_id: 'dt-lebaran', balance: 50000 },
    ],
    deposit_transactions: [
      {
        id: 'tx-pokok-init',
        member_deposit_id: 'md-pokok',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: null,
        for_year: null,
        description: 'Saldo Awal Simpanan (Aktif sejak 2026-10-01)',
      },
      {
        id: 'tx-wajib-okt-partial',
        member_deposit_id: 'md-wajib',
        transaction_type: 'deposit',
        amount: 50000,
        for_month: 10,
        for_year: 2026,
        description: 'Setoran Simpanan Wajib (Okt 2026)',
      },
      {
        id: 'tx-belanja-okt',
        member_deposit_id: 'md-belanja',
        transaction_type: 'deposit',
        amount: 25000,
        for_month: 10,
        for_year: 2026,
        description: 'Setoran Simpanan Belanja (Okt 2026)',
      },
      {
        id: 'tx-lebaran-okt',
        member_deposit_id: 'md-lebaran',
        transaction_type: 'deposit',
        amount: 50000,
        for_month: 10,
        for_year: 2026,
        description: 'Setoran Simpanan Lebaran (Okt 2026)',
      },
    ],
    savings_rate_tiers: [
      {
        id: 'tier-wajib',
        deposit_type_code: 'WAJIB',
        start_year: 2025,
        start_month: 11,
        end_year: null,
        end_month: null,
        monthly_rate: 200000,
      },
      {
        id: 'tier-belanja',
        deposit_type_code: 'BELANJA',
        start_year: 2020,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 25000,
      },
      {
        id: 'tier-lebaran',
        deposit_type_code: 'LEBARAN',
        start_year: 2020,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 50000,
      },
    ],
    loans: [
      {
        id: 'loan-1',
        member_id: 'mem-1',
        loan_type_name: 'Pinjaman Reguler',
        status: 'active',
        tenor: 6,
        sisa_pinjaman: 3000000,
      },
    ],
    loan_schedules: [
      {
        id: 'sched-sep-precutoff',
        loan_id: 'loan-1',
        period_number: 1,
        due_date: '2026-09-15',
        total_amount: 1000000,
        paid_amount: 0,
        status: 'unpaid',
      },
      {
        id: 'sched-okt',
        loan_id: 'loan-1',
        period_number: 2,
        due_date: '2026-10-15',
        total_amount: 1000000,
        paid_amount: 0,
        status: 'unpaid',
      },
      {
        id: 'sched-nov',
        loan_id: 'loan-1',
        period_number: 3,
        due_date: '2026-11-15',
        total_amount: 1000000,
        paid_amount: 200000,
        status: 'partial',
      },
      {
        id: 'sched-des-future',
        loan_id: 'loan-1',
        period_number: 4,
        due_date: '2026-12-15',
        total_amount: 1000000,
        paid_amount: 0,
        status: 'unpaid',
      },
    ],
    loan_repayments: [],
    loan_installments: [],
    monthly_loan_commitments: [],
    cash_flow: [],
    system_settings: [
      { setting_key: 'initial_savings_effective_date', setting_value: '2026-10-01' },
      { setting_key: 'initial_loans_effective_date', setting_value: '2026-10-01' },
    ],
    koperasi_profile: [
      {
        id: 1,
        nama_koperasi: 'PRIMKOPPOL RESOR KUPANG',
        alamat: 'Jl. Bhayangkara No. 1 Kupang',
        telepon: '0380-123456',
        terminal_name: 'KASIR-01',
        footer_notes: 'Terima kasih atas partisipasi Anda',
      },
    ],
    ...overrides,
  };
}

function createQueryBuilder(tableName: keyof MockTables) {
  let op: 'select' | 'insert' | 'update' = 'select';
  let writePayload: any = null;
  const eqFilters: Record<string, any> = {};
  const neqFilters: Record<string, any> = {};
  const inFilters: Record<string, any[]> = {};
  let orderByCol: string | null = null;
  let orderAsc = true;
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;
  let singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

  const applyFilters = (rows: any[]) => {
    let filtered = rows.filter((row) => {
      for (const [k, v] of Object.entries(eqFilters)) {
        if (row[k] !== v) return false;
      }
      for (const [k, v] of Object.entries(neqFilters)) {
        if (row[k] === v) return false;
      }
      for (const [k, arr] of Object.entries(inFilters)) {
        if (!arr.includes(row[k])) return false;
      }
      return true;
    });

    if (orderByCol) {
      const col = orderByCol;
      filtered = [...filtered].sort((a, b) => {
        if (a[col] < b[col]) return orderAsc ? -1 : 1;
        if (a[col] > b[col]) return orderAsc ? 1 : -1;
        return 0;
      });
    }

    if (rangeStart !== null && rangeEnd !== null) {
      filtered = filtered.slice(rangeStart, rangeEnd + 1);
    }

    return filtered;
  };

  const execute = async () => {
    const tableRows = tables[tableName] as any[];

    if (op === 'insert') {
      const rowsToInsert = Array.isArray(writePayload) ? writePayload : [writePayload];
      const inserted = rowsToInsert.map((r, i) => ({
        id: r.id || `${tableName}-${tableRows.length + i + 1}`,
        ...r,
      }));
      tableRows.push(...inserted);
      for (const item of inserted) {
        insertedLog.push({ table: tableName, payload: item });
      }
      if (singleMode === 'single' || singleMode === 'maybeSingle') {
        return { data: inserted[0] || null, error: null };
      }
      return { data: inserted, error: null };
    }

    if (op === 'update') {
      const matched = applyFilters(tableRows);
      for (const row of matched) {
        Object.assign(row, writePayload);
      }
      updatedLog.push({ table: tableName, payload: writePayload, filters: { ...eqFilters } });
      return { data: matched, error: null };
    }

    const result = applyFilters(tableRows);
    if (singleMode === 'single') {
      if (result.length === 0) {
        return { data: null, error: { message: 'Row not found' } };
      }
      return { data: result[0], error: null };
    }
    if (singleMode === 'maybeSingle') {
      return { data: result[0] || null, error: null };
    }
    return { data: result, error: null };
  };

  const builder: any = {
    select: () => builder,
    insert: (payload: any) => {
      op = 'insert';
      writePayload = payload;
      return builder;
    },
    update: (payload: any) => {
      op = 'update';
      writePayload = payload;
      return builder;
    },
    eq: (col: string, val: any) => {
      eqFilters[col] = val;
      return builder;
    },
    neq: (col: string, val: any) => {
      neqFilters[col] = val;
      return builder;
    },
    in: (col: string, vals: any[]) => {
      inFilters[col] = vals;
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderByCol = col;
      orderAsc = opts?.ascending !== false;
      return builder;
    },
    range: (start: number, end: number) => {
      rangeStart = start;
      rangeEnd = end;
      return builder;
    },
    single: () => {
      singleMode = 'single';
      return builder;
    },
    maybeSingle: () => {
      singleMode = 'maybeSingle';
      return builder;
    },
    then: (resolve: any, reject: any) => execute().then(resolve, reject),
  };

  return builder;
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: (tableName: keyof MockTables) => createQueryBuilder(tableName),
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'cashier-1', email: 'kasir@simkop.id' } },
      })),
    },
  },
}));

vi.mock('./depositManagementService', () => ({
  ensureMandatoryDepositsAndEnroll: vi.fn(async () => undefined),
}));

vi.mock('./savingsRateService', async () => {
  const actual = await vi.importActual<typeof import('./savingsRateService')>('./savingsRateService');
  return {
    ...actual,
    getActivePokokTariff: vi.fn(async () => 500000),
    getRateTiers: vi.fn(async () => tables.savings_rate_tiers),
  };
});

vi.mock('./savingsMatrixService', async () => {
  const actual = await vi.importActual<typeof import('./savingsMatrixService')>('./savingsMatrixService');
  return {
    ...actual,
    getInitialSavingsCutOffDate: vi.fn(async () => '2026-10-01'),
  };
});

vi.mock('./loanMatrixService', async () => {
  const actual = await vi.importActual<typeof import('./loanMatrixService')>('./loanMatrixService');
  return {
    ...actual,
    getInitialLoansCutOffDate: vi.fn(async () => '2026-10-01'),
  };
});

vi.mock('./settingsService', async () => {
  const actual = await vi.importActual<typeof import('./settingsService')>('./settingsService');
  return {
    ...actual,
    getKoperasiProfile: vi.fn(async () => tables.koperasi_profile[0]),
  };
});

import {
  calculateMemberCumulativeBills,
  processMemberPayment,
} from './setoranService';

describe('setoranService — Cumulative Arrears & FIFO Settlement', () => {
  beforeEach(() => {
    resetTables();
  });

  it('aggregates post-cut-off arrears (Oct 2026) and current period (Nov 2026) accurately despite Nov created_at', async () => {
    const summary = await calculateMemberCumulativeBills('mem-1', 2026, 11);

    expect(summary.savingsCutoffDate).toBe('2026-10-01');
    expect(summary.loansCutoffDate).toBe('2026-10-01');

    // 1. Pokok deficit: 500k - 200k = 300k
    const pokok = summary.items.find((i) => i.code === 'POKOK');
    expect(pokok).toBeDefined();
    expect(pokok!.totalDue).toBe(300000);

    // 2. Wajib: Oct 2026 remaining (200k - 50k = 150k Tunggakan) + Nov 2026 (200k Bulan Ini) = 350k
    const wajib = summary.items.find((i) => i.code === 'WAJIB');
    expect(wajib).toBeDefined();
    expect(wajib!.totalDue).toBe(350000);
    expect(wajib!.arrearsAmount).toBe(150000);
    expect(wajib!.currentMonthAmount).toBe(200000);
    expect(wajib!.unpaidMonths).toHaveLength(2);
    expect(wajib!.unpaidMonths[0]).toMatchObject({
      year: 2026,
      month: 10,
      label: 'Okt 2026',
      remaining: 150000,
      isArrears: true,
      statusLabel: 'Tunggakan',
    });
    expect(wajib!.unpaidMonths[1]).toMatchObject({
      year: 2026,
      month: 11,
      label: 'Nov 2026',
      remaining: 200000,
      isArrears: false,
      statusLabel: 'Bulan Ini',
    });

    // 3. Belanja (25k Nov) & Lebaran (50k Nov)
    const belanja = summary.items.find((i) => i.code === 'BELANJA');
    expect(belanja!.totalDue).toBe(25000);
    expect(belanja!.arrearsAmount).toBe(0);

    const lebaran = summary.items.find((i) => i.code === 'LEBARAN');
    expect(lebaran!.totalDue).toBe(50000);

    // 4. Loan: excludes Sep 2026 pre-cutoff and Dec 2026 future; includes Oct (1.0M) + Nov partial (800k) = 1.8M
    const loan = summary.items.find((i) => i.category === 'loan');
    expect(loan).toBeDefined();
    expect(loan!.totalDue).toBe(1800000);
    expect(loan!.arrearsAmount).toBe(1000000);
    expect(loan!.currentMonthAmount).toBe(800000);
    expect(loan!.unpaidMonths.map((m) => m.scheduleId)).toEqual(['sched-okt', 'sched-nov']);
  });

  it('allocates partial savings payment chronologically (FIFO) and records transfer_bank payment_method & cash_flow', async () => {
    const summary = await calculateMemberCumulativeBills('mem-1', 2026, 11);
    const wajib = summary.items.find((i) => i.code === 'WAJIB')!;

    // Pay Rp 250.000 against Okt (150k remaining) + Nov (200k remaining)
    const receipt = await processMemberPayment({
      member: summary.member,
      items: [{ item: wajib, payAmount: 250000 }],
      paymentMethod: 'transfer_bank',
      cashierId: 'cashier-1',
      cashierName: 'Siti Kasir',
      selectedYear: 2026,
      selectedMonth: 11,
    });

    expect(receipt.receiptNo).toMatch(/^KW-SETOR-\d{8}-\d{4}$/);
    expect(receipt.paymentMethod).toBe('transfer_bank');
    expect(receipt.paymentMethodLabel).toBe('Transfer Bank');
    expect(receipt.totalPaid).toBe(250000);
    expect(receipt.koperasiProfile.nama_koperasi).toBe('PRIMKOPPOL RESOR KUPANG');

    // Should split across 2 rows: Oct 2026 (150k) first, then Nov 2026 (100k)
    const txInserts = insertedLog.filter((l) => l.table === 'deposit_transactions');
    expect(txInserts).toHaveLength(2);

    expect(txInserts[0].payload).toMatchObject({
      member_deposit_id: 'md-wajib',
      transaction_type: 'deposit',
      amount: 150000,
      for_month: 10,
      for_year: 2026,
      reference_no: receipt.receiptNo,
      payment_method: 'transfer_bank',
      created_by: 'cashier-1',
    });

    expect(txInserts[1].payload).toMatchObject({
      member_deposit_id: 'md-wajib',
      transaction_type: 'deposit',
      amount: 100000,
      for_month: 11,
      for_year: 2026,
      reference_no: receipt.receiptNo,
      payment_method: 'transfer_bank',
      created_by: 'cashier-1',
    });

    expect(receipt.lines).toHaveLength(2);
    expect(receipt.lines[0]).toMatchObject({
      periodLabel: 'Okt 2026',
      allocationTag: 'Tunggakan',
      amount: 150000,
      remainingAfter: 0,
    });
    expect(receipt.lines[1]).toMatchObject({
      periodLabel: 'Nov 2026',
      allocationTag: 'Bulan Ini',
      amount: 100000,
      remainingAfter: 100000,
    });

    const cashFlowInserts = insertedLog.filter((l) => l.table === 'cash_flow');
    expect(cashFlowInserts).toHaveLength(1);
    expect(cashFlowInserts[0].payload).toMatchObject({
      direction: 'in',
      amount: 250000,
      category: 'SETORAN_ANGGOTA',
    });
    expect(cashFlowInserts[0].payload.description).toContain('Transfer Bank');
    expect(cashFlowInserts[0].payload.description).toContain(receipt.receiptNo);
  });

  it('allocates FIFO loan schedules with tunai payment method, updates loan_schedules & sisa_pinjaman, and suffixes multi-row receipt_number', async () => {
    const summary = await calculateMemberCumulativeBills('mem-1', 2026, 11);
    const loanItem = summary.items.find((i) => i.category === 'loan')!;

    // Pay Rp 1.300.000 against Okt (1.000.000 due) + Nov (800.000 remaining due)
    const receipt = await processMemberPayment({
      member: summary.member,
      items: [{ item: loanItem, payAmount: 1300000 }],
      paymentMethod: 'tunai',
      cashierId: 'cashier-1',
      cashierName: 'Siti Kasir',
      selectedYear: 2026,
      selectedMonth: 11,
    });

    expect(receipt.paymentMethod).toBe('tunai');
    expect(receipt.paymentMethodLabel).toBe('Tunai');
    expect(receipt.totalPaid).toBe(1300000);

    // Check loan_schedules statuses after update
    const schedOkt = tables.loan_schedules.find((s) => s.id === 'sched-okt');
    const schedNov = tables.loan_schedules.find((s) => s.id === 'sched-nov');
    expect(schedOkt.paid_amount).toBe(1000000);
    expect(schedOkt.status).toBe('paid');
    expect(schedNov.paid_amount).toBe(500000); // 200k previously + 300k now
    expect(schedNov.status).toBe('partial');

    // Check loan_repayments inserts have unique receipt_number suffix and payment_method: 'tunai'
    const repaymentInserts = insertedLog.filter((l) => l.table === 'loan_repayments');
    expect(repaymentInserts).toHaveLength(2);
    expect(repaymentInserts[0].payload).toMatchObject({
      loan_id: 'loan-1',
      schedule_id: 'sched-okt',
      amount_paid: 1000000,
      payment_method: 'tunai',
      receipt_number: `${receipt.receiptNo}-L1`,
    });
    expect(repaymentInserts[1].payload).toMatchObject({
      loan_id: 'loan-1',
      schedule_id: 'sched-nov',
      amount_paid: 300000,
      payment_method: 'tunai',
      receipt_number: `${receipt.receiptNo}-L2`,
    });

    // Check loan remains active because Dec future schedule is still unpaid
    const loanRow = tables.loans.find((l) => l.id === 'loan-1');
    expect(loanRow.sisa_pinjaman).toBe(1700000); // 3.000.000 - 1.300.000
    expect(loanRow.status).toBe('active');
  });

  it('rejects empty/zero payment amounts cleanly', async () => {
    await expect(
      processMemberPayment({
        member: { id: 'mem-1', nama: 'Budi Santoso', nrp: '88010023' },
        items: [],
        paymentMethod: 'tunai',
      })
    ).rejects.toThrow(/nominal pembayaran lebih dari Rp 0/i);
  });
});
