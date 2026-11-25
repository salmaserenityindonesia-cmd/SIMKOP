import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeOrphanRecords,
  buildOrphanScanSummary,
  deleteOrphanRecords,
  scanAllOrphanRecords,
  syncUnreceiptedInstallments,
  type OrphanRecordItem,
  type OrphanScanDataset,
} from './orphanAuditService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function makeEmptyDataset(overrides: Partial<OrphanScanDataset> = {}): OrphanScanDataset {
  return {
    cashFlows: [],
    loans: [],
    loanSchedules: [],
    loanRepayments: [],
    members: [],
    memberDeposits: [],
    depositTransactions: [],
    lebaranCycles: [],
    sales: [],
    storeCreditPayments: [],
    ...overrides,
  };
}

describe('orphanAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('detects CF-AFC2CE88 and CF-9F0EE1EF when their parent loans are deleted (both dangling reference_id and null reference_id with NRP)', () => {
    const dataset = makeEmptyDataset({
      members: [
        { id: 'mem-1', nrp: '99999998', nama: 'Budi', status: 'aktif' },
        { id: 'mem-2', nrp: '99999999', nama: 'Andi', status: 'aktif' },
      ],
      loans: [], // Kontrak pinjaman sudah dihapus
      cashFlows: [
        {
          id: 'afc2ce88-1111-4000-8000-000000000001',
          direction: 'in',
          amount: 500000,
          category: 'angsuran_pinjaman',
          reference_id: 'deleted-loan-id-1',
          description: 'Angsuran Pinjaman Budi (99999998) Ke-1',
          created_at: '2026-11-10T08:00:00.000Z',
        },
        {
          id: '9f0ee1ef-2222-4000-8000-000000000002',
          direction: 'in',
          amount: 800000,
          category: 'angsuran_pinjaman',
          reference_id: null,
          description: 'Pelunasan Angsuran Pinjaman NRP 99999999',
          created_at: '2026-11-11T09:00:00.000Z',
        },
      ],
    });

    const items = analyzeOrphanRecords(dataset);
    expect(items).toHaveLength(2);

    const refs = items.map((i) => i.referenceCode);
    expect(refs).toContain('CF-AFC2CE88');
    expect(refs).toContain('CF-9F0EE1EF');

    const summary = buildOrphanScanSummary(items);
    expect(summary.totalCount).toBe(2);
    expect(summary.cashInImpact).toBe(1300000);
    expect(summary.cashOutImpact).toBe(0);
    expect(summary.cashFlowOrphanCount).toBe(2);
  });

  it('detects orphaned loan cash_flow mentioning missing LOAN-... contract code even if reference_id is null', () => {
    const dataset = makeEmptyDataset({
      members: [{ id: 'mem-1', nrp: '11223344', nama: 'Sari', status: 'aktif' }],
      loans: [
        {
          id: 'loan-active-1',
          loan_number: 'LOAN-ACTIVE-01',
          member_id: 'mem-1',
          purpose: 'Modal Usaha',
          amount: 2000000,
        },
      ],
      cashFlows: [
        {
          id: 'deadbeef-1111-4000-8000-000000000003',
          direction: 'out',
          amount: 1500000,
          category: 'pencairan_pinjaman',
          reference_id: null,
          description: 'Pencairan Pinjaman LOAN-999999999 a.n. Sari',
          created_at: '2026-11-12T10:00:00.000Z',
        },
      ],
    });

    const items = analyzeOrphanRecords(dataset);
    expect(items).toHaveLength(1);
    expect(items[0].referenceCode).toBe('CF-DEADBEEF');
    expect(items[0].moduleCategory).toBe('Arus Kas Pinjaman');
    expect(items[0].direction).toBe('out');
    expect(items[0].reason).toContain('LOAN-999999999');
  });

  it('does NOT flag valid records across loans, Lebaran bulk withdrawals, opening savings, POS, and deposits', () => {
    const dataset = makeEmptyDataset({
      members: [
        { id: 'mem-1', nrp: '00010001', nama: 'Anggota Valid', status: 'aktif' },
        { id: 'mem-resigned', nrp: '(lama 1) 00010062', nama: 'Keluar', status: 'keluar' },
      ],
      loans: [
        {
          id: 'loan-1',
          loan_number: 'LOAN-2026-001',
          member_id: 'mem-1',
          purpose: 'Pinjaman Tunai',
          amount: 5000000,
        },
      ],
      loanSchedules: [{ id: 'sch-1', loan_id: 'loan-1', period_number: 1, target_amount: 500000 }],
      loanRepayments: [{ id: 'rep-1', loan_id: 'loan-1', schedule_id: 'sch-1' }],
      memberDeposits: [{ id: 'md-1', member_id: 'mem-1', balance: 1000000 }],
      depositTransactions: [
        {
          id: 'dtx-1',
          member_deposit_id: 'md-1',
          reference_no: 'KW-SETOR-20261110-1234',
          notes: '',
          description: 'Setoran Simpanan Wajib',
        },
      ],
      lebaranCycles: [{ id: 'cycle-1', cycle_name: 'Lebaran 2026' }],
      sales: [{ id: 'sale-1', sale_number: 'POS-001', total_amount: 75000 }],
      storeCreditPayments: [{ id: 'scp-1', sale_id: 'sale-1', receipt_number: 'BON-001', amount: 50000 }],
      cashFlows: [
        {
          id: 'cf-opening-1',
          direction: 'in',
          amount: 10000000,
          category: 'SALDO_AWAL_SIMPANAN',
          reference_id: null,
          description: 'Saldo Awal Simpanan Anggota',
          created_at: '2026-03-01T00:00:00Z',
        },
        {
          id: 'cf-modal-1',
          direction: 'in',
          amount: 500000,
          category: 'MODAL_KASIR_AWAL',
          reference_id: 'shift-1',
          description: 'Modal Awal Kasir',
          created_at: '2026-11-10T07:00:00Z',
        },
        {
          id: 'cf-loan-out',
          direction: 'out',
          amount: 5000000,
          category: 'pencairan_pinjaman',
          reference_id: 'loan-1',
          description: 'Pencairan Pinjaman LOAN-2026-001 (00010001)',
          created_at: '2026-11-10T08:00:00Z',
        },
        {
          id: 'cf-loan-in',
          direction: 'in',
          amount: 500000,
          category: 'angsuran_pinjaman',
          reference_id: 'rep-1',
          description: 'Angsuran Pinjaman LOAN-2026-001 (00010001)',
          created_at: '2026-11-11T08:00:00Z',
        },
        {
          id: 'cf-lebaran-out',
          direction: 'out',
          amount: 2000000,
          category: 'penarikan_simpanan',
          reference_id: 'cycle-1',
          description: 'Pencairan Massal Simpanan Lebaran 2026',
          created_at: '2026-11-12T08:00:00Z',
        },
        {
          id: 'cf-deposit-in',
          direction: 'in',
          amount: 150000,
          category: 'Setoran Simpanan',
          reference_id: 'mem-1',
          description: 'Setoran Simpanan [KW-SETOR-20261110-1234]',
          created_at: '2026-11-12T09:00:00Z',
        },
        {
          id: 'cf-kliring-out',
          direction: 'out',
          amount: 300000,
          category: 'KLIRING_ANGGOTA_KELUAR',
          reference_id: null,
          description: 'Kliring Anggota Keluar NRP 00010062',
          created_at: '2026-11-12T10:00:00Z',
        },
        {
          id: 'cf-pos-in',
          direction: 'in',
          amount: 75000,
          category: 'penjualan_tunai',
          reference_id: 'sale-1',
          description: 'Penjualan POS POS-001',
          created_at: '2026-11-12T11:00:00Z',
        },
        {
          id: 'cf-bon-in',
          direction: 'in',
          amount: 50000,
          category: 'PELUNASAN_BON_TOKO',
          reference_id: 'scp-1',
          description: 'Pelunasan Bon Toko BON-001',
          created_at: '2026-11-12T12:00:00Z',
        },
      ],
    });

    const items = analyzeOrphanRecords(dataset);
    expect(items).toEqual([]);
  });

  it('detects orphaned deposit, POS, bon, loans, member_deposits, and loan_schedules', () => {
    const dataset = makeEmptyDataset({
      members: [{ id: 'mem-1', nrp: '100001', nama: 'Aktif', status: 'aktif' }],
      loans: [
        { id: 'loan-orphan', member_id: 'missing-member', purpose: 'Pinjaman Yatim', amount: 1200000 },
      ],
      memberDeposits: [
        { id: 'md-orphan', member_id: 'missing-member', balance: 450000 },
      ],
      loanSchedules: [
        { id: 'sch-orphan', loan_id: 'missing-loan', period_number: 2, target_amount: 200000 },
      ],
      cashFlows: [
        {
          id: 'cf-dep-orphan',
          direction: 'in',
          amount: 250000,
          category: 'Setoran Simpanan',
          reference_id: 'deleted-dtx-id',
          description: 'Setoran [KW-SETOR-20261110-9999]',
          created_at: '2026-11-12T08:00:00Z',
        },
        {
          id: 'cf-pos-orphan',
          direction: 'in',
          amount: 95000,
          category: 'Penjualan POS',
          reference_id: 'deleted-sale-id',
          description: 'Penjualan POS hilang',
          created_at: '2026-11-12T09:00:00Z',
        },
        {
          id: 'cf-bon-orphan',
          direction: 'in',
          amount: 60000,
          category: 'PELUNASAN_BON_TOKO',
          reference_id: 'deleted-scp-id',
          description: 'Pelunasan Bon hilang',
          created_at: '2026-11-12T10:00:00Z',
        },
      ],
    });

    const items = analyzeOrphanRecords(dataset);
    expect(items.map((i) => i.moduleCategory)).toEqual(
      expect.arrayContaining([
        'Arus Kas Simpanan',
        'Arus Kas Retail/Bon',
        'Kontrak Pinjaman',
        'Rekening Simpanan',
        'Jadwal Angsuran',
      ])
    );
    expect(items).toHaveLength(6);
  });

  it('scanAllOrphanRecords queries reference_no on deposit_transactions and returns scan summary', async () => {
    const selectedColumnsByTable: Record<string, string[]> = {};

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn((cols: string) => {
        selectedColumnsByTable[table] = selectedColumnsByTable[table] || [];
        selectedColumnsByTable[table].push(cols);
        return {
          range: vi.fn().mockResolvedValue({
            data:
              table === 'cash_flow'
                ? [
                    {
                      id: 'afc2ce88-0000-0000-0000-000000000001',
                      direction: 'in',
                      amount: 500000,
                      category: 'angsuran_pinjaman',
                      reference_id: 'missing-loan',
                      description: 'Angsuran 99999998',
                      created_at: '2026-11-10T08:00:00Z',
                    },
                  ]
                : [],
            error: null,
          }),
        };
      }),
    }));

    const result = await scanAllOrphanRecords();
    expect(selectedColumnsByTable.deposit_transactions?.[0]).toContain('reference_no');
    expect(selectedColumnsByTable.deposit_transactions?.[0]).not.toContain('reference_number');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].referenceCode).toBe('CF-AFC2CE88');
    expect(result.summary.totalCount).toBe(1);
    expect(result.summary.cashInImpact).toBe(500000);
  });

  it('deleteOrphanRecords groups deletions by sourceTable and reports deletedCount', async () => {
    const deleteInCalls: Array<{ table: string; ids: string[] }> = [];

    (supabase.from as any).mockImplementation((table: string) => ({
      delete: vi.fn(() => ({
        in: vi.fn(async (_col: string, ids: string[]) => {
          deleteInCalls.push({ table, ids });
          return { error: null };
        }),
      })),
    }));

    const items: OrphanRecordItem[] = [
      {
        id: 'cf-1',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-AFC2CE88',
        transactionDate: '2026-11-10T08:00:00Z',
        moduleCategory: 'Arus Kas Pinjaman',
        description: 'Angsuran 99999998',
        amount: 500000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'Induk pinjaman tidak ditemukan',
        rawRecord: {},
      },
      {
        id: 'cf-2',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-9F0EE1EF',
        transactionDate: '2026-11-11T08:00:00Z',
        moduleCategory: 'Arus Kas Pinjaman',
        description: 'Angsuran 99999999',
        amount: 800000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'Induk pinjaman tidak ditemukan',
        rawRecord: {},
      },
      {
        id: 'loan-9',
        sourceTable: 'loans',
        referenceCode: 'LOAN-ORPHAN',
        transactionDate: '2026-11-01T08:00:00Z',
        moduleCategory: 'Kontrak Pinjaman',
        description: 'Kontrak tanpa anggota',
        amount: 1000000,
        direction: 'neutral',
        missingTarget: 'anggota',
        reason: 'Anggota dihapus',
        rawRecord: {},
      },
    ];

    const res = await deleteOrphanRecords(items);
    expect(res.errors).toEqual([]);
    expect(res.deletedCount).toBe(3);
    expect(deleteInCalls).toEqual([
      { table: 'cash_flow', ids: ['cf-1', 'cf-2'] },
      { table: 'loans', ids: ['loan-9'] },
    ]);
  });

  it('fetches >1000 rows across multiple pages via fetchAllPaginated and does not falsely flag page-2 loan_schedules (e.g. fde606c3-4205-4314-aaaf-97e907c936d6)', async () => {
    const targetLoanId = 'fde606c3-4205-4314-aaaf-97e907c936d6';
    const membersPage1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `mem-${i}`,
      nrp: `8611${String(i).padStart(4, '0')}`,
      nama: `Anggota ${i}`,
      status: 'aktif',
    }));
    const membersPage2 = [
      { id: 'mem-target', nrp: '86111093', nama: 'Anggota Target', status: 'aktif' },
    ];

    const loansPage1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `loan-${i}`,
      loan_number: `LOAN-${i}`,
      member_id: `mem-${i}`,
      amount: 1000000,
      status: 'active',
    }));
    const loansPage2 = [
      {
        id: targetLoanId,
        loan_number: 'SALDO-AWAL-86111093-GAJISIPA',
        member_id: 'mem-target',
        amount: 3500000,
        status: 'active',
      },
    ];

    const schedulesPage1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `sch-${i}`,
      loan_id: `loan-${i}`,
      period_number: 1,
      due_date: '2026-11-01',
      target_amount: 100000,
      status: 'unpaid',
    }));
    const schedulesPage2 = [
      {
        id: 'sch-target-1',
        loan_id: targetLoanId,
        period_number: 1,
        due_date: '2026-12-01',
        target_amount: 350000,
        status: 'unpaid',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn((cols: string) => {
        const makeRange = () => ({
          range: vi.fn(async (from: number, _to: number) => {
            // Simulasikan PostgREST error jika ada kolom tidak dikenal pada loans
            if (table === 'loans' && cols.includes('purpose')) {
              return { data: null, error: { code: '42703', message: 'column loans.purpose does not exist' } };
            }
            if (table === 'anggota') {
              return { data: from === 0 ? membersPage1 : from === 1000 ? membersPage2 : [], error: null };
            }
            if (table === 'loans') {
              return { data: from === 0 ? loansPage1 : from === 1000 ? loansPage2 : [], error: null };
            }
            if (table === 'loan_schedules') {
              return { data: from === 0 ? schedulesPage1 : from === 1000 ? schedulesPage2 : [], error: null };
            }
            return { data: [], error: null };
          }),
        });
        return {
          order: vi.fn(() => makeRange()),
        };
      }),
    }));

    const result = await scanAllOrphanRecords();
    expect(result.items).toEqual([]);
    expect(result.summary.totalCount).toBe(0);
  });

  it('recovers from missing-column errors on loans and validates schema FK rules (refinanced_loan_id, loan_repayments, deposit_transactions, loan_installments, SALDO-AWAL)', async () => {
    (supabase.from as any).mockImplementation((table: string) => ({
      select: vi.fn((cols: string) => ({
        order: vi.fn(() => ({
          range: vi.fn(async (from: number) => {
            if (from > 0) return { data: [], error: null };
            if (table === 'loans' && (cols.includes('item_description') || cols.includes('purpose'))) {
              return { data: null, error: { code: '42703', message: 'column does not exist' } };
            }
            if (table === 'anggota') {
              return { data: [{ id: 'mem-1', nrp: '86111093', nama: 'Budi', status: 'aktif' }], error: null };
            }
            if (table === 'loans') {
              return {
                data: [
                  {
                    id: 'loan-valid',
                    loan_number: 'SALDO-AWAL-86111093-GAJISIPA',
                    member_id: 'mem-1',
                    refinanced_loan_id: null,
                    amount: 1000000,
                    status: 'active',
                  },
                  {
                    id: 'loan-bad-refinance',
                    loan_number: 'LOAN-TOPUP-1',
                    member_id: 'mem-1',
                    refinanced_loan_id: 'missing-old-loan',
                    amount: 2000000,
                    status: 'active',
                  },
                ],
                error: null,
              };
            }
            if (table === 'loan_schedules') {
              return {
                data: [{ id: 'sch-valid', loan_id: 'loan-valid', period_number: 1, target_amount: 100000 }],
                error: null,
              };
            }
            if (table === 'loan_installments') {
              return { data: [{ id: 'inst-valid', loan_id: 'loan-valid' }], error: null };
            }
            if (table === 'loan_repayments') {
              return {
                data: [
                  { id: 'rep-bad-sched', loan_id: 'loan-valid', schedule_id: 'missing-schedule', amount_paid: 100000 },
                ],
                error: null,
              };
            }
            if (table === 'member_deposits') {
              return { data: [{ id: 'md-valid', member_id: 'mem-1', balance: 500000 }], error: null };
            }
            if (table === 'deposit_transactions') {
              return {
                data: [
                  { id: 'dtx-orphan', member_deposit_id: 'missing-md', reference_no: 'KW-999', amount: 50000 },
                ],
                error: null,
              };
            }
            if (table === 'cash_flow') {
              return {
                data: [
                  {
                    id: 'cf-inst-valid',
                    direction: 'in',
                    amount: 100000,
                    category: 'angsuran_pinjaman',
                    reference_id: 'inst-valid',
                    description: 'Angsuran SALDO-AWAL-86111093-GAJISIPA',
                    created_at: '2026-11-15T08:00:00Z',
                  },
                  {
                    id: 'cf-saldo-awal-exempt',
                    direction: 'in',
                    amount: 5000000,
                    category: 'SALDO-AWAL',
                    reference_id: null,
                    description: 'Saldo Awal Kas',
                    created_at: '2026-01-01T00:00:00Z',
                  },
                ],
                error: null,
              };
            }
            return { data: [], error: null };
          }),
        })),
      })),
    }));

    const result = await scanAllOrphanRecords();
    expect(result.items.map((i) => i.sourceTable)).toEqual(
      expect.arrayContaining(['loans', 'loan_repayments', 'deposit_transactions'])
    );
    expect(result.items).toHaveLength(3);
    expect(result.summary.cashInImpact).toBe(0);
    expect(result.summary.cashOutImpact).toBe(0);
    expect(result.summary.cashFlowOrphanCount).toBe(0);
  });

  it('buildOrphanScanSummary excludes non-cash_flow items from cashInImpact and cashOutImpact', () => {
    const summary = buildOrphanScanSummary([
      {
        id: 'sch-1',
        sourceTable: 'loan_schedules',
        referenceCode: 'SCH-00000001',
        transactionDate: '2026-11-01',
        moduleCategory: 'Jadwal Angsuran',
        description: 'Jadwal yatim',
        amount: 9999999,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'test',
        rawRecord: {},
      },
      {
        id: 'cf-1',
        sourceTable: 'cash_flow',
        referenceCode: 'CF-00000001',
        transactionDate: '2026-11-01',
        moduleCategory: 'Arus Kas Pinjaman',
        description: 'Angsuran yatim',
        amount: 250000,
        direction: 'in',
        missingTarget: 'loans',
        reason: 'test',
        rawRecord: {},
      },
    ]);

    expect(summary.totalCount).toBe(2);
    expect(summary.cashFlowOrphanCount).toBe(1);
    expect(summary.cashInImpact).toBe(250000);
    expect(summary.cashOutImpact).toBe(0);
  });

  it('recognizes both legacy and compact register numbers (LN, KW, KS, POS, KB) in descriptions without false-positive NRP or orphan flags', () => {
    const items = analyzeOrphanRecords({
      loans: [
        { id: 'loan-compact-1', loan_number: 'LN2611-0001', member_id: 'mem-1', status: 'active' },
        { id: 'loan-legacy-1', loan_number: 'LOAN-1795333396946', member_id: 'mem-1', status: 'active' },
      ],
      loanSchedules: [],
      loanRepayments: [],
      members: [{ id: 'mem-1', nrp: '00050543', nama: 'Bagus Budi' }],
      memberDeposits: [{ id: 'md-1', member_id: 'mem-1', balance: 500000 }],
      depositTransactions: [
        { id: 'dt-1', member_deposit_id: 'md-1', reference_no: 'KS2611-0001', amount: 100000 },
        { id: 'dt-2', member_deposit_id: 'md-1', reference_no: 'KW-SETOR-20261120-3663', amount: 100000 },
      ],
      lebaranCycles: [],
      sales: [{ id: 'sale-1', sale_number: 'POS2611-0001', total_amount: 50000 }],
      storeCreditPayments: [{ id: 'scp-1', sale_id: 'sale-1', receipt_number: 'KB2611-0001', amount: 50000 }],
      cashFlows: [
        {
          id: 'cf-loan-compact-ok',
          direction: 'in',
          amount: 500000,
          category: 'angsuran_pinjaman',
          reference_id: null,
          description: 'Angsuran Pinjaman (LN2611-0001) Bln ke-1 — 00050543 - Bagus Budi [KW2611-0001]',
          created_at: '2026-11-24',
        },
        {
          id: 'cf-loan-compact-orphan',
          direction: 'in',
          amount: 300000,
          category: 'angsuran_pinjaman',
          reference_id: null,
          description: 'Angsuran Pinjaman (LN2611-9999) Bln ke-1 — 00050543 - Bagus Budi',
          created_at: '2026-11-24',
        },
        {
          id: 'cf-deposit-compact-ok',
          direction: 'in',
          amount: 100000,
          category: 'SETORAN_ANGGOTA',
          reference_id: null,
          description: 'Setoran Anggota Bagus Budi (00050543) - Tunai [KS2611-0001]',
          created_at: '2026-11-24',
        },
        {
          id: 'cf-deposit-compact-orphan',
          direction: 'in',
          amount: 100000,
          category: 'SETORAN_ANGGOTA',
          reference_id: null,
          description: 'Setoran Anggota Bagus Budi (00050543) - Tunai [KS2611-8888]',
          created_at: '2026-11-24',
        },
        {
          id: 'cf-pos-compact-ok',
          direction: 'in',
          amount: 50000,
          category: 'PENJUALAN_POS',
          reference_id: 'POS2611-0001',
          description: 'Penjualan Tunai (POS2611-0001)',
          created_at: '2026-11-24',
        },
        {
          id: 'cf-bon-compact-ok',
          direction: 'in',
          amount: 50000,
          category: 'PELUNASAN_BON_TOKO',
          reference_id: 'KB2611-0001',
          description: 'Pelunasan Bon Toko (KB2611-0001)',
          created_at: '2026-11-24',
        },
      ],
    });

    expect(items.map((i) => i.id)).toEqual(['cf-loan-compact-orphan', 'cf-deposit-compact-orphan']);
    expect(items[0].reason).toContain('LN2611-9999');
    expect(items[1].reason).toContain('KS2611-8888');
  });

  it('detects paid loan_schedules missing loan_repayments and/or cash_flow (e.g. SALDO-AWAL-197006162009101001-GAJISIPA periods 1 & 2) without false positives', () => {
    const dataset = makeEmptyDataset({
      members: [
        { id: 'mem-mig', nrp: '197006162009101001', nama: 'Sutarman', status: 'aktif' },
        { id: 'mem-ok', nrp: '198001012010011002', nama: 'Widodo', status: 'aktif' },
      ],
      loans: [
        {
          id: 'loan-mig',
          loan_number: 'SALDO-AWAL-197006162009101001-GAJISIPA',
          member_id: 'mem-mig',
          amount: 12000000,
          status: 'active',
          disbursed_at: '2026-01-15',
        },
        {
          id: 'loan-ok',
          loan_number: 'LOAN-OK-01',
          member_id: 'mem-ok',
          amount: 2000000,
          status: 'active',
          disbursed_at: '2026-02-01',
        },
      ],
      loanSchedules: [
        // Periode 1 & 2 lunas tanpa kwitansi & tanpa cash_flow (meski ada cash_flow Bln ke-10 tidak boleh cocok ke Bln ke-1)
        {
          id: 'sch-mig-1',
          loan_id: 'loan-mig',
          period_number: 1,
          due_date: '2026-02-15',
          target_amount: 1000000,
          paid_amount: 1000000,
          status: 'paid',
        },
        {
          id: 'sch-mig-2',
          loan_id: 'loan-mig',
          period_number: 2,
          due_date: '2026-03-15',
          target_amount: 1000000,
          paid_amount: 1000000,
          status: 'paid',
        },
        // Periode 10 sudah punya kwitansi dan cash_flow
        {
          id: 'sch-mig-10',
          loan_id: 'loan-mig',
          period_number: 10,
          due_date: '2026-11-15',
          target_amount: 1000000,
          paid_amount: 1000000,
          status: 'paid',
        },
        // Periode 3 belum dibayar -> tidak boleh ditandai
        {
          id: 'sch-mig-3',
          loan_id: 'loan-mig',
          period_number: 3,
          due_date: '2026-04-15',
          target_amount: 1000000,
          paid_amount: 0,
          status: 'unpaid',
        },
        // Pembayaran normal via paySchedule / makePayment (loan-level cash_flow) -> tidak boleh false positive
        {
          id: 'sch-ok-1',
          loan_id: 'loan-ok',
          period_number: 1,
          due_date: '2026-03-01',
          target_amount: 500000,
          paid_amount: 500000,
          status: 'paid',
        },
      ],
      loanRepayments: [
        // Legacy aggregate SALDO_AWAL row (schedule_id null) must NOT suppress sch-mig-1 & sch-mig-2
        {
          id: 'rep-legacy-agg',
          loan_id: 'loan-mig',
          schedule_id: null,
          amount_paid: 2000000,
          payment_method: 'SALDO_AWAL',
          notes: 'Total Terangsur Saldo Awal (2026-03-01)',
        },
        {
          id: 'rep-mig-10',
          loan_id: 'loan-mig',
          schedule_id: 'sch-mig-10',
          amount_paid: 1000000,
          receipt_number: 'KW-PINJ-010',
          payment_date: '2026-11-15T08:00:00.000Z',
        },
        {
          id: 'rep-ok-1',
          loan_id: 'loan-ok',
          schedule_id: 'sch-ok-1',
          amount_paid: 500000,
          receipt_number: 'KW-OK-01',
          payment_date: '2026-03-01T08:00:00.000Z',
        },
      ],
      cashFlows: [
        {
          id: 'cf-mig-10',
          direction: 'in',
          amount: 1000000,
          category: 'angsuran_pinjaman',
          reference_id: 'sch-mig-10',
          description: 'Angsuran Pinjaman (SALDO-AWAL-197006162009101001-GAJISIPA) Bln ke-10',
          created_at: '2026-11-15T08:00:00.000Z',
        },
        {
          id: 'cf-ok-1',
          direction: 'in',
          amount: 500000,
          category: 'angsuran_pinjaman',
          reference_id: 'loan-ok',
          description: 'Angsuran Pinjaman (LOAN-OK-01)',
          created_at: '2026-03-01T08:00:00.000Z',
        },
      ],
    });

    const items = analyzeOrphanRecords(dataset);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id).sort()).toEqual(['sch-mig-1', 'sch-mig-2']);
    for (const item of items) {
      expect(item.anomalyType).toBe('missing_receipt_and_cashflow');
      expect(item.moduleCategory).toBe('Angsuran Tanpa Kwitansi/Kas');
      expect(item.direction).toBe('neutral');
      expect(item.missingTarget).toBe('loan_repayments & cash_flow');
    }

    const summary = buildOrphanScanSummary(items);
    expect(summary.totalCount).toBe(2);
    expect(summary.missingSyncCount).toBe(2);
    expect(summary.missingSyncAmount).toBe(2000000);
    expect(summary.cashInImpact).toBe(0);
    expect(summary.cashOutImpact).toBe(0);
  });

  it('deleteOrphanRecords ignores missing_receipt_and_cashflow items and syncUnreceiptedInstallments inserts receipts & cash_flow idempotently without transaction_date', async () => {
    const insertedRepayments: any[] = [];
    const insertedCashFlows: any[] = [];
    let existingRepayments: any[] = [];
    let existingCashFlows: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_repayments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: existingRepayments, error: null })),
          })),
          insert: vi.fn(async (payload: any) => {
            insertedRepayments.push(payload);
            existingRepayments.push(payload);
            return { error: null };
          }),
          delete: vi.fn(() => ({
            in: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: existingCashFlows, error: null })),
          })),
          insert: vi.fn(async (payload: any) => {
            insertedCashFlows.push(payload);
            existingCashFlows.push(payload);
            return { error: null };
          }),
          delete: vi.fn(() => ({
            in: vi.fn(async () => ({ error: null })),
          })),
        };
      }
      return {
        delete: vi.fn(() => ({
          in: vi.fn(async () => ({ error: null })),
        })),
      };
    });

    const syncItem: OrphanRecordItem = {
      id: 'sch-mig-1',
      sourceTable: 'loan_schedules',
      anomalyType: 'missing_receipt_and_cashflow',
      recommendedActionLabel: 'Sinkronkan Kwitansi & Kas',
      referenceCode: 'SALDO-AWAL-197006162009101001-GAJISIPA • Bln Ke-1',
      transactionDate: '2026-02-15',
      moduleCategory: 'Angsuran Tanpa Kwitansi/Kas',
      description: 'Angsuran Ke-1 (SALDO-AWAL-197006162009101001-GAJISIPA) — 197006162009101001 - Sutarman',
      amount: 1000000,
      direction: 'neutral',
      missingTarget: 'loan_repayments & cash_flow',
      reason: 'Belum ada kwitansi & arus kas',
      rawRecord: {
        schedule: {
          id: 'sch-mig-1',
          loan_id: 'loan-mig',
          period_number: 1,
          due_date: '2026-02-15',
          paid_amount: 1000000,
          status: 'paid',
        },
        loan: {
          id: 'loan-mig',
          loan_number: 'SALDO-AWAL-197006162009101001-GAJISIPA',
        },
        member: {
          id: 'mem-mig',
          nrp: '197006162009101001',
          nama: 'Sutarman',
        },
        hasReceipt: false,
        hasCashFlow: false,
        previewReceiptNumber: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B1',
        previewCashFlowDate: '2026-02-15',
      },
    };

    const delRes = await deleteOrphanRecords([syncItem]);
    expect(delRes.deletedCount).toBe(0);

    const firstSync = await syncUnreceiptedInstallments([syncItem]);
    expect(firstSync.errors).toEqual([]);
    expect(firstSync.syncedCount).toBe(1);
    expect(firstSync.createdReceiptsCount).toBe(1);
    expect(firstSync.createdCashFlowsCount).toBe(1);

    expect(insertedRepayments[0]).toMatchObject({
      loan_id: 'loan-mig',
      schedule_id: 'sch-mig-1',
      amount_paid: 1000000,
      payment_method: 'SALDO_AWAL_MIGRASI',
      receipt_number: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B1',
      payment_date: '2026-02-15T08:00:00.000Z',
    });

    expect(insertedCashFlows[0]).toMatchObject({
      direction: 'in',
      amount: 1000000,
      category: 'angsuran_pinjaman',
      reference_id: 'sch-mig-1',
      created_at: '2026-02-15T08:00:00.000Z',
    });
    expect(insertedCashFlows[0]).not.toHaveProperty('transaction_date');

    // Second invocation must be idempotent (skips existing rows)
    const secondSync = await syncUnreceiptedInstallments([syncItem]);
    expect(secondSync.errors).toEqual([]);
    expect(secondSync.createdReceiptsCount).toBe(0);
    expect(secondSync.createdCashFlowsCount).toBe(0);
    expect(secondSync.skippedCount).toBe(1);
  });

  it('flags redundant legacy lump-sum SALDO_AWAL row (KW2611-0079) as orphan_delete once per-period SALDO_AWAL_MIGRASI receipts exist', () => {
    const dataset = makeEmptyDataset({
      members: [{ id: 'mem-harjoso', nrp: '197006162009101001', nama: 'HARJOSO' }],
      loans: [
        {
          id: 'loan-harjoso',
          loan_number: 'SALDO-AWAL-197006162009101001-GAJISIPA',
          member_id: 'mem-harjoso',
          amount: 9000000,
          status: 'completed',
        },
      ],
      loanSchedules: [
        {
          id: 'sch-h-1',
          loan_id: 'loan-harjoso',
          period_number: 1,
          due_date: '2026-02-15',
          target_amount: 1000000,
          paid_amount: 1000000,
          status: 'paid',
        },
        {
          id: 'sch-h-2',
          loan_id: 'loan-harjoso',
          period_number: 2,
          due_date: '2026-03-15',
          target_amount: 1000000,
          paid_amount: 1000000,
          status: 'paid',
        },
      ],
      loanRepayments: [
        {
          id: 'rep-h-b1',
          loan_id: 'loan-harjoso',
          schedule_id: 'sch-h-1',
          amount_paid: 1000000,
          payment_method: 'SALDO_AWAL_MIGRASI',
          receipt_number: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B1',
          payment_date: '2026-02-15T08:00:00.000Z',
        },
        {
          id: 'rep-h-b2',
          loan_id: 'loan-harjoso',
          schedule_id: 'sch-h-2',
          amount_paid: 1000000,
          payment_method: 'SALDO_AWAL_MIGRASI',
          receipt_number: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B2',
          payment_date: '2026-03-15T08:00:00.000Z',
        },
        {
          id: 'rep-h-lump',
          loan_id: 'loan-harjoso',
          schedule_id: null,
          amount_paid: 2000000,
          payment_method: 'SALDO_AWAL',
          receipt_number: 'KW2611-0079',
          notes: 'Total Terangsur Saldo Awal (2026-11-22)',
          payment_date: '2026-11-22T08:00:00.000Z',
        },
      ],
      cashFlows: [
        {
          id: 'cf-h-1',
          direction: 'in',
          amount: 1000000,
          category: 'angsuran_pinjaman',
          reference_id: 'sch-h-1',
          created_at: '2026-02-15T08:00:00.000Z',
        },
        {
          id: 'cf-h-2',
          direction: 'in',
          amount: 1000000,
          category: 'angsuran_pinjaman',
          reference_id: 'sch-h-2',
          created_at: '2026-03-15T08:00:00.000Z',
        },
      ],
    });

    const items = analyzeOrphanRecords(dataset);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'rep-h-lump',
      sourceTable: 'loan_repayments',
      anomalyType: 'orphan_delete',
      referenceCode: 'KW2611-0079',
      amount: 2000000,
      missingTarget: 'duplikasi SALDO_AWAL',
    });
  });

  it('syncUnreceiptedInstallments automatically deletes superseded legacy lump-sum SALDO_AWAL row for synced loan', async () => {
    const deleteInMock = vi.fn(async () => ({ error: null }));
    const deleteMock = vi.fn(() => ({ in: deleteInMock }));
    const existingRepayments: any[] = [
      {
        id: 'rep-legacy-agg',
        loan_id: 'loan-mig',
        schedule_id: null,
        amount_paid: 2000000,
        payment_method: 'SALDO_AWAL',
        receipt_number: 'KW2611-0079',
        notes: 'Total Terangsur Saldo Awal (2026-11-22)',
      },
    ];
    const existingCashFlows: any[] = [];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_repayments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: existingRepayments, error: null })),
          })),
          insert: vi.fn(async (payload: any) => {
            existingRepayments.push({ id: 'rep-new-b1', ...payload });
            return { error: null };
          }),
          delete: deleteMock,
        };
      }
      if (table === 'cash_flow') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: existingCashFlows, error: null })),
          })),
          insert: vi.fn(async (payload: any) => {
            existingCashFlows.push(payload);
            return { error: null };
          }),
        };
      }
      return {};
    });

    const syncItem: OrphanRecordItem = {
      id: 'sch-mig-1',
      sourceTable: 'loan_schedules',
      anomalyType: 'missing_receipt_and_cashflow',
      recommendedActionLabel: 'Sinkronkan Kwitansi & Kas',
      referenceCode: 'SALDO-AWAL-197006162009101001-GAJISIPA • Bln Ke-1',
      transactionDate: '2026-02-15',
      moduleCategory: 'Angsuran Tanpa Kwitansi/Kas',
      description: 'Angsuran Ke-1 (SALDO-AWAL-197006162009101001-GAJISIPA)',
      amount: 1000000,
      direction: 'neutral',
      missingTarget: 'loan_repayments & cash_flow',
      reason: 'Belum ada kwitansi & arus kas',
      rawRecord: {
        schedule: {
          id: 'sch-mig-1',
          loan_id: 'loan-mig',
          period_number: 1,
          due_date: '2026-02-15',
          paid_amount: 1000000,
          status: 'paid',
        },
        loan: {
          id: 'loan-mig',
          loan_number: 'SALDO-AWAL-197006162009101001-GAJISIPA',
        },
        member: {
          id: 'mem-mig',
          nrp: '197006162009101001',
          nama: 'HARJOSO',
        },
        hasReceipt: false,
        hasCashFlow: false,
        previewReceiptNumber: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B1',
        previewCashFlowDate: '2026-02-15',
      },
    };

    const res = await syncUnreceiptedInstallments([syncItem]);
    expect(res.errors).toEqual([]);
    expect(res.syncedCount).toBe(1);
    expect(deleteMock).toHaveBeenCalled();
    expect(deleteInMock).toHaveBeenCalledWith('id', ['rep-legacy-agg']);
  });
});
