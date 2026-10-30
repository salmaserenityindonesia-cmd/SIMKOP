import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInventoryMutations,
  getProductStockLedger,
  getAllProductsForFilter,
  calculateKPISummary,
  parseDateBoundary,
  shouldFallback,
  setMockProducts,
  getMockProducts,
  setMockInventoryMutations,
  getMockInventoryMutations,
  resetInventoryMutationMockState,
  InventoryMutation,
  ProductOption,
} from './inventoryMutationService';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('inventoryMutationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetInventoryMutationMockState();
    // Default mock supabase.from returns null to trigger safe in-memory fallback
    (supabase.from as any).mockReturnValue(undefined);
  });

  describe('Utility & Helper Functions', () => {
    it('parseDateBoundary should handle YYYY-MM-DD and fallback dates', () => {
      const start = parseDateBoundary('2026-10-01', false);
      expect(start.toISOString()).toContain('2026-10-01');

      const end = parseDateBoundary('2026-10-31', true);
      expect(end.toISOString()).toContain('2026-10-31T23:59:59.999Z');

      const fallbackStart = parseDateBoundary(undefined, false);
      expect(fallbackStart.getUTCFullYear()).toBe(1970);

      const fallbackEnd = parseDateBoundary(undefined, true);
      expect(fallbackEnd.getUTCFullYear()).toBe(9999);
    });

    it('calculateKPISummary should accurately compute all KPI metrics', () => {
      const testItems: InventoryMutation[] = [
        {
          mutation_id: '1',
          mutation_date: '2026-10-01T08:00:00Z',
          product_id: 'p1',
          mutation_type: 'MASUK_PEMBELIAN',
          type_label: 'Restock Pembelian',
          reference_number: 'PO-001',
          qty_in: 20,
          qty_out: 0,
          unit_price: 10000,
          notes: 'Restock',
        },
        {
          mutation_id: '2',
          mutation_date: '2026-10-02T09:00:00Z',
          product_id: 'p1',
          mutation_type: 'KELUAR_PENJUALAN',
          type_label: 'Penjualan Kasir',
          reference_number: 'SL-001',
          qty_in: 0,
          qty_out: 5,
          unit_price: 15000,
          notes: 'Penjualan',
        },
        {
          mutation_id: '3',
          mutation_date: '2026-10-03T10:00:00Z',
          product_id: 'p1',
          mutation_type: 'KELUAR_RETUR',
          type_label: 'Retur ke Supplier',
          reference_number: 'RET-001',
          qty_in: 0,
          qty_out: 2,
          unit_price: 10000,
          notes: 'Retur rusak',
        },
      ];

      const kpi = calculateKPISummary(testItems);
      expect(kpi.totalMasuk).toBe(20);
      expect(kpi.totalKeluar).toBe(7);
      expect(kpi.netPerubahan).toBe(13); // 20 - 7
      expect(kpi.totalNilaiMasuk).toBe(200000); // 20 * 10000
      expect(kpi.totalNilaiKeluar).toBe(95000); // (5 * 15000) + (2 * 10000) = 75000 + 20000
      expect(kpi.totalTransaksi).toBe(3);
    });

    it('shouldFallback correctly recognizes database errors and schema cache faults', () => {
      expect(shouldFallback({ code: '42P01' })).toBe(true);
      expect(shouldFallback({ code: 'PGRST202' })).toBe(true);
      expect(shouldFallback({ message: 'relation "public.v_inventory_mutations" does not exist' })).toBe(true);
      expect(shouldFallback({ message: 'Failed to fetch' })).toBe(true);
      expect(shouldFallback(null)).toBe(false);
      expect(shouldFallback(undefined)).toBe(false);
      expect(shouldFallback({ code: '23505', message: 'duplicate key' })).toBe(false);
    });

    it('manages mock store via getter, setter, and reset', () => {
      const customProducts: ProductOption[] = [
        { id: 'custom-p1', name: 'Barang Tes Khusus', sku: 'TST-01', stock: 100, unit: 'pcs' },
      ];
      setMockProducts(customProducts);
      expect(getMockProducts()).toHaveLength(1);
      expect(getMockProducts()[0].name).toBe('Barang Tes Khusus');

      const customMutations: InventoryMutation[] = [
        {
          mutation_id: 'custom-m1',
          mutation_date: '2026-10-01T00:00:00Z',
          product_id: 'custom-p1',
          mutation_type: 'MASUK_PEMBELIAN',
          type_label: 'Restock Pembelian',
          reference_number: 'PO-CUSTOM',
          qty_in: 50,
          qty_out: 0,
          unit_price: 1000,
          notes: 'Custom mock',
        },
      ];
      setMockInventoryMutations(customMutations);
      expect(getMockInventoryMutations()).toHaveLength(1);

      resetInventoryMutationMockState();
      expect(getMockProducts().length).toBeGreaterThan(1);
      expect(getMockInventoryMutations().length).toBeGreaterThan(1);
    });
  });

  describe('getInventoryMutations', () => {
    it('should return mutations and calculate KPI accurately for default date range', async () => {
      const result = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(result.mutations.length).toBeGreaterThan(0);
      expect(result.kpi.totalTransaksi).toBe(result.mutations.length);
      expect(result.kpi.totalMasuk).toBeGreaterThan(0);
      expect(result.kpi.totalKeluar).toBeGreaterThan(0);
      expect(result.kpi.netPerubahan).toBe(result.kpi.totalMasuk - result.kpi.totalKeluar);
      expect(result.kpi.totalNilaiMasuk).toBeGreaterThan(0);
      expect(result.kpi.totalNilaiKeluar).toBeGreaterThan(0);
    });

    it('should filter correctly by mutationType', async () => {
      const salesResult = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        mutationType: 'KELUAR_PENJUALAN',
      });

      expect(salesResult.mutations.length).toBeGreaterThan(0);
      salesResult.mutations.forEach(m => {
        expect(m.mutation_type).toBe('KELUAR_PENJUALAN');
        expect(m.qty_in).toBe(0);
        expect(m.qty_out).toBeGreaterThan(0);
      });
      expect(salesResult.kpi.totalMasuk).toBe(0);
      expect(salesResult.kpi.totalKeluar).toBeGreaterThan(0);
      expect(salesResult.kpi.netPerubahan).toBe(-salesResult.kpi.totalKeluar);

      const purchaseResult = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        mutationType: 'MASUK_PEMBELIAN',
      });

      expect(purchaseResult.mutations.length).toBeGreaterThan(0);
      purchaseResult.mutations.forEach(m => {
        expect(m.mutation_type).toBe('MASUK_PEMBELIAN');
        expect(m.qty_out).toBe(0);
        expect(m.qty_in).toBeGreaterThan(0);
      });
      expect(purchaseResult.kpi.totalKeluar).toBe(0);
      expect(purchaseResult.kpi.totalMasuk).toBeGreaterThan(0);
    });

    it('should filter correctly by productId', async () => {
      const result = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        productId: 'prod-1',
      });

      expect(result.mutations.length).toBeGreaterThan(0);
      result.mutations.forEach(m => {
        expect(m.product_id).toBe('prod-1');
        expect(m.product_name).toBe('Beras Premium 5kg');
        expect(m.balance_after).toBeDefined();
      });
    });

    it('should filter correctly by search text keyword', async () => {
      const result = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        search: 'PO-202610-001',
      });

      expect(result.mutations.length).toBe(1);
      expect(result.mutations[0].reference_number).toBe('PO-202610-001');
      expect(result.kpi.totalTransaksi).toBe(1);
    });

    it('should return empty list and zeroed KPI when date range has no transactions', async () => {
      const result = await getInventoryMutations({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      expect(result.mutations).toHaveLength(0);
      expect(result.kpi).toEqual({
        totalMasuk: 0,
        totalKeluar: 0,
        netPerubahan: 0,
        totalNilaiMasuk: 0,
        totalNilaiKeluar: 0,
        totalTransaksi: 0,
      });
    });
  });

  describe('getProductStockLedger', () => {
    it('should calculate initialBalance and sequential balance_after with mathematical rigor', async () => {
      // Siapkan mutasi uji teratur untuk prod-test:
      // Saldo awal sebelum periode (2026-09-15): Masuk 100
      // Periode uji: 2026-10-01 s/d 2026-10-31
      // Transaksi 1: 2026-10-05, Keluar 20 -> Saldo: 100 - 20 = 80
      // Transaksi 2: 2026-10-10, Masuk 50  -> Saldo: 80 + 50 = 130
      // Transaksi 3: 2026-10-15, Keluar 10 -> Saldo: 130 - 10 = 120
      // Transaksi 4: 2026-10-20, Masuk 5   -> Saldo: 120 + 5 = 125
      const testProduct: ProductOption = {
        id: 'prod-test-ledger',
        name: 'Gula Aren Kristal 1kg',
        sku: 'GLA-AREN',
        unit: 'pouch',
        stock: 125,
      };

      const testMutations: InventoryMutation[] = [
        {
          mutation_id: 't-0',
          mutation_date: '2026-09-15T08:00:00.000Z',
          product_id: 'prod-test-ledger',
          mutation_type: 'MASUK_PEMBELIAN',
          type_label: 'Restock Pembelian',
          reference_number: 'PO-SEP-001',
          qty_in: 100,
          qty_out: 0,
          unit_price: 25000,
          notes: 'Stok awal September',
        },
        {
          mutation_id: 't-1',
          mutation_date: '2026-10-05T10:00:00.000Z',
          product_id: 'prod-test-ledger',
          mutation_type: 'KELUAR_PENJUALAN',
          type_label: 'Penjualan Kasir',
          reference_number: 'SL-OCT-001',
          qty_in: 0,
          qty_out: 20,
          unit_price: 30000,
          notes: 'Penjualan retail',
        },
        {
          mutation_id: 't-2',
          mutation_date: '2026-10-10T11:00:00.000Z',
          product_id: 'prod-test-ledger',
          mutation_type: 'MASUK_PEMBELIAN',
          type_label: 'Restock Pembelian',
          reference_number: 'PO-OCT-002',
          qty_in: 50,
          qty_out: 0,
          unit_price: 25000,
          notes: 'Restock tambahan',
        },
        {
          mutation_id: 't-3',
          mutation_date: '2026-10-15T14:30:00.000Z',
          product_id: 'prod-test-ledger',
          mutation_type: 'KELUAR_RETUR',
          type_label: 'Retur ke Supplier',
          reference_number: 'RET-OCT-003',
          qty_in: 0,
          qty_out: 10,
          unit_price: 25000,
          notes: 'Retur rusak',
        },
        {
          mutation_id: 't-4',
          mutation_date: '2026-10-20T16:00:00.000Z',
          product_id: 'prod-test-ledger',
          mutation_type: 'MASUK_KLAIM_PENGGANTI',
          type_label: 'Penerimaan Klaim Pengganti',
          reference_number: 'RET-OCT-003',
          qty_in: 5,
          qty_out: 0,
          unit_price: 25000,
          notes: 'Penggantian retur',
        },
      ];

      setMockProducts([testProduct]);
      setMockInventoryMutations(testMutations);

      const ledger = await getProductStockLedger('prod-test-ledger', '2026-10-01', '2026-10-31');

      // Verifikasi identitas produk
      expect(ledger.productId).toBe('prod-test-ledger');
      expect(ledger.productName).toBe('Gula Aren Kristal 1kg');
      expect(ledger.sku).toBe('GLA-AREN');
      expect(ledger.unit).toBe('pouch');

      // Verifikasi Saldo Awal (sebelum 1 Okt = mutasi September = 100)
      expect(ledger.initialBalance).toBe(100);

      // Verifikasi Jumlah Baris Mutasi Periode Oktober (4 transaksi)
      expect(ledger.mutations).toHaveLength(4);

      // Verifikasi Setiap Baris Running Balance (balance_after)
      expect(ledger.mutations[0].balance_after).toBe(80);   // 100 - 20
      expect(ledger.mutations[1].balance_after).toBe(130);  // 80 + 50
      expect(ledger.mutations[2].balance_after).toBe(120);  // 130 - 10
      expect(ledger.mutations[3].balance_after).toBe(125);  // 120 + 5

      // Verifikasi Saldo Akhir
      expect(ledger.finalBalance).toBe(125);

      // Verifikasi Hukum Konsistensi Akuntansi:
      // finalBalance === initialBalance + totalMasuk - totalKeluar
      expect(ledger.kpi.totalMasuk).toBe(55); // 50 + 5
      expect(ledger.kpi.totalKeluar).toBe(30); // 20 + 10
      expect(ledger.kpi.netPerubahan).toBe(25); // 55 - 30
      expect(ledger.finalBalance).toBe(ledger.initialBalance + ledger.kpi.totalMasuk - ledger.kpi.totalKeluar);
    });

    it('should respect initialBalanceOverride parameter if provided', async () => {
      const ledger = await getProductStockLedger('prod-1', '2026-10-01', '2026-10-31', 200);

      expect(ledger.initialBalance).toBe(200);
      expect(ledger.mutations[0].balance_after).toBe(200 + ledger.mutations[0].qty_in - ledger.mutations[0].qty_out);
      expect(ledger.finalBalance).toBe(ledger.initialBalance + ledger.kpi.totalMasuk - ledger.kpi.totalKeluar);
    });

    it('should handle product with no mutations in date range gracefully', async () => {
      const ledger = await getProductStockLedger('prod-1', '2024-01-01', '2024-01-31');

      expect(ledger.mutations).toHaveLength(0);
      expect(ledger.initialBalance).toBe(0);
      expect(ledger.finalBalance).toBe(0);
      expect(ledger.kpi.totalTransaksi).toBe(0);
    });
  });

  describe('getAllProductsForFilter', () => {
    it('should return all products mapped with stock and sku for filter dropdown', async () => {
      const products = await getAllProductsForFilter();
      expect(products.length).toBeGreaterThan(0);
      expect(products[0]).toHaveProperty('id');
      expect(products[0]).toHaveProperty('name');
      expect(products[0]).toHaveProperty('stock');
    });
  });

  describe('Supabase Database Integration & Fallback Handling', () => {
    it('should fetch from supabase v_inventory_mutations when database is online', async () => {
      const mockDbMutations = [
        {
          mutation_id: 'db-1',
          mutation_date: '2026-10-02T10:00:00.000Z',
          product_id: 'p-online',
          mutation_type: 'MASUK_PEMBELIAN',
          type_label: 'Restock Pembelian',
          reference_number: 'PO-DB-001',
          qty_in: 25,
          qty_out: 0,
          unit_price: 50000,
          notes: 'Restock dari database Supabase',
        },
      ];

      const mockDbProducts = [
        { id: 'p-online', name: 'Kopi Arabika 1kg', sku: 'KOP-ARB', unit: 'kg', stock: 25 },
      ];

      (supabase.from as any).mockImplementation((tableName: string) => {
        if (tableName === 'v_inventory_mutations') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockDbMutations, error: null }),
          };
        }
        if (tableName === 'products') {
          return {
            select: vi.fn().mockResolvedValue({ data: mockDbProducts, error: null }),
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      });

      const res = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(res.mutations).toHaveLength(1);
      expect(res.mutations[0].reference_number).toBe('PO-DB-001');
      expect(res.mutations[0].product_name).toBe('Kopi Arabika 1kg');
      expect(res.kpi.totalMasuk).toBe(25);
    });

    it('should smoothly fallback to mock data when supabase returns schema cache error', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '42P01', message: 'relation "public.v_inventory_mutations" does not exist' },
        }),
      });

      const res = await getInventoryMutations({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(res.mutations.length).toBeGreaterThan(0);
      expect(res.kpi.totalTransaksi).toBe(res.mutations.length);
    });
  });
});
