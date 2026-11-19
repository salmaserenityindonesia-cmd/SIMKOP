import { supabase } from '../lib/supabaseClient';
import { getMemberFinancials } from './posCreditService';
import { getLocalActiveShift, getActiveShiftId } from './cashierShiftService';
import {
  getMemberUnpaidStoreCreditSummary,
  createOrTakeoverStoreCreditPlan
} from './storeCreditLedgerService';
import { formatPosCashFlowDescription } from '../utils/posCashFlowFormat';
import {
  PosCheckoutItem,
  PosCheckoutRpcPayload,
  PosCheckoutRpcResponse,
  CheckoutResult
} from '../types/pos';

export interface CheckoutPayload {
  memberId: string | null;
  memberNrp?: string | null;
  memberName?: string | null;
  cashierId: string | null;
  shiftId?: string | null;
  cart: any[];
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidCash: number;
  paidDeposit: number;
  paidCredit: number;
  paymentScheme: string; // 'cash' | 'split' | 'store_credit'
  storeCreditTenor?: number;
}

function isPostgrestColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

async function resolveBuyerIdentity(
  memberId: string | null,
  memberNrp?: string | null,
  memberName?: string | null
): Promise<{ nrp: string | null; nama: string | null }> {
  if (!memberId) {
    return { nrp: null, nama: null };
  }
  const cleanNrp = memberNrp ? String(memberNrp).trim() : '';
  const cleanNama = memberName ? String(memberName).trim() : '';
  if (cleanNrp && cleanNama) {
    return { nrp: cleanNrp, nama: cleanNama };
  }

  try {
    const anggotaTable: any = supabase?.from?.('anggota');
    if (anggotaTable && typeof anggotaTable.select === 'function') {
      const selQ: any = anggotaTable.select('nrp, nama');
      if (selQ && typeof selQ.eq === 'function') {
        const eqQ: any = selQ.eq('id', memberId);
        const res: any =
          eqQ && typeof eqQ.maybeSingle === 'function'
            ? await eqQ.maybeSingle()
            : eqQ && typeof eqQ.single === 'function'
            ? await eqQ.single()
            : await eqQ;
        const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
        return {
          nrp: cleanNrp || (row?.nrp ? String(row.nrp).trim() : null),
          nama: cleanNama || (row?.nama ? String(row.nama).trim() : null),
        };
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return {
    nrp: cleanNrp || null,
    nama: cleanNama || null,
  };
}

export const processCheckout = async (payload: CheckoutPayload): Promise<CheckoutResult> => {
  try {
    // Non-member cash-only validation
    if (!payload.memberId && (payload.paidDeposit > 0 || payload.paidCredit > 0)) {
      return {
        success: false,
        error: 'Non-anggota hanya diperbolehkan menggunakan metode pembayaran tunai.'
      };
    }

    // 1. Client-side fast validation for credit scheme
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

    // Pre-checkout: Ambil ringkasan sisa saldo bon anggota SEBELUM transaksi baru tercatat di database (mencegah double-counting)
    let preCheckoutSummary: { unpaidBalance: number; existingTenor: number } | null = null;
    if (payload.paidCredit > 0 && payload.memberId) {
      try {
        const summary = await getMemberUnpaidStoreCreditSummary(payload.memberId);
        preCheckoutSummary = {
          unpaidBalance: summary.unpaidBalance || 0,
          existingTenor: summary.existingTenor || 1
        };
      } catch (err) {
        console.warn('Warning fetching member unpaid store credit summary before checkout:', err);
        preCheckoutSummary = { unpaidBalance: 0, existingTenor: 1 };
      }
    }

    // Determine active shift ID with priority: parameter input -> active shift state -> localStorage active_shift_id
    let effectiveShiftId = payload.shiftId || null;
    if (!effectiveShiftId) {
      const activeShift = getLocalActiveShift();
      effectiveShiftId = activeShift?.id || null;
    }
    if (!effectiveShiftId) {
      effectiveShiftId = getActiveShiftId();
    }

    // Calculate precision cash amount applied to transaction (handling change / kembalian)
    const nonCash = (payload.paidDeposit || 0) + (payload.paidCredit || 0);
    const change = Math.max(0, (payload.paidCash || 0) + nonCash - payload.totalAmount);
    const effectivePaidCash = Math.max(0, (payload.paidCash || 0) - change);

    const effectivePaidAmount = payload.totalAmount;

    // Generate unique sale number
    const saleNumber = `INV-${Date.now()}`;

    // 2. Prepare items and payload for Atomic POS Checkout RPC
    const rpcItems: PosCheckoutItem[] = payload.cart.map(item => ({
      product_id: item.id,
      product_name: item.name || 'Produk',
      quantity: item.qty,
      qty: item.qty,
      unit_price: item.price,
      price: item.price,
      subtotal: item.subtotal ?? (item.qty * item.price),
      buy_price: item.buyPrice || 0
    }));

    const rpcPayload: PosCheckoutRpcPayload = {
      p_sale_number: saleNumber,
      p_member_id: payload.memberId,
      p_cashier_id: payload.cashierId,
      p_shift_id: effectiveShiftId,
      p_subtotal: payload.subtotal,
      p_discount: payload.discount,
      p_total_amount: payload.totalAmount,
      p_payment_scheme: payload.paymentScheme,
      p_paid_cash: effectivePaidCash,
      p_paid_deposit: payload.paidDeposit,
      p_paid_credit: payload.paidCredit,
      p_items: rpcItems
    };

    // 3. Execute Atomic RPC Transaction
    let rpcExecuted = false;
    let rpcResult: PosCheckoutRpcResponse | null = null;

    if (supabase.rpc && typeof supabase.rpc === 'function') {
      try {
        const rpcRes = (await supabase.rpc('process_pos_checkout', rpcPayload as any)) as any;

        if (rpcRes) {
          const { data, error } = rpcRes;
          if (error) {
            // If RPC function is missing (PGRST202) or fails due to legacy sales column/type mismatch
            // (e.g. 42703: column "status" does not exist, 42804: column "payment_scheme" is of type payment_scheme),
            // fallback to sequential client-side mutations
            const errorMsg = error.message || '';
            const isMissingFunctionOrColumnMismatch =
              error.code === 'PGRST202' ||
              error.code === '42703' ||
              error.code === '42804' ||
              errorMsg.includes('Could not find the function') ||
              /column .* of relation "sales" does not exist/i.test(errorMsg) ||
              /column .* is of type .* but expression is of type/i.test(errorMsg);
            if (isMissingFunctionOrColumnMismatch) {
              console.warn('process_pos_checkout RPC unavailable or mismatched schema, falling back to client mutations:', errorMsg);
            } else {
              throw new Error(errorMsg || 'Gagal memproses transaksi kasir.');
            }
          } else if (data) {
            if (data.success === false) {
              throw new Error(data.message || 'Transaksi kasir ditolak oleh sistem.');
            }
            rpcResult = data;
            rpcExecuted = true;
          }
        }
      } catch (err: any) {
        if (err.message && !err.message.includes('Cannot destructure')) {
          throw err;
        }
      }
    }

    let resolvedSaleId = '';
    let resolvedSaleNumber = '';

    if (rpcExecuted && rpcResult) {
      resolvedSaleId = rpcResult.sale_id || '';
      resolvedSaleNumber = rpcResult.sale_number || saleNumber;

      if (effectivePaidCash > 0 && resolvedSaleId) {
        try {
          const cfTable: any = supabase?.from?.('cash_flow');
          if (cfTable && typeof cfTable.update === 'function') {
            const buyer = await resolveBuyerIdentity(
              payload.memberId,
              payload.memberNrp,
              payload.memberName
            );
            const cashFlowDescription = formatPosCashFlowDescription({
              saleNumber: resolvedSaleNumber,
              memberNrp: buyer.nrp,
              memberName: buyer.nama,
              amount: effectivePaidCash
            });
            let updQ: any = cfTable.update({ description: cashFlowDescription });
            if (updQ && typeof updQ.eq === 'function') {
              updQ = updQ.eq('reference_id', resolvedSaleId);
              if (updQ && typeof updQ.eq === 'function') {
                updQ = updQ.eq('category', 'penjualan_tunai');
              }
              await updQ;
            }
          }
        } catch {
          // Non-blocking enrichment sync for DBs without migration 054
        }
      }
    } else {
      // 4. Fallback: Sequential client-side mutations (for environments without process_pos_checkout RPC)
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert({
          sale_number: saleNumber,
          member_id: payload.memberId,
          cashier_id: payload.cashierId,
          shift_id: effectiveShiftId,
          subtotal: payload.subtotal,
          discount: payload.discount,
          total_amount: payload.totalAmount,
          paid_amount: effectivePaidAmount,
          paid_cash: effectivePaidCash,
          paid_deposit: payload.paidDeposit,
          paid_credit: payload.paidCredit,
          payment_scheme: payload.paymentScheme,
          sale_status: 'completed'
        })
        .select('id')
        .single();

      if (saleError) throw saleError;
      const saleId = saleData.id;
      resolvedSaleId = saleId;
      resolvedSaleNumber = saleNumber;

      // Insert sale items
      const items = payload.cart.map(item => ({
         sale_id: saleId,
         product_id: item.id,
         product_name: item.name,
         quantity: item.qty,
         unit_price: item.price
      }));

      const { error: itemsError } = await supabase.from('sale_items').insert(items);
      if (itemsError) throw itemsError;

      // Update Product Stock
      for (const item of payload.cart) {
        const { data: product } = await supabase.from('products').select('stock').eq('id', item.id).single();
        if (product) {
           await supabase.from('products').update({ stock: product.stock - item.qty }).eq('id', item.id);
        }
      }

      // Deduct from deposit_transactions if deposit used
      if (payload.paidDeposit > 0 && payload.memberId) {
        let depositRpcExecuted = false;
        if (supabase.rpc && typeof supabase.rpc === 'function') {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('process_pos_deposit_payment', {
            p_member_id: payload.memberId,
            p_amount: payload.paidDeposit,
            p_sale_id: saleId,
            p_invoice_number: saleNumber,
            p_cashier_id: payload.cashierId
          });

          if (rpcErr) {
            const isMissingFunction = rpcErr.code === 'PGRST202' || rpcErr.message?.includes('Could not find the function');
            if (!isMissingFunction) {
              throw new Error(rpcErr.message || 'Gagal memproses pemotongan Simpanan Belanja');
            }
          } else if (rpcRes && rpcRes.success === false) {
            throw new Error(rpcRes.message || 'Saldo Simpanan Belanja tidak mencukupi');
          } else if (!rpcErr && rpcRes?.success !== false) {
            depositRpcExecuted = true;
          }
        }

        if (!depositRpcExecuted) {
          const { data: dTypes } = await supabase.from('deposit_types').select('id').ilike('name', '%belanja%');
          let shoppingDepositTypeId = dTypes?.[0]?.id;

          if (!shoppingDepositTypeId) {
            const { data: dtByCode } = await supabase
              .from('deposit_types')
              .select('id')
              .eq('code', 'BELANJA')
              .maybeSingle();
            shoppingDepositTypeId = dtByCode?.id;
          }

          if (shoppingDepositTypeId) {
            const memberDepQuery = supabase
              .from('member_deposits')
              .select('id')
              .eq('member_id', payload.memberId)
              .eq('deposit_type_id', shoppingDepositTypeId);

            const { data: memberDep } = typeof (memberDepQuery as any).maybeSingle === 'function'
              ? await (memberDepQuery as any).maybeSingle()
              : await (memberDepQuery as any).single();

            let targetMemberDepId = memberDep?.id;

            if (!targetMemberDepId) {
              const insertQuery = supabase
                .from('member_deposits')
                .insert({
                  member_id: payload.memberId,
                  deposit_type_id: shoppingDepositTypeId
                })
                .select('id');

              const { data: newDep } = typeof (insertQuery as any).maybeSingle === 'function'
                ? await (insertQuery as any).maybeSingle()
                : typeof (insertQuery as any).single === 'function'
                  ? await (insertQuery as any).single()
                  : await insertQuery;

              targetMemberDepId = newDep?.id;
            }

            if (targetMemberDepId) {
              await supabase.from('deposit_transactions').insert({
                member_deposit_id: targetMemberDepId,
                transaction_date: new Date().toISOString(),
                transaction_type: 'withdrawal',
                amount: Number(payload.paidDeposit),
                description: `Belanja Kasir POS (${saleNumber})`,
                reference_no: saleNumber,
                payment_method: 'potong_simpanan_belanja',
                notes: `Transaksi belanja toko kasir`,
                created_by: payload.cashierId,
                created_at: new Date().toISOString()
              });
            }
          }
        }
      }

      // Insert into cash_flow if cash used
      if (effectivePaidCash > 0) {
        const cfTable: any = supabase?.from?.('cash_flow');
        if (cfTable && typeof cfTable.insert === 'function') {
          const buyer = await resolveBuyerIdentity(
            payload.memberId,
            payload.memberNrp,
            payload.memberName
          );
          const cashFlowDescription = formatPosCashFlowDescription({
            saleNumber,
            memberNrp: buyer.nrp,
            memberName: buyer.nama,
            amount: effectivePaidCash
          });
          let cfRes = await cfTable.insert({
            direction: 'in',
            amount: effectivePaidCash,
            category: 'penjualan_tunai',
            reference_id: saleId,
            description: cashFlowDescription
          });
          if (cfRes?.error && isPostgrestColumnError(cfRes.error)) {
            cfRes = await cfTable.insert({
              direction: 'in',
              amount: effectivePaidCash,
              category: 'penjualan_tunai',
              reference_id: saleId
            });
          }
          if (cfRes?.error) console.error('cash_flow insert error:', cfRes.error);
        }
      }
    }

    // 5. Buat atau ambil alih rencana tenor angsuran bon toko jika ada pembayaran kredit/bon
    if (payload.paidCredit > 0 && payload.memberId && resolvedSaleId) {
      try {
        const tenorMonths = payload.storeCreditTenor || preCheckoutSummary?.existingTenor || 1;
        const prevBalance = preCheckoutSummary?.unpaidBalance ?? 0;
        await createOrTakeoverStoreCreditPlan({
          memberId: payload.memberId,
          saleId: resolvedSaleId,
          previousUnpaidBalance: prevBalance,
          newCreditAmount: payload.paidCredit,
          tenorMonths: tenorMonths,
          userId: payload.cashierId || undefined
        });
      } catch (creditPlanErr) {
        console.error('Failed to create or takeover store credit plan:', creditPlanErr);
      }
    }

    return { success: true, saleId: resolvedSaleId, saleNumber: resolvedSaleNumber };
  } catch (error: any) {
    console.error('Checkout error:', error);
    return { success: false, error: error.message };
  }
};
