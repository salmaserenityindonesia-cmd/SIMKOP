import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCheckout } from './posCheckoutService';
import { supabase } from '../lib/supabaseClient';
import * as cashierShiftService from './cashierShiftService';
import * as posCreditService from './posCreditService';

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

  it('should call atomic RPC process_pos_checkout successfully with full payload on cash checkout', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string, params: any) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: {
            success: true,
            sale_id: 'sale-uuid-atomic-1',
            sale_number: params.p_sale_number,
            message: 'Checkout berhasil diproses secara atomik.'
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
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
      cart: [{ id: 'prod-1', name: 'Minyak Goreng', qty: 2, price: 20000, subtotal: 40000, buyPrice: 16000 }],
      subtotal: 40000,
      discount: 0,
      totalAmount: 40000,
      paidCash: 50000, // kembalian Rp 10.000, porsi kas riil = 40.000
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-atomic-1');
    expect(res.saleNumber).toMatch(/^INV-\d+$/);

    expect(supabase.rpc).toHaveBeenCalledWith(
      'process_pos_checkout',
      expect.objectContaining({
        p_cashier_id: 'cashier-1',
        p_shift_id: 'active-shift-123',
        p_member_id: null,
        p_total_amount: 40000,
        p_paid_cash: 40000,
        p_paid_deposit: 0,
        p_paid_credit: 0,
        p_payment_scheme: 'cash',
        p_items: [
          expect.objectContaining({
            product_id: 'prod-1',
            product_name: 'Minyak Goreng',
            quantity: 2,
            unit_price: 20000,
            subtotal: 40000
          })
        ]
      })
    );
  });

  it('should call atomic RPC process_pos_checkout for split payment (cash + deposit)', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string, params: any) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: {
            success: true,
            sale_id: 'sale-uuid-split-1',
            sale_number: params.p_sale_number
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const payload = {
      memberId: 'member-uuid-1',
      cashierId: 'cashier-1',
      shiftId: 'shift-99',
      cart: [{ id: 'prod-1', name: 'Beras 5kg', qty: 1, price: 65000, subtotal: 65000 }],
      subtotal: 65000,
      discount: 0,
      totalAmount: 65000,
      paidCash: 15000,
      paidDeposit: 50000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-split-1');
    expect(supabase.rpc).toHaveBeenCalledWith(
      'process_pos_checkout',
      expect.objectContaining({
        p_member_id: 'member-uuid-1',
        p_shift_id: 'shift-99',
        p_total_amount: 65000,
        p_paid_cash: 15000,
        p_paid_deposit: 50000,
        p_paid_credit: 0,
        p_payment_scheme: 'split'
      })
    );
  });

  it('should reject checkout if non-member attempts to pay with deposit', async () => {
    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Barang 1', qty: 1, price: 10000 }],
      subtotal: 10000,
      discount: 0,
      totalAmount: 10000,
      paidCash: 5000,
      paidDeposit: 5000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.');
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should reject checkout if non-member attempts to pay with credit/bon', async () => {
    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Barang 1', qty: 1, price: 10000 }],
      subtotal: 10000,
      discount: 0,
      totalAmount: 10000,
      paidCash: 0,
      paidDeposit: 0,
      paidCredit: 10000,
      paymentScheme: 'store_credit'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('should fail checkout if member credit exceeds remaining safe THP limit', async () => {
    vi.spyOn(posCreditService, 'getMemberFinancials').mockResolvedValue({
      belanjaBalance: 100000,
      remainingCreditLimit: 20000, // limit hanya 20.000
      thpSafetyThreshold: 1500000
    });

    const payload = {
      memberId: 'member-1',
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Barang Mahal', qty: 1, price: 50000 }],
      subtotal: 50000,
      discount: 0,
      totalAmount: 50000,
      paidCash: 0,
      paidDeposit: 0,
      paidCredit: 50000, // butuh kredit 50.000 > 20.000
      paymentScheme: 'store_credit'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Credit amount exceeds remaining safe THP limit.');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('should fail checkout and propagate error if atomic RPC returns database error (e.g. insufficient stock)', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'P0001',
            message: 'Stok produk "Beras 5kg" tidak mencukupi (Tersedia: 2, Dibutuhkan: 5).'
          }
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Beras 5kg', qty: 5, price: 65000 }],
      subtotal: 325000,
      discount: 0,
      totalAmount: 325000,
      paidCash: 325000,
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Stok produk "Beras 5kg" tidak mencukupi (Tersedia: 2, Dibutuhkan: 5).');
  });

  it('should fail checkout if atomic RPC returns success: false with message', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: {
            success: false,
            message: 'Saldo Simpanan Belanja tidak mencukupi (Saldo: Rp 10.000, Dibutuhkan: Rp 50.000).'
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const payload = {
      memberId: 'member-1',
      cashierId: 'cashier-1',
      cart: [{ id: 'prod-1', name: 'Barang 1', qty: 1, price: 50000 }],
      subtotal: 50000,
      discount: 0,
      totalAmount: 50000,
      paidCash: 0,
      paidDeposit: 50000,
      paidCredit: 0,
      paymentScheme: 'split'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Saldo Simpanan Belanja tidak mencukupi (Saldo: Rp 10.000, Dibutuhkan: Rp 50.000).');
  });

  it('should gracefully fallback to sequential client mutations if process_pos_checkout RPC is missing (PGRST202)', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.process_pos_checkout in the schema cache'
          }
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-fallback-pgrst' },
          error: null
        })
      })
    });
    const mockInsertItems = vi.fn().mockResolvedValue({ error: null });
    const mockProductSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null })
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

    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      shiftId: 'shift-fallback',
      cart: [{ id: 'prod-1', name: 'Gula', qty: 1, price: 15000 }],
      subtotal: 15000,
      discount: 0,
      totalAmount: 15000,
      paidCash: 15000,
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-fallback-pgrst');
    expect(mockInsertSale).toHaveBeenCalled();
    expect(mockInsertItems).toHaveBeenCalled();
    expect(mockProductUpdate).toHaveBeenCalled();
  });

  it('should gracefully fallback to sequential client mutations if process_pos_checkout RPC fails with 42703 column "status" of relation "sales" does not exist', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: null,
          error: {
            code: '42703',
            message: 'column "status" of relation "sales" does not exist'
          }
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-fallback-42703' },
          error: null
        })
      })
    });
    const mockInsertItems = vi.fn().mockResolvedValue({ error: null });
    const mockProductSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null })
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

    const payload = {
      memberId: null,
      cashierId: 'cashier-1',
      shiftId: 'shift-fallback',
      cart: [{ id: 'prod-1', name: 'Gula', qty: 1, price: 15000 }],
      subtotal: 15000,
      discount: 0,
      totalAmount: 15000,
      paidCash: 15000,
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-fallback-42703');
    expect(mockInsertSale).toHaveBeenCalledWith(
      expect.objectContaining({
        sale_status: 'completed'
      })
    );
    const insertedPayload = mockInsertSale.mock.calls[0][0];
    expect(insertedPayload).not.toHaveProperty('status');
    expect(mockInsertItems).toHaveBeenCalled();
    expect(mockProductUpdate).toHaveBeenCalled();
  });

  it('should gracefully fallback to sequential client mutations if process_pos_checkout RPC fails with 42804 enum type mismatch on payment_scheme', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: null,
          error: {
            code: '42804',
            message: 'column "payment_scheme" is of type payment_scheme but expression is of type text'
          }
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const mockInsertSale = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'sale-uuid-fallback-42804' },
          error: null
        })
      })
    });
    const mockInsertItems = vi.fn().mockResolvedValue({ error: null });
    const mockProductSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { stock: 10 }, error: null })
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

    const payload = {
      memberId: 'member-1',
      cashierId: 'cashier-1',
      shiftId: 'shift-fallback',
      cart: [{ id: 'prod-1', name: 'Gula', qty: 1, price: 15000 }],
      subtotal: 15000,
      discount: 0,
      totalAmount: 15000,
      paidCash: 15000,
      paidDeposit: 0,
      paidCredit: 0,
      paymentScheme: 'cash'
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-fallback-42804');
    expect(mockInsertSale).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_scheme: 'cash',
        sale_status: 'completed'
      })
    );
    expect(mockInsertItems).toHaveBeenCalled();
    expect(mockProductUpdate).toHaveBeenCalled();
  });

  it('should fallback to getActiveShiftId() when shiftId is not passed in payload', async () => {
    (supabase.rpc as any).mockImplementation((funcName: string, params: any) => {
      if (funcName === 'process_pos_checkout') {
        return Promise.resolve({
          data: {
            success: true,
            sale_id: 'sale-uuid-shift-storage',
            sale_number: params.p_sale_number
          },
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    vi.spyOn(cashierShiftService, 'getLocalActiveShift').mockReturnValue(null);
    vi.spyOn(cashierShiftService, 'getActiveShiftId').mockReturnValue('shift-from-storage-id');

    const payload = {
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
    };

    const res = await processCheckout(payload);

    expect(res.success).toBe(true);
    expect(res.saleId).toBe('sale-uuid-shift-storage');
    expect(supabase.rpc).toHaveBeenCalledWith(
      'process_pos_checkout',
      expect.objectContaining({
        p_shift_id: 'shift-from-storage-id'
      })
    );
  });
});
