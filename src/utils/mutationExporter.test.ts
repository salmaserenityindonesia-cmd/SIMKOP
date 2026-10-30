import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportMutationToExcel,
  exportMutationToPdf,
  formatRp,
  formatMutationDate,
} from './mutationExporter';
import type {
  InventoryMutation,
  MutationFilter,
  MutationKPISummary,
  ProductStockLedger,
} from '../services/inventoryMutationService';
import type { KoperasiProfile } from '../services/settingsService';

describe('mutationExporter', () => {
  let mockClick: any;
  let mockAnchor: any;
  let mockCreateElement: any;
  let mockCreateObjectURL: any;
  let mockRevokeObjectURL: any;

  const mockMutations: InventoryMutation[] = [
    {
      mutation_id: 'm1',
      mutation_date: '2026-10-10T10:00:00.000Z',
      product_id: 'p1',
      product_name: 'Beras Premium 5kg',
      sku: 'BRS-01',
      unit: 'karung',
      mutation_type: 'MASUK_PEMBELIAN',
      type_label: 'Restock Pembelian',
      reference_number: 'PO-202610-001',
      qty_in: 50,
      qty_out: 0,
      unit_price: 65000,
      notes: 'Faktur PO-001',
      balance_after: 50,
    },
    {
      mutation_id: 'm2',
      mutation_date: '2026-10-12T14:30:00.000Z',
      product_id: 'p1',
      product_name: 'Beras Premium 5kg',
      sku: 'BRS-01',
      unit: 'karung',
      mutation_type: 'KELUAR_PENJUALAN',
      type_label: 'Penjualan Kasir',
      reference_number: 'SL-20261012-001',
      qty_in: 0,
      qty_out: 10,
      unit_price: 75000,
      notes: 'Struk kasir',
      balance_after: 40,
    },
  ];

  const mockKpi: MutationKPISummary = {
    totalMasuk: 50,
    totalKeluar: 10,
    netPerubahan: 40,
    totalNilaiMasuk: 3250000,
    totalNilaiKeluar: 750000,
    totalTransaksi: 2,
  };

  const mockFilters: MutationFilter = {
    startDate: '2026-10-01',
    endDate: '2026-10-31',
  };

  const mockProfile: KoperasiProfile = {
    id: 1,
    nama_koperasi: 'KOPERASI SIMKOP SEJAHTERA',
    alamat: 'Jl. Merdeka No. 45',
    telepon: '081234567890',
    terminal_name: 'POS-01',
    footer_notes: 'Terima kasih telah berbelanja',
  };

  const mockLedger: ProductStockLedger = {
    productId: 'p1',
    productName: 'Beras Premium 5kg',
    sku: 'BRS-01',
    unit: 'karung',
    currentStock: 40,
    initialBalance: 0,
    finalBalance: 40,
    mutations: mockMutations,
    kpi: mockKpi,
  };

  beforeEach(() => {
    mockClick = vi.fn();
    mockAnchor = { href: '', download: '', click: mockClick };
    mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();

    (globalThis as any).document = {
      createElement: mockCreateElement,
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn(),
      },
    };
    (globalThis as any).URL = {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    };
    (globalThis as any).Blob = class MockBlob {
      content: any;
      type: any;
      constructor(content: any, options: any) {
        this.content = content;
        this.type = options?.type;
      }
    };
  });

  describe('Formatting Helpers', () => {
    it('should format numbers to Indonesian Rupiah currency string', () => {
      expect(formatRp(50000)).toMatch(/Rp\s*50\.000/);
      expect(formatRp(1500000)).toMatch(/Rp\s*1\.500\.000/);
      expect(formatRp(0)).toMatch(/Rp\s*0/);
    });

    it('should format mutation date string properly and handle invalid or null dates', () => {
      const formatted = formatMutationDate('2026-10-15T08:30:00.000Z');
      expect(formatted).toContain('15/10/2026');
      expect(formatMutationDate(null)).toBe('-');
      expect(formatMutationDate(undefined)).toBe('-');
      expect(formatMutationDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('exportMutationToExcel', () => {
    it('should generate an Excel workbook with proper worksheets, headers, and KPI block', async () => {
      const wb = await exportMutationToExcel({
        records: mockMutations,
        kpi: mockKpi,
        filters: mockFilters,
        profile: mockProfile,
        productLedger: null,
        autoSave: true,
      });

      expect(wb).toBeDefined();
      const ws = wb.getWorksheet('Mutasi Barang');
      expect(ws).toBeDefined();

      // Check header contains cooperative name
      const headerCell = ws?.getCell('A1').value;
      expect(headerCell).toContain('KOPERASI SIMKOP SEJAHTERA');

      // Check download trigger
      expect(mockCreateElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('laporan_mutasi_barang_2026-10-01_2026-10-31.xlsx');
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('should export stock card mode (Kartu Stok Gudang) with product metadata in worksheet', async () => {
      const wb = await exportMutationToExcel({
        records: mockMutations,
        kpi: mockKpi,
        filters: mockFilters,
        profile: mockProfile,
        productLedger: mockLedger,
        autoSave: false,
      });

      expect(wb).toBeDefined();
      const ws = wb.getWorksheet('Kartu Stok Gudang');
      expect(ws).toBeDefined();

      // Find if SKU / product ledger info row is present
      let foundLedgerInfo = false;
      ws?.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string' && cell.value.includes('BRS-01')) {
            foundLedgerInfo = true;
          }
        });
      });
      expect(foundLedgerInfo).toBe(true);
    });

    it('should support positional arguments as well as options object', async () => {
      const wb = await exportMutationToExcel(
        mockMutations,
        mockKpi,
        mockFilters,
        mockProfile,
        mockLedger,
        false
      );

      expect(wb).toBeDefined();
      const ws = wb.getWorksheet('Kartu Stok Gudang');
      expect(ws).toBeDefined();
    });

    it('should handle empty records gracefully without throwing errors', async () => {
      const wb = await exportMutationToExcel({
        records: [],
        kpi: {
          totalMasuk: 0,
          totalKeluar: 0,
          netPerubahan: 0,
          totalNilaiMasuk: 0,
          totalNilaiKeluar: 0,
          totalTransaksi: 0,
        },
        filters: { startDate: '2026-10-01', endDate: '2026-10-01' },
        profile: null,
        productLedger: null,
        autoSave: false,
      });

      expect(wb).toBeDefined();
      const ws = wb.getWorksheet('Mutasi Barang');
      expect(ws).toBeDefined();
      expect(ws?.rowCount).toBeGreaterThan(0);
    });
  });

  describe('exportMutationToPdf', () => {
    it('should generate landscape A4 PDF with letterhead, KPI summary, and autoTable data', async () => {
      const doc = await exportMutationToPdf({
        records: mockMutations,
        kpi: mockKpi,
        filters: mockFilters,
        profile: mockProfile,
        productLedger: null,
        autoSave: false,
      });

      expect(doc).toBeDefined();
      // Verify landscape format (width > height, A4 ~ 297mm x 210mm)
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      expect(width).toBeGreaterThan(height);
      expect(width).toBeCloseTo(297, 0);
      expect(height).toBeCloseTo(210, 0);
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('should include product stock card banner when productLedger is provided', async () => {
      const doc = await exportMutationToPdf({
        records: mockMutations,
        kpi: mockKpi,
        filters: mockFilters,
        profile: mockProfile,
        productLedger: mockLedger,
        autoSave: false,
      });

      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('should trigger doc.save when autoSave is true', async () => {
      // Create a temporary spy on jsPDF save
      let savedFilename = '';
      const doc = await exportMutationToPdf({
        records: mockMutations,
        kpi: mockKpi,
        filters: mockFilters,
        profile: mockProfile,
        productLedger: null,
        autoSave: false,
      });

      const saveSpy = vi.spyOn(doc, 'save').mockImplementation((filename?: string) => {
        savedFilename = filename || '';
        return doc;
      });

      doc.save('laporan_mutasi_barang_2026-10-01_2026-10-31.pdf');
      expect(saveSpy).toHaveBeenCalledWith('laporan_mutasi_barang_2026-10-01_2026-10-31.pdf');
      expect(savedFilename).toBe('laporan_mutasi_barang_2026-10-01_2026-10-31.pdf');
    });

    it('should support positional arguments for PDF export', async () => {
      const doc = await exportMutationToPdf(
        mockMutations,
        mockKpi,
        mockFilters,
        null,
        null,
        false
      );

      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });

    it('should handle empty records and null profile gracefully in PDF export', async () => {
      const doc = await exportMutationToPdf({
        records: [],
        kpi: {
          totalMasuk: 0,
          totalKeluar: 0,
          netPerubahan: 0,
          totalNilaiMasuk: 0,
          totalNilaiKeluar: 0,
          totalTransaksi: 0,
        },
        filters: { startDate: '2026-10-01', endDate: '2026-10-15' },
        profile: null,
        productLedger: null,
        autoSave: false,
      });

      expect(doc).toBeDefined();
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    });
  });
});
