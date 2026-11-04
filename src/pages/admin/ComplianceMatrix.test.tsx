import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ComplianceMatrix,
  loadComplianceAvailableYearsData,
  fetchComplianceMatrixData,
  fetchComplianceData,
  handleBulkAutoReconcile,
  handleExportSavingsMatrix,
  handleImportMatrixSuccess,
} from './ComplianceMatrix';
import {
  getSavingsComplianceAvailableYears,
  getComplianceMatrixData,
  ComplianceMatrixResult,
  ComplianceMatrixRow,
} from '../../services/complianceService';
import { bulkAutoReconcileAllMembers } from '../../services/savingsMatrixService';
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
});


