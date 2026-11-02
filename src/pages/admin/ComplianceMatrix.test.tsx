import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ComplianceMatrix,
  loadComplianceAvailableYearsData,
  fetchComplianceMatrixData,
  fetchComplianceData,
  handleBulkAutoReconcile,
} from './ComplianceMatrix';
import {
  getSavingsComplianceAvailableYears,
  getComplianceMatrixData,
  ComplianceMatrixResult,
} from '../../services/complianceService';
import { bulkAutoReconcileAllMembers } from '../../services/savingsMatrixService';
import { supabase } from '../../lib/supabaseClient';

// Mock savingsMatrixService
vi.mock('../../services/savingsMatrixService', () => ({
  bulkAutoReconcileAllMembers: vi.fn().mockImplementation(async (type, onProgress) => {
    onProgress?.({ processed: 5, total: 10, currentMemberName: 'Budi' });
    onProgress?.({ processed: 10, total: 10, currentMemberName: 'Siti' });
    return { success: true, totalMembers: 10, totalSuccess: 10, totalFailed: 0 };
  }),
}));

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

vi.mock('../../services/complianceService', () => ({
  getSavingsComplianceAvailableYears: vi.fn().mockResolvedValue([2026, 2025, 2024, 2023]),
  getComplianceMatrixData: vi.fn().mockImplementation(() => Promise.resolve(mockMatrixResult)),
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

  describe('Bulk Auto-Reconcile Toolbar, Modal & Execution Flow', () => {
    it('renders "Cocokkan Otomatis Semua Anggota" button on the toolbar', () => {
      const html = renderToStaticMarkup(<ComplianceMatrix />);
      expect(html).toContain('Cocokkan Otomatis Semua Anggota');
      expect(html).toContain('title="Cocokkan otomatis saldo simpanan seluruh anggota ke buku besar bulanan"');
    });

    it('renders bulk reconcile confirmation modal with title, info banner, and deposit type options', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix initialShowConfirmBulkModal={true} />
      );

      // Verify modal is visible
      expect(html).toContain('data-testid="bulk-reconcile-modal"');
      expect(html).toContain('Cocokkan Otomatis Simpanan Seluruh Anggota');
      expect(html).toContain('Sinkronisasi saldo simpanan riil ke buku besar bulanan');
      expect(html).toContain('Algoritma Rekonsiliasi Otomatis FIFO');

      // Verify deposit type radio options
      expect(html).toContain('Semua Jenis Simpanan');
      expect(html).toContain('Simpanan Wajib');
      expect(html).toContain('Simpanan Belanja Bulanan');
      expect(html).toContain('Simpanan Hari Raya/Lebaran');

      // Verify action buttons
      expect(html).toContain('Batal');
      expect(html).toContain('Mulai Pencocokan Otomatis');
    });

    it('renders modal in-progress state with animated progress bar, percentage, and current member name', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialShowConfirmBulkModal={true}
          initialBulkReconciling={true}
          initialBulkProgress={{
            processed: 75,
            total: 100,
            currentMemberName: 'Bambang Pamungkas',
          }}
        />
      );

      expect(html).toContain('data-testid="bulk-reconcile-in-progress"');
      expect(html).toContain('Memproses 75 dari 100 anggota...');
      expect(html).toContain('75%');
      expect(html).toContain('Bambang Pamungkas');
      expect(html).toContain('Mohon tidak menutup jendela atau merefresh halaman');
    });

    it('renders modal completion result state with success summary and reload button', () => {
      const html = renderToStaticMarkup(
        <ComplianceMatrix
          initialShowConfirmBulkModal={true}
          initialBulkReconciling={false}
          initialBulkResult={{
            totalSuccess: 98,
            totalFailed: 2,
          }}
        />
      );

      expect(html).toContain('data-testid="bulk-reconcile-result"');
      expect(html).toContain('Rekonsiliasi Selesai!');
      expect(html).toContain('98 anggota');
      expect(html).toContain('2 anggota');
      expect(html).toContain('Selesai &amp; Muat Ulang Matriks');
    });

    it('handleBulkAutoReconcile invokes bulkAutoReconcileAllMembers, tracks progress, and returns result', async () => {
      const setIsBulkReconciling = vi.fn();
      const progressUpdates: any[] = [];
      const setBulkProgress = vi.fn((p) => progressUpdates.push(p));
      const setBulkResult = vi.fn();
      const onComplete = vi.fn();

      const result = await handleBulkAutoReconcile(
        'ALL',
        setIsBulkReconciling,
        setBulkProgress,
        setBulkResult,
        onComplete
      );

      // Verify service was called with 'ALL'
      expect(bulkAutoReconcileAllMembers).toHaveBeenCalledWith('ALL', expect.any(Function));

      // Verify loading state changes
      expect(setIsBulkReconciling).toHaveBeenCalledWith(true);
      expect(setIsBulkReconciling).toHaveBeenLastCalledWith(false);

      // Verify progress callbacks fired
      expect(progressUpdates).toEqual([
        { processed: 0, total: 0 },
        { processed: 5, total: 10, currentMemberName: 'Budi' },
        { processed: 10, total: 10, currentMemberName: 'Siti' },
      ]);

      // Verify result state was set
      expect(setBulkResult).toHaveBeenCalledWith({
        totalSuccess: 10,
        totalFailed: 0,
      });

      // Verify onComplete callback
      expect(onComplete).toHaveBeenCalledTimes(1);

      // Verify returned result object
      expect(result).toEqual({
        success: true,
        totalMembers: 10,
        totalSuccess: 10,
        totalFailed: 0,
      });
    });

    it('handleBulkAutoReconcile handles service exceptions gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (bulkAutoReconcileAllMembers as any).mockRejectedValueOnce(new Error('Database lock'));

      const setIsBulkReconciling = vi.fn();
      const setBulkProgress = vi.fn();
      const setBulkResult = vi.fn();

      const result = await handleBulkAutoReconcile(
        'WAJIB',
        setIsBulkReconciling,
        setBulkProgress,
        setBulkResult
      );

      expect(setIsBulkReconciling).toHaveBeenCalledWith(true);
      expect(setIsBulkReconciling).toHaveBeenLastCalledWith(false);
      expect(setBulkResult).toHaveBeenCalledWith({
        totalSuccess: 0,
        totalFailed: 1,
      });
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
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
});


