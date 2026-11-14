import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clearTierCache,
  buildSavingsRateResolver,
  SavingsRateTier,
  DepositTypeRateRef
} from './savingsRateService';
import { getComplianceMatrixData } from './complianceService';
import { calculateMemberCumulativeBills } from './setoranService';
import {
  getDepositTypes,
  getMonthlyDepositCommitments
} from './depositManagementService';
import { buildSavingsTemplateRows } from './batchUpdateService';

interface MockTables {
  anggota: any[];
  deposit_types: any[];
  member_deposits: any[];
  deposit_transactions: any[];
  savings_rate_tiers: SavingsRateTier[];
  monthly_deposit_commitments: any[];
  system_settings: any[];
  loans: any[];
  loan_schedules: any[];
  monthly_loan_commitments: any[];
  view_member_net_savings: any[];
  koperasi_profile: any[];
}

let mockTables: MockTables;

function createChainBuilder(rows: any[], singleMode = false) {
  const filters: Array<(r: any) => boolean> = [];
  let sortCol: string | null = null;
  let sortAsc = true;
  let wantSingle = singleMode;
  let wantMaybeSingle = false;

  const exec = () => {
    let result = rows.filter((r) => filters.every((fn) => fn(r)));
    if (sortCol) {
      const col = sortCol;
      result = [...result].sort((a, b) => {
        const av = a?.[col];
        const bv = b?.[col];
        if (av === bv) return 0;
        if (av == null) return sortAsc ? -1 : 1;
        if (bv == null) return sortAsc ? 1 : -1;
        return av < bv ? (sortAsc ? -1 : 1) : (sortAsc ? 1 : -1);
      });
    }
    if (wantSingle || wantMaybeSingle) {
      return Promise.resolve({ data: result[0] ?? null, error: null });
    }
    return Promise.resolve({ data: result, error: null });
  };

  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((col: string, val: any) => {
      filters.push((r) => r?.[col] === val);
      return builder;
    }),
    neq: vi.fn((col: string, val: any) => {
      filters.push((r) => r?.[col] !== val);
      return builder;
    }),
    in: vi.fn((col: string, vals: any[]) => {
      const set = new Set(vals || []);
      filters.push((r) => set.has(r?.[col]));
      return builder;
    }),
    gte: vi.fn((col: string, val: any) => {
      filters.push((r) => r?.[col] >= val);
      return builder;
    }),
    lte: vi.fn((col: string, val: any) => {
      filters.push((r) => r?.[col] <= val);
      return builder;
    }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
      sortCol = col;
      sortAsc = opts?.ascending !== false;
      return builder;
    }),
    range: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => {
      wantMaybeSingle = true;
      return exec();
    }),
    single: vi.fn(() => {
      wantSingle = true;
      return exec();
    }),
    then: (resolve: any, reject: any) => exec().then(resolve, reject),
  };
  return builder;
}

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const rows = (mockTables as any)?.[table] ?? [];
      return createChainBuilder(rows);
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

function resetScenario(tiers: SavingsRateTier[], lebaranMasterDefault: number, paidLebaranNov2026: number) {
  mockTables = {
    anggota: [
      {
        id: 'mem-1',
        nama: 'Briptu Uji Lebaran',
        nrp: 'NRP-2026',
        status: 'aktif',
        membership_status: 'ACTIVE',
        tgl_awal_anggota: '2026-11-01',
        created_at: '2026-11-01T00:00:00Z',
      },
    ],
    deposit_types: [
      { id: 'dt-pokok', code: 'POKOK', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
      { id: 'dt-wajib', code: 'WAJIB', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 200000, can_be_withdrawn: false, is_active: true },
      { id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: true, is_active: true },
      { id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran', frequency_type: 'monthly', default_amount: lebaranMasterDefault, can_be_withdrawn: true, is_active: true },
    ],
    member_deposits: [
      { id: 'md-pokok', member_id: 'mem-1', deposit_type_id: 'dt-pokok' },
      { id: 'md-wajib', member_id: 'mem-1', deposit_type_id: 'dt-wajib' },
      { id: 'md-belanja', member_id: 'mem-1', deposit_type_id: 'dt-belanja' },
      { id: 'md-lebaran', member_id: 'mem-1', deposit_type_id: 'dt-lebaran' },
    ],
    deposit_transactions: [
      {
        id: 'tx-pokok',
        member_deposit_id: 'md-pokok',
        amount: 100000,
        transaction_type: 'deposit',
        for_year: 2026,
        for_month: 11,
        description: 'Setoran Pokok Lunas',
        member_deposits: { member_id: 'mem-1', deposit_type_id: 'dt-pokok' },
      },
      ...(paidLebaranNov2026 > 0
        ? [
            {
              id: 'tx-lebaran-nov',
              member_deposit_id: 'md-lebaran',
              amount: paidLebaranNov2026,
              transaction_type: 'deposit',
              for_year: 2026,
              for_month: 11,
              description: 'Setoran Lebaran Nov 2026',
              member_deposits: { member_id: 'mem-1', deposit_type_id: 'dt-lebaran' },
            },
          ]
        : []),
    ],
    savings_rate_tiers: tiers,
    monthly_deposit_commitments: [
      {
        id: 'mdc-lebaran-nov',
        member_deposit_id: 'md-lebaran',
        member_id: 'mem-1',
        deposit_type_id: 'dt-lebaran',
        deposit_name: 'Simpanan Lebaran',
        for_month: 11,
        for_year: 2026,
        commitment_amount: 50000, // stale DB view amount intentionally wrong
        total_paid: paidLebaranNov2026,
        remaining_balance: 50000 - paidLebaranNov2026,
        status: 'belum_lunas',
        anggota: { nama: 'Briptu Uji Lebaran', nrp: 'NRP-2026', created_at: '2026-11-01T00:00:00Z' },
      },
    ],
    system_settings: [
      { key: 'initial_savings_cut_off_date', value: '2026-10-01' },
    ],
    loans: [],
    loan_schedules: [],
    monthly_loan_commitments: [],
    view_member_net_savings: [],
    koperasi_profile: [],
  };
}

describe('Cross-Module Simpanan Lebaran Rate Parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearTierCache();
  });

  it('Case A: prioritizes active savings_rate_tiers (300k) over master deposit_types.default_amount (200k) identically across all modules', async () => {
    const tiers: SavingsRateTier[] = [
      {
        id: 'tier-leb-2026',
        deposit_type_code: 'LEBARAN',
        start_year: 2026,
        start_month: 1,
        end_year: null,
        end_month: null,
        monthly_rate: 300000,
      },
    ];
    resetScenario(tiers, 200000, 200000);

    // 1. Direct resolver
    const resolver = buildSavingsRateResolver(
      tiers,
      mockTables.deposit_types as DepositTypeRateRef[]
    );
    expect(resolver.getRateForPeriod('LEBARAN', 2026, 11)).toBe(300000);

    // 2. /admin/master-simpan-pinjam (getDepositTypes) & /admin/simpanan (getMonthlyDepositCommitments)
    const masterTypes = await getDepositTypes();
    const lebaranMaster = masterTypes.find((dt) => dt.code === 'LEBARAN');
    expect(lebaranMaster?.effective_amount).toBe(300000);
    expect(lebaranMaster?.rate_source).toBe('tier');

    const commitments = await getMonthlyDepositCommitments(11, 2026);
    expect(commitments[0].commitment_amount).toBe(300000);
    expect(commitments[0].remaining_balance).toBe(100000); // 300k - 200k paid
    expect(commitments[0].status).toBe('belum_lunas');

    // 3. /admin/compliance-matrix (getComplianceMatrixData)
    const matrix = await getComplianceMatrixData(2026);
    const novCell = matrix.rows[0].months[10]; // index 10 = November
    expect(novCell?.lebaran).toEqual({
      status: 'partial',
      amount: 200000,
      targetAmount: 300000,
    });

    // 4. /admin/setoran (calculateMemberCumulativeBills)
    const setoranSummary = await calculateMemberCumulativeBills('mem-1', 2026, 11);
    const lebaranBill = setoranSummary.items.find((i) => i.code === 'LEBARAN');
    expect(lebaranBill?.totalDue).toBe(100000); // 300k target - 200k paid
    expect(lebaranBill?.unpaidMonths[0].expectedAmount).toBe(300000);

    // 5. /admin/batch-update (buildSavingsTemplateRows)
    const batchRows = buildSavingsTemplateRows(
      mockTables.anggota,
      mockTables.member_deposits,
      mockTables.deposit_types,
      mockTables.deposit_transactions,
      [],
      100000,
      11,
      2026,
      tiers
    );
    const batchLebaran = batchRows.find((r) => r.kode_simpanan === 'LEBARAN');
    expect(batchLebaran?.telah_dibayar).toBe(200000);
    expect(batchLebaran?.jumlah_bayar).toBe(100000); // 300k target - 200k paid
  });

  it('Case B: falls back to master deposit_types.default_amount (250k) identically across all modules when no tier covers 2026-11', async () => {
    const oldTiers: SavingsRateTier[] = [
      {
        id: 'tier-leb-old',
        deposit_type_code: 'LEBARAN',
        start_year: 2024,
        start_month: 1,
        end_year: 2025,
        end_month: 12,
        monthly_rate: 50000,
      },
    ];
    resetScenario(oldTiers, 250000, 100000);

    // 1. Direct resolver
    const resolver = buildSavingsRateResolver(
      oldTiers,
      mockTables.deposit_types as DepositTypeRateRef[]
    );
    expect(resolver.getRateForPeriod('LEBARAN', 2026, 11)).toBe(250000);

    // 2. /admin/master-simpan-pinjam & /admin/simpanan
    const masterTypes = await getDepositTypes();
    const lebaranMaster = masterTypes.find((dt) => dt.code === 'LEBARAN');
    expect(lebaranMaster?.effective_amount).toBe(250000);
    expect(lebaranMaster?.rate_source).toBe('master');

    const commitments = await getMonthlyDepositCommitments(11, 2026);
    expect(commitments[0].commitment_amount).toBe(250000);
    expect(commitments[0].remaining_balance).toBe(150000); // 250k - 100k paid
    expect(commitments[0].status).toBe('belum_lunas');

    // 3. /admin/compliance-matrix
    const matrix = await getComplianceMatrixData(2026);
    const novCell = matrix.rows[0].months[10];
    expect(novCell?.lebaran).toEqual({
      status: 'partial',
      amount: 100000,
      targetAmount: 250000,
    });

    // 4. /admin/setoran
    const setoranSummary = await calculateMemberCumulativeBills('mem-1', 2026, 11);
    const lebaranBill = setoranSummary.items.find((i) => i.code === 'LEBARAN');
    expect(lebaranBill?.totalDue).toBe(150000); // 250k target - 100k paid
    expect(lebaranBill?.unpaidMonths[0].expectedAmount).toBe(250000);

    // 5. /admin/batch-update
    const batchRows = buildSavingsTemplateRows(
      mockTables.anggota,
      mockTables.member_deposits,
      mockTables.deposit_types,
      mockTables.deposit_transactions,
      [],
      100000,
      11,
      2026,
      oldTiers
    );
    const batchLebaran = batchRows.find((r) => r.kode_simpanan === 'LEBARAN');
    expect(batchLebaran?.telah_dibayar).toBe(100000);
    expect(batchLebaran?.jumlah_bayar).toBe(150000); // 250k target - 100k paid
  });
});
