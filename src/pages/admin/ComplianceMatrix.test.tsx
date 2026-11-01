import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ComplianceMatrix,
  loadComplianceAvailableYearsData,
  fetchComplianceMatrixData,
} from './ComplianceMatrix';
import { getSavingsComplianceAvailableYears } from '../../services/complianceService';
import { getComplianceMatrixData, ComplianceMatrixResult } from '../../services/matrixService';
import { supabase } from '../../lib/supabaseClient';

// Mock layout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock MemberLedgerModal
vi.mock('../../components/members/MemberLedgerModal', () => ({
  default: () => null,
}));

// Mock complianceService
vi.mock('../../services/complianceService', () => ({
  getSavingsComplianceAvailableYears: vi.fn().mockResolvedValue([2026, 2025, 2024, 2023]),
}));

// Mock matrixService
const { mockMatrixResult } = vi.hoisted(() => ({
  mockMatrixResult: {
    rows: [
      {
        member_id: 'm-1',
        nrp: '12345678',
        nama: 'Budi Santoso',
        pokokLunas: true,
        compliance: 100,
        months: Array(12).fill({
          w: 25000,
          b: 50000,
          l: 50000,
          bal_w: 300000,
          bal_b: 600000,
          bal_l: 600000,
        }),
      },
    ],
    targets: { wajib: 25000, belanja: 50000, lebaran: 50000 },
  },
}));

vi.mock('../../services/matrixService', () => ({
  getComplianceMatrixData: vi.fn().mockImplementation(() => Promise.resolve(mockMatrixResult)),
}));

// Mock supabaseClient
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { amount: 100000, transaction_type: 'deposit' },
            { amount: 20000, transaction_type: 'withdrawal' },
          ],
          error: null,
        }),
      }),
    }),
  },
}));

describe('ComplianceMatrix Component - Dynamic Year Dropdown & Matrix Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Static UI Structure & Dynamic Year Options Rendering', () => {
    it('renders page layout, title, KPI cards, and filter toolbar elements', () => {
      const html = renderToStaticMarkup(<ComplianceMatrix />);

      // Headers and breadcrumbs
      expect(html).toContain('Matriks Tracking Pembayaran Simpanan Tahunan');
      expect(html).toContain('SIMKOP');
      expect(html).toContain('Matriks Pembayaran');

      // KPI card titles
      expect(html).toContain('Tingkat Kepatuhan (YTD)');
      expect(html).toContain('Total Setoran Terkumpul');
      expect(html).toContain('Anggota Menunggak Bulan Ini');

      // Controls toolbar
      expect(html).toContain('Semua Jenis Simpanan');
      expect(html).toContain('Cari NRP / Nama Anggota...');
      expect(html).toContain('Export Rekap Excel');
      expect(html).toContain('Kirim Pengingat');
    });

    it('renders dynamic year dropdown options with [2026, 2025, 2024, 2023]', () => {
      const years = [2026, 2025, 2024, 2023];
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialAvailableYears={years} initialYear="2026" />
      );

      // Verify each option exists in the rendered HTML with "Tahun <year>" format
      expect(html).toMatch(/<option [^>]*value="2026"[^>]*>[\s\n]*Tahun 2026[\s\n]*<\/option>/);
      expect(html).toMatch(/<option [^>]*value="2025"[^>]*>[\s\n]*Tahun 2025[\s\n]*<\/option>/);
      expect(html).toMatch(/<option [^>]*value="2024"[^>]*>[\s\n]*Tahun 2024[\s\n]*<\/option>/);
      expect(html).toMatch(/<option [^>]*value="2023"[^>]*>[\s\n]*Tahun 2023[\s\n]*<\/option>/);
    });

    it('renders selected year label in KPI card when switching initialYear to 2024', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialAvailableYears={[2026, 2025, 2024, 2023]}
          initialYear="2024"
        />
      );

      // Total Setoran KPI card displays the selected year
      expect(html).toContain('Total Setoran Terkumpul (2024)');
    });

    it('renders current year as fallback option when no available years provided', () => {
      const currentYear = new Date().getFullYear().toString();
      const html = renderToStaticMarkup(<ComplianceMatrix />);

      expect(html).toMatch(
        new RegExp(`<option [^>]*value="${currentYear}"[^>]*>[\\s\\n]*Tahun ${currentYear}[\\s\\n]*</option>`)
      );
    });
  });

  describe('loadComplianceAvailableYearsData Resolver Logic', () => {
    it('fetches dynamic years and retains current year if present in available years', async () => {
      const setAvailableYears = vi.fn();
      let updatedYear: string | undefined;
      const setYear = vi.fn((updater: (prev: string) => string) => {
        updatedYear = updater('2026');
      });

      const years = await loadComplianceAvailableYearsData(setAvailableYears, setYear);

      expect(getSavingsComplianceAvailableYears).toHaveBeenCalledTimes(1);
      expect(setAvailableYears).toHaveBeenCalledWith([2026, 2025, 2024, 2023]);
      expect(years).toEqual([2026, 2025, 2024, 2023]);
      // 2026 is in the list, so it stays '2026'
      expect(updatedYear).toBe('2026');
    });

    it('selects newest available year (years[0]) if current year is not in available years list', async () => {
      const setAvailableYears = vi.fn();
      let updatedYear: string | undefined;
      const setYear = vi.fn((updater: (prev: string) => string) => {
        // Assume previous year was '2020' which is not in [2026, 2025, 2024, 2023]
        updatedYear = updater('2020');
      });

      await loadComplianceAvailableYearsData(setAvailableYears, setYear);

      expect(updatedYear).toBe('2026');
    });

    it('handles service errors gracefully and returns empty array', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (getSavingsComplianceAvailableYears as any).mockRejectedValueOnce(new Error('Network error'));

      const setAvailableYears = vi.fn();
      const setYear = vi.fn();

      const years = await loadComplianceAvailableYearsData(setAvailableYears, setYear);

      expect(years).toEqual([]);
      expect(setAvailableYears).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('fetchComplianceMatrixData & Year Selection Flow', () => {
    it('fetches compliance matrix and deposit transactions for selected year (2026) and handles loading cycle', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();
      const setTargets = vi.fn();
      const setTotalSetoran = vi.fn();

      const result = await fetchComplianceMatrixData(
        2026,
        setLoading,
        setData,
        setTargets,
        setTotalSetoran
      );

      // Verify loading state cycle
      expect(setLoading).toHaveBeenCalledWith(true);
      expect(setLoading).toHaveBeenLastCalledWith(false);

      // Verify matrixService call
      expect(getComplianceMatrixData).toHaveBeenCalledWith(2026);
      expect(setData).toHaveBeenCalledWith(mockMatrixResult.rows);
      expect(setTargets).toHaveBeenCalledWith(mockMatrixResult.targets);

      // Verify supabase transactions query with for_year 2026
      expect(supabase.from).toHaveBeenCalledWith('deposit_transactions');
      // Total setoran calculation: 100000 deposit - 20000 withdrawal = 80000
      expect(setTotalSetoran).toHaveBeenCalledWith(80000);
      expect(result).toEqual({
        rows: mockMatrixResult.rows,
        targets: mockMatrixResult.targets,
        totalSetoran: 80000,
      });
    });

    it('fetches matrix data when switching year filter to 2024', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();
      const setTargets = vi.fn();
      const setTotalSetoran = vi.fn();

      const result = await fetchComplianceMatrixData(
        '2024',
        setLoading,
        setData,
        setTargets,
        setTotalSetoran
      );

      // Verify numeric conversion and call with 2024
      expect(getComplianceMatrixData).toHaveBeenCalledWith(2024);
      expect(result).not.toBeNull();
    });

    it('handles matrix service error gracefully without uncaught exception', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (getComplianceMatrixData as any).mockRejectedValueOnce(new Error('Query timeout'));

      const setLoading = vi.fn();
      const setData = vi.fn();
      const setTargets = vi.fn();
      const setTotalSetoran = vi.fn();

      const result = await fetchComplianceMatrixData(
        2025,
        setLoading,
        setData,
        setTargets,
        setTotalSetoran
      );

      expect(setLoading).toHaveBeenCalledWith(true);
      expect(setLoading).toHaveBeenLastCalledWith(false);
      expect(setData).not.toHaveBeenCalled();
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
