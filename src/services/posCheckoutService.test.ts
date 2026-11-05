import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCheckout } from './posCheckoutService';
import { supabase } from '../lib/supabaseClient';
import * as cashierShiftService from './cashierShiftService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn()
  }
}));

describe('posCheckoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should attach active shift_id, set precision paid_cash, and paid_amount on cash checkout', async () => {
    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-1' },
          error: null
        })
      })
    });

    const mockInsertItems = vi.fn().mockResolvedValue({ error: null });
    const mockProductSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { stock: 10 },
          error: null
        })
      })
    });
    const mockProductUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const mockCashFlowInsert = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') {
        return { insert: mockInsertSale };
      }
      if (table === 'sale_items') {
        return { insert: mockInsertItems };
      }
      if (table === 'products') {
        return {
          select: mockProductSelect,
          update: mockProductUpdate
        };
      }
      if (table === 'cash_flow') {
        return { insert: mockCashFlowInsert };
      }
      return {};
    });

    vi.spyOn(cashierShiftService, 'getLocalActiveShift').mockReturnValue({
      id: 'active-shift-123',
      cashier_id: 'cashier-1',
      shift_number: 'SHF-TEST',
      opened_at: new Date().toISOString(),
      initial_cash: 100000,
      cash_sales: 0,
      expected_cash: 100000,
      actual_cash: 0,
      difference: 0,
      status: 'open'
    });

    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Minyak Goreng', qty: 1, price: 20900 }],
      subtotal: 20900,
      discount: 0,
      totalAmount: 20900,
      paidCash: 50000, // Customer pays with Rp 50.000 cash (kembalian Rp 29.100)
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-1');

    // Verify sales payload contains shift_id, precision paid_cash (20900), paid_amount (20900), and sale_status 'completed'
    expect(mockInsertSale).toHaveBeenCalledWith(
      expect.objectContaining({
        shift_id: 'active-shift-123',
        paid_cash: 20900,
        paid_amount: 20900,
        total_amount: 20900,
        payment_scheme: 'cash',
        sale_status: 'completed'
      })
    );

    // Verify cash_flow records the net cash of the transaction (20900)
    expect(mockCashFlowInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'in',
        amount: 20900,
        category: 'penjualan_tunai',
        reference_id: 'sale-uuid-1'
      })
    );
  });

  it('should fallback to getActiveShiftId() when shiftId is not passed and memory state is null', async () => {
    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-2' },
          error: null
        })
      })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') return { insert: mockInsertSale };
      if (table === 'sale_items') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null })
          })
        };
      }
      if (table === 'cash_flow') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      return {};
    });

    vi.spyOn(cashierShiftService, 'getLocalActiveShift').mockReturnValue(null);
    vi.spyOn(cashierShiftService, 'getActiveShiftId').mockReturnValue('shift-from-storage-id');

    const res = await processCheckout({
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-2', name: 'Gula Pasir', qty: 1, price: 19000 }],
      subtotal: 19000,
      discount: 0,
      totalAmount: 19000,
      paidCash: 19000,
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    });

    expect(res.success).toBe(true);
    expect(mockInsertSale).toHaveBeenCalledWith(
      expect.objectContaining({
        shift_id: 'shift-from-storage-id',
        paid_cash: 19000,
        total_amount: 19000,
        paid_amount: 19000,
        payment_scheme: 'cash',
        sale_status: 'completed'
      })
    );
  });

  it('should reject checkout if non-member attempts to pay with deposit', async () => {
    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Minyak Goreng', qty: 1, price: 20000 }],
      subtotal: 20000,
      discount: 0,
      totalAmount: 20000,
      paidCash: 0,
      paidDeposit: 20000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should reject checkout if non-member attempts to pay with credit/bon', async () => {
    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Beras 5kg', qty: 1, price: 65000 }],
      subtotal: 65000,
      discount: 0,
      totalAmount: 65000,
      paidCash: 0,
      paidDeposit: 0,
      paidCredit: 65000,
      paymentScheme: 'store_credit'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should call RPC process_pos_deposit_payment when member pays with deposit', async () => {
    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-deposit' },
          error: null
        })
      })
    });

    const mockInsertItems = vi.fn().mockResolvedValue({ error: null });
    const mockProductSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { stock: 5 }, error: null })
      })
    });
    const mockProductUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null })
    });
    const mockCashFlowInsert = vi.fn().mockResolvedValue({ error: null });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') return { insert: mockInsertSale };
      if (table === 'sale_items') return { insert: mockInsertItems };
      if (table === 'products') return { select: mockProductSelect, update: mockProductUpdate };
      if (table === 'cash_flow') return { insert: mockCashFlowInsert };
      return {};
    });

    (supabase.rpc as any).mockResolvedValue({
      data: { success: true, remaining_balance: 75000, deducted_amount: 25000 },
      error: null
    });

    const payload = {
      memberId: 'member-uuid-1',
      cashierId: 'cashier-1',
      shiftId: 'shift-1',
      cart: [{ id: 'prod-1', name: 'Beras 2.5kg', qty: 1, price: 25000 }],
      subtotal: 25000,
      discount: 0,
      totalAmount: 25000,
      paidCash: 0,
      paidDeposit: 25000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-deposit');
    expect(supabase.rpc).toHaveBeenCalledWith('process_pos_deposit_payment', {
      p_member_id: 'member-uuid-1',
      p_amount: 25000,
      p_sale_id: 'sale-uuid-deposit',
      p_invoice_number: expect.stringMatching(/^INV-\d+$/),
      p_cashier_id: 'cashier-1'
    });
    // Since paidCash is 0, cash_flow should not be inserted
    expect(mockCashFlowInsert).not.toHaveBeenCalled();
  });

  it('should fail checkout if RPC returns insufficient balance error', async () => {
    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-fail' },
          error: null
        })
      })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') return { insert: mockInsertSale };
      if (table === 'sale_items') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { stock: 5 }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        };
      }
      return {};
    });

    (supabase.rpc as any).mockResolvedValue({
      data: { success: false, message: 'Saldo Simpanan Belanja tidak mencukupi (Saldo: Rp 5000, Dibutuhkan: Rp 25000)' },
      error: null
    });

    const payload = {
      memberId: 'member-uuid-1',
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Beras 2.5kg', qty: 1, price: 25000 }],
      subtotal: 25000,
      discount: 0,
      totalAmount: 25000,
      paidCash: 0,
      paidDeposit: 25000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Saldo Simpanan Belanja tidak mencukupi (Saldo: Rp 5000, Dibutuhkan: Rp 25000)');
  });

  it('should fail checkout if RPC execution errors', async () => {
    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-fail-rpc' },
          error: null
        })
      })
    });

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') return { insert: mockInsertSale };
      if (table === 'sale_items') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { stock: 5 }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        };
      }
      return {};
    });

    (supabase.rpc as any).mockResolvedValue({
      data: null,
      error: { message: 'Database connection timeout on RPC' }
    });

    const payload = {
      memberId: 'member-uuid-1',
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Beras 2.5kg', qty: 1, price: 25000 }],
      subtotal: 25000,
      discount: 0,
      totalAmount: 25000,
      paidCash: 0,
      paidDeposit: 25000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Database connection timeout on RPC');
  });

  it('should fallback to direct deposit_transactions insertion when RPC is unavailable', async () => {
    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-fallback' },
          error: null
        })
      })
    });
    const mockDepositTxInsert = vi.fn().mockResolvedValue({ error: null });

    const originalRpc = supabase.rpc;
    (supabase as any).rpc = undefined;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'sales') return { insert: mockInsertSale };
      if (table === 'sale_items') return { insert: vi.fn().mockResolvedValue({ error: null }) };
      if (table === 'products') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { stock: 5 }, error: null })
            })
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
        };
      }
      if (table === 'deposit_types') {
        return {
          select: vi.fn().mockReturnValue({
            ilike: vi.fn().mockResolvedValue({
              data: [{ id: 'dep-type-belanja-id' }],
              error: null
            })
          })
        };
      }
      if (table === 'member_deposits') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'member-dep-account-id' },
                  error: null
                })
              })
            })
          })
        };
      }
      if (table === 'deposit_transactions') {
        return { insert: mockDepositTxInsert };
      }
      return {};
    });

    const payload = {
      memberId: 'member-uuid-1',
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Beras 2.5kg', qty: 1, price: 25000 }],
      subtotal: 25000,
      discount: 0,
      totalAmount: 25000,
      paidCash: 0,
      paidDeposit: 25000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(mockDepositTxInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        member_deposit_id: 'member-dep-account-id',
        transaction_type: 'withdrawal',
        amount: 25000,
        payment_method: 'potong_simpanan_belanja',
        reference_no: expect.stringMatching(/^INV-\d+$/),
        created_by: 'cashier-1'
      })
    );

    (supabase as any).rpc = originalRpc;
  });
});

