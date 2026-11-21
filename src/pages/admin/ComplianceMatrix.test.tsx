import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ComplianceMatrix,
  rowMatchesSavingsSearch,
  normalizeDepositFilterType,
  parseShortPeriodParam,
  loadComplianceAvailableYearsData,
  fetchComplianceMatrixData,
  fetchComplianceData,
  handleBulkCheckAllUpToNow,
  handleGlobalCheckAllUntilCurrentMonth,
  computeBulkCheckTargetMonths,
  buildBulkCheckPlan,
  handleExportSavingsMatrix,
  handleImportMatrixSuccess,
} from './ComplianceMatrix';
import { DEFAULT_RATE_TIERS } from '../../services/savingsRateService';
import {
  getSavingsComplianceAvailableYears,
  getComplianceMatrixData,
  ComplianceMatrixResult,
  ComplianceMatrixRow,
} from '../../services/complianceService';
import { bulkCheckAllUpToCurrentMonth } from '../../services/savingsMatrixService';
import { supabase } from '../../lib/supabaseClient';
import { exportSavingsMatrixExcel } from '../../utils/savingsMatrixExporter';

// Mock savingsMatrixExporter
vi.mock('../../utils/savingsMatrixExporter', () => ({
  exportSavingsMatrixExcel: vi.fn().mockResolvedValue({}),
}));

// Mock SavingsMatrixImportModal
vi.mock('../../components/compliance/SavingsMatrixImportModal', () => ({
  default: ({ isOpen, onClose, onSuccess, defaultType }: any) =>
    isOpen ? (
      <div data-testid="savings-matrix-import-modal">
        <span data-testid="modal-default-type">{defaultType}</span>
        <button onClick={onClose} data-testid="import-modal-close">
          Batal
        </button>
        <button onClick={onSuccess} data-testid="import-modal-success">
          Sinkronkan
        </button>
      </div>
    ) : null,
}));

// Mock savingsMatrixService
vi.mock('../../services/savingsMatrixService', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    bulkCheckAllUpToCurrentMonth: vi.fn().mockImplementation(async (type, onProgress) => {
      onProgress?.({ current: 5, total: 10, currentMemberName: 'Budi' });
      onProgress?.({ current: 10, total: 10, currentMemberName: 'Siti' });
      return { totalSuccess: 10, totalFailed: 0 };
    }),
  };
});

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

// Mock SavingsLedgerMatrixModal
vi.mock('../../components/compliance/SavingsLedgerMatrixModal', () => ({
  default: ({ memberId, memberNrp, memberName, joinDate, onClose, onSuccess }: any) => (
    <div data-testid="savings-ledger-matrix-modal">
      <span data-testid="modal-member-id">{memberId}</span>
      <span data-testid="modal-member-nrp">{memberNrp}</span>
      <span data-testid="modal-member-name">{memberName}</span>
      <span data-testid="modal-join-date">{joinDate}</span>
      <button onClick={onClose} data-testid="modal-close-btn">Tutup</button>
      <button onClick={onSuccess} data-testid="modal-success-btn">Simpan</button>
    </div>
  ),
}));

// Mock matrixService & complianceService
const { mockMatrixResult } = vi.hoisted(() => ({
  mockMatrixResult: {
    rows: [
      {
        member_id: 'm-1',
        nrp: '12345678',
        nama: 'Budi Santoso',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 300000, b: 600000, l: 600000 },
        netSavings: {
          wajib: 500000,
          belanja: 150000,
          lebaran: 300000,
          total: 950000,
        },
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

vi.mock('../../services/complianceService', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    getSavingsComplianceAvailableYears: vi.fn().mockResolvedValue([2026, 2025, 2024, 2023]),
    getComplianceMatrixData: vi.fn().mockImplementation(() => Promise.resolve(mockMatrixResult)),
  };
});

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
      expect(html).not.toContain('Export Rekap Excel');
      expect(html).not.toContain('Kirim Pengingat');
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

  describe('SavingsLedgerMatrixModal Integration in ComplianceMatrix', () => {
    it('renders member rows with ledger matrix modal triggers (name button & Eye action button)', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={mockMatrixResult.rows} />
      );

      // Verify member name and NRP in the table row
      expect(html).toContain('Budi Santoso');
      expect(html).toContain('12345678');

      // Verify button title and aria-label for opening the ledger matrix modal
      expect(html).toContain('title="Buka Buku Besar Matriks Simpanan"');
      expect(html).toContain('aria-label="Buku Besar Budi Santoso"');
    });

    it('renders SavingsLedgerMatrixModal when an active member is selected', () => {
      const selectedMember = {
        id: 'm-1',
        nrp: '12345678',
        nama: 'Budi Santoso',
        joinDate: '2024-01-01',
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialData={mockMatrixResult.rows}
          initialSelectedMember={selectedMember}
        />
      );

      // Verify modal is rendered with member information
      expect(html).toContain('data-testid="savings-ledger-matrix-modal"');
      expect(html).toContain('data-testid="modal-member-id"');
      expect(html).toContain('m-1');
      expect(html).toContain('12345678');
      expect(html).toContain('Budi Santoso');
      expect(html).toContain('2024-01-01');
    });
  });

  describe('Full Active Member Retention Without Arrears (Kepatuhan 100%)', () => {
    it('renders all active members in table when there are no arrears in 2026', () => {
      const allMembersRows = [
        {
          member_id: 'm-1',
          nrp: 'NRP001',
          nama: 'Yanto Santoso',
          pokokLunas: true,
          compliance: 100,
          balances: { w: 300000, b: 600000, l: 600000 },
          months: Array(12).fill({ w: 25000, b: 50000, l: 50000, bal_w: 300000, bal_b: 600000, bal_l: 600000 }),
        },
        {
          member_id: 'm-2',
          nrp: 'NRP002',
          nama: 'Agus Susanto',
          pokokLunas: true,
          compliance: 100,
          balances: { w: 300000, b: 600000, l: 600000 },
          months: Array(12).fill({ w: 25000, b: 50000, l: 50000, bal_w: 300000, bal_b: 600000, bal_l: 600000 }),
        },
        {
          member_id: 'm-3',
          nrp: 'NRP003',
          nama: 'Mulyono Santoso',
          pokokLunas: true,
          compliance: 100,
          balances: { w: 300000, b: 600000, l: 600000 },
          months: Array(12).fill({ w: 25000, b: 50000, l: 50000, bal_w: 300000, bal_b: 600000, bal_l: 600000 }),
        },
        {
          member_id: 'm-4',
          nrp: 'NRP004',
          nama: 'Joko Arifin',
          pokokLunas: true,
          compliance: 100,
          balances: { w: 300000, b: 600000, l: 600000 },
          months: Array(12).fill({ w: 25000, b: 50000, l: 50000, bal_w: 300000, bal_b: 600000, bal_l: 600000 }),
        },
      ];

      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialAvailableYears={[2026, 2025]}
          initialYear="2026"
          initialData={allMembersRows}
        />
      );

      // Pastikan seluruh 4 anggota tampil di tabel
      expect(html).toContain('Yanto Santoso');
      expect(html).toContain('Agus Susanto');
      expect(html).toContain('Mulyono Santoso');
      expect(html).toContain('Joko Arifin');

      // Pastikan pesan empty state TIDAK muncul
      expect(html).not.toContain('Tidak ada data anggota ditemukan.');

      // KPI card checks: Kepatuhan 100.0% dan 0 Orang menunggak
      expect(html).toContain('100.0%');
      expect(html).toContain('0 Orang');
    });
  });

  describe('Bulk Check-All Toolbar, Modal & Execution Flow (without Auto-Reconcile)', () => {
    it('does not render "Cocokkan Otomatis Semua Anggota" button or bulk auto-reconcile modal on the toolbar', () => {
      const html = renderToStaticMarkup(<ComplianceMatrix />);
      expect(html).not.toContain('Cocokkan Otomatis Semua Anggota');
      expect(html).not.toContain('data-testid="bulk-reconcile-modal"');
    });

    it('renders toolbar button for Centang Semua s/d Bulan Ini with dynamic cut-off range title', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2026" initialCutoffDate="2026-01-01" />
      );
      expect(html).toContain('Centang Semua s/d Bulan Ini');
      expect(html).toContain('data-testid="bulk-check-all-btn"');
      expect(html).toContain('Centang lunas semua anggota periode Jan-26 s/d');
    });

    it('disables toolbar Centang Semua button with "Tahun fiskal belum berjalan" when selected year is in the future', () => {
      const futureYear = (new Date().getFullYear() + 1).toString();
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear={futureYear} initialAvailableYears={[Number(futureYear), 2026]} />
      );
      expect(html).toContain('title="Tahun fiskal belum berjalan"');
      expect(html).toMatch(/data-testid="bulk-check-all-btn"[^>]*disabled=""|disabled=""[^>]*data-testid="bulk-check-all-btn"/);
    });

    it('renders bulk check-all confirmation modal with title, cut-off warning banner, preview card, and deposit type options', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialYear="2026"
          initialCutoffDate="2026-01-01"
          initialShowCheckAllConfirmModal={true}
        />
      );

      // Verify modal is visible
      expect(html).toContain('data-testid="bulk-check-all-modal"');
      expect(html).toContain('Centang Semua Anggota s/d Bulan Ini');
      expect(html).toContain('pasca cut-off Saldo Awal s/d bulan berjalan');
      expect(html).toContain('Saldo Awal Cut-Off tidak akan diubah');
      expect(html).toContain('data-testid="bulk-check-all-confirmation"');
      expect(html).toContain('data-testid="bulk-check-preview"');

      // Verify deposit type radio options
      expect(html).toContain('Semua Jenis Simpanan');
      expect(html).toContain('Simpanan Wajib Saja');
      expect(html).toContain('Simpanan Belanja Saja');
      expect(html).toContain('Simpanan Hari Raya Saja');

      // Verify action buttons
      expect(html).toContain('Batal');
      expect(html).toContain('Mulai Centang Semua');
    });

    it('renders bulk check-all modal in-progress state with progress bar, percentage, and current member name', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialShowCheckAllConfirmModal={true}
          initialBulkChecking={true}
          initialBulkCheckProgress={{
            current: 80,
            total: 100,
            currentMemberName: 'Ahmad Dahlan',
          }}
        />
      );

      expect(html).toContain('data-testid="bulk-check-all-in-progress"');
      expect(html).toContain('Memproses 80 dari 100 anggota...');
      expect(html).toContain('80%');
      expect(html).toContain('Ahmad Dahlan');
      expect(html).toContain('Proses sedang berjalan, mohon tunggu...');
    });

    it('renders bulk check-all modal completion result state with success summary and reload button', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialShowCheckAllConfirmModal={true}
          initialBulkChecking={false}
          initialBulkCheckSummary={{
            totalSuccess: 95,
            totalFailed: 5,
          }}
        />
      );

      expect(html).toContain('data-testid="bulk-check-all-result"');
      expect(html).toContain('Centang Massal Berhasil Diselesaikan!');
      expect(html).toContain('95');
      expect(html).toContain('5');
      expect(html).toContain('Selesai &amp; Muat Ulang Matriks');
    });

    it('handleBulkCheckAllUpToNow invokes bulkCheckAllUpToCurrentMonth, tracks progress, and returns result', async () => {
      const setIsBulkChecking = vi.fn();
      const progressUpdates: any[] = [];
      const setBulkCheckProgress = vi.fn((p) => progressUpdates.push(p));
      const setBulkCheckSummary = vi.fn();
      const onComplete = vi.fn();

      const result = await handleBulkCheckAllUpToNow(
        'ALL',
        setIsBulkChecking,
        setBulkCheckProgress,
        setBulkCheckSummary,
        onComplete
      );

      expect(bulkCheckAllUpToCurrentMonth).toHaveBeenCalledWith('ALL', expect.any(Function));
      expect(setIsBulkChecking).toHaveBeenCalledWith(true);
      expect(setIsBulkChecking).toHaveBeenLastCalledWith(false);
      expect(progressUpdates).toEqual([
        { current: 0, total: 0, currentMemberName: '' },
        { current: 5, total: 10, currentMemberName: 'Budi' },
        { current: 10, total: 10, currentMemberName: 'Siti' },
      ]);
      expect(setBulkCheckSummary).toHaveBeenCalledWith({
        totalSuccess: 10,
        totalFailed: 0,
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ totalSuccess: 10, totalFailed: 0 });
    });

    it('handleBulkCheckAllUpToNow handles service exceptions gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (bulkCheckAllUpToCurrentMonth as any).mockRejectedValueOnce(new Error('Network error'));

      const setIsBulkChecking = vi.fn();
      const setBulkCheckProgress = vi.fn();
      const setBulkCheckSummary = vi.fn();

      const result = await handleBulkCheckAllUpToNow(
        'WAJIB',
        setIsBulkChecking,
        setBulkCheckProgress,
        setBulkCheckSummary
      );

      expect(setIsBulkChecking).toHaveBeenCalledWith(true);
      expect(setIsBulkChecking).toHaveBeenLastCalledWith(false);
      expect(setBulkCheckSummary).toHaveBeenCalledWith({
        totalSuccess: 0,
        totalFailed: 1,
      });
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('computeBulkCheckTargetMonths computes dynamic range from first visible post-cut-off column to current month', () => {
      const nov2026 = new Date(2026, 10, 22); // Nov 2026

      // Cut-off Per 1 Jan 2026 -> Jan-26 s/d Nov-26 (11 months)
      const janCutoff = computeBulkCheckTargetMonths(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        2026,
        nov2026
      );
      expect(janCutoff.targetMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(janCutoff.rangeLabel).toBe('Jan-26 s/d Nov-26');
      expect(janCutoff.isFutureYear).toBe(false);

      // Cut-off Per 1 Mar 2026 -> Mar-26 s/d Nov-26 (9 months)
      const marCutoff = computeBulkCheckTargetMonths(
        [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        2026,
        nov2026
      );
      expect(marCutoff.targetMonths).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
      expect(marCutoff.rangeLabel).toBe('Mar-26 s/d Nov-26');
      expect(marCutoff.isFutureYear).toBe(false);

      // Past fiscal year -> full 12 months
      const pastYear = computeBulkCheckTargetMonths(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        2025,
        nov2026
      );
      expect(pastYear.targetMonths).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(pastYear.rangeLabel).toBe('Jan-25 s/d Des-25');
      expect(pastYear.isFutureYear).toBe(false);

      // Future fiscal year -> disabled / empty
      const futureYear = computeBulkCheckTargetMonths(
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        2027,
        nov2026
      );
      expect(futureYear.targetMonths).toEqual([]);
      expect(futureYear.isFutureYear).toBe(true);
    });

    it('buildBulkCheckPlan respects filter type, skips paid/covered/suspended, calculates partial shortfalls, and excludes Dec-26', () => {
      const makeUnpaidMonth = (partialW = 0) => ({
        w: partialW,
        b: 0,
        l: 0,
        bal_w: 0,
        bal_b: 0,
        bal_l: 0,
        wajib: { status: partialW > 0 ? 'partial' : 'unpaid', amount: partialW, targetAmount: 200000 },
        belanja: { status: 'unpaid', amount: 0, targetAmount: 50000 },
        lebaran: { status: 'unpaid', amount: 0, targetAmount: 200000 },
      });

      const activeRow: any = {
        member_id: 'm-active',
        nrp: '00010001',
        nama: 'Anggota Aktif',
        status: 'aktif',
        membership_status: 'ACTIVE',
        pokokLunas: true,
        compliance: 0,
        balances: { w: 0, b: 0, l: 0 },
        months: Array.from({ length: 12 }, (_, idx) => {
          if (idx === 0) {
            // Jan already paid for WAJIB, unpaid for BELANJA & LEBARAN
            return {
              w: 200000,
              b: 0,
              l: 0,
              bal_w: 200000,
              bal_b: 0,
              bal_l: 0,
              wajib: { status: 'paid', amount: 200000, targetAmount: 200000 },
              belanja: { status: 'unpaid', amount: 0, targetAmount: 50000 },
              lebaran: { status: 'unpaid', amount: 0, targetAmount: 200000 },
            };
          }
          if (idx === 1) {
            // Feb partial 50.000 on WAJIB (shortfall 150.000)
            return makeUnpaidMonth(50000);
          }
          if (idx === 10) {
            // Nov (current month) is 'unbilled' in matrix view before payment -> must still be checked!
            return {
              w: 0,
              b: 0,
              l: 0,
              bal_w: 0,
              bal_b: 0,
              bal_l: 0,
              wajib: { status: 'unbilled', amount: 0, targetAmount: 200000 },
              belanja: { status: 'unbilled', amount: 0, targetAmount: 50000 },
              lebaran: { status: 'unbilled', amount: 0, targetAmount: 200000 },
            };
          }
          return makeUnpaidMonth(0);
        }),
      };

      const suspendedRow: any = {
        ...activeRow,
        member_id: 'm-susp',
        nrp: '00020002',
        nama: 'Anggota Beku',
        membership_status: 'SUSPENDED',
      };

      const targetMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // Jan-26 .. Nov-26 (excludes Dec-26)

      const allPlan = buildBulkCheckPlan({
        rows: [activeRow, suspendedRow],
        targetType: 'ALL',
        targetMonths,
        selectedYear: 2026,
        rateTiers: DEFAULT_RATE_TIERS,
        targets: { wajib: 200000, belanja: 50000, lebaran: 200000 },
      });

      expect(allPlan.affectedMemberCount).toBe(1);
      // 11 months * 3 types = 33 minus 1 paid (Jan WAJIB) = 32 items
      expect(allPlan.totalItems).toBe(32);
      // Verify Dec (12) is never included
      expect(allPlan.items.some((i) => i.month === 12)).toBe(false);
      // Verify Nov (11) IS included
      expect(allPlan.items.filter((i) => i.month === 11)).toHaveLength(3);
      // Verify Feb WAJIB shortfall is 150.000
      const febWajib = allPlan.items.find((i) => i.month === 2 && i.depositTypeCode === 'WAJIB');
      expect(febWajib?.amount).toBe(150000);

      // Filtered to WAJIB only
      const wajibPlan = buildBulkCheckPlan({
        rows: [activeRow],
        targetType: 'WAJIB',
        targetMonths,
        selectedYear: 2026,
        rateTiers: DEFAULT_RATE_TIERS,
        targets: { wajib: 200000, belanja: 50000, lebaran: 200000 },
      });
      expect(wajibPlan.totalItems).toBe(10); // Feb..Nov
      expect(wajibPlan.items.every((i) => i.depositTypeCode === 'WAJIB')).toBe(true);
    });

    it('handleGlobalCheckAllUntilCurrentMonth performs idempotent batch inserts into deposit_transactions and cash_flow without touching Saldo Awal or calling delete', async () => {
      const insertedDepositPayloads: any[] = [];
      const insertedCashFlowPayloads: any[] = [];
      const deleteCalls: string[] = [];

      const fromMock = vi.mocked(supabase.from);
      fromMock.mockImplementation((table: string): any => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 200000 },
                { id: 'dt-b', code: 'BELANJA', name: 'Simpanan Belanja', default_amount: 50000 },
                { id: 'dt-l', code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 200000 },
              ],
              error: null,
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-1-w', member_id: 'm-1', deposit_type_id: 'dt-w' },
                  { id: 'md-1-b', member_id: 'm-1', deposit_type_id: 'dt-b' },
                ],
                error: null,
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'md-1-l', member_id: 'm-1', deposit_type_id: 'dt-l' }],
                error: null,
              }),
            }),
            delete: vi.fn(() => {
              deleteCalls.push('member_deposits');
              return {};
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({
                      // Jan WAJIB already exists in DB (should be skipped idempotently),
                      // plus a Saldo Awal Cut-Off row that must NOT be ignored or touched.
                      data: [
                        {
                          id: 'tx-existing-jan-w',
                          member_deposit_id: 'md-1-w',
                          for_year: 2026,
                          for_month: 1,
                          amount: 200000,
                          transaction_type: 'deposit',
                          description: 'Centang Setoran Rutin Matriks (WAJIB)',
                        },
                        {
                          id: 'tx-saldo-awal',
                          member_deposit_id: 'md-1-w',
                          for_year: 2026,
                          for_month: 1,
                          amount: 3200000,
                          transaction_type: 'deposit',
                          description: 'Saldo Awal Simpanan Per 1 Jan 2026 (Cut-Off)',
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedDepositPayloads.push(...payload);
              return {
                select: vi.fn().mockResolvedValue({
                  data: payload.map((row, idx) => ({
                    id: `tx-new-${idx + 1}`,
                    member_deposit_id: row.member_deposit_id,
                    amount: row.amount,
                    for_month: row.for_month,
                    for_year: row.for_year,
                    reference_no: null,
                    created_at: '2026-11-22T01:00:00.000Z',
                  })),
                  error: null,
                }),
              };
            }),
            delete: vi.fn(() => {
              deleteCalls.push('deposit_transactions');
              return {};
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedCashFlowPayloads.push(...payload);
              return Promise.resolve({ data: payload, error: null });
            }),
            delete: vi.fn(() => {
              deleteCalls.push('cash_flow');
              return {};
            }),
          };
        }
        return {};
      });

      const plan = {
        items: [
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi Santoso',
            depositTypeCode: 'WAJIB' as const,
            month: 1,
            year: 2026,
            amount: 200000,
            targetAmount: 200000,
          },
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi Santoso',
            depositTypeCode: 'BELANJA' as const,
            month: 1,
            year: 2026,
            amount: 50000,
            targetAmount: 50000,
          },
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi Santoso',
            depositTypeCode: 'LEBARAN' as const,
            month: 2,
            year: 2026,
            amount: 200000,
            targetAmount: 200000,
          },
        ],
        affectedMemberCount: 1,
        totalItems: 3,
        totalAmount: 450000,
      };

      const setIsBulkChecking = vi.fn();
      const setBulkCheckProgress = vi.fn();
      const setBulkCheckSummary = vi.fn();
      const onComplete = vi.fn().mockResolvedValue(undefined);
      const showToast = vi.fn();

      let res: any;
      try {
        res = await handleGlobalCheckAllUntilCurrentMonth({
          plan,
          selectedYear: 2026,
          targetMonths: [1, 2],
          rangeLabel: 'Jan-26 s/d Feb-26',
          setIsBulkChecking,
          setBulkCheckProgress,
          setBulkCheckSummary,
          onComplete,
          feedback: { showToast },
        });
      } finally {
        fromMock.mockReset();
        fromMock.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { amount: 100000, transaction_type: 'deposit' },
                { amount: 20000, transaction_type: 'withdrawal' },
              ],
              error: null,
            }),
          }),
        } as any);
      }

      expect(deleteCalls).toEqual([]);
      // Only BELANJA (Jan) and LEBARAN (Feb) should be inserted; Jan WAJIB skipped by server guard
      expect(insertedDepositPayloads).toHaveLength(2);
      expect(insertedDepositPayloads[0]).toMatchObject({
        member_deposit_id: 'md-1-b',
        transaction_type: 'deposit',
        amount: 50000,
        for_month: 1,
        for_year: 2026,
      });
      expect(insertedDepositPayloads[1]).toMatchObject({
        member_deposit_id: 'md-1-l',
        transaction_type: 'deposit',
        amount: 200000,
        for_month: 2,
        for_year: 2026,
      });

      // Verify paired cash_flow rows use `direction: 'in'`, `category: 'Setoran Simpanan'`, `reference_id`
      expect(insertedCashFlowPayloads).toHaveLength(2);
      expect(insertedCashFlowPayloads[0]).toMatchObject({
        direction: 'in',
        category: 'Setoran Simpanan',
        amount: 50000,
        reference_id: 'tx-new-1',
      });
      expect(insertedCashFlowPayloads[0].description).toContain('Setoran Simpanan Belanja [Jan 2026]');
      expect(insertedCashFlowPayloads[0].description).toContain('00010001 - Budi Santoso');
      expect(insertedCashFlowPayloads[0].created_at).toBeTruthy();

      expect(res).toEqual({
        totalSuccess: 1,
        totalFailed: 0,
        insertedCount: 2,
        totalAmount: 250000,
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(showToast).toHaveBeenCalledWith(
        expect.stringContaining('2 setoran'),
        'success'
      );
    });

    it('handleGlobalCheckAllUntilCurrentMonth sorts batch items (memberNrp ASC -> depositTypeOrder -> month ASC) with sequential +10ms created_at timestamps', async () => {
      const insertedDepositPayloads: any[] = [];
      const insertedCashFlowPayloads: any[] = [];

      const fromMock = vi.mocked(supabase.from);
      fromMock.mockImplementation((table: string): any => {
        if (table === 'deposit_types') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib', default_amount: 200000 },
                { id: 'dt-b', code: 'BELANJA', name: 'Simpanan Belanja', default_amount: 50000 },
                { id: 'dt-l', code: 'LEBARAN', name: 'Simpanan Lebaran', default_amount: 200000 },
              ],
              error: null,
            }),
          };
        }
        if (table === 'member_deposits') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'md-1-w', member_id: 'm-1', deposit_type_id: 'dt-w' },
                  { id: 'md-1-b', member_id: 'm-1', deposit_type_id: 'dt-b' },
                  { id: 'md-1-l', member_id: 'm-1', deposit_type_id: 'dt-l' },
                  { id: 'md-2-w', member_id: 'm-2', deposit_type_id: 'dt-w' },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'deposit_transactions') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              }),
            }),
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedDepositPayloads.push(...payload);
              return {
                select: vi.fn().mockResolvedValue({
                  data: payload.map((row, idx) => ({
                    id: `tx-seq-${idx + 1}`,
                    member_deposit_id: row.member_deposit_id,
                    amount: row.amount,
                    for_month: row.for_month,
                    for_year: row.for_year,
                    reference_no: null,
                    created_at: row.created_at,
                  })),
                  error: null,
                }),
              };
            }),
          };
        }
        if (table === 'cash_flow') {
          return {
            insert: vi.fn().mockImplementation((payload: any[]) => {
              insertedCashFlowPayloads.push(...payload);
              return Promise.resolve({ data: payload, error: null });
            }),
          };
        }
        return {};
      });

      // Provide deliberately unsorted items across members, types, and months
      const plan = {
        items: [
          {
            memberId: 'm-2',
            memberNrp: '00020002',
            memberName: 'Zaki',
            depositTypeCode: 'WAJIB' as const,
            month: 1,
            year: 2026,
            amount: 200000,
            targetAmount: 200000,
          },
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi',
            depositTypeCode: 'LEBARAN' as const,
            month: 2,
            year: 2026,
            amount: 200000,
            targetAmount: 200000,
          },
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi',
            depositTypeCode: 'WAJIB' as const,
            month: 3,
            year: 2026,
            amount: 200000,
            targetAmount: 200000,
          },
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi',
            depositTypeCode: 'WAJIB' as const,
            month: 1,
            year: 2026,
            amount: 200000,
            targetAmount: 200000,
          },
          {
            memberId: 'm-1',
            memberNrp: '00010001',
            memberName: 'Budi',
            depositTypeCode: 'BELANJA' as const,
            month: 1,
            year: 2026,
            amount: 50000,
            targetAmount: 50000,
          },
        ],
        affectedMemberCount: 2,
        totalItems: 5,
        totalAmount: 850000,
      };

      try {
        await handleGlobalCheckAllUntilCurrentMonth({
          plan,
          selectedYear: 2026,
          targetMonths: [1, 2, 3],
          rangeLabel: 'Jan-26 s/d Mar-26',
          setIsBulkChecking: vi.fn(),
          setBulkCheckProgress: vi.fn(),
          setBulkCheckSummary: vi.fn(),
        });
      } finally {
        fromMock.mockReset();
        fromMock.mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { amount: 100000, transaction_type: 'deposit' },
                { amount: 20000, transaction_type: 'withdrawal' },
              ],
              error: null,
            }),
          }),
        } as any);
      }

      // Expected order:
      // 1. m-1 (00010001) WAJIB Jan
      // 2. m-1 (00010001) WAJIB Mar
      // 3. m-1 (00010001) BELANJA Jan
      // 4. m-1 (00010001) LEBARAN Feb
      // 5. m-2 (00020002) WAJIB Jan
      expect(insertedDepositPayloads.map((p) => `${p.member_deposit_id}:m${p.for_month}`)).toEqual([
        'md-1-w:m1',
        'md-1-w:m3',
        'md-1-b:m1',
        'md-1-l:m2',
        'md-2-w:m1',
      ]);

      expect(insertedCashFlowPayloads).toHaveLength(5);
      for (let i = 0; i < 5; i += 1) {
        expect(insertedCashFlowPayloads[i].created_at).toBe(insertedDepositPayloads[i].created_at);
        if (i > 0) {
          const prevMs = new Date(insertedCashFlowPayloads[i - 1].created_at).getTime();
          const currMs = new Date(insertedCashFlowPayloads[i].created_at).getTime();
          expect(currMs - prevMs).toBe(10);
        }
      }
    });

    it('exports fetchComplianceData as alias to fetchComplianceMatrixData', () => {
      expect(fetchComplianceData).toBe(fetchComplianceMatrixData);
    });

    it('renders correct tooltip with exact monthly amount and running total for Yanto Santoso (Feb: 200k/Total: 200k)', () => {
      const yantoRow = {
        member_id: 'm-yanto',
        nrp: 'NRP-YANTO',
        nama: 'Yanto Santoso',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 4000000, b: 0, l: 0 },
        months: [
          null, // Jan (sebelum bergabung)
          { w: 200000, b: 0, l: 0, bal_w: 200000, bal_b: 0, bal_l: 0 }, // Feb (bulan 1)
          { w: 200000, b: 0, l: 0, bal_w: 400000, bal_b: 0, bal_l: 0 }, // Mar (bulan 2)
          null, null, null, null, null, null, null, null, null
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2025" initialData={[yantoRow]} />
      );

      // Pastikan nama Yanto Santoso muncul
      expect(html).toContain('Yanto Santoso');
      // Pastikan nominal setoran dan total running balance muncul di tooltip
      expect(html).toContain('Total: Rp 200.000');
      expect(html).toContain('Total: Rp 400.000');
    });
  });

  describe('Multi-Row Itemized Savings Cells (3 Sub-Baris: Wajib, Belanja, Lebaran)', () => {
    it('renders 3 sub-row labels (wajib, belanja, lebaran) and formatted amounts inside month cells', () => {
      const row = {
        member_id: 'm-sample',
        nrp: '11223344',
        nama: 'Bambang Pamungkas',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 250000, b: 500000, l: 500000 },
        months: [
          {
            w: 25000,
            b: 50000,
            l: 50000,
            bal_w: 25000,
            bal_b: 50000,
            bal_l: 50000,
            wajib: { status: 'paid' as const, amount: 25000 },
            belanja: { status: 'paid' as const, amount: 50000 },
            lebaran: { status: 'paid' as const, amount: 50000 },
          },
          null, null, null, null, null, null, null, null, null, null, null
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2026" initialData={[row]} />
      );

      // Verify labels rendered
      expect(html).toContain('wajib');
      expect(html).toContain('belanja');
      expect(html).toContain('lebaran');

      // Verify paid color classes
      expect(html).toContain('text-emerald-600 font-semibold');
      expect(html).toContain('text-teal-600 font-semibold');

      // Verify formatted amounts
      expect(html).toContain('25.000');
      expect(html).toContain('50.000');

      // Verify title attribute for ledger interaction
      expect(html).toContain('title="Klik untuk rincian buku besar Bambang Pamungkas - Jan 2026"');
    });

    it('renders rose/red indicators for unpaid arrears and slate dash for not applicable / before registration', () => {
      const rowWithArrears = {
        member_id: 'm-arrears',
        nrp: '99887766',
        nama: 'Siti Aminah',
        pokokLunas: false,
        compliance: 50,
        balances: { w: 0, b: 0, l: 0 },
        months: [
          null, // Jan (sebelum bergabung)
          {
            w: 0,
            b: 0,
            l: 0,
            bal_w: 0,
            bal_b: 0,
            bal_l: 0,
            wajib: { status: 'unpaid' as const, amount: 200000 },
            belanja: { status: 'unpaid' as const, amount: 50000 },
            lebaran: { status: 'unpaid' as const, amount: 50000 },
          },
          null, null, null, null, null, null, null, null, null, null
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2026" initialData={[rowWithArrears]} />
      );

      // Verify unpaid color class
      expect(html).toContain('text-rose-600 font-bold');
      expect(html).toContain('200.000');

      // Verify not applicable dash
      expect(html).toContain('<div class="text-gray-300 text-xs text-center">-</div>');

      // Verify title on the active unpaid month (Feb 2026)
      expect(html).toContain('title="Klik untuk rincian buku besar Siti Aminah - Feb 2026"');
    });

    it('renders column headers with min-w-[95px] md:min-w-[105px] and updated legend', () => {
      const html = renderToStaticMarkup(<ComplianceMatrix initialYear="2026" />);

      // Verify header min-width
      expect(html).toContain('min-w-[95px] md:min-w-[105px]');

      // Verify new legend text
      expect(html).toContain('Lunas (Hijau / Teal)');
      expect(html).toContain('Belum Bayar / Tunggakan (Merah)');
      expect(html).toContain('Belum Terdaftar / Tidak Berlaku');
    });

    it('renders dynamic rolling 12-month headers with Bln-YY labels and current month highlight', () => {
      const html = renderToStaticMarkup(<ComplianceMatrix initialYear="2026" />);

      // Verify rolling months format Bln-YY in headers
      expect(html).toContain('Des-25');
      expect(html).toContain('Jan-26');
      expect(html).toContain('Nov-26');

      // Verify current month highlight on column 11 (Nov-26)
      expect(html).toContain('bg-emerald-50/50 border-x-2 border-x-emerald-200/50 text-emerald-900 font-bold');
    });

    it('renders green emerald styling for Hendra Gunawan paid months (Mei s/d Nov 2024)', () => {
      const monthsData: any[] = [
        null, null, null, null, // Jan - Apr 2024 before join
      ];
      // Mei s/d Nov 2024
      for (let m = 5; m <= 11; m++) {
        monthsData.push({
          w: 200000,
          b: 50000,
          l: 50000,
          bal_w: (m - 4) * 200000,
          bal_b: (m - 4) * 50000,
          bal_l: (m - 4) * 50000,
          wajib: { status: 'paid' as const, amount: 200000 },
          belanja: { status: 'paid' as const, amount: 50000 },
          lebaran: { status: 'paid' as const, amount: 50000 },
        });
      }
      monthsData.push(null); // Des 2024

      const hendraRow = {
        member_id: 'm-hendra',
        nrp: 'NRP-HENDRA',
        nama: 'Hendra Gunawan',
        pokokLunas: true,
        compliance: 88,
        balances: { w: 1400000, b: 350000, l: 350000 },
        months: monthsData,
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2024" initialData={[hendraRow]} />
      );

      // Pastikan nama Hendra Gunawan muncul
      expect(html).toContain('Hendra Gunawan');
      // Pastikan teks WAJIB 200.000 berwarna emerald green
      expect(html).toContain('text-emerald-600 font-semibold');
      expect(html).toContain('200.000');
      // Pastikan tooltip mencerminkan lunas
      expect(html).toContain('Total: Rp 1.400.000');
      // Pastikan progress kepatuhan 88% ditampilkan
      expect(html).toContain('88%');
    });
  });

  describe('Phase 53: Excel Matrix Export Dropdown & Import Modal Integration', () => {
    it('renders "Ekspor Matriks Periksa (.xlsx)" and "Impor Matriks Hasil Audit" buttons in toolbar', () => {
      const html = renderToStaticMarkup(<ComplianceMatrix initialYear="2026" />);

      expect(html).toContain('Ekspor Matriks Periksa (.xlsx)');
      expect(html).toContain('Impor Matriks Hasil Audit');
      expect(html).toContain('data-testid="export-matrix-dropdown-btn"');
      expect(html).toContain('data-testid="import-matrix-btn"');
    });

    it('renders export dropdown menu with all 3 deposit types when initialShowExportDropdown is true', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2026" initialShowExportDropdown={true} />
      );

      expect(html).toContain('data-testid="export-matrix-menu"');
      expect(html).toContain('data-testid="export-wajib-btn"');
      expect(html).toContain('data-testid="export-belanja-btn"');
      expect(html).toContain('data-testid="export-lebaran-btn"');
      expect(html).toContain('Simpanan Wajib');
      expect(html).toContain('Simpanan Belanja Bulanan');
      expect(html).toContain('Simpanan Hari Raya (Lebaran)');
    });

    it('renders SavingsMatrixImportModal when initialShowImportModal is true', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2026" initialShowImportModal={true} />
      );

      expect(html).toContain('data-testid="savings-matrix-import-modal"');
      expect(html).toContain('data-testid="modal-default-type"');
      expect(html).toContain('WAJIB');
    });

    it('renders spinner icon when initialIsExporting is true', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialYear="2026" initialIsExporting={true} />
      );

      expect(html).toContain('animate-spin');
    });

    it('handleExportSavingsMatrix triggers exportSavingsMatrixExcel and shows toast feedback', async () => {
      const setIsExporting = vi.fn();
      const setShowExportDropdown = vi.fn();
      const feedback = { showToast: vi.fn() };

      const res = await handleExportSavingsMatrix(
        'WAJIB',
        setIsExporting,
        setShowExportDropdown,
        feedback
      );

      expect(exportSavingsMatrixExcel).toHaveBeenCalledWith('WAJIB');
      expect(setIsExporting).toHaveBeenCalledWith(true);
      expect(setShowExportDropdown).toHaveBeenCalledWith(false);
      expect(feedback.showToast).toHaveBeenCalledWith(
        'Matriks periksa Simpanan Wajib (.xlsx) berhasil diekspor',
        'success'
      );
      expect(res).toBe(true);
    });

    it('handleExportSavingsMatrix handles export error gracefully and shows error toast', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (exportSavingsMatrixExcel as any).mockRejectedValueOnce(new Error('Export failed'));

      const setIsExporting = vi.fn();
      const setShowExportDropdown = vi.fn();
      const feedback = { showToast: vi.fn() };

      const res = await handleExportSavingsMatrix(
        'BELANJA',
        setIsExporting,
        setShowExportDropdown,
        feedback
      );

      expect(setIsExporting).toHaveBeenCalledWith(false);
      expect(feedback.showToast).toHaveBeenCalledWith(
        'Gagal mengekspor matriks simpanan: Export failed',
        'error'
      );
      expect(res).toBe(false);

      consoleErrorSpy.mockRestore();
    });

    it('handleImportMatrixSuccess re-fetches compliance data, closes modal, and shows success toast', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();
      const setTargets = vi.fn();
      const setTotalSetoran = vi.fn();
      const setShowImportModal = vi.fn();
      const feedback = { showToast: vi.fn() };

      await handleImportMatrixSuccess(
        '2026',
        setLoading,
        setData,
        setTargets,
        setTotalSetoran,
        setShowImportModal,
        feedback
      );

      expect(getComplianceMatrixData).toHaveBeenCalledWith(2026);
      expect(setShowImportModal).toHaveBeenCalledWith(false);
      expect(feedback.showToast).toHaveBeenCalledWith(
        'Buku besar berhasil disinkronkan dari file Excel',
        'success'
      );
    });

    it('handleImportMatrixSuccess displays summary toast when importResult has partial failures', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();
      const setTargets = vi.fn();
      const setTotalSetoran = vi.fn();
      const setShowImportModal = vi.fn();
      const feedback = { showToast: vi.fn() };

      await handleImportMatrixSuccess(
        '2026',
        setLoading,
        setData,
        setTargets,
        setTotalSetoran,
        setShowImportModal,
        feedback,
        {
          success: true,
          totalMembers: 28,
          totalTransactions: 1500,
          totalSuccess: 26,
          totalFailed: 2,
          errorList: ['Gagal Oki', 'Gagal Prabowo']
        }
      );

      expect(getComplianceMatrixData).toHaveBeenCalledWith(2026);
      expect(setShowImportModal).toHaveBeenCalledWith(false);
      expect(feedback.showToast).toHaveBeenCalledWith(
        'Impor selesai: 26 anggota berhasil, 2 anggota gagal',
        'warning'
      );
    });

    it('handleImportMatrixSuccess displays summary toast when importResult is completely successful', async () => {
      const setLoading = vi.fn();
      const setData = vi.fn();
      const setTargets = vi.fn();
      const setTotalSetoran = vi.fn();
      const setShowImportModal = vi.fn();
      const feedback = { showToast: vi.fn() };

      await handleImportMatrixSuccess(
        '2026',
        setLoading,
        setData,
        setTargets,
        setTotalSetoran,
        setShowImportModal,
        feedback,
        {
          success: true,
          totalMembers: 28,
          totalTransactions: 1680,
          totalSuccess: 28,
          totalFailed: 0,
          errorList: []
        }
      );

      expect(getComplianceMatrixData).toHaveBeenCalledWith(2026);
      expect(setShowImportModal).toHaveBeenCalledWith(false);
      expect(feedback.showToast).toHaveBeenCalledWith(
        'Buku besar berhasil disinkronkan: 28 anggota berhasil (1680 mutasi)',
        'success'
      );
    });
  });

  describe('Member Real Cash Net Savings Card Display', () => {
    it('renders real cash net balance card under member name with itemized amounts', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={mockMatrixResult.rows} />
      );

      // Verify card container by testid
      expect(html).toContain('data-testid="member-net-savings-12345678"');

      // Verify title "Kas Riil" and formatted values
      expect(html).toContain('Kas Riil');
      expect(html).toContain('Rp 950.000');
      expect(html).toContain('Wajib:');
      expect(html).toContain('Rp 500.000');
      expect(html).toContain('Belanja:');
      expect(html).toContain('Rp 150.000');
      expect(html).toContain('Lebaran:');
      expect(html).toContain('Rp 300.000');
    });

    it('safely renders zero amounts (Rp 0) when netSavings is undefined or has 0 balances', () => {
      const rowWithoutNetSavings = [
        {
          member_id: 'm-zero',
          nrp: '99999999',
          nama: 'Anggota Baru',
          pokokLunas: false,
          compliance: 50,
          balances: { w: 0, b: 0, l: 0 },
          // netSavings is undefined
          months: Array(12).fill({
            w: 0,
            b: 0,
            l: 0,
            bal_w: 0,
            bal_b: 0,
            bal_l: 0,
          }),
        },
      ];

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={rowWithoutNetSavings} />
      );

      expect(html).toContain('data-testid="member-net-savings-99999999"');
      expect(html).toContain('Kas Riil');
      expect(html).toContain('Rp 0');
    });

    it('safely renders zero amounts when netSavings explicitly contains zeros', () => {
      const rowWithZeroNetSavings = [
        {
          member_id: 'm-explicit-zero',
          nrp: '88888888',
          nama: 'Anggota Nol',
          pokokLunas: true,
          compliance: 100,
          balances: { w: 0, b: 0, l: 0 },
          netSavings: {
            wajib: 0,
            belanja: 0,
            lebaran: 0,
            total: 0,
          },
          months: Array(12).fill({
            w: 0,
            b: 0,
            l: 0,
            bal_w: 0,
            bal_b: 0,
            bal_l: 0,
          }),
        },
      ];

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={rowWithZeroNetSavings} />
      );

      expect(html).toContain('data-testid="member-net-savings-88888888"');
      expect(html).toContain('Kas Riil');
      expect(html).toContain('Rp 0');
    });

    it('renders partial payment in amber text and displays detailed partial tooltip', () => {
      const rowWithPartial: ComplianceMatrixRow[] = [
        {
          member_id: 'm-agus',
          nrp: '95168420',
          nama: 'Agus Susanto',
          pokokLunas: true,
          compliance: 95,
          balances: { w: 10200000, b: 0, l: 0 },
          months: [
            ...Array(8).fill({
              w: 210000,
              b: 0,
              l: 0,
              bal_w: 10140000,
              bal_b: 0,
              bal_l: 0,
              wajib: { status: 'paid', amount: 210000, targetAmount: 210000 },
            }),
            {
              // Bulan ke-9 (September): setoran parsial Rp 60.000 dari target Rp 210.000
              w: 60000,
              b: 0,
              l: 0,
              bal_w: 10200000,
              bal_b: 0,
              bal_l: 0,
              wajib: { status: 'partial', amount: 60000, targetAmount: 210000 },
            },
            ...Array(3).fill(null),
          ],
        },
      ];

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={rowWithPartial} initialYear="2026" />
      );

      // Verify amber text for partial amount
      expect(html).toContain('text-amber-600 font-bold');
      expect(html).toContain('60.000');

      // Verify tooltip
      expect(html).toContain('Setoran Parsial: Rp 60.000 dari kewajiban Rp 210.000 (Kurang Rp 150.000)');

      // Verify legend contains Parsial
      expect(html).toContain('Parsial (Oranye / Amber)');
    });

    it('Agus Susanto (2026): bulan pasca alokasi sisa parsial (Okt & Nov) berstatus unbilled dengan tanda strip "-", dan saat unpaid tampil 210.000', () => {
      const agusRow = {
        member_id: 'm-agus',
        nrp: 'NRP-AGUS',
        nama: 'Agus Susanto',
        pokokLunas: true,
        compliance: 90,
        balances: { w: 10200000, b: 0, l: 0 },
        netSavings: { wajib: 10200000, belanja: 0, lebaran: 0, total: 10200000 },
        months: [
          ...Array(8).fill({
            w: 210000,
            b: 0,
            l: 0,
            bal_w: 10140000,
            bal_b: 0,
            bal_l: 0,
            wajib: { status: 'paid' as const, amount: 210000, targetAmount: 210000 },
          }),
          {
            // Sep (index 8): parsial 60.000
            w: 60000,
            b: 0,
            l: 0,
            bal_w: 10200000,
            bal_b: 0,
            bal_l: 0,
            wajib: { status: 'partial' as const, amount: 60000, targetAmount: 210000 },
          },
          {
            // Okt (index 9): pasca-alokasi unbilled
            w: 0,
            b: 0,
            l: 0,
            bal_w: 10200000,
            bal_b: 0,
            bal_l: 0,
            wajib: { status: 'unbilled' as const, amount: 0, targetAmount: 210000 },
          },
          {
            // Nov (index 10): pasca-alokasi unbilled
            w: 0,
            b: 0,
            l: 0,
            bal_w: 10200000,
            bal_b: 0,
            bal_l: 0,
            wajib: { status: 'unbilled' as const, amount: 0, targetAmount: 210000 },
          },
          null // Des
        ],
      };

      const mockTiers = [
        {
          id: 'tier-1',
          deposit_type_code: 'WAJIB',
          start_year: 2022,
          start_month: 8,
          end_year: 2023,
          end_month: 10,
          monthly_rate: 200000,
        },
        {
          id: 'tier-2',
          deposit_type_code: 'WAJIB',
          start_year: 2023,
          start_month: 11,
          end_year: null,
          end_month: null,
          monthly_rate: 210000,
        },
      ];

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[agusRow]} initialYear="2026" />
      );

      // Verifikasi Kas Riil Agus Susanto tepat Rp 10.200.000 (tidak ganda 20.400.000)
      expect(html).toContain('10.200.000');
      expect(html).not.toContain('20.400.000');

      // Verifikasi September 2026 berstatus partial dengan nominal 60.000
      expect(html).toContain('text-amber-600 font-bold');
      expect(html).toContain('60.000');

      // Verifikasi Oktober & November berstatus unbilled dengan strip netral text-slate-300
      expect(html).toContain('text-slate-300 font-normal');
      expect(html).toContain('Belum Terbit Tagihan');

      // Verifikasi jika disimulasikan unpaid / menunggak: muncul nominal 210.000 bukan 200.000
      const rowWithSimulatedArrears = {
        ...agusRow,
        months: [
          ...agusRow.months.slice(0, 9),
          {
            w: 0,
            b: 0,
            l: 0,
            bal_w: 10200000,
            bal_b: 0,
            bal_l: 0,
            wajib: { status: 'unpaid' as const, amount: 210000, targetAmount: 210000 },
          },
          ...agusRow.months.slice(10),
        ],
      };

      const htmlArrears = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowWithSimulatedArrears]} initialYear="2026" />
      );

      expect(htmlArrears).toContain('text-rose-600 font-bold');
      expect(htmlArrears).toContain('210.000');
    });
  });

  describe('Deposit Evidence & Reference Documentation Tooltip Rendering', () => {
    it('renders reference number and notes inside month hover tooltip when available', () => {
      const rowWithEvidence = {
        member_id: 'm-evidence-1',
        nrp: '78010234',
        nama: 'Briptu Agus Susanto',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 10200000, b: 0, l: 0 },
        netSavings: {
          wajib: 10200000,
          belanja: 0,
          lebaran: 0,
          total: 10200000,
        },
        months: [
          {
            w: 200000,
            b: 25000,
            l: 50000,
            bal_w: 200000,
            bal_b: 25000,
            bal_l: 50000,
            wajib: {
              status: 'paid' as const,
              amount: 200000,
              reference_no: 'KW-2026/01/01',
              notes: 'Potong gaji bulan Januari',
            },
            belanja: {
              status: 'paid' as const,
              amount: 25000,
              reference_no: 'TRF-SB-202601',
              notes: 'Transfer kasir belanja',
            },
            lebaran: {
              status: 'paid' as const,
              amount: 50000,
              reference_no: 'SL-2026/01',
            },
          },
          ...Array(11).fill(null),
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowWithEvidence as any]} initialYear="2026" />
      );

      // Verify Wajib evidence in tooltip
      expect(html).toContain('data-testid="tooltip-ref-wajib"');
      expect(html).toContain('Bukti: KW-2026/01/01');
      expect(html).toContain('Potong gaji bulan Januari');

      // Verify Belanja evidence in tooltip
      expect(html).toContain('data-testid="tooltip-ref-belanja"');
      expect(html).toContain('Bukti: TRF-SB-202601');
      expect(html).toContain('Transfer kasir belanja');

      // Verify Lebaran evidence in tooltip
      expect(html).toContain('data-testid="tooltip-ref-lebaran"');
      expect(html).toContain('Bukti: SL-2026/01');
    });
  });

  describe('Phase 73: Rolling 12-Month Window Opening Balance & Cumulative Tooltips', () => {
    it('renders opening balance indicator in column index 0 when member has pre-window opening balance', () => {
      const rowWithOpeningBal = {
        member_id: 'm-carry',
        nrp: 'NRP-CARRY',
        nama: 'Kurniawan Dwi Yulianto',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 3000000, b: 1000000, l: 1000000 },
        openingBalance: { w: 2000000, b: 500000, l: 500000 }, // Total = 3.000.000
        netSavings: { wajib: 3000000, belanja: 1000000, lebaran: 1000000, total: 5000000 },
        months: [
          {
            w: 200000,
            b: 50000,
            l: 50000,
            bal_w: 2200000,
            bal_b: 550000,
            bal_l: 550000,
            cum_w: 2200000,
            cum_b: 550000,
            cum_l: 550000,
            isOpeningBalanceMonth: true,
          },
          ...Array(11).fill(null),
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowWithOpeningBal as any]} initialYear="2026" />
      );

      // Verify opening balance indicator
      expect(html).toContain('data-testid="opening-balance-indicator"');
      expect(html).toContain('+ Saldo Awal Rp 3.000.000');
      expect(html).toContain('title="Saldo Bawaan (pra-jendela): Rp 3.000.000"');
    });

    it('does not render opening balance indicator when member has zero opening balance', () => {
      const rowZeroOpening = {
        member_id: 'm-zero',
        nrp: 'NRP-ZERO',
        nama: 'Anggota Baru',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 200000, b: 50000, l: 50000 },
        openingBalance: { w: 0, b: 0, l: 0 },
        months: [
          {
            w: 200000,
            b: 50000,
            l: 50000,
            bal_w: 200000,
            bal_b: 50000,
            bal_l: 50000,
          },
          ...Array(11).fill(null),
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowZeroOpening as any]} initialYear="2026" />
      );

      expect(html).not.toContain('data-testid="opening-balance-indicator"');
      expect(html).not.toContain('+ Saldo Awal');
    });

    it('renders cumulative tooltip with monthly deposit total, cumulative total, and percentage', () => {
      const rowCumulative = {
        member_id: 'm-cum',
        nrp: 'NRP-CUM',
        nama: 'Budi Darmawan',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 2000000, b: 500000, l: 500000 },
        netSavings: { wajib: 2000000, belanja: 500000, lebaran: 500000, total: 3000000 },
        months: [
          {
            w: 200000,
            b: 50000,
            l: 50000,
            bal_w: 1000000,
            bal_b: 250000,
            bal_l: 250000,
            cum_w: 1000000,
            cum_b: 250000,
            cum_l: 250000,
          },
          ...Array(10).fill(null),
          {
            w: 200000,
            b: 50000,
            l: 50000,
            bal_w: 2000000,
            bal_b: 500000,
            bal_l: 500000,
            cum_w: 2000000,
            cum_b: 500000,
            cum_l: 500000,
          },
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowCumulative as any]} initialYear="2026" />
      );

      // Verify cumulative summary container
      expect(html).toContain('data-testid="tooltip-cumulative-summary"');
      expect(html).toContain('Iuran Bulan Ini:');
      expect(html).toContain('Rp 300.000'); // 200k + 50k + 50k
      expect(html).toContain('Akumulasi s/d Bulan Ini:');
      expect(html).toContain('Rp 1.500.000'); // Month 0: 1000k + 250k + 250k
      expect(html).toContain('Pencapaian Saldo:');
      expect(html).toContain('50%'); // 1.500.000 / 3.000.000 = 50%

      // On column 11 (right-most), total cumulative equals netSavings.total (3.000.000) and 100%
      expect(html).toContain('Rp 3.000.000');
      expect(html).toContain('100%');
    });

    it('renders custom rolling periods passed via row.periods in table headers correctly', () => {
      const customPeriods = [
        { year: 2025, month: 12, label: 'Des-25', periodIndex: 2025 * 12 + 12 },
        { year: 2026, month: 1, label: 'Jan-26', periodIndex: 2026 * 12 + 1 },
        { year: 2026, month: 2, label: 'Feb-26', periodIndex: 2026 * 12 + 2 },
        { year: 2026, month: 3, label: 'Mar-26', periodIndex: 2026 * 12 + 3 },
        { year: 2026, month: 4, label: 'Apr-26', periodIndex: 2026 * 12 + 4 },
        { year: 2026, month: 5, label: 'Mei-26', periodIndex: 2026 * 12 + 5 },
        { year: 2026, month: 6, label: 'Jun-26', periodIndex: 2026 * 12 + 6 },
        { year: 2026, month: 7, label: 'Jul-26', periodIndex: 2026 * 12 + 7 },
        { year: 2026, month: 8, label: 'Ags-26', periodIndex: 2026 * 12 + 8 },
        { year: 2026, month: 9, label: 'Sep-26', periodIndex: 2026 * 12 + 9 },
        { year: 2026, month: 10, label: 'Okt-26', periodIndex: 2026 * 12 + 10 },
        { year: 2026, month: 11, label: 'Nov-26', periodIndex: 2026 * 12 + 11 },
      ];

      const rowWithPeriods = {
        member_id: 'm-periods',
        nrp: 'NRP-PERIODS',
        nama: 'Sersan Perdana',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 100000, b: 50000, l: 50000 },
        periods: customPeriods,
        months: Array(12).fill(null),
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowWithPeriods as any]} initialYear="2026" />
      );

      // Verify custom header labels are present
      expect(html).toContain('Des-25');
      expect(html).toContain('Mei-26');
      expect(html).toContain('Nov-26');
    });

    it('handles zero or missing netSavings total gracefully in cumulative tooltip (omits percentage without NaN)', () => {
      const rowZeroTotal = {
        member_id: 'm-zero-tot',
        nrp: 'NRP-ZERO-TOT',
        nama: 'Prajurit Nol',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 0, b: 0, l: 0 },
        netSavings: { wajib: 0, belanja: 0, lebaran: 0, total: 0 },
        months: [
          {
            w: 0,
            b: 0,
            l: 0,
            bal_w: 0,
            bal_b: 0,
            bal_l: 0,
            cum_w: 0,
            cum_b: 0,
            cum_l: 0,
          },
          ...Array(11).fill(null),
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowZeroTotal as any]} initialYear="2026" />
      );

      expect(html).toContain('data-testid="tooltip-cumulative-summary"');
      expect(html).toContain('Iuran Bulan Ini:');
      expect(html).toContain('Rp 0');
      expect(html).toContain('Akumulasi s/d Bulan Ini:');
      expect(html).not.toContain('Pencapaian Saldo:');
      expect(html).not.toContain('NaN%');
    });

    it('renders prior balance summary column header (Saldo Pra [Bln-YY]) and row cell with formatted W, B, L amounts', () => {
      const customPeriods = [
        { year: 2025, month: 11, label: 'Nov-25', periodIndex: 2025 * 12 + 11 },
        { year: 2025, month: 12, label: 'Des-25', periodIndex: 2025 * 12 + 12 },
        { year: 2026, month: 1, label: 'Jan-26', periodIndex: 2026 * 12 + 1 },
        { year: 2026, month: 2, label: 'Feb-26', periodIndex: 2026 * 12 + 2 },
        { year: 2026, month: 3, label: 'Mar-26', periodIndex: 2026 * 12 + 3 },
        { year: 2026, month: 4, label: 'Apr-26', periodIndex: 2026 * 12 + 4 },
        { year: 2026, month: 5, label: 'Mei-26', periodIndex: 2026 * 12 + 5 },
        { year: 2026, month: 6, label: 'Jun-26', periodIndex: 2026 * 12 + 6 },
        { year: 2026, month: 7, label: 'Jul-26', periodIndex: 2026 * 12 + 7 },
        { year: 2026, month: 8, label: 'Ags-26', periodIndex: 2026 * 12 + 8 },
        { year: 2026, month: 9, label: 'Sep-26', periodIndex: 2026 * 12 + 9 },
        { year: 2026, month: 10, label: 'Okt-26', periodIndex: 2026 * 12 + 10 },
      ];

      const rowWithPriorSummary = {
        member_id: 'm-prior-test',
        nrp: 'NRP-PRIOR-1',
        nama: 'Kopda Hendra',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 300000, b: 600000, l: 600000 },
        periods: customPeriods,
        priorSummary: {
          wajib: 250000,
          belanja: 120000,
          lebaran: 75000,
          total: 445000,
        },
        netSavings: {
          wajib: 550000,
          belanja: 720000,
          lebaran: 675000,
          total: 1945000,
        },
        months: Array(12).fill(null),
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowWithPriorSummary as any]} initialYear="2026" />
      );

      // Verify column header for opening balance
      expect(html).toContain('Saldo Awal');
      expect(html).toContain('Per Nov-25');

      // Verify row cell data-testid and formatted amounts
      expect(html).toContain('data-testid="prior-summary-NRP-PRIOR-1"');
      expect(html).toContain('P: Rp 0');
      expect(html).toContain('W: Rp 250.000');
      expect(html).toContain('B: Rp 120.000');
      expect(html).toContain('L: Rp 75.000');

      // Verify 12 rolling month headers rendered
      expect(html).toContain('Nov-25');
      expect(html).toContain('Okt-26');
    });

    it('renders zero amounts in prior summary cell when priorSummary is undefined', () => {
      const rowWithoutPriorSummary = {
        member_id: 'm-no-prior',
        nrp: 'NRP-NO-PRIOR',
        nama: 'Prajurit Baru',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 0, b: 0, l: 0 },
        months: Array(12).fill(null),
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowWithoutPriorSummary as any]} initialYear="2026" />
      );

      expect(html).toContain('data-testid="prior-summary-NRP-NO-PRIOR"');
      expect(html).toContain('W: Rp 0');
      expect(html).toContain('B: Rp 0');
      expect(html).toContain('L: Rp 0');
    });

    it('renders empty table and loading states with colSpan 15', () => {
      const emptyHtml = renderToStaticMarkup(
        <ComplianceMatrix initialData={[]} initialYear="2026" />
      );
      expect(emptyHtml).toContain('colSpan="15"');
    });

    it('renders interactive button for Pokok: Belum and static badge for Pokok: Lunas', () => {
      const rowUnpaid = {
        member_id: 'm-unpaid',
        nrp: '34763421',
        nama: 'Tom Hanks',
        pokokLunas: false,
        compliance: 50,
        balances: { w: 0, b: 0, l: 0 },
        months: Array(12).fill(null),
      };

      const rowPaid = {
        member_id: 'm-paid',
        nrp: '34763422',
        nama: 'Leonardo DiCaprio',
        pokokLunas: true,
        compliance: 100,
        balances: { w: 0, b: 0, l: 0 },
        months: Array(12).fill(null),
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowUnpaid as any, rowPaid as any]} initialYear="2026" />
      );

      // Verifikasi Tom Hanks memiliki tombol interaktif pelunasan simpanan pokok
      expect(html).toContain('data-testid="pay-pokok-btn-34763421"');
      expect(html).toContain('title="Klik untuk melunasi Simpanan Pokok"');
      expect(html).toContain('Pokok: Belum');
      expect(html).toContain('Bayar');

      // Verifikasi Leonardo DiCaprio memiliki badge lunas
      expect(html).toContain('Pokok: Lunas');
      expect(html).not.toContain('data-testid="pay-pokok-btn-34763422"');
    });

    it('renders dynamic Per [Tanggal Pengesahan] header, P/W/B/L opening balances, and hides pre-cut-off month columns in cut-off mode', () => {
      const periods2026 = Array.from({ length: 12 }, (_, idx) => ({
        year: 2026,
        month: idx + 1,
        label: `${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'][idx]}-26`,
        periodIndex: 2026 * 12 + (idx + 1),
      }));

      const coveredCell = {
        w: 0,
        b: 0,
        l: 0,
        bal_w: 10200000,
        bal_b: 500000,
        bal_l: 300000,
        cum_w: 10200000,
        cum_b: 500000,
        cum_l: 300000,
        isBeforeCutoff: true,
        wajib: { status: 'covered_by_opening' as const, amount: 0, notes: 'Sudah tercakup dalam Saldo Awal' },
        belanja: { status: 'covered_by_opening' as const, amount: 0, notes: 'Sudah tercakup dalam Saldo Awal' },
        lebaran: { status: 'covered_by_opening' as const, amount: 0, notes: 'Sudah tercakup dalam Saldo Awal' },
      };

      const postCutoffPaidCell = {
        w: 200000,
        b: 50000,
        l: 50000,
        bal_w: 10400000,
        bal_b: 550000,
        bal_l: 350000,
        cum_w: 10400000,
        cum_b: 550000,
        cum_l: 350000,
        wajib: { status: 'paid' as const, amount: 200000, targetAmount: 200000 },
        belanja: { status: 'paid' as const, amount: 50000, targetAmount: 50000 },
        lebaran: { status: 'paid' as const, amount: 50000, targetAmount: 50000 },
      };

      const months2026 = [
        ...Array.from({ length: 10 }, () => coveredCell),
        postCutoffPaidCell,
        null,
      ];

      const rowCutOff = {
        member_id: 'm-cutoff-1',
        nrp: 'NRP-CUTOFF-1',
        nama: 'Serda Budi CutOff',
        pokokLunas: true,
        pokokBalance: 100000,
        cutoffDate: '2026-11-13',
        cutoffYear: 2026,
        cutoffMonth: 11,
        compliance: 100,
        balances: { w: 200000, b: 50000, l: 50000 },
        periods: periods2026,
        priorSummary: {
          pokok: 100000,
          wajib: 10200000,
          belanja: 500000,
          lebaran: 300000,
          total: 11000000,
        },
        netSavings: {
          wajib: 10400000,
          belanja: 550000,
          lebaran: 350000,
          total: 11300000,
        },
        months: months2026,
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix initialData={[rowCutOff as any]} initialYear="2026" />
      );

      expect(html).toContain('Saldo Awal');
      expect(html).toContain('(Per 13 Nov 2026)');
      expect(html).toContain('min-w-[165px] whitespace-nowrap');
      expect(html).toContain('P: Rp 100.000');
      expect(html).toContain('W: Rp 10.200.000');
      expect(html).toContain('B: Rp 500.000');
      expect(html).toContain('L: Rp 300.000');
      expect(html).toContain('200.000');

      // Pre-cut-off month columns (Jan-26 s/d Okt-26) must not appear in table
      for (const hiddenLabel of ['Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'Mei-26', 'Jun-26', 'Jul-26', 'Ags-26', 'Sep-26', 'Okt-26']) {
        expect(html).not.toContain(`<div>${hiddenLabel}</div>`);
      }
      expect(html).not.toContain('Sudah tercakup dalam Saldo Awal');

      // Post-cut-off month columns (Nov-26, Des-26) must be rendered
      expect(html).toContain('<div>Nov-26</div>');
      expect(html).toContain('<div>Des-26</div>');
    });

    it('hides Jan-26 through Sep-26 columns for cutoffDate 2026-10-10, renders Okt-26..Des-26, and uses colSpan 6 when empty', () => {
      const periods2026 = Array.from({ length: 12 }, (_, idx) => ({
        year: 2026,
        month: idx + 1,
        label: `${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'][idx]}-26`,
        periodIndex: 2026 * 12 + (idx + 1),
      }));

      const octPaidCell = {
        w: 210000,
        b: 25000,
        l: 50000,
        bal_w: 10410000,
        bal_b: 525000,
        bal_l: 350000,
        cum_w: 10410000,
        cum_b: 525000,
        cum_l: 350000,
        wajib: { status: 'paid' as const, amount: 210000, targetAmount: 210000 },
        belanja: { status: 'paid' as const, amount: 25000, targetAmount: 25000 },
        lebaran: { status: 'paid' as const, amount: 50000, targetAmount: 50000 },
      };

      const rowOctCutoff = {
        member_id: 'm-oct-1',
        nrp: 'NRP-OCT-1',
        nama: 'Serda Andi Okt',
        pokokLunas: true,
        pokokBalance: 100000,
        cutoffDate: '2026-10-10',
        cutoffYear: 2026,
        cutoffMonth: 10,
        compliance: 100,
        balances: { w: 210000, b: 25000, l: 50000 },
        periods: periods2026,
        priorSummary: {
          pokok: 100000,
          wajib: 10200000,
          belanja: 500000,
          lebaran: 300000,
          total: 11000000,
        },
        months: [
          ...Array.from({ length: 9 }, () => null),
          octPaidCell,
          null,
          null,
        ],
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialData={[rowOctCutoff as any]}
          initialYear="2026"
          initialCutoffDate="2026-10-10"
        />
      );

      expect(html).toContain('(Per 10 Okt 2026)');
      for (const hiddenLabel of ['Jan-26', 'Feb-26', 'Mar-26', 'Apr-26', 'Mei-26', 'Jun-26', 'Jul-26', 'Ags-26', 'Sep-26']) {
        expect(html).not.toContain(`<div>${hiddenLabel}</div>`);
      }
      expect(html).toContain('<div>Okt-26</div>');
      expect(html).toContain('<div>Nov-26</div>');
      expect(html).toContain('<div>Des-26</div>');
      expect(html).toContain('210.000');

      const emptyHtml = renderToStaticMarkup(
        <ComplianceMatrix
          initialData={[]}
          initialYear="2026"
          initialCutoffDate="2026-10-10"
        />
      );
      expect(emptyHtml).toContain('colSpan="6"');
    });
  });

  describe('Trace-Back Filter (KW-SETOR-... / CF-...)', () => {
    it('rowMatchesSavingsSearch matches member NRP, name, traceMatchedMemberIds, and cell reference_no', () => {
      const rowA = {
        ...mockMatrixResult.rows[0],
        member_id: 'm-bagus',
        nrp: '00050543',
        nama: 'BAGUS BUDI PRASETYO',
        months: [
          {
            w: 200000,
            b: 25000,
            l: 50000,
            bal_w: 200000,
            bal_b: 25000,
            bal_l: 50000,
            wajib: { status: 'paid', amount: 200000, targetAmount: 200000, reference_no: 'KW-SETOR-20261120-3663' },
            belanja: { status: 'paid', amount: 25000, targetAmount: 25000 },
            lebaran: { status: 'paid', amount: 50000, targetAmount: 50000 },
          },
        ],
      } as any;

      const rowB = {
        ...mockMatrixResult.rows[0],
        member_id: 'm-other',
        nrp: '00099999',
        nama: 'ANGGOTA LAIN',
        months: [],
      } as any;

      expect(rowMatchesSavingsSearch(rowA, '00050543')).toBe(true);
      expect(rowMatchesSavingsSearch(rowB, '00050543')).toBe(false);

      expect(rowMatchesSavingsSearch(rowA, 'KW-SETOR-20261120-3663')).toBe(true);
      expect(rowMatchesSavingsSearch(rowB, 'KW-SETOR-20261120-3663')).toBe(false);

      expect(rowMatchesSavingsSearch(rowA, 'CF-EED98D59', new Set(['m-bagus']))).toBe(true);
      expect(rowMatchesSavingsSearch(rowB, 'CF-EED98D59', new Set(['m-bagus']))).toBe(false);
    });

    it('renders trace-back filter panel, itemized breakdown rows, and filters table to matching member', () => {
      const rowBagus = {
        ...mockMatrixResult.rows[0],
        member_id: 'm-bagus',
        nrp: '00050543',
        nama: 'BAGUS BUDI PRASETYO',
      };
      const rowOther = {
        ...mockMatrixResult.rows[0],
        member_id: 'm-other',
        nrp: '00099999',
        nama: 'SITI AMINAH',
      };

      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialData={[rowBagus as any, rowOther as any]}
          initialYear="2026"
          initialSearch="00050543"
          initialTraceRef="KW-SETOR-20261120-3663"
          initialTraceRows={[
            {
              id: 'tx-1',
              memberId: 'm-bagus',
              memberNrp: '00050543',
              memberName: 'BAGUS BUDI PRASETYO',
              depositTypeName: 'Simpanan Wajib',
              depositTypeCode: 'WAJIB',
              forMonth: 11,
              forYear: 2026,
              periodLabel: 'November 2026',
              paymentMethod: 'tunai',
              referenceNo: 'KW-SETOR-20261120-3663',
              description: 'Setoran Simpanan Wajib (Nov 2026)',
              notes: 'Metode: Tunai | Kwitansi: KW-SETOR-20261120-3663',
              amount: 4050000,
              createdAt: '2026-11-20T09:00:00.000Z',
            },
          ]}
        />
      );

      expect(html).toContain('data-testid="traceback-filter-panel"');
      expect(html).toContain('KW-SETOR-20261120-3663');
      expect(html).toContain('data-testid="btn-reset-traceback-filter"');
      expect(html).toContain('November 2026');
      expect(html).toContain('4.050.000');
      expect(html).toContain('BAGUS BUDI PRASETYO');
      expect(html).not.toContain('SITI AMINAH');
    });

    it('normalizes deposit type codes and parses period URL query parameters accurately', () => {
      expect(normalizeDepositFilterType('WAJIB')).toBe('wajib');
      expect(normalizeDepositFilterType('sw')).toBe('wajib');
      expect(normalizeDepositFilterType('BELANJA')).toBe('belanja');
      expect(normalizeDepositFilterType('sb')).toBe('belanja');
      expect(normalizeDepositFilterType('LEBARAN')).toBe('lebaran');
      expect(normalizeDepositFilterType('SL')).toBe('lebaran');
      expect(normalizeDepositFilterType('SHR')).toBe('lebaran');
      expect(normalizeDepositFilterType('')).toBe('all');
      expect(normalizeDepositFilterType('UNKNOWN')).toBe('all');

      expect(parseShortPeriodParam('Mar-26')).toEqual({ month: 3, year: 2026 });
      expect(parseShortPeriodParam('Nov-2026')).toEqual({ month: 11, year: 2026 });
      expect(parseShortPeriodParam('Mei 2026')).toEqual({ month: 5, year: 2026 });
      expect(parseShortPeriodParam('Aug-25')).toEqual({ month: 8, year: 2025 });
      expect(parseShortPeriodParam('2026-03')).toEqual({ month: 3, year: 2026 });
      expect(parseShortPeriodParam('')).toBeNull();
      expect(parseShortPeriodParam('Xyz-26')).toBeNull();
      expect(parseShortPeriodParam('2026-13')).toBeNull();
      expect(parseShortPeriodParam('1999-03')).toBeNull();
    });

    it('applies search, ref, type, and period URL query params from MemoryRouter and highlights matched Mar-26 cell without reference_no', () => {
      const rowDonny = {
        ...mockMatrixResult.rows[0],
        member_id: 'm-donny',
        nrp: '00060019',
        nama: 'DONNY ILHAM PAMBUDI',
      };
      const rowOther = {
        ...mockMatrixResult.rows[0],
        member_id: 'm-other',
        nrp: '00099999',
        nama: 'SITI AMINAH',
      };

      const html = renderToStaticMarkup(
        <MemoryRouter
          initialEntries={[
            '/admin/compliance-matrix?search=00060019&ref=CF-6C928789&type=WAJIB&period=Mar-26',
          ]}
        >
          <ComplianceMatrix
            initialData={[rowDonny as any, rowOther as any]}
            initialTraceRows={[
              {
                id: 'tx-donny-mar26',
                memberId: 'm-donny',
                memberNrp: '00060019',
                memberName: 'DONNY ILHAM PAMBUDI',
                depositTypeName: 'Simpanan Wajib',
                depositTypeCode: 'WAJIB',
                forMonth: 3,
                forYear: 2026,
                periodLabel: 'Mar 2026',
                paymentMethod: 'tunai',
                referenceNo: null,
                description: 'Setoran Matriks WAJIB Mar 2026',
                notes: null,
                amount: 200000,
                createdAt: '2026-03-10T08:00:00.000Z',
              },
            ]}
          />
        </MemoryRouter>
      );

      expect(html).toContain('DONNY ILHAM PAMBUDI');
      expect(html).toContain('00060019');
      expect(html).not.toContain('SITI AMINAH');
      expect(html).toContain('data-testid="traceback-filter-panel"');
      expect(html).toContain('CF-6C928789');
      expect(html).toContain('Periode: Mar-26');
      expect(html).toMatch(/<option[^>]*selected=""[^>]*value="wajib"|<option[^>]*value="wajib"[^>]*selected=""/);
      const highlightMatches = html.match(/ring-2 ring-indigo-500/g) || [];
      expect(highlightMatches).toHaveLength(1);
    });
  });
});


