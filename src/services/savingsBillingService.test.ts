import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatShortPeriod,
  formatUnpaidMonthsSummary,
  getAggregateSavingsBills,
  paySavingsBillArrears,
} from './savingsBillingService';
import { clearTierCache } from './savingsRateService';

interface MockTables {
  anggota: any[];
  deposit_types: any[];
  member_deposits: any[];
  deposit_transactions: any[];
  savings_rate_tiers: any[];
  member_lebaran_rates: any[];
  system_settings: any[];
  cash_flow: any[];
  audit_logs: any[];
}

const insertedLog: { table: string; payload: any }[] = [];
let tables: MockTables;

function resetTables(overrides: Partial<MockTables> = {}) {
  insertedLog.length = 0;
  tables = {
    anggota: [
      {
        id: 'mem-1',
        nama: 'Budi Santoso',
        nrp: '88010023',
        pangkat: 'Sertu',
        status: 'aktif',
        membership_status: 'ACTIVE',
        created_at: '2026-11-05T08:00:00Z',
        joined_at: null,
      },
    ],
    deposit_types: [
      {
        id: 'dt-pokok',
        code: 'SP',
        name: 'Simpanan Pokok',
        frequency_type: 'one_time',
        default_amount: 100000,
        is_active: true,
      },
      {
        id: 'dt-wajib',
        code: 'SW',
        name: 'Simpanan Wajib',
        frequency_type: 'monthly',
        default_amount: 200000,
        is_active: true,
      },
      {
        id: 'dt-belanja',
        code: 'SB',
        name: 'Simpanan Belanja',
        frequency_type: 'monthly',
        default_amount: 50000,
        is_active: true,
      },
      {
        id: 'dt-lebaran',
        code: 'SL',
        name: 'Simpanan Hari Raya (Lebaran)',
        frequency_type: 'monthly',
        default_amount: 100000,
        is_active: true,
      },
      {
        id: 'dt-sukarela',
        code: 'SS',
        name: 'Simpanan Sukarela',
        frequency_type: 'voluntary',
        default_amount: 0,
        is_active: true,
      },
    ],
    member_deposits: [
      { id: 'md-pokok-1', member_id: 'mem-1', deposit_type_id: 'dt-pokok' },
      { id: 'md-wajib-1', member_id: 'mem-1', deposit_type_id: 'dt-wajib' },
      { id: 'md-belanja-1', member_id: 'mem-1', deposit_type_id: 'dt-belanja' },
      { id: 'md-lebaran-1', member_id: 'mem-1', deposit_type_id: 'dt-lebaran' },
    ],
    deposit_transactions: [],
    savings_rate_tiers: [
      {
        id: 'tier-wajib-2026',
        deposit_type_code: 'WAJIB',
        start_year: 2026,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 200000,
      },
      {
        id: 'tier-belanja-2026',
        deposit_type_code: 'BELANJA',
        start_year: 2026,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 50000,
      },
      {
        id: 'tier-lebaran-2026',
        deposit_type_code: 'LEBARAN',
        start_year: 2026,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 100000,
      },
    ],
    member_lebaran_rates: [],
    system_settings: [{ key: 'initial_savings_effective_date', value: '2026-03-01' }],
    cash_flow: [],
    audit_logs: [],
    ...overrides,
  };
}

function createQueryBuilder(tableName: keyof MockTables) {
  let op: 'select' | 'insert' = 'select';
  let writePayload: any = null;
  const eqFilters: Record<string, any> = {};
  let orderByCol: string | null = null;
  let orderAsc = true;
  let rangeStart: number | null = null;
  let rangeEnd: number | null = null;
  let singleMode: 'none' | 'single' | 'maybeSingle' = 'none';

  const applyFilters = (rows: any[]) => {
    let filtered = (rows || []).filter((row) => {
      for (const [k, v] of Object.entries(eqFilters)) {
        if (row[k] !== v) return false;
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
    const tableRows = (tables[tableName] || []) as any[];

    if (op === 'insert') {
      const rowsToInsert = Array.isArray(writePayload) ? writePayload : [writePayload];
      const inserted = rowsToInsert.map((r, i) => ({
        id: r.id || `${tableName}-${tableRows.length + i + 1}`,
        created_at: r.created_at || '2026-11-19T04:15:00.000Z',
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

    const result = applyFilters(tableRows);
    if (singleMode === 'single') {
      if (result.length === 0) return { data: null, error: { message: 'Row not found' } };
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
    eq: (col: string, val: any) => {
      eqFilters[col] = val;
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
        data: { user: { id: 'admin-1', email: 'admin@simkop.id' } },
      })),
    },
  },
}));

vi.mock('./depositManagementService', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    ensureMandatoryDepositsAndEnroll: vi.fn(async () => undefined),
  };
});

describe('savingsBillingService — Aggregate Arrears & Billing', () => {
  beforeEach(() => {
    clearTierCache();
    resetTables();
  });

  it('calculates full 9-month arrears (Mar-26 s/d Nov-26 = Rp 1.800.000) for unpaid Simpanan Wajib', async () => {
    const dataset = await getAggregateSavingsBills(11, 2026);
    const wajibRow = dataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.deposit_code === 'WAJIB'
    );

    expect(wajibRow).toBeDefined();
    expect(wajibRow!.previousArrearsMonthsCount).toBe(8);
    expect(wajibRow!.previousArrearsAmount).toBe(1600000);
    expect(wajibRow!.currentMonthDue).toBe(200000);
    expect(wajibRow!.currentMonthPaid).toBe(0);
    expect(wajibRow!.totalAggregateBill).toBe(1800000);
    expect(wajibRow!.remainingArrears).toBe(1800000);
    expect(wajibRow!.unpaidMonthsCount).toBe(9);
    expect(wajibRow!.unpaidMonthsSummary).toBe('Mar-26 s/d Nov-26');
    expect(wajibRow!.status).toBe('MENUNGGAK');

    // Voluntary savings should NOT be billed
    const sukarelaRow = dataset.rows.find((r) => r.deposit_code === 'SS');
    expect(sukarelaRow).toBeUndefined();
  });

  it('keeps Mar-26 cut-off for bulk-imported members (recent created_at) and uses explicit joined_at when post-cutoff', async () => {
    resetTables({
      anggota: [
        {
          id: 'mem-bulk',
          nama: 'Anggota Impor',
          nrp: '111111',
          status: 'aktif',
          membership_status: 'ACTIVE',
          created_at: '2026-11-10T00:00:00Z',
          joined_at: null,
        },
        {
          id: 'mem-new',
          nama: 'Anggota Baru Sep',
          nrp: '222222',
          status: 'aktif',
          membership_status: 'ACTIVE',
          created_at: '2026-09-05T00:00:00Z',
          joined_at: '2026-09-05',
        },
      ],
      member_deposits: [],
    });

    const dataset = await getAggregateSavingsBills(11, 2026);
    const bulkWajib = dataset.rows.find(
      (r) => r.member_id === 'mem-bulk' && r.deposit_code === 'WAJIB'
    );
    const newWajib = dataset.rows.find(
      (r) => r.member_id === 'mem-new' && r.deposit_code === 'WAJIB'
    );

    expect(bulkWajib!.unpaidMonthsCount).toBe(9);
    expect(bulkWajib!.remainingArrears).toBe(1800000);

    // mem-new joined Sep-26 -> only Sep, Okt, Nov (3 months)
    expect(newWajib!.unpaidMonthsCount).toBe(3);
    expect(newWajib!.previousArrearsMonthsCount).toBe(2);
    expect(newWajib!.previousArrearsAmount).toBe(400000);
    expect(newWajib!.remainingArrears).toBe(600000);
    expect(newWajib!.unpaidMonthsSummary).toBe('Sep-26, Okt-26, Nov-26');
  });

  it('marks fully paid member (Mar-26 s/d Nov-26) as LUNAS with Rp 0 remaining', async () => {
    const txs = [];
    for (let m = 3; m <= 11; m++) {
      txs.push({
        id: `tx-w-${m}`,
        member_deposit_id: 'md-wajib-1',
        transaction_type: 'deposit',
        amount: 200000,
        for_year: 2026,
        for_month: m,
        description: `Setoran Wajib ${m}/2026`,
      });
    }
    resetTables({ deposit_transactions: txs });

    const dataset = await getAggregateSavingsBills(11, 2026);
    const wajibRow = dataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.deposit_code === 'WAJIB'
    );

    expect(wajibRow!.currentMonthDue).toBe(200000);
    expect(wajibRow!.currentMonthPaid).toBe(200000);
    expect(wajibRow!.previousArrearsAmount).toBe(0);
    expect(wajibRow!.remainingArrears).toBe(0);
    expect(wajibRow!.status).toBe('LUNAS');
  });

  it('detects partial payments accurately as PARSIAL and computes exact shortfall', async () => {
    const txs = [];
    for (let m = 3; m <= 10; m++) {
      txs.push({
        id: `tx-w-${m}`,
        member_deposit_id: 'md-wajib-1',
        transaction_type: 'deposit',
        amount: 200000,
        for_year: 2026,
        for_month: m,
        description: `Setoran Wajib ${m}/2026`,
      });
    }
    txs.push({
      id: 'tx-w-11-partial',
      member_deposit_id: 'md-wajib-1',
      transaction_type: 'deposit',
      amount: 50000,
      for_year: 2026,
      for_month: 11,
      description: 'Cicilan Wajib Nov 2026',
    });
    resetTables({ deposit_transactions: txs });

    const dataset = await getAggregateSavingsBills(11, 2026);
    const wajibRow = dataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.deposit_code === 'WAJIB'
    );

    expect(wajibRow!.status).toBe('PARSIAL');
    expect(wajibRow!.currentMonthDue).toBe(200000);
    expect(wajibRow!.currentMonthPaid).toBe(50000);
    expect(wajibRow!.remainingArrears).toBe(150000);
    expect(wajibRow!.unpaidMonthsSummary).toBe('Nov-26');
  });

  it('treats historical matrix-settled months as settled even if current tariff is higher', async () => {
    const txs = [
      {
        id: 'tx-matriks-mar',
        member_deposit_id: 'md-wajib-1',
        transaction_type: 'deposit',
        amount: 100000, // old lower tariff before hike to 200000
        for_year: 2026,
        for_month: 3,
        description: 'Setoran Matriks WAJIB Mar 2026',
      },
    ];
    resetTables({ deposit_transactions: txs });

    const dataset = await getAggregateSavingsBills(4, 2026);
    const wajibRow = dataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.deposit_code === 'WAJIB'
    );

    // Mar-26 is matrix-settled so previousArrearsAmount is 0; only Apr-26 (200k) is due -> BELUM_BAYAR
    expect(wajibRow!.previousArrearsAmount).toBe(0);
    expect(wajibRow!.currentMonthDue).toBe(200000);
    expect(wajibRow!.remainingArrears).toBe(200000);
    expect(wajibRow!.status).toBe('BELUM_BAYAR');
  });

  it('applies personal member_lebaran_rates overrides for Lebaran billing', async () => {
    resetTables({
      anggota: [
        {
          id: 'mem-agus',
          nama: 'Agus Personal',
          nrp: '1001',
          status: 'aktif',
          membership_status: 'ACTIVE',
        },
        {
          id: 'mem-budi',
          nama: 'Budi Global',
          nrp: '1002',
          status: 'aktif',
          membership_status: 'ACTIVE',
        },
      ],
      member_lebaran_rates: [
        {
          id: 'mlr-1',
          member_id: 'mem-agus',
          effective_year: 2026,
          effective_month: 3,
          monthly_rate: 400000,
        },
      ],
    });

    const dataset = await getAggregateSavingsBills(4, 2026);
    const agusLebaran = dataset.rows.find(
      (r) => r.member_id === 'mem-agus' && r.deposit_code === 'LEBARAN'
    );
    const budiLebaran = dataset.rows.find(
      (r) => r.member_id === 'mem-budi' && r.deposit_code === 'LEBARAN'
    );

    expect(agusLebaran!.currentMonthDue).toBe(400000);
    expect(agusLebaran!.remainingArrears).toBe(800000); // Mar + Apr @ 400k
    expect(budiLebaran!.currentMonthDue).toBe(100000);
    expect(budiLebaran!.remainingArrears).toBe(200000); // Mar + Apr @ 100k
  });

  it('calculates POKOK obligation (unpaid, partial, settled with withdrawals netted)', async () => {
    resetTables({
      anggota: [
        { id: 'm-unpaid', nama: 'A Unpaid', nrp: '1', status: 'aktif', membership_status: 'ACTIVE' },
        { id: 'm-partial', nama: 'B Partial', nrp: '2', status: 'aktif', membership_status: 'ACTIVE' },
        { id: 'm-paid', nama: 'C Paid', nrp: '3', status: 'aktif', membership_status: 'ACTIVE' },
      ],
      member_deposits: [
        { id: 'md-p-1', member_id: 'm-unpaid', deposit_type_id: 'dt-pokok' },
        { id: 'md-p-2', member_id: 'm-partial', deposit_type_id: 'dt-pokok' },
        { id: 'md-p-3', member_id: 'm-paid', deposit_type_id: 'dt-pokok' },
      ],
      deposit_transactions: [
        {
          id: 'tx-p-2',
          member_deposit_id: 'md-p-2',
          transaction_type: 'deposit',
          amount: 40000,
          description: 'Cicilan Pokok',
        },
        {
          id: 'tx-p-3a',
          member_deposit_id: 'md-p-3',
          transaction_type: 'deposit',
          amount: 100000,
          description: 'Setoran Pokok',
        },
      ],
    });

    const dataset = await getAggregateSavingsBills(11, 2026);
    const pUnpaid = dataset.rows.find((r) => r.member_id === 'm-unpaid' && r.isPokok);
    const pPartial = dataset.rows.find((r) => r.member_id === 'm-partial' && r.isPokok);
    const pPaid = dataset.rows.find((r) => r.member_id === 'm-paid' && r.isPokok);

    expect(pUnpaid!.remainingArrears).toBe(100000);
    expect(pUnpaid!.status).toBe('MENUNGGAK');
    expect(pUnpaid!.unpaidMonthsSummary).toBe('Kewajiban Awal Keanggotaan');

    expect(pPartial!.remainingArrears).toBe(60000);
    expect(pPartial!.status).toBe('PARSIAL');

    expect(pPaid!.remainingArrears).toBe(0);
    expect(pPaid!.status).toBe('LUNAS');
  });

  it('excludes SUSPENDED, RESIGNED, and nonaktif members and sorts by remainingArrears DESC then nama ASC', async () => {
    resetTables({
      anggota: [
        { id: 'm-active-z', nama: 'Zainal', nrp: '1', status: 'aktif', membership_status: 'ACTIVE' },
        { id: 'm-active-a', nama: 'Andi', nrp: '2', status: 'aktif', membership_status: 'ACTIVE' },
        { id: 'm-susp', nama: 'Beku', nrp: '3', status: 'aktif', membership_status: 'SUSPENDED' },
        { id: 'm-nonaktif', nama: 'Keluar', nrp: '4', status: 'nonaktif', membership_status: 'RESIGNED' },
      ],
      deposit_types: [
        {
          id: 'dt-wajib',
          code: 'SW',
          name: 'Simpanan Wajib',
          frequency_type: 'monthly',
          default_amount: 200000,
          is_active: true,
        },
      ],
      member_deposits: [{ id: 'md-w-z', member_id: 'm-active-z', deposit_type_id: 'dt-wajib' }],
      deposit_transactions: [
        // Zainal pays Mar-26 (200k), so Zainal owes 200k in Apr-26 while Andi owes 400k
        {
          id: 'tx-z-3',
          member_deposit_id: 'md-w-z',
          transaction_type: 'deposit',
          amount: 200000,
          for_year: 2026,
          for_month: 3,
          description: 'Setoran Wajib Mar 2026',
        },
      ],
    });

    const dataset = await getAggregateSavingsBills(4, 2026);
    expect(dataset.totalActiveMembersCount).toBe(2);
    expect(dataset.rows.map((r) => r.anggota.nama)).toEqual(['Andi', 'Zainal']);
    expect(dataset.rows[0].remainingArrears).toBe(400000);
    expect(dataset.rows[1].remainingArrears).toBe(200000);
  });

  it('paySavingsBillArrears records FIFO deposit_transactions + cash_flow rows and auto-enrolls missing member_deposit', async () => {
    resetTables({
      member_deposits: [], // Force auto-creation on payment
    });

    const dataset = await getAggregateSavingsBills(11, 2026);
    const wajibRow = dataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.deposit_code === 'WAJIB'
    )!;
    expect(wajibRow.member_deposit_id).toBeNull();

    // Pay Rp 300.000 across selected Mar-26 (200k) and Apr-26 (100k partial)
    const payRes = await paySavingsBillArrears({
      bill: wajibRow,
      paymentAmount: 300000,
      selectedMonths: [
        { year: 2026, month: 3 },
        { year: 2026, month: 4 },
      ],
      paymentMethod: 'transfer_bank',
      notes: 'Cicilan 2 bulan',
    });

    expect(payRes.success).toBe(true);
    expect(payRes.totalAllocated).toBe(300000);
    expect(payRes.insertedCount).toBe(2);
    expect(payRes.allocations[0]).toMatchObject({ year: 2026, month: 3, amount: 200000 });
    expect(payRes.allocations[1]).toMatchObject({ year: 2026, month: 4, amount: 100000 });

    const depTxLogs = insertedLog.filter((l) => l.table === 'deposit_transactions');
    const cfLogs = insertedLog.filter((l) => l.table === 'cash_flow');
    expect(depTxLogs).toHaveLength(2);
    expect(cfLogs).toHaveLength(2);
    expect(cfLogs[0].payload.direction).toBe('in');
    expect(cfLogs[0].payload.category).toBe('Setoran Simpanan');
    expect(cfLogs[0].payload.reference_id).toBe(payRes.allocations[0].txId);
    expect(cfLogs[0].payload.description).toContain('Budi Santoso');

    // Re-querying aggregate bills reflects the partial payment immediately
    const afterDataset = await getAggregateSavingsBills(11, 2026);
    const afterWajib = afterDataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.deposit_code === 'WAJIB'
    )!;
    expect(afterWajib.remainingArrears).toBe(1500000); // 1.800.000 - 300.000
    expect(afterWajib.status).toBe('PARSIAL');
    expect(afterWajib.unpaidMonthsCount).toBe(8); // Apr-26 (partial) s/d Nov-26
  });

  it('formats short period labels and non-contiguous unpaid month summaries cleanly', () => {
    expect(formatShortPeriod(2026, 3)).toBe('Mar-26');
    expect(formatShortPeriod(2026, 8)).toBe('Ags-26');

    const nonContiguous = formatUnpaidMonthsSummary([
      {
        year: 2026,
        month: 3,
        periodIndex: 2026 * 12 + 3,
        label: 'Mar-26',
        fullLabel: 'Maret 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: true,
      },
      {
        year: 2026,
        month: 4,
        periodIndex: 2026 * 12 + 4,
        label: 'Apr-26',
        fullLabel: 'April 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: true,
      },
      {
        year: 2026,
        month: 11,
        periodIndex: 2026 * 12 + 11,
        label: 'Nov-26',
        fullLabel: 'November 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: false,
      },
    ]);
    expect(nonContiguous.summary).toBe('Mar-26, Apr-26, Nov-26');

    const fourNonContiguous = formatUnpaidMonthsSummary([
      {
        year: 2026,
        month: 3,
        periodIndex: 2026 * 12 + 3,
        label: 'Mar-26',
        fullLabel: 'Maret 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: true,
      },
      {
        year: 2026,
        month: 5,
        periodIndex: 2026 * 12 + 5,
        label: 'Mei-26',
        fullLabel: 'Mei 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: true,
      },
      {
        year: 2026,
        month: 7,
        periodIndex: 2026 * 12 + 7,
        label: 'Jul-26',
        fullLabel: 'Juli 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: true,
      },
      {
        year: 2026,
        month: 11,
        periodIndex: 2026 * 12 + 11,
        label: 'Nov-26',
        fullLabel: 'November 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: false,
      },
    ]);
    expect(fourNonContiguous.summary).toBe('Mar-26, Mei-26, Jul-26 (+1 bln)');
  });

  it('paySavingsBillArrears for POKOK records for_month: null, for_year: null and matching cash_flow', async () => {
    resetTables();
    const dataset = await getAggregateSavingsBills(11, 2026);
    const pokokRow = dataset.rows.find(
      (r) => r.member_id === 'mem-1' && r.isPokok
    )!;

    expect(pokokRow).toBeDefined();
    expect(pokokRow.remainingArrears).toBe(100000);

    const res = await paySavingsBillArrears({
      bill: pokokRow,
      paymentAmount: 100000,
      paymentMethod: 'tunai',
      notes: 'Pelunasan Pokok',
    });

    expect(res.success).toBe(true);
    expect(res.totalAllocated).toBe(100000);
    expect(res.allocations[0]).toMatchObject({
      year: null,
      month: null,
      amount: 100000,
    });

    const depTxLogs = insertedLog.filter((l) => l.table === 'deposit_transactions');
    const cfLogs = insertedLog.filter((l) => l.table === 'cash_flow');
    expect(depTxLogs).toHaveLength(1);
    expect(depTxLogs[0].payload.for_month).toBeNull();
    expect(depTxLogs[0].payload.for_year).toBeNull();
    expect(cfLogs).toHaveLength(1);
    expect(cfLogs[0].payload.category).toBe('Setoran Simpanan');
    expect(cfLogs[0].payload.direction).toBe('in');
  });
});
