import { supabase } from '../lib/supabaseClient';

export interface POSSettings {
  id?: number;
  max_hold_duration_minutes: number;
  allow_negative_stock: boolean;
  member_discount_percentage: number;
  receipt_paper_size?: '58mm' | '80mm';
  updated_at?: string;
}

export const DEFAULT_POS_SETTINGS: POSSettings = {
  id: 1,
  max_hold_duration_minutes: 120, // 2 jam default
  allow_negative_stock: false,
  member_discount_percentage: 5.0,
  receipt_paper_size: '80mm'
};

export const POS_SETTINGS_STORAGE_KEY = 'simkop_pos_settings';

// In-memory cache for ultra-fast access in POS hot paths
let cachedSettings: POSSettings | null = null;

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch (err) {
    console.warn('Storage not accessible:', err);
  }
  return null;
}

/**
 * Read settings from local browser storage
 */
export function getStoredLocalSettings(): POSSettings | null {
  try {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(POS_SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<POSSettings>;
        return {
          id: parsed.id ?? DEFAULT_POS_SETTINGS.id,
          max_hold_duration_minutes: Number(parsed.max_hold_duration_minutes) || DEFAULT_POS_SETTINGS.max_hold_duration_minutes,
          allow_negative_stock: Boolean(parsed.allow_negative_stock),
          member_discount_percentage: typeof parsed.member_discount_percentage !== 'undefined' && parsed.member_discount_percentage !== null
            ? Number(parsed.member_discount_percentage)
            : DEFAULT_POS_SETTINGS.member_discount_percentage,
          receipt_paper_size: (parsed.receipt_paper_size === '58mm' || parsed.receipt_paper_size === '80mm')
            ? parsed.receipt_paper_size
            : DEFAULT_POS_SETTINGS.receipt_paper_size,
          updated_at: parsed.updated_at
        };
      }
    }
  } catch (err) {
    console.warn('Gagal membaca pos_settings dari localStorage:', err);
  }
  return null;
}

/**
 * Persist settings to local browser storage
 */
export function saveStoredLocalSettings(settings: POSSettings): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(POS_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (err) {
    console.warn('Gagal menyimpan pos_settings ke localStorage:', err);
  }
}

/**
 * Clear in-memory cache (primarily for tests)
 */
export function clearSettingsCache(): void {
  cachedSettings = null;
}

/**
 * Check if pos_settings table exists and is accessible in Supabase
 */
export async function isPosSettingsMigratedInSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('pos_settings')
      .select('id')
      .limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Helper to identify schema cache / missing table errors
 */
function isSchemaCacheError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toLowerCase();
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    err.code === 'PGRST200' ||
    err.code === 'PGRST202' ||
    msg.includes('schema cache') ||
    msg.includes('not find the table') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

/**
 * Retrieves POS settings with multi-layered fallback
 */
export async function getPosSettings(forceRefresh: boolean = false): Promise<POSSettings> {
  if (!forceRefresh && cachedSettings) {
    return cachedSettings;
  }

  try {
    const { data, error } = await supabase
      .from('pos_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.warn('Could not fetch pos_settings from Supabase, using localStorage/default fallback:', error.message);
      const local = getStoredLocalSettings();
      cachedSettings = local || { ...DEFAULT_POS_SETTINGS };
      return cachedSettings;
    }

    if (data) {
      cachedSettings = {
        id: data.id,
        max_hold_duration_minutes: Number(data.max_hold_duration_minutes) || DEFAULT_POS_SETTINGS.max_hold_duration_minutes,
        allow_negative_stock: Boolean(data.allow_negative_stock),
        member_discount_percentage: typeof data.member_discount_percentage !== 'undefined' && data.member_discount_percentage !== null
          ? Number(data.member_discount_percentage)
          : DEFAULT_POS_SETTINGS.member_discount_percentage,
        receipt_paper_size: (data.receipt_paper_size === '58mm' || data.receipt_paper_size === '80mm')
          ? data.receipt_paper_size
          : (DEFAULT_POS_SETTINGS.receipt_paper_size || '80mm'),
        updated_at: data.updated_at
      };
      saveStoredLocalSettings(cachedSettings);
      return cachedSettings;
    }
  } catch (err: any) {
    console.warn('Error reading pos_settings, using fallback:', err?.message || err);
  }

  const local = getStoredLocalSettings();
  cachedSettings = local || { ...DEFAULT_POS_SETTINGS };
  return cachedSettings;
}

/**
 * Updates POS settings in both localStorage and Supabase
 */
export async function updatePosSettings(
  settings: Partial<POSSettings>
): Promise<{ success: boolean; data: POSSettings; isLocalFallback?: boolean; error?: string }> {
  const current = await getPosSettings();
  const merged: POSSettings = {
    ...current,
    ...settings,
    id: 1,
    member_discount_percentage: typeof settings.member_discount_percentage !== 'undefined' && settings.member_discount_percentage !== null
      ? Number(settings.member_discount_percentage)
      : current.member_discount_percentage,
    receipt_paper_size: (settings.receipt_paper_size === '58mm' || settings.receipt_paper_size === '80mm')
      ? settings.receipt_paper_size
      : current.receipt_paper_size,
    updated_at: new Date().toISOString()
  };

  // Always save locally immediately
  saveStoredLocalSettings(merged);
  cachedSettings = merged;

  try {
    const { error } = await supabase
      .from('pos_settings')
      .upsert({
        id: 1,
        max_hold_duration_minutes: merged.max_hold_duration_minutes,
        allow_negative_stock: merged.allow_negative_stock,
        member_discount_percentage: merged.member_discount_percentage,
        receipt_paper_size: merged.receipt_paper_size,
        updated_at: merged.updated_at
      });

    if (error) {
      console.warn('Supabase updatePosSettings error:', error.message);
      if (isSchemaCacheError(error)) {
        return {
          success: true,
          data: merged,
          isLocalFallback: true
        };
      }
      return {
        success: false,
        data: merged,
        error: error.message
      };
    }

    return {
      success: true,
      data: merged,
      isLocalFallback: false
    };
  } catch (err: any) {
    console.warn('Exception during updatePosSettings:', err?.message || err);
    if (isSchemaCacheError(err)) {
      return {
        success: true,
        data: merged,
        isLocalFallback: true
      };
    }
    return {
      success: false,
      data: merged,
      error: err?.message || 'Gagal menyimpan pengaturan ke database'
    };
  }
}

/**
 * Executes cleanup of expired parked sales.
 * Uses PostgreSQL RPC if available, or falls back to client-side logic.
 */
export async function cleanupExpiredParkedSales(): Promise<{ success: boolean; cleanedCount: number; error?: string }> {
  try {
    // 1. Try PostgreSQL RPC
    const { data, error } = await supabase.rpc('cleanup_expired_parked_sales');
    if (!error && data) {
      const count = typeof data.cleaned_count === 'number' ? data.cleaned_count : 0;
      return { success: true, cleanedCount: count };
    }

    if (error && !isSchemaCacheError(error)) {
      console.warn('RPC cleanup_expired_parked_sales error:', error.message);
    }
  } catch (rpcErr) {
    console.warn('RPC cleanup_expired_parked_sales failed, attempting client fallback:', rpcErr);
  }

  // 2. Client-side fallback cleanup
  try {
    const nowIso = new Date().toISOString();
    // Query parked transactions that have expired
    const { data: expiredSales, error: salesErr } = await supabase
      .from('sales')
      .select('id, expires_at, sale_status')
      .eq('sale_status', 'parked')
      .lt('expires_at', nowIso);

    if (salesErr || !expiredSales || expiredSales.length === 0) {
      return { success: true, cleanedCount: 0 };
    }

    let cleaned = 0;
    for (const sale of expiredSales) {
      // Fetch items for this sale
      const { data: items } = await supabase
        .from('sale_items')
        .select('product_id, quantity, qty')
        .eq('sale_id', sale.id);

      // Restock items
      if (items && items.length > 0) {
        for (const item of items) {
          if (item.product_id) {
            const restockQty = item.quantity || item.qty || 0;
            if (restockQty > 0) {
              const { data: prod } = await supabase
                .from('products')
                .select('stock')
                .eq('id', item.product_id)
                .maybeSingle();

              if (prod) {
                await supabase
                  .from('products')
                  .update({ stock: (prod.stock || 0) + restockQty })
                  .eq('id', item.product_id);
              }
            }
          }
        }
      }

      // Mark sale cancelled
      await supabase
        .from('sales')
        .update({ sale_status: 'cancelled' })
        .eq('id', sale.id);

      cleaned++;
    }

    return { success: true, cleanedCount: cleaned };
  } catch (fallbackErr: any) {
    console.warn('Client fallback cleanup error:', fallbackErr);
    return { success: false, cleanedCount: 0, error: fallbackErr?.message };
  }
}

function clearLocalPosCache(): void {
  try {
    localStorage.removeItem('simkop_active_shift_id');
    localStorage.removeItem('simkop_active_shift_data');
    localStorage.removeItem('simkop_pos_cart');
  } catch (_) {}
}

/**
 * Reset all POS sales, shifts, purchase invoices, and return history via atomic RPC
 * with PostgREST-compliant client-side fallback deletion.
 * Products catalog and stock quantity are preserved untouched.
 */
export async function resetPosTransactionsHistory(): Promise<{
  success: boolean;
  deleted_sales?: number;
  deleted_purchases?: number;
  deleted_returns?: number;
  message: string;
}> {
  // 1. Coba eksekusi melalui PostgreSQL RPC atomik
  try {
    const { data, error: rpcError } = await supabase.rpc('reset_pos_and_procurement_history');
    if (!rpcError && data && data.success) {
      clearLocalPosCache();
      return data;
    }
    if (rpcError) {
      console.warn('RPC reset_pos_and_procurement_history error, mencoba fallback client deletion:', rpcError.message);
    }
  } catch (rpcErr) {
    console.warn('RPC call threw exception, mencoba fallback client deletion:', rpcErr);
  }

  // 2. Client-side fallback deletion dengan klausul WHERE universal (.neq)
  // yang mematuhi PostgREST dan proteksi safeupdate database
  const DUMMY_UUID = '00000000-0000-0000-0000-000000000000';

  try {
    // a. Bersihkan pembayaran cicilan toko / store credit jika ada
    try {
      await supabase.from('store_credit_payments').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    // b. Bersihkan mutasi simpanan belanja kasir
    try {
      await supabase
        .from('deposit_transactions')
        .delete()
        .eq('payment_method', 'potong_simpanan_belanja')
        .neq('id', DUMMY_UUID);
    } catch (_) {}

    // c. Bersihkan rincian item penjualan kasir dan penjualan utama
    try {
      await supabase.from('sale_items').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    const { error: salesErr } = await supabase.from('sales').delete().neq('id', DUMMY_UUID);
    if (salesErr) {
      console.error('Gagal menghapus sales:', salesErr);
      throw new Error(salesErr.message);
    }

    // d. Bersihkan transaksi legacy jika ada
    try {
      await supabase.from('transaksi_item').delete().neq('id', DUMMY_UUID);
      await supabase.from('transaksi').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    // e. Bersihkan shift kasir
    try {
      await supabase.from('cashier_shifts').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    // f. Bersihkan retur supplier
    try {
      await supabase.from('purchase_return_items').delete().neq('id', DUMMY_UUID);
      await supabase.from('purchase_returns').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    // g. Bersihkan restock & pembelian supplier
    try {
      await supabase.from('restock_items').delete().neq('id', DUMMY_UUID);
      await supabase.from('restock_invoices').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    try {
      await supabase.from('purchase_items').delete().neq('id', DUMMY_UUID);
      await supabase.from('purchases').delete().neq('id', DUMMY_UUID);
    } catch (_) {}

    clearLocalPosCache();

    return {
      success: true,
      message: 'Seluruh riwayat transaksi kasir, pembelian, dan retur berhasil dikosongkan. Stok produk tetap utuh.'
    };
  } catch (clientErr: any) {
    console.error('Gagal mereset transaksi kasir:', clientErr);
    throw new Error(clientErr.message || 'Gagal mereset transaksi kasir');
  }
}


