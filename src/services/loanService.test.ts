import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loanService, calculateTHPEligibility, MIN_REMAINING_THP, getActiveLoanTypes } from './loanService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      rpc: vi.fn(),
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

    it('should apply loan with explicit loanTypeId and bind it to loan record without fetching fallback type', async () => {
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
            in: vi.fn().mockResolvedValue({ data: [], error: null })
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

      // 4. insert loan directly (no fallback loan_types query!)
      let insertedLoanPayload: any = null;
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockImplementation((payload) => {
          insertedLoanPayload = payload;
          return {
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'loan-custom', status: 'draft', loan_type_id: 'lt-darurat-99' },
                error: null
              })
            })
          };
        })
      }));

      const res = await loanService.applyLoan('member-1', 'Beli Kebutuhan Darurat', 6000000, 6, 'lt-darurat-99');
      expect(res.status).toBe('draft');
      expect(insertedLoanPayload).toHaveLength(1);
      expect(insertedLoanPayload[0].loan_type_id).toBe('lt-darurat-99');
      expect(insertedLoanPayload[0].principal_amount).toBe(6000000);
      expect(insertedLoanPayload[0].agreed_tenor_months).toBe(6);
      expect(insertedLoanPayload[0].notes).toBe('Beli Kebutuhan Darurat');
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

    it('should delegate to paySchedule when scheduleId is passed to makePayment', async () => {
      const spy = vi.spyOn(loanService, 'paySchedule').mockResolvedValueOnce({
        success: true,
        newStatus: 'paid',
        newPaidTotal: 555556,
        sisaPinjaman: 2222222,
        isAllPaid: false
      });

      const res = await loanService.makePayment('loan-1', 6222, 'CASH', 'Pelunasan parsial', 'sch-14');
      expect(spy).toHaveBeenCalledWith('loan-1', 'sch-14', 6222, 'CASH', 'Pelunasan parsial');
      expect(res.success).toBe(true);
    });
  });

  describe('paySchedule - Isolated Single Schedule Repayment', () => {
    it('should strictly isolate repayment to the selected schedule ID and NOT affect subsequent schedules', async () => {
      const mockSupabase = supabase.from as any;

      const scheduleUpdates: any[] = [];
      const repaymentInserts: any[] = [];
      let loanUpdatePayload: any = null;

      // Mock sequence for paySchedule:
      // 1. Ambil data baris loan_schedules yang sedang aktif berdasarkan id = scheduleId
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'sch-14',
                target_amount: 555556,
                paid_amount: 555334,
                status: 'partial'
              },
              error: null
            })
          })
        })
      }));

      // 2. Update ONLY sch-14
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockImplementation((payload) => {
          scheduleUpdates.push(payload);
          return {
            eq: vi.fn().mockImplementation((col, val) => {
              expect(col).toBe('id');
              expect(val).toBe('sch-14');
              return Promise.resolve({ error: null });
            })
          };
        })
      }));

      // 3. Insert into loan_repayments with schedule_id = sch-14
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockImplementation((payload) => {
          repaymentInserts.push(payload);
          return Promise.resolve({ error: null });
        })
      }));

      // 4. Query allSchedules for recalculating balance
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'sch-1', target_amount: 555556, paid_amount: 555556, status: 'paid' },
              { id: 'sch-14', target_amount: 555556, paid_amount: 555334, status: 'partial' },
              { id: 'sch-15', target_amount: 555556, paid_amount: 0, status: 'unpaid' },
              { id: 'sch-16', target_amount: 555556, paid_amount: 0, status: 'unpaid' }
            ],
            error: null
          })
        })
      }));

      // 5. Query loan parent info
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'loan-asep',
                amount: 10000000,
                principal_amount: 10000000,
                status: 'active',
                member_id: 'm-asep'
              },
              error: null
            })
          })
        })
      }));

      // 6. Update loan status and sisa_pinjaman
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockImplementation((payload) => {
          loanUpdatePayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        })
      }));

      // Eksekusi pembayaran sisa tagihan baris ke-14 sebesar Rp 222
      const result = await loanService.paySchedule(
        'loan-asep',
        'sch-14',
        222,
        'CASH',
        'Pelunasan parsial jadwal periode terkait'
      );

      // Verifikasi baris ke-14 terisolasi:
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('paid');
      expect(result.newPaidTotal).toBe(555556);

      // Pastikan HANYA 1 update jadwal yang dijalankan (sch-14)
      expect(scheduleUpdates).toHaveLength(1);
      expect(scheduleUpdates[0]).toEqual({
        paid_amount: 555556,
        status: 'paid'
      });

      // Pastikan mutasi repayment mencatat schedule_id = sch-14
      expect(repaymentInserts).toHaveLength(1);
      expect(repaymentInserts[0]).toEqual([{
        loan_id: 'loan-asep',
        schedule_id: 'sch-14',
        amount_paid: 222,
        payment_method: 'CASH',
        notes: 'Pelunasan parsial jadwal periode terkait'
      }]);

      // Pastikan pinjaman induk di-update ke 'active' (karena sch-15, sch-16 belum lunas)
      expect(loanUpdatePayload.status).toBe('active');
      // Sisa pinjaman = 10.000.000 - (555.556 + 555.556) = 8.888.888
      expect(result.sisaPinjaman).toBe(10000000 - (555556 + 555556));
    });

    it('should set loan status to paid_off when the last unpaid schedule is paid', async () => {
      const mockSupabase = supabase.from as any;

      let loanUpdatePayload: any = null;

      // 1. Single schedule
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sch-final', target_amount: 500000, paid_amount: 400000, status: 'partial' },
              error: null
            })
          })
        })
      }));

      // 2. Update single schedule
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      }));

      // 3. Insert repayment
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }));

      // 4. All schedules (all are paid now)
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'sch-1', target_amount: 500000, paid_amount: 500000, status: 'paid' },
              { id: 'sch-final', target_amount: 500000, paid_amount: 400000, status: 'partial' }
            ],
            error: null
          })
        })
      }));

      // 5. Loan data
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'loan-1', amount: 1000000, principal_amount: 1000000, status: 'active', member_id: 'm-1' },
              error: null
            })
          })
        })
      }));

      // 6. Update loan
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockImplementation((payload) => {
          loanUpdatePayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        })
      }));

      // 7. Check other loans for resignation auto-detect
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null })
          })
        })
      }));

      // 8. Anggota check
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { membership_status: 'ACTIVE' }, error: null })
          })
        })
      }));

      const res = await loanService.paySchedule('loan-1', 'sch-final', 100000, 'CASH');
      expect(res.isAllPaid).toBe(true);
      expect(loanUpdatePayload.status).toBe('paid_off');
      expect(loanUpdatePayload.sisa_pinjaman).toBe(0);
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

  describe('getActiveLoanTypes', () => {
    it('should query active loan types ordered by code ascending', async () => {
      const mockTypes = [
        { id: 'lt-1', code: 'DARURAT', name: 'Pinjaman Darurat', max_duration_months: 6, is_active: true },
        { id: 'lt-2', code: 'REGULER', name: 'Pinjaman Reguler', max_duration_months: 12, is_active: true }
      ];
      const mockOrder = vi.fn().mockResolvedValue({ data: mockTypes, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      const result = await loanService.getActiveLoanTypes();

      expect(supabase.from).toHaveBeenCalledWith('loan_types');
      expect(mockSelect).toHaveBeenCalledWith('id, code, name, max_duration_months, is_active');
      expect(mockEq).toHaveBeenCalledWith('is_active', true);
      expect(mockOrder).toHaveBeenCalledWith('code', { ascending: true });
      expect(result).toEqual(mockTypes);
    });

    it('should query via standalone getActiveLoanTypes exported function identically', async () => {
      const mockTypes = [
        { id: 'lt-1', code: 'DARURAT', name: 'Pinjaman Darurat', max_duration_months: 6, is_active: true }
      ];
      const mockOrder = vi.fn().mockResolvedValue({ data: mockTypes, error: null });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      const result = await getActiveLoanTypes();
      expect(result).toEqual(mockTypes);
    });

    it('should throw error when database query fails', async () => {
      const mockOrder = vi.fn().mockResolvedValue({ data: null, error: { message: 'Database query failed' } });
      const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
      (supabase.from as any).mockImplementationOnce(() => ({ select: mockSelect }));

      await expect(loanService.getActiveLoanTypes()).rejects.toThrow('Database query failed');
    });
  });

  describe('approveLoan - Atomic RPC & Fallback', () => {
    it('should call approve_loan_atomic RPC and return structured loan data when RPC succeeds', async () => {
      const mockRpcResponse = {
        success: true,
        id: 'loan-123',
        member_id: 'member-456',
        status: 'approved',
        disbursed_at: '2026-11-01',
        amount: 5000000,
        tenor: 10,
        monthly_target: 500000,
        schedules_count: 10
      };

      (supabase.rpc as any).mockResolvedValueOnce({ data: mockRpcResponse, error: null });

      const result = await loanService.approveLoan('loan-123', '2026-11-01');

      expect(supabase.rpc).toHaveBeenCalledWith('approve_loan_atomic', {
        p_loan_id: 'loan-123',
        p_start_date: '2026-11-01'
      });
      expect(result.id).toBe('loan-123');
      expect(result.member_id).toBe('member-456');
      expect(result.status).toBe('approved');
      expect(result.amount).toBe(5000000);
      expect(result.monthly_target).toBe(500000);
    });

    it('should throw error when approve_loan_atomic RPC returns a business validation error', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Pinjaman tidak dapat disetujui karena berstatus active' }
      });

      await expect(loanService.approveLoan('loan-123', '2026-11-01'))
        .rejects.toThrow('Pinjaman tidak dapat disetujui karena berstatus active');
    });

    it('should fall back to sequential table mutations when approve_loan_atomic RPC does not exist (PGRST202)', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function approve_loan_atomic' }
      });

      const mockLoan = {
        id: 'loan-fallback',
        tenor: 2,
        monthly_target: 1000000,
        status: 'approved',
        disbursed_at: '2026-11-01'
      };

      const mockSingle = vi.fn().mockResolvedValue({ data: mockLoan, error: null });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
      const mockInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') return { update: mockUpdate };
        if (table === 'loan_schedules') return { insert: mockInsert };
        return {};
      });

      const result = await loanService.approveLoan('loan-fallback', '2026-11-01');

      expect(result.id).toBe('loan-fallback');
      expect(mockInsert).toHaveBeenCalled();
    });
  });

  describe('paySchedule - Atomic RPC', () => {
    it('should call record_loan_repayment_atomic RPC and return structured repayment result when RPC succeeds', async () => {
      const mockRpcResponse = {
        success: true,
        newStatus: 'paid',
        newPaidTotal: 500000,
        sisaPinjaman: 1500000,
        isAllPaid: false,
        repayment_id: 'repay-1',
        receipt_number: 'KW-PINJ/loan-1/B1/20261111-ABC'
      };

      (supabase.rpc as any).mockResolvedValueOnce({ data: mockRpcResponse, error: null });

      const result = await loanService.paySchedule(
        'loan-1',
        'sch-1',
        500000,
        'TRANSFER',
        'Cicilan bulan 1',
        'KW-PINJ/loan-1/B1/20261111-ABC'
      );

      expect(supabase.rpc).toHaveBeenCalledWith('record_loan_repayment_atomic', {
        p_loan_id: 'loan-1',
        p_amount_paid: 500000,
        p_payment_method: 'TRANSFER',
        p_schedule_id: 'sch-1',
        p_notes: 'Cicilan bulan 1',
        p_receipt_number: 'KW-PINJ/loan-1/B1/20261111-ABC'
      });
      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('paid');
      expect(result.newPaidTotal).toBe(500000);
      expect(result.sisaPinjaman).toBe(1500000);
      expect(result.isAllPaid).toBe(false);
      expect(result.receiptNumber).toBe('KW-PINJ/loan-1/B1/20261111-ABC');
    });

    it('should throw error when record_loan_repayment_atomic RPC returns business error', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Jadwal angsuran tidak ditemukan untuk pinjaman ini' }
      });

      await expect(loanService.paySchedule('loan-1', 'sch-invalid', 100000))
        .rejects.toThrow('Jadwal angsuran tidak ditemukan untuk pinjaman ini');
    });
  });

  describe('makePayment - Atomic RPC', () => {
    it('should call record_loan_repayment_atomic RPC with p_schedule_id null for FIFO allocation when RPC succeeds', async () => {
      const mockRpcResponse = {
        success: true,
        excess_amount: 50000,
        sisaPinjaman: 0,
        isAllPaid: true
      };

      (supabase.rpc as any).mockResolvedValueOnce({ data: mockRpcResponse, error: null });

      const result = await loanService.makePayment('loan-1', 1050000, 'CASH', 'Pelunasan FIFO');

      expect(supabase.rpc).toHaveBeenCalledWith('record_loan_repayment_atomic', {
        p_loan_id: 'loan-1',
        p_amount_paid: 1050000,
        p_payment_method: 'CASH',
        p_schedule_id: null,
        p_notes: 'Pelunasan FIFO',
        p_receipt_number: null
      });
      expect(result.success).toBe(true);
      expect(result.excess_amount).toBe(50000);
      expect(result.sisaPinjaman).toBe(0);
      expect(result.isAllPaid).toBe(true);
    });

    it('should throw error when record_loan_repayment_atomic returns error for makePayment', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { message: 'Jumlah pembayaran harus lebih besar dari 0' }
      });

      await expect(loanService.makePayment('loan-1', 0, 'CASH'))
        .rejects.toThrow('Jumlah pembayaran harus lebih besar dari 0');
    });
  });
});
