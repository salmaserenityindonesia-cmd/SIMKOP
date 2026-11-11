import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDepositTypes,
  addDepositType,
  updateDepositType,
  deleteDepositType,
  getMemberDeposits,
  ensureMandatoryDepositsAndEnroll,
  getMemberDepositBills,
  addDepositTransaction,
  getMonthlyDepositCommitments
} from './depositManagementService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn()
    }
  };
});

describe('depositManagementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDepositTypes', () => {
    it('harus memuat deposit_types dan menyinkronkan dengan tarif simpanan bertingkat', async () => {
      const mockTypes = [
        { id: 'dt-1', code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockTypes, error: null })
            })
          };
        }
        if (table === 'savings_rate_tiers') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 't-wajib', deposit_type_code: 'WAJIB', start_year: 2025, start_month: 1, end_year: null, end_month: null, monthly_rate: 250000 }
                  ],
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const types = await getDepositTypes();
      expect(types).toHaveLength(1);
      expect(types[0].effective_amount).toBe(250000);
    });

    it('harus mengembalikan array kosong jika tabel belum ada (42P01)', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
            })
          };
        }
        return {};
      });

      const types = await getDepositTypes();
      expect(types).toEqual([]);
    });
  });

  describe('CRUD deposit_types', () => {
    it('harus menambahkan jenis simpanan baru', async () => {
      const newType = { code: 'ST', name: 'Simpanan Khusus', frequency_type: 'monthly', default_amount: 75000, can_be_withdrawn: true, is_active: true };
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'dt-new', ...newType }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      const res = await addDepositType(newType);
      expect(res.id).toBe('dt-new');
      expect(res.code).toBe('ST');
    });

    it('harus mengupdate jenis simpanan', async () => {
      const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'dt-1', name: 'Simpanan Wajib Update' }, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ update: mockUpdate });

      const res = await updateDepositType('dt-1', { name: 'Simpanan Wajib Update' });
      expect(res.name).toBe('Simpanan Wajib Update');
    });

    it('harus menghapus jenis simpanan', async () => {
      const mockEq = vi.fn().mockResolvedValue({ error: null });
      const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockReturnValue({ delete: mockDelete });

      await expect(deleteDepositType('dt-1')).resolves.not.toThrow();
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('getMemberDeposits & getMemberDepositBills', () => {
    it('harus memuat tagihan simpanan anggota dengan benar', async () => {
      const mockTypes = [
        { id: 'dt-sw', code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, is_active: true }
      ];
      const mockMemberDeposits = [
        { id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-sw' }
      ];
      const mockTx = [
        { id: 'tx-1', member_deposit_id: 'md-1', amount: 20000, for_month: 11, for_year: 2026 }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          const queryObj: any = {
            order: vi.fn().mockResolvedValue({ data: mockTypes, error: null }),
            then: (resolve: any) => Promise.resolve({ data: mockTypes, error: null }).then(resolve)
          };
          return {
            select: vi.fn().mockReturnValue(queryObj)
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockMemberDeposits, error: null })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockTx, error: null })
            })
          };
        }
        return {};
      });

      const bills = await getMemberDepositBills('m-1', 11, 2026);
      expect(bills).toHaveLength(1);
      expect(bills[0].deposit_name).toBe('Simpanan Wajib');
      expect(bills[0].remaining_balance).toBe(30000); // 50000 - 20000
    });
  });

  describe('addDepositTransaction', () => {
    it('harus mencatat transaksi setoran simpanan', async () => {
      const mockTx = {
        id: 'tx-new',
        member_deposit_id: 'md-1',
        amount: 50000,
        for_month: 11,
        for_year: 2026,
        transaction_type: 'deposit'
      };
      const mockSingle = vi.fn().mockResolvedValue({ data: mockTx, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabase.from as any).mockReturnValue({ insert: mockInsert });

      const res = await addDepositTransaction('md-1', 50000, 11, 2026);
      expect(res.id).toBe('tx-new');
      expect(res.amount).toBe(50000);
    });
  });

  describe('getMonthlyDepositCommitments', () => {
    it('harus memuat komitmen simpanan bulanan', async () => {
      const mockCommitments = [
        {
          id: 'comm-1',
          member_id: 'm-1',
          for_month: 11,
          for_year: 2026,
          expected_amount: 100000,
          paid_amount: 100000,
          status: 'Lunas',
          anggota: { nama: 'Budi', nrp: 'NRP-01' }
        }
      ];

      const mockQuery: any = Promise.resolve({ data: mockCommitments, error: null });
      mockQuery.eq = vi.fn().mockReturnValue(mockQuery);
      const mockSelect = vi.fn().mockReturnValue(mockQuery);
      (supabase.from as any).mockReturnValue({ select: mockSelect });

      const commitments = await getMonthlyDepositCommitments(11, 2026);
      expect(commitments).toHaveLength(1);
      expect(commitments[0].status).toBe('Lunas');
      expect(commitments[0].anggota?.nama).toBe('Budi');
    });
  });
});
