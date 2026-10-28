import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processCheckout } from './posCheckoutService';
import { supabase } from '../lib/supabaseClient';
import * as cashierShiftService from './cashierShiftService';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn()
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
});
