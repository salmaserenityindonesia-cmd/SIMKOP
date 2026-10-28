import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getEndOfDayReport, getFastMovingProducts, getStockValuation } from './retail-report.service';
import { supabase } from '../lib/supabaseClient';

vi.mock('../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
    },
  };
});

describe('Retail Report Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEndOfDayReport', () => {
    it('should aggregate sales by cash, deposit, credit, and enrich cashiers and members', async () => {
      const mockSales = [
        {
          id: 'sale-1',
          sale_number: 'POS-001',
          total_amount: 100000,
          discount: 5000,
          subtotal: 105000,
          paid_cash: 50000,
          paid_deposit: 30000,
          paid_credit: 20000,
          cashier_id: 'user-1',
          member_id: 'member-1',
          sale_status: 'completed',
          created_at: '2026-09-30T10:00:00.000Z',
        },
        {
          id: 'sale-2',
          sale_number: 'POS-002',
          total_amount: 50000,
          discount: 0,
          subtotal: 50000,
          paid_cash: 50000,
          paid_deposit: 0,
          paid_credit: 0,
          cashier_id: 'user-1',
          member_id: null,
          sale_status: 'completed',
          created_at: '2026-09-30T11:00:00.000Z',
        },
      ];

      const mockPengelola = [{ id: 'user-1', nama: 'Kasir Budi' }];
      const mockAnggota = [{ id: 'member-1', nrp: '12345', nama: 'Siti Aminah' }];

      const mockFrom = supabase.from as any;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'sales') {
          const chain: any = {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: mockSales, error: null }),
          };
          return chain;
        }
        if (table === 'pengelola') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockPengelola, error: null }),
            }),
          };
        }
        if (table === 'anggota') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockAnggota, error: null }),
            }),
          };
        }
        return {};
      });

      const report = await getEndOfDayReport('2026-09-30', '2026-09-30');

      expect(report.totalOmzet).toBe(150000);
      expect(report.totalDiscount).toBe(5000);
      expect(report.totalSubtotal).toBe(155000);
      expect(report.paidCash).toBe(100000);
      expect(report.paidDeposit).toBe(30000);
      expect(report.paidCredit).toBe(20000);
      expect(report.transactions).toHaveLength(2);
      expect(report.transactions[0].pengelola.nama).toBe('Kasir Budi');
      expect(report.transactions[0].anggota.nama).toBe('Siti Aminah');
      expect(report.transactions[1].anggota).toBeNull();
    });

    it('should return zero totals when no sales are found', async () => {
      const mockFrom = supabase.from as any;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [], error: null }),
          };
        }
        return {};
      });

      const report = await getEndOfDayReport('2026-09-30', '2026-09-30');

      expect(report.totalOmzet).toBe(0);
      expect(report.paidCash).toBe(0);
      expect(report.paidDeposit).toBe(0);
      expect(report.paidCredit).toBe(0);
      expect(report.transactions).toHaveLength(0);
    });
  });

  describe('getFastMovingProducts', () => {
    it('should aggregate sale items and calculate omzet, HPP, gross profit, and margin correctly', async () => {
      const mockSales = [{ id: 'sale-1' }, { id: 'sale-2' }];
      const mockSaleItems = [
        { sale_id: 'sale-1', product_id: 'prod-1', product_name: 'Beras 5kg', quantity: 2, unit_price: 65000 },
        { sale_id: 'sale-1', product_id: 'prod-2', product_name: 'Minyak Goreng 2L', quantity: 5, unit_price: 35000 },
        { sale_id: 'sale-2', product_id: 'prod-1', product_name: 'Beras 5kg', quantity: 3, unit_price: 65000 },
      ];
      const mockProducts = [
        { id: 'prod-1', sku: 'BRS-01', name: 'Beras 5kg', buy_price: 55000, sell_price: 65000, category_id: 'cat-sembako' },
        { id: 'prod-2', sku: 'MYK-02', name: 'Minyak Goreng 2L', buy_price: 30000, sell_price: 35000, category_id: 'cat-sembako' },
      ];
      const mockCategories = [{ id: 'cat-sembako', name: 'Sembako' }];

      const mockFrom = supabase.from as any;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'sales') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: mockSales, error: null }),
          };
        }
        if (table === 'sale_items') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockSaleItems, error: null }),
            }),
          };
        }
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockProducts, error: null }),
            }),
          };
        }
        if (table === 'product_categories') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
            }),
          };
        }
        return {};
      });

      const fastMoving = await getFastMovingProducts('2026-09-01', '2026-09-30');

      expect(fastMoving).toHaveLength(2);
      // Both had qty: prod-1 has 2+3=5, prod-2 has 5.
      // For prod-1: qty = 5, omzet = 5 * 65,000 = 325,000, hpp = 5 * 55,000 = 275,000, labaKotor = 50,000
      // Margin = (50,000 / 325,000) * 100 = 15.38%
      const beras = fastMoving.find(p => p.sku === 'BRS-01');
      expect(beras).toBeDefined();
      expect(beras?.qty).toBe(5);
      expect(beras?.omzet).toBe(325000);
      expect(beras?.hpp).toBe(275000);
      expect(beras?.labaKotor).toBe(50000);
      expect(beras?.margin).toBeCloseTo(15.38, 1);
      expect(beras?.category).toBe('Sembako');

      // For prod-2: qty = 5, omzet = 5 * 35,000 = 175,000, hpp = 5 * 30,000 = 150,000, labaKotor = 25,000
      // Margin = (25,000 / 175,000) * 100 = 14.28%
      const minyak = fastMoving.find(p => p.sku === 'MYK-02');
      expect(minyak).toBeDefined();
      expect(minyak?.qty).toBe(5);
      expect(minyak?.omzet).toBe(175000);
      expect(minyak?.hpp).toBe(150000);
      expect(minyak?.labaKotor).toBe(25000);
      expect(minyak?.margin).toBeCloseTo(14.28, 1);
    });
  });

  describe('getStockValuation', () => {
    it('should calculate total asset valuation (HPP), potential sales, and identify low/out of stock items', async () => {
      const mockProducts = [
        {
          id: 'p1',
          sku: 'SKU-001',
          name: 'Produk Normal',
          stock: 20,
          min_stock_alert: 5,
          buy_price: 10000,
          sell_price: 12000,
          unit: 'pcs',
          category_id: 'cat-1',
        },
        {
          id: 'p2',
          sku: 'SKU-002',
          name: 'Produk Kritis',
          stock: 3,
          min_stock_alert: 5,
          buy_price: 20000,
          sell_price: 25000,
          unit: 'pcs',
          category_id: 'cat-1',
        },
        {
          id: 'p3',
          sku: 'SKU-003',
          name: 'Produk Habis',
          stock: 0,
          min_stock_alert: 2,
          buy_price: 15000,
          sell_price: 18000,
          unit: 'pcs',
          category_id: 'cat-2',
        },
      ];
      const mockCategories = [
        { id: 'cat-1', name: 'Makanan' },
        { id: 'cat-2', name: 'Minuman' },
      ];

      const mockFrom = supabase.from as any;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'products') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: mockProducts, error: null }),
          };
        }
        if (table === 'product_categories') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: mockCategories, error: null }),
            }),
          };
        }
        return {};
      });

      const stock = await getStockValuation();

      // Total Valuasi Aset = (20*10000) + (3*20000) + (0*15000) = 200,000 + 60,000 + 0 = 260,000
      expect(stock.totalValuasiAset).toBe(260000);
      // Potensi Penjualan = (20*12000) + (3*25000) + (0*18000) = 240,000 + 75,000 + 0 = 315,000
      expect(stock.potensiPenjualan).toBe(315000);
      // Kritis count: p2 is 'kritis', p3 is 'habis' -> total 2
      expect(stock.kritisCount).toBe(2);
      expect(stock.items).toHaveLength(3);
      expect(stock.items[0].status).toBe('aman');
      expect(stock.items[1].status).toBe('kritis');
      expect(stock.items[2].status).toBe('habis');
    });
  });
});

