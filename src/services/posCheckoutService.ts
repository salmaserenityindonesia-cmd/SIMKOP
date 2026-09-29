import { supabase } from '../lib/supabaseClient';
import { getMemberFinancials } from './posCreditService';

export interface CheckoutPayload {
  memberId: string | null;
  cashierId: string | null;
  cart: any[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidCash: number;
  paidDeposit: number;
  paidCredit: number;
  paymentScheme: string; // 'cash' | 'split' | 'store_credit'
}

export const processCheckout = async (payload: CheckoutPayload): Promise<{ success: boolean; error?: string; saleId?: string }> => {
  try {
    // 1. Validation for credit scheme
    if (payload.paidCredit > 0) {
      if (!payload.memberId) {
         return { success: false, error: 'Member is required for store credit.' };
      }
      const financials = await getMemberFinancials(payload.memberId);
      if (payload.paidCredit > financials.remainingCreditLimit) {
         return { success: false, error: 'Credit amount exceeds remaining safe THP limit.' };
      }
      if (payload.paidDeposit > financials.belanjaBalance) {
         return { success: false, error: 'Deposit amount exceeds available Belanja balance.' };
      }
    }

    // Generate unique sale number
    const saleNumber = `INV-${Date.now()}`;

    // Note: In Supabase without RPC, we can't do a full strict atomic transaction across multiple tables easily from the client.
    // Ideally this should be an RPC. For now, we will do sequential inserts which is a limitation but fits the current architecture.
    
    // 2. Insert into sales
    const { data: saleData, error: saleError } = await supabase
      .from('sales')
      .insert({
        sale_number: saleNumber,
        member_id: payload.memberId,
        cashier_id: payload.cashierId,
        subtotal: payload.subtotal,
        discount: payload.discount,
        total_amount: payload.totalAmount,
        paid_cash: payload.paidCash,
        paid_deposit: payload.paidDeposit,
        paid_credit: payload.paidCredit,
        payment_scheme: payload.paymentScheme
      })
      .select('id')
      .single();

    if (saleError) throw saleError;
    const saleId = saleData.id;

    // 3. Insert sale items
    const items = payload.cart.map(item => ({
       sale_id: saleId,
       product_id: item.id,
       product_name: item.name,
       quantity: item.qty, // renamed from qty to quantity to match existing table schema
       unit_price: item.price // renamed from price to unit_price
       // subtotal: is likely a generated column in DB, omitting to avoid constraint error
    }));

    const { error: itemsError } = await supabase.from('sale_items').insert(items);
    if (itemsError) throw itemsError;

    // 4. Update Product Stock
    for (const item of payload.cart) {
      const { data: product } = await supabase.from('products').select('stock').eq('id', item.id).single();
      if (product) {
         await supabase.from('products').update({ stock: product.stock - item.qty }).eq('id', item.id);
      }
    }

    // 5. If deposit used, deduct from deposit_transactions
    if (payload.paidDeposit > 0 && payload.memberId) {
       // Find "Simpanan Belanja" deposit type id and member_deposit id
       const { data: dTypes } = await supabase.from('deposit_types').select('id').ilike('name', '%belanja%');
       const belanjaType = dTypes?.[0];
       if (belanjaType) {
          const { data: memberDep } = await supabase
             .from('member_deposits')
             .select('id')
             .eq('member_id', payload.memberId)
             .eq('deposit_type_id', belanjaType.id)
             .single();
             
          if (memberDep) {
             await supabase.from('deposit_transactions').insert({
                member_deposit_id: memberDep.id,
                transaction_date: new Date().toISOString(),
                transaction_type: 'withdrawal',
                amount: payload.paidDeposit,
                notes: `Belanja Kasir - Nota #${saleNumber}`
             });
          }
       }
    }

    // 6. If cash used, insert into cash_flow
    if (payload.paidCash > 0) {
       await supabase.from('cash_flow').insert({
          transaction_date: new Date().toISOString(),
          direction: 'in',
          amount: payload.paidCash,
          category: 'penjualan_tunai',
          description: `Penjualan Tunai - Nota #${saleNumber}`
       });
    }

    return { success: true, saleId };
  } catch (error: any) {
    console.error('Checkout error:', error);
    return { success: false, error: error.message };
  }
};
