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
    const startIso = startDate ? `${startDate}T00:00:00+07:00` : undefined;
    const endIso = endDate ? `${endDate}T23:59:59.999+07:00` : undefined;

    let query = supabase
      .from('cashier_shifts')
      .select('*');

    if (startIso && endIso && typeof (query as any).or === 'function') {
      query = query.or(
        `and(opened_at.gte.${startIso},opened_at.lte.${endIso}),and(closed_at.gte.${startIso},closed_at.lte.${endIso})`
      );
    } else {
      if (startIso) {
        query = query.gte('opened_at', startIso);
      }
      if (endIso) {
        query = query.lte('opened_at', endIso);
      }
    }

    if (cashierId && cashierId !== 'all' && typeof (query as any).eq === 'function') {
      query = query.eq('cashier_id', cashierId);
    }

    const { data: shiftsData, error: shiftsError } = await query.order('opened_at', { ascending: false });
    if (shiftsError) throw shiftsError;

    if (shiftsData && shiftsData.length > 0) {
      const cashierIds = [...new Set(shiftsData.map(d => d.cashier_id).filter(Boolean))];
      const cashierMap: Record<string, string> = {};
      if (cashierIds.length > 0) {
        try {
          const { data: pengelolaList } = await supabase
            .from('pengelola')
            .select('id, nama')
            .in('id', cashierIds);
          pengelolaList?.forEach(p => {
            cashierMap[p.id] = p.nama;
          });
        } catch {
          // ignore lookup errors
        }
      }

      const list: CashierShift[] = shiftsData.map(row => ({
        id: row.id,
        cashier_id: row.cashier_id,
        shift_number: row.shift_number,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        initial_cash: sanitizeNumber(row.initial_cash),
        cash_sales: sanitizeNumber(row.cash_sales),
        expected_cash: sanitizeNumber(row.expected_cash),
        actual_cash: sanitizeNumber(row.actual_cash),
        difference: sanitizeNumber(row.difference),
        status: row.status,
        notes: row.notes,
        cashier_name: cashierMap[row.cashier_id] || undefined,
        created_at: row.created_at
      }));

      if (cashierId && cashierId !== 'all') {
        return list.filter(s => s.cashier_id === cashierId);
      }
      return list;
    }

    const fallbackList = await getShiftHistory(startDate, endDate);
    if (cashierId && cashierId !== 'all') {
      return fallbackList.filter(s => s.cashier_id === cashierId);
    }
    return fallbackList;
  } catch (err: any) {
    console.warn('Gagal memuat riwayat rekonsiliasi shift:', err?.message || err);
    try {
      const fallbackList = await getShiftHistory(startDate, endDate);
      if (cashierId && cashierId !== 'all') {
        return fallbackList.filter(s => s.cashier_id === cashierId);
      }
      return fallbackList;
    } catch {
      return [];
    }
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

  const startIso = startDate ? `${startDate}T00:00:00+07:00` : undefined;
  const endIso = endDate ? `${endDate}T23:59:59.999+07:00` : undefined;

  // Step 1: Fetch completed sales with WIB date & cashier filters
  const buildSalesQuery = (selectClause: string) => {
    let q = supabase
      .from('sales')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (typeof (q as any).eq === 'function') {
      q = q.eq('sale_status', 'completed');
    }
    if (startIso) q = q.gte('created_at', startIso);
    if (endIso) q = q.lte('created_at', endIso);
    if (cashierId && cashierId !== 'all' && typeof (q as any).eq === 'function') {
      q = q.eq('cashier_id', cashierId);
    }
    return q;
  };

  let { data: sales, error: salesError } = await buildSalesQuery('*, sale_items(*)');
  if (salesError) {
    const fallbackRes = await buildSalesQuery('*');
    if (fallbackRes.error) throw fallbackRes.error;
    sales = fallbackRes.data;
  }
  if (!sales || sales.length === 0) {
    return { totalOmzet: 0, totalDiscount: 0, totalSubtotal: 0, paidCash: 0, paidDeposit: 0, paidCredit: 0, transactions: [], shifts };
  }

  // Step 2: Collect unique cashier & member IDs for lookup
  const cashierIds = [...new Set(sales.map((s: any) => s.cashier_id).filter(Boolean))];
  const memberIds = [...new Set(sales.map((s: any) => s.member_id).filter(Boolean))];

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

  const transactions = sales.map((sale: any) => {
    const totalAmount = Math.max(0, sanitizeNumber(sale.total_amount));
    const discountVal = Math.max(0, sanitizeNumber(sale.discount));
    const subtotalVal = Math.max(0, sanitizeNumber(sale.subtotal));
    const depositVal = Math.max(0, sanitizeNumber(sale.paid_deposit));
    const creditVal = Math.max(0, sanitizeNumber(sale.paid_credit));
    let cashVal = Math.max(0, sanitizeNumber(sale.paid_cash));

    if (cashVal === 0 && sale.payment_scheme === 'cash' && depositVal === 0 && creditVal === 0) {
      cashVal = totalAmount;
    }

    totalOmzet += totalAmount;
    totalDiscount += discountVal;
    totalSubtotal += subtotalVal;
    paidCash += cashVal;
    paidDeposit += depositVal;
    paidCredit += creditVal;

    return {
      ...sale,
      paid_cash: cashVal,
      completed_at: sale.completed_at || sale.created_at,
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
  const startIso = startDate ? `${startDate}T00:00:00+07:00` : undefined;
  const endIso = endDate ? `${endDate}T23:59:59.999+07:00` : undefined;

  // Step 1: Get qualifying completed sale IDs from the WIB date range
  let salesQuery = supabase
    .from('sales')
    .select('id');
  if (typeof (salesQuery as any).eq === 'function') {
    salesQuery = salesQuery.eq('sale_status', 'completed');
  }
  if (startIso) salesQuery = salesQuery.gte('created_at', startIso);
  if (endIso) salesQuery = salesQuery.lte('created_at', endIso);

  const { data: salesData, error: salesError } = await salesQuery;
  if (salesError) throw salesError;
  if (!salesData || salesData.length === 0) return [];

  const saleIds = salesData.map(s => s.id);

  // Step 2: Fetch sale_items for those sale IDs
  const { data: items, error: itemsError } = await supabase
    .from('sale_items')
    .select('*')
    .in('sale_id', saleIds);

  if (itemsError) throw itemsError;
  if (!items || items.length === 0) return [];

  // Step 3: Get unique product IDs and fetch product details
  const productIds = [...new Set(items.map(i => i.product_id).filter(Boolean))];
  let products: any[] = [];
  if (productIds.length > 0) {
    const { data: prodData, error: productsError } = await supabase
      .from('products')
      .select('id, sku, name, buy_price, sell_price, category_id')
      .in('id', productIds);

    if (productsError) throw productsError;
    products = prodData || [];
  }

  // Step 4: Fetch categories for those products
  const categoryIds = [...new Set(products.map(p => p.category_id).filter(Boolean))];
  const categoryMap: Record<string, string> = {};
  if (categoryIds.length > 0) {
    const { data: cats } = await supabase
      .from('product_categories')
      .select('id, name')
      .in('id', categoryIds);
    cats?.forEach(c => { categoryMap[c.id] = c.name; });
  }

  const productMap: Record<string, any> = {};
  products.forEach(p => { productMap[p.id] = { ...p, categoryName: categoryMap[p.category_id] || 'Lainnya' }; });

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

    const qty = Math.max(0, sanitizeNumber(item.quantity ?? item.qty));
    let price = Math.max(0, sanitizeNumber(item.unit_price ?? item.price));
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
