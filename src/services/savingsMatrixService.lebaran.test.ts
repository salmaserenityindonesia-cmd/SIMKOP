import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isMonthSettledByCutOff,
  getLastCompletedLebaranCutOff,
  calculateFifoAllocation,
  matchAutomaticFifo,
  reconcileSingleMemberDeposit,
  generateMonthGrid
} from './savingsMatrixService';
import { supabase } from '../lib/supabaseClient';
import { SavingsRateTier } from './savingsRateService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } })
    }
  }
}));

describe('savingsMatrixService - Lebaran Cycle Protection & Cut-Off Reconciliation', () => {
  const mockTiers: SavingsRateTier[] = [
    {
      id: 'tier-lebaran-1',
      deposit_type_code: 'LEBARAN',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 100000
    },
    {
      id: 'tier-wajib-1',
      deposit_type_code: 'WAJIB',
      start_year: 2024,
      start_month: 1,
      end_year: null,
      end_month: null,
      monthly_rate: 150000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isMonthSettledByCutOff helper', () => {
    it('returns true for months prior to or on the cut-off date, and false for months after', () => {
      const cutOff = '2025-03-31';

      // 2024 months are all settled
      expect(isMonthSettledByCutOff(2024, 1, cutOff)).toBe(true);
      expect(isMonthSettledByCutOff(2024, 12, cutOff)).toBe(true);

      // 2025 Jan - Mar are settled
      expect(isMonthSettledByCutOff(2025, 1, cutOff)).toBe(true);
      expect(isMonthSettledByCutOff(2025, 2, cutOff)).toBe(true);
      expect(isMonthSettledByCutOff(2025, 3, cutOff)).toBe(true);

      // 2025 Apr onwards belongs to new cycle (not settled)
      expect(isMonthSettledByCutOff(2025, 4, cutOff)).toBe(false);
      expect(isMonthSettledByCutOff(2025, 5, cutOff)).toBe(false);
      expect(isMonthSettledByCutOff(2026, 1, cutOff)).toBe(false);

      // Failsafe with undefined or null
      expect(isMonthSettledByCutOff(2025, 1, null)).toBe(false);
      expect(isMonthSettledByCutOff(2025, 1, undefined)).toBe(false);
    });

    it('works correctly with Date objects', () => {
      const cutOffDateObj = new Date('2025-03-31T23:59:59');
      expect(isMonthSettledByCutOff(2025, 3, cutOffDateObj)).toBe(true);
      expect(isMonthSettledByCutOff(2025, 4, cutOffDateObj)).toBe(false);
    });
  });

  describe('calculateFifoAllocation with LEBARAN and cut-off date', () => {
    it('skips settled months and starts allocating new deposits from the first month after cut-off', () => {
      const grid = generateMonthGrid(2024, 2025);
      const cutOff = '2025-03-31';

      // New deposit of Rp 200.000 for LEBARAN (monthly rate = 100.000)
      // Should allocate to Apr 2025 and May 2025 (2 months), ignoring Jan 2024 - Mar 2025
      const res = calculateFifoAllocation(
        200000,
        grid,
        'LEBARAN',
        mockTiers,
        '2024-01-01',
        'md-lebaran-1',
        cutOff
      );

      expect(res.matchedKeys).toEqual(['2025-04', '2025-05']);
      expect(res.totalAllocated).toBe(200000);
      expect(res.remainingBalance).toBe(0);
      expect(res.allocatedTransactions).toHaveLength(2);
      expect(res.allocatedTransactions[0].for_year).toBe(2025);
      expect(res.allocatedTransactions[0].for_month).toBe(4);
      expect(res.allocatedTransactions[1].for_year).toBe(2025);
      expect(res.allocatedTransactions[1].for_month).toBe(5);
    });

    it('returns empty allocation if target balance is 0 or negative', () => {
      const grid = generateMonthGrid(2024, 2025);
      const resZero = calculateFifoAllocation(0, grid, 'LEBARAN', mockTiers, null, 'md-1', '2025-03-31');
      expect(resZero.matchedKeys).toEqual([]);
      expect(resZero.totalAllocated).toBe(0);

      const resNeg = calculateFifoAllocation(-50000, grid, 'LEBARAN', mockTiers, null, 'md-1', '2025-03-31');
      expect(resNeg.matchedKeys).toEqual([]);
      expect(resNeg.totalAllocated).toBe(0);
    });

    it('allocates remainder partial transaction starting after cut-off date', () => {
      const grid = generateMonthGrid(2024, 2025);
      const cutOff = '2025-03-31';

      // Saldo 150.000: 100.000 full (Apr 2025) + 50.000 partial (Mei 2025)
      const res = calculateFifoAllocation(
        150000,
        grid,
        'LEBARAN',
        mockTiers,
        '2024-01-01',
        'md-lebaran-1',
        cutOff
      );

      expect(res.matchedKeys).toEqual(['2025-04', '2025-05']);
      expect(res.totalAllocated).toBe(150000);
      expect(res.partialTransaction).toBeDefined();
      expect(res.partialTransaction?.key).toBe('2025-05');
      expect(res.partialTransaction?.amount).toBe(50000);
      expect(res.partialTransaction?.isPartial).toBe(true);
    });

    it('matchAutomaticFifo respects cutOffDate option', () => {
      const grid = generateMonthGrid(2024, 2025);
      const cutOff = '2025-03-31';

      const keys = matchAutomaticFifo(100000, grid, 'LEBARAN', mockTiers, '2024-01-01', {
        cutOffDate: cutOff
      });
      expect(keys).toEqual(['2025-04']);
    });
  });

  describe('reconcileSingleMemberDeposit - Scenario Saldo Rp 1.200.000 dicairkan massal Rp 1.200.000', () => {
    it('memastikan saldo riil setelah pencairan adalah Rp 0 dan tidak ada slot bulan yang teralokasi', async () => {
      const memberId = 'member-lebaran-001';
      const mdId = 'md-lebaran-001';
      const cutOff = '2025-03-31';

      // 12 setoran @ 100.000 = Rp 1.200.000
      const oldDeposits = Array.from({ length: 12 }, (_, i) => ({
        id: `tx-dep-${i + 1}`,
        member_deposit_id: mdId,
        transaction_type: 'deposit',
        amount: 100000,
        for_year: 2024,
        for_month: i + 1,
        transaction_date: `2024-${String(i + 1).padStart(2, '0')}-05`,
        description: `Setoran Matriks LEBARAN ${i + 1} 2024`,
        created_at: `2024-${String(i + 1).padStart(2, '0')}-05T00:00:00Z`
      }));

      // Mutasi penarikan massal Rp 1.200.000 pada cut_off_date
      const massWithdrawal = {
        id: 'tx-with-mass-1',
        member_deposit_id: mdId,
        transaction_type: 'withdrawal',
        amount: 1200000,
        transaction_date: '2025-03-31',
        description: 'Pencairan Massal Simpanan Lebaran - Idul Fitri 1446 H',
        notes: 'Pencairan Massal Simpanan Lebaran',
        created_at: '2025-03-31T09:00:00Z'
      };

      const allTxs = [...oldDeposits, massWithdrawal];

      const mockMemberDeposits = [
        {
          id: mdId,
          member_id: memberId,
          deposit_type_id: 'dt-lebaran',
          deposit_types: { id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN' },
          deposit_transactions: allTxs
        }
      ];

      const deletedIds: string[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'cycle-2025',
                        cycle_name: 'Idul Fitri 1446 H',
                        cut_off_date: cutOff,
                        status: 'COMPLETED'
                      },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null }),
              in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                deletedIds.push(...ids);
                return Promise.resolve({ data: null, error: null });
              }),
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      neq: vi.fn().mockResolvedValue({ data: null, error: null })
                    })
                  })
                }),
                is: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockResolvedValue({ data: null, error: null })
                }),
                or: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            }),
            insert: vi.fn().mockResolvedValue({ data: [], error: null })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await reconcileSingleMemberDeposit(memberId, 'LEBARAN', {
        rateTiers: mockTiers,
        depTypes: [{ id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN' }],
        memberDeposits: mockMemberDeposits,
        lastLebaranCutOffDate: cutOff
      });

      // Saldo setelah pencairan tepat bernilai Rp 0
      expect(res.success).toBe(true);
      expect(res.matchedKeys).toEqual([]);
      expect(res.insertedCount).toBe(0);

      // Tidak ada mutasi historis yang dihapus
      expect(deletedIds).toHaveLength(0);
    });

    it('memastikan setoran baru pada bulan berikutnya mengalokasikan saldo dimulai murni dari Rp 0 tanpa terdistorsi histori masa lalu', async () => {
      const memberId = 'member-lebaran-001';
      const mdId = 'md-lebaran-001';
      const cutOff = '2025-03-31';

      // 12 setoran lampau 2024 = Rp 1.200.000
      const oldDeposits = Array.from({ length: 12 }, (_, i) => ({
        id: `tx-dep-${i + 1}`,
        member_deposit_id: mdId,
        transaction_type: 'deposit',
        amount: 100000,
        for_year: 2024,
        for_month: i + 1,
        transaction_date: `2024-${String(i + 1).padStart(2, '0')}-05`,
        description: `Setoran Matriks LEBARAN ${i + 1} 2024`,
        created_at: `2024-${String(i + 1).padStart(2, '0')}-05T00:00:00Z`
      }));

      // Pencairan massal 100% saldo riil pada cut-off date
      const massWithdrawal = {
        id: 'tx-with-mass-1',
        member_deposit_id: mdId,
        transaction_type: 'withdrawal',
        amount: 1200000,
        transaction_date: '2025-03-31',
        description: 'Pencairan Massal Simpanan Lebaran - Idul Fitri 1446 H',
        notes: 'Pencairan Massal Simpanan Lebaran',
        created_at: '2025-03-31T09:00:00Z'
      };

      // Setoran rutin siklus baru pada April 2025 (bulan pertama setelah cut-off date): Rp 100.000
      const newCycleDeposit = {
        id: 'tx-dep-new-cycle-1',
        member_deposit_id: mdId,
        transaction_type: 'deposit',
        amount: 100000,
        for_year: 2025,
        for_month: 4,
        transaction_date: '2025-04-10',
        description: 'Setoran Rutin Matriks (LEBARAN)',
        created_at: '2025-04-10T10:00:00Z'
      };

      const allTxs = [...oldDeposits, massWithdrawal, newCycleDeposit];

      const mockMemberDeposits = [
        {
          id: mdId,
          member_id: memberId,
          deposit_type_id: 'dt-lebaran',
          deposit_types: { id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN' },
          deposit_transactions: allTxs
        }
      ];

      let insertedRows: any[] = [];
      const deletedIds: string[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: 'cycle-2025',
                        cycle_name: 'Idul Fitri 1446 H',
                        cut_off_date: cutOff,
                        status: 'COMPLETED'
                      },
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null }),
              in: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            delete: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                deletedIds.push(...ids);
                return Promise.resolve({ data: null, error: null });
              }),
              eq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lte: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      neq: vi.fn().mockResolvedValue({ data: null, error: null })
                    })
                  })
                }),
                is: vi.fn().mockReturnValue({
                  ilike: vi.fn().mockResolvedValue({ data: null, error: null })
                }),
                or: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            }),
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedRows = rows;
              return Promise.resolve({ data: rows, error: null });
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await reconcileSingleMemberDeposit(memberId, 'LEBARAN', {
        rateTiers: mockTiers,
        depTypes: [{ id: 'dt-lebaran', name: 'Simpanan Lebaran', code: 'LEBARAN' }],
        memberDeposits: mockMemberDeposits,
        lastLebaranCutOffDate: cutOff
      });

      expect(res.success).toBe(true);

      // Alokasi tepat dimulai pada April 2025 (bulan pertama siklus baru)
      expect(res.matchedKeys).toEqual(['2025-04']);
      expect(res.insertedCount).toBe(1);
      expect(res.totalAllocated).toBe(100000);

      // Memastikan mutasi yang disisipkan adalah untuk periode April 2025
      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].for_year).toBe(2025);
      expect(insertedRows[0].for_month).toBe(4);
      expect(insertedRows[0].amount).toBe(100000);

      // Memastikan mutasi histori 2024 dan penarikan massal TIDAK pernah dihapus
      oldDeposits.forEach(d => {
        expect(deletedIds).not.toContain(d.id);
      });
      expect(deletedIds).not.toContain(massWithdrawal.id);
    });
  });
});
