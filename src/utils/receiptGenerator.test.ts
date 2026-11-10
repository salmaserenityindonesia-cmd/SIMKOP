import { describe, it, expect } from 'vitest';
import { generateLoanReceiptNumber } from './receiptGenerator';

describe('receiptGenerator', () => {
  describe('generateLoanReceiptNumber', () => {
    it('menghasilkan nomor kwitansi dengan format standar KW-PINJ/{loanNumber}/B{period}/{YYYYMMDD}-{RAND3}', () => {
      const receipt = generateLoanReceiptNumber('PINJ-MIGRASI-98119961', 42);
      expect(receipt).toMatch(/^KW-PINJ\/PINJ-MIGRASI-98119961\/B42\/\d{8}-[A-Z0-9]{3}$/);
    });

    it('membersihkan karakter simbolik aneh pada nomor pinjaman', () => {
      const receiptWithSymbols = generateLoanReceiptNumber('PINJ@123#$$%', 1);
      expect(receiptWithSymbols).toMatch(/^KW-PINJ\/PINJ123\/B1\/\d{8}-[A-Z0-9]{3}$/);
    });

    it('melakukan fallback ke PINJ jika loanNumber null, undefined, kosong, atau hanya simbol', () => {
      expect(generateLoanReceiptNumber(null, 1)).toMatch(/^KW-PINJ\/PINJ\/B1\//);
      expect(generateLoanReceiptNumber(undefined, 1)).toMatch(/^KW-PINJ\/PINJ\/B1\//);
      expect(generateLoanReceiptNumber('', 1)).toMatch(/^KW-PINJ\/PINJ\/B1\//);
      expect(generateLoanReceiptNumber('   ', 1)).toMatch(/^KW-PINJ\/PINJ\/B1\//);
      expect(generateLoanReceiptNumber('!@#$%', 1)).toMatch(/^KW-PINJ\/PINJ\/B1\//);
    });

    it('menangani period dalam bentuk string, desimal, dan nilai tidak valid', () => {
      // String number
      expect(generateLoanReceiptNumber('PINJ-001', '12')).toMatch(/^KW-PINJ\/PINJ-001\/B12\//);
      
      // Desimal dibulatkan
      expect(generateLoanReceiptNumber('PINJ-001', 5.6)).toMatch(/^KW-PINJ\/PINJ-001\/B6\//);
      expect(generateLoanReceiptNumber('PINJ-001', 5.2)).toMatch(/^KW-PINJ\/PINJ-001\/B5\//);
      
      // Nilai <= 0 atau non-angka fallback ke 1
      expect(generateLoanReceiptNumber('PINJ-001', 0)).toMatch(/^KW-PINJ\/PINJ-001\/B1\//);
      expect(generateLoanReceiptNumber('PINJ-001', -5)).toMatch(/^KW-PINJ\/PINJ-001\/B1\//);
      expect(generateLoanReceiptNumber('PINJ-001', 'invalid')).toMatch(/^KW-PINJ\/PINJ-001\/B1\//);
    });

    it('mendukung customDate yang valid dan fallback jika tanggal invalid', () => {
      const fixedDate = new Date(2026, 10, 10); // Bulan 10 = November (0-indexed)
      const receipt = generateLoanReceiptNumber('PINJ-001', 1, fixedDate);
      expect(receipt).toMatch(/^KW-PINJ\/PINJ-001\/B1\/20261110-[A-Z0-9]{3}$/);

      const invalidDate = new Date('invalid');
      const fallbackReceipt = generateLoanReceiptNumber('PINJ-001', 1, invalidDate);
      expect(fallbackReceipt).toMatch(/^KW-PINJ\/PINJ-001\/B1\/\d{8}-[A-Z0-9]{3}$/);
    });

    it('menghasilkan token unik anti-bentrok (100 pemanggilan berturut-turut menghasilkan 100 nilai unik)', () => {
      const generated = new Set<string>();
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        generated.add(generateLoanReceiptNumber('PINJ-MIGRASI-001', 5));
      }

      expect(generated.size).toBe(iterations);
    });
  });
});
