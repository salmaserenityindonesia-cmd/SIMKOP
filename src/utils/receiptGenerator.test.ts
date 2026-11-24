import { describe, it, expect, vi } from 'vitest';
import {
  formatCompactRegister,
  getNextCompactRegister,
  incrementCompactRegister,
  isUniqueConstraintError,
  generateNextCompactRegister,
  generateCompactRegisterSync,
  generateLoanReceiptNumber,
  resolveValidDate,
} from './receiptGenerator';

describe('receiptGenerator', () => {
  const novDate = new Date(2026, 10, 24); // 24 Nov 2026 -> YYMM = 2611

  describe('formatCompactRegister', () => {
    it('membentuk kode ringkas 11-12 karakter untuk seluruh prefix transaksi', () => {
      expect(formatCompactRegister('LN', 1, novDate)).toBe('LN2611-0001');
      expect(formatCompactRegister('KW', 12, novDate)).toBe('KW2611-0012');
      expect(formatCompactRegister('KS', 5, novDate)).toBe('KS2611-0005');
      expect(formatCompactRegister('POS', 1, novDate)).toBe('POS2611-0001');
      expect(formatCompactRegister('PB', 99, novDate)).toBe('PB2611-0099');
      expect(formatCompactRegister('KB', 7, novDate)).toBe('KB2611-0007');
      expect(formatCompactRegister('RB', 3, novDate)).toBe('RB2611-0003');

      expect(formatCompactRegister('LN', 1, novDate)).toHaveLength(11);
      expect(formatCompactRegister('POS', 1, novDate)).toHaveLength(12);
    });

    it('menormalisasi sequence <= 0 atau desimal menjadi minimal 0001', () => {
      expect(formatCompactRegister('LN', 0, novDate)).toBe('LN2611-0001');
      expect(formatCompactRegister('LN', -5, novDate)).toBe('LN2611-0001');
      expect(formatCompactRegister('LN', 4.9, novDate)).toBe('LN2611-0004');
    });
  });

  describe('getNextCompactRegister', () => {
    it('menghitung nomor urut berikutnya berdasarkan kode yang sudah ada di bulan terkait', () => {
      expect(getNextCompactRegister('LN', ['LN2611-0001', 'LN2611-0002'], novDate)).toBe(
        'LN2611-0003'
      );
      expect(getNextCompactRegister('POS', [], novDate)).toBe('POS2611-0001');
    });

    it('mengambil nilai maksimum ketika ada celah dan mengabaikan tail non-numerik serta bulan lain', () => {
      const existing = [
        'PB2610-0099',
        'PB2611-0001',
        'PB2611-0005',
        'PB2611-ABC',
        'PB/20261122/001',
        null,
        undefined,
      ];
      expect(getNextCompactRegister('PB', existing, novDate)).toBe('PB2611-0006');
    });

    it('mereset urutan kembali ke 0001 saat berganti bulan', () => {
      const decDate = new Date(2026, 11, 1);
      expect(getNextCompactRegister('LN', ['LN2611-0010'], decDate)).toBe('LN2612-0001');
    });
  });

  describe('incrementCompactRegister & isUniqueConstraintError', () => {
    it('menaikkan sequence kode register ringkas dengan mempertahankan lebar minimal 4 digit', () => {
      expect(incrementCompactRegister('LN2611-0001', 1)).toBe('LN2611-0002');
      expect(incrementCompactRegister('POS2611-0009', 1)).toBe('POS2611-0010');
      expect(incrementCompactRegister('KB2611-0099', 2)).toBe('KB2611-0101');
    });

    it('mendeteksi error unique constraint Postgres (23505) dan pesan duplicate key', () => {
      expect(isUniqueConstraintError({ code: '23505', message: 'duplicate key' })).toBe(true);
      expect(isUniqueConstraintError({ message: 'Unique constraint violated' })).toBe(true);
      expect(isUniqueConstraintError({ code: '42P01', message: 'relation missing' })).toBe(false);
    });
  });

  describe('resolveValidDate', () => {
    it('mengurai string YYYY-MM-DD ke tanggal lokal tanpa pergeseran bulan akibat UTC', () => {
      const d = resolveValidDate('2026-11-01');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(10);
      expect(d.getDate()).toBe(1);
    });
  });

  describe('generateNextCompactRegister', () => {
    it('membaca nomor urut tertinggi dari tabel Supabase via .ilike()', async () => {
      const ilikeMock = vi.fn().mockResolvedValue({
        data: [{ loan_number: 'LN2611-0001' }, { loan_number: 'LN2611-0003' }],
        error: null,
      });
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({ ilike: ilikeMock }),
        }),
      };

      const next = await generateNextCompactRegister(mockClient, {
        table: 'loans',
        column: 'loan_number',
        prefix: 'LN',
        date: novDate,
      });

      expect(mockClient.from).toHaveBeenCalledWith('loans');
      expect(ilikeMock).toHaveBeenCalledWith('loan_number', 'LN2611-%');
      expect(next).toBe('LN2611-0004');
    });

    it('mendukung fallback .like() dan tetap aman pada mock parsial tanpa .ilike()/.like()', async () => {
      const likeClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            like: vi.fn().mockResolvedValue({
              data: [{ sale_number: 'POS2611-0002' }],
              error: null,
            }),
          }),
        }),
      };

      const nextLike = await generateNextCompactRegister(likeClient, {
        table: 'sales',
        column: 'sale_number',
        prefix: 'POS',
        date: novDate,
      });
      expect(nextLike).toBe('POS2611-0003');

      const partialClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({}),
        }),
      };
      const nextFallback = await generateNextCompactRegister(partialClient, {
        table: 'sales',
        column: 'sale_number',
        prefix: 'POS',
        date: novDate,
        extraCodes: ['POS2611-0004'],
      });
      expect(nextFallback).toBe('POS2611-0005');
    });
  });

  describe('generateLoanReceiptNumber & generateCompactRegisterSync', () => {
    it('menghasilkan nomor kwitansi ringkas berformat KWYYMM-XXXX (11 karakter)', () => {
      const receipt = generateLoanReceiptNumber('LN2611-0001', 42, novDate);
      expect(receipt).toMatch(/^KW2611-\d{4}$/);
      expect(receipt).toHaveLength(11);
    });

    it('menangani input null/undefined/kosong dan mendukung existingCodes', () => {
      expect(generateLoanReceiptNumber(null, 1, novDate)).toMatch(/^KW2611-\d{4}$/);
      expect(generateLoanReceiptNumber(undefined, 'invalid', novDate)).toMatch(/^KW2611-\d{4}$/);
      expect(
        generateLoanReceiptNumber('LN2611-0001', 1, novDate, ['KW2611-0001', 'KW2611-0002'])
      ).toBe('KW2611-0003');
    });

    it('menghasilkan token unik anti-bentrok untuk 100 pemanggilan berturut-turut', () => {
      const generated = new Set<string>();
      for (let i = 0; i < 100; i++) {
        generated.add(generateLoanReceiptNumber('PINJ-MIGRASI-001', 5, novDate));
      }
      expect(generated.size).toBe(100);

      const syncSet = new Set<string>();
      for (let i = 0; i < 20; i++) {
        syncSet.add(generateCompactRegisterSync('KS', novDate));
      }
      expect(syncSet.size).toBe(20);
    });
  });
});
