import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LaporanPinjamanLunas from './LaporanPinjamanLunas';
import {
  getPaidOffLoansReport,
  getLoanTypesForFilter,
  exportPaidOffLoansExcel,
  exportPaidOffLoansPdf,
  exportPaidOffLoanCertificatePdf,
  type PaidOffLoansSummary,
  type PaidOffLoanReportRow,
  type LoanTypeOption,
} from '../../services/paidOffLoansReportService';
import { supabase } from '../../lib/supabaseClient';

// Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock supabaseClient
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const sampleLoanTypes: LoanTypeOption[] = [
  { id: 'lt-reg', code: 'REG', name: 'Pinjaman Reguler' },
  { id: 'lt-khs', code: 'KHS', name: 'Pinjaman Khusus' },
];

const prabowoSchedules = Array.from({ length: 24 }, (_, idx) => {
  const period = idx + 1;
  const startDate = new Date(2024, 10 + idx, 25);
  const dueDate = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-25`;
  return {
    id: `sched-prabowo-${period}`,
    periodNumber: period,
    dueDate,
    targetAmount: 1000000,
    paidAmount: 1000000,
    status: 'paid',
    paymentDate: `${dueDate}T10:00:00.000Z`,
    paymentMethod: 'potong_gaji',
    receiptNumber: `KW-PINJ/PINJ-MIGRASI-97109810/B${period}`,
    notes: 'Pelunasan Angsuran',
  };
});

const prabowoRow: PaidOffLoanReportRow = {
  id: 'loan-prabowo-1',
  loanId: 'loan-prabowo-1',
  loanNumber: 'PINJ-MIGRASI-97109810',
  memberId: 'mem-prabowo',
  memberName: 'Prabowo Hadi',
  nrp: '97109810',
  pangkat: 'AIPDA',
  loanTypeId: 'lt-reg',
  loanTypeCode: 'REG',
  loanTypeName: 'Pinjaman Reguler',
  principalAmount: 24000000,
  tenor: 24,
  monthlyInstallment: 1000000,
  totalPaid: 24000000,
  disbursedAt: '2024-10-25',
  paidOffDate: '2026-10-25T10:00:00.000Z',
  paidOffYear: 2026,
  status: 'completed',
  paidPeriodsCount: 24,
  schedules: prabowoSchedules,
};

const budiRow: PaidOffLoanReportRow = {
  id: 'loan-budi-2',
  loanId: 'loan-budi-2',
  loanNumber: 'PJ-2025-009',
  memberId: 'mem-budi',
  memberName: 'Budi Santoso',
  nrp: '88010203',
  pangkat: 'BRIPKA',
  loanTypeId: 'lt-khs',
  loanTypeCode: 'KHS',
  loanTypeName: 'Pinjaman Khusus',
  principalAmount: 12000000,
  tenor: 12,
  monthlyInstallment: 1000000,
  totalPaid: 12000000,
  disbursedAt: '2024-06-15',
  paidOffDate: '2025-06-15T09:30:00.000Z',
  paidOffYear: 2025,
  status: 'paid_off',
  paidPeriodsCount: 12,
  schedules: [],
};

const mockSummary: PaidOffLoansSummary = {
  totalPaidOffLoans: 2,
  uniqueMembersCount: 2,
  totalPrincipalAmount: 36000000,
  totalPaidAmount: 36000000,
  rows: [prabowoRow, budiRow],
};

describe('LaporanPinjamanLunas Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders header, action buttons, and 3 KPI summary cards accurately', () => {
    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
      />
    );

    expect(html).toContain('Laporan Anggota Pinjaman Lunas');
    expect(html).toContain('SIMKOP');
    expect(html).toContain('Simpan Pinjam');
    expect(html).toContain('Laporan Pinjaman Lunas');
    expect(html).toContain('Export Excel');
    expect(html).toContain('Cetak PDF');

    // KPI Cards
    expect(html).toContain('Total Berkas Lunas');
    expect(html).toContain('data-testid="kpi-total-loans">2<');
    expect(html).toContain('Jumlah Anggota Lunas');
    expect(html).toContain('data-testid="kpi-unique-members">2<');
    expect(html).toContain('Total Plafon Terselesaikan');
    expect(html).toContain('36.000.000');
  });

  it('renders Prabowo Hadi (NRP 97109810) with Tenor 24 Bln, Pinjaman Reguler, and Lunas Penuh badge', () => {
    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
      />
    );

    expect(html).toContain('Prabowo Hadi');
    expect(html).toContain('97109810');
    expect(html).toContain('AIPDA');
    expect(html).toContain('PINJ-MIGRASI-97109810');
    expect(html).toContain('Pinjaman Reguler');
    expect(html).toContain('24.000.000');
    expect(html).toContain('24 Bln');
    expect(html).toContain('✓ Lunas Penuh');

    expect(html).toContain('Budi Santoso');
    expect(html).toContain('Pinjaman Khusus');
    expect(html).toContain('12 Bln');
  });

  it('renders filter dropdowns for Jenis Pinjaman and Tahun Lunas', () => {
    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
      />
    );

    expect(html).toContain('data-testid="search-paid-loans-input"');
    expect(html).toContain('data-testid="filter-loan-type-select"');
    expect(html).toContain('Semua Jenis Pinjaman');
    expect(html).toContain('<option value="Pinjaman Reguler">Pinjaman Reguler</option>');
    expect(html).toContain('<option value="Pinjaman Khusus">Pinjaman Khusus</option>');

    expect(html).toContain('data-testid="filter-paid-year-select"');
    expect(html).toContain('Semua Tahun');
    expect(html).toContain('<option value="2026">2026</option>');
    expect(html).toContain('<option value="2025">2025</option>');
  });

  it('renders Detail & Surat Keterangan Lunas modal with installment schedules when initialSelectedRow is provided', () => {
    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
        initialSelectedRow={prabowoRow}
      />
    );

    expect(html).toContain('data-testid="paid-loan-detail-modal"');
    expect(html).toContain('Detail &amp; Surat Keterangan Lunas Pinjaman');
    expect(html).toContain('Prabowo Hadi');
    expect(html).toContain('97109810');
    expect(html).toContain('Pinjaman Reguler');
    expect(html).toContain('Riwayat Angsuran (Periode 1 s/d 24)');
    expect(html).toContain('Ke-1');
    expect(html).toContain('Ke-24');
    expect(html).toContain('KW-PINJ/PINJ-MIGRASI-97109810/B24');
    expect(html).toContain('data-testid="print-certificate-btn"');
    expect(html).toContain('Cetak Bukti Keterangan Lunas (PDF)');
  });

  it('renders empty state gracefully when there are no paid-off loans', () => {
    const emptySummary: PaidOffLoansSummary = {
      totalPaidOffLoans: 0,
      uniqueMembersCount: 0,
      totalPrincipalAmount: 0,
      totalPaidAmount: 0,
      rows: [],
    };

    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={emptySummary}
        initialLoanTypes={sampleLoanTypes}
      />
    );

    expect(html).toContain('Belum ada data pinjaman lunas yang cocok');
    expect(html).toContain('Menampilkan 0-0 dari 0 berkas pinjaman lunas');
  });
});

describe('paidOffLoansReportService - Query, Auto-Sync & Exporters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes active loans whose loan_schedules are 100% paid (Prabowo Hadi, NRP 97109810), syncs status, and resolves loan_types.name', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    const mockLoans = [
      {
        id: 'loan-prabowo-1',
        loan_number: 'PINJ-MIGRASI-97109810',
        member_id: 'mem-prabowo',
        loan_type_id: 'lt-reg',
        principal_amount: 24000000,
        tenor: 24,
        agreed_tenor_months: 24,
        monthly_target: 1000000,
        disbursed_at: '2024-10-25',
        status: 'active', // Belum ter-update completed tapi 24 jadwal sudah lunas
        loan_types: { id: 'lt-reg', code: 'REG', name: 'Pinjaman Reguler' },
        member: { id: 'mem-prabowo', nrp: '97109810', nama: 'Prabowo Hadi', pangkat: 'AIPDA' },
      },
      {
        id: 'loan-unpaid-99',
        loan_number: 'PJ-AKTIF-99',
        member_id: 'mem-other',
        loan_type_id: 'lt-khs',
        principal_amount: 10000000,
        tenor: 10,
        status: 'active',
        sisa_pinjaman: 5000000,
        loan_types: { id: 'lt-khs', code: 'KHS', name: 'Pinjaman Khusus' },
        member: { id: 'mem-other', nrp: '11112222', nama: 'Anggota Belum Lunas', pangkat: 'BRIGADIR' },
      },
      {
        id: 'loan-old-completed',
        loan_number: 'PJ-2025-009',
        member_id: 'mem-budi',
        loan_type_id: 'lt-khs',
        principal_amount: 12000000,
        tenor: 12,
        disbursed_at: '2024-06-15',
        status: 'completed',
        loan_types: { id: 'lt-khs', code: 'KHS', name: 'Pinjaman Khusus' },
        member: { id: 'mem-budi', nrp: '88010203', nama: 'Budi Santoso', pangkat: 'BRIPKA' },
      },
    ];

    const mockSchedules = [
      ...Array.from({ length: 24 }, (_, idx) => ({
        id: `sp-${idx + 1}`,
        loan_id: 'loan-prabowo-1',
        period_number: idx + 1,
        due_date: `2025-${String((idx % 12) + 1).padStart(2, '0')}-25`,
        target_amount: 1000000,
        paid_amount: 1000000,
        status: 'paid',
      })),
      {
        id: 'su-1',
        loan_id: 'loan-unpaid-99',
        period_number: 1,
        due_date: '2026-01-25',
        target_amount: 1000000,
        paid_amount: 0,
        status: 'unpaid',
      },
    ];

    const mockRepayments = [
      {
        id: 'rep-prabowo-24',
        loan_id: 'loan-prabowo-1',
        schedule_id: 'sp-24',
        amount_paid: 1000000,
        payment_date: '2026-10-25T10:00:00.000Z',
        payment_method: 'potong_gaji',
        receipt_number: 'KW-PINJ/PINJ-MIGRASI-97109810/B24',
      },
      {
        id: 'rep-budi-12',
        loan_id: 'loan-old-completed',
        schedule_id: null,
        amount_paid: 12000000,
        payment_date: '2025-06-15T09:00:00.000Z',
        payment_method: 'transfer',
        receipt_number: 'KW-2025-009',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockResolvedValue({ data: mockLoans, error: null }),
          update: updateMock,
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockSchedules, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockRepayments, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_types') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: sampleLoanTypes, error: null }),
          }),
        };
      }
      return {};
    });

    const summary = await getPaidOffLoansReport();

    expect(summary.totalPaidOffLoans).toBe(2);
    expect(summary.uniqueMembersCount).toBe(2);
    expect(summary.totalPrincipalAmount).toBe(36000000);

    // Urutan terbaru (2026 Prabowo Hadi) di baris pertama
    expect(summary.rows[0].memberName).toBe('Prabowo Hadi');
    expect(summary.rows[0].nrp).toBe('97109810');
    expect(summary.rows[0].tenor).toBe(24);
    expect(summary.rows[0].loanTypeName).toBe('Pinjaman Reguler');
    expect(summary.rows[0].paidOffYear).toBe(2026);
    expect(summary.rows[0].schedules).toHaveLength(24);

    // Anggota yang belum lunas tidak ikut masuk
    expect(summary.rows.some((r) => r.memberName === 'Anggota Belum Lunas')).toBe(false);

    // Auto-sync status 'active' -> 'completed' dipanggil untuk Prabowo Hadi
    expect(updateMock).toHaveBeenCalledWith({ status: 'completed' });
    expect(updateEqMock).toHaveBeenCalledWith('id', 'loan-prabowo-1');

    // getLoanTypesForFilter works
    const types = await getLoanTypesForFilter();
    expect(types).toHaveLength(2);
  });

  it('generates Excel workbook and PDF documents cleanly without errors', async () => {
    const workbook = await exportPaidOffLoansExcel([prabowoRow, budiRow], null, false);
    const sheet = workbook.getWorksheet('Laporan Pinjaman Lunas');
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBeGreaterThanOrEqual(8);

    const reportDoc = exportPaidOffLoansPdf([prabowoRow, budiRow], null, false);
    expect(reportDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const certDoc = exportPaidOffLoanCertificatePdf(prabowoRow, null, false);
    expect(certDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
