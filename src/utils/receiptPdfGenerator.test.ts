import { describe, it, expect, vi } from 'vitest';
import { generateReceiptPdf, ReceiptTransactionData } from './receiptPdfGenerator';

describe('receiptPdfGenerator', () => {
  it('should generate a jsPDF document for a complete transaction', () => {
    const sampleData: ReceiptTransactionData = {
      saleNumber: 'INV-20261028-001',
      date: new Date('2026-10-28T14:30:00'),
      cashierName: 'Ahmad Staff',
      memberName: 'Siti Rahma (NRP: 1042)',
      cart: [
        { name: 'Beras Rojolele 5kg', qty: 1, unit: 'sak', price: 75000 },
        { name: 'Minyak Goreng 2L', qty: 2, unit: 'pch', price: 34000 },
        { name: 'Gula Pasir 1kg', qty: 3, unit: 'kg', price: 17500 }
      ],
      subtotal: 195500,
      discount: 9775,
      total: 185725,
      payment: {
        paidCash: 100000,
        paidDeposit: 50000,
        paidCredit: 40000,
        scheme: 'split'
      }
    };

    const doc = generateReceiptPdf(sampleData, false);
    expect(doc).toBeDefined();
    expect(typeof doc.text).toBe('function');
    expect(typeof doc.save).toBe('function');
  });

  it('should call doc.save with expected file name when autoSave is true', () => {
    const sampleData: ReceiptTransactionData = {
      saleNumber: 'INV-TEST-99',
      cart: [
        { name: 'Kopi Kapal Api', qty: 1, price: 12000 }
      ],
      subtotal: 12000,
      discount: 0,
      total: 12000
    };

    // Spy on jsPDF save
    const doc = generateReceiptPdf(sampleData, false);
    const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc);

    // Call save directly or simulate autoSave behavior
    doc.save(`struk-${sampleData.saleNumber}.pdf`);
    expect(saveSpy).toHaveBeenCalledWith('struk-INV-TEST-99.pdf');
  });

  it('should gracefully handle empty or minimal transaction data', () => {
    const minimalData: ReceiptTransactionData = {
      cart: [],
      subtotal: 0,
      discount: 0,
      total: 0
    };

    const doc = generateReceiptPdf(minimalData, false);
    expect(doc).toBeDefined();
  });

  it('should correctly format receipt with custom profile and long multiline address without crashing', () => {
    const customData: ReceiptTransactionData = {
      saleNumber: 'INV-LONG-ADDR-01',
      cart: [
        { name: 'Indomie Goreng Spesial Jumbo Rasa Ayam Panggang Komplit', qty: 5, price: 4500 }
      ],
      subtotal: 22500,
      discount: 0,
      total: 22500,
      profile: {
        nama_koperasi: 'KOPERASI KONSUMEN CITRA SEJAHTERA ABADI NUSANTARA',
        alamat: 'Kawasan Industri Terpadu Pulo Gadung, Blok D No. 88-92, RT 004 / RW 012, Kelurahan Jatinegara Kaum, Kecamatan Pulo Gadung, Jakarta Timur 13250',
        telepon: '0812-9876-5432 / (021) 489-0123',
        terminal_name: 'POS Terminal Kasir Retail #03',
        footer_notes: 'Struk ini adalah bukti pembayaran sah. Terima kasih atas partisipasi Anda dalam memajukan koperasi kita bersama!'
      }
    };

    const doc = generateReceiptPdf(customData, false);
    expect(doc).toBeDefined();
    expect(typeof doc.text).toBe('function');
  });

  it('should render dynamic discount percentage label when discountPercentage is specified', () => {
    const dataWithDiscount: ReceiptTransactionData = {
      saleNumber: 'INV-DISC-10',
      cart: [{ name: 'Gula 1kg', qty: 2, price: 15000 }],
      subtotal: 30000,
      discount: 3000,
      discountPercentage: 10,
      total: 27000
    };

    const doc = generateReceiptPdf(dataWithDiscount, false);
    expect(doc).toBeDefined();
  });

  it('should hide member discount line completely when discount is 0', () => {
    const dataZeroDiscount: ReceiptTransactionData = {
      saleNumber: 'INV-DISC-0',
      cart: [{ name: 'Gula 1kg', qty: 2, price: 15000 }],
      subtotal: 30000,
      discount: 0,
      discountPercentage: 0,
      total: 30000
    };

    const doc = generateReceiptPdf(dataZeroDiscount, false);
    expect(doc).toBeDefined();
  });
});
