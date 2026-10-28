import { describe, it, expect, vi } from 'vitest';
import { exportRetailToExcel, formatRp } from './retailExporter';

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
});

