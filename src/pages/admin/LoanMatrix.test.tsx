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
  default: (props: any) => (
    <div
      data-testid="loan-ledger-modal"
      data-loan-id={props.loanId}
      data-nrp={props.memberNrp}
      data-name={props.memberName}
    />
  ),
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
      expect(html).not.toContain('Cocokkan Otomatis dengan Saldo Terangsur');

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

  describe('Bulk Actions: Centang Semua s/d Bulan Ini (Tanpa Cocokkan Otomatis)', () => {
    it('renders Centang Semua s/d Bulan Ini and omits removed Cocokkan Otomatis button', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);

      expect(html).toContain('data-testid="bulk-check-all-btn"');
      expect(html).not.toContain('data-testid="bulk-reconcile-btn"');
      expect(html).toContain('title="Centang lunas seluruh pinjaman anggota pasca saldo awal s/d bulan ini"');
      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).not.toContain('Cocokkan Otomatis dengan Saldo Terangsur');
    });

    it('renders buttons disabled during active background execution', () => {
      // Buttons should have disabled:opacity-50 class and be ready for interactive clicks
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);
      expect(html).toContain('disabled:opacity-50');
    });

    it('renders the bulk check button with initial state ready to trigger confirmation dialog', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);
      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).toContain('data-testid="bulk-check-all-btn"');
    });
  });

  describe('Relocation of Action Buttons to Filter Toolbar Row (Phase 64)', () => {
    it('ensures page header is clean without action buttons or any button elements', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);

      // Find the header segment (from page title to KPI cards container)
      const headerStartIndex = html.indexOf('Matriks Proyeksi &amp; Kepatuhan Pinjaman');
      const kpiStartIndex = html.indexOf('Kepatuhan YTD');
      expect(headerStartIndex).toBeGreaterThan(-1);
      expect(kpiStartIndex).toBeGreaterThan(headerStartIndex);

      const headerSlice = html.slice(headerStartIndex, kpiStartIndex);

      // Header must contain breadcrumb
      expect(headerSlice).toContain('SIMKOP / Simpan Pinjam / Matriks Pinjaman');

      // Header must NOT contain action buttons or any button
      expect(headerSlice).not.toContain('<button');
      expect(headerSlice).not.toContain('bulk-check-all-btn');
      expect(headerSlice).not.toContain('bulk-reconcile-btn');
      expect(headerSlice).not.toContain('export-excel-btn');
      expect(headerSlice).not.toContain('Export Excel');
      expect(headerSlice).not.toContain('Centang Semua s/d Bulan Ini');
      expect(headerSlice).not.toContain('Cocokkan Otomatis');
    });

    it('renders action buttons inside the filter toolbar container alongside year selector', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);

      // Find the filter toolbar segment (between Filter Toolbar container and Status Legend)
      const toolbarStartIndex = html.indexOf('Cari NRP atau Nama...');
      const legendStartIndex = html.indexOf('Keterangan Status:');
      expect(toolbarStartIndex).toBeGreaterThan(-1);
      expect(legendStartIndex).toBeGreaterThan(toolbarStartIndex);

      const toolbarSlice = html.slice(toolbarStartIndex, legendStartIndex);

      // Verify presence of all key components within the toolbar
      expect(toolbarSlice).toContain('Cari NRP atau Nama...');
      expect(toolbarSlice).toContain('Semua Status');
      expect(toolbarSlice).toContain('data-testid="bulk-check-all-btn"');
      expect(toolbarSlice).toContain('Centang Semua s/d Bulan Ini');
      expect(toolbarSlice).not.toContain('data-testid="bulk-reconcile-btn"');
      expect(toolbarSlice).not.toContain('Cocokkan Otomatis dengan Saldo Terangsur');
      expect(toolbarSlice).toContain('data-testid="export-excel-btn"');
      expect(toolbarSlice).toContain('Export Excel');
      expect(toolbarSlice).toContain('Tahun:');

      // Verify chronological / DOM ordering in toolbar:
      // Search -> Status Filter -> Bulk Check -> Export Excel -> Year Selector
      const searchPos = toolbarSlice.indexOf('Cari NRP atau Nama...');
      const filterPos = toolbarSlice.indexOf('Semua Status');
      const checkAllPos = toolbarSlice.indexOf('data-testid="bulk-check-all-btn"');
      const exportPos = toolbarSlice.indexOf('data-testid="export-excel-btn"');
      const yearPos = toolbarSlice.indexOf('Tahun:');

      expect(searchPos).toBeLessThan(filterPos);
      expect(filterPos).toBeLessThan(checkAllPos);
      expect(checkAllPos).toBeLessThan(exportPos);
      expect(exportPos).toBeLessThan(yearPos);
    });

    it('renders visual separator and proper styling for export excel button in filter toolbar', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={mockSummaryData as any} />);

      // Visual divider between action buttons and year dropdown
      expect(html).toContain('h-6 w-px bg-slate-200 hidden sm:block mx-1');

      // Export excel button styling
      expect(html).toContain('bg-slate-700 hover:bg-slate-800');
    });
  });

  describe('Multi-Loan per Member UI Rendering & Ledger Modal Integration (Phase 77)', () => {
    const multiLoanMemberSummary: LoanMatrixSummary = {
      complianceYTD: 85,
      totalCollectedYTD: 25000000,
      projectedNextMonth: 3500000,
      unpaidMembersCount: 1,
      members: [
        {
          id: 'loan-yanto-reguler',
          loanId: 'loan-yanto-reguler',
          loanNumber: 'PJ-2026-001',
          memberId: 'mem-yanto',
          nrp: '96316880',
          nama: 'Yanto Santoso',
          loanTypeName: 'Pinjaman Reguler',
          agreedTenorMonths: 12,
          tenor: 12,
          isLoanActive: true,
          totalLoans: 2,
          complianceYTD: 100,
          months: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            status: 'PAID' as const,
            targetAmount: 1000000,
            paidAmount: 1000000,
            loanId: 'loan-yanto-reguler',
            loanNumber: 'PJ-2026-001',
            tenor: 12,
          })).reduce((acc, m) => ({ ...acc, [m.month]: m }), {}),
        },
        {
          id: 'loan-yanto-khusus',
          loanId: 'loan-yanto-khusus',
          loanNumber: 'PJ-2026-002',
          memberId: 'mem-yanto',
          nrp: '96316880',
          nama: 'Yanto Santoso',
          loanTypeName: 'Pinjaman Khusus',
          agreedTenorMonths: 24,
          tenor: 24,
          isLoanActive: true,
          totalLoans: 2,
          complianceYTD: 70,
          months: Array.from({ length: 12 }, (_, i) => ({
            month: i + 1,
            status: i < 6 ? ('PAID' as const) : ('UNPAID' as const),
            targetAmount: 1500000,
            paidAmount: i < 6 ? 1500000 : 0,
            loanId: 'loan-yanto-khusus',
            loanNumber: 'PJ-2026-002',
            tenor: 24,
          })).reduce((acc, m) => ({ ...acc, [m.month]: m }), {}),
        },
      ],
    };

    it('renders 2 distinct rows for a member who has 2 active loans simultaneously', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={multiLoanMemberSummary} />);

      // Both rows should show Yanto Santoso and NRP
      const yantoMatches = html.match(/>Yanto Santoso</g);
      expect(yantoMatches).toHaveLength(2);

      const nrpMatches = html.match(/96316880/g);
      expect(nrpMatches).toHaveLength(2);

      // Pagination accurately reflects 2 loans from 1 unique member
      expect(html).toContain('dari 2 pinjaman (1 anggota)');
    });

    it('renders shortened tenor badges without loan type name, narrowed column width, and loan numbers on each row', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={multiLoanMemberSummary} />);

      // Narrowed ANGGOTA column width classes on header and cells
      expect(html).toContain('min-w-[185px] max-w-[205px] w-[195px]');

      // First loan: shortened (12 Bln) badge & PJ-2026-001 (without verbose loan type name)
      expect(html).toContain('(12 Bln)');
      expect(html).not.toContain('Pinjaman Reguler');
      expect(html).toContain('PJ-2026-001');

      // Second loan: shortened (24 Bln) badge & PJ-2026-002 (without verbose loan type name)
      expect(html).toContain('(24 Bln)');
      expect(html).not.toContain('Pinjaman Khusus');
      expect(html).toContain('PJ-2026-002');
    });

    it('renders action buttons with specific loanId targets for each row', () => {
      const html = renderToStaticMarkup(<LoanMatrix initialData={multiLoanMemberSummary} />);

      // First row button points to loan-yanto-reguler
      expect(html).toContain('data-testid="view-ledger-loan-yanto-reguler"');

      // Second row button points to loan-yanto-khusus
      expect(html).toContain('data-testid="view-ledger-loan-yanto-khusus"');
    });

    it('opens loan ledger modal with the exact loanId and member credentials', () => {
      const html = renderToStaticMarkup(
        <LoanMatrix
          initialData={multiLoanMemberSummary}
          initialSelectedLoan={{
            loanId: 'loan-yanto-khusus',
            nrp: '96316880',
            nama: 'Yanto Santoso',
          }}
        />
      );

      // Verify modal is rendered with the second loan credentials
      expect(html).toContain('data-testid="loan-ledger-modal"');
      expect(html).toContain('data-loan-id="loan-yanto-khusus"');
      expect(html).toContain('data-nrp="96316880"');
      expect(html).toContain('data-name="Yanto Santoso"');
    });

    it('gracefully renders tenor badge when loanTypeName and loan_types are missing', () => {
      const fallbackSummary: LoanMatrixSummary = {
        ...multiLoanMemberSummary,
        members: [
          {
            ...multiLoanMemberSummary.members[0],
            loanTypeName: undefined,
            loan_types: undefined,
            agreedTenorMonths: 10,
          },
        ],
      };

      const html = renderToStaticMarkup(<LoanMatrix initialData={fallbackSummary} />);
      expect(html).toContain('(10 Bln)');
      expect(html).not.toContain('Pinjaman (10 Bln)');
    });
  });

  describe('Saldo Pra-Jan (Akumulasi Lampau) Column Rendering (Phase 91)', () => {
    const priorYearSummaryData: LoanMatrixSummary = {
      year: 2026,
      complianceYTD: 100,
      totalCollectedYTD: 25000000,
      projectedNextMonth: 5000000,
      unpaidMembersCount: 0,
      members: [
        {
          memberId: 'mem-prior-1',
          loanId: 'loan-prior-1',
          nrp: '11223344',
          nama: 'Agus Setiawan',
          principalAmount: 12000000,
          priorYearPaid: 5000000,
          priorYearRemaining: 7000000,
          isLoanActive: true,
          totalLoans: 1,
          complianceYTD: 100,
          months: {
            1: { month: 1, status: 'PAID', targetAmount: 1000000, paidAmount: 1000000 },
            2: { month: 2, status: 'PAID', targetAmount: 1000000, paidAmount: 1000000 },
            3: { month: 3, status: 'PAID', targetAmount: 1000000, paidAmount: 1000000 },
            4: { month: 4, status: 'PAID', targetAmount: 1000000, paidAmount: 1000000 },
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
    };

    it('renders the header "Saldo Awal Pinjaman" with subtitle "Sah per Jan-26"', () => {
      const html = renderToStaticMarkup(
        <LoanMatrix initialData={priorYearSummaryData} initialYear={2026} />
      );

      expect(html).toContain('Saldo Awal Pinjaman');
      expect(html).toContain('Sah per Jan-26');
      expect(html).toContain('min-w-[145px] max-w-[160px] w-[150px]');
      expect(html).toContain('px-2.5 py-2.5');
    });

    it('dynamically slices the 2-digit year for the column header fallback (e.g. 2025 -> "Sah per Jan-25")', () => {
      const html = renderToStaticMarkup(
        <LoanMatrix initialData={{ ...priorYearSummaryData, year: 2025 }} initialYear={2025} />
      );

      expect(html).toContain('Saldo Awal Pinjaman');
      expect(html).toContain('Sah per Jan-25');
    });

    it('renders prior year repayment summary cell with Pokok, Terbayar, and Sisa amounts', () => {
      const html = renderToStaticMarkup(
        <LoanMatrix initialData={priorYearSummaryData} initialYear={2026} />
      );

      expect(html).toContain('data-testid="prior-summary-mem-prior-1"');
      expect(html).toContain('Terbayar:');
      // Pokok
      expect(html).toContain('Rp 12.000.000');
      // Terbayar / openingPaid
      expect(html).toContain('Rp 5.000.000');
      // Sisa
      expect(html).toContain('Rp 7.000.000');
    });

    it('renders Rp 0 fallback when principalAmount, priorYearPaid, or priorYearRemaining are missing', () => {
      const missingPriorData: LoanMatrixSummary = {
        ...priorYearSummaryData,
        members: [
          {
            ...priorYearSummaryData.members[0],
            memberId: 'mem-missing-prior',
            principalAmount: undefined,
            priorYearPaid: undefined,
            priorYearRemaining: undefined,
          },
        ],
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={missingPriorData} initialYear={2026} />
      );

      expect(html).toContain('data-testid="prior-summary-mem-missing-prior"');
      expect(html).toContain('Rp 0');
    });

    it('sets colSpan={15} on loading state and empty state rows', () => {
      // Empty state (initialData with empty members list)
      const emptyHtml = renderToStaticMarkup(
        <LoanMatrix
          initialData={{
            year: 2026,
            complianceYTD: 0,
            totalCollectedYTD: 0,
            projectedNextMonth: 0,
            unpaidMembersCount: 0,
            members: [],
          }}
          initialYear={2026}
        />
      );
      expect(emptyHtml).toContain('colSpan="15"');
      expect(emptyHtml).toContain('Tidak ada data untuk tahun 2026');

      // Loading state
      const loadingHtml = renderToStaticMarkup(<LoanMatrix initialData={undefined} />);
      expect(loadingHtml).toContain('colSpan="15"');
      expect(loadingHtml).toContain('Memuat data matriks...');
    });
  });

  describe('Completed Loan Tooltip & Compliance Alignment', () => {
    it('renders "Sisa Angsuran: Rp 0 (Lunas)" with text-emerald-400 and 100% compliance for inactive / completed loans', () => {
      const completedLoanData: LoanMatrixSummary = {
        year: 2026,
        complianceYTD: 100,
        totalCollectedYTD: 10000000,
        projectedNextMonth: 0,
        unpaidMembersCount: 0,
        members: [
          {
            memberId: 'mem-completed-1',
            nrp: '11122233',
            nama: 'Kapten Selesai',
            isLoanActive: false,
            status: 'completed',
            totalLoans: 1,
            complianceYTD: 80, // initially 80, but completed should force 100%
            months: {
              1: {
                month: 1,
                year: 2026,
                status: 'PAID',
                targetAmount: 1000000,
                paidAmount: 1000000,
                remainingBalance: 0,
                loanId: 'loan-comp-1',
                loanNumber: 'PJ-COMP-001',
                periodNumber: 1,
                tenor: 10,
              },
              2: {
                month: 2,
                year: 2026,
                status: 'FINISHED',
                targetAmount: 1000000,
                paidAmount: 0,
                remainingBalance: 500000, // even if lingering balance exists in old cell data
                loanId: 'loan-comp-1',
                loanNumber: 'PJ-COMP-001',
                periodNumber: 2,
                tenor: 10,
              },
              3: { month: 3, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              4: { month: 4, status: 'NONE', targetAmount: 0, paidAmount: 0 },
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
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={completedLoanData} initialYear={2026} />
      );

      // Verify status badge says "Selesai"
      expect(html).toContain('Selesai');
      // Verify tooltip displays Sisa Angsuran: Rp 0 (Lunas) with text-emerald-400
      expect(html).toContain('text-emerald-400');
      expect(html).toContain('Sisa Angsuran:');
      expect(html).toContain('Rp 0 (Lunas)');
      // Verify compliance badge shows 100%
      expect(html).toContain('100%');
    });

    it('renders amber remaining balance for active loans with partial unpaid amounts', () => {
      const activePartialLoanData: LoanMatrixSummary = {
        year: 2026,
        complianceYTD: 50,
        totalCollectedYTD: 500000,
        projectedNextMonth: 1000000,
        unpaidMembersCount: 1,
        members: [
          {
            memberId: 'mem-active-partial',
            nrp: '44455566',
            nama: 'Lettu Aktif',
            isLoanActive: true,
            status: 'active',
            totalLoans: 1,
            complianceYTD: 50,
            months: {
              1: {
                month: 1,
                year: 2026,
                status: 'PARTIAL',
                targetAmount: 1000000,
                paidAmount: 500000,
                remainingBalance: 500000,
                loanId: 'loan-act-1',
                loanNumber: 'PJ-ACT-001',
                periodNumber: 1,
                tenor: 5,
              },
              2: { month: 2, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              3: { month: 3, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              4: { month: 4, status: 'NONE', targetAmount: 0, paidAmount: 0 },
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
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={activePartialLoanData} initialYear={2026} />
      );

      expect(html).toContain('Aktif');
      expect(html).toContain('text-amber-400');
      expect(html).toContain('Rp 500.000');
      expect(html).toContain('50%');
    });
  });

  describe('Cut-Off Saldo Awal Utuh & Angsuran Maju (Cut-Off Forward Mode)', () => {
    it('hides pre-cut-off month columns (Jan-Okt) and displays opening balance Sah per 1 Nov 2026', () => {
      const cutoffData: LoanMatrixSummary = {
        year: 2026,
        cutoffDate: '2026-11-01',
        cutoffYear: 2026,
        cutoffMonth: 11,
        formattedCutoffDate: '1 Nov 2026',
        complianceYTD: 100,
        totalCollectedYTD: 1000000,
        projectedNextMonth: 1000000,
        unpaidMembersCount: 0,
        members: [
          {
            memberId: 'mem-cut-1',
            loanId: 'loan-cut-1',
            nrp: '77889900',
            nama: 'Kapten CutOff',
            principalAmount: 60000000,
            openingPaid: 52000000,
            openingRemaining: 8000000,
            priorYearPaid: 52000000,
            priorYearRemaining: 8000000,
            isLoanActive: true,
            totalLoans: 1,
            complianceYTD: 100,
            months: {
              1: { month: 1, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              2: { month: 2, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              3: { month: 3, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              4: { month: 4, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              5: { month: 5, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              6: { month: 6, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              7: { month: 7, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              8: { month: 8, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              9: { month: 9, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              10: { month: 10, status: 'NONE', targetAmount: 0, paidAmount: 0 },
              11: { month: 11, status: 'PAID', targetAmount: 1000000, paidAmount: 1000000, periodNumber: 53, tenor: 60 },
              12: { month: 12, status: 'PROJECTED', targetAmount: 1000000, paidAmount: 0, periodNumber: 54, tenor: 60 },
            },
          },
        ],
      };

      const html = renderToStaticMarkup(
        <LoanMatrix initialData={cutoffData} initialYear={2026} />
      );

      expect(html).toContain('Saldo Awal Pinjaman');
      expect(html).toContain('Sah per 1 Nov 2026');
      expect(html).toContain('Rp 52.000.000');
      expect(html).toContain('Rp 8.000.000');

      const theadSlice = html.slice(html.indexOf('<thead'), html.indexOf('</thead>'));
      expect(theadSlice).toContain('>Nov<');
      expect(theadSlice).toContain('>Des<');
      expect(theadSlice).not.toContain('>Jan<');
      expect(theadSlice).not.toContain('>Okt<');
      expect(html).not.toContain('Cocokkan Otomatis dengan Saldo Terangsur');
    });
  });
});
