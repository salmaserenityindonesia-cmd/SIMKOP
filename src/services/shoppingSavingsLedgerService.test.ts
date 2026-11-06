import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBelanjaDepositTypeIds,
  getShoppingSavingsSummary,
  getMemberShoppingLedger,
  getSaleDetailByInvoice,
  syncOrphanSalesToDepositLedger,
  sanitizeNumber
} from './shoppingSavingsLedgerService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
  }
}));

describe('shoppingSavingsLedgerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeNumber', () => {
    it('mengubah string atau nilai numerik menjadi number yang valid', () => {
      expect(sanitizeNumber('50000')).toBe(50000);
      expect(sanitizeNumber(12500)).toBe(12500);
      expect(sanitizeNumber(undefined, 0)).toBe(0);
      expect(sanitizeNumber('invalid', 10)).toBe(10);
    });
  });

  describe('getBelanjaDepositTypeIds', () => {
    it('mengidentifikasi kode BELANJA, SB, atau nama belanja', async () => {
      const mockSelect = vi.fn().mockResolvedValue({
        data: [
          { id: 'dt-1', code: 'BELANJA', name: 'Simpanan Belanja' },
          { id: 'dt-2', code: 'SW', name: 'Simpanan Wajib' },
          { id: 'dt-3', code: 'SB', name: 'Tabungan Belanja Hari Raya' }
        ],
        error: null
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect
      });

      const ids = await getBelanjaDepositTypeIds();
      expect(ids).toEqual(['dt-1', 'dt-3']);
      expect(supabase.from).toHaveBeenCalledWith('deposit_types');
    });

    it('mengembalikan array kosong jika query error', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: null, error: { message: 'Timeout' } })
      });

      const ids = await getBelanjaDepositTypeIds();
      expect(ids).toEqual([]);
    });
  });

  describe('getShoppingSavingsSummary', () => {
    it('menghitung total setoran, penarikan/belanja, sisa saldo, dan jumlah anggota pengguna', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' }],
              error: null
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-1', member_id: 'm-1' },
                  { id: 'md-2', member_id: 'm-2' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { member_deposit_id: 'md-1', transaction_type: 'deposit', amount: 100000 },
                  { member_deposit_id: 'md-1', transaction_type: 'withdrawal', amount: 35000 },
                  { member_deposit_id: 'md-2', transaction_type: 'deposit', amount: 200000 },
                  { member_deposit_id: 'md-2', transaction_type: 'withdrawal', amount: 50000 }
                ],
                error: null
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const summary = await getShoppingSavingsSummary();

      expect(summary.totalDeposit).toBe(300000);
      expect(summary.totalWithdrawal).toBe(85000);
      expect(summary.currentBalance).toBe(215000);
      expect(summary.activeMemberCount).toBe(2);
      expect(summary.totalTransactions).toBe(4);
    });
  });

  describe('getMemberShoppingLedger', () => {
    it('menghitung running balance kronologis dengan tepat untuk setiap mutasi', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' }],
              error: null
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-belanja' }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-1', nama: 'Sertu Budi', nrp: '12345' }],
                error: null
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'p-1', nama: 'Kasir Maya' }],
              error: null
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'tx-1',
                      member_deposit_id: 'md-1',
                      transaction_date: '2026-01-05T08:00:00Z',
                      transaction_type: 'deposit',
                      amount: 100000,
                      description: 'Iuran Simpanan Belanja Jan 2026',
                      reference_no: 'TRX-001',
                      payment_method: 'potong_gaji',
                      notes: null,
                      created_by: 'p-1',
                      created_at: '2026-01-05T08:00:00Z'
                    },
                    {
                      id: 'tx-2',
                      member_deposit_id: 'md-1',
                      transaction_date: '2026-01-10T12:30:00Z',
                      transaction_type: 'withdrawal',
                      amount: 45000,
                      description: 'Belanja Toko di Kasir POS (INV-20260110-01)',
                      reference_no: 'INV-20260110-01',
                      payment_method: 'potong_simpanan_belanja',
                      notes: 'Transaksi kasir',
                      created_by: 'p-1',
                      created_at: '2026-01-10T12:30:00Z'
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const result = await getMemberShoppingLedger();
      expect(result.items).toHaveLength(2);

      // Item 1: Setoran Masuk 100.000
      expect(result.items[0].debit).toBe(100000);
      expect(result.items[0].credit).toBe(0);
      expect(result.items[0].running_balance).toBe(100000);
      expect(result.items[0].member_name).toBe('Sertu Budi');
      expect(result.items[0].is_pos_sale).toBe(false);

      // Item 2: Belanja POS 45.000
      expect(result.items[1].debit).toBe(0);
      expect(result.items[1].credit).toBe(45000);
      expect(result.items[1].running_balance).toBe(55000);
      expect(result.items[1].is_pos_sale).toBe(true);
      expect(result.items[1].cashier_name).toBe('Kasir Maya');
    });

    it('mendukung filter jenis mutasi deposit atau withdrawal', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'dt-belanja', code: 'BELANJA', name: 'Simpanan Belanja' }],
              error: null
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-belanja' }],
                error: null
              })
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-1', nama: 'Sertu Budi', nrp: '12345' }],
                error: null
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'tx-1', member_deposit_id: 'md-1', transaction_type: 'deposit', amount: 100000, created_at: '2026-01-01' },
                    { id: 'tx-2', member_deposit_id: 'md-1', transaction_type: 'withdrawal', amount: 40000, created_at: '2026-01-02' }
                  ],
                  error: null
                })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const resDepositOnly = await getMemberShoppingLedger({ transactionType: 'deposit' });
      expect(resDepositOnly.items).toHaveLength(1);
      expect(resDepositOnly.items[0].transaction_type).toBe('deposit');

      const resWithdrawalOnly = await getMemberShoppingLedger({ transactionType: 'withdrawal' });
      expect(resWithdrawalOnly.items).toHaveLength(1);
      expect(resWithdrawalOnly.items[0].transaction_type).toBe('withdrawal');
    });
  });

  describe('getSaleDetailByInvoice', () => {
    it('mengambil data struk belanja POS dan daftar item barangnya', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'sale-123',
                    sale_number: 'INV-20260110-001',
                    created_at: '2026-01-10T12:00:00Z',
                    cashier_id: 'cashier-1',
                    member_id: 'member-1',
                    subtotal: 50000,
                    discount: 0,
                    total_amount: 50000,
                    paid_amount: 50000,
                    paid_cash: 0,
                    paid_deposit: 50000,
                    paid_credit: 0,
                    payment_scheme: 'deposit'
                  },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'sale_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'si-1',
                    product_id: 'p-1',
                    product_name: 'Beras Premium 5kg',
                    quantity: 1,
                    unit_price: 50000,
                    subtotal: 50000
                  }
                ],
                error: null
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { nama: 'Siti Rahma' }, error: null })
              })
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { nama: 'Mayor Dani', nrp: '998877' }, error: null })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const detail = await getSaleDetailByInvoice('INV-20260110-001');

      expect(detail).not.toBeNull();
      expect(detail?.sale_number).toBe('INV-20260110-001');
      expect(detail?.member_name).toBe('Mayor Dani');
      expect(detail?.cashier_name).toBe('Siti Rahma');
      expect(detail?.paid_deposit).toBe(50000);
      expect(detail?.items).toHaveLength(1);
      expect(detail?.items[0].product_name).toBe('Beras Premium 5kg');
    });

    it('mengembalikan null jika nomor invoice tidak ditemukan', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })
        })
      });

      const detail = await getSaleDetailByInvoice('NON-EXISTENT');
      expect(detail).toBeNull();
    });
  });

  describe('syncOrphanSalesToDepositLedger', () => {
    it('menyinkronkan orphan sales dengan paid_deposit > 0 ke deposit_transactions', async () => {
      const mockDepositTxInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sale-orphan-1',
                      sale_number: 'INV-20261105-01',
                      member_id: 'member-123',
                      paid_deposit: 21000,
                      cashier_id: 'cashier-456',
                      created_at: '2026-11-05T10:00:00Z',
                      sale_status: 'completed'
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'dt-belanja-id', code: 'BELANJA' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) // not yet existing
              })
            }),
            insert: mockDepositTxInsert
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'member-dep-account-id' },
                    error: null
                  })
                })
              })
            })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      await syncOrphanSalesToDepositLedger();

      expect(mockDepositTxInsert).toHaveBeenCalledTimes(1);
      expect(mockDepositTxInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          member_deposit_id: 'member-dep-account-id',
          transaction_type: 'withdrawal',
          amount: 21000,
          reference_no: 'INV-20261105-01',
          payment_method: 'potong_simpanan_belanja',
          description: 'Belanja Kasir POS (INV-20261105-01)',
          created_by: 'cashier-456'
        })
      );
    });

    it('tidak menduplikasi mutasi jika reference_no sudah ada di deposit_transactions', async () => {
      const mockDepositTxInsert = vi.fn().mockResolvedValue({ error: null });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sale-already-synced',
                      sale_number: 'INV-20261105-99',
                      member_id: 'member-123',
                      paid_deposit: 21000,
                      cashier_id: 'cashier-456',
                      created_at: '2026-11-05T10:00:00Z',
                      sale_status: 'completed'
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'dt-belanja-id', code: 'BELANJA' },
                  error: null
                })
              })
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'existing-tx-id' }, // already exists
                  error: null
                })
              })
            }),
            insert: mockDepositTxInsert
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      await syncOrphanSalesToDepositLedger();

      expect(mockDepositTxInsert).not.toHaveBeenCalled();
    });

    it('menampilkan transaksi belanja kasir POS Rp 21.000 dengan nota pembelanjaan di buku besar belanja', async () => {
      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'dt-belanja-1', code: 'BELANJA' }, error: null })
              }),
              then: (resolve: any) => resolve({ data: [{ id: 'dt-belanja-1', code: 'BELANJA', name: 'Simpanan Belanja' }], error: null })
            })
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'md-1', member_id: 'm-1', deposit_type_id: 'dt-belanja-1' }],
                error: null
              }),
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'md-1' }, error: null })
                })
              })
            })
          };
        }
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'sale-pos-21k',
                      sale_number: 'INV-20261105-001',
                      member_id: 'm-1',
                      cashier_id: 'p-1',
                      paid_deposit: 21000,
                      total_amount: 21000,
                      payment_scheme: 'split',
                      sale_status: 'completed',
                      created_at: '2026-11-05T09:30:00Z'
                    }
                  ],
                  error: null
                }),
                then: (resolve: any) => resolve({
                  data: [
                    {
                      id: 'sale-pos-21k',
                      sale_number: 'INV-20261105-001',
                      member_id: 'm-1',
                      cashier_id: 'p-1',
                      paid_deposit: 21000,
                      total_amount: 21000,
                      payment_scheme: 'split',
                      sale_status: 'completed',
                      created_at: '2026-11-05T09:30:00Z'
                    }
                  ],
                  error: null
                })
              })
            })
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [{ id: 'm-1', nama: 'Sertu Budi', nrp: '12345' }],
                error: null
              })
            })
          };
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'p-1', nama: 'Kasir Andi' }],
              error: null
            })
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'tx-setoran-1',
                      member_deposit_id: 'md-1',
                      transaction_type: 'deposit',
                      amount: 7450000,
                      description: 'Setoran Simpanan Belanja',
                      reference_no: 'SETORAN-01',
                      created_at: '2026-11-01T08:00:00Z'
                    }
                  ],
                  error: null
                })
              }),
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
              })
            }),
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      });

      const res = await getMemberShoppingLedger();

      expect(res.items.length).toBeGreaterThanOrEqual(2);
      
      const depositItem = res.items.find(i => i.transaction_type === 'deposit');
      expect(depositItem).toBeDefined();
      expect(depositItem?.amount).toBe(7450000);

      const withdrawalItem = res.items.find(i => i.transaction_type === 'withdrawal');
      expect(withdrawalItem).toBeDefined();
      expect(withdrawalItem?.credit).toBe(21000);
      expect(withdrawalItem?.reference_no).toBe('INV-20261105-001');
      expect(withdrawalItem?.is_pos_sale).toBe(true);
      expect(withdrawalItem?.cashier_name).toBe('Kasir Andi');

      // Final running balance
      const lastItem = res.items[res.items.length - 1];
      expect(lastItem.running_balance).toBe(7450000 - 21000);
    });
  });
});

