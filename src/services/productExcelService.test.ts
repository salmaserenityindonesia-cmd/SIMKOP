import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ExcelJS from 'exceljs';
import { exportProductTemplate, parseProductUpload, batchUpsertProducts } from './productExcelService';
import { getProduk } from './koperasiService';
import { supabase } from '../lib/supabaseClient';

vi.mock('./koperasiService', () => ({
  getProduk: vi.fn(),
}));

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('productExcelService', () => {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('exportProductTemplate', () => {
    it('should generate template Excel with exactly 7 standard columns without category column', async () => {
      let createdBlob: Blob | null = null;
      const mockClick = vi.fn();
      const mockAnchor = { href: '', download: '', click: mockClick };
      const mockCreateElement = vi.fn().mockImplementation((tag: string) => {
        if (tag === 'a') return mockAnchor;
        return {};
      });
      const mockRevokeObjectURL = vi.fn();
      const mockCreateObjectURL = vi.fn().mockImplementation((blob: Blob) => {
        createdBlob = blob;
        return 'blob:mock-template-url';
      });

      (globalThis as any).document = {
        createElement: mockCreateElement,
      };
      (globalThis as any).window = {
        URL: {
          createObjectURL: mockCreateObjectURL,
          revokeObjectURL: mockRevokeObjectURL,
        },
      };

      await exportProductTemplate();

      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('template_katalog_produk.xlsx');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-template-url');

      expect(createdBlob).not.toBeNull();
      const arrayBuffer = await createdBlob!.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const sheet = workbook.getWorksheet('Template Produk');
      expect(sheet).toBeDefined();

      const headers: string[] = [];
      sheet!.getRow(1).eachCell((cell) => {
        headers.push(String(cell.value).trim());
      });

      // Verify exact 7 columns
      expect(headers).toEqual([
        'sku',
        'nama_produk',
        'satuan',
        'harga_beli',
        'harga_jual',
        'stok_awal',
        'min_stok_alert',
      ]);
      expect(headers.length).toBe(7);
      expect(headers).not.toContain('kategori');

      // Verify placeholder rows exist and have proper data
      expect(sheet!.rowCount).toBeGreaterThanOrEqual(3); // 1 header + 2 placeholder rows
      const row2Sku = sheet!.getRow(2).getCell(1).value;
      const row2Name = sheet!.getRow(2).getCell(2).value;
      expect(row2Sku).toBe('1234567890123');
      expect(row2Name).toBe('Minyak Cengkeh 50ml');
    });
  });

  describe('parseProductUpload', () => {
    async function createMockExcelFile(headers: string[], rows: any[][]): Promise<File> {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Sheet1');

      sheet.addRow(headers);
      for (const row of rows) {
        sheet.addRow(row);
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      return new File([blob], 'test_products.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }

    it('should successfully parse 7-column Excel without category, mapping categoryName to null', async () => {
      vi.mocked(getProduk).mockResolvedValue([
        {
          id: 'prod-existing',
          sku: 'SKU-002',
          name: 'Produk Eksisting',
          unit: 'pcs',
          buy_price: 15000,
          sell_price: 20000,
          stock: 10,
          min_stock_alert: 5,
          is_active: true,
        } as any,
      ]);

      const headers = ['sku', 'nama_produk', 'satuan', 'harga_beli', 'harga_jual', 'stok_awal', 'min_stok_alert'];
      const rows = [
        ['SKU-001', 'Kopi Arabika 250g', 'pack', 25000, 35000, 50, 10],
        ['SKU-002', 'Produk Eksisting Update', 'pcs', 18000, 24000, 30, 8],
      ];

      const file = await createMockExcelFile(headers, rows);
      const result = await parseProductUpload(file);

      expect(result.totalRows).toBe(2);
      expect(result.newCategoriesToCreate).toEqual([]);

      // Verify new product
      expect(result.newProducts).toHaveLength(1);
      const newProd = result.newProducts[0];
      expect(newProd.sku).toBe('SKU-001');
      expect(newProd.name).toBe('Kopi Arabika 250g');
      expect(newProd.categoryName).toBeNull();
      expect(newProd.unit).toBe('pack');
      expect(newProd.buy_price).toBe(25000);
      expect(newProd.sell_price).toBe(35000);
      expect(newProd.stock).toBe(50);
      expect(newProd.min_stock_alert).toBe(10);
      expect(newProd.is_active).toBe(true);

      // Verify updated product
      expect(result.updatedProducts).toHaveLength(1);
      const updatedProd = result.updatedProducts[0];
      expect(updatedProd.sku).toBe('SKU-002');
      expect(updatedProd.name).toBe('Produk Eksisting Update');
      expect(updatedProd.categoryName).toBeNull();
      expect(updatedProd.buy_price).toBe(18000);
      expect(updatedProd.sell_price).toBe(24000);
      expect(updatedProd.stock).toBe(30);
      expect(updatedProd.min_stock_alert).toBe(8);
      expect(updatedProd.is_active).toBe(true);
    });

    it('should throw validation error if mandatory column sku is missing', async () => {
      const headers = ['nama_produk', 'satuan', 'harga_beli', 'harga_jual', 'stok_awal', 'min_stok_alert'];
      const rows = [['Barang X', 'pcs', 1000, 2000, 10, 2]];

      const file = await createMockExcelFile(headers, rows);
      await expect(parseProductUpload(file)).rejects.toThrow(
        "Kolom wajib 'sku' tidak ditemukan pada template Excel."
      );
    });

    it('should throw validation error if mandatory column harga_jual is missing', async () => {
      const headers = ['sku', 'nama_produk', 'satuan', 'harga_beli', 'stok_awal', 'min_stok_alert'];
      const rows = [['SKU-009', 'Barang Y', 'pcs', 1000, 10, 2]];

      const file = await createMockExcelFile(headers, rows);
      await expect(parseProductUpload(file)).rejects.toThrow(
        "Kolom wajib 'harga_jual' tidak ditemukan pada template Excel."
      );
    });

    it('should skip rows with missing sku or product name and deduplicate by SKU', async () => {
      vi.mocked(getProduk).mockResolvedValue([]);

      const headers = ['sku', 'nama_produk', 'satuan', 'harga_beli', 'harga_jual', 'stok_awal', 'min_stok_alert'];
      const rows = [
        ['', 'Barang Tanpa SKU', 'pcs', 5000, 6000, 10, 2],
        ['SKU-INVALID-NAME', '', 'pcs', 5000, 6000, 10, 2],
        ['SKU-DUP', 'Barang Duplikat 1', 'pcs', 1000, 2000, 5, 1],
        ['SKU-DUP', 'Barang Duplikat Overwrite', 'pcs', 1500, 2500, 15, 3],
      ];

      const file = await createMockExcelFile(headers, rows);
      const result = await parseProductUpload(file);

      expect(result.totalRows).toBe(1);
      expect(result.newProducts).toHaveLength(1);
      expect(result.newProducts[0].sku).toBe('SKU-DUP');
      expect(result.newProducts[0].name).toBe('Barang Duplikat Overwrite');
      expect(result.newProducts[0].sell_price).toBe(25000 > 2500 ? 2500 : 2500);
      expect(result.newProducts[0].stock).toBe(15);
    });
  });

  describe('batchUpsertProducts', () => {
    it('should upsert products payload with category_id set to null', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const parseResult = {
        newProducts: [
          {
            sku: 'SKU-A',
            name: 'Produk A',
            categoryName: null,
            unit: 'pcs',
            buy_price: 10000,
            sell_price: 12000,
            stock: 20,
            min_stock_alert: 5,
            is_active: true,
          },
        ],
        updatedProducts: [
          {
            sku: 'SKU-B',
            name: 'Produk B',
            categoryName: null,
            unit: 'botol',
            buy_price: 25000,
            sell_price: 30000,
            stock: 10,
            min_stock_alert: 2,
            is_active: true,
          },
        ],
        newCategoriesToCreate: [],
        totalRows: 2,
      };

      await batchUpsertProducts(parseResult);

      expect(supabase.from).toHaveBeenCalledWith('products');
      expect(mockUpsert).toHaveBeenCalledWith(
        [
          {
            sku: 'SKU-A',
            name: 'Produk A',
            category_id: null,
            unit: 'pcs',
            buy_price: 10000,
            sell_price: 12000,
            stock: 20,
            min_stock_alert: 5,
            is_active: true,
          },
          {
            sku: 'SKU-B',
            name: 'Produk B',
            category_id: null,
            unit: 'botol',
            buy_price: 25000,
            sell_price: 30000,
            stock: 10,
            min_stock_alert: 2,
            is_active: true,
          },
        ],
        { onConflict: 'sku' }
      );
    });

    it('should do nothing if product list is empty', async () => {
      const mockUpsert = vi.fn();
      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as any);

      await batchUpsertProducts({
        newProducts: [],
        updatedProducts: [],
        newCategoriesToCreate: [],
        totalRows: 0,
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(mockUpsert).not.toHaveBeenCalled();
    });

    it('should throw error when Supabase upsert fails', async () => {
      const mockUpsert = vi.fn().mockResolvedValue({
        error: { message: 'Database connection failed' },
      });
      vi.mocked(supabase.from).mockReturnValue({
        upsert: mockUpsert,
      } as any);

      const parseResult = {
        newProducts: [
          {
            sku: 'SKU-ERR',
            name: 'Produk Error',
            categoryName: null,
            unit: 'pcs',
            buy_price: 1000,
            sell_price: 2000,
            stock: 5,
            min_stock_alert: 1,
            is_active: true,
          },
        ],
        updatedProducts: [],
        newCategoriesToCreate: [],
        totalRows: 1,
      };

      await expect(batchUpsertProducts(parseResult)).rejects.toThrow(
        'Gagal menyimpan produk batch: Database connection failed'
      );
    });
  });
});
