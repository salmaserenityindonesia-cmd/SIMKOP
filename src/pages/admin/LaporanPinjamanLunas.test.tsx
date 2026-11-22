import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    expect(html).toContain('15/08/1983');
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
});
