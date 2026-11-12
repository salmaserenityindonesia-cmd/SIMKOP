import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  simulateLebaranDisbursement,
  createDisbursementDraft,
  approveAndExecuteDisbursement,
  rejectDisbursementDraft,
  getLebaranDisbursementCycles,
  getLastCompletedLebaranCycle,
  isLebaranDepositType,
  bulkWithdrawalService
} from './bulkWithdrawalService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn()
  }
}));

describe('bulkWithdrawalService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createMockChain(data: any, error: any = null) {
    const chain: any = {};
    const promise = Promise.resolve({ data, error });
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.in = vi.fn(() => chain);
    chain.order = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.single = vi.fn(() => promise);
    chain.maybeSingle = vi.fn(() => promise);
    chain.then = (onRes: any, onRej: any) => promise.then(onRes, onRej);
    return chain;
  }

  describe('isLebaranDepositType', () => {
    it('detects Lebaran and Hari Raya variations properly', () => {
      expect(isLebaranDepositType('LEBARAN', 'Simpanan Lebaran')).toBe(true);
      expect(isLebaranDepositType('SL', 'Simpanan Lebaran')).toBe(true);
      expect(isLebaranDepositType('THR', 'Tabungan Hari Raya')).toBe(true);
      expect(isLebaranDepositType(null, 'Simpanan Hari Raya Idul Fitri')).toBe(true);
      expect(isLebaranDepositType('SW', 'Simpanan Wajib')).toBe(false);
      expect(isLebaranDepositType('SB', 'Simpanan Belanja')).toBe(false);
      expect(isLebaranDepositType('SP', 'Simpanan Pokok')).toBe(false);
    });
  });

  describe('simulateLebaranDisbursement', () => {
    it('simulates bulk lebaran disbursement with active members, balances, and loan status', async () => {
      // 1. Mock deposit_types
      const mockDepositTypes = [
        { id: 'dt-wajib', code: 'SW', name: 'Simpanan Wajib' },
        { id: 'dt-lebaran', code: 'SL', name: 'Simpanan Lebaran' }
      ];

      // 2. Mock member_deposits
      const mockMemberDeposits = [
        { id: 'md-leb-01', member_id: 'mem-01', deposit_type_id: 'dt-lebaran' },
        { id: 'md-leb-02', member_id: 'mem-02', deposit_type_id: 'dt-lebaran' },
        { id: 'md-leb-03', member_id: 'mem-03', deposit_type_id: 'dt-lebaran' }, // Non-active member
        { id: 'md-leb-04', member_id: 'mem-04', deposit_type_id: 'dt-lebaran' }  // 0 balance
      ];

      // 3. Mock anggota
      const mockAnggota = [
        { id: 'mem-01', nrp: '112233', nama: 'Budi Santoso', pangkat: 'Serka', bank_account_number: '1234567890', status: 'aktif' },
        { id: 'mem-02', nrp: '445566', nama: 'Agus Setiawan', pangkat: 'Kopda', bank_account_number: '0987654321', status: 'aktif' },
        { id: 'mem-03', nrp: '778899', nama: 'Dodi Purnomo', pangkat: 'Sertu', bank_account_number: '111222333', status: 'keluar' },
        { id: 'mem-04', nrp: '332211', nama: 'Candra Wijaya', pangkat: 'Praka', bank_account_number: '444555666', status: 'aktif' }
      ];

      // 4. Mock deposit_transactions
      const mockTransactions = [
        // Budi: 2 x 500.000 = 1.000.000
        { member_deposit_id: 'md-leb-01', amount: 500000, transaction_type: 'deposit' },
        { member_deposit_id: 'md-leb-01', amount: 500000, transaction_type: 'deposit' },
        // Agus: 1.500.000 deposit - 500.000 withdrawal = 1.000.000
        { member_deposit_id: 'md-leb-02', amount: 1500000, transaction_type: 'deposit' },
        { member_deposit_id: 'md-leb-02', amount: 500000, transaction_type: 'withdrawal' },
        // Dodi (non-active): 800.000
        { member_deposit_id: 'md-leb-03', amount: 800000, transaction_type: 'deposit' },
        // Candra: 500.000 deposit - 500.000 withdrawal = 0 (filtered out)
        { member_deposit_id: 'md-leb-04', amount: 500000, transaction_type: 'deposit' },
        { member_deposit_id: 'md-leb-04', amount: 500000, transaction_type: 'withdrawal' }
      ];

      // 5. Mock loans
      const mockLoans = [
        {
          id: 'loan-01',
          member_id: 'mem-01',
          amount: 5000000,
          principal_amount: 5000000,
          status: 'active',
          loan_schedules: [
            { id: 'sched-1', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
            { id: 'sched-2', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
            { id: 'sched-3', target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
          ]
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return createMockChain(mockDepositTypes);
        }
        if (table === 'member_deposits') {
          return createMockChain(mockMemberDeposits);
        }
        if (table === 'anggota') {
          return createMockChain(mockAnggota);
        }
        if (table === 'deposit_transactions') {
          return createMockChain(mockTransactions);
        }
        if (table === 'loans') {
          return createMockChain(mockLoans);
        }
        return createMockChain([]);
      });

      const result = await simulateLebaranDisbursement();

      // Expectations:
      // Members with saldo > 0 and aktif:
      // 1. Agus Setiawan: 1.000.000, no active loan
      // 2. Budi Santoso: 1.000.000, has active loan (remaining 2.000.000 from unpaid schedules)
      expect(result.totalMembers).toBe(2);
      expect(result.totalAmount).toBe(2000000);
      expect(result.averageAmount).toBe(1000000);
      expect(result.members.length).toBe(2);

      // Check sorting by nama ascending
      expect(result.members[0].nama).toBe('Agus Setiawan');
      expect(result.members[0].saldoLebaran).toBe(1000000);
      expect(result.members[0].hasActiveLoan).toBe(false);
      expect(result.members[0].activeLoanRemaining).toBe(0);

      expect(result.members[1].nama).toBe('Budi Santoso');
      expect(result.members[1].saldoLebaran).toBe(1000000);
      expect(result.members[1].hasActiveLoan).toBe(true);
      expect(result.members[1].activeLoanRemaining).toBe(2000000);
    });

    it('returns empty summary when no Lebaran deposit type exists', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return createMockChain([{ id: 'dt-wajib', code: 'SW', name: 'Simpanan Wajib' }]);
        }
        return createMockChain([]);
      });

      const res = await simulateLebaranDisbursement();
      expect(res.totalMembers).toBe(0);
      expect(res.totalAmount).toBe(0);
      expect(res.members).toEqual([]);
    });
  });

  describe('createDisbursementDraft', () => {
    it('creates a new draft cycle with simulated totals', async () => {
      // Mock simulate requirements
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return createMockChain([{ id: 'dt-lebaran', code: 'SL', name: 'Simpanan Lebaran' }]);
        }
        if (table === 'member_deposits') {
          return createMockChain([{ id: 'md-01', member_id: 'm-1', deposit_type_id: 'dt-lebaran' }]);
        }
        if (table === 'anggota') {
          return createMockChain([{ id: 'm-1', nrp: '123', nama: 'Wawan', status: 'aktif' }]);
        }
        if (table === 'deposit_transactions') {
          return createMockChain([{ member_deposit_id: 'md-01', amount: 2500000, transaction_type: 'deposit' }]);
        }
        if (table === 'loans') {
          return createMockChain([]);
        }
        if (table === 'lebaran_disbursement_cycles') {
          const insertMock = {
            select: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({
                  data: {
                    id: 'cycle-uuid-01',
                    cycle_name: 'Pencairan THR Idul Fitri 1447H',
                    cut_off_date: '2026-03-15T00:00:00Z',
                    total_members: 1,
                    total_amount: 2500000,
                    status: 'DRAFT',
                    notes: 'Draf Siklus Pencairan',
                    created_by: 'admin-user',
                    created_at: '2026-03-01T10:00:00Z',
                    updated_at: '2026-03-01T10:00:00Z'
                  },
                  error: null
                })
              )
            }))
          };
          return {
            insert: vi.fn((rows: any[]) => {
              expect(rows[0].status).toBe('DRAFT');
              expect(rows[0].total_members).toBe(1);
              expect(rows[0].total_amount).toBe(2500000);
              return insertMock;
            })
          };
        }
        return createMockChain([]);
      });

      const cycle = await createDisbursementDraft({
        cycleName: 'Pencairan THR Idul Fitri 1447H',
        cutOffDate: '2026-03-15T00:00:00Z',
        notes: 'Draf Siklus Pencairan',
        createdBy: 'admin-user'
      });

      expect(cycle.id).toBe('cycle-uuid-01');
      expect(cycle.status).toBe('DRAFT');
      expect(cycle.total_members).toBe(1);
      expect(cycle.total_amount).toBe(2500000);
    });

    it('throws error when cycleName or cutOffDate is missing', async () => {
      await expect(
        createDisbursementDraft({ cycleName: '', cutOffDate: '2026-03-15' })
      ).rejects.toThrow('Nama siklus pencairan wajib diisi.');

      await expect(
        createDisbursementDraft({ cycleName: 'THR', cutOffDate: '' })
      ).rejects.toThrow('Tanggal cut-off wajib diisi.');
    });
  });

  describe('approveAndExecuteDisbursement', () => {
    it('executes disbursement via RPC atomic when available', async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: {
          success: true,
          cycle_id: 'cycle-01',
          total_members: 42,
          total_amount: 105000000
        },
        error: null
      });

      const res = await approveAndExecuteDisbursement('cycle-01', 'admin-uid');

      expect(res.success).toBe(true);
      expect(res.executionMode).toBe('rpc');
      expect(res.totalMembers).toBe(42);
      expect(res.totalAmount).toBe(105000000);
      expect(supabase.rpc).toHaveBeenCalledWith('execute_bulk_lebaran_disbursement', {
        p_cycle_id: 'cycle-01',
        p_approver_id: 'admin-uid'
      });
    });

    it('falls back to client-side execution when RPC fails or is missing', async () => {
      // 1. RPC throws or returns error
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: { message: 'function execute_bulk_lebaran_disbursement does not exist' }
      });

      // 2. Mock cycle in DRAFT status
      const mockCycle = {
        id: 'cycle-01',
        cycle_name: 'Pencairan THR 2026',
        cut_off_date: '2026-03-20T00:00:00Z',
        status: 'DRAFT'
      };

      // Mock member simulation
      const mockDepositTypes = [{ id: 'dt-lebaran', code: 'LEBARAN', name: 'Simpanan Lebaran' }];
      const mockMemberDeposits = [{ id: 'md-01', member_id: 'mem-01', deposit_type_id: 'dt-lebaran' }];
      const mockAnggota = [{ id: 'mem-01', nrp: '998877', nama: 'Joko Widodo', pangkat: 'Mayor', bank_account_number: '999888', status: 'aktif' }];
      const mockTxs = [{ member_deposit_id: 'md-01', amount: 3000000, transaction_type: 'deposit' }];

      let insertedTxRows: any[] = [];
      let updatedCyclePayload: any = null;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: mockCycle, error: null }))
              }))
            })),
            update: vi.fn((payload: any) => {
              updatedCyclePayload = payload;
              return {
                eq: vi.fn(() => Promise.resolve({ data: { ...mockCycle, ...payload }, error: null }))
              };
            })
          };
        }
        if (table === 'deposit_types') {
          return createMockChain(mockDepositTypes);
        }
        if (table === 'member_deposits') {
          return createMockChain(mockMemberDeposits);
        }
        if (table === 'anggota') {
          return createMockChain(mockAnggota);
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => Promise.resolve({ data: mockTxs, error: null }))
            })),
            insert: vi.fn((rows: any[]) => {
              insertedTxRows = rows;
              return {
                select: vi.fn(() => ({
                  single: vi.fn(() => Promise.resolve({ data: { id: 'tx-new-01', ...rows[0] }, error: null }))
                }))
              };
            })
          };
        }
        if (table === 'cash_flow') {
          return createMockChain([]);
        }
        if (table === 'loans') {
          return createMockChain([]);
        }
        return createMockChain([]);
      });

      const res = await approveAndExecuteDisbursement('cycle-01', 'approver-007');

      expect(res.success).toBe(true);
      expect(res.executionMode).toBe('client_fallback');
      expect(res.totalMembers).toBe(1);
      expect(res.totalAmount).toBe(3000000);

      // Verify inserted withdrawal transaction
      expect(insertedTxRows.length).toBe(1);
      expect(insertedTxRows[0].transaction_type).toBe('withdrawal');
      expect(insertedTxRows[0].amount).toBe(3000000);
      expect(insertedTxRows[0].reference_no).toBe('KW-THR-2026-998877');
      expect(insertedTxRows[0].payment_method).toBe('transfer');
      expect(insertedTxRows[0].created_by).toBe('approver-007');

      // Verify updated cycle
      expect(updatedCyclePayload).not.toBeNull();
      expect(updatedCyclePayload.status).toBe('COMPLETED');
      expect(updatedCyclePayload.total_members).toBe(1);
      expect(updatedCyclePayload.total_amount).toBe(3000000);
      expect(updatedCyclePayload.approved_by).toBe('approver-007');
    });

    it('rejects execution if cycle is already COMPLETED or REJECTED', async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: { message: 'RPC not available' }
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { id: 'cycle-02', status: 'COMPLETED' },
                    error: null
                  })
                )
              }))
            }))
          };
        }
        return createMockChain([]);
      });

      await expect(
        approveAndExecuteDisbursement('cycle-02', 'admin-id')
      ).rejects.toThrow('tidak dapat dieksekusi karena berstatus COMPLETED');
    });
  });

  describe('rejectDisbursementDraft', () => {
    it('updates cycle status to REJECTED with notes', async () => {
      let payloadCaptured: any = null;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return {
            update: vi.fn((payload: any) => {
              payloadCaptured = payload;
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn(() =>
                      Promise.resolve({
                        data: {
                          id: 'cycle-draft-01',
                          status: 'REJECTED',
                          notes: 'Dibatalkan oleh Pengurus',
                          updated_at: payload.updated_at
                        },
                        error: null
                      })
                    )
                  }))
                }))
              };
            })
          };
        }
        return createMockChain([]);
      });

      const res = await rejectDisbursementDraft('cycle-draft-01', 'Dibatalkan oleh Pengurus');

      expect(res.id).toBe('cycle-draft-01');
      expect(res.status).toBe('REJECTED');
      expect(payloadCaptured.status).toBe('REJECTED');
      expect(payloadCaptured.notes).toBe('Dibatalkan oleh Pengurus');
    });
  });

  describe('getLebaranDisbursementCycles & getLastCompletedLebaranCycle', () => {
    it('retrieves all disbursement cycles ordered by created_at DESC', async () => {
      const mockCycles = [
        { id: 'c-2', cycle_name: 'THR 2026', status: 'DRAFT', created_at: '2026-03-01' },
        { id: 'c-1', cycle_name: 'THR 2025', status: 'COMPLETED', created_at: '2025-03-01' }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return createMockChain(mockCycles);
        }
        return createMockChain([]);
      });

      const list = await getLebaranDisbursementCycles();
      expect(list.length).toBe(2);
      expect(list[0].id).toBe('c-2');
    });

    it('retrieves the last completed cycle for cut-off date reference', async () => {
      const mockLastCompleted = {
        id: 'c-1',
        cycle_name: 'THR 2025',
        cut_off_date: '2025-03-25T00:00:00Z',
        status: 'COMPLETED'
      };

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          const chain = createMockChain(mockLastCompleted);
          return chain;
        }
        return createMockChain([]);
      });

      const last = await getLastCompletedLebaranCycle();
      expect(last).not.toBeNull();
      expect(last?.id).toBe('c-1');
      expect(last?.status).toBe('COMPLETED');
    });
  });

  describe('bulkWithdrawalService instance export', () => {
    it('exposes all core methods on default object instance', () => {
      expect(typeof bulkWithdrawalService.simulateLebaranDisbursement).toBe('function');
      expect(typeof bulkWithdrawalService.createDisbursementDraft).toBe('function');
      expect(typeof bulkWithdrawalService.approveAndExecuteDisbursement).toBe('function');
      expect(typeof bulkWithdrawalService.rejectDisbursementDraft).toBe('function');
      expect(typeof bulkWithdrawalService.getLebaranDisbursementCycles).toBe('function');
      expect(typeof bulkWithdrawalService.getLastCompletedLebaranCycle).toBe('function');
      expect(typeof bulkWithdrawalService.getCycleRecipients).toBe('function');
      expect(typeof bulkWithdrawalService.addHistoricalDisbursementDate).toBe('function');
      expect(typeof bulkWithdrawalService.addHistoricalDisbursementDates).toBe('function');
      expect(typeof bulkWithdrawalService.deleteHistoricalDisbursementDate).toBe('function');
      expect(typeof bulkWithdrawalService.executeReplayAllCycles).toBe('function');
      expect(typeof bulkWithdrawalService.recordManualLebaranWithdrawal).toBe('function');
    });
  });

  describe('Historical Dates, Recipients and Replay', () => {
    it('getCycleRecipients retrieves recipient details', async () => {
      const mockItems = [
        { id: 'i-1', cycle_id: 'c-1', member_id: 'm-1', nrp: '111', member_name: 'Budi', amount_disbursed: 500000 },
        { id: 'i-2', cycle_id: 'c-1', member_id: 'm-2', nrp: '222', member_name: 'Agus', amount_disbursed: 750000 }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_items') {
          return createMockChain(mockItems);
        }
        return createMockChain([]);
      });

      const recipients = await bulkWithdrawalService.getCycleRecipients('c-1');
      expect(recipients.length).toBe(2);
      expect(recipients[0].member_name).toBe('Budi');
    });

    it('addHistoricalDisbursementDate inserts historical cycle with correct defaults', async () => {
      let insertedPayload: any = null;
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          const chain = createMockChain({ id: 'c-hist-1', disbursement_date: '2024-04-10' });
          chain.insert = vi.fn((rows: any[]) => {
            insertedPayload = rows[0];
            return chain;
          });
          return chain;
        }
        return createMockChain([]);
      });

      const res = await bulkWithdrawalService.addHistoricalDisbursementDate('2024-04-10', 'Lebaran 2024');
      expect(res.id).toBe('c-hist-1');
      expect(insertedPayload.disbursement_date).toBe('2024-04-10');
      expect(insertedPayload.source_type).toBe('HISTORICAL_INPUT');
      expect(insertedPayload.status).toBe('COMPLETED');
    });

    it('addHistoricalDisbursementDates handles multiple dates and skips invalid formats', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          return createMockChain({ id: 'c-1' });
        }
        return createMockChain([]);
      });

      const result = await bulkWithdrawalService.addHistoricalDisbursementDates([
        '2023-04-20',
        'invalid-date',
        '2024-04-10'
      ]);

      expect(result.added).toBe(2);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Format tanggal tidak valid');
    });

    it('deleteHistoricalDisbursementDate deletes a cycle', async () => {
      let deletedWhereId: string | null = null;
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          const chain = createMockChain(null);
          chain.delete = vi.fn(() => chain);
          chain.eq = vi.fn((col: string, val: string) => {
            if (col === 'id') deletedWhereId = val;
            return chain;
          });
          return chain;
        }
        return createMockChain([]);
      });

      const success = await bulkWithdrawalService.deleteHistoricalDisbursementDate('c-to-delete');
      expect(success).toBe(true);
      expect(deletedWhereId).toBe('c-to-delete');
    });

    it('executeReplayAllCycles uses RPC when available', async () => {
      (supabase.rpc as any).mockResolvedValue({
        data: { success: true, total_cycles: 5, total_recipients: 100, total_amount: 50000000 },
        error: null
      });

      const result = await bulkWithdrawalService.executeReplayAllCycles();
      expect(result.success).toBe(true);
      expect(result.mode).toBe('rpc');
      expect(result.totalCycles).toBe(5);
      expect(result.totalRecipients).toBe(100);
      expect(result.totalAmount).toBe(50000000);
    });

    it('recordManualLebaranWithdrawal upserts cycle and item for manual disbursement', async () => {
      let insertedItem: any = null;
      let updatedCycle: any = null;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'lebaran_disbursement_cycles') {
          const chain = createMockChain({ id: 'cycle-exist', total_members: 1, total_amount: 100000 });
          chain.update = vi.fn((payload) => {
            updatedCycle = payload;
            return chain;
          });
          return chain;
        }
        if (table === 'lebaran_disbursement_items') {
          const chain = createMockChain(null);
          chain.insert = vi.fn((rows: any[]) => {
            insertedItem = rows[0];
            return chain;
          });
          return chain;
        }
        return createMockChain([]);
      });

      await bulkWithdrawalService.recordManualLebaranWithdrawal({
        memberId: 'mem-10',
        memberName: 'Sertu Bambang',
        nrp: '998877',
        amount: 500000,
        transactionDate: '2026-03-15'
      });

      expect(insertedItem).not.toBeNull();
      expect(insertedItem.member_name).toBe('Sertu Bambang');
      expect(insertedItem.amount_disbursed).toBe(500000);
      expect(updatedCycle).not.toBeNull();
      expect(updatedCycle.total_members).toBe(2);
      expect(updatedCycle.total_amount).toBe(600000);
    });
  });
});
