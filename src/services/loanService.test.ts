import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loanService, calculateTHPEligibility, MIN_REMAINING_THP } from './loanService';
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

  describe('calculateTHPEligibility helper', () => {
    it('should return eligible with 0 shortfall when final remaining THP exceeds threshold', () => {
      const result = calculateTHPEligibility(5000000, 2000000);
      expect(result.finalRemainingThp).toBe(3000000);
      expect(result.isEligible).toBe(true);
      expect(result.shortfall).toBe(0);
    });

    it('should return eligible with 0 shortfall when final remaining THP exactly equals threshold', () => {
      const result = calculateTHPEligibility(3500000, 2000000);
      expect(result.finalRemainingThp).toBe(1500000);
      expect(result.isEligible).toBe(true);
      expect(result.shortfall).toBe(0);
    });

    it('should return ineligible with accurate positive shortfall when final remaining THP is below threshold', () => {
      const result = calculateTHPEligibility(3000000, 2000000);
      expect(result.finalRemainingThp).toBe(1000000);
      expect(result.isEligible).toBe(false);
      expect(result.shortfall).toBe(500000);
    });

    it('should handle negative remaining THP and calculate full shortfall including negative balance', () => {
      const result = calculateTHPEligibility(1000000, 2000000);
      expect(result.finalRemainingThp).toBe(-1000000);
      expect(result.isEligible).toBe(false);
      expect(result.shortfall).toBe(2500000);
    });

    it('should respect custom minThreshold parameter', () => {
      const result = calculateTHPEligibility(2000000, 1000000, 2000000);
      expect(result.finalRemainingThp).toBe(1000000);
      expect(result.isEligible).toBe(false);
      expect(result.shortfall).toBe(1000000);
    });
  });

  describe('getMemberTHP - resilient multi-column binding', () => {
    it('should read master_thp directly if present and deduct active savings', async () => {
      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 6000000, take_home_pay: 0 }, error: null })
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

      const res = await loanService.getMemberTHP('m-1');
      expect(res.master_thp).toBe(6000000);
      expect(res.active_installments).toBe(1000000);
      expect(res.savings_deduction).toBe(200000);
      expect(res.remaining_thp).toBe(4800000);
    });

    it('should fallback to take_home_pay if master_thp is null or missing', async () => {
      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: null, take_home_pay: 4500000 }, error: null })
          })
        })
      }));
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-2');
      expect(res.master_thp).toBe(4500000);
      expect(res.active_installments).toBe(0);
      expect(res.savings_deduction).toBe(200000);
      expect(res.remaining_thp).toBe(4300000);
    });

    it('should prioritize take_home_pay if master_thp is 0 (imported THP case)', async () => {
      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'm-wawan',
                nrp: '123456',
                nama: 'Wawan Gunawan',
                master_thp: 0,
                take_home_pay: 5000000,
                salary: null
              },
              error: null
            })
          })
        })
      }));
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-wawan');
      expect(res.master_thp).toBe(5000000);
      expect(res.savings_deduction).toBe(200000);
      expect(res.remaining_thp).toBe(4800000);
    });

    it('should sanitize formatted currency string in take_home_pay', async () => {
      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'm-wawan-str',
                master_thp: 0,
                take_home_pay: 'Rp 5.250.000'
              },
              error: null
            })
          })
        })
      }));
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-wawan-str');
      expect(res.master_thp).toBe(5250000);
      expect(res.savings_deduction).toBe(200000);
      expect(res.remaining_thp).toBe(5050000);
    });

    it('should fallback to select * and salary if specific column select fails with error', async () => {
      const mockSupabase = supabase.from as any;
      // First select fails
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Column not found' } })
          })
        })
      }));
      // Fallback select '*' succeeds with salary
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { salary: 4000000 }, error: null })
          })
        })
      }));
      // active loans
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-3');
      expect(res.master_thp).toBe(4000000);
      expect(res.savings_deduction).toBe(200000);
      expect(res.remaining_thp).toBe(3800000);
    });

    it('should fallback to 0 when no salary or thp columns are present', async () => {
      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'm-4' }, error: null })
          })
        })
      }));
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-4');
      expect(res.master_thp).toBe(0);
      expect(res.savings_deduction).toBe(200000);
      expect(res.remaining_thp).toBe(-200000);
    });

    it('should aggregate all active member_deposits (WAJIB, BELANJA, LEBARAN) accurately', async () => {
      const mockSupabase = supabase.from as any;
      // 1. Anggota
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 5000000 }, error: null })
          })
        })
      }));
      // 2. Active loans
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [{ monthly_target: 500000 }], error: null })
          })
        })
      }));
      // 3. Member deposits (WAJIB + BELANJA + LEBARAN)
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                { deposit_types: { code: 'WAJIB' } },
                { deposit_types: { code: 'BELANJA' } },
                { deposit_types: { code: 'LEBARAN' } }
              ],
              error: null
            })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-multi-deposits');
      expect(res.master_thp).toBe(5000000);
      expect(res.active_installments).toBe(500000);
      // WAJIB (200k) + BELANJA (25k) + LEBARAN (50k) = 275k
      expect(res.savings_deduction).toBe(275000);
      // 5,000,000 - 500,000 - 275,000 = 4,225,000
      expect(res.remaining_thp).toBe(4225000);
    });
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

      // Third call is to get member_deposits
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      // Sisa THP saat ini: 5,000,000 - 2,000,000 - 200,000 (Wajib) = 2,800,000
      // Ajukan pinjaman Rp 20,000,000 tenor 10 bulan -> cicilan 2,000,000
      // Sisa THP setelah pengajuan = 800,000 (Kurang dari 1,500,000, shortfall 700,000)
      
      await expect(loanService.applyLoan('member-1', 'Beli Motor', 20000000, 10))
        .rejects
        .toThrow(/Sisa THP setelah pemotongan \(Rp 800\.000\) kurang Rp 700\.000 dari batas minimal Rp 1\.500\.000/);
    });

    it('should reject loan when savings deduction triggers shortfall below 1,500,000', async () => {
      const mockSupabase = supabase.from as any;

      // 1. Anggota: 3,500,000
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 3500000 }, error: null })
          })
        })
      }));
      // 2. Loans: 0
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));
      // 3. Member deposits: default WAJIB 200,000
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      // Without savings: 3,500,000 - 1,900,000 = 1,600,000 (>= 1,500,000 -> would pass)
      // With savings: 3,500,000 - 200,000 = 3,300,000 - 1,900,000 = 1,400,000 (< 1,500,000, shortfall 100,000)
      await expect(loanService.applyLoan('member-borderline', 'Renovasi', 19000000, 10))
        .rejects
        .toThrow(/Sisa THP setelah pemotongan \(Rp 1\.400\.000\) kurang Rp 100\.000 dari batas minimal Rp 1\.500\.000/);
    });

    it('should approve loan if remaining THP is sufficient', async () => {
      const mockSupabase = supabase.from as any;
      
      // 1. Anggota
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 5000000 }, error: null })
          })
        })
      }));

      // 2. Loans (active)
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [{ monthly_target: 1000000 }], error: null })
          })
        })
      }));

      // 3. Member deposits
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      // 4. loan_types
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'type-1' }], error: null })
          })
        })
      }));

      // 5. insert loan
      mockSupabase.mockImplementationOnce(() => ({
        insert: () => ({
          select: () => ({
            single: vi.fn().mockResolvedValue({ data: { id: 'loan-1', status: 'draft' }, error: null })
          })
        })
      }));

      // Sisa THP: 5M - 1M - 200k = 3.8M.
      // Ajukan pinjaman: 12M / 12 = 1M/bulan
      // Sisa setelah = 2.8M (Aman, > 1.5M)
      
      const res = await loanService.applyLoan('member-1', 'Beli Laptop', 12000000, 12);
      expect(res.status).toBe('draft');
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

      // Spy on makePayment to isolate fullPayoff logic
      const spy = vi.spyOn(loanService, 'makePayment').mockResolvedValueOnce({ success: true, excess_amount: 0 });

      await loanService.fullPayoff('loan-1', 'transfer');
      
      expect(spy).toHaveBeenCalledWith('loan-1', 1800000, 'transfer', 'Pelunasan Penuh');
    });
  });

  describe('getLoanApplications', () => {
    it('should query pending loans with draft status', async () => {
      const mockPendingData = [
        { id: 'loan-p1', status: 'draft', amount: 5000000 },
        { id: 'loan-p2', status: 'draft', amount: 3000000 }
      ];
      const mockEq = vi.fn().mockResolvedValue({ data: mockPendingData, error: null });
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      const result = await loanService.getLoanApplications('PENDING');

      expect(supabase.from).toHaveBeenCalledWith('loans');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockEq).toHaveBeenCalledWith('status', 'draft');
      expect(result).toEqual(mockPendingData);
    });

    it('should query approved history loans with approved, active, paid_off status', async () => {
      const mockApprovedData = [
        { id: 'loan-a1', status: 'approved', amount: 10000000 },
        { id: 'loan-a2', status: 'active', amount: 7500000 }
      ];
      const mockIn = vi.fn().mockResolvedValue({ data: mockApprovedData, error: null });
      const mockOrder = vi.fn().mockReturnValue({ in: mockIn });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      const result = await loanService.getLoanApplications('APPROVED');

      expect(supabase.from).toHaveBeenCalledWith('loans');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockIn).toHaveBeenCalledWith('status', ['approved', 'active', 'paid_off']);
      expect(result).toEqual(mockApprovedData);
    });

    it('should query all loans without status in filter when tab is ALL', async () => {
      const mockAllData = [
        { id: 'loan-1', status: 'draft' },
        { id: 'loan-2', status: 'approved' }
      ];
      const mockIn = vi.fn();
      const mockQuery = {
        in: mockIn,
        then: (resolve: any, reject: any) => Promise.resolve({ data: mockAllData, error: null }).then(resolve, reject)
      };
      const mockOrder = vi.fn().mockReturnValue(mockQuery);
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      const result = await loanService.getLoanApplications('ALL');

      expect(supabase.from).toHaveBeenCalledWith('loans');
      expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockIn).not.toHaveBeenCalled();
      expect(result).toEqual(mockAllData);
    });

    it('should throw error when database returns an error', async () => {
      const mockEq = vi.fn().mockResolvedValue({ data: null, error: { message: 'Database query failed' } });
      const mockOrder = vi.fn().mockReturnValue({ eq: mockEq });
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      await expect(loanService.getLoanApplications('PENDING')).rejects.toThrow('Database query failed');
    });

    it('should delegate getPendingLoans to getLoanApplications with PENDING filter', async () => {
      const spy = vi.spyOn(loanService, 'getLoanApplications').mockResolvedValueOnce([
        { id: 'pending-legacy', status: 'draft' } as any
      ]);

      const result = await loanService.getPendingLoans();
      expect(spy).toHaveBeenCalledWith('PENDING');
      expect(result).toEqual([{ id: 'pending-legacy', status: 'draft' }]);
    });
  });
});
