import { supabase } from '../lib/supabaseClient';
import { getShiftHistory, CashierShift } from './cashierShiftService';

export type { CashierShift };

export interface EndOfDayReport {
  totalOmzet: number;
  totalDiscount: number;
  totalSubtotal: number;
  paidCash: number;
  paidDeposit: number;
  paidCredit: number;
  transactions: any[];
  shifts?: CashierShift[];
}

export interface FastMovingProduct {
  rank?: number;
  sku: string;
  name: string;
  category: string;
  qty: number;
  omzet: number;
  hpp: number;
  labaKotor: number;
  margin: number;
}

export interface StockValuation {
  totalValuasiAset: number;
  totalValuasiHpp?: number;
  potensiPenjualan: number;
  labaBruto?: number;
  kritisCount: number;
  items: any[];
}

// ─── Guardrail Constants ───────────────────────────────────────────────────────
export const MAX_SINGLE_ITEM_VALUATION = 1_000_000_000; // Rp 1 Miliar batas atas per item
export const MAX_REASONABLE_UNIT_PRICE = 100_000_000;  // Rp 100 Juta batas wajar harga satuan
export const MAX_REASONABLE_STOCK = 100_000;            // 100.000 unit batas stok wajar

/**
 * Helper untuk sanitasi nilai numerik agar kebal dari null, undefined, string kosong,
 * string non-angka, maupun nilai NaN / Infinity.
 */
export const sanitizeNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined || val === '') return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

// ─── Cashier Shift Reconciliation Report ──────────────────────────────────────
export const getShiftReconciliationReport = async (
  startDate?: string,
  endDate?: string,
  cashierId?: string
): Promise<CashierShift[]> => {
  try {
    const list = await getShiftHistory(startDate, endDate);
    if (cashierId && cashierId !== 'all') {
      return list.filter(s => s.cashier_id === cashierId);
    }
    return list;
  } catch (err: any) {
    console.warn('Gagal memuat riwayat rekonsiliasi shift:', err?.message || err);
    return [];
  }
};

// ─── End of Day Report ────────────────────────────────────────────────────────
export const getEndOfDayReport = async (
  startDate?: string,
  endDate?: string,
  cashierId?: string
): Promise<EndOfDayReport> => {
  // Fetch shifts for the selected range and cashier
  let shifts: CashierShift[] = [];
  try {
    shifts = await getShiftReconciliationReport(startDate, endDate, cashierId);
  } catch {
    shifts = [];
  }

  // Step 1: Fetch sales with date & cashier filters (no join needed)
  let salesQuery = supabase
    .from('sales')
    .select('*')
    .order('created_at', { ascending: false });

  if (startDate) salesQuery = salesQuery.gte('created_at', `${startDate}T00:00:00.000Z`);
  if (endDate) salesQuery = salesQuery.lte('created_at', `${endDate}T23:59:59.999Z`);
  if (cashierId && cashierId !== 'all') salesQuery = salesQuery.eq('cashier_id', cashierId);

  const { data: sales, error: salesError } = await salesQuery;
  if (salesError) throw salesError;
  if (!sales || sales.length === 0) {
    return { totalOmzet: 0, totalDiscount: 0, totalSubtotal: 0, paidCash: 0, paidDeposit: 0, paidCredit: 0, transactions: [], shifts };
  }

  // Step 2: Collect unique cashier & member IDs for lookup
  const cashierIds = [...new Set(sales.map(s => s.cashier_id).filter(Boolean))];
  const memberIds = [...new Set(sales.map(s => s.member_id).filter(Boolean))];

  // Step 3: Fetch pengelola (cashiers) separately
  const cashierMap: Record<string, any> = {};
  if (cashierIds.length > 0) {
    const { data: pengelola } = await supabase
      .from('pengelola')
      .select('id, nama')
      .in('id', cashierIds);
    pengelola?.forEach(p => { cashierMap[p.id] = p; });
  }

  // Step 4: Fetch anggota (members) separately
  const memberMap: Record<string, any> = {};
  if (memberIds.length > 0) {
    const { data: anggota } = await supabase
      .from('anggota')
      .select('id, nrp, nama')
      .in('id', memberIds);
    anggota?.forEach(a => { memberMap[a.id] = a; });
  }

  // Step 5: Aggregate + enrich
  let totalOmzet = 0, totalDiscount = 0, totalSubtotal = 0;
  let paidCash = 0, paidDeposit = 0, paidCredit = 0;

  const transactions = sales.map(sale => {
    totalOmzet += Math.max(0, sanitizeNumber(sale.total_amount));
    totalDiscount += Math.max(0, sanitizeNumber(sale.discount));
    totalSubtotal += Math.max(0, sanitizeNumber(sale.subtotal));
    paidCash += Math.max(0, sanitizeNumber(sale.paid_cash));
    paidDeposit += Math.max(0, sanitizeNumber(sale.paid_deposit));
    paidCredit += Math.max(0, sanitizeNumber(sale.paid_credit));

    return {
      ...sale,
      pengelola: cashierMap[sale.cashier_id] || null,
      anggota: memberMap[sale.member_id] || null,
    };
  });

  return { totalOmzet, totalDiscount, totalSubtotal, paidCash, paidDeposit, paidCredit, transactions, shifts };
};

// ─── Fast Moving Products ─────────────────────────────────────────────────────
export const getFastMovingProducts = async (
  startDate?: string,
  endDate?: string,
  categoryId?: string
): Promise<FastMovingProduct[]> => {
  // Step 1: Get qualifying sale IDs from the date range
  let salesQuery = supabase
    .from('sales')
    .select('id');
  if (startDate) salesQuery = salesQuery.gte('created_at', `${startDate}T00:00:00.000Z`);
  if (endDate) salesQuery = salesQuery.lte('created_at', `${endDate}T23:59:59.999Z`);

  const { data: salesData, error: salesError } = await salesQuery;
  if (salesError) throw salesError;
  if (!salesData || salesData.length === 0) return [];

  const saleIds = salesData.map(s => s.id);

  // Step 2: Fetch sale_items for those sale IDs
  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('sale_id, product_id, product_name, quantity, unit_price')
    .in('sale_id', saleIds);

  if (itemsError) throw itemsError;
  if (!items || items.length === 0) return [];

  // Step 3: Get unique product IDs and fetch product details
  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, sku, name, buy_price, sell_price, category_id')
    .in('id', productIds);

  if (productsError) throw productsError;

  // Step 4: Fetch categories for those products
  const categoryIds = [...new Set((products || []).map(p => p.category_id).filter(Boolean))];
  const categoryMap: Record<string, string> = {};
  if (categoryIds.length > 0) {
    const { data: cats } = await supabase
      .from('product_categories')
      .select('id, name')
      .in('id', categoryIds);
    cats?.forEach(c => { categoryMap[c.id] = c.name; });
  }

  const productMap: Record<string, any> = {};
  (products || []).forEach(p => { productMap[p.id] = { ...p, categoryName: categoryMap[p.category_id] || 'Lainnya' }; });

  // Step 5: Aggregate by product
  const aggregation: Record<string, FastMovingProduct> = {};

  items.forEach(item => {
    const prod = productMap[item.product_id];
    // category filter
    if (categoryId && categoryId !== 'all' && prod?.category_id !== categoryId) return;

    const key = item.product_id || item.product_name;
    if (!key) return;

    if (!aggregation[key]) {
      aggregation[key] = {
        sku: prod?.sku || '-',
        name: prod?.name || item.product_name || '-',
        category: prod?.categoryName || 'Lainnya',
        qty: 0, omzet: 0, hpp: 0, labaKotor: 0, margin: 0,
      };
    }

    const qty = Math.max(0, sanitizeNumber(item.quantity));
    let price = Math.max(0, sanitizeNumber(item.unit_price));
    let buyPrice = Math.max(0, sanitizeNumber(prod?.buy_price));

    // Guardrail against abnormal unit price
    if (price > MAX_REASONABLE_UNIT_PRICE) price = MAX_REASONABLE_UNIT_PRICE;
    if (buyPrice > MAX_REASONABLE_UNIT_PRICE) {
      buyPrice = (price > 0 && price <= MAX_REASONABLE_UNIT_PRICE) ? Math.round(price * 0.8) : MAX_REASONABLE_UNIT_PRICE;
    }

    aggregation[key].qty += qty;
    aggregation[key].omzet += qty * price;
    aggregation[key].hpp += qty * buyPrice;
  });

  const result = Object.values(aggregation).map(ag => {
    const labaKotor = ag.omzet - ag.hpp;
    const margin = ag.omzet > 0 ? (labaKotor / ag.omzet) * 100 : 0;
    return {
      ...ag,
      labaKotor,
      margin,
    };
  });

  result.sort((a, b) => b.qty - a.qty);
  result.forEach((item, idx) => { item.rank = idx + 1; });

  return result;
};

// ─── Stock Valuation ──────────────────────────────────────────────────────────
export const getStockValuation = async (
  categoryId?: string,
  stockStatus?: 'all' | 'low' | 'out'
): Promise<StockValuation> => {
  // Fetch products (without is_active filter to be safe — not all schemas have it)
  let query = supabase
    .from('products')
    .select('id, sku, name, stock, min_stock_alert, buy_price, sell_price, unit, category_id')
    .order('name');

  if (categoryId && categoryId !== 'all') {
    query = query.eq('category_id', categoryId);
  }

  const { data: products, error } = await query;
  if (error) throw error;

  // Fetch categories
  const categoryIds = [...new Set((products || []).map(p => p.category_id).filter(Boolean))];
  const catMap: Record<string, string> = {};
  if (categoryIds.length > 0) {
    const { data: cats } = await supabase
      .from('product_categories')
      .select('id, name')
      .in('id', categoryIds);
    cats?.forEach(c => { catMap[c.id] = c.name; });
  }

  let totalValuasiAset = 0;
  let potensiPenjualan = 0;
  let kritisCount = 0;
  const items: any[] = [];

  (products || []).forEach(product => {
    // 1. Sanitasi stok fisik (cegah NaN, negatif, atau angka ekstrim)
    const rawStock = sanitizeNumber(product.stock, 0);
    const stock = Math.max(0, Math.min(rawStock, MAX_REASONABLE_STOCK));

    const minAlert = Math.max(0, sanitizeNumber(product.min_stock_alert, 0));

    // 2. Sanitasi harga beli & harga jual
    let buyPrice = Math.max(0, sanitizeNumber(product.buy_price, 0));
    let sellPrice = Math.max(0, sanitizeNumber(product.sell_price, 0));

    // 3. Guardrail deteksi harga abnormal (misal: barcode 13-digit EAN ~899xxxxxxxx terpindai ke harga)
    if (buyPrice > MAX_REASONABLE_UNIT_PRICE) {
      console.warn(
        `[retail-report] Anomali harga beli pada produk "${product.name || '-'}" (SKU: ${product.sku || '-'}): Rp ${buyPrice}. Menyesuaikan ke batas wajar.`
      );
      if (sellPrice > 0 && sellPrice <= MAX_REASONABLE_UNIT_PRICE) {
        buyPrice = Math.round(sellPrice * 0.8);
      } else {
        buyPrice = MAX_REASONABLE_UNIT_PRICE;
      }
    }

    if (sellPrice > MAX_REASONABLE_UNIT_PRICE) {
      console.warn(
        `[retail-report] Anomali harga jual pada produk "${product.name || '-'}" (SKU: ${product.sku || '-'}): Rp ${sellPrice}. Menyesuaikan ke batas wajar.`
      );
      sellPrice = MAX_REASONABLE_UNIT_PRICE;
    }

    // 4. Penentuan status stok
    let status = 'aman';
    if (stock <= 0) status = 'habis';
    else if (minAlert > 0 && stock <= minAlert) status = 'kritis';

    if (stockStatus === 'low' && status === 'aman') return;
    if (stockStatus === 'out' && status !== 'habis') return;

    // 5. Kalkulasi valuasi per item dengan upper-bound filter (> 1 Miliar per item)
    let itemValuasiAset = stock * buyPrice;
    let itemPotensiPenjualan = stock * sellPrice;

    if (itemValuasiAset > MAX_SINGLE_ITEM_VALUATION) {
      console.warn(
        `[retail-report] Valuasi HPP abnormal pada produk "${product.name || '-'}" (SKU: ${product.sku || '-'}): Rp ${itemValuasiAset}. Dibatasi ke batas aman Rp ${MAX_SINGLE_ITEM_VALUATION}.`
      );
      itemValuasiAset = MAX_SINGLE_ITEM_VALUATION;
    }

    if (itemPotensiPenjualan > MAX_SINGLE_ITEM_VALUATION) {
      console.warn(
        `[retail-report] Potensi penjualan abnormal pada produk "${product.name || '-'}" (SKU: ${product.sku || '-'}): Rp ${itemPotensiPenjualan}. Dibatasi ke batas aman Rp ${MAX_SINGLE_ITEM_VALUATION}.`
      );
      itemPotensiPenjualan = MAX_SINGLE_ITEM_VALUATION;
    }

    totalValuasiAset += itemValuasiAset;
    potensiPenjualan += itemPotensiPenjualan;
    if (status !== 'aman') kritisCount++;

    items.push({
      ...product,
      stock,
      buy_price: buyPrice,
      sell_price: sellPrice,
      categoryName: catMap[product.category_id] || 'Lainnya',
      status,
      valuasiAset: itemValuasiAset,
    });
  });

  const labaBruto = Math.round((potensiPenjualan - totalValuasiAset) * 100) / 100;

  return {
    totalValuasiAset,
    totalValuasiHpp: totalValuasiAset,
    potensiPenjualan,
    labaBruto,
    kritisCount,
    items,
  };
};
