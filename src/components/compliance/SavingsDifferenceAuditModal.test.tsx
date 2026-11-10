import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SavingsDifferenceAuditModal,
  formatDateTime
} from './SavingsDifferenceAuditModal';
import { SavingsDiscrepancyBreakdown } from '../../services/savingsMatrixService';

describe('SavingsDifferenceAuditModal', () => {
  const mockProps = {
    isOpen: true,
    onClose: vi.fn(),
    memberId: 'member-123',
    memberNrp: 'NRP-98765',
    memberName: 'Yanto Santoso',
    depositTypeCode: 'BELANJA',
    memberDepositId: 'md-belanja-1',
    totalChecked: 1750000,
    dbBalance: 1709000,
    difference: 41000
  };

  const mockBreakdown: SavingsDiscrepancyBreakdown = {
    withdrawals: [
      {
        id: 'tx-1',
        created_at: '2026-11-01T10:00:00Z',
        transaction_date: '2026-11-01T10:00:00Z',
        amount: 41000,
        reference_no: 'INV-20261101-001',
        description: 'Belanja Kasir POS (INV-20261101-001)',
        payment_method: 'potong_simpanan_belanja',
        created_by: 'cashier-1',
        cashier_name: 'Siti Rahma',
        is_pos_sale: true
      }
    ],
    totalSpent: 41000
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatDateTime helper', () => {
    it('returns "-" for falsy dates', () => {
      expect(formatDateTime(null)).toBe('-');
      expect(formatDateTime(undefined)).toBe('-');
      expect(formatDateTime('')).toBe('-');
    });

    it('formats valid ISO date strings properly', () => {
      const res = formatDateTime('2026-11-01T10:00:00Z');
      expect(res).toContain('2026');
      expect(res).toContain('Nov');
    });
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <SavingsDifferenceAuditModal {...mockProps} isOpen={false} />
    );
    expect(html).toBe('');
  });

  it('renders modal header, member info, comparison metrics, and audit table', () => {
    const html = renderToStaticMarkup(
      <SavingsDifferenceAuditModal
        {...mockProps}
        initialBreakdown={mockBreakdown}
      />
    );

    // Header & Member Information
    expect(html).toContain('Rincian Faktor Selisih Simpanan');
    expect(html).toContain('Audit penyebab perbedaan antara Total Tercentang');
    expect(html).toContain('Yanto Santoso');
    expect(html).toContain('NRP-98765');
    expect(html).toContain('Simpanan Belanja');

    // Summary Cards
    expect(html).toContain('1. Total Tercentang');
    expect(html).toContain('1.750.000');
    expect(html).toContain('2. Pengurang (Belanja/Tarik)');
    expect(html).toContain('41.000');
    expect(html).toContain('1 transaksi pemakaian');
    expect(html).toContain('3. Saldo Riil Database');
    expect(html).toContain('1.709.000');
    expect(html).toContain('SEIMBANG / SESUAI');
    expect(html).toContain('Total Tercentang - Pemakaian Belanja = Saldo Riil Database');

    // Accounting Explanation Box
    expect(html).toContain('Penjelasan Logika Akuntansi &amp; Sistem Matriks:');
    expect(html).toContain('Simpanan Belanja');
    expect(html).toContain('Kasir POS Toko');

    // Transactions Table
    expect(html).toContain('Total: 1 Transaksi');
    expect(html).toContain('INV-20261101-001');
    expect(html).toContain('Kasir: Siti Rahma');
    expect(html).toContain('Kasir POS Toko');
    expect(html).toContain('potong_simpanan_belanja');
    expect(html).toContain('41.000');
    expect(html).toContain('Struk');
  });

  it('renders unbalanced status when calculated balance does not match db balance', () => {
    const html = renderToStaticMarkup(
      <SavingsDifferenceAuditModal
        {...mockProps}
        totalChecked={1800000}
        dbBalance={1709000}
        difference={91000}
        initialBreakdown={mockBreakdown}
      />
    );

    expect(html).toContain('Selisih Rp 50.000');
    expect(html).toContain('Ada selisih lain di luar pemakaian');
  });

  it('renders non-BELANJA explanation when depositTypeCode is WAJIB or LEBARAN', () => {
    const html = renderToStaticMarkup(
      <SavingsDifferenceAuditModal
        {...mockProps}
        depositTypeCode="WAJIB"
        initialBreakdown={{
          withdrawals: [
            {
              id: 'tx-2',
              created_at: '2026-11-01T10:00:00Z',
              amount: 50000,
              description: 'Penarikan tunai',
              is_pos_sale: false
            }
          ],
          totalSpent: 50000
        }}
      />
    );

    expect(html).toContain('Simpanan Wajib');
    expect(html).toContain('adanya transaksi penarikan saldo simpanan');
    expect(html).toContain('Penarikan Tunai');
  });

  it('renders empty state when there are no withdrawal transactions', () => {
    const html = renderToStaticMarkup(
      <SavingsDifferenceAuditModal
        {...mockProps}
        initialBreakdown={{ withdrawals: [], totalSpent: 0 }}
      />
    );

    expect(html).toContain('Tidak ada transaksi pengeluaran/belanja tercatat');
    expect(html).toContain('Selisih mungkin bersumber dari selisih migrasi awal');
  });

  it('renders loading indicator when initialLoading is true', () => {
    const html = renderToStaticMarkup(
      <SavingsDifferenceAuditModal
        {...mockProps}
        initialLoading={true}
      />
    );

    expect(html).toContain('Memuat data mutasi pembentuk selisih...');
  });
});
