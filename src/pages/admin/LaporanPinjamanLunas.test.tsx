import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LaporanPinjamanLunas from './LaporanPinjamanLunas';
import LoanSubsidiaryLedgerModal, {
  buildLoanSubsidiaryLedger,
  buildFinancialReportUrl,
} from '../../components/loans/LoanSubsidiaryLedgerModal';
import {
  getPaidOffLoansReport,
  getLoanTypesForFilter,
  exportPaidOffLoansExcel,
  exportPaidOffLoansPdf,
  exportPaidOffLoanCertificatePdf,
  formatReportDate,
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
  tanggal_lahir: '1983-08-15',
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
  tanggal_lahir: '1985-05-20',
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

  it('renders header, active fiscal year badge (2026), action buttons, and 3 KPI summary cards scoped to active fiscal year', () => {
    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
      />
    );

    expect(html).toContain('Laporan Anggota Pinjaman Lunas');
    expect(html).toContain('data-testid="active-fiscal-year-badge"');
    expect(html).toContain('Tahun Fiskal 2026');
    expect(html).toContain('SIMKOP');
    expect(html).toContain('Simpan Pinjam');
    expect(html).toContain('Laporan Pinjaman Lunas');
    expect(html).toContain('Export Excel');
    expect(html).toContain('Cetak PDF');

    // KPI Cards scoped to active fiscal year (only Prabowo 2026, not Budi 2025)
    expect(html).toContain('Total Berkas Lunas');
    expect(html).toContain('data-testid="kpi-total-loans">1<');
    expect(html).toContain('Jumlah Anggota Lunas');
    expect(html).toContain('data-testid="kpi-unique-members">1<');
    expect(html).toContain('Total Plafon Terselesaikan');
    expect(html).toContain('24.000.000');
    expect(html).not.toContain('36.000.000');
  });

  it('renders Prabowo Hadi (2026) by default and excludes 2025 rows until fiscal year 2025 is selected', () => {
    const html2026 = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
      />
    );

    expect(html2026).toContain('Prabowo Hadi');
    expect(html2026).toContain('97109810');
    expect(html2026).toContain('15/08/1983');
    expect(html2026).toContain('PINJ-MIGRASI-97109810');
    expect(html2026).toContain('Pinjaman Reguler');
    expect(html2026).toContain('24.000.000');
    expect(html2026).toContain('24 Bln');
    expect(html2026).toContain('✓ Lunas Penuh');
    expect(html2026).not.toContain('Budi Santoso');

    const html2025 = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={mockSummary}
        initialLoanTypes={sampleLoanTypes}
        initialFiscalYear={2025}
      />
    );

    expect(html2025).toContain('Tahun Fiskal 2025');
    expect(html2025).toContain('data-testid="kpi-total-loans">1<');
    expect(html2025).toContain('12.000.000');
    expect(html2025).toContain('Budi Santoso');
    expect(html2025).toContain('Pinjaman Khusus');
    expect(html2025).toContain('12 Bln');
    expect(html2025).not.toContain('Prabowo Hadi');
  });

  it('renders filter dropdowns for Jenis Pinjaman and Tahun Lunas without "Semua Tahun" and independent year options', () => {
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

    expect(html).toContain('data-testid="search-paid-loans-input"');
    expect(html).toContain('data-testid="filter-loan-type-select"');
    expect(html).toContain('Semua Jenis Pinjaman');
    expect(html).toContain('<option value="Pinjaman Reguler">Pinjaman Reguler</option>');
    expect(html).toContain('<option value="Pinjaman Khusus">Pinjaman Khusus</option>');

    expect(html).toContain('data-testid="filter-paid-year-select"');
    expect(html).not.toContain('Semua Tahun');
    expect(html).toMatch(/<option[^>]*selected[^>]*value="2026"|<option[^>]*value="2026"[^>]*selected/);
    expect(html).toContain('>2026</option>');
    expect(html).toContain('>2025</option>');
    expect(html).toContain('>2024</option>');
    expect(html).toContain('>2023</option>');
    expect(html).toContain('>2022</option>');
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

    expect(html).toContain('Belum ada data pinjaman lunas yang cocok pada Tahun Fiskal 2026');
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
        member: { id: 'mem-prabowo', nrp: '97109810', nama: 'Prabowo Hadi', tanggal_lahir: '1983-08-15' },
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
        member: { id: 'mem-other', nrp: '11112222', nama: 'Anggota Belum Lunas', tanggal_lahir: '1988-11-10' },
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
        member: { id: 'mem-budi', nrp: '88010203', nama: 'Budi Santoso', tanggal_lahir: '1985-05-20' },
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

  it('generates Excel workbook and PDF documents cleanly with fiscal year metadata without errors', async () => {
    const workbook = await exportPaidOffLoansExcel([prabowoRow], null, false, 2026);
    const sheet = workbook.getWorksheet('Laporan Pinjaman Lunas');
    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBeGreaterThanOrEqual(7);
    const sheetValues = JSON.stringify(sheet!.getSheetValues());
    expect(sheetValues).toContain('TAHUN FISKAL 2026');
    expect(sheetValues).toContain('Tahun Fiskal: 2026');

    const reportDoc = exportPaidOffLoansPdf([prabowoRow], null, false, 2026);
    expect(reportDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const pdfContent = JSON.stringify((reportDoc as any).internal.pages);
    expect(pdfContent).toContain('TAHUN FISKAL 2026');

    const certDoc = exportPaidOffLoanCertificatePdf(prabowoRow, null, false);
    expect(certDoc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('filters paid-off loans server-side by fiscalYear (2026 vs 2025) and excludes loans settled in a different year', async () => {
    const repayGteMock = vi.fn();
    const repayLteMock = vi.fn();
    const schedEqMock = vi.fn();
    const schedGteMock = vi.fn();
    const schedLteMock = vi.fn();
    const loansIdInMock = vi.fn();

    const loan2026 = {
      id: 'loan-2026-only',
      loan_number: 'PJ-2026-001',
      member_id: 'mem-1',
      loan_type_id: 'lt-reg',
      principal_amount: 5000000,
      tenor: 5,
      disbursed_at: '2025-11-01',
      updated_at: '2026-03-15T10:00:00.000Z',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'REG', name: 'Pinjaman Reguler' },
      member: { id: 'mem-1', nrp: '10001', nama: 'Anggota 2026', tanggal_lahir: '1990-01-01' },
    };

    const loan2025 = {
      id: 'loan-2025-only',
      loan_number: 'PJ-2025-001',
      member_id: 'mem-2',
      loan_type_id: 'lt-khs',
      principal_amount: 3000000,
      tenor: 3,
      disbursed_at: '2025-01-01',
      updated_at: '2025-04-10T10:00:00.000Z',
      status: 'paid_off',
      loan_types: { id: 'lt-khs', code: 'KHS', name: 'Pinjaman Khusus' },
      member: { id: 'mem-2', nrp: '10002', nama: 'Anggota 2025', tanggal_lahir: '1991-02-02' },
    };

    const allRepayments = [
      {
        id: 'r-2025-part',
        loan_id: 'loan-2026-only',
        schedule_id: null,
        amount_paid: 1000000,
        payment_date: '2025-12-10T10:00:00.000Z',
        payment_method: 'potong_gaji',
      },
      {
        id: 'r-2026-final',
        loan_id: 'loan-2026-only',
        schedule_id: null,
        amount_paid: 4000000,
        payment_date: '2026-03-15T10:00:00.000Z',
        payment_method: 'potong_gaji',
      },
      {
        id: 'r-2025-full',
        loan_id: 'loan-2025-only',
        schedule_id: null,
        amount_paid: 3000000,
        payment_date: '2025-04-10T10:00:00.000Z',
        payment_method: 'transfer',
      },
    ];

    let activeYear = 2026;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loan_repayments') {
        return {
          select: vi.fn((cols: string) => {
            if (cols === 'loan_id') {
              return {
                gte: repayGteMock.mockImplementation((_col: string, start: string) => ({
                  lte: repayLteMock.mockImplementation((_col2: string, end: string) => {
                    const filtered = allRepayments
                      .filter((r) => r.payment_date >= start && r.payment_date <= end)
                      .map((r) => ({ loan_id: r.loan_id }));
                    return Promise.resolve({ data: filtered, error: null });
                  }),
                })),
              };
            }
            return {
              in: vi.fn((_col: string, ids: string[]) => ({
                order: vi.fn().mockResolvedValue({
                  data: allRepayments.filter((r) => ids.includes(r.loan_id)),
                  error: null,
                }),
              })),
            };
          }),
        };
      }

      if (table === 'loan_schedules') {
        return {
          select: vi.fn((cols: string) => {
            if (cols === 'loan_id') {
              return {
                eq: schedEqMock.mockImplementation(() => ({
                  gte: schedGteMock.mockImplementation(() => ({
                    lte: schedLteMock.mockImplementation(() =>
                      Promise.resolve({ data: [], error: null })
                    ),
                  })),
                })),
              };
            }
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }),
        };
      }

      if (table === 'loans') {
        return {
          select: vi.fn((cols: string) => {
            if (cols === 'id') {
              return {
                in: vi.fn(() => ({
                  gte: vi.fn((_col: string, start: string) => ({
                    lte: vi.fn((_col2: string, end: string) => {
                      const matches = [loan2026, loan2025]
                        .filter((l) => l.updated_at >= start && l.updated_at <= end)
                        .map((l) => ({ id: l.id }));
                      return Promise.resolve({ data: matches, error: null });
                    }),
                  })),
                })),
              };
            }
            return {
              in: loansIdInMock.mockImplementation((_col: string, ids: string[]) =>
                Promise.resolve({
                  data: [loan2026, loan2025].filter((l) => ids.includes(l.id)),
                  error: null,
                })
              ),
            };
          }),
        };
      }
      return {};
    });

    // 1. Query default active year 2026 -> only loan-2026-only fetched and returned
    activeYear = 2026;
    const res2026 = await getPaidOffLoansReport(activeYear);
    expect(repayGteMock).toHaveBeenCalledWith('payment_date', '2026-01-01T00:00:00.000Z');
    expect(repayLteMock).toHaveBeenCalledWith('payment_date', '2026-12-31T23:59:59.999Z');
    expect(schedEqMock).toHaveBeenCalledWith('status', 'paid');
    expect(schedGteMock).toHaveBeenCalledWith('due_date', '2026-01-01');
    expect(schedLteMock).toHaveBeenCalledWith('due_date', '2026-12-31');
    expect(loansIdInMock).toHaveBeenCalledWith('id', ['loan-2026-only']);
    expect(res2026.rows).toHaveLength(1);
    expect(res2026.rows[0].loanId).toBe('loan-2026-only');
    expect(res2026.rows[0].paidOffYear).toBe(2026);

    // 2. Query historical year 2025 -> loan-2026-only (which had a partial 2025 payment) is excluded because final payoff was 2026
    activeYear = 2025;
    const res2025 = await getPaidOffLoansReport(activeYear);
    expect(repayGteMock).toHaveBeenCalledWith('payment_date', '2025-01-01T00:00:00.000Z');
    expect(repayLteMock).toHaveBeenCalledWith('payment_date', '2025-12-31T23:59:59.999Z');
    expect(res2025.rows).toHaveLength(1);
    expect(res2025.rows[0].loanId).toBe('loan-2025-only');
    expect(res2025.rows[0].paidOffYear).toBe(2025);
  });

  it('extracts costPrice, markupAmount, itemDescription, financingScheme, and repayments in getPaidOffLoansReport', async () => {
    const goodsLoan = {
      id: 'loan-goods-1',
      loan_number: 'LOAN-1795083121561',
      member_id: 'mem-goods',
      loan_type_id: 'lt-brg',
      principal_amount: 2100000,
      cost_price: 2000000,
      markup_amount: 100000,
      item_description: 'Laptop Kerja Asus VivoBook',
      tenor: 1,
      agreed_tenor_months: 1,
      monthly_target: 2100000,
      disbursed_at: '2026-10-19',
      status: 'completed',
      loan_types: {
        id: 'lt-brg',
        code: 'PEMBIAYAAN_BARANG',
        name: 'Pembiayaan Barang',
        financing_scheme: 'GOODS_MARKUP',
      },
      member: { id: 'mem-goods', nrp: '87010011', nama: 'Surya Pratama', tanggal_lahir: '1985-05-20' },
    };

    const goodsSchedules = [
      {
        id: 'sg-1',
        loan_id: 'loan-goods-1',
        period_number: 1,
        due_date: '2026-11-19',
        target_amount: 2100000,
        principal_portion: 2000000,
        margin_portion: 100000,
        paid_amount: 2100000,
        status: 'paid',
      },
    ];

    const goodsRepayments = [
      {
        id: 'rg-1',
        loan_id: 'loan-goods-1',
        schedule_id: 'sg-1',
        amount_paid: 2100000,
        principal_portion: 2000000,
        margin_portion: 100000,
        payment_date: '2026-11-19T08:00:00.000Z',
        payment_method: 'potong_gaji',
        receipt_number: 'KW-PINJ/LOAN-1795083121561/B1/20261119-TCD',
        notes: 'Pelunasan pembiayaan barang',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockResolvedValue({ data: [goodsLoan], error: null }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: goodsSchedules, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: goodsRepayments, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const summary = await getPaidOffLoansReport();
    expect(summary.rows).toHaveLength(1);
    const row = summary.rows[0];
    expect(row.financingScheme).toBe('GOODS_MARKUP');
    expect(row.costPrice).toBe(2000000);
    expect(row.markupAmount).toBe(100000);
    expect(row.itemDescription).toBe('Laptop Kerja Asus VivoBook');
    expect(row.repayments).toHaveLength(1);
    expect(row.repayments?.[0]).toMatchObject({
      receiptNumber: 'KW-PINJ/LOAN-1795083121561/B1/20261119-TCD',
      principalPortion: 2000000,
      marginPortion: 100000,
      paymentMethod: 'potong_gaji',
    });
  });
});

describe('Clickable LOAN-... Reference & LoanSubsidiaryLedgerModal', () => {
  const goodsMarkupRow: PaidOffLoanReportRow = {
    id: 'loan-goods-1795083121561',
    loanId: 'loan-goods-1795083121561',
    loanNumber: 'LOAN-1795083121561',
    memberId: 'mem-surya',
    memberName: 'Surya Pratama',
    nrp: '87010011',
    tanggal_lahir: '1985-05-20',
    loanTypeId: 'lt-brg',
    loanTypeCode: 'PEMBIAYAAN_BARANG',
    loanTypeName: 'Pembiayaan Barang',
    financingScheme: 'GOODS_MARKUP',
    itemDescription: 'Pengadaan Unit Elektronik TV 43 Inch',
    costPrice: 2000000,
    markupAmount: 100000,
    principalAmount: 2100000,
    tenor: 1,
    monthlyInstallment: 2100000,
    totalPaid: 2100000,
    disbursedAt: '2026-10-19',
    paidOffDate: '2026-11-19T08:00:00.000Z',
    paidOffYear: 2026,
    status: 'completed',
    paidPeriodsCount: 1,
    schedules: [
      {
        id: 'sg-1',
        periodNumber: 1,
        dueDate: '2026-11-19',
        targetAmount: 2100000,
        paidAmount: 2100000,
        principalPortion: 2000000,
        marginPortion: 100000,
        status: 'paid',
        paymentDate: '2026-11-19T08:00:00.000Z',
        paymentMethod: 'potong_gaji',
        receiptNumber: 'KW-PINJ/LOAN-1795083121561/B1/20261119-TCD',
      },
    ],
    repayments: [
      {
        id: 'rep-g-1',
        scheduleId: 'sg-1',
        periodNumber: 1,
        amountPaid: 2100000,
        principalPortion: 2000000,
        marginPortion: 100000,
        paymentDate: '2026-11-19T08:00:00.000Z',
        paymentMethod: 'potong_gaji',
        receiptNumber: 'KW-PINJ/LOAN-1795083121561/B1/20261119-TCD',
        notes: 'Pelunasan ke-1',
      },
    ],
  };

  it('renders NO. PINJAMAN column as an interactive button opening subsidiary ledger and renders modal via initialSelectedLedgerRow', () => {
    const summaryWithGoods: PaidOffLoansSummary = {
      totalPaidOffLoans: 1,
      uniqueMembersCount: 1,
      totalPrincipalAmount: 2100000,
      totalPaidAmount: 2100000,
      rows: [goodsMarkupRow],
    };

    const html = renderToStaticMarkup(
      <LaporanPinjamanLunas
        initialData={summaryWithGoods}
        initialLoanTypes={sampleLoanTypes}
        initialSelectedLedgerRow={goodsMarkupRow}
      />
    );

    expect(html).toContain('data-testid="open-ledger-loan-goods-1795083121561"');
    expect(html).toContain('title="Klik untuk membuka Buku Pembantu Piutang &amp; Rincian Angsuran"');
    expect(html).toContain('data-testid="loan-subsidiary-ledger-modal"');
    expect(html).toContain('Buku Pembantu Piutang &amp; Mutasi Angsuran');
    expect(html).toContain('LOAN-1795083121561');
  });

  it('renders LoanSubsidiaryLedgerModal for GOODS_MARKUP inside MemoryRouter with supplier cost, markup, kwitansi, Rp 0 balance, and matrix shortcut', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LoanSubsidiaryLedgerModal loanRecord={goodsMarkupRow} onClose={() => {}} />
      </MemoryRouter>
    );

    expect(html).toContain('Pembiayaan Barang (Markup Margin)');
    expect(html).toContain('Pengadaan Unit Elektronik TV 43 Inch');
    expect(html).toContain('Harga Modal Supplier');
    expect(html).toContain('Rp 2.000.000');
    expect(html).toContain('Margin Markup');
    expect(html).toContain('Rp 100.000');
    expect(html).toContain('Total Akad Piutang');
    expect(html).toContain('Rp 2.100.000');
    expect(html).toContain('Realisasi Akad Pembiayaan Barang / Pencairan Pinjaman');
    expect(html).toContain('+Rp 2.100.000');
    expect(html).toContain('Angsuran Ke-1');
    expect(html).toContain('KW-PINJ/LOAN-1795083121561/B1/20261119-TCD');
    expect(html).toContain('POTONG_GAJI');
    expect(html).toContain('Pokok: Rp 2.000.000 • Margin: Rp 100.000');
    expect(html).toContain('Rp 0 (Lunas)');
    expect(html).toContain('data-testid="open-in-loan-matrix-btn"');
    expect(html).toContain('Buka di Matriks Pinjaman');
    expect(html).toContain('(/admin/loan-matrix)');
  });

  it('renders LoanSubsidiaryLedgerModal for 0% cash loan (Prabowo Hadi) with Plafon Pokok, 0% interest, and 24-month ledger', () => {
    const html = renderToStaticMarkup(
      <LoanSubsidiaryLedgerModal loanRecord={prabowoRow} onClose={() => {}} />
    );

    expect(html).toContain('Pinjaman Tunai 0%');
    expect(html).toContain('Plafon Pokok');
    expect(html).toContain('Rp 24.000.000');
    expect(html).toContain('>0%<');
    expect(html).toContain('24 Bulan');
    expect(html).toContain('Angsuran Ke-1');
    expect(html).toContain('Angsuran Ke-24');
    expect(html).toContain('KW-PINJ/PINJ-MIGRASI-97109810/B24');
    expect(html).toContain('Rp 0 (Lunas)');
  });

  it('buildLoanSubsidiaryLedger accurately computes running balance across partial repayments and schedule-less loans', () => {
    const partialLoan: PaidOffLoanReportRow = {
      ...goodsMarkupRow,
      tenor: 2,
      principalAmount: 2100000,
      schedules: [
        {
          id: 's-1',
          periodNumber: 1,
          dueDate: '2026-10-19',
          targetAmount: 1050000,
          paidAmount: 1050000,
          principalPortion: 1000000,
          marginPortion: 50000,
          status: 'paid',
          receiptNumber: 'KW-1',
        },
        {
          id: 's-2',
          periodNumber: 2,
          dueDate: '2026-11-19',
          targetAmount: 1050000,
          paidAmount: 1050000,
          principalPortion: 1000000,
          marginPortion: 50000,
          status: 'paid',
          receiptNumber: 'KW-2',
        },
      ],
      repayments: [
        {
          id: 'r-1a',
          scheduleId: 's-1',
          amountPaid: 500000,
          paymentDate: '2026-10-10',
          paymentMethod: 'tunai',
          receiptNumber: 'KW-1A',
        },
        {
          id: 'r-1b',
          scheduleId: 's-1',
          amountPaid: 550000,
          paymentDate: '2026-10-19',
          paymentMethod: 'transfer',
          receiptNumber: 'KW-1B',
        },
        {
          id: 'r-2',
          scheduleId: 's-2',
          amountPaid: 1050000,
          paymentDate: '2026-11-19',
          paymentMethod: 'potong_gaji',
          receiptNumber: 'KW-2',
        },
      ],
    };

    const ledger = buildLoanSubsidiaryLedger(partialLoan);
    expect(ledger.entries).toHaveLength(4);
    expect(ledger.entries[0].runningBalance).toBe(2100000);
    expect(ledger.entries[1].runningBalance).toBe(1600000);
    expect(ledger.entries[2].runningBalance).toBe(1050000);
    expect(ledger.entries[3].runningBalance).toBe(0);
    expect(ledger.totalDebit).toBe(2100000);
    expect(ledger.totalCredit).toBe(2100000);
    expect(ledger.endingBalance).toBe(0);

    // Fallback for schedule-less loan (budiRow)
    const fallbackLedger = buildLoanSubsidiaryLedger(budiRow);
    expect(fallbackLedger.entries).toHaveLength(2);
    expect(fallbackLedger.entries[0].debit).toBe(12000000);
    expect(fallbackLedger.entries[1].credit).toBe(12000000);
    expect(fallbackLedger.endingBalance).toBe(0);
  });

  it('builds deep-link URLs to /admin/laporan-keuangan and renders clickable KW-PINJ/... buttons for margin and 0% loans', () => {
    const goodsUrl = buildFinancialReportUrl('LOAN-1795083121561', {
      marginPortion: 100000,
      date: '2026-11-19T08:00:00.000Z',
      referenceNumber: 'KW-PINJ/LOAN-1795083121561/B1/20261119-TCD',
    });
    expect(goodsUrl).toBe(
      '/admin/laporan-keuangan?tab=shu&ref=LOAN-1795083121561&receipt=KW-PINJ%2FLOAN-1795083121561%2FB1%2F20261119-TCD&date=2026-11-19'
    );

    const cashUrl = buildFinancialReportUrl('LOAN-1795088101742', {
      marginPortion: 0,
      date: '2026-11-19T10:15:00.000Z',
      referenceNumber: 'KW-PINJ/LOAN-1795088101742/B1/20261119-HXO',
    });
    expect(cashUrl).toBe(
      '/admin/laporan-keuangan?tab=cashflow&ref=LOAN-1795088101742&receipt=KW-PINJ%2FLOAN-1795088101742%2FB1%2F20261119-HXO&date=2026-11-19'
    );

    // Goods markup modal renders indigo SHU deep-link button for repayment and static badge for disbursement
    const goodsHtml = renderToStaticMarkup(
      <MemoryRouter>
        <LoanSubsidiaryLedgerModal loanRecord={goodsMarkupRow} onClose={() => {}} />
      </MemoryRouter>
    );
    expect(goodsHtml).toContain('data-testid="inspect-receipt-repay-rep-g-1"');
    expect(goodsHtml).toContain(
      'data-report-url="/admin/laporan-keuangan?tab=shu&amp;ref=LOAN-1795083121561&amp;receipt=KW-PINJ%2FLOAN-1795083121561%2FB1%2F20261119-TCD&amp;date=2026-11-19"'
    );
    expect(goodsHtml).toContain(
      'title="Klik untuk menelusuri baris referensi di Estimasi SHU Berjalan (/admin/laporan-keuangan)"'
    );
    expect(goodsHtml).not.toContain('data-testid="inspect-receipt-disbursement-');

    // 0% cash loan renders emerald Cash Flow deep-link button (works without Router too)
    const cashLoanRow: PaidOffLoanReportRow = {
      ...prabowoRow,
      id: 'loan-cash-1795088101742',
      loanId: 'loan-cash-1795088101742',
      loanNumber: 'LOAN-1795088101742',
      tenor: 1,
      principalAmount: 1000000,
      monthlyInstallment: 1000000,
      totalPaid: 1000000,
      schedules: [
        {
          id: 'sc-cash-1',
          periodNumber: 1,
          dueDate: '2026-11-19',
          targetAmount: 1000000,
          paidAmount: 1000000,
          status: 'paid',
          paymentDate: '2026-11-19T10:15:00.000Z',
          paymentMethod: 'potong_gaji',
          receiptNumber: 'KW-PINJ/LOAN-1795088101742/B1/20261119-HXO',
        },
      ],
      repayments: [
        {
          id: 'rep-cash-1',
          scheduleId: 'sc-cash-1',
          periodNumber: 1,
          amountPaid: 1000000,
          principalPortion: 1000000,
          marginPortion: 0,
          paymentDate: '2026-11-19T10:15:00.000Z',
          paymentMethod: 'potong_gaji',
          receiptNumber: 'KW-PINJ/LOAN-1795088101742/B1/20261119-HXO',
        },
      ],
    };

    const cashHtml = renderToStaticMarkup(
      <LoanSubsidiaryLedgerModal loanRecord={cashLoanRow} onClose={() => {}} />
    );
    expect(cashHtml).toContain('data-testid="inspect-receipt-repay-rep-cash-1"');
    expect(cashHtml).toContain(
      'data-report-url="/admin/laporan-keuangan?tab=cashflow&amp;ref=LOAN-1795088101742&amp;receipt=KW-PINJ%2FLOAN-1795088101742%2FB1%2F20261119-HXO&amp;date=2026-11-19"'
    );
    expect(cashHtml).toContain(
      'title="Klik untuk menelusuri mutasi kas angsuran di Laporan Keuangan (/admin/laporan-keuangan)"'
    );
    expect(cashHtml).toContain('bg-emerald-50');
  });

  it('excludes partially-paid SALDO-AWAL loan (HERY SETYO WIBOWO) from getPaidOffLoansReport, repairs it to active, and keeps truly settled LN2611-0002', async () => {
    const updateEqMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    const heryLoan = {
      id: 'loan-hery-1',
      loan_number: 'SALDO-AWAL-75100839-GAJISIPA',
      member_id: 'mem-hery',
      loan_type_id: 'lt-reg',
      principal_amount: 69000000,
      tenor: 94,
      agreed_tenor_months: 94,
      monthly_target: 734043,
      disbursed_at: '2025-12-01',
      status: 'paid_off',
      sisa_pinjaman: 0,
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-hery', nrp: '75100839', nama: 'HERY SETYO WIBOWO', tanggal_lahir: '1975-10-08' },
    };

    const ln2611Loan = {
      id: 'loan-ln2611-2',
      loan_number: 'LN2611-0002',
      member_id: 'mem-tes-1',
      loan_type_id: 'lt-brg',
      principal_amount: 2020000,
      tenor: 3,
      agreed_tenor_months: 3,
      monthly_target: 673334,
      disbursed_at: '2026-11-20',
      status: 'paid_off',
      sisa_pinjaman: 0,
      loan_types: { id: 'lt-brg', code: 'PEMBIAYAAN_BARANG', name: 'Pembiayaan Barang' },
      member: { id: 'mem-tes-1', nrp: '200001', nama: 'anggota tes 1', tanggal_lahir: '1990-01-01' },
    };

    const herySchedules = Array.from({ length: 94 }, (_, idx) => {
      const period = idx + 1;
      const isPaid = period <= 12;
      return {
        id: `sh-hery-${period}`,
        loan_id: 'loan-hery-1',
        period_number: period,
        due_date: `2026-${String(((period - 1) % 12) + 1).padStart(2, '0')}-01`,
        target_amount: 734043,
        paid_amount: isPaid ? 734043 : 0,
        status: isPaid ? 'paid' : 'unpaid',
      };
    });

    const lnSchedules = [
      { id: 'sl-1', loan_id: 'loan-ln2611-2', period_number: 1, due_date: '2026-12-24', target_amount: 673334, paid_amount: 673334, status: 'paid' },
      { id: 'sl-2', loan_id: 'loan-ln2611-2', period_number: 2, due_date: '2027-01-24', target_amount: 673333, paid_amount: 673333, status: 'paid' },
      { id: 'sl-3', loan_id: 'loan-ln2611-2', period_number: 3, due_date: '2027-02-24', target_amount: 673333, paid_amount: 673333, status: 'paid' },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockResolvedValue({ data: [heryLoan, ln2611Loan], error: null }),
          update: updateMock,
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [...herySchedules, ...lnSchedules], error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'rep-ln-1',
                    loan_id: 'loan-ln2611-2',
                    schedule_id: null,
                    amount_paid: 2020000,
                    payment_date: '2026-11-24T10:00:00.000Z',
                    payment_method: 'transfer',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const summary = await getPaidOffLoansReport();

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].loanNumber).toBe('LN2611-0002');
    expect(summary.rows.some((r) => r.loanNumber === 'SALDO-AWAL-75100839-GAJISIPA')).toBe(false);

    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        sisa_pinjaman: 60191484,
        updated_at: expect.any(String),
      })
    );
    expect(updateEqMock).toHaveBeenCalledWith('id', 'loan-hery-1');
  });

  it('renders dynamic "Berjalan (13% Terbayar)" and "Sisa Piutang: Rp 60.191.484" in LoanSubsidiaryLedgerModal for partially paid loan', () => {
    const partialHeryRow: PaidOffLoanReportRow = {
      id: 'loan-hery-1',
      loanId: 'loan-hery-1',
      loanNumber: 'SALDO-AWAL-75100839-GAJISIPA',
      memberId: 'mem-hery',
      memberName: 'HERY SETYO WIBOWO',
      nrp: '75100839',
      tanggal_lahir: '1975-10-08',
      loanTypeId: 'lt-reg',
      loanTypeCode: 'GAJISIPA',
      loanTypeName: 'Gaji Sipa',
      principalAmount: 69000000,
      tenor: 94,
      monthlyInstallment: 734043,
      totalPaid: 8808516,
      disbursedAt: '2025-12-01',
      paidOffDate: null,
      paidOffYear: null,
      status: 'completed',
      paidPeriodsCount: 12,
      schedules: Array.from({ length: 12 }, (_, idx) => ({
        id: `sh-hery-${idx + 1}`,
        periodNumber: idx + 1,
        dueDate: `2026-${String(idx + 1).padStart(2, '0')}-01`,
        targetAmount: 734043,
        paidAmount: 734043,
        status: 'paid',
      })),
    };

    const html = renderToStaticMarkup(
      <LoanSubsidiaryLedgerModal loanRecord={partialHeryRow} onClose={() => {}} />
    );

    expect(html).toContain('Berjalan (13% Terbayar)');
    expect(html).toContain('Sisa Piutang: Rp 60.191.484');
    expect(html).not.toContain('✓ Lunas Penuh');
    expect(html).not.toContain('100% Lunas');
  });

  it('filters out redundant legacy lump-sum SALDO_AWAL row (KW2611-0079) when per-period SALDO_AWAL_MIGRASI receipts exist in buildLoanSubsidiaryLedger', () => {
    const harjosoRow: PaidOffLoanReportRow = {
      id: 'loan-harjoso-1',
      loanId: 'loan-harjoso-1',
      loanNumber: 'SALDO-AWAL-197006162009101001-GAJISIPA',
      memberId: 'mem-harjoso',
      memberName: 'HARJOSO',
      nrp: '197006162009101001',
      tanggal_lahir: '1970-06-16',
      loanTypeId: 'lt-reg',
      loanTypeCode: 'GAJISIPA',
      loanTypeName: 'Gaji Sipa',
      principalAmount: 9000000,
      tenor: 9,
      monthlyInstallment: 1000000,
      totalPaid: 9000000,
      disbursedAt: '2026-01-01',
      paidOffDate: '2026-11-22T08:00:00.000Z',
      paidOffYear: 2026,
      status: 'completed',
      paidPeriodsCount: 9,
      schedules: Array.from({ length: 9 }, (_, idx) => ({
        id: `sh-harjoso-${idx + 1}`,
        periodNumber: idx + 1,
        dueDate: `2026-${String(idx + 2).padStart(2, '0')}-01`,
        targetAmount: 1000000,
        paidAmount: 1000000,
        status: 'paid',
        receiptNumber:
          idx < 2
            ? `KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B${idx + 1}`
            : `KW2611-153${idx + 7}`,
      })),
      repayments: [
        {
          id: 'rep-harjoso-b1',
          scheduleId: 'sh-harjoso-1',
          periodNumber: 1,
          amountPaid: 1000000,
          paymentDate: '2026-02-01T08:00:00.000Z',
          paymentMethod: 'SALDO_AWAL_MIGRASI',
          receiptNumber: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B1',
          notes: 'Angsuran Saldo Awal Migrasi Bln ke-1',
        },
        {
          id: 'rep-harjoso-b2',
          scheduleId: 'sh-harjoso-2',
          periodNumber: 2,
          amountPaid: 1000000,
          paymentDate: '2026-03-01T08:00:00.000Z',
          paymentMethod: 'SALDO_AWAL_MIGRASI',
          receiptNumber: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B2',
          notes: 'Angsuran Saldo Awal Migrasi Bln ke-2',
        },
        ...Array.from({ length: 7 }, (_, idx) => ({
          id: `rep-harjoso-${idx + 3}`,
          scheduleId: `sh-harjoso-${idx + 3}`,
          periodNumber: idx + 3,
          amountPaid: 1000000,
          paymentDate: `2026-${String(idx + 4).padStart(2, '0')}-01T08:00:00.000Z`,
          paymentMethod: 'potong_gaji',
          receiptNumber: `KW2611-153${idx + 9}`,
          notes: `Angsuran ke-${idx + 3}`,
        })),
        {
          id: 'rep-harjoso-lump-sum',
          scheduleId: null,
          periodNumber: null,
          amountPaid: 2000000,
          paymentDate: '2026-11-22T08:00:00.000Z',
          paymentMethod: 'SALDO_AWAL',
          receiptNumber: 'KW2611-0079',
          notes: 'Total Terangsur Saldo Awal (2026-11-22)',
        },
      ],
    };

    const ledger = buildLoanSubsidiaryLedger(harjosoRow);
    expect(ledger.entries).toHaveLength(10);
    expect(ledger.totalCredit).toBe(9000000);
    expect(ledger.endingBalance).toBe(0);
    expect(ledger.entries.some((e) => e.referenceNumber === 'KW2611-0079')).toBe(false);
  });

  it('excludes and deletes redundant legacy lump-sum SALDO_AWAL row in getPaidOffLoansReport', async () => {
    const deleteInMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const deleteMock = vi.fn().mockReturnValue({ in: deleteInMock });

    const harjosoLoan = {
      id: 'loan-harjoso-1',
      loan_number: 'SALDO-AWAL-197006162009101001-GAJISIPA',
      member_id: 'mem-harjoso',
      loan_type_id: 'lt-reg',
      principal_amount: 9000000,
      tenor: 9,
      agreed_tenor_months: 9,
      monthly_target: 1000000,
      disbursed_at: '2026-01-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-harjoso', nrp: '197006162009101001', nama: 'HARJOSO', tanggal_lahir: '1970-06-16' },
    };

    const harjosoSchedules = Array.from({ length: 9 }, (_, idx) => ({
      id: `sh-h-${idx + 1}`,
      loan_id: 'loan-harjoso-1',
      period_number: idx + 1,
      due_date: `2026-${String(idx + 2).padStart(2, '0')}-01`,
      target_amount: 1000000,
      paid_amount: 1000000,
      status: 'paid',
    }));

    const harjosoRepayments = [
      {
        id: 'rep-mig-1',
        loan_id: 'loan-harjoso-1',
        schedule_id: 'sh-h-1',
        amount_paid: 1000000,
        payment_date: '2026-02-01T08:00:00.000Z',
        payment_method: 'SALDO_AWAL_MIGRASI',
        receipt_number: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B1',
        notes: 'Angsuran Saldo Awal Migrasi Bln ke-1',
      },
      {
        id: 'rep-mig-2',
        loan_id: 'loan-harjoso-1',
        schedule_id: 'sh-h-2',
        amount_paid: 1000000,
        payment_date: '2026-03-01T08:00:00.000Z',
        payment_method: 'SALDO_AWAL_MIGRASI',
        receipt_number: 'KW-MIGRASI/SALDO-AWAL-197006162009101001-GAJISIPA/B2',
        notes: 'Angsuran Saldo Awal Migrasi Bln ke-2',
      },
      ...Array.from({ length: 7 }, (_, idx) => ({
        id: `rep-reg-${idx + 3}`,
        loan_id: 'loan-harjoso-1',
        schedule_id: `sh-h-${idx + 3}`,
        amount_paid: 1000000,
        payment_date: `2026-${String(idx + 4).padStart(2, '0')}-01T08:00:00.000Z`,
        payment_method: 'potong_gaji',
        receipt_number: `KW2611-153${idx + 9}`,
        notes: `Angsuran ke-${idx + 3}`,
      })),
      {
        id: 'rep-lump-sum',
        loan_id: 'loan-harjoso-1',
        schedule_id: null,
        amount_paid: 2000000,
        payment_date: '2026-11-22T08:00:00.000Z',
        payment_method: 'SALDO_AWAL',
        receipt_number: 'KW2611-0079',
        notes: 'Total Terangsur Saldo Awal (2026-11-22)',
      },
    ];

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockResolvedValue({ data: [harjosoLoan], error: null }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: harjosoSchedules, error: null }),
            }),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: harjosoRepayments, error: null }),
            }),
          }),
          delete: deleteMock,
        };
      }
      return {};
    });

    const summary = await getPaidOffLoansReport();
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].totalPaid).toBe(9000000);
    expect(summary.rows[0].repayments).toHaveLength(9);
    expect(summary.rows[0].repayments?.some((r) => r.receiptNumber === 'KW2611-0079')).toBe(false);
    expect(deleteMock).toHaveBeenCalled();
    expect(deleteInMock).toHaveBeenCalledWith('id', ['rep-lump-sum']);
  });
});

describe('paidOffLoansReportService - Idempotent Migration Backfill, In-Flight Lock & Date Clamping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createStatefulBackfillMock(options: {
    loans: any[];
    schedules: any[];
    initialRepayments: any[];
    omitReceiptColumnOnInsert?: boolean;
    asyncOrDelay?: boolean;
  }) {
    let repaymentsDb = options.initialRepayments.map((r) => ({ ...r }));
    const insertedPayloads: any[][] = [];
    const deletedIds: string[] = [];
    const cashFlowCalls: string[] = [];
    let schedBackfillCalls = 0;
    let nextRepId = 1;

    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'cash_flow') {
        cashFlowCalls.push('called');
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }

      if (table === 'loans') {
        return {
          select: vi.fn(() => {
            const fullResult = Promise.resolve({ data: options.loans, error: null });
            return {
              in: vi.fn((_col: string, ids: string[]) =>
                Promise.resolve({
                  data: options.loans.filter((l) => ids.includes(l.id)),
                  error: null,
                })
              ),
              then: fullResult.then.bind(fullResult),
            };
          }),
        };
      }

      if (table === 'loan_schedules') {
        return {
          select: vi.fn(() => ({
            or: vi.fn(() => {
              schedBackfillCalls += 1;
              const filtered = options.schedules.filter(
                (s) => Number(s.paid_amount || 0) > 0 || String(s.status || '').toLowerCase() === 'paid'
              );
              if (options.asyncOrDelay) {
                return (async () => {
                  await Promise.resolve();
                  await Promise.resolve();
                  return { data: filtered, error: null };
                })();
              }
              return Promise.resolve({ data: filtered, error: null });
            }),
            in: vi.fn((_col: string, ids: string[]) => ({
              order: vi.fn().mockResolvedValue({
                data: options.schedules.filter((s) => ids.includes(s.loan_id)),
                error: null,
              }),
            })),
          })),
        };
      }

      if (table === 'loan_repayments') {
        return {
          select: vi.fn((cols?: string) => ({
            in: vi.fn((_col: string, ids: string[]) => {
              if (
                options.omitReceiptColumnOnInsert &&
                typeof cols === 'string' &&
                cols.includes('receipt_number')
              ) {
                const colErrRes = Promise.resolve({
                  data: null,
                  error: { code: '42703', message: 'column loan_repayments.receipt_number does not exist' },
                });
                return {
                  order: vi.fn().mockImplementation(() => colErrRes),
                  then: colErrRes.then.bind(colErrRes),
                };
              }
              const matching = repaymentsDb.filter((r) => ids.includes(r.loan_id));
              const resPromise = Promise.resolve({
                data: matching.map((r) => ({ ...r })),
                error: null,
              });
              return {
                order: vi.fn().mockResolvedValue({
                  data: matching.map((r) => ({ ...r })),
                  error: null,
                }),
                then: resPromise.then.bind(resPromise),
              };
            }),
          })),
          insert: vi.fn(async (payload: any) => {
            const rows = Array.isArray(payload) ? payload : [payload];
            if (
              options.omitReceiptColumnOnInsert &&
              rows.some((r) => Object.prototype.hasOwnProperty.call(r, 'receipt_number'))
            ) {
              return {
                data: null,
                error: { code: 'PGRST204', message: "Could not find the 'receipt_number' column" },
              };
            }
            const cloned = rows.map((r) => ({ id: `rep-auto-${nextRepId++}`, ...r }));
            insertedPayloads.push(cloned);
            repaymentsDb.push(...cloned);
            return { data: cloned, error: null };
          }),
          delete: vi.fn(() => ({
            in: vi.fn(async (_col: string, ids: string[]) => {
              deletedIds.push(...ids);
              repaymentsDb = repaymentsDb.filter((r) => !ids.includes(r.id));
              return { data: null, error: null };
            }),
          })),
        };
      }

      return {};
    });

    return {
      getRepaymentsDb: () => repaymentsDb,
      insertedPayloads,
      deletedIds,
      cashFlowCalls,
      getSchedBackfillCalls: () => schedBackfillCalls,
    };
  }

  it('auto-backfills SALDO_AWAL_MIGRASI receipts with payment_date <= today and 0 inserts into cash_flow', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    const loan = {
      id: 'loan-mig-only-1',
      loan_number: 'SALDO-AWAL-19800101-GAJISIPA',
      member_id: 'mem-mig-1',
      loan_type_id: 'lt-reg',
      principal_amount: 3000000,
      tenor: 3,
      agreed_tenor_months: 3,
      monthly_target: 1000000,
      disbursed_at: '2026-08-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-mig-1', nrp: '19800101', nama: 'Anggota Migrasi', tanggal_lahir: '1980-01-01' },
    };

    const schedules = [
      { id: 'sm-1', loan_id: loan.id, period_number: 1, due_date: '2026-09-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sm-2', loan_id: loan.id, period_number: 2, due_date: '2026-10-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sm-3', loan_id: loan.id, period_number: 3, due_date: '2026-12-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
    ];

    const state = createStatefulBackfillMock({
      loans: [loan],
      schedules,
      initialRepayments: [],
    });

    const summary = await getPaidOffLoansReport();

    expect(state.cashFlowCalls).toHaveLength(0);
    expect(state.insertedPayloads).toHaveLength(1);
    expect(state.insertedPayloads[0]).toHaveLength(3);
    expect(state.insertedPayloads[0][0]).toMatchObject({
      loan_id: loan.id,
      schedule_id: 'sm-1',
      amount_paid: 1000000,
      payment_date: '2026-09-01T08:00:00.000Z',
      payment_method: 'SALDO_AWAL_MIGRASI',
      receipt_number: 'KW-MIGRASI/SALDO-AWAL-19800101-GAJISIPA/B1',
      notes: 'Angsuran Saldo Awal Migrasi (SALDO-AWAL-19800101-GAJISIPA) Bln ke-1',
    });
    // Periode ke-3 due_date 2026-12-01 dikunci maksimal hari ini (2026-11-25)
    expect(state.insertedPayloads[0][2]).toMatchObject({
      schedule_id: 'sm-3',
      payment_date: '2026-11-25T08:00:00.000Z',
      receipt_number: 'KW-MIGRASI/SALDO-AWAL-19800101-GAJISIPA/B3',
    });

    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].totalPaid).toBe(3000000);
    expect(summary.rows[0].paidOffDate).toBe('2026-11-25T08:00:00.000Z');
    expect(summary.rows[0].repayments).toHaveLength(3);
    expect(summary.rows[0].repayments?.every((r) => r.paymentMethod === 'SALDO_AWAL_MIGRASI')).toBe(true);
  });

  it('cleans up redundant legacy SALDO_AWAL / migrasi_awal lump-sum rows after backfill so totals are not double-counted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    const loanA = {
      id: 'loan-legacy-sa',
      loan_number: 'SALDO-AWAL-19810202-GAJISIPA',
      member_id: 'mem-a',
      loan_type_id: 'lt-reg',
      principal_amount: 2000000,
      tenor: 2,
      agreed_tenor_months: 2,
      monthly_target: 1000000,
      disbursed_at: '2026-08-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-a', nrp: '19810202', nama: 'Anggota SA', tanggal_lahir: '1981-02-02' },
    };

    const loanB = {
      id: 'loan-legacy-ma',
      loan_number: 'SALDO-AWAL-19820303-GAJISIPA',
      member_id: 'mem-b',
      loan_type_id: 'lt-reg',
      principal_amount: 1500000,
      tenor: 1,
      agreed_tenor_months: 1,
      monthly_target: 1500000,
      disbursed_at: '2026-08-01',
      status: 'paid_off',
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-b', nrp: '19820303', nama: 'Anggota MA', tanggal_lahir: '1982-03-03' },
    };

    const schedules = [
      { id: 'sa-1', loan_id: loanA.id, period_number: 1, due_date: '2026-09-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sa-2', loan_id: loanA.id, period_number: 2, due_date: '2026-10-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'sb-1', loan_id: loanB.id, period_number: 1, due_date: '2026-09-15', target_amount: 1500000, paid_amount: 1500000, status: 'paid' },
    ];

    const initialRepayments = [
      {
        id: 'rep-old-sa',
        loan_id: loanA.id,
        schedule_id: null,
        amount_paid: 2000000,
        payment_date: '2026-10-01T08:00:00.000Z',
        payment_method: 'SALDO_AWAL',
        receipt_number: 'KW2610-0011',
        notes: 'Ringkasan Total Terangsur Saldo Awal',
      },
      {
        id: 'rep-old-ma',
        loan_id: loanB.id,
        schedule_id: null,
        amount_paid: 1500000,
        payment_date: '2026-09-15T08:00:00.000Z',
        payment_method: 'migrasi_awal',
        receipt_number: 'KW2609-0022',
        notes: 'Total Terangsur Saldo Awal',
      },
    ];

    const state = createStatefulBackfillMock({
      loans: [loanA, loanB],
      schedules,
      initialRepayments,
    });

    const summary = await getPaidOffLoansReport();

    expect(state.cashFlowCalls).toHaveLength(0);
    expect(state.deletedIds).toEqual(expect.arrayContaining(['rep-old-sa', 'rep-old-ma']));
    expect(state.getRepaymentsDb().some((r) => r.id === 'rep-old-sa' || r.id === 'rep-old-ma')).toBe(false);
    expect(state.getRepaymentsDb()).toHaveLength(3);

    const rowA = summary.rows.find((r) => r.loanId === loanA.id);
    const rowB = summary.rows.find((r) => r.loanId === loanB.id);
    expect(rowA?.totalPaid).toBe(2000000);
    expect(rowA?.repayments).toHaveLength(2);
    expect(rowB?.totalPaid).toBe(1500000);
    expect(rowB?.repayments).toHaveLength(1);
    expect(summary.totalPaidAmount).toBe(3500000);
  });

  it('deduplicates concurrent Promise.all calls via in-flight lock and stays idempotent on sequential re-calls', async () => {
    const loan = {
      id: 'loan-lock-1',
      loan_number: 'SALDO-AWAL-19900101-GAJISIPA',
      member_id: 'mem-lock-1',
      loan_type_id: 'lt-reg',
      principal_amount: 2000000,
      tenor: 2,
      agreed_tenor_months: 2,
      monthly_target: 1000000,
      disbursed_at: '2026-07-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-lock-1', nrp: '19900101', nama: 'Anggota Lock', tanggal_lahir: '1990-01-01' },
    };

    const schedules = [
      { id: 'slk-1', loan_id: loan.id, period_number: 1, due_date: '2026-08-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 'slk-2', loan_id: loan.id, period_number: 2, due_date: '2026-09-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
    ];

    const state = createStatefulBackfillMock({
      loans: [loan],
      schedules,
      initialRepayments: [],
      asyncOrDelay: true,
    });

    // Pemanggilan paralel: in-flight lock memastikan backfill hanya berjalan 1x
    const [res1, res2] = await Promise.all([
      getPaidOffLoansReport(),
      getPaidOffLoansReport(),
    ]);

    expect(state.getSchedBackfillCalls()).toBe(1);
    expect(state.insertedPayloads).toHaveLength(1);
    expect(state.getRepaymentsDb()).toHaveLength(2);
    expect(res1.rows).toHaveLength(1);
    expect(res2.rows).toHaveLength(1);

    // Pemanggilan ulang setelah selesai: lock sudah dilepas di finally, dan 0 insert baru (idempoten)
    const res3 = await getPaidOffLoansReport();
    expect(state.getSchedBackfillCalls()).toBe(2);
    expect(state.insertedPayloads).toHaveLength(1);
    expect(state.getRepaymentsDb()).toHaveLength(2);
    expect(res3.rows[0].repayments).toHaveLength(2);
    expect(state.cashFlowCalls).toHaveLength(0);
  });

  it('clamps future payment_date and fallback due_date (e.g. 2026-12-01) to today (2026-11-25)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    const loanFutureRepay = {
      id: 'loan-future-repay',
      loan_number: 'PJ-FUTURE-01',
      member_id: 'mem-fr-1',
      loan_type_id: 'lt-reg',
      principal_amount: 1000000,
      tenor: 1,
      disbursed_at: '2026-10-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'REG', name: 'Pinjaman Reguler' },
      member: { id: 'mem-fr-1', nrp: '700001', nama: 'Anggota Future Repay', tanggal_lahir: '1988-01-01' },
    };

    const loanFutureFallbackDue = {
      id: 'loan-future-due',
      loan_number: 'PJ-FUTURE-02',
      member_id: 'mem-fd-2',
      loan_type_id: 'lt-reg',
      principal_amount: 1000000,
      tenor: 1,
      disbursed_at: '2026-10-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'REG', name: 'Pinjaman Reguler' },
      member: { id: 'mem-fd-2', nrp: '700002', nama: 'Anggota Future Due', tanggal_lahir: '1989-02-02' },
    };

    const schedules = [
      { id: 's-fr-1', loan_id: loanFutureRepay.id, period_number: 1, due_date: '2026-12-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
      { id: 's-fd-1', loan_id: loanFutureFallbackDue.id, period_number: 1, due_date: '2026-12-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
    ];

    const repayments = [
      {
        id: 'rep-future-1',
        loan_id: loanFutureRepay.id,
        schedule_id: 's-fr-1',
        amount_paid: 1000000,
        payment_date: '2026-12-01T10:00:00.000Z',
        payment_method: 'potong_gaji',
        receipt_number: 'KW-PINJ/PJ-FUTURE-01/B1',
      },
    ];

    // Tanpa .or() pada loan_schedules agar menguji langsung guard clamp di getPaidOffLoansReport
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'loans') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [loanFutureRepay, loanFutureFallbackDue],
            error: null,
          }),
        };
      }
      if (table === 'loan_schedules') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn((_col: string, ids: string[]) => ({
              order: vi.fn().mockResolvedValue({
                data: schedules.filter((s) => ids.includes(s.loan_id)),
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'loan_repayments') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn((_col: string, ids: string[]) => ({
              order: vi.fn().mockResolvedValue({
                data: repayments.filter((r) => ids.includes(r.loan_id)),
                error: null,
              }),
            })),
          }),
        };
      }
      return {};
    });

    const summary = await getPaidOffLoansReport();
    expect(summary.rows).toHaveLength(2);

    const rowRepay = summary.rows.find((r) => r.loanId === loanFutureRepay.id);
    expect(rowRepay?.paidOffDate).toBe('2026-11-25T08:00:00.000Z');
    expect(rowRepay?.paidOffYear).toBe(2026);
    expect(formatReportDate(rowRepay?.paidOffDate)).toBe('25 Nov 2026');
    expect(formatReportDate(rowRepay?.paidOffDate)).not.toBe('1 Des 2026');

    const rowDue = summary.rows.find((r) => r.loanId === loanFutureFallbackDue.id);
    expect(rowDue?.paidOffDate).toBe('2026-11-25');
    expect(rowDue?.paidOffYear).toBe(2026);
    expect(formatReportDate(rowDue?.paidOffDate)).toBe('25 Nov 2026');
    expect(formatReportDate(rowDue?.paidOffDate)).not.toBe('1 Des 2026');
  });

  it('falls back gracefully when receipt_number column is missing on loan_repayments and stays idempotent via schedule_id', async () => {
    const loan = {
      id: 'loan-no-receipt-col',
      loan_number: 'SALDO-AWAL-19850505-GAJISIPA',
      member_id: 'mem-nrc',
      loan_type_id: 'lt-reg',
      principal_amount: 1000000,
      tenor: 1,
      disbursed_at: '2026-08-01',
      status: 'completed',
      loan_types: { id: 'lt-reg', code: 'GAJISIPA', name: 'Gaji Sipa' },
      member: { id: 'mem-nrc', nrp: '19850505', nama: 'Anggota Fallback', tanggal_lahir: '1985-05-05' },
    };

    const schedules = [
      { id: 'snrc-1', loan_id: loan.id, period_number: 1, due_date: '2026-09-01', target_amount: 1000000, paid_amount: 1000000, status: 'paid' },
    ];

    const state = createStatefulBackfillMock({
      loans: [loan],
      schedules,
      initialRepayments: [],
      omitReceiptColumnOnInsert: true,
    });

    const res1 = await getPaidOffLoansReport();
    expect(res1.rows).toHaveLength(1);
    expect(state.insertedPayloads).toHaveLength(1);
    expect(state.insertedPayloads[0][0]).not.toHaveProperty('receipt_number');
    expect(state.insertedPayloads[0][0]).toMatchObject({
      loan_id: loan.id,
      schedule_id: 'snrc-1',
      payment_method: 'SALDO_AWAL_MIGRASI',
    });

    // Re-call stays idempotent via schedule_id even without receipt_number column
    const res2 = await getPaidOffLoansReport();
    expect(res2.rows).toHaveLength(1);
    expect(state.insertedPayloads).toHaveLength(1);
    expect(state.cashFlowCalls).toHaveLength(0);
  });
});
