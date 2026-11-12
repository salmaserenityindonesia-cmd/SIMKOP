import { describe, it, expect, vi, beforeEach } from 'vitest';
import { settlementService } from './settlementService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
    auth: {
      getSession: vi.fn()
    }
  }
}));

describe('settlementService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createChainMock(data: any, error: any = null) {
    const obj: any = {};
    const p = Promise.resolve({ data, error });
    obj.select = vi.fn(() => obj);
    obj.eq = vi.fn(() => obj);
    obj.in = vi.fn(() => obj);
    obj.update = vi.fn(() => obj);
    obj.insert = vi.fn(() => p);
    obj.single = vi.fn(() => p);
    obj.then = (onRes: any, onRej: any) => p.then(onRes, onRej);
    return obj;
  }

  describe('getSettlementByMember - Pencegahan Double Negation & Normalisasi Nilai', () => {
    it('menormalkan remaining_balance negatif dari database (Asep Saputra: -6.666.680 & simpanan 15.960.000 -> surplus 9.293.320)', async () => {
      // Mock RPC deposit settlement
      (supabase.rpc as any).mockImplementation((fnName: string) => {
        if (fnName === 'get_member_deposit_settlement') {
          return Promise.resolve({
            data: [
              { deposit_name: 'Simpanan Pokok', can_be_withdrawn: false, total_amount: 1000000 },
              { deposit_name: 'Simpanan Wajib', can_be_withdrawn: false, total_amount: 14960000 }
            ],
            error: null
          });
        }
        if (fnName === 'get_member_loan_settlement') {
          return Promise.resolve({
            data: [
              {
                loan_id: 'loan-asep-1',
                loan_number: 'PJ-2026-001',
                purpose: 'Pinjaman Renovasi',
                principal_amount: 10000000,
                tenor: 12,
                total_paid: 3333320,
                // Simulasi anomali/bug database yang mengembalikan sisa bertanda minus
                remaining_balance: -6666680
              }
            ],
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const result = await settlementService.getSettlementByMember('member-asep-uuid');

      // Total Hak: 1.000.000 + 14.960.000 = 15.960.000
      expect(result.total_hak).toBe(15960000);

      // Total Kewajiban harus bernilai positif absolut 6.666.680 (BUKAN -6.666.680)
      expect(result.total_kewajiban).toBe(6666680);

      // Detail pinjaman juga harus dinormalisasi menjadi positif absolut
      expect(result.loan_details[0].remaining_balance).toBe(6666680);
      expect(result.loan_details[0].principal_amount).toBe(10000000);
      expect(result.loan_details[0].total_paid).toBe(3333320);

      // Net Settlement: 15.960.000 - 6.666.680 = 9.293.320 (Surplus Kas Keluar ke Anggota)
      // Mencegah double negation yang sebelumnya menghasilkan 22.626.680
      expect(result.net_settlement).toBe(9293320);
    });

    it('menghitung defisit dengan benar saat total kewajiban lebih besar dari total simpanan', async () => {
      (supabase.rpc as any).mockImplementation((fnName: string) => {
        if (fnName === 'get_member_deposit_settlement') {
          return Promise.resolve({
            data: [
              { deposit_name: 'Simpanan Sukarela', can_be_withdrawn: true, total_amount: 5000000 }
            ],
            error: null
          });
        }
        if (fnName === 'get_member_loan_settlement') {
          return Promise.resolve({
            data: [
              {
                loan_id: 'loan-deficit-1',
                loan_number: 'PJ-2026-DEF',
                purpose: 'Pinjaman Usaha',
                principal_amount: 20000000,
                tenor: 24,
                total_paid: 8000000,
                remaining_balance: 12000000
              }
            ],
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const result = await settlementService.getSettlementByMember('member-deficit-uuid');

      expect(result.total_hak).toBe(5000000);
      expect(result.total_kewajiban).toBe(12000000);
      // Net settlement defisit: 5.000.000 - 12.000.000 = -7.000.000
      expect(result.net_settlement).toBe(-7000000);
    });

    it('menangani pinjaman paralel aktif dengan banyak baris dan memastikan semua sisa dinormalisasi positif', async () => {
      (supabase.rpc as any).mockImplementation((fnName: string) => {
        if (fnName === 'get_member_deposit_settlement') {
          return Promise.resolve({
            data: [{ deposit_name: 'Simpanan Pokok', can_be_withdrawn: false, total_amount: 2000000 }],
            error: null
          });
        }
        if (fnName === 'get_member_loan_settlement') {
          return Promise.resolve({
            data: [
              {
                loan_id: 'loan-p1',
                loan_number: 'PJ-01',
                purpose: 'Pinjaman 1',
                principal_amount: 5000000,
                tenor: 10,
                total_paid: 2000000,
                remaining_balance: -3000000 // bernilai negatif
              },
              {
                loan_id: 'loan-p2',
                loan_number: 'PJ-02',
                purpose: 'Pinjaman 2',
                principal_amount: 4000000,
                tenor: 10,
                total_paid: 3000000,
                remaining_balance: 1000000 // bernilai positif
              }
            ],
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const result = await settlementService.getSettlementByMember('member-multi');

      expect(result.total_kewajiban).toBe(4000000); // 3.000.000 + 1.000.000
      expect(result.net_settlement).toBe(-2000000); // 2.000.000 - 4.000.000
    });
  });

  describe('Fallback Manual Methods', () => {
    it('menggunakan _getManualLoanSettlement saat RPC get_member_loan_settlement belum ada (error 42883)', async () => {
      (supabase.rpc as any).mockImplementation((fnName: string) => {
        if (fnName === 'get_member_deposit_settlement') {
          return Promise.resolve({
            data: [{ deposit_name: 'Simpanan Pokok', can_be_withdrawn: false, total_amount: 1000000 }],
            error: null
          });
        }
        if (fnName === 'get_member_loan_settlement') {
          return Promise.resolve({
            data: null,
            error: { code: '42883', message: 'function get_member_loan_settlement does not exist' }
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Mock from('loans')
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return createChainMock([
            {
              id: 'manual-loan-1',
              loan_number: 'PJ-MAN-01',
              notes: 'Pinjaman Manual',
              amount: 10000000,
              tenor: 12,
              loan_repayments: [
                { amount_paid: 2000000 },
                { amount_paid: 3000000 }
              ]
            }
          ]);
        }
        return createChainMock([]);
      });

      const result = await settlementService.getSettlementByMember('member-manual');

      expect(result.loan_details).toHaveLength(1);
      expect(result.loan_details[0].principal_amount).toBe(10000000);
      expect(result.loan_details[0].total_paid).toBe(5000000);
      expect(result.loan_details[0].remaining_balance).toBe(5000000);
      expect(result.total_kewajiban).toBe(5000000);
      expect(result.net_settlement).toBe(-4000000); // 1.000.000 - 5.000.000
    });

    it('memastikan overpayment pada _getManualLoanSettlement tidak menghasilkan remaining_balance negatif', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          return createChainMock([
            {
              id: 'overpaid-loan',
              loan_number: 'PJ-OVER',
              notes: 'Pinjaman Kelebihan Bayar',
              amount: 5000000,
              tenor: 5,
              loan_repayments: [
                { amount_paid: 3000000 },
                { amount_paid: 3000000 } // Total 6.000.000 > 5.000.000
              ]
            }
          ]);
        }
        return createChainMock([]);
      });

      const loans = await settlementService._getManualLoanSettlement('member-overpaid');

      expect(loans[0].total_paid).toBe(6000000);
      // Math.max(0, 5.000.000 - 6.000.000) = 0 (BUKAN -1.000.000)
      expect(loans[0].remaining_balance).toBe(0);
    });

    it('menggunakan _getManualDepositSettlement saat RPC get_member_deposit_settlement belum ada (error 42883)', async () => {
      (supabase.rpc as any).mockImplementation((fnName: string) => {
        if (fnName === 'get_member_deposit_settlement') {
          return Promise.resolve({
            data: null,
            error: { code: '42883', message: 'function get_member_deposit_settlement does not exist' }
          });
        }
        if (fnName === 'get_member_loan_settlement') {
          return Promise.resolve({
            data: [],
            error: null
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      // Mock from('member_deposits')
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'member_deposits') {
          return createChainMock([
            {
              id: 'md-1',
              deposit_types: { name: 'Simpanan Sukarela', can_be_withdrawn: true },
              deposit_transactions: [
                { amount: 500000 },
                { amount: 250000 }
              ]
            }
          ]);
        }
        return createChainMock([]);
      });

      const result = await settlementService.getSettlementByMember('member-dep-manual');

      expect(result.deposit_details).toHaveLength(1);
      expect(result.deposit_details[0].total_amount).toBe(750000);
      expect(result.total_hak).toBe(750000);
      expect(result.net_settlement).toBe(750000);
    });
  });

  describe('processInstantPayoff & processDebtorTransition', () => {
    it('memanggil RPC process_instant_payoff_clearance dengan parameter yang benar', async () => {
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: { user: { id: 'admin-user-123' } } }
      });
      (supabase.rpc as any).mockResolvedValue({
        data: true,
        error: null
      });

      const res = await settlementService.processInstantPayoff('member-1', 'Transfer Bank', 'Pelunasan transfer');

      expect(supabase.rpc).toHaveBeenCalledWith('process_instant_payoff_clearance', {
        p_member_id: 'member-1',
        p_payment_method: 'Transfer Bank',
        p_notes: 'Pelunasan transfer',
        p_processed_by: 'admin-user-123'
      });
      expect(res).toBe(true);
    });

    it('melempar error jika RPC process_instant_payoff_clearance gagal', async () => {
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: null }
      });
      (supabase.rpc as any).mockResolvedValue({
        data: null,
        error: { message: 'Defisit belum dilunasi' }
      });

      await expect(
        settlementService.processInstantPayoff('member-1', 'Tunai', 'Notes')
      ).rejects.toThrow('Gagal memproses kliring pelunasan seketika: Defisit belum dilunasi');
    });

    it('memanggil RPC process_debtor_transition_clearance dengan parameter yang benar', async () => {
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: { user: { id: 'admin-user-456' } } }
      });
      (supabase.rpc as any).mockResolvedValue({
        data: true,
        error: null
      });

      const res = await settlementService.processDebtorTransition('member-2', 'Transisi cicilan sisa');

      expect(supabase.rpc).toHaveBeenCalledWith('process_debtor_transition_clearance', {
        p_member_id: 'member-2',
        p_notes: 'Transisi cicilan sisa',
        p_processed_by: 'admin-user-456'
      });
      expect(res).toBe(true);
    });
  });

  describe('settleRemainingLoanSchedules & Pelunasan Otomatis Kliring', () => {
    it('melunaskan seluruh jadwal angsuran unpaid/partial, mencatat loan_repayments dengan metode POTONG_SIMPANAN_KLIRING, dan menyetel status pinjaman = completed', async () => {
      const updatedSchedules: any[] = [];
      const insertedRepayments: any[] = [];
      const updatedLoans: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          const chain = createChainMock([
            { id: 'loan-1', amount: 1000000, status: 'active' }
          ]);
          chain.update = vi.fn((payload: any) => {
            updatedLoans.push(payload);
            return chain;
          });
          return chain;
        }

        if (table === 'loan_schedules') {
          const chain = createChainMock([
            { id: 'sched-1', loan_id: 'loan-1', period_number: 1, target_amount: 500000, paid_amount: 200000, status: 'partial' },
            { id: 'sched-2', loan_id: 'loan-1', period_number: 2, target_amount: 500000, paid_amount: 0, status: 'unpaid' }
          ]);
          chain.update = vi.fn((payload: any) => {
            updatedSchedules.push(payload);
            return chain;
          });
          return chain;
        }

        if (table === 'loan_repayments') {
          const chain = createChainMock(null);
          chain.insert = vi.fn((payload: any) => {
            insertedRepayments.push(payload);
            return Promise.resolve({ data: payload, error: null });
          });
          return chain;
        }

        return createChainMock([]);
      });

      await settlementService.settleRemainingLoanSchedules('member-test-1');

      // Verifikasi jadwal angsuran diupdate menjadi lunas (paid) dengan paid_amount penuh
      expect(updatedSchedules).toHaveLength(2);
      expect(updatedSchedules[0]).toEqual({
        paid_amount: 500000,
        status: 'paid'
      });
      expect(updatedSchedules[1]).toEqual({
        paid_amount: 500000,
        status: 'paid'
      });

      // Verifikasi pencatatan pembayaran kliring di loan_repayments
      expect(insertedRepayments).toHaveLength(2);
      // Sched-1: 500.000 - 200.000 = 300.000
      expect(insertedRepayments[0].amount_paid).toBe(300000);
      expect(insertedRepayments[0].schedule_id).toBe('sched-1');
      expect(insertedRepayments[0].payment_method).toBe('POTONG_SIMPANAN_KLIRING');
      expect(insertedRepayments[0].notes).toContain('Pelunasan otomatis melalui kliring anggota keluar');

      // Sched-2: 500.000 - 0 = 500.000
      expect(insertedRepayments[1].amount_paid).toBe(500000);
      expect(insertedRepayments[1].schedule_id).toBe('sched-2');
      expect(insertedRepayments[1].payment_method).toBe('POTONG_SIMPANAN_KLIRING');

      // Verifikasi status pinjaman di tabel loans menjadi completed dan sisa_pinjaman = 0
      expect(updatedLoans).toHaveLength(1);
      expect(updatedLoans[0]).toEqual({
        status: 'completed',
        sisa_pinjaman: 0
      });
    });

    it('processInstantPayoff otomatis memanggil RPC dan menyinkronkan penuntasan sisa jadwal pinjaman', async () => {
      (supabase.auth.getSession as any).mockResolvedValue({
        data: { session: { user: { id: 'admin-123' } } }
      });
      (supabase.rpc as any).mockResolvedValue({
        data: true,
        error: null
      });

      const updatedSchedules: any[] = [];
      const insertedRepayments: any[] = [];
      const updatedLoans: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          const chain = createChainMock([
            { id: 'loan-instant-1', amount: 3000000, status: 'active' }
          ]);
          chain.update = vi.fn((payload: any) => {
            updatedLoans.push(payload);
            return chain;
          });
          return chain;
        }

        if (table === 'loan_schedules') {
          const chain = createChainMock([
            { id: 'sched-instant-1', loan_id: 'loan-instant-1', period_number: 1, target_amount: 1500000, paid_amount: 500000, status: 'partial' }
          ]);
          chain.update = vi.fn((payload: any) => {
            updatedSchedules.push(payload);
            return chain;
          });
          return chain;
        }

        if (table === 'loan_repayments') {
          const chain = createChainMock(null);
          chain.insert = vi.fn((payload: any) => {
            insertedRepayments.push(payload);
            return Promise.resolve({ data: payload, error: null });
          });
          return chain;
        }

        return createChainMock([]);
      });

      const result = await settlementService.processInstantPayoff(
        'member-instant-id',
        'POTONG_SIMPANAN_KLIRING',
        'Pelunasan kliring surplus anggota keluar'
      );

      expect(result).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith('process_instant_payoff_clearance', {
        p_member_id: 'member-instant-id',
        p_payment_method: 'POTONG_SIMPANAN_KLIRING',
        p_notes: 'Pelunasan kliring surplus anggota keluar',
        p_processed_by: 'admin-123'
      });

      // Verifikasi jadwal angsuran dilunaskan
      expect(updatedSchedules).toHaveLength(1);
      expect(updatedSchedules[0].status).toBe('paid');
      expect(updatedSchedules[0].paid_amount).toBe(1500000);

      // Verifikasi mutasi pembayaran dicatat
      expect(insertedRepayments).toHaveLength(1);
      expect(insertedRepayments[0].amount_paid).toBe(1000000); // 1.500.000 - 500.000
      expect(insertedRepayments[0].payment_method).toBe('POTONG_SIMPANAN_KLIRING');

      // Verifikasi pinjaman induk disetel completed dan sisa_pinjaman = 0
      expect(updatedLoans).toHaveLength(1);
      expect(updatedLoans[0]).toEqual({
        status: 'completed',
        sisa_pinjaman: 0
      });
    });

    it('tidak mencatat mutasi berulang di loan_repayments jika sisa tagihan angsuran bernilai 0', async () => {
      const insertedRepayments: any[] = [];
      const updatedLoans: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'loans') {
          const chain = createChainMock([
            { id: 'loan-zero-1', amount: 500000, status: 'active' }
          ]);
          chain.update = vi.fn((payload: any) => {
            updatedLoans.push(payload);
            return chain;
          });
          return chain;
        }

        if (table === 'loan_schedules') {
          // Jadwal sudah terbayar penuh tetapi masih flag partial/unpaid (misal anomali)
          const chain = createChainMock([
            { id: 'sched-zero-1', loan_id: 'loan-zero-1', period_number: 1, target_amount: 500000, paid_amount: 500000, status: 'partial' }
          ]);
          return chain;
        }

        if (table === 'loan_repayments') {
          const chain = createChainMock(null);
          chain.insert = vi.fn((payload: any) => {
            insertedRepayments.push(payload);
            return Promise.resolve({ data: payload, error: null });
          });
          return chain;
        }

        return createChainMock([]);
      });

      await settlementService.settleRemainingLoanSchedules('member-zero-id');

      // Sisa 0 tidak menghasilkan entri baru di loan_repayments
      expect(insertedRepayments).toHaveLength(0);
      // Tetapi status pinjaman tetap disetel completed & sisa_pinjaman = 0
      expect(updatedLoans).toHaveLength(1);
      expect(updatedLoans[0]).toEqual({
        status: 'completed',
        sisa_pinjaman: 0
      });
    });
  });
});
