import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { saveSpy, autoPrintSpy, outputSpy } = vi.hoisted(() => ({
  saveSpy: vi.fn((..._args: any[]) => {}),
  autoPrintSpy: vi.fn((..._args: any[]) => {}),
  outputSpy: vi.fn((..._args: any[]) => 'blob:http://localhost/mock-pdf'),
}));

vi.mock('jspdf', async () => {
  const actual = await vi.importActual<typeof import('jspdf')>('jspdf');
  const ActualJsPDF = actual.default || (actual as any).jsPDF;

  function WrappedJsPDF(...args: any[]) {
    const instance = new ActualJsPDF(...args);
    vi.spyOn(instance, 'save').mockImplementation((...saveArgs: any[]) => {
      saveSpy(...saveArgs);
      return instance;
    });
    vi.spyOn(instance, 'autoPrint').mockImplementation((...apArgs: any[]) => {
      autoPrintSpy(...apArgs);
      return instance;
    });
    vi.spyOn(instance, 'output').mockImplementation((...outArgs: any[]) => {
      return outputSpy(...outArgs);
    });
    return instance;
  }

  WrappedJsPDF.API = ActualJsPDF.API;

  return {
    ...actual,
    default: WrappedJsPDF,
    jsPDF: WrappedJsPDF,
  };
});

import {
  generatePurchaseInvoicePdf,
  sanitizePurchaseInvoiceFilename,
  formatIndonesianInvoiceDate,
  terbilangRupiah,
} from './purchaseInvoicePdf';

describe('purchaseInvoicePdf', () => {
  beforeEach(() => {
    saveSpy.mockClear();
    autoPrintSpy.mockClear();
    outputSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sanitizes invoice numbers into safe PDF filenames', () => {
    expect(sanitizePurchaseInvoiceFilename('PB/20261122/001')).toBe(
      'Faktur_Pembelian_PB-20261122-001.pdf'
    );
    expect(sanitizePurchaseInvoiceFilename('  INV\\2026:01*02  ')).toBe(
      'Faktur_Pembelian_INV-2026-01-02.pdf'
    );
    expect(sanitizePurchaseInvoiceFilename('')).toBe('Faktur_Pembelian_Faktur.pdf');
  });

  it('formats YYYY-MM-DD dates to Indonesian long date without timezone shift', () => {
    expect(formatIndonesianInvoiceDate('2026-11-22')).toBe('22 November 2026');
    expect(formatIndonesianInvoiceDate('2026-01-05')).toBe('5 Januari 2026');
    expect(formatIndonesianInvoiceDate('22/11/2026')).toBe('22/11/2026');
  });

  it('converts integer Rupiah amounts to Indonesian terbilang words', () => {
    expect(terbilangRupiah(0)).toBe('Nol Rupiah');
    expect(terbilangRupiah(11)).toBe('Sebelas Rupiah');
    expect(terbilangRupiah(100)).toBe('Seratus Rupiah');
    expect(terbilangRupiah(1000)).toBe('Seribu Rupiah');
    expect(terbilangRupiah(3_500_000)).toBe('Tiga Juta Lima Ratus Ribu Rupiah');
    expect(terbilangRupiah(125_450_000)).toBe(
      'Seratus Dua Puluh Lima Juta Empat Ratus Lima Puluh Ribu Rupiah'
    );
  });

  it('generates A4 invoice PDF in download mode and triggers save with sanitized filename', () => {
    const doc = generatePurchaseInvoicePdf(
      {
        invoiceNumber: 'PB/20261122/001',
        date: '2026-11-22',
        totalAmount: 3_500_000,
      },
      [
        {
          productName: 'Flashdisk Kingstone 32 GB',
          qty: 100,
          buyPrice: 35_000,
          subtotal: 3_500_000,
        },
      ],
      {
        nama_koperasi: 'KOPERASI DIGITAL MANDIRI',
        alamat: 'Jl. Merdeka No. 10',
        telepon: '08123456789',
      },
      'download'
    );

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
    expect((doc as any).lastAutoTable).toBeDefined();
    expect(saveSpy).toHaveBeenCalledWith('Faktur_Pembelian_PB-20261122-001.pdf');
    expect(autoPrintSpy).not.toHaveBeenCalled();
  });

  it('generates A4 invoice PDF in print mode and invokes autoPrint without throwing', () => {
    const openSpy = vi.fn();
    vi.stubGlobal('window', { open: openSpy });

    const doc = generatePurchaseInvoicePdf(
      {
        invoiceNumber: 'PB/20261122/001',
        date: '2026-11-22',
        totalAmount: 3_500_000,
      },
      [
        {
          productName: 'Flashdisk Kingstone 32 GB',
          qty: 100,
          buyPrice: 35_000,
        },
      ],
      undefined,
      'print'
    );

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
    expect(autoPrintSpy).toHaveBeenCalledTimes(1);
    expect(outputSpy).toHaveBeenCalledWith('bloburl');
    expect(openSpy).toHaveBeenCalledWith(
      'blob:http://localhost/mock-pdf',
      '_blank',
      'noopener,noreferrer'
    );
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('generates A4 invoice PDF with checklist verification data on 1 page and triggers save', () => {
    const doc = generatePurchaseInvoicePdf(
      {
        invoiceNumber: 'PB/20261122/001',
        date: '2026-11-22',
        totalAmount: 3_500_000,
      },
      [
        {
          id: 'item-1',
          productName: 'Flashdisk Kingstone 32 GB',
          qty: 100,
          buyPrice: 35_000,
          subtotal: 3_500_000,
        },
      ],
      {
        nama_koperasi: 'KOPERASI DIGITAL MANDIRI',
        alamat: 'Jl. Merdeka No. 10',
        telepon: '08123456789',
      },
      'download',
      {
        itemChecks: {
          'item-1': {
            qtyMatch: true,
            conditionGood: true,
            priceMatch: true,
            note: 'Segel lengkap',
          },
        },
        generalChecks: {
          suratJalanMatch: true,
          packagingIntact: true,
          expiryChecked: true,
          stockPlaced: true,
        },
        inspectorNotes: 'Barang diterima lengkap dan sesuai faktur.',
      }
    );

    expect(doc).toBeDefined();
    expect(doc.getNumberOfPages()).toBe(1);
    expect((doc as any).lastAutoTable).toBeDefined();
    expect(saveSpy).toHaveBeenCalledWith('Faktur_Pembelian_PB-20261122-001.pdf');
  });
});
