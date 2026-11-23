import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzeOrphanRecords,
  buildOrphanScanSummary,
  deleteOrphanRecords,
  scanAllOrphanRecords,
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
});
