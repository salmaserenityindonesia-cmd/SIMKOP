import { supabase } from '../lib/supabaseClient';

export interface EndOfDayReport {
  totalOmzet: number;
  totalDiscount: number;
  totalSubtotal: number;
  paidCash: number;
  paidDeposit: number;
  paidCredit: number;
  transactions: any[];
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
  potensiPenjualan: number;
  kritisCount: number;
  items: any[];
}

// ─── End of Day Report ────────────────────────────────────────────────────────
export const getEndOfDayReport = async (
  startDate?: string,
  endDate?: string,
  cashierId?: string
): Promise<EndOfDayReport> => {
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
    return { totalOmzet: 0, totalDiscount: 0, totalSubtotal: 0, paidCash: 0, paidDeposit: 0, paidCredit: 0, transactions: [] };
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
    totalOmzet += Number(sale.total_amount || 0);
    totalDiscount += Number(sale.discount || 0);
    totalSubtotal += Number(sale.subtotal || 0);
    paidCash += Number(sale.paid_cash || 0);
    paidDeposit += Number(sale.paid_deposit || 0);
    paidCredit += Number(sale.paid_credit || 0);

    return {
      ...sale,
      pengelola: cashierMap[sale.cashier_id] || null,
      anggota: memberMap[sale.member_id] || null,
    };
  });

  return { totalOmzet, totalDiscount, totalSubtotal, paidCash, paidDeposit, paidCredit, transactions };
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

    const qty = Number(item.quantity || 0);
    const price = Number(item.unit_price || 0);
    const buyPrice = Number(prod?.buy_price || 0);

    aggregation[key].qty += qty;
    aggregation[key].omzet += qty * price;
    aggregation[key].hpp += qty * buyPrice;
  });

  const result = Object.values(aggregation).map(ag => ({
    ...ag,
    labaKotor: ag.omzet - ag.hpp,
    margin: ag.omzet > 0 ? ((ag.omzet - ag.hpp) / ag.omzet) * 100 : 0,
  }));

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
    const stock = Number(product.stock || 0);
    const minAlert = Number(product.min_stock_alert || 0);
    const buyPrice = Number(product.buy_price || 0);
    const sellPrice = Number(product.sell_price || 0);

    let status = 'aman';
    if (stock <= 0) status = 'habis';
    else if (minAlert > 0 && stock <= minAlert) status = 'kritis';

    if (stockStatus === 'low' && status === 'aman') return;
    if (stockStatus === 'out' && status !== 'habis') return;

    totalValuasiAset += stock * buyPrice;
    potensiPenjualan += stock * sellPrice;
    if (status !== 'aman') kritisCount++;

    items.push({
      ...product,
      categoryName: catMap[product.category_id] || 'Lainnya',
      status,
      valuasiAset: stock * buyPrice,
    });
  });

  return { totalValuasiAset, potensiPenjualan, kritisCount, items };
};
