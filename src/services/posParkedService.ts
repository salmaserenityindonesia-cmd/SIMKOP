import { supabase } from '../lib/supabaseClient';
import { getPosSettings, cleanupExpiredParkedSales } from './posSettingsService';
import { CartItem } from '../pages/pos';

export interface ParkedSaleItem {
  id?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit?: string;
  stock?: number;
}

export interface ParkedSale {
  id: string;
  sale_number: string;
  member_id?: string | null;
  member_name?: string | null;
  customer_note?: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  created_at: string;
  expires_at: string;
  items: ParkedSaleItem[];
  is_expired?: boolean;
}

const LOCAL_PARKED_STORAGE_KEY = 'simkop_parked_sales_local';

function getLocalParkedSales(): ParkedSale[] {
  try {
    const raw = localStorage.getItem(LOCAL_PARKED_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalParkedSales(sales: ParkedSale[]): void {
  try {
    localStorage.setItem(LOCAL_PARKED_STORAGE_KEY, JSON.stringify(sales));
  } catch (e) {
    console.warn('Gagal menyimpan parked sales ke localStorage:', e);
  }
}

/**
 * Hold a transaction: reserve inventory stock, save transaction to sales & sale_items,
 * calculate expiration timestamp based on POS settings.
 */
export async function holdTransaction(params: {
  cart: CartItem[];
  member?: any | null;
  customerNote?: string;
  cashierId?: string | null;
}): Promise<{ success: boolean; saleId?: string; saleNumber?: string; expiresAt?: string; error?: string }> {
  if (!params.cart || params.cart.length === 0) {
    return { success: false, error: 'Keranjang belanja kosong.' };
  }

  try {
    const settings = await getPosSettings();
    const durationMinutes = settings.max_hold_duration_minutes || 120;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    const saleNumber = `HOLD-${Date.now().toString().slice(-8)}`;

    const subtotal = params.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const discount = params.member ? subtotal * 0.05 : 0;
    const totalAmount = subtotal - discount;

    let saleId = `local-${Date.now()}`;
    let savedToSupabase = false;

    // 1. Attempt to insert into Supabase sales table
    try {
      const { data: saleData, error: saleErr } = await supabase
        .from('sales')
        .insert({
          sale_number: saleNumber,
          member_id: params.member?.id || null,
          cashier_id: params.cashierId || null,
          subtotal,
          discount,
          total_amount: totalAmount,
          paid_cash: 0,
          paid_deposit: 0,
          paid_credit: 0,
          payment_scheme: 'cash',
          status: 'parked',
          sale_status: 'parked',
          expires_at: expiresAt
        })
        .select('id')
        .single();

      if (!saleErr && saleData) {
        saleId = saleData.id;
        savedToSupabase = true;

        // Insert sale_items
        const items = params.cart.map(item => ({
          sale_id: saleId,
          product_id: item.id,
          product_name: item.name,
          quantity: item.qty,
          qty: item.qty,
          unit_price: item.price,
          price: item.price
        }));

        await supabase.from('sale_items').insert(items);
      }
    } catch (dbErr) {
      console.warn('Supabase holdTransaction failed, falling back to local storage:', dbErr);
    }

    // 2. Deduct product stock in Supabase products table (Inventory Reservation)
    for (const item of params.cart) {
      try {
        const { data: prod } = await supabase
          .from('products')
          .select('stock')
          .eq('id', item.id)
          .maybeSingle();

        if (prod) {
          const newStock = Math.max(0, (prod.stock || 0) - item.qty);
          await supabase.from('products').update({ stock: newStock }).eq('id', item.id);
        }
      } catch (stockErr) {
        console.warn(`Gagal mereservasi stok produk ${item.name}:`, stockErr);
      }
    }

    // 3. Always maintain a local copy for resilience
    const localSale: ParkedSale = {
      id: saleId,
      sale_number: saleNumber,
      member_id: params.member?.id || null,
      member_name: params.member ? `${params.member.nama} (${params.member.nrp || ''})` : null,
      customer_note: params.customerNote || (params.member ? `Member: ${params.member.nama}` : 'Pelanggan Umum'),
      subtotal,
      discount,
      total_amount: totalAmount,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      items: params.cart.map(c => ({
        product_id: c.id,
        product_name: c.name,
        quantity: c.qty,
        unit_price: c.price,
        unit: c.unit,
        stock: c.stock
      }))
    };

    const currentLocal = getLocalParkedSales().filter(s => s.id !== saleId);
    currentLocal.unshift(localSale);
    saveLocalParkedSales(currentLocal);

    return {
      success: true,
      saleId,
      saleNumber,
      expiresAt
    };
  } catch (err: any) {
    console.error('Error holding transaction:', err);
    return { success: false, error: err?.message || 'Gagal menahan transaksi.' };
  }
}

/**
 * Retrieve all currently parked sales from database & local storage.
 * Automatically runs auto-expire cleanup on old items.
 */
export async function getParkedSales(): Promise<ParkedSale[]> {
  // 1. Run cleanup first to clear expired sales
  try {
    await cleanupExpiredParkedSales();
  } catch (err) {
    console.warn('Auto cleanup in getParkedSales error:', err);
  }

  const now = new Date();
  const salesMap = new Map<string, ParkedSale>();

  // 2. Fetch from Supabase
  try {
    const { data: dbSales, error: sErr } = await supabase
      .from('sales')
      .select('id, sale_number, member_id, subtotal, discount, total_amount, created_at, expires_at, status, sale_status')
      .or('status.eq.parked,sale_status.eq.parked')
      .order('created_at', { ascending: false });

    if (!sErr && dbSales && dbSales.length > 0) {
      // Gather sale IDs
      const saleIds = dbSales.map(s => s.id);

      // Fetch items
      const { data: dbItems } = await supabase
        .from('sale_items')
        .select('id, sale_id, product_id, product_name, quantity, qty, unit_price, price')
        .in('sale_id', saleIds);

      // Fetch members
      const memberIds = dbSales.map(s => s.member_id).filter(Boolean);
      let memberMap: Record<string, string> = {};
      if (memberIds.length > 0) {
        const { data: members } = await supabase
          .from('anggota')
          .select('id, nama, nrp')
          .in('id', memberIds);

        if (members) {
          for (const m of members) {
            memberMap[m.id] = `${m.nama} (${m.nrp || ''})`;
          }
        }
      }

      for (const s of dbSales) {
        const itemsForSale = (dbItems || [])
          .filter(i => i.sale_id === s.id)
          .map(i => ({
            id: i.id,
            product_id: i.product_id,
            product_name: i.product_name,
            quantity: i.quantity || i.qty || 1,
            unit_price: Number(i.unit_price || i.price || 0)
          }));

        const isExpired = s.expires_at ? new Date(s.expires_at) < now : false;

        salesMap.set(s.id, {
          id: s.id,
          sale_number: s.sale_number,
          member_id: s.member_id,
          member_name: s.member_id ? memberMap[s.member_id] || 'Member' : 'Pelanggan Umum',
          subtotal: Number(s.subtotal || 0),
          discount: Number(s.discount || 0),
          total_amount: Number(s.total_amount || 0),
          created_at: s.created_at,
          expires_at: s.expires_at || '',
          items: itemsForSale,
          is_expired: isExpired
        });
      }
    }
  } catch (err) {
    console.warn('Gagal membaca parked sales dari Supabase:', err);
  }

  // 3. Merge with local storage
  const localList = getLocalParkedSales();
  for (const loc of localList) {
    if (!salesMap.has(loc.id)) {
      const isExpired = loc.expires_at ? new Date(loc.expires_at) < now : false;
      salesMap.set(loc.id, {
        ...loc,
        is_expired: isExpired
      });
    }
  }

  return Array.from(salesMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Resume a parked transaction:
 * Return items to active cart and remove transaction from parked status.
 * (Stock is NOT double-restored because it moves directly into the active cart).
 */
export async function resumeParkedSale(
  saleId: string
): Promise<{ success: boolean; cartItems: CartItem[]; memberId?: string | null; error?: string }> {
  try {
    const all = await getParkedSales();
    const target = all.find(s => s.id === saleId);
    if (!target) {
      return { success: false, cartItems: [], error: 'Transaksi ditahan tidak ditemukan.' };
    }

    // Convert items back to CartItem structure
    const cartItems: CartItem[] = target.items.map(item => ({
      id: item.product_id,
      barcode: '', // will be filled or kept as id
      name: item.product_name,
      unit: item.unit || 'pcs',
      price: item.unit_price,
      stock: 999, // in-cart stock reference
      qty: item.quantity
    }));

    // Remove from Supabase / Mark completed/deleted
    try {
      await supabase
        .from('sales')
        .delete()
        .eq('id', saleId);
    } catch (delErr) {
      console.warn('Gagal menghapus sale dari Supabase saat resume:', delErr);
    }

    // Remove from local storage
    const remainingLocal = getLocalParkedSales().filter(s => s.id !== saleId);
    saveLocalParkedSales(remainingLocal);

    return {
      success: true,
      cartItems,
      memberId: target.member_id
    };
  } catch (err: any) {
    return { success: false, cartItems: [], error: err?.message || 'Gagal memuat kembali transaksi.' };
  }
}

/**
 * Cancel and delete a parked sale, RESTORING stock back to products table.
 */
export async function cancelAndRestockParkedSale(
  saleId: string
): Promise<{ success: boolean; restoredCount: number; error?: string }> {
  try {
    const all = await getParkedSales();
    const target = all.find(s => s.id === saleId);
    if (!target) {
      return { success: false, restoredCount: 0, error: 'Transaksi tidak ditemukan.' };
    }

    let restored = 0;
    // 1. Restock each item back to products
    for (const item of target.items) {
      if (item.product_id && item.quantity > 0) {
        try {
          const { data: prod } = await supabase
            .from('products')
            .select('stock')
            .eq('id', item.product_id)
            .maybeSingle();

          if (prod) {
            await supabase
              .from('products')
              .update({ stock: (prod.stock || 0) + item.quantity })
              .eq('id', item.product_id);
            restored += item.quantity;
          }
        } catch (restockErr) {
          console.warn(`Gagal restock produk ${item.product_name}:`, restockErr);
        }
      }
    }

    // 2. Update status in Supabase or delete
    try {
      await supabase
        .from('sales')
        .update({ status: 'cancelled', sale_status: 'cancelled' })
        .eq('id', saleId);
    } catch (cancelErr) {
      console.warn('Gagal update status sale cancelled:', cancelErr);
    }

    // 3. Remove from local storage
    const remainingLocal = getLocalParkedSales().filter(s => s.id !== saleId);
    saveLocalParkedSales(remainingLocal);

    return { success: true, restoredCount: restored };
  } catch (err: any) {
    return { success: false, restoredCount: 0, error: err?.message || 'Gagal membatalkan transaksi.' };
  }
}
