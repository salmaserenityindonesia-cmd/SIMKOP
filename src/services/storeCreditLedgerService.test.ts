import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getStoreCreditSummary,
  getStoreCreditLedger,
  settleStoreCredit,
  getMemberActiveDebt,
  getMembersWithDebt,
  sanitizeNumber,
  getMemberUnpaidStoreCreditSummary,
  createOrTakeoverStoreCreditPlan,
  getActiveStoreCreditPlans,
  payStoreCreditSchedule,
  syncUnrecordedStoreCreditPaymentsToCashFlow,
  syncStoreCreditPaymentsToCashFlow,
  getOutstandingStoreCreditSummary,
  formatStoreCreditCashFlowDescription
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
                data: [{ id: 'm-1', nama: 'Serma Agus', nrp: '778899', tanggal_lahir: '1984-04-12' }],
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
    it('menyimpan pembayaran cicilan ke store_credit_payments dengan skema valid (tanpa member_id) dan mencatat cash_flow untuk tunai', async () => {
      const mockInsertPayment = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'new-pay-uuid' }, error: null })
        })
      });
      const mockInsertCashFlow = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return {
            insert: mockInsertPayment,
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'sale-1', paid_credit: 50000, sale_status: 'completed', created_at: '2026-11-01' }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return { insert: mockInsertCashFlow };
        }
        return {};
      });

      const res = await settleStoreCredit({
        memberId: 'm-1',
        saleId: 'sale-1',
        amount: 50000,
        paymentMethod: 'tunai',
        referenceNo: 'KWITANSI-01',
        notes: 'Bayar lunas kasir'
      });

      expect(res.success).toBe(true);
      expect(res.paymentId).toBe('new-pay-uuid');

      const insertArg = mockInsertPayment.mock.calls[0][0];
      expect(insertArg).toEqual(
        expect.objectContaining({
          sale_id: 'sale-1',
          amount: 50000,
          receipt_number: 'KWITANSI-01',
          notes: expect.stringContaining('Bayar lunas kasir')
        })
      );
      // Memastikan kolom member_id TIDAK disertakan dalam payload
      expect(insertArg).not.toHaveProperty('member_id');
      expect(insertArg).toHaveProperty('payment_date');
      expect(insertArg).toHaveProperty('created_at');

      expect(mockInsertCashFlow).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'in',
          amount: 50000,
          category: 'PELUNASAN_BON_TOKO',
          reference_id: 'new-pay-uuid',
          description: expect.stringContaining('KWITANSI-01')
        })
      );
    });

    it('mendukung pelunasan global per anggota dengan alokasi FIFO ke nota sales tertua', async () => {
      const insertedRows: any[] = [];
      const mockInsertPayment = vi.fn().mockImplementation((payload) => {
        insertedRows.push(payload);
        return {
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: `pay-${insertedRows.length}` }, error: null })
          })
        };
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      { id: 'sale-oldest', paid_credit: 20000, sale_status: 'completed', created_at: '2026-11-01' },
                      { id: 'sale-newest', paid_credit: 50000, sale_status: 'completed', created_at: '2026-11-03' }
                    ],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            }),
            insert: mockInsertPayment
          };
        }
        return {};
      });

      // Bayar Rp 35.000 global (harus alokasikan 20k ke oldest, 15k ke newest)
      const res = await settleStoreCredit({
        memberId: 'm-1',
        amount: 35000,
        paymentMethod: 'potong_gaji',
        referenceNo: 'BYR-GLOBAL'
      });

      expect(res.success).toBe(true);
      expect(insertedRows).toHaveLength(2);

      // Baris 1: sale-oldest (20.000)
      expect(insertedRows[0].sale_id).toBe('sale-oldest');
      expect(insertedRows[0].amount).toBe(20000);
      expect(insertedRows[0]).not.toHaveProperty('member_id');

      // Baris 2: sale-newest (15.000)
      expect(insertedRows[1].sale_id).toBe('sale-newest');
      expect(insertedRows[1].amount).toBe(15000);
      expect(insertedRows[1]).not.toHaveProperty('member_id');
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
                    { id: 'sale-1', paid_credit: 120000, sale_status: 'completed' },
                    { id: 'sale-2', paid_credit: 80000, sale_status: 'completed' }
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
              in: vi.fn().mockResolvedValue({
                data: [{ sale_id: 'sale-1', amount: 75000 }],
                error: null
              }),
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
                  { id: 'sale-m1', member_id: 'm-1', paid_credit: 100000, sale_status: 'completed' },
                  { id: 'sale-m2', member_id: 'm-2', paid_credit: 50000, sale_status: 'completed' }
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
                { sale_id: 'sale-m2', member_id: 'm-2', amount: 50000 } // m-2 lunas
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

  describe('getMemberUnpaidStoreCreditSummary', () => {
    it('mengambil sisa saldo dari activePlan dan jadwal jika rencana aktif ada', async () => {
      const activePlanMock = {
        id: 'plan-1',
        member_id: 'm-1',
        total_consolidated_debt: 600000,
        tenor_months: 3,
        monthly_installment: 200000,
        status: 'active',
        created_at: '2026-11-01T00:00:00Z'
      };

      const schedulesMock = [
        { id: 'sch-1', plan_id: 'plan-1', period_number: 1, target_amount: 200000, paid_amount: 200000, status: 'paid' },
        { id: 'sch-2', plan_id: 'plan-1', period_number: 2, target_amount: 200000, paid_amount: 50000, status: 'partial' },
        { id: 'sch-3', plan_id: 'plan-1', period_number: 3, target_amount: 200000, paid_amount: 0, status: 'unpaid' }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [activePlanMock],
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        if (table === 'store_credit_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: schedulesMock,
                  error: null
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockResolvedValue({
                  data: [],
                  error: null
                })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const summary = await getMemberUnpaidStoreCreditSummary('m-1');

      // sch-1: 0 remaining, sch-2: 150.000 remaining, sch-3: 200.000 remaining -> total 350.000
      expect(summary.unpaidBalance).toBe(350000);
      expect(summary.activePlan).toBeDefined();
      expect(summary.activePlan?.id).toBe('plan-1');
      expect(summary.existingTenor).toBe(3);
      expect(summary.existingMonthlyInstallment).toBe(200000);
      expect(summary.activePlan?.schedules).toHaveLength(3);
    });

    it('mengambil sisa saldo dari ledgerDebt historis jika tidak ada activePlan', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [],
                      error: null
                    })
                  })
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockResolvedValue({
                  data: [{ id: 'sale-hist-1', paid_credit: 175000, sale_status: 'completed' }],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ amount: 25000, sale_id: 'sale-hist-1' }],
                error: null
              }),
              eq: vi.fn().mockResolvedValue({
                data: [{ amount: 25000 }],
                error: null
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const summary = await getMemberUnpaidStoreCreditSummary('m-no-plan');

      expect(summary.unpaidBalance).toBe(150000); // 175k - 25k
      expect(summary.activePlan).toBeNull();
      expect(summary.existingTenor).toBe(1);
      expect(summary.existingMonthlyInstallment).toBe(150000);
    });
  });

  describe('createOrTakeoverStoreCreditPlan', () => {
    it('mengubah rencana aktif lama menjadi superseded dan menyusun jadwal dengan presisi pembulatan', async () => {
      let updatedPlanPayload: any = null;
      let insertedPlanPayload: any = null;
      let insertedSchedulesPayload: any[] = [];
      const tablesAccessed: string[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        tablesAccessed.push(table);
        if (table === 'store_credit_installment_plans') {
          return {
            update: vi.fn().mockImplementation((payload: any) => {
              updatedPlanPayload = payload;
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: null, error: null })
                })
              };
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              insertedPlanPayload = payload;
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'plan-new-99', ...payload },
                    error: null
                  })
                })
              };
            })
          };
        }
        if (table === 'store_credit_schedules') {
          return {
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedSchedulesPayload = payload;
              return {
                select: vi.fn().mockResolvedValue({
                  data: payload.map((p, idx) => ({ id: `sch-new-${idx + 1}`, ...p })),
                  error: null
                })
              };
            })
          };
        }
        return {};
      });

      // previousUnpaidBalance: 50.000, newCreditAmount: 50.000 -> total: 100.000, tenor: 3 bulan
      // monthlyInstallment = Math.round(100.000 / 3) = 33.333
      // period 1: 33.333, period 2: 33.333, period 3: 100.000 - (33.333 * 2) = 33.334
      const result = await createOrTakeoverStoreCreditPlan({
        memberId: 'm-dedi',
        saleId: 'sale-999',
        previousUnpaidBalance: 50000,
        newCreditAmount: 50000,
        tenorMonths: 3,
        userId: 'admin-1',
        baseDate: '2026-11-15'
      });

      expect(result.success).toBe(true);
      expect(result.planId).toBe('plan-new-99');

      // Verifikasi rencana lama diubah jadi superseded
      expect(updatedPlanPayload.status).toBe('superseded');

      // Verifikasi rencana baru
      expect(insertedPlanPayload.member_id).toBe('m-dedi');
      expect(insertedPlanPayload.previous_unpaid_balance).toBe(50000);
      expect(insertedPlanPayload.new_credit_amount).toBe(50000);
      expect(insertedPlanPayload.total_consolidated_debt).toBe(100000);
      expect(insertedPlanPayload.tenor_months).toBe(3);
      expect(insertedPlanPayload.monthly_installment).toBe(33333);
      expect(insertedPlanPayload.status).toBe('active');

      // Verifikasi jadwal angsuran
      expect(insertedSchedulesPayload).toHaveLength(3);
      expect(insertedSchedulesPayload[0].target_amount).toBe(33333);
      expect(insertedSchedulesPayload[1].target_amount).toBe(33333);
      expect(insertedSchedulesPayload[2].target_amount).toBe(33334); // Pembulatan periode terakhir!

      // Total target_amount harus tepat sama dengan total_consolidated_debt
      const totalScheduleTarget = insertedSchedulesPayload.reduce((sum, s) => sum + s.target_amount, 0);
      expect(totalScheduleTarget).toBe(100000);

      // Verifikasi jatuh tempo bulan berikutnya (+1, +2, +3)
      expect(insertedSchedulesPayload[0].due_date).toBe('2026-12-15');
      expect(insertedSchedulesPayload[1].due_date).toBe('2027-01-15');
      expect(insertedSchedulesPayload[2].due_date).toBe('2027-02-15');

      // Verifikasi isolasi: tabel loans dan loan_schedules tidak boleh disentuh
      expect(tablesAccessed).not.toContain('loans');
      expect(tablesAccessed).not.toContain('loan_schedules');
    });
  });

  describe('getActiveStoreCreditPlans', () => {
    it('mengambil rencana aktif beserta relasi profil anggota dan jadwal terurut', async () => {
      const mockData = [
        {
          id: 'plan-10',
          member_id: 'm-1',
          total_consolidated_debt: 300000,
          status: 'active',
          anggota: { id: 'm-1', nama: 'Kopda Ahmad', nrp: '654321', tanggal_lahir: '1988-11-10' },
          store_credit_schedules: [
            { id: 's-2', period_number: 2, target_amount: 150000 },
            { id: 's-1', period_number: 1, target_amount: 150000 }
          ]
        }
      ];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockData,
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const plans = await getActiveStoreCreditPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].anggota?.nama).toBe('Kopda Ahmad');
      expect(plans[0].schedules[0].period_number).toBe(1);
      expect(plans[0].schedules[1].period_number).toBe(2);
    });
  });

  describe('payStoreCreditSchedule', () => {
    it('memperbarui jadwal menjadi paid, memanggil settleStoreCredit, dan mengubah status plan menjadi paid_off jika semua lunas', async () => {
      let updatedSchedule: any = null;
      let updatedPlan: any = null;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_schedules') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'sch-final',
                        plan_id: 'plan-target',
                        period_number: 2,
                        target_amount: 100000,
                        paid_amount: 0,
                        status: 'unpaid'
                      },
                      error: null
                    })
                  })
                };
              }
              // select id, status untuk cek all schedules
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'sch-prev', status: 'paid' },
                    { id: 'sch-final', status: 'paid' }
                  ],
                  error: null
                })
              };
            }),
            update: vi.fn().mockImplementation((payload: any) => {
              updatedSchedule = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null })
              };
            })
          };
        }
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'plan-target',
                    member_id: 'm-target',
                    status: 'active'
                  },
                  error: null
                })
              })
            }),
            update: vi.fn().mockImplementation((payload: any) => {
              updatedPlan = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null })
              };
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{ id: 'sale-t1', paid_credit: 100000, sale_status: 'completed' }],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'payment-sync-100' },
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const res = await payStoreCreditSchedule({
        scheduleId: 'sch-final',
        amount: 100000,
        paymentMethod: 'potong_gaji',
        receiptNo: 'BYR-SCHEDULE-100',
        notes: 'Angsuran Bon Ke-2 via Potong Gaji'
      });

      expect(res.success).toBe(true);
      expect(res.scheduleId).toBe('sch-final');
      expect(res.paymentId).toBe('payment-sync-100');

      // Verifikasi status jadwal menjadi 'paid' dan receipt_number unik per periode
      expect(updatedSchedule.status).toBe('paid');
      expect(updatedSchedule.paid_amount).toBe(100000);
      expect(updatedSchedule.receipt_number).toMatch(/^BYR-SCHEDULE-100-P2-\d{3}$/);

      // Verifikasi rencana diupdate menjadi 'paid_off'
      expect(updatedPlan).toBeDefined();
      expect(updatedPlan.status).toBe('paid_off');
    });

    it('memperbarui jadwal menjadi partial jika pembayaran kurang dari target_amount dan tidak menandai plan paid_off', async () => {
      let updatedSchedule: any = null;
      let updatedPlan: any = null;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_schedules') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'sch-part',
                        plan_id: 'plan-target-2',
                        period_number: 1,
                        target_amount: 100000,
                        paid_amount: 0,
                        status: 'unpaid'
                      },
                      error: null
                    })
                  })
                };
              }
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'sch-part', status: 'partial' }],
                  error: null
                })
              };
            }),
            update: vi.fn().mockImplementation((payload: any) => {
              updatedSchedule = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null })
              };
            })
          };
        }
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'plan-target-2',
                    member_id: 'm-target-2',
                    status: 'active'
                  },
                  error: null
                })
              })
            }),
            update: vi.fn().mockImplementation((payload: any) => {
              updatedPlan = payload;
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null })
              };
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{ id: 'sale-t2', paid_credit: 100000, sale_status: 'completed' }],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'payment-part-1' },
                  error: null
                })
              })
            })
          };
        }
        return {};
      });

      const res = await payStoreCreditSchedule({
        scheduleId: 'sch-part',
        amount: 40000,
        paymentMethod: 'potong_gaji'
      });

      expect(res.success).toBe(true);
      expect(updatedSchedule.status).toBe('partial');
      expect(updatedSchedule.paid_amount).toBe(40000);
      expect(updatedPlan).toBeNull(); // Plan tidak boleh jadi paid_off
    });

    it('tidak memperbarui jadwal atau plan jika INSERT ke store_credit_payments gagal', async () => {
      let scheduleUpdated = false;
      let planUpdated = false;

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_schedules') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'sch-fail',
                    plan_id: 'plan-fail',
                    period_number: 1,
                    target_amount: 100000,
                    paid_amount: 0,
                    status: 'unpaid'
                  },
                  error: null
                })
              })
            }),
            update: vi.fn().mockImplementation(() => {
              scheduleUpdated = true;
              return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
            })
          };
        }
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'plan-fail', member_id: 'm-fail', status: 'active' },
                  error: null
                })
              })
            }),
            update: vi.fn().mockImplementation(() => {
              planUpdated = true;
              return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{ id: 'sale-fail', paid_credit: 100000, sale_status: 'completed' }],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'duplicate key value violates unique constraint "store_credit_payments_receipt_number_key"' }
                })
              })
            })
          };
        }
        return {};
      });

      const res = await payStoreCreditSchedule({
        scheduleId: 'sch-fail',
        amount: 100000,
        paymentMethod: 'potong_gaji',
        receiptNo: 'KWT-DUP'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('duplicate key');
      expect(scheduleUpdated).toBe(false);
      expect(planUpdated).toBe(false);
    });

    it('menghasilkan receipt_number unik per periode saat beberapa periode dilunasi beruntun dengan receiptNo sama', async () => {
      const insertedReceipts: string[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_schedules') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockImplementation((_col: string, id: string) => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id,
                        plan_id: 'plan-multi',
                        period_number: id === 'sch-p1' ? 1 : 2,
                        target_amount: 100000,
                        paid_amount: 0,
                        status: 'unpaid'
                      },
                      error: null
                    })
                  }))
                };
              }
              return {
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'sch-p1', status: 'paid' },
                    { id: 'sch-p2', status: 'unpaid' }
                  ],
                  error: null
                })
              };
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          };
        }
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'plan-multi', member_id: 'm-multi', status: 'active' },
                  error: null
                })
              })
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: null, error: null })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{ id: 'sale-multi', paid_credit: 200000, sale_status: 'completed' }],
                    error: null
                  })
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [], error: null })
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              insertedReceipts.push(payload.receipt_number);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: `pay-${insertedReceipts.length}` },
                    error: null
                  })
                })
              };
            })
          };
        }
        return {};
      });

      const res1 = await payStoreCreditSchedule({
        scheduleId: 'sch-p1',
        amount: 100000,
        paymentMethod: 'potong_gaji',
        receiptNo: 'KWT-ANGS-610459'
      });
      const res2 = await payStoreCreditSchedule({
        scheduleId: 'sch-p2',
        amount: 100000,
        paymentMethod: 'potong_gaji',
        receiptNo: 'KWT-ANGS-610459'
      });

      expect(res1.success).toBe(true);
      expect(res2.success).toBe(true);
      expect(insertedReceipts).toHaveLength(2);
      expect(insertedReceipts[0]).toMatch(/^KWT-ANGS-610459-P1-\d{3}$/);
      expect(insertedReceipts[1]).toMatch(/^KWT-ANGS-610459-P2-\d{3}$/);
      expect(insertedReceipts[0]).not.toBe(insertedReceipts[1]);
    });

    it('mencatat cash_flow (direction=in, category=PELUNASAN_BON_TOKO) saat pelunasan angsuran via potong_gaji', async () => {
      const cashFlowInserts: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_schedules') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === '*') {
                return {
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'sch-cf-1', plan_id: 'plan-cf-1', period_number: 1, target_amount: 30000, paid_amount: 0, status: 'unpaid' },
                      error: null
                    })
                  })
                };
              }
              return {
                eq: vi.fn().mockResolvedValue({ data: [{ id: 'sch-cf-1', status: 'paid' }], error: null })
              };
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
          };
        }
        if (table === 'store_credit_installment_plans') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'plan-cf-1', member_id: 'm-cf-1', status: 'active' }, error: null })
              })
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { nama: 'Budi Santoso', nrp: '123456' }, error: null })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [{ id: 'sale-cf-1', paid_credit: 30000, sale_status: 'completed' }], error: null })
                })
              })
            })
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'pay-cf-1' }, error: null })
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              cashFlowInserts.push(payload);
              return Promise.resolve({ error: null });
            })
          };
        }
        return {};
      });

      const res = await payStoreCreditSchedule({
        scheduleId: 'sch-cf-1',
        amount: 30000,
        paymentMethod: 'potong_gaji',
        receiptNo: 'KWT-CF-01'
      });

      expect(res.success).toBe(true);
      expect(cashFlowInserts).toHaveLength(1);
      expect(cashFlowInserts[0]).toEqual(
        expect.objectContaining({
          direction: 'in',
          category: 'PELUNASAN_BON_TOKO',
          amount: 30000,
          reference_id: 'pay-cf-1',
          description: expect.stringContaining('123456 - Budi Santoso')
        })
      );
      expect(cashFlowInserts[0].description).toContain('Piutang -Rp 30.000');
      expect(cashFlowInserts[0].description).toContain('Sisa Piutang: Rp 0');
    });
  });

  describe('syncUnrecordedStoreCreditPaymentsToCashFlow', () => {
    it('hanya menyisipkan pembayaran bon yang belum memiliki reference_id di cash_flow (idempoten)', async () => {
      const cashFlowInserts: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  { id: 'pay-old-1', sale_id: 'sale-1', amount: 20000, receipt_number: 'BYR-001', notes: '[Tunai]', created_at: '2026-11-01T10:00:00Z' },
                  { id: 'pay-old-2', sale_id: 'sale-2', amount: 30000, receipt_number: 'BYR-002', notes: '[Potong Gaji]', created_at: '2026-11-02T10:00:00Z' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === 'reference_id') {
                return {
                  in: vi.fn().mockResolvedValue({
                    data: [{ reference_id: 'pay-old-1' }],
                    error: null
                  })
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                })
              };
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              cashFlowInserts.push(payload);
              return Promise.resolve({ error: null });
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'sale-2', member_id: 'm-2', paid_credit: 30000 }],
                error: null
              })
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-2', nama: 'Siti Aminah', nrp: '654321' }],
                error: null
              })
            })
          };
        }
        return {};
      });

      const res = await syncStoreCreditPaymentsToCashFlow();

      expect(res.syncedCount).toBe(1);
      expect(cashFlowInserts).toHaveLength(1);
      expect(cashFlowInserts[0]).toEqual(
        expect.objectContaining({
          direction: 'in',
          category: 'PELUNASAN_BON_TOKO',
          amount: 30000,
          reference_id: 'pay-old-2',
          created_at: '2026-11-02T10:00:00Z',
          description: expect.stringContaining('654321 - Siti Aminah')
        })
      );
      expect(cashFlowInserts[0].description).toContain('Piutang -Rp 30.000');
      expect(cashFlowInserts[0].description).toContain('Sisa Piutang: Rp 0');
    });
  });

  describe('formatStoreCreditCashFlowDescription & getOutstandingStoreCreditSummary', () => {
    it('formats explicit cash flow descriptions for Potong Gaji, Tunai Kasir, and Transfer Bank', () => {
      expect(
        formatStoreCreditCashFlowDescription({
          paymentMethod: 'PAYROLL_DEDUCTION',
          receiptNumber: 'BYR-001',
          memberNrp: '88010001',
          memberName: 'Budi Santoso',
          paidAmount: 100000,
          remainingDebt: 50000,
        })
      ).toBe(
        'Pelunasan Bon Toko (Potong Gaji • BYR-001) — 88010001 - Budi Santoso | Piutang -Rp 100.000 (Sisa Piutang: Rp 50.000)'
      );

      expect(
        formatStoreCreditCashFlowDescription({
          paymentMethod: 'tunai',
          receiptNumber: 'BYR-002',
          memberNrp: '88010002',
          memberName: 'Siti Aminah',
          paidAmount: 75000,
          remainingDebt: 0,
        })
      ).toBe(
        'Pelunasan Bon Toko (Tunai Kasir • BYR-002) — 88010002 - Siti Aminah | Piutang -Rp 75.000 (Sisa Piutang: Rp 0)'
      );

      expect(
        formatStoreCreditCashFlowDescription({
          paymentMethod: 'TRANSFER',
          paidAmount: 40000,
          remainingDebt: null,
        })
      ).toBe('Pelunasan Bon Toko (Transfer Bank) | Piutang -Rp 40.000');
    });

    it('getOutstandingStoreCreditSummary returns totalOutstandingReceivable and activeDebtorsCount', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockResolvedValue({
                data: [
                  { id: 's-1', member_id: 'm-1', paid_credit: 200000, sale_status: 'completed' },
                  { id: 's-2', member_id: 'm-2', paid_credit: 100000, sale_status: 'completed' },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'p-1', sale_id: 's-1', amount: 50000 }],
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const summary = await getOutstandingStoreCreditSummary();
      expect(summary).toEqual({
        totalOutstandingReceivable: 250000,
        activeDebtorsCount: 2,
        totalCreditSales: 300000,
        totalRepaid: 50000,
      });
    });

    it('settleStoreCredit records Piutang -Rp and remaining Sisa Piutang across partial payment and full payoff', async () => {
      const cashFlowInserts: any[] = [];
      let paymentSeq = 0;
      const existingPayments: any[] = [];

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                gt: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [{ id: 'sale-1', paid_credit: 100000, sale_status: 'completed', created_at: '2026-11-10' }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'store_credit_payments') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockImplementation(async () => ({ data: [...existingPayments], error: null })),
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              paymentSeq += 1;
              const row = { id: `pay-seq-${paymentSeq}`, ...payload };
              existingPayments.push(row);
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { nama: 'Budi', nrp: '112233' }, error: null }),
              }),
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any) => {
              cashFlowInserts.push(payload);
              return Promise.resolve({ error: null });
            }),
          };
        }
        return {};
      });

      const res1 = await settleStoreCredit({
        memberId: 'm-1',
        amount: 40000,
        paymentMethod: 'potong_gaji',
        referenceNo: 'BYR-P1',
      });
      expect(res1.success).toBe(true);
      expect(cashFlowInserts[0].description).toContain('Piutang -Rp 40.000 (Sisa Piutang: Rp 60.000)');

      const res2 = await settleStoreCredit({
        memberId: 'm-1',
        amount: 60000,
        paymentMethod: 'tunai',
        referenceNo: 'BYR-P2',
      });
      expect(res2.success).toBe(true);
      expect(cashFlowInserts[1].description).toContain('Piutang -Rp 60.000 (Sisa Piutang: Rp 0)');
    });
  });
});


