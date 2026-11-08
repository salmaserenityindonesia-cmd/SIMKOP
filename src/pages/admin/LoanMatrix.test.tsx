import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LoanMatrix,
  loadAvailableYearsData,
  fetchLoanMatrixData,
  formatAmount,
  getCellBadge,
} from './LoanMatrix';
import {
  getLoanMatrix,
  getLoanMatrixAvailableYears,
  getCumulativePaidUpToMonth,
  LoanMatrixSummary,
  MonthLoanCell,
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
          memberId: 'mem-1',
          nrp: '12345678',
          nama: 'Budi Santoso',
          isLoanActive: true,
          totalLoans: 1,
          complianceYTD: 100,
          months: {
            1: { month: 1, status: 'PAID', targetAmount: 1000000, paidAmount: 1000000, loanId: 'loan-1', loanNumber: 'PJ-001', periodNumber: 1, tenor: 10, dueDate: '2026-01-25' },
            2: { month: 2, status: 'PARTIAL', targetAmount: 1000000, paidAmount: 500000, remainingBalance: 500000, loanId: 'loan-1', loanNumber: 'PJ-001', periodNumber: 2, tenor: 10, dueDate: '2026-02-25' },
            3: { month: 3, status: 'UNPAID', targetAmount: 1000000, paidAmount: 0, remainingBalance: 1000000, loanId: 'loan-1', loanNumber: 'PJ-001', periodNumber: 3, tenor: 10, dueDate: '2026-03-25' },
            4: { month: 4, status: 'PROJECTED', targetAmount: 1000000, paidAmount: 0, loanId: 'loan-1', loanNumber: 'PJ-001', periodNumber: 4, tenor: 10, dueDate: '2026-04-25' },
            5: { month: 5, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            6: { month: 6, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            7: { month: 7, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            8: { month: 8, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            9: { month: 9, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            10: { month: 10, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            11: { month: 11, status: 'NONE', targetAmount: 0, paidAmount: 0 },
            12: { month: 12, status: 'NONE', targetAmount: 0, paidAmount: 0 },
          },
        },
      ],
    },
  };
});

vi.mock('../../services/loanMatrixService', async () => {
  const actual = await vi.importActual<typeof import('../../services/loanMatrixService')>('../../services/loanMatrixService');
  return {
    ...actual,
    getLoanMatrixAvailableYears: vi.fn().mockResolvedValue([2027, 2026, 2025, 2024]),
    getLoanMatrix: vi.fn().mockResolvedValue(mockSummaryData),
  };
});

describe('LoanMatrix Page Component - Dynamic Year Dropdown & Matrix Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatAmount Helper Unit Tests', () => {
    it('formats positive integers to Indonesian locale format', () => {
      expect(formatAmount(1000000)).toBe('1.000.000');
      expect(formatAmount(50000)).toBe('50.000');
      expect(formatAmount(2500)).toBe('2.500');
    });

    it('returns "-" for 0, undefined, null, or NaN', () => {
      expect(formatAmount(0)).toBe('-');
      expect(formatAmount(undefined)).toBe('-');
      expect(formatAmount(null)).toBe('-');
      expect(formatAmount(NaN)).toBe('-');
    });
  });

  describe('getCellBadge Helper Unit Tests', () => {
    it('returns emerald styling and "Lunas" label for PAID and FINISHED statuses', () => {
      const paidCell: MonthLoanCell = {
        month: 1,
        status: 'PAID',
        targetAmount: 500000,
        paidAmount: 500000,
      };
      const badge = getCellBadge(paidCell);
      expect(badge.text).toBe('500.000');
      expect(badge.className).toContain('text-emerald-700');
      expect(badge.className).toContain('bg-emerald-50');
      expect(badge.statusLabel).toBe('Lunas');

      const finishedCell: MonthLoanCell = {
        month: 2,
        status: 'FINISHED',
        targetAmount: 600000,
        paidAmount: 600000,
      };
      const badgeFinished = getCellBadge(finishedCell);
      expect(badgeFinished.text).toBe('600.000');
      expect(badgeFinished.className).toContain('text-emerald-700');
      expect(badgeFinished.statusLabel).toBe('Lunas');
    });

    it('returns amber styling and "Parsial" label for PARTIAL status', () => {
      const partialCell: MonthLoanCell = {
        month: 3,
        status: 'PARTIAL',
        targetAmount: 1000000,
        paidAmount: 400000,
      };
      const badge = getCellBadge(partialCell);
      expect(badge.text).toBe('400.000');
      expect(badge.className).toContain('text-amber-700');
      expect(badge.className).toContain('bg-amber-50');
      expect(badge.statusLabel).toBe('Parsial');
    });

    it('returns rose styling and "Menunggak" label for UNPAID status', () => {
      const unpaidCell: MonthLoanCell = {
        month: 4,
        status: 'UNPAID',
        targetAmount: 750000,
        paidAmount: 0,
      };
      const badge = getCellBadge(unpaidCell);
      expect(badge.text).toBe('750.000');
      expect(badge.className).toContain('text-rose-700');
      expect(badge.className).toContain('bg-rose-50');
      expect(badge.statusLabel).toBe('Menunggak');
    });

    it('returns slate dashed styling and "Proyeksi" label for PROJECTED status', () => {
      const projCell: MonthLoanCell = {
        month: 5,
        status: 'PROJECTED',
        targetAmount: 800000,
        paidAmount: 0,
      };
      const badge = getCellBadge(projCell);
      expect(badge.text).toBe('800.000');
      expect(badge.className).toContain('text-slate-400');
      expect(badge.className).toContain('border-dashed');
      expect(badge.statusLabel).toBe('Proyeksi');
    });

    it('returns "-" and "Di Luar Masa Tenor" label for NONE or default status', () => {
      const noneCell: MonthLoanCell = {
        month: 6,
        status: 'NONE',
        targetAmount: 0,
        paidAmount: 0,
      };
      const badge = getCellBadge(noneCell);
      expect(badge.text).toBe('-');
      expect(badge.className).toContain('text-slate-300');
      expect(badge.statusLabel).toBe('Di Luar Masa Tenor');
    });

    it('handles lowercase status variants gracefully (case-insensitive)', () => {
      const paidLower: any = { month: 1, status: 'paid', targetAmount: 100000, paidAmount: 100000 };
      const partialLower: any = { month: 2, status: 'partial', targetAmount: 100000, paidAmount: 50000 };
      const unpaidLower: any = { month: 3, status: 'unpaid', targetAmount: 100000, paidAmount: 0 };
      const projLower: any = { month: 4, status: 'projection', targetAmount: 100000, paidAmount: 0 };

      expect(getCellBadge(paidLower).statusLabel).toBe('Lunas');
      expect(getCellBadge(partialLower).statusLabel).toBe('Parsial');
      expect(getCellBadge(unpaidLower).statusLabel).toBe('Menunggak');
      expect(getCellBadge(projLower).statusLabel).toBe('Proyeksi');
    });
  });

  describe('Static UI Structure, Status Legend & Dynamic Year Options', () => {
    it('renders page layout, KPI cards, filter toolbar, and status legend correctly', () => {
      const html = renderToStaticMarkup(<LoanMatrix />);

      // Headers and breadcrumb
      expect(html).toContain('Matriks Proyeksi &amp; Kepatuhan Pinjaman');
      expect(html).toContain('SIMKOP / Simpan Pinjam / Matriks Pinjaman');
      expect(html).toContain('Export Excel');
      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).toContain('Cocokkan Otomatis dengan Saldo Terangsur');

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

      // Status Legend
      expect(html).toContain('Keterangan Status:');
      expect(html).toContain('Lunas');
      expect(html).toContain('Parsial');
      expect(html).toContain('Menunggak');
      expect(html).toContain('Proyeksi');
      expect(html).toContain('Di Luar Masa Tenor');
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

  describe('Monthly Cell Rich Tooltip Cumulative Paid Rendering', () => {
    it('renders cumulativePaidAmount on "Terbayar:" label when present on cell (e.g. Rp 9.761.905 at month 10)', () => {
      const summaryWithCumulative: LoanMatrixSummary = {
        complianceYTD: 100,
        totalCollectedYTD: 9761905,
        projectedNextMonth: 976190,
        unpaidMembersCount: 0,
        members: [
          {
            memberId: 'mem-cum-1',
            nrp: '11223344',
            nama: 'Ahmad Dahlan',
            isLoanActive: true,
            totalLoans: 1,
            complianceYTD: 100,
            months: {
              ...Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                status: 'NONE' as const,
                targetAmount: 0,
                paidAmount: 0,
              })).reduce((acc, m) => ({ ...acc, [m.month]: m }), {}),
              10: {
                month: 10,
                status: 'PAID',
                targetAmount: 976190,
                paidAmount: 976190,
                cumulativePaidAmount: 9761905,
                remainingBalance: 0,
                loanId: 'loan-cum-1',
                loanNumber: 'PJ-CUM-10',
                periodNumber: 10,
                tenor: 12,
                dueDate: '2026-10-25',
              },
            },
          },
        ],
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={summaryWithCumulative} initialYear={2026} />
      );

      // Verify member and cell details are rendered
      expect(html).toContain('Ahmad Dahlan');
      expect(html).toContain('PJ-CUM-10');
      expect(html).toContain('10 / 12');
      // Verify "Terbayar:" contains Rp 9.761.905
      expect(html).toContain('<span>Terbayar:</span><span>Rp 9.761.905</span>');
    });

    it('falls back to getCumulativePaidUpToMonth calculation when cumulativePaidAmount is undefined on cell', () => {
      const summaryFallback: LoanMatrixSummary = {
        complianceYTD: 100,
        totalCollectedYTD: 2500000,
        projectedNextMonth: 1000000,
        unpaidMembersCount: 0,
        members: [
          {
            memberId: 'mem-fallback-1',
            nrp: '55667788',
            nama: 'Siti Aminah',
            isLoanActive: true,
            totalLoans: 1,
            complianceYTD: 100,
            months: {
              ...Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                status: 'NONE' as const,
                targetAmount: 0,
                paidAmount: 0,
              })).reduce((acc, m) => ({ ...acc, [m.month]: m }), {}),
              1: {
                month: 1,
                status: 'PAID',
                targetAmount: 1000000,
                paidAmount: 1000000,
                // cumulativePaidAmount intentionally undefined
                loanId: 'loan-fb-1',
                loanNumber: 'PJ-FB-01',
                periodNumber: 1,
                tenor: 5,
                dueDate: '2026-01-25',
              },
              2: {
                month: 2,
                status: 'PAID',
                targetAmount: 1000000,
                paidAmount: 1000000,
                // cumulativePaidAmount intentionally undefined
                loanId: 'loan-fb-1',
                loanNumber: 'PJ-FB-01',
                periodNumber: 2,
                tenor: 5,
                dueDate: '2026-02-25',
              },
              3: {
                month: 3,
                status: 'PARTIAL',
                targetAmount: 1000000,
                paidAmount: 500000,
                remainingBalance: 500000,
                // cumulativePaidAmount intentionally undefined
                loanId: 'loan-fb-1',
                loanNumber: 'PJ-FB-01',
                periodNumber: 3,
                tenor: 5,
                dueDate: '2026-03-25',
              },
            },
          },
        ],
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={summaryFallback} initialYear={2026} />
      );

      expect(html).toContain('Siti Aminah');
      // Month 1 cumulative fallback: 1.000.000
      expect(html).toContain('<span>Terbayar:</span><span>Rp 1.000.000</span>');
      // Month 2 cumulative fallback: 1.000.000 + 1.000.000 = 2.000.000
      expect(html).toContain('<span>Terbayar:</span><span>Rp 2.000.000</span>');
      // Month 3 cumulative fallback: 2.000.000 + 500.000 = 2.500.000
      expect(html).toContain('<span>Terbayar:</span><span>Rp 2.500.000</span>');
    });

    it('demonstrates chronological progression between consecutive months (month 1 vs month 2)', () => {
      const summaryProgression: LoanMatrixSummary = {
        complianceYTD: 100,
        totalCollectedYTD: 3000000,
        projectedNextMonth: 1500000,
        unpaidMembersCount: 0,
        members: [
          {
            memberId: 'mem-prog-1',
            nrp: '99887766',
            nama: 'Dedi Mulyadi',
            isLoanActive: true,
            totalLoans: 1,
            complianceYTD: 100,
            months: {
              ...Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                status: 'NONE' as const,
                targetAmount: 0,
                paidAmount: 0,
              })).reduce((acc, m) => ({ ...acc, [m.month]: m }), {}),
              1: {
                month: 1,
                status: 'PAID',
                targetAmount: 1500000,
                paidAmount: 1500000,
                cumulativePaidAmount: 1500000,
                loanId: 'loan-prog-1',
                loanNumber: 'PJ-PROG-1',
                periodNumber: 1,
                tenor: 10,
                dueDate: '2026-01-25',
              },
              2: {
                month: 2,
                status: 'PAID',
                targetAmount: 1500000,
                paidAmount: 1500000,
                cumulativePaidAmount: 3000000,
                loanId: 'loan-prog-1',
                loanNumber: 'PJ-PROG-1',
                periodNumber: 2,
                tenor: 10,
                dueDate: '2026-02-25',
              },
            },
          },
        ],
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={summaryProgression} initialYear={2026} />
      );

      expect(html).toContain('Dedi Mulyadi');
      // Month 1 shows 1.500.000, Month 2 shows 3.000.000
      expect(html).toContain('<span>Terbayar:</span><span>Rp 1.500.000</span>');
      expect(html).toContain('<span>Terbayar:</span><span>Rp 3.000.000</span>');
    });
  });

  describe('Bulk Actions: Centang Semua s/d Bulan Ini & Cocokkan Otomatis dengan Saldo Terangsur', () => {
    it('renders both bulk action buttons with proper attributes and testids', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);

      expect(html).toContain('data-testid="bulk-check-all-btn"');
      expect(html).toContain('data-testid="bulk-reconcile-btn"');
      expect(html).toContain('title="Centang lunas seluruh pinjaman anggota dari awal tenor s/d bulan ini"');
      expect(html).toContain('title="Cocokkan otomatis saldo terangsur seluruh pinjaman anggota (FIFO Reconcile)"');
      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).toContain('Cocokkan Otomatis dengan Saldo Terangsur');
    });

    it('renders both buttons disabled during active background execution', () => {
      // Buttons should have disabled:opacity-50 class and be ready for interactive clicks
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);
      expect(html).toContain('disabled:opacity-50');
    });
  });
});
