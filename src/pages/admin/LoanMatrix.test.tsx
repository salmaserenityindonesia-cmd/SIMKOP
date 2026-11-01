import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LoanMatrix,
  loadAvailableYearsData,
  fetchLoanMatrixData,
} from './LoanMatrix';
import {
  getLoanMatrix,
  getLoanMatrixAvailableYears,
  LoanMatrixSummary,
} from '../../services/loanMatrixService';

// Mock layout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock exceljs
vi.mock('exceljs', () => ({
  Workbook: vi.fn().mockImplementation(() => ({
    addWorksheet: vi.fn().mockReturnValue({
      columns: [],
      addRow: vi.fn(),
    }),
    xlsx: {
      writeBuffer: vi.fn().mockResolvedValue(new Uint8Array()),
    },
  })),
}));

// Mock LoanLedgerModal
vi.mock('../../components/members/LoanLedgerModal', () => ({
  default: () => <div data-testid="loan-ledger-modal" />,
}));

// Mock loanMatrixService
const { mockSummaryData } = vi.hoisted(() => {
  return {
    mockSummaryData: {
      year: 2026,
      complianceYTD: 95.5,
      totalCollectedYTD: 50000000,
      projectedNextMonth: 12000000,
      unpaidMembersCount: 2,
      members: [
        {
          loanId: 'loan-1',
          nrp: '12345678',
          nama: 'Budi Santoso',
          isLoanActive: true,
          complianceYTD: 100,
          months: {
            1: { status: 'PAID', amount: 1000000, paidAmount: 1000000 },
            2: { status: 'PAID', amount: 1000000, paidAmount: 1000000 },
            3: { status: 'NONE', amount: 0, paidAmount: 0 },
            4: { status: 'NONE', amount: 0, paidAmount: 0 },
            5: { status: 'NONE', amount: 0, paidAmount: 0 },
            6: { status: 'NONE', amount: 0, paidAmount: 0 },
            7: { status: 'NONE', amount: 0, paidAmount: 0 },
            8: { status: 'NONE', amount: 0, paidAmount: 0 },
            9: { status: 'NONE', amount: 0, paidAmount: 0 },
            10: { status: 'NONE', amount: 0, paidAmount: 0 },
            11: { status: 'NONE', amount: 0, paidAmount: 0 },
            12: { status: 'NONE', amount: 0, paidAmount: 0 },
          },
        },
      ],
    },
  };
});

vi.mock('../../services/loanMatrixService', () => ({
  getLoanMatrixAvailableYears: vi.fn().mockResolvedValue([2027, 2026, 2025, 2024]),
  getLoanMatrix: vi.fn().mockResolvedValue(mockSummaryData),
}));

describe('LoanMatrix Page Component - Dynamic Year Dropdown & Matrix Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static UI Structure & Dynamic Year Options Rendering', () => {
    it('renders page layout, KPI cards, and filter toolbar correctly', () => {
      const html = renderToStaticMarkup(<LoanMatrix />);

      // Headers and breadcrumb
      expect(html).toContain('Matriks Proyeksi &amp; Kepatuhan Pinjaman');
      expect(html).toContain('SIMKOP / Simpan Pinjam / Matriks Pinjaman');
      expect(html).toContain('Export Excel');

      // KPI card titles
      expect(html).toContain('Kepatuhan YTD');
      expect(html).toContain('Realisasi YTD');
      expect(html).toContain('Proyeksi Bulan Depan');
      expect(html).toContain('Anggota Menunggak');

      // Filter Toolbar elements
      expect(html).toContain('Cari NRP atau Nama...');
      expect(html).toContain('Semua Status');
      expect(html).toContain('Pinjaman Aktif');
      expect(html).toContain('Ada Tunggakan');
      expect(html).toContain('Tahun:');
    });

    it('renders dynamic year dropdown options with [2027, 2026, 2025, 2024]', () => {
      const years = [2027, 2026, 2025, 2024];
      const html = renderToStaticMarkup(
        <LoanMatrix initialAvailableYears={years} initialYear={2026} />
      );

      // Verify each option exists in the rendered HTML (matching optional selected="" attribute)
      expect(html).toMatch(/<option [^>]*value="2027"[^>]*>2027<\/option>/);
      expect(html).toMatch(/<option [^>]*value="2026"[^>]*>2026<\/option>/);
      expect(html).toMatch(/<option [^>]*value="2025"[^>]*>2025<\/option>/);
      expect(html).toMatch(/<option [^>]*value="2024"[^>]*>2024<\/option>/);
    });

    it('renders current year as fallback option when no available years provided', () => {
      const currentYear = new Date().getFullYear();
      const html = renderToStaticMarkup(<LoanMatrix />);

      expect(html).toMatch(
        new RegExp(`<option [^>]*value="${currentYear}"[^>]*>${currentYear}</option>`)
      );
    });
  });

  describe('loadAvailableYearsData Resolver Logic', () => {
    it('fetches dynamic years and retains current year if present in available years', async () => {
      const setAvailableYears = vi.fn();
      let updatedYear: number | undefined;
      const setYear = vi.fn((updater: (prev: number) => number) => {
        updatedYear = updater(2026);
      });

      const years = await loadAvailableYearsData(setAvailableYears, setYear);

      expect(getLoanMatrixAvailableYears).toHaveBeenCalledTimes(1);
      expect(setAvailableYears).toHaveBeenCalledWith([2027, 2026, 2025, 2024]);
      expect(years).toEqual([2027, 2026, 2025, 2024]);
      // Since 2026 is in [2027, 2026, 2025, 2024], updatedYear should remain 2026
      expect(updatedYear).toBe(2026);
    });

    it('selects newest available year (years[0]) if current year is not in list', async () => {
      const setAvailableYears = vi.fn();
      let updatedYear: number | undefined;
      const setYear = vi.fn((updater: (prev: number) => number) => {
        // Assume current year was 2020 which is not in [2027, 2026, 2025, 2024]
        updatedYear = updater(2020);
      });

      await loadAvailableYearsData(setAvailableYears, setYear);

      expect(updatedYear).toBe(2027);
    });

    it('handles service errors gracefully and returns empty array', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (getLoanMatrixAvailableYears as any).mockRejectedValueOnce(new Error('Network error'));

      const setAvailableYears = vi.fn();
      const setYear = vi.fn();

      const years = await loadAvailableYearsData(setAvailableYears, setYear);

      expect(years).toEqual([]);
      expect(setAvailableYears).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('fetchLoanMatrixData & Year Selection Flow', () => {
    it('fetches loan matrix for selected year and sets loading state cycle', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();

      const result = await fetchLoanMatrixData(2025, setLoading, setData);

      // Verify loading state transitions
      expect(setLoading).toHaveBeenCalledWith(true);
      expect(setLoading).toHaveBeenLastCalledWith(false);

      // Verify service query with specific year
      expect(getLoanMatrix).toHaveBeenCalledWith(2025);
      expect(setData).toHaveBeenCalledWith(mockSummaryData);
      expect(result).toEqual(mockSummaryData);
    });

    it('fetches loan matrix when switching to another year (e.g. 2024)', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();

      const result = await fetchLoanMatrixData(2024, setLoading, setData);

      expect(getLoanMatrix).toHaveBeenCalledWith(2024);
      expect(setData).toHaveBeenCalledWith(mockSummaryData);
      expect(result).not.toBeNull();
    });

    it('handles loan matrix fetch failure gracefully without crash', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (getLoanMatrix as any).mockRejectedValueOnce(new Error('Query failed'));

      const setLoading = vi.fn();
      const setData = vi.fn();

      const result = await fetchLoanMatrixData(2027, setLoading, setData);

      expect(setLoading).toHaveBeenCalledWith(true);
      expect(setLoading).toHaveBeenLastCalledWith(false);
      expect(setData).not.toHaveBeenCalled();
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
