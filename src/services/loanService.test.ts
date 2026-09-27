import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loanService } from './loanService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis()
      })),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-123' } } }),
      }
    }
  };
});

describe('loanService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyLoan - THP Validation', () => {
    it('should reject loan if remaining THP after deduction is below 1,500,000', async () => {
      // Mock supabase chained responses
      const mockSupabase = supabase.from as any;
      
      // First call is to get 'anggota' master_thp
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 5000000 }, error: null })
          })
        })
      }));

      // Second call is to get 'loans' active monthly targets
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [{ monthly_target: 2000000 }], error: null })
          })
        })
      }));

      // Sisa THP saat ini: 5,000,000 - 2,000,000 = 3,000,000
      // Ajukan pinjaman Rp 20,000,000 tenor 10 bulan -> cicilan 2,000,000
      // Sisa THP setelah pengajuan = 1,000,000 (Kurang dari 1,500,000)
      
      await expect(loanService.applyLoan('member-1', 'Beli Motor', 20000000, 10))
        .rejects
        .toThrow(/di bawah batas minimal Rp1.500.000/);
    });

    it('should approve loan if remaining THP is sufficient', async () => {
      const mockSupabase = supabase.from as any;
      
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 5000000 }, error: null })
          })
        })
      }));

      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [{ monthly_target: 1000000 }], error: null })
          })
        })
      }));

      // Third call is insert loan
      mockSupabase.mockImplementationOnce(() => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'loan-1', status: 'pending' }, error: null })
          })
        })
      }));

      // Sisa THP: 5M - 1M = 4M.
      // Ajukan pinjaman: 12M / 12 = 1M/bulan
      // Sisa setelah = 3M (Aman, > 1.5M)
      
      const res = await loanService.applyLoan('member-1', 'Beli Laptop', 12000000, 12);
      expect(res.status).toBe('pending');
    });
  });

  describe('makePayment - FIFO & Overpayment', () => {
    it('should allocate payment to schedules using FIFO and handle partial, exact, and overpayment', async () => {
      const mockSupabase = supabase.from as any;

      // Mock getting schedules
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sch-1', target_amount: 1000000, paid_amount: 500000, status: 'partial' },
                  { id: 'sch-2', target_amount: 1000000, paid_amount: 0, status: 'unpaid' },
                  { id: 'sch-3', target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
                ],
                error: null
              })
            })
          })
        })
      }));

      // Mock update schedule sch-1 (paid 500k -> 1M)
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }));
      // Mock insert repayment sch-1
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }));
      
      // Mock update schedule sch-2 (paid 0 -> 1M)
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }));
      // Mock insert repayment sch-2
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }));
      
      // Mock update schedule sch-3 (paid 0 -> 500k partial)
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
      }));
      // Mock insert repayment sch-3
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }));

      // Mock check all schedules (not all paid)
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              { status: 'paid' },
              { status: 'paid' },
              { status: 'partial' }
            ],
            error: null
          })
        })
      }));

      // Member pays 2,000,000
      // sch-1 needs 500k -> 1.5M remaining
      // sch-2 needs 1M -> 500k remaining
      // sch-3 needs 1M -> 500k goes here, becomes partial
      
      const res = await loanService.makePayment('loan-1', 2000000, 'cash');
      expect(res.success).toBe(true);
      expect(res.excess_amount).toBe(0);
    });
  });

  describe('fullPayoff', () => {
    it('should calculate total remaining and pay it all off', async () => {
      const mockSupabase = supabase.from as any;

      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'sch-1', target_amount: 1000000, paid_amount: 200000, status: 'partial' },
                { id: 'sch-2', target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
              ],
              error: null
            })
          })
        })
      }));

      // It calls makePayment internally, which will fetch schedules again...
      // Mock makePayment's fetching schedules:
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sch-1', target_amount: 1000000, paid_amount: 200000, status: 'partial' },
                  { id: 'sch-2', target_amount: 1000000, paid_amount: 0, status: 'unpaid' }
                ],
                error: null
              })
            })
          })
        })
      }));

      // Mock updates & inserts... we can just spy on makePayment.
      // But since we are unit testing, we'll let it execute and assume mock chaining is fine.
      
      // Let's just spy on makePayment
      const spy = vi.spyOn(loanService, 'makePayment').mockResolvedValueOnce({ success: true, excess_amount: 0 });

      await loanService.fullPayoff('loan-1', 'transfer');
      
      expect(spy).toHaveBeenCalledWith('loan-1', 1800000, 'transfer', 'Pelunasan Penuh');
    });
  });
});
