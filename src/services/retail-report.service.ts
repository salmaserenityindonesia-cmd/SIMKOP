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

export const getEndOfDayReport = async (
  startDate?: string, 
  endDate?: string, 
  cashierId?: string
): Promise<EndOfDayReport> => {
  let query = supabase
    .from('sales')
    .select(`
      *,
      pengelola ( id, nama ),
      anggota ( id, nrp, nama )
    `)
    .order('created_at', { ascending: false });

  if (startDate) {
    query = query.gte('created_at', `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte('created_at', `${endDate}T23:59:59.999Z`);
  }
  if (cashierId && cashierId !== 'all') {
    query = query.eq('cashier_id', cashierId);
  }

  const { data, error } = await query;
  if (error) throw error;

  let totalOmzet = 0;
  let totalDiscount = 0;
  let totalSubtotal = 0;
  let paidCash = 0;
  let paidDeposit = 0;
  let paidCredit = 0;

  data?.forEach(sale => {
    totalOmzet += Number(sale.total_amount || 0);
    totalDiscount += Number(sale.discount || 0);
    totalSubtotal += Number(sale.subtotal || 0);
    paidCash += Number(sale.paid_cash || 0);
    paidDeposit += Number(sale.paid_deposit || 0);
    paidCredit += Number(sale.paid_credit || 0);
  });

  return {
    totalOmzet,
    totalDiscount,
    totalSubtotal,
    paidCash,
    paidDeposit,
    paidCredit,
    transactions: data || []
  };
};

export const getFastMovingProducts = async (
  startDate?: string, 
  endDate?: string, 
  categoryId?: string
): Promise<FastMovingProduct[]> => {
  let query = supabase
    .from('sale_items')
    .select(`
      *,
      products ( id, sku, name, buy_price, sell_price, category_id, product_categories (name) ),
      sales!inner ( created_at )
    `);

  if (startDate) {
    query = query.gte('sales.created_at', `${startDate}T00:00:00.000Z`);
  }
  if (endDate) {
    query = query.lte('sales.created_at', `${endDate}T23:59:59.999Z`);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate by product_id
  const aggregation: Record<string, FastMovingProduct> = {};

  data?.forEach(item => {
    const p = item.products;
    if (!p) return;
    
    // category filter
    if (categoryId && categoryId !== 'all' && p.category_id !== categoryId) return;

    if (!aggregation[p.id]) {
      aggregation[p.id] = {
        sku: p.sku || '-',
        name: p.name || item.product_name,
        category: p.product_categories?.name || 'Uncategorized',
        qty: 0,
        omzet: 0,
        hpp: 0,
        labaKotor: 0,
        margin: 0
      };
    }

    const qty = Number(item.quantity || 0);
    const price = Number(item.unit_price || 0);
    const buyPrice = Number(p.buy_price || 0);

    aggregation[p.id].qty += qty;
    aggregation[p.id].omzet += (qty * price);
    aggregation[p.id].hpp += (qty * buyPrice);
  });

  const result = Object.values(aggregation).map(ag => {
    ag.labaKotor = ag.omzet - ag.hpp;
    ag.margin = ag.omzet > 0 ? (ag.labaKotor / ag.omzet) * 100 : 0;
    return ag;
  });

  // Sort by qty descending
  result.sort((a, b) => b.qty - a.qty);
  
  // Assign ranks
  result.forEach((item, index) => {
    item.rank = index + 1;
  });

  return result;
};

export const getStockValuation = async (
  categoryId?: string, 
  stockStatus?: 'all' | 'low' | 'out'
): Promise<StockValuation> => {
  let query = supabase
    .from('products')
    .select(`
      *,
      product_categories (name)
    `)
    .eq('is_active', true);

  if (categoryId && categoryId !== 'all') {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;

  let totalValuasiAset = 0;
  let potensiPenjualan = 0;
  let kritisCount = 0;
  let items: any[] = [];

  data?.forEach(product => {
    const stock = Number(product.stock || 0);
    const minAlert = Number(product.min_stock_alert || 0);
    const buyPrice = Number(product.buy_price || 0);
    const sellPrice = Number(product.sell_price || 0);

    let status = 'aman';
    if (stock <= 0) status = 'habis';
    else if (stock <= minAlert) status = 'kritis';

    // Status filter
    if (stockStatus === 'low' && status === 'aman') return;
    if (stockStatus === 'out' && status !== 'habis') return;

    totalValuasiAset += (stock * buyPrice);
    potensiPenjualan += (stock * sellPrice);
    
    if (status === 'kritis' || status === 'habis') {
      kritisCount++;
    }

    items.push({
      ...product,
      categoryName: product.product_categories?.name || 'Uncategorized',
      status,
      valuasiAset: stock * buyPrice
    });
  });

  return {
    totalValuasiAset,
    potensiPenjualan,
    kritisCount,
    items
  };
};
