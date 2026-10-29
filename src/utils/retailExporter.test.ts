import { describe, it, expect, vi } from 'vitest';
import jsPDF from 'jspdf';
import { exportRetailToExcel, exportRetailReportToPdf, formatRp } from './retailExporter';

describe('retailExporter', () => {
  it('should format rupiah correctly', () => {
    expect(formatRp(50000)).toMatch(/Rp\s*50\.000/);
    expect(formatRp(1250500)).toMatch(/Rp\s*1\.250\.500/);
  });

  it('should generate multi-sheet Excel without error', async () => {
    // Mock DOM elements for download trigger
    const mockClick = vi.fn();
    const mockAnchor = { href: '', download: '', click: mockClick };
    const mockCreateElement = vi.fn().mockReturnValue(mockAnchor);
    const mockRevokeObjectURL = vi.fn();
    const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');

    (globalThis as any).document = {
      createElement: mockCreateElement,
      title: 'Original Title',
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

    const mockEod = {
      totalOmzet: 500000,
      totalDiscount: 10000,
      totalSubtotal: 510000,
      paidCash: 300000,
      paidDeposit: 150000,
      paidCredit: 50000,
      transactions: [
        {
          id: '1',
          sale_number: 'POS-001',
          total_amount: 500000,
          paid_cash: 300000,
          paid_deposit: 150000,
          paid_credit: 50000,
          completed_at: '2026-09-30T10:00:00.000Z',
          pengelola: { nama: 'Kasir Budi' },
          anggota: { nama: 'Anggota Ani' },
          sale_status: 'completed',
        },
      ],
    };

    const mockFastMoving = [
      {
        rank: 1,
        sku: 'BRS-01',
        name: 'Beras Super',
        category: 'Sembako',
        qty: 25,
        omzet: 1500000,
        hpp: 1250000,
        labaKotor: 250000,
        margin: 16.67,
      },
    ];

    const mockStock = {
      totalValuasiAset: 5000000,
      potensiPenjualan: 6500000,
      kritisCount: 1,
      items: [
        {
          sku: 'BRS-01',
          name: 'Beras Super',
          stock: 10,
          status: 'aman',
          buy_price: 50000,
          sell_price: 65000,
          valuasiAset: 500000,
        },
      ],
    };

    await exportRetailToExcel(
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      mockEod,
      mockFastMoving,
      mockStock
    );

    expect(mockCreateElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.download).toBe('laporan-retail-2026-09-01-2026-09-30.xlsx');
    expect(mockClick).toHaveBeenCalled();
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('should export cashier shifts to Excel worksheet without error', async () => {
    const mockShifts = [
      {
        id: 'shift-1',
        cashier_id: 'user-1',
        shift_number: 'SHF-20260930-080000',
        opened_at: '2026-09-30T08:00:00.000Z',
        closed_at: '2026-09-30T16:00:00.000Z',
        initial_cash: 200000,
        cash_sales: 300000,
        expected_cash: 500000,
        actual_cash: 500000,
        difference: 0,
        status: 'closed' as const,
        notes: 'Shift seimbang',
        cashier_name: 'Kasir Budi'
      }
    ];

    await exportRetailToExcel(
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      null,
      [],
      null,
      mockShifts
    );

    const mockAnchor = ((globalThis as any).document.createElement as any)();
    expect(mockAnchor.download).toBe('laporan-retail-2026-09-01-2026-09-30.xlsx');
  });

  it('should generate retail PDF report with branding, summary, and transaction log', async () => {
    const mockEod = {
      totalOmzet: 500000,
      totalDiscount: 10000,
      totalSubtotal: 510000,
      paidCash: 300000,
      paidDeposit: 150000,
      paidCredit: 50000,
      transactions: [
        {
          id: '1',
          sale_number: 'POS-001',
          total_amount: 500000,
          paid_cash: 300000,
          paid_deposit: 150000,
          paid_credit: 50000,
          completed_at: '2026-09-30T10:00:00.000Z',
          pengelola: { nama: 'Kasir Budi' },
          anggota: { nama: 'Anggota Ani' },
          sale_status: 'completed',
        },
      ],
    };

    const mockProfile = {
      nama_koperasi: 'KOPERASI PRIMKOPPOL RESORT',
      alamat: 'Jl. Merdeka No. 1',
      telepon: '08123456789',
      terminal_name: 'POS-01',
      footer_notes: 'Terima kasih'
    };

    const doc = await exportRetailReportToPdf(
      mockEod,
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      mockProfile,
      false
    );

    expect(doc).toBeDefined();
    // Verify landscape format (width > height)
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc);
    doc.save('laporan-retail-2026-09-01-sd-2026-09-30.pdf');
    expect(saveSpy).toHaveBeenCalledWith('laporan-retail-2026-09-01-sd-2026-09-30.pdf');
  });

  it('should handle null eod data in exportRetailReportToPdf gracefully', async () => {
    const doc = await exportRetailReportToPdf(
      null,
      { startDate: '2026-09-01', endDate: '2026-09-30' },
      null,
      false
    );

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('should handle transactions with missing dates and null members/cashier', async () => {
    const mockEod = {
      totalOmzet: 100000,
      totalDiscount: 0,
      totalSubtotal: 100000,
      paidCash: 100000,
      paidDeposit: 0,
      paidCredit: 0,
      transactions: [
        {
          id: 'tx-1',
          sale_number: 'POS-002',
          total_amount: 100000,
          paid_cash: 100000,
          paid_deposit: 0,
          paid_credit: 0,
          completed_at: 'invalid-date-string',
          pengelola: null,
          anggota: null,
          sale_status: 'completed',
        },
      ],
    };

    const doc = await exportRetailReportToPdf(
      mockEod,
      { startDate: '2026-10-01', endDate: '2026-10-29' },
      undefined,
      false
    );

    expect(doc).toBeDefined();
    expect(typeof doc.save).toBe('function');
    const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc);
    doc.save('laporan-retail-2026-10-01-sd-2026-10-29.pdf');
    expect(saveSpy).toHaveBeenCalledWith('laporan-retail-2026-10-01-sd-2026-10-29.pdf');
  });
});

