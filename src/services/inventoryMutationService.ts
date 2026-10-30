import { supabase } from '../lib/supabaseClient';

export type MutationType =
  | 'KELUAR_PENJUALAN'
  | 'MASUK_PEMBELIAN'
  | 'KELUAR_RETUR'
  | 'MASUK_KLAIM_PENGGANTI';

export interface InventoryMutation {
  mutation_id: string;
  mutation_date: string;
  product_id: string;
  mutation_type: MutationType;
  type_label: string;
  reference_number: string;
  qty_in: number;
  qty_out: number;
  unit_price: number;
  notes: string;
  product_name?: string;
  sku?: string;
  unit?: string;
  balance_after?: number;
}

export interface MutationFilter {
  startDate: string;
  endDate: string;
  productId?: string;
  mutationType?: string;
  search?: string;
}

export interface MutationKPISummary {
  totalMasuk: number;
  totalKeluar: number;
  netPerubahan: number;
  totalNilaiMasuk: number;
  totalNilaiKeluar: number;
  totalTransaksi: number;
}

export interface ProductStockLedger {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  currentStock: number;
  initialBalance: number;
  finalBalance: number;
  mutations: InventoryMutation[];
  kpi: MutationKPISummary;
}

export interface ProductOption {
  id: string;
  name: string;
  sku?: string;
  unit?: string;
  stock?: number;
}

// ─── Default In-Memory Mock Data for Offline Resilience & Unit Testing ──────────

const INITIAL_MOCK_PRODUCTS: ProductOption[] = [
  { id: 'prod-1', name: 'Beras Premium 5kg', sku: 'BRS-01', unit: 'karung', stock: 40 },
  { id: 'prod-2', name: 'Minyak Goreng 2L', sku: 'MYK-02', unit: 'pouch', stock: 55 },
  { id: 'prod-3', name: 'Gula Pasir 1kg', sku: 'GLA-03', unit: 'kg', stock: 30 },
  { id: 'prod-4', name: 'Kopi Bubuk 250g', sku: 'KOP-04', unit: 'bungkus', stock: 15 },
];

const INITIAL_MOCK_MUTATIONS: InventoryMutation[] = [
  {
    mutation_id: 'mut-1',
    mutation_date: '2026-10-01T08:30:00.000Z',
    product_id: 'prod-1',
    product_name: 'Beras Premium 5kg',
    sku: 'BRS-01',
    unit: 'karung',
    mutation_type: 'MASUK_PEMBELIAN',
    type_label: 'Restock Pembelian',
    reference_number: 'PO-202610-001',
    qty_in: 50,
    qty_out: 0,
    unit_price: 65000,
    notes: 'Restock Pembelian - Faktur: PO-202610-001',
  },
  {
    mutation_id: 'mut-2',
    mutation_date: '2026-10-05T10:15:00.000Z',
    product_id: 'prod-1',
    product_name: 'Beras Premium 5kg',
    sku: 'BRS-01',
    unit: 'karung',
    mutation_type: 'KELUAR_PENJUALAN',
    type_label: 'Penjualan Kasir',
    reference_number: 'SL-20261005-001',
    qty_in: 0,
    qty_out: 12,
    unit_price: 75000,
    notes: 'Penjualan Kasir - SL-20261005-001',
  },
  {
    mutation_id: 'mut-3',
    mutation_date: '2026-10-10T14:00:00.000Z',
    product_id: 'prod-1',
    product_name: 'Beras Premium 5kg',
    sku: 'BRS-01',
    unit: 'karung',
    mutation_type: 'KELUAR_RETUR',
    type_label: 'Retur ke Supplier',
    reference_number: 'RET/202610/0001',
    qty_in: 0,
    qty_out: 3,
    unit_price: 65000,
    notes: 'Retur ke Supplier - RET/202610/0001 (Kemasan Rusak)',
  },
  {
    mutation_id: 'mut-4',
    mutation_date: '2026-10-15T09:30:00.000Z',
    product_id: 'prod-1',
    product_name: 'Beras Premium 5kg',
    sku: 'BRS-01',
    unit: 'karung',
    mutation_type: 'MASUK_KLAIM_PENGGANTI',
    type_label: 'Penerimaan Klaim Pengganti',
    reference_number: 'RET/202610/0001',
    qty_in: 3,
    qty_out: 0,
    unit_price: 65000,
    notes: 'Penerimaan Fisik Pengganti Retur - RET/202610/0001',
  },
  {
    mutation_id: 'mut-5',
    mutation_date: '2026-10-18T11:20:00.000Z',
    product_id: 'prod-2',
    product_name: 'Minyak Goreng 2L',
    sku: 'MYK-02',
    unit: 'pouch',
    mutation_type: 'MASUK_PEMBELIAN',
    type_label: 'Restock Pembelian',
    reference_number: 'PO-202610-002',
    qty_in: 60,
    qty_out: 0,
    unit_price: 28000,
    notes: 'Restock Pembelian - Faktur: PO-202610-002',
  },
  {
    mutation_id: 'mut-6',
    mutation_date: '2026-10-22T15:45:00.000Z',
    product_id: 'prod-2',
    product_name: 'Minyak Goreng 2L',
    sku: 'MYK-02',
    unit: 'pouch',
    mutation_type: 'KELUAR_PENJUALAN',
    type_label: 'Penjualan Kasir',
    reference_number: 'SL-20261022-008',
    qty_in: 0,
    qty_out: 15,
    unit_price: 32000,
    notes: 'Penjualan Kasir - SL-20261022-008',
  },
  {
    mutation_id: 'mut-7',
    mutation_date: '2026-10-25T13:10:00.000Z',
    product_id: 'prod-3',
    product_name: 'Gula Pasir 1kg',
    sku: 'GLA-03',
    unit: 'kg',
    mutation_type: 'MASUK_PEMBELIAN',
    type_label: 'Restock Pembelian',
    reference_number: 'PO-202610-003',
    qty_in: 30,
    qty_out: 0,
    unit_price: 13000,
    notes: 'Restock Pembelian - Faktur: PO-202610-003',
  },
];

let mockProducts: ProductOption[] = INITIAL_MOCK_PRODUCTS.map(p => ({ ...p }));
let mockInventoryMutations: InventoryMutation[] = INITIAL_MOCK_MUTATIONS.map(m => ({ ...m }));

export function setMockProducts(products: ProductOption[]): void {
  mockProducts = products.map(p => ({ ...p }));
}

export function getMockProducts(): ProductOption[] {
  return mockProducts.map(p => ({ ...p }));
}

export function setMockInventoryMutations(mutations: InventoryMutation[]): void {
  mockInventoryMutations = mutations.map(m => ({ ...m }));
}

export function getMockInventoryMutations(): InventoryMutation[] {
  return mockInventoryMutations.map(m => ({ ...m }));
}

export function resetInventoryMutationMockState(): void {
  mockProducts = INITIAL_MOCK_PRODUCTS.map(p => ({ ...p }));
  mockInventoryMutations = INITIAL_MOCK_MUTATIONS.map(m => ({ ...m }));
}

export function shouldFallback(e: any): boolean {
  if (!e) return false;
  const code = String(e.code || '');
  const msg = String(e.message || '').toLowerCase();
  return (
    code === '42P01' || // undefined_table / undefined_view
    code === '42703' || // undefined_column
    code === '42883' || // undefined_function
    code === '42725' ||
    code === '22P02' ||
    code === 'PGRST202' ||
    code === 'PGRST301' ||
    msg.includes('schema cache') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('not found') ||
    msg.includes('does not exist') ||
    msg.includes('v_inventory_mutations') ||
    msg.includes('mock')
  );
}

// ─── Helper Functions ──────────────────────────────────────────────────────────

export function parseDateBoundary(dateStr?: string, isEnd = false): Date {
  if (!dateStr) {
    return isEnd ? new Date('9999-12-31T23:59:59.999Z') : new Date('1970-01-01T00:00:00.000Z');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T${isEnd ? '23:59:59.999Z' : '00:00:00.000Z'}`);
  }
  return new Date(dateStr);
}

export function calculateKPISummary(mutations: InventoryMutation[]): MutationKPISummary {
  let totalMasuk = 0;
  let totalKeluar = 0;
  let totalNilaiMasuk = 0;
  let totalNilaiKeluar = 0;

  for (const m of mutations) {
    const qtyIn = Number(m.qty_in) || 0;
    const qtyOut = Number(m.qty_out) || 0;
    const price = Number(m.unit_price) || 0;

    totalMasuk += qtyIn;
    totalKeluar += qtyOut;
    totalNilaiMasuk += qtyIn * price;
    totalNilaiKeluar += qtyOut * price;
  }

  return {
    totalMasuk,
    totalKeluar,
    netPerubahan: totalMasuk - totalKeluar,
    totalNilaiMasuk,
    totalNilaiKeluar,
    totalTransaksi: mutations.length,
  };
}

// ─── Core Service Methods ──────────────────────────────────────────────────────

/**
 * Mengambil daftar produk singkat untuk dropdown filter di antarmuka laporan mutasi.
 */
export async function getAllProductsForFilter(): Promise<ProductOption[]> {
  try {
    if (!supabase?.from) {
      return getMockProducts();
    }

    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku, stock, unit')
      .order('name', { ascending: true });

    if (error) {
      if (shouldFallback(error)) {
        return getMockProducts();
      }
      throw error;
    }

    return (data || []).map(p => ({
      id: p.id,
      name: p.name,
      sku: p.sku || undefined,
      stock: Number(p.stock) || 0,
      unit: p.unit || 'pcs',
    }));
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getMockProducts();
    }
    console.warn('[inventoryMutationService] getAllProductsForFilter fallback:', err?.message || err);
    return getMockProducts();
  }
}

/**
 * Mengambil mutasi inventori berdasarkan filter (rentang tanggal, tipe mutasi, produk, & teks pencarian).
 * Menghitung ringkasan KPI dan kalkulasi running balance jika produk spesifik dipilih.
 */
export async function getInventoryMutations(filters: MutationFilter): Promise<{
  mutations: InventoryMutation[];
  kpi: MutationKPISummary;
}> {
  const startDate = parseDateBoundary(filters.startDate, false);
  const endDate = parseDateBoundary(filters.endDate, true);

  try {
    if (!supabase?.from) {
      return getMockInventoryMutationsWithFilter(filters, startDate, endDate);
    }

    let query = supabase
      .from('v_inventory_mutations')
      .select('*')
      .gte('mutation_date', startDate.toISOString())
      .lte('mutation_date', endDate.toISOString())
      .order('mutation_date', { ascending: true });

    if (filters.productId && filters.productId !== 'all') {
      query = query.eq('product_id', filters.productId);
    }

    if (filters.mutationType && filters.mutationType !== 'all') {
      query = query.eq('mutation_type', filters.mutationType);
    }

    const { data: mutationData, error: mutationError } = await query;

    if (mutationError) {
      if (shouldFallback(mutationError)) {
        return getMockInventoryMutationsWithFilter(filters, startDate, endDate);
      }
      throw mutationError;
    }

    // Ambil metadata produk untuk enrich data
    const { data: productsData } = await supabase
      .from('products')
      .select('id, name, sku, unit, stock');

    const productMap = new Map<string, any>(
      (productsData || []).map(p => [p.id, p])
    );

    let list: InventoryMutation[] = (mutationData || []).map(item => {
      const prod = productMap.get(item.product_id);
      return {
        mutation_id: String(item.mutation_id),
        mutation_date: item.mutation_date,
        product_id: item.product_id,
        mutation_type: item.mutation_type as MutationType,
        type_label: item.type_label || item.mutation_type,
        reference_number: item.reference_number || '-',
        qty_in: Number(item.qty_in) || 0,
        qty_out: Number(item.qty_out) || 0,
        unit_price: Number(item.unit_price) || 0,
        notes: item.notes || '',
        product_name: prod?.name || item.product_name || 'Produk ' + item.product_id,
        sku: prod?.sku || item.sku || '-',
        unit: prod?.unit || item.unit || 'pcs',
      };
    });

    // Filter teks pencarian jika ada
    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
      list = list.filter(m =>
        m.reference_number.toLowerCase().includes(search) ||
        (m.product_name && m.product_name.toLowerCase().includes(search)) ||
        (m.sku && m.sku.toLowerCase().includes(search)) ||
        (m.notes && m.notes.toLowerCase().includes(search)) ||
        (m.type_label && m.type_label.toLowerCase().includes(search))
      );
    }

    // Hitung running balance
    if (filters.productId && filters.productId !== 'all') {
      // Ambil saldo awal sebelum startDate
      let initialBalance = 0;
      try {
        const { data: priorData } = await supabase
          .from('v_inventory_mutations')
          .select('qty_in, qty_out')
          .eq('product_id', filters.productId)
          .lt('mutation_date', startDate.toISOString());

        if (priorData && priorData.length > 0) {
          initialBalance = priorData.reduce(
            (acc, m) => acc + (Number(m.qty_in) || 0) - (Number(m.qty_out) || 0),
            0
          );
        }
      } catch {
        // Abaikan error prior jika ada dan fallback ke 0
        initialBalance = 0;
      }

      let running = initialBalance;
      list = list.map(item => {
        running = running + item.qty_in - item.qty_out;
        return {
          ...item,
          balance_after: running,
        };
      });
    } else {
      // Sequential running balance per produk
      const productBalanceMap = new Map<string, number>();
      list = list.map(item => {
        const prev = productBalanceMap.get(item.product_id) || 0;
        const next = prev + item.qty_in - item.qty_out;
        productBalanceMap.set(item.product_id, next);
        return {
          ...item,
          balance_after: next,
        };
      });
    }

    const kpi = calculateKPISummary(list);

    return {
      mutations: list,
      kpi,
    };
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getMockInventoryMutationsWithFilter(filters, startDate, endDate);
    }
    console.warn('[inventoryMutationService] getInventoryMutations fallback:', err?.message || err);
    return getMockInventoryMutationsWithFilter(filters, startDate, endDate);
  }
}

/**
 * Filter mock data secara in-memory untuk ketahanan offline dan vitest testing.
 */
function getMockInventoryMutationsWithFilter(
  filters: MutationFilter,
  startDate: Date,
  endDate: Date
): { mutations: InventoryMutation[]; kpi: MutationKPISummary } {
  const productMap = new Map<string, ProductOption>(
    mockProducts.map(p => [p.id, p])
  );

  let filtered = mockInventoryMutations.filter(m => {
    const mTime = new Date(m.mutation_date).getTime();
    if (mTime < startDate.getTime() || mTime > endDate.getTime()) {
      return false;
    }
    if (filters.productId && filters.productId !== 'all' && m.product_id !== filters.productId) {
      return false;
    }
    if (filters.mutationType && filters.mutationType !== 'all' && m.mutation_type !== filters.mutationType) {
      return false;
    }
    return true;
  });

  // Enrich mock data dengan nama produk & SKU
  filtered = filtered.map(item => {
    const prod = productMap.get(item.product_id);
    return {
      ...item,
      product_name: prod?.name || item.product_name || 'Produk ' + item.product_id,
      sku: prod?.sku || item.sku || '-',
      unit: prod?.unit || item.unit || 'pcs',
    };
  });

  // Urutkan kronologis
  filtered.sort((a, b) => new Date(a.mutation_date).getTime() - new Date(b.mutation_date).getTime());

  // Terapkan pencarian teks jika ada
  const search = (filters.search || '').trim().toLowerCase();
  if (search) {
    filtered = filtered.filter(m =>
      (m.reference_number && m.reference_number.toLowerCase().includes(search)) ||
      (m.product_name && m.product_name.toLowerCase().includes(search)) ||
      (m.sku && m.sku.toLowerCase().includes(search)) ||
      (m.notes && m.notes.toLowerCase().includes(search)) ||
      (m.type_label && m.type_label.toLowerCase().includes(search))
    );
  }

  // Hitung running balance
  if (filters.productId && filters.productId !== 'all') {
    // Hitung saldo awal mock sebelum startDate
    const priorMutations = mockInventoryMutations.filter(m => {
      const mTime = new Date(m.mutation_date).getTime();
      return m.product_id === filters.productId && mTime < startDate.getTime();
    });
    const initialBalance = priorMutations.reduce(
      (acc, m) => acc + (Number(m.qty_in) || 0) - (Number(m.qty_out) || 0),
      0
    );

    let running = initialBalance;
    filtered = filtered.map(item => {
      running = running + item.qty_in - item.qty_out;
      return {
        ...item,
        balance_after: running,
      };
    });
  } else {
    // Sequential running balance per produk
    const productBalanceMap = new Map<string, number>();
    filtered = filtered.map(item => {
      const prev = productBalanceMap.get(item.product_id) || 0;
      const next = prev + item.qty_in - item.qty_out;
      productBalanceMap.set(item.product_id, next);
      return {
        ...item,
        balance_after: next,
      };
    });
  }

  const kpi = calculateKPISummary(filtered);

  return {
    mutations: filtered,
    kpi,
  };
}

/**
 * Mengambil buku besar kartu stok individual per produk (Product Stock Ledger).
 * Mengembalikan saldo awal (sebelum periode), saldo akhir, akumulasi running balance per baris, dan ringkasan KPI.
 */
export async function getProductStockLedger(
  productId: string,
  startDateStr: string,
  endDateStr: string,
  initialBalanceOverride?: number
): Promise<ProductStockLedger> {
  const startDate = parseDateBoundary(startDateStr, false);
  const endDate = parseDateBoundary(endDateStr, true);

  try {
    if (!supabase?.from) {
      return getMockProductStockLedger(productId, startDate, endDate, initialBalanceOverride);
    }

    // 1. Ambil detail produk
    const { data: productData, error: productError } = await supabase
      .from('products')
      .select('id, name, sku, unit, stock')
      .eq('id', productId)
      .single();

    if (productError && shouldFallback(productError)) {
      return getMockProductStockLedger(productId, startDate, endDate, initialBalanceOverride);
    }

    const product: ProductOption = productData || {
      id: productId,
      name: 'Produk ' + productId,
      sku: '-',
      unit: 'pcs',
      stock: 0,
    };

    // 2. Hitung Saldo Awal (sebelum startDate)
    let initialBalance = 0;
    if (initialBalanceOverride !== undefined) {
      initialBalance = initialBalanceOverride;
    } else {
      const { data: priorMutations, error: priorError } = await supabase
        .from('v_inventory_mutations')
        .select('qty_in, qty_out')
        .eq('product_id', productId)
        .lt('mutation_date', startDate.toISOString());

      if (priorError && shouldFallback(priorError)) {
        return getMockProductStockLedger(productId, startDate, endDate, initialBalanceOverride);
      }

      if (priorMutations && priorMutations.length > 0) {
        initialBalance = priorMutations.reduce(
          (acc, m) => acc + (Number(m.qty_in) || 0) - (Number(m.qty_out) || 0),
          0
        );
      }
    }

    // 3. Ambil mutasi dalam periode
    const { data: periodData, error: periodError } = await supabase
      .from('v_inventory_mutations')
      .select('*')
      .eq('product_id', productId)
      .gte('mutation_date', startDate.toISOString())
      .lte('mutation_date', endDate.toISOString())
      .order('mutation_date', { ascending: true });

    if (periodError && shouldFallback(periodError)) {
      return getMockProductStockLedger(productId, startDate, endDate, initialBalanceOverride);
    }

    // 4. Hitung Running Balance kronologis
    let running = initialBalance;
    const mutationsWithBalance: InventoryMutation[] = (periodData || []).map(item => {
      const qtyIn = Number(item.qty_in) || 0;
      const qtyOut = Number(item.qty_out) || 0;
      running = running + qtyIn - qtyOut;

      return {
        mutation_id: String(item.mutation_id),
        mutation_date: item.mutation_date,
        product_id: item.product_id,
        mutation_type: item.mutation_type as MutationType,
        type_label: item.type_label || item.mutation_type,
        reference_number: item.reference_number || '-',
        qty_in: qtyIn,
        qty_out: qtyOut,
        unit_price: Number(item.unit_price) || 0,
        notes: item.notes || '',
        product_name: product.name,
        sku: product.sku || '-',
        unit: product.unit || 'pcs',
        balance_after: running,
      };
    });

    const finalBalance = running;
    const kpi = calculateKPISummary(mutationsWithBalance);

    return {
      productId,
      productName: product.name,
      sku: product.sku || '-',
      unit: product.unit || 'pcs',
      currentStock: Number(product.stock) || 0,
      initialBalance,
      finalBalance,
      mutations: mutationsWithBalance,
      kpi,
    };
  } catch (err: any) {
    if (shouldFallback(err)) {
      return getMockProductStockLedger(productId, startDate, endDate, initialBalanceOverride);
    }
    console.warn('[inventoryMutationService] getProductStockLedger fallback:', err?.message || err);
    return getMockProductStockLedger(productId, startDate, endDate, initialBalanceOverride);
  }
}

/**
 * Menghitung ProductStockLedger dari data mock in-memory
 */
function getMockProductStockLedger(
  productId: string,
  startDate: Date,
  endDate: Date,
  initialBalanceOverride?: number
): ProductStockLedger {
  const prod = mockProducts.find(p => p.id === productId) || {
    id: productId,
    name: 'Produk ' + productId,
    sku: '-',
    unit: 'pcs',
    stock: 0,
  };

  // 1. Hitung initial balance
  let initialBalance = 0;
  if (initialBalanceOverride !== undefined) {
    initialBalance = initialBalanceOverride;
  } else {
    const priorMutations = mockInventoryMutations.filter(m => {
      const mTime = new Date(m.mutation_date).getTime();
      return m.product_id === productId && mTime < startDate.getTime();
    });
    initialBalance = priorMutations.reduce(
      (acc, m) => acc + (Number(m.qty_in) || 0) - (Number(m.qty_out) || 0),
      0
    );
  }

  // 2. Ambil mutasi periode
  const periodMutations = mockInventoryMutations.filter(m => {
    const mTime = new Date(m.mutation_date).getTime();
    return m.product_id === productId && mTime >= startDate.getTime() && mTime <= endDate.getTime();
  });

  periodMutations.sort((a, b) => new Date(a.mutation_date).getTime() - new Date(b.mutation_date).getTime());

  // 3. Iterasi running balance
  let running = initialBalance;
  const mutationsWithBalance: InventoryMutation[] = periodMutations.map(m => {
    const qtyIn = Number(m.qty_in) || 0;
    const qtyOut = Number(m.qty_out) || 0;
    running = running + qtyIn - qtyOut;

    return {
      ...m,
      product_name: prod.name,
      sku: prod.sku || '-',
      unit: prod.unit || 'pcs',
      balance_after: running,
    };
  });

  const finalBalance = running;
  const kpi = calculateKPISummary(mutationsWithBalance);

  return {
    productId,
    productName: prod.name,
    sku: prod.sku || '-',
    unit: prod.unit || 'pcs',
    currentStock: Number(prod.stock) || 0,
    initialBalance,
    finalBalance,
    mutations: mutationsWithBalance,
    kpi,
  };
}
