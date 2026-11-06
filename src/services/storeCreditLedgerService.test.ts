import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStoreCreditSummary,
  getStoreCreditLedger,
  settleStoreCredit,
  getMemberActiveDebt,
  getMembersWithDebt,
  sanitizeNumber
} from './storeCreditLedgerService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('storeCreditLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeNumber', () => {
    it('mengubah string atau number menjadi format number yang benar', () => {
      expect(sanitizeNumber('50000')).toBe(50000);
      expect(sanitizeNumber(25000)).toBe(25000);
      expect(sanitizeNumber(undefined, 0)).toBe(0);
      expect(sanitizeNumber('invalid', 10)).toBe(10);
    });
  });

  describe('getStoreCreditSummary', () => {
    it('menghitung total tagihan belanja bon, pelunasan, sisa utang, dan jumlah anggota berutang', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [
                  { id: 'sale-1', member_id: 'm-1', paid_credit: 150000, sale_status: 'completed' },
                  { id: 'sale-2', member_id: 'm-2', paid_credit: 250000, sale_status: 'completed' },
                  { id: 'sale-3', member_id: 'm-1', paid_credit: 50000, sale_status: 'completed' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'pay-1', member_id: 'm-1', amount: 100000 },
                { id: 'pay-2', member_id: 'm-2', amount: 250000 } // m-2 lunas
              ],
              error: null
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const summary = await getStoreCreditSummary();

      expect(summary.totalCreditSales).toBe(450000); // 150k + 250k + 50k
      expect(summary.totalPaid).toBe(350000);        // 100k + 250k
      expect(summary.outstandingDebt).toBe(100000);   // 450k - 350k
      expect(summary.activeDebtorCount).toBe(1);      // m-1 masih utang 100k, m-2 lunas (0)
      expect(summary.totalTransactions).toBe(5);      // 3 sales + 2 payments
    });
  });

  describe('getStoreCreditLedger', () => {
    it('menghitung saldo utang berjalan (running debt) secara kronologis untuk setiap transaksi anggota', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'sale-101',
                    sale_number: 'INV-20261101-01',
                    member_id: 'm-1',
                    cashier_id: 'p-1',
                    paid_credit: 100000,
                    total_amount: 100000,
                    payment_scheme: 'store_credit',
                    sale_status: 'completed',
                    created_at: '2026-11-01T08:00:00Z'
                  },
                  {
                    id: 'sale-102',
                    sale_number: 'INV-20261103-01',
                    member_id: 'm-1',
                    cashier_id: 'p-1',
                    paid_credit: 50000,
                    total_amount: 50000,
                    payment_scheme: 'store_credit',
                    sale_status: 'completed',
                    created_at: '2026-11-03T10:00:00Z'
                  }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'pay-201',
                  sale_id: 'sale-101',
                  member_id: 'm-1',
                  amount: 70000,
                  payment_method: 'potong_gaji',
                  payment_date: '2026-11-02T09:00:00Z',
                  reference_no: 'BYR-001',
                  notes: 'Cicilan gaji Nov',
                  received_by: 'p-1',
                  created_at: '2026-11-02T09:00:00Z'
                }
              ],
              error: null
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-1', nama: 'Serma Agus', nrp: '778899', pangkat: 'Serma' }],
                error: null
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'p-1', nama: 'Kasir Toko Maya' }],
              error: null
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const ledger = await getStoreCreditLedger();

      expect(ledger.items).toHaveLength(3);

      // Item 1: Belanja Bon 100.000 pada 1 Nov
      expect(ledger.items[0].reference_no).toBe('INV-20261101-01');
      expect(ledger.items[0].debit).toBe(100000);
      expect(ledger.items[0].credit).toBe(0);
      expect(ledger.items[0].running_debt).toBe(100000);
      expect(ledger.items[0].source_type).toBe('sale');

      // Item 2: Pembayaran Cicilan 70.000 pada 2 Nov
      expect(ledger.items[1].reference_no).toBe('BYR-001');
      expect(ledger.items[1].debit).toBe(0);
      expect(ledger.items[1].credit).toBe(70000);
      expect(ledger.items[1].running_debt).toBe(30000); // 100k - 70k = 30k
      expect(ledger.items[1].source_type).toBe('payment');

      // Item 3: Belanja Bon Tambahan 50.000 pada 3 Nov
      expect(ledger.items[2].reference_no).toBe('INV-20261103-01');
      expect(ledger.items[2].debit).toBe(50000);
      expect(ledger.items[2].credit).toBe(0);
      expect(ledger.items[2].running_debt).toBe(80000); // 30k + 50k = 80k
      expect(ledger.items[2].source_type).toBe('sale');
    });

    it('mendukung filter status PAID dan UNPAID', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [
                  { id: 's-1', paid_credit: 100000, sale_number: 'INV-1', member_id: 'm-1', created_at: '2026-11-01' },
                  { id: 's-2', paid_credit: 50000, sale_number: 'INV-2', member_id: 'm-2', created_at: '2026-11-02' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'p-1', sale_id: 's-1', amount: 100000, member_id: 'm-1', created_at: '2026-11-03' } // s-1 lunas
              ],
              error: null
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })
          };
        }
        if (table === 'pengelola') {
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const resUnpaid = await getStoreCreditLedger({ statusFilter: 'UNPAID' });
      expect(resUnpaid.items).toHaveLength(1);
      expect(resUnpaid.items[0].reference_no).toBe('INV-2');
    });
  });

  describe('settleStoreCredit', () => {
    it('menyimpan pembayaran cicilan ke store_credit_payments dan mencatat cash_flow untuk pembayaran tunai', async () => {
      const mockInsertPayment = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-pay-uuid' }, error: null })
        })
      });
      const mockInsertCashFlow = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return { insert: mockInsertPayment };
        }
        if (table === 'cash_flow') {
          return { insert: mockInsertCashFlow };
        }
        return {};
      });

      const res = await settleStoreCredit({
        memberId: 'm-1',
        amount: 50000,
        paymentMethod: 'tunai',
        referenceNo: 'KWITANSI-01',
        notes: 'Bayar lunas kasir'
      });

      expect(res.success).toBe(true);
      expect(res.paymentId).toBe('new-pay-uuid');

      expect(mockInsertPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          member_id: 'm-1',
          amount: 50000,
          payment_method: 'tunai',
          reference_no: 'KWITANSI-01'
        })
      );

      expect(mockInsertCashFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'in',
          amount: 50000,
          category: 'pelunasan_bon_toko',
          reference_id: 'new-pay-uuid'
        })
      );
    });

    it('gagal jika nominal pembayaran nol atau negatif', async () => {
      const res = await settleStoreCredit({
        memberId: 'm-1',
        amount: 0,
        paymentMethod: 'potong_gaji'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('lebih dari Rp 0');
    });
  });

  describe('getMemberActiveDebt', () => {
    it('mengembalikan sisa utang bon anggota dengan tepat', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockResolvedValue({
                  data: [
                    { paid_credit: 120000, sale_status: 'completed' },
                    { paid_credit: 80000, sale_status: 'completed' }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ amount: 75000 }],
                error: null
              })
            })
          };
        }
        return {};
      });

      const debt = await getMemberActiveDebt('member-123');
      expect(debt).toBe(125000); // 200.000 total sales - 75.000 total paid
    });
  });

  describe('getMembersWithDebt', () => {
    it('mengembalikan daftar anggota yang masih memiliki sisa utang > 0', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [
                  { member_id: 'm-1', paid_credit: 100000, sale_status: 'completed' },
                  { member_id: 'm-2', paid_credit: 50000, sale_status: 'completed' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { member_id: 'm-2', amount: 50000 } // m-2 lunas
              ],
              error: null
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [{ id: 'm-1', nama: 'Sertu Budi', nrp: '12345' }],
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const debtors = await getMembersWithDebt();
      expect(debtors).toHaveLength(1);
      expect(debtors[0].id).toBe('m-1');
      expect(debtors[0].debt).toBe(100000);
    });
  });
});

