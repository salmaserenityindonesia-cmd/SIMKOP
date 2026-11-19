import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loanService,
  calculateTHPEligibility,
  MIN_REMAINING_THP,
  getActiveLoanTypes,
  computeRealRemainingPrincipal,
  calculateGoodsMarkupScheduleSplit,
  calculateRepaymentPortions
} from './loanService';
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
                { deposit_types: { code: 'WAJIB', default_amount: 200000 } },
                { deposit_types: { code: 'BELANJA', default_amount: 25000 } },
                { deposit_types: { code: 'LEBARAN', default_amount: 50000 } }
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

    it('should deduct angsuran_lain_lain when computing remaining_thp', async () => {
      const mockSupabase = supabase.from as any;
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { master_thp: 6000000, take_home_pay: 6000000, angsuran_lain_lain: 1000000 },
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
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            eq: vi.fn().mockResolvedValue({
              data: [
                { deposit_types: { code: 'WAJIB', default_amount: 200000 } },
                { deposit_types: { code: 'LEBARAN', default_amount: 260000 } }
              ],
              error: null
            })
          })
        })
      }));

      const res = await loanService.getMemberTHP('m-agus');
      expect(res.master_thp).toBe(6000000);
      expect(res.active_installments).toBe(0);
      expect(res.angsuran_lain_lain).toBe(1000000);
      expect(res.savings_deduction).toBe(460000);
      expect(res.remaining_thp).toBe(4540000);
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
      expect(mockSelect).toHaveBeenCalledWith('id, code, name, max_duration_months, is_active, financing_scheme, default_markup_percent');
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

  describe('approveLoan - Column Mapping, Schedule Generation & Audit Log', () => {
    it('should update loans with status active, disbursed_at, sisa_pinjaman, updated_at (no start_date), generate loan_schedules starting +1 month, and write audit_logs', async () => {
      const existingLoan = {
        id: 'loan-123',
        member_id: 'member-456',
        principal_amount: 1500000,
        amount: 1500000,
        tenor: 3,
        agreed_tenor_months: 3,
        monthly_target: 500000,
        planned_installment_amount: 500000,
        status: 'draft',
      };

      const updatedLoan = {
        ...existingLoan,
        status: 'active',
        disbursed_at: '2026-11-16',
        sisa_pinjaman: 1500000,
      };

      const mockFetchSingle = vi.fn().mockResolvedValue({ data: existingLoan, error: null });
      const mockFetchEq = vi.fn().mockReturnValue({ single: mockFetchSingle, maybeSingle: mockFetchSingle });
      const mockFetchSelect = vi.fn().mockReturnValue({ eq: mockFetchEq });

      const mockUpdateSingle = vi.fn().mockResolvedValue({ data: updatedLoan, error: null });
      const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
      const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      const mockSchedLimit = vi.fn().mockResolvedValue({ data: [], error: null });
      const mockSchedEq = vi.fn().mockReturnValue({ limit: mockSchedLimit });
      const mockSchedSelect = vi.fn().mockReturnValue({ eq: mockSchedEq });
      const mockSchedInsert = vi.fn().mockResolvedValue({ error: null });

      const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return { select: mockFetchSelect, update: mockUpdate };
        }
        if (table === 'loan_schedules') {
          return { select: mockSchedSelect, insert: mockSchedInsert };
        }
        if (table === 'audit_logs') {
          return { insert: mockAuditInsert };
        }
        return {};
      });

      const result = await loanService.approveLoan('loan-123', '2026-11-16');

      expect(supabase.rpc).not.toHaveBeenCalled();

      const updatePayload = mockUpdate.mock.calls[0][0];
      expect(updatePayload.status).toBe('active');
      expect(updatePayload.disbursed_at).toBe('2026-11-16');
      expect(updatePayload.sisa_pinjaman).toBe(1500000);
      expect(typeof updatePayload.updated_at).toBe('string');
      expect(updatePayload).not.toHaveProperty('start_date');

      expect(mockSchedInsert).toHaveBeenCalledTimes(1);
      const insertedSchedules = mockSchedInsert.mock.calls[0][0];
      expect(insertedSchedules).toHaveLength(3);
      expect(insertedSchedules[0]).toEqual({
        loan_id: 'loan-123',
        period_number: 1,
        due_date: '2026-12-16',
        target_amount: 500000,
        paid_amount: 0,
        status: 'unpaid',
      });
      expect(insertedSchedules[1].due_date).toBe('2027-01-16');
      expect(insertedSchedules[2].due_date).toBe('2027-02-16');

      expect(mockAuditInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          table_name: 'loans',
          action: 'APPROVE',
          record_id: 'loan-123',
          entity_name: 'loans',
          entity_id: 'loan-123',
        })
      );

      expect(result.id).toBe('loan-123');
      expect(result.status).toBe('active');
      expect(result.disbursed_at).toBe('2026-11-16');
    });

    it('should skip generating duplicate schedules if loan_schedules already exist for the loan', async () => {
      const existingLoan = {
        id: 'loan-existing-sched',
        principal_amount: 1000000,
        tenor: 2,
        monthly_target: 500000,
        status: 'draft',
      };

      const mockFetchSingle = vi.fn().mockResolvedValue({ data: existingLoan, error: null });
      const mockFetchEq = vi.fn().mockReturnValue({ maybeSingle: mockFetchSingle });
      const mockFetchSelect = vi.fn().mockReturnValue({ eq: mockFetchEq });

      const mockUpdateSingle = vi.fn().mockResolvedValue({
        data: { ...existingLoan, status: 'active', disbursed_at: '2026-11-16' },
        error: null,
      });
      const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
      const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      const mockSchedLimit = vi.fn().mockResolvedValue({ data: [{ id: 'sch-already-1' }], error: null });
      const mockSchedEq = vi.fn().mockReturnValue({ limit: mockSchedLimit });
      const mockSchedSelect = vi.fn().mockReturnValue({ eq: mockSchedEq });
      const mockSchedInsert = vi.fn().mockResolvedValue({ error: null });
      const mockAuditInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') return { select: mockFetchSelect, update: mockUpdate };
        if (table === 'loan_schedules') return { select: mockSchedSelect, insert: mockSchedInsert };
        if (table === 'audit_logs') return { insert: mockAuditInsert };
        return {};
      });

      const result = await loanService.approveLoan('loan-existing-sched', '2026-11-16');

      expect(result.status).toBe('active');
      expect(mockSchedInsert).not.toHaveBeenCalled();
    });

    it('should throw error when loans table update fails', async () => {
      const mockFetchSingle = vi.fn().mockResolvedValue({ data: { id: 'loan-err', amount: 1500000 }, error: null });
      const mockFetchEq = vi.fn().mockReturnValue({ maybeSingle: mockFetchSingle });
      const mockFetchSelect = vi.fn().mockReturnValue({ eq: mockFetchEq });

      const mockUpdateSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Update loans failed' },
      });
      const mockUpdateSelect = vi.fn().mockReturnValue({ single: mockUpdateSingle });
      const mockUpdateEq = vi.fn().mockReturnValue({ select: mockUpdateSelect });
      const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') return { select: mockFetchSelect, update: mockUpdate };
        return {};
      });

      await expect(loanService.approveLoan('loan-err', '2026-11-16')).rejects.toThrow('Update loans failed');
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

    it('should fallback to isolated client-side execution when RPC fails with 42804 loan_status enum error', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: {
          code: '42804',
          message: 'column "status" is of type loan_status but expression is of type text'
        }
      });

      const mockSupabase = supabase.from as any;
      const scheduleUpdates: any[] = [];
      const scheduleUpdatedIds: string[] = [];
      const repaymentInserts: any[] = [];
      let loanUpdatePayload: any = null;

      // 1. Fetch selected schedule
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'sch-2', target_amount: 125000, paid_amount: 0, status: 'unpaid' },
              error: null
            })
          })
        })
      }));

      // 2. Update ONLY selected schedule
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockImplementation((payload) => {
          scheduleUpdates.push(payload);
          return {
            eq: vi.fn().mockImplementation((_col, val) => {
              scheduleUpdatedIds.push(val);
              return Promise.resolve({ error: null });
            })
          };
        })
      }));

      // 3. Insert into loan_repayments
      mockSupabase.mockImplementationOnce(() => ({
        insert: vi.fn().mockImplementation((payload) => {
          repaymentInserts.push(payload);
          return Promise.resolve({ error: null });
        })
      }));

      // 4. Fetch all schedules for recalculating loan status & remaining balance
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: vi.fn().mockResolvedValue({
            data: [
              { id: 'sch-1', target_amount: 125000, paid_amount: 125000, status: 'paid' },
              { id: 'sch-2', target_amount: 125000, paid_amount: 125000, status: 'paid' },
              { id: 'sch-3', target_amount: 125000, paid_amount: 0, status: 'unpaid' }
            ],
            error: null
          })
        })
      }));

      // 5. Fetch parent loan
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: 'loan-dedi', amount: 1000000, principal_amount: 1000000, status: 'active', member_id: 'm-dedi' },
              error: null
            })
          })
        })
      }));

      // 6. Update parent loan
      mockSupabase.mockImplementationOnce(() => ({
        update: vi.fn().mockImplementation((payload) => {
          loanUpdatePayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        })
      }));

      const result = await loanService.paySchedule('loan-dedi', 'sch-2', 125000, 'CASH', 'Cicilan bulan ke-2');

      expect(result.success).toBe(true);
      expect(result.newStatus).toBe('paid');
      expect(result.newPaidTotal).toBe(125000);
      expect(result.isAllPaid).toBe(false);
      expect(scheduleUpdates).toEqual([{ paid_amount: 125000, status: 'paid' }]);
      expect(scheduleUpdatedIds).toEqual(['sch-2']);
      expect(repaymentInserts).toHaveLength(1);
      expect(repaymentInserts[0][0].schedule_id).toBe('sch-2');
      expect(loanUpdatePayload.status).toBe('active');
      expect(loanUpdatePayload.sisa_pinjaman).toBe(750000);
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

  describe('Top-Up Same-Type Loan Settlement', () => {
    it('applyLoan rejects top-up when plafon is <= remaining principal of old same-type loan', async () => {
      await expect(
        loanService.applyLoan('member-1', 'Top-Up', 500000, 4, 'lt-bon', 1500000, {
          refinancedLoanId: 'loan-old-1',
          topupSettlementAmount: 625000,
          replacedMonthlyInstallment: 250000,
        })
      ).rejects.toThrow(/harus lebih besar dari sisa pinjaman lama/);
    });

    it('approveLoan settles old same-type loan schedules, logs TOPUP_COMPENSATION, marks old loan paid_off, and records net cash_flow', async () => {
      const newLoan = {
        id: 'loan-new-1',
        loan_number: 'LOAN-NEW-001',
        member_id: 'member-1',
        loan_type_id: 'lt-bon',
        refinanced_loan_id: 'loan-old-1',
        topup_settlement_amount: 625000,
        principal_amount: 2000000,
        amount: 2000000,
        tenor: 4,
        agreed_tenor_months: 4,
        monthly_target: 500000,
        planned_installment_amount: 500000,
        status: 'draft',
      };

      const oldLoan = {
        id: 'loan-old-1',
        loan_number: 'LOAN-1794788414918',
        sisa_pinjaman: 625000,
        status: 'active',
      };

      const updatedLoans: any[] = [];
      const updatedSchedules: any[] = [];
      const insertedRepayments: any[] = [];
      const insertedCashFlows: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: () => ({
              eq: (col: string, val: any) => {
                if (col === 'id' && val === 'loan-new-1') {
                  return { maybeSingle: vi.fn().mockResolvedValue({ data: newLoan, error: null }) };
                }
                if (col === 'member_id') {
                  return {
                    eq: () => ({
                      in: () => ({
                        neq: vi.fn().mockResolvedValue({ data: [oldLoan], error: null }),
                      }),
                    }),
                  };
                }
                return { maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
              },
            }),
            update: (payload: any) => ({
              eq: (col: string, val: any) => {
                updatedLoans.push({ id: val, payload });
                if (val === 'loan-new-1') {
                  return {
                    select: () => ({
                      single: vi.fn().mockResolvedValue({
                        data: { ...newLoan, ...payload },
                        error: null,
                      }),
                    }),
                  };
                }
                return Promise.resolve({ data: null, error: null });
              },
            }),
          };
        }

        if (table === 'loan_schedules') {
          return {
            select: () => ({
              eq: (_col: string, val: any) => {
                if (val === 'loan-new-1') {
                  return { limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
                }
                return {
                  neq: vi.fn().mockResolvedValue({
                    data: [{ id: 'sch-old-1', target_amount: 625000, paid_amount: 0, status: 'unpaid' }],
                    error: null,
                  }),
                };
              },
            }),
            insert: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: (payload: any) => ({
              eq: (_col: string, val: any) => {
                updatedSchedules.push({ id: val, payload });
                return Promise.resolve({ data: null, error: null });
              },
            }),
          };
        }

        if (table === 'loan_repayments') {
          return {
            insert: (payload: any) => {
              insertedRepayments.push(payload);
              return Promise.resolve({ data: payload, error: null });
            },
          };
        }

        if (table === 'cash_flow') {
          return {
            insert: (payload: any) => {
              insertedCashFlows.push(...payload);
              return Promise.resolve({ data: payload, error: null });
            },
          };
        }

        if (table === 'audit_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }

        return {};
      });

      const res = await loanService.approveLoan('loan-new-1', '2026-11-16');

      expect(res.status).toBe('active');
      expect(updatedSchedules).toEqual([
        { id: 'sch-old-1', payload: { paid_amount: 625000, status: 'paid' } },
      ]);
      expect(insertedRepayments).toHaveLength(1);
      expect(insertedRepayments[0].loan_id).toBe('loan-old-1');
      expect(insertedRepayments[0].amount_paid).toBe(625000);
      expect(insertedRepayments[0].payment_method).toBe('TOPUP_COMPENSATION');
      expect(updatedLoans.some((u) => u.id === 'loan-old-1' && u.payload.status === 'paid_off' && u.payload.sisa_pinjaman === 0)).toBe(true);
      expect(insertedCashFlows).toHaveLength(1);
      expect(insertedCashFlows[0].direction).toBe('out');
      expect(insertedCashFlows[0].amount).toBe(1375000);
    });

    it('recalculates topup settlement from loan_schedules (principal - SUM(paid_amount)) instead of stale sisa_pinjaman', async () => {
      // 1. Unit check for computeRealRemainingPrincipal
      expect(
        computeRealRemainingPrincipal({
          principal_amount: 1500000,
          sisa_pinjaman: 1500000,
          loan_schedules: [
            { paid_amount: 125000, status: 'paid' },
            { paid_amount: 125000, status: 'paid' },
            { paid_amount: 125000, status: 'paid' },
            { paid_amount: 0, status: 'unpaid' },
          ],
        })
      ).toBe(1125000);

      // 2. Integration check for getLoanApplications('PENDING') & approveLoan
      const pendingTopupLoan = {
        id: 'loan-fajar-new',
        loan_number: 'LOAN-NEW-FAJAR',
        member_id: 'mem-fajar',
        loan_type_id: 'type-bayar-sendiri',
        refinanced_loan_id: 'loan-fajar-old',
        topup_settlement_amount: 1500000, // nilai basi saat pengajuan
        principal_amount: 2000000,
        amount: 2000000,
        agreed_tenor_months: 12,
        tenor: 12,
        monthly_target: 166667,
        planned_installment_amount: 166667,
        status: 'draft',
      };

      const oldFajarLoan = {
        id: 'loan-fajar-old',
        loan_number: 'LOAN-1794768578628',
        member_id: 'mem-fajar',
        loan_type_id: 'type-bayar-sendiri',
        principal_amount: 1500000,
        amount: 1500000,
        sisa_pinjaman: 1500000, // kolom basi tidak sinkron dengan loan_schedules
        status: 'active',
        loan_schedules: [
          { id: 's1', target_amount: 125000, paid_amount: 125000, status: 'paid' },
          { id: 's2', target_amount: 125000, paid_amount: 125000, status: 'paid' },
          { id: 's3', target_amount: 125000, paid_amount: 125000, status: 'paid' },
          { id: 's4', target_amount: 125000, paid_amount: 0, status: 'unpaid' },
        ],
      };

      const updatedLoans: any[] = [];
      const insertedRepayments: any[] = [];
      const insertedCashFlows: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: (cols: string) => {
              // getLoanApplications query
              if (cols.includes('anggota:member_id')) {
                return {
                  order: () => ({
                    eq: () => Promise.resolve({ data: [{ ...pendingTopupLoan }], error: null }),
                  }),
                };
              }
              // enrichPendingTopupSettlements batch active loans query
              if (cols.includes('loan_schedules') && !cols.includes('loan_number')) {
                return {
                  in: () => ({
                    in: () => Promise.resolve({ data: [oldFajarLoan], error: null }),
                  }),
                };
              }
              return {
                eq: (col: string, val: any) => {
                  if (col === 'id' && val === 'loan-fajar-new') {
                    return {
                      single: () => Promise.resolve({ data: { ...pendingTopupLoan }, error: null }),
                      maybeSingle: () => Promise.resolve({ data: { ...pendingTopupLoan }, error: null }),
                    };
                  }
                  if (col === 'id' && val === 'loan-fajar-old') {
                    return {
                      maybeSingle: () => Promise.resolve({ data: oldFajarLoan, error: null }),
                    };
                  }
                  if (col === 'member_id') {
                    return {
                      eq: () => ({
                        in: () => ({
                          neq: () => Promise.resolve({ data: [oldFajarLoan], error: null }),
                        }),
                      }),
                    };
                  }
                  return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
                },
              };
            },
            update: (payload: any) => ({
              eq: (_col: string, val: any) => {
                updatedLoans.push({ id: val, payload });
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: { ...pendingTopupLoan, ...payload }, error: null }),
                  }),
                  then: (cb: any) => Promise.resolve({ data: null, error: null }).then(cb),
                };
              },
            }),
          };
        }

        if (table === 'loan_schedules') {
          return {
            select: () => ({
              eq: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
                neq: () => Promise.resolve({
                  data: [{ id: 's4', target_amount: 125000, paid_amount: 0, status: 'unpaid' }],
                  error: null,
                }),
              }),
            }),
            insert: vi.fn().mockResolvedValue({ data: [], error: null }),
            update: () => ({
              eq: () => Promise.resolve({ data: null, error: null }),
            }),
          };
        }

        if (table === 'loan_repayments') {
          return {
            insert: (payload: any) => {
              insertedRepayments.push(payload);
              return Promise.resolve({ data: payload, error: null });
            },
          };
        }

        if (table === 'cash_flow') {
          return {
            insert: (payload: any) => {
              insertedCashFlows.push(...payload);
              return Promise.resolve({ data: payload, error: null });
            },
          };
        }

        if (table === 'audit_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }

        return {};
      });

      const pendingList = await loanService.getLoanApplications('PENDING');
      expect(pendingList).toHaveLength(1);
      expect(pendingList[0].topup_settlement_amount).toBe(1125000);

      const approved = await loanService.approveLoan('loan-fajar-new', '2026-11-16');
      expect(approved.topup_settlement_amount).toBe(1125000);
      expect(insertedRepayments).toHaveLength(1);
      expect(insertedRepayments[0].amount_paid).toBe(1125000);
      expect(
        updatedLoans.some(
          (u) => u.id === 'loan-fajar-new' && u.payload.topup_settlement_amount === 1125000
        )
      ).toBe(true);
      expect(
        updatedLoans.some(
          (u) => u.id === 'loan-fajar-old' && u.payload.status === 'paid_off' && u.payload.sisa_pinjaman === 0
        )
      ).toBe(true);
      expect(insertedCashFlows).toHaveLength(1);
      expect(insertedCashFlows[0].amount).toBe(875000);
    });
  });

  describe('Goods Markup Financing (Murabahah) - Zero Interest Cash vs Goods Markup', () => {
    it('calculateGoodsMarkupScheduleSplit splits cost price and margin accurately across even and odd tenors', () => {
      const evenSplit = calculateGoodsMarkupScheduleSplit(2000000, 300000, 5);
      expect(evenSplit).toHaveLength(5);
      expect(evenSplit[0]).toEqual({
        period_number: 1,
        principal_portion: 400000,
        margin_portion: 60000,
        target_amount: 460000,
      });
      const sumCostEven = evenSplit.reduce((s, r) => s + r.principal_portion, 0);
      const sumMarginEven = evenSplit.reduce((s, r) => s + r.margin_portion, 0);
      expect(sumCostEven).toBe(2000000);
      expect(sumMarginEven).toBe(300000);

      const oddSplit = calculateGoodsMarkupScheduleSplit(1000000, 100000, 3);
      expect(oddSplit).toHaveLength(3);
      expect(oddSplit.reduce((s, r) => s + r.principal_portion, 0)).toBe(1000000);
      expect(oddSplit.reduce((s, r) => s + r.margin_portion, 0)).toBe(100000);
      expect(oddSplit.reduce((s, r) => s + r.target_amount, 0)).toBe(1100000);

      const cashPortions = calculateRepaymentPortions({
        amountPaid: 500000,
        targetAmount: 500000,
        scheduleMarginPortion: 0,
      });
      expect(cashPortions).toEqual({ principalPortion: 500000, marginPortion: 0 });
    });

    it('createLoanApplication validates goods inputs, computes Harga Jual Kredit (cost + margin), and checks THP', async () => {
      await expect(
        loanService.createLoanApplication({
          memberId: 'm-1',
          purpose: 'Kredit Kulkas',
          amount: 2300000,
          tenor: 5,
          loanTypeId: 'lt-barang',
          financingScheme: 'GOODS_MARKUP',
          itemDescription: '   ',
          costPrice: 2000000,
          markupAmount: 300000,
        })
      ).rejects.toThrow(/Nama \/ spesifikasi barang wajib diisi/);

      await expect(
        loanService.createLoanApplication({
          memberId: 'm-1',
          purpose: 'Kredit Kulkas',
          amount: 2300000,
          tenor: 5,
          loanTypeId: 'lt-barang',
          financingScheme: 'GOODS_MARKUP',
          itemDescription: 'Kulkas 2 Pintu',
          costPrice: 0,
          markupAmount: 300000,
        })
      ).rejects.toThrow(/Harga beli \/ modal supplier harus lebih besar dari Rp 0/);

      const mockSupabase = supabase.from as any;
      // 1. Anggota
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({ data: { master_thp: 5000000 }, error: null }),
          }),
        }),
      }));
      // 2. Active loans
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }));
      // 3. Member deposits
      mockSupabase.mockImplementationOnce(() => ({
        select: () => ({
          eq: () => ({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }));
      // 4. Insert loan
      let insertedPayload: any = null;
      mockSupabase.mockImplementationOnce(() => ({
        insert: (payload: any[]) => {
          insertedPayload = payload[0];
          return {
            select: () => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'loan-barang-1', ...payload[0] },
                error: null,
              }),
            }),
          };
        },
      }));

      const res = await loanService.createLoanApplication({
        memberId: 'm-1',
        purpose: '',
        amount: 2300000,
        tenor: 5,
        loanTypeId: 'lt-barang',
        financingScheme: 'GOODS_MARKUP',
        itemDescription: 'Kulkas 2 Pintu',
        costPrice: 2000000,
        markupAmount: 300000,
      });

      expect(res.id).toBe('loan-barang-1');
      expect(insertedPayload.item_description).toBe('Kulkas 2 Pintu');
      expect(insertedPayload.cost_price).toBe(2000000);
      expect(insertedPayload.markup_amount).toBe(300000);
      expect(insertedPayload.principal_amount).toBe(2300000);
      expect(insertedPayload.amount).toBe(2300000);
      expect(insertedPayload.monthly_target).toBe(460000);
      expect(insertedPayload.notes).toBe('Pembiayaan Barang: Kulkas 2 Pintu');
    });

    it('approveLoan for GOODS_MARKUP splits schedules into principal & margin portions and records cash_flow out for cost_price only', async () => {
      const goodsLoan = {
        id: 'loan-barang-2',
        loan_number: 'LOAN-BRG-002',
        member_id: 'mem-budi',
        loan_type_id: 'lt-barang',
        item_description: 'Kulkas 2 Pintu',
        cost_price: 2000000,
        markup_amount: 300000,
        principal_amount: 2300000,
        amount: 2300000,
        tenor: 5,
        agreed_tenor_months: 5,
        monthly_target: 460000,
        planned_installment_amount: 460000,
        status: 'draft',
        loan_types: { id: 'lt-barang', code: 'PEMBIAYAAN_BARANG', name: 'Pembiayaan Barang', financing_scheme: 'GOODS_MARKUP' },
        anggota: { nrp: '88010001', nama: 'Budi Santoso' },
      };

      let insertedSchedules: any[] = [];
      let insertedCashFlows: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: goodsLoan, error: null }),
              }),
            }),
            update: (payload: any) => ({
              eq: () => ({
                select: () => ({
                  single: vi.fn().mockResolvedValue({ data: { ...goodsLoan, ...payload }, error: null }),
                }),
              }),
            }),
          };
        }
        if (table === 'loan_schedules') {
          return {
            select: () => ({
              eq: () => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedSchedules = rows;
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedCashFlows.push(...rows);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'audit_logs') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      });

      const approved = await loanService.approveLoanApplication('loan-barang-2', '2026-11-19');
      expect(approved.status).toBe('active');
      expect(insertedSchedules).toHaveLength(5);
      expect(insertedSchedules[0]).toMatchObject({
        loan_id: 'loan-barang-2',
        period_number: 1,
        target_amount: 460000,
        principal_portion: 400000,
        margin_portion: 60000,
        status: 'unpaid',
      });
      expect(insertedCashFlows).toHaveLength(1);
      expect(insertedCashFlows[0]).toMatchObject({
        direction: 'out',
        amount: 2000000,
        category: 'pembiayaan_barang',
        reference_id: 'loan-barang-2',
        description:
          'Pembiayaan Barang (Kulkas 2 Pintu) — 88010001 - Budi Santoso | Modal Supplier: Rp 2.000.000 (Harga Jual Akad: Rp 2.300.000)',
      });
    });

    it('recordLoanRepayment splits principal_portion (400k) and margin_portion (60k) and inserts cash_flow in (460k)', async () => {
      (supabase.rpc as any).mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' },
      });

      const insertedRepayments: any[] = [];
      const insertedCashFlows: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loan_schedules') {
          return {
            select: () => ({
              eq: (col: string) => {
                if (col === 'id') {
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'sch-brg-1',
                        period_number: 1,
                        target_amount: 460000,
                        paid_amount: 0,
                        status: 'unpaid',
                        principal_portion: 400000,
                        margin_portion: 60000,
                      },
                      error: null,
                    }),
                  };
                }
                return Promise.resolve({
                  data: [
                    { id: 'sch-brg-1', target_amount: 460000, paid_amount: 460000, status: 'paid' },
                    { id: 'sch-brg-2', target_amount: 460000, paid_amount: 0, status: 'unpaid' },
                  ],
                  error: null,
                });
              },
            }),
            update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'loan_repayments') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedRepayments.push(...rows);
              return Promise.resolve({ error: null });
            }),
          };
        }
        if (table === 'loans') {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'loan-barang-2',
                    loan_number: 'LOAN-BRG-002',
                    amount: 2300000,
                    principal_amount: 2300000,
                    cost_price: 2000000,
                    markup_amount: 300000,
                    item_description: 'Kulkas 2 Pintu',
                    status: 'active',
                    member_id: 'mem-budi',
                    anggota: { nrp: '88010001', nama: 'Budi Santoso' },
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((rows: any[]) => {
              insertedCashFlows.push(...rows);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      });

      const res = await loanService.recordLoanRepayment({
        loanId: 'loan-barang-2',
        scheduleId: 'sch-brg-1',
        amountPaid: 460000,
        paymentMethod: 'POTONG_GAJI',
      });

      expect(res.success).toBe(true);
      expect(insertedRepayments).toHaveLength(1);
      expect(insertedRepayments[0]).toMatchObject({
        loan_id: 'loan-barang-2',
        schedule_id: 'sch-brg-1',
        amount_paid: 460000,
        principal_portion: 400000,
        margin_portion: 60000,
      });
      expect(insertedCashFlows).toHaveLength(1);
      expect(insertedCashFlows[0]).toMatchObject({
        direction: 'in',
        amount: 460000,
        category: 'angsuran_pinjaman',
        reference_id: 'loan-barang-2',
      });
      expect(insertedCashFlows[0].description).toContain('Pokok: Rp 400.000');
      expect(insertedCashFlows[0].description).toContain('Margin: Rp 60.000');
    });
  });
});
