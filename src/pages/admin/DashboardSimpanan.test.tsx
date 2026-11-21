import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DashboardSimpanan, {
  filterAndSummarizeBills,
  formatBillStatusLabel,
} from './DashboardSimpanan';
import type {
  SavingsAggregateBillRow,
  SavingsBillingDataset,
} from '../../services/savingsBillingService';

vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
  }),
}));

vi.mock('../../lib/exportUtils', () => ({
  exportToExcel: vi.fn(),
  exportToPDF: vi.fn(),
}));

const sampleRows: SavingsAggregateBillRow[] = [
  {
    id: 'mem-1:dt-wajib',
    member_id: 'mem-1',
    member_deposit_id: 'md-1',
    deposit_type_id: 'dt-wajib',
    deposit_code: 'WAJIB',
    deposit_name: 'Simpanan Wajib',
    isPokok: false,
    anggota: { id: 'mem-1', nama: 'BUDI SANTOSO', nrp: '88010023', pangkat: 'Sertu' },
    selectedYear: 2026,
    selectedMonth: 11,
    currentMonthDue: 200000,
    currentMonthPaid: 0,
    currentMonthRemaining: 200000,
    previousArrearsAmount: 1600000,
    previousArrearsMonthsCount: 8,
    totalAggregateBill: 1800000,
    remainingArrears: 1800000,
    totalPaidAllUnpaid: 0,
    unpaidMonths: [
      {
        year: 2026,
        month: 3,
        periodIndex: 2026 * 12 + 3,
        label: 'Mar-26',
        fullLabel: 'Maret 2026',
        expectedAmount: 200000,
        paidAmount: 0,
        remaining: 200000,
        isArrears: true,
      },
    ],
    unpaidMonthsCount: 9,
    unpaidMonthsSummary: 'Mar-26 s/d Nov-26',
    unpaidMonthsFullList: 'Mar-26, Apr-26, Mei-26, Jun-26, Jul-26, Ags-26, Sep-26, Okt-26, Nov-26',
    status: 'MENUNGGAK',
  },
  {
    id: 'mem-2:dt-wajib',
    member_id: 'mem-2',
    member_deposit_id: 'md-2',
    deposit_type_id: 'dt-wajib',
    deposit_code: 'WAJIB',
    deposit_name: 'Simpanan Wajib',
    isPokok: false,
    anggota: { id: 'mem-2', nama: 'DONNY ILHAM PAMBUDI', nrp: '91010011', pangkat: 'Bripka' },
    selectedYear: 2026,
    selectedMonth: 11,
    currentMonthDue: 200000,
    currentMonthPaid: 200000,
    currentMonthRemaining: 0,
    previousArrearsAmount: 0,
    previousArrearsMonthsCount: 0,
    totalAggregateBill: 200000,
    remainingArrears: 0,
    totalPaidAllUnpaid: 0,
    unpaidMonths: [],
    unpaidMonthsCount: 0,
    unpaidMonthsSummary: '',
    unpaidMonthsFullList: '',
    status: 'LUNAS',
  },
  {
    id: 'mem-3:dt-belanja',
    member_id: 'mem-3',
    member_deposit_id: 'md-3',
    deposit_type_id: 'dt-belanja',
    deposit_code: 'BELANJA',
    deposit_name: 'Simpanan Belanja',
    isPokok: false,
    anggota: {
      id: 'mem-3',
      nama: 'MOCH. ALIF NURSYARIFUDDIN',
      nrp: '92020022',
      pangkat: 'Brigpol',
    },
    selectedYear: 2026,
    selectedMonth: 11,
    currentMonthDue: 50000,
    currentMonthPaid: 50000,
    currentMonthRemaining: 0,
    previousArrearsAmount: 0,
    previousArrearsMonthsCount: 0,
    totalAggregateBill: 50000,
    remainingArrears: 0,
    totalPaidAllUnpaid: 0,
    unpaidMonths: [],
    unpaidMonthsCount: 0,
    unpaidMonthsSummary: '',
    unpaidMonthsFullList: '',
    status: 'LUNAS',
  },
];

const sampleDataset: SavingsBillingDataset = {
  rows: sampleRows,
  cutoffDate: '2026-03-01',
  cutoffYear: 2026,
  cutoffMonth: 3,
  totalActiveMembersCount: 3,
  availableDepositTypes: [
    { code: 'WAJIB', name: 'Simpanan Wajib' },
    { code: 'BELANJA', name: 'Simpanan Belanja' },
    { code: 'LEBARAN', name: 'Simpanan Hari Raya (Lebaran)' },
    { code: 'POKOK', name: 'Simpanan Pokok' },
  ],
  isSelectedPeriodBeforeCutoff: false,
};

describe('DashboardSimpanan (/admin/simpanan)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to UNPAID_ONLY view, shows unpaid arrears rows & KPI summary, and hides paid-only members', () => {
    const html = renderToStaticMarkup(
      <DashboardSimpanan
        initialDataset={sampleDataset}
        initialTargetMonth={11}
        initialTargetYear={2026}
      />
    );

    expect(html).toContain('Tagihan &amp; Agregat Tunggakan Simpanan');
    expect(html).toContain('Total Agregat Tagihan &amp; Tunggakan');
    expect(html).toContain('Anggota Memiliki Tunggakan');
    expect(html).toContain('Terkumpul Periode Terpilih');

    expect(html).toContain('Belum Lunas / Menunggak');
    expect(html).toContain('Semua Anggota &amp; Simpanan');
    expect(html).toContain('Sudah Lunas');
    expect(html).toContain('Semua Jenis');

    expect(html).toContain('Tagihan Bulan Ini');
    expect(html).toContain('Tunggakan Lalu');
    expect(html).toContain('Total Sisa Tagihan');

    expect(html).toContain('BUDI SANTOSO');
    expect(html).toContain('Menunggak 9 bln: Mar-26 s/d Nov-26');
    expect(html).toContain('Menunggak (9 Bln)');
    expect(html).toContain('Bayar');

    // Paid members are filtered out by default UNPAID_ONLY
    expect(html).not.toContain('DONNY ILHAM PAMBUDI');
    expect(html).not.toContain('MOCH. ALIF NURSYARIFUDDIN');
  });

  it('shows settled members when statusFilter is PAID_ONLY', () => {
    const html = renderToStaticMarkup(
      <DashboardSimpanan
        initialDataset={sampleDataset}
        initialStatusFilter="PAID_ONLY"
        initialTargetMonth={11}
        initialTargetYear={2026}
      />
    );

    expect(html).toContain('DONNY ILHAM PAMBUDI');
    expect(html).toContain('MOCH. ALIF NURSYARIFUDDIN');
    expect(html).not.toContain('BUDI SANTOSO');
  });

  it('filterAndSummarizeBills computes KPI totals across all statuses and filters accurately', () => {
    const defaultRes = filterAndSummarizeBills(sampleRows);
    expect(defaultRes.filteredRows).toHaveLength(1);
    expect(defaultRes.filteredRows[0].anggota.nama).toBe('BUDI SANTOSO');
    // Collected current period remains 200k + 50k = 250k even when UNPAID_ONLY filter hides paid rows
    expect(defaultRes.summary.collectedCurrentPeriod).toBe(250000);
    expect(defaultRes.summary.totalRemainingArrears).toBe(1800000);
    expect(defaultRes.summary.delinquentMembersCount).toBe(1);

    const paidRes = filterAndSummarizeBills(sampleRows, { statusFilter: 'PAID_ONLY' });
    expect(paidRes.filteredRows.map((r) => r.anggota.nama)).toEqual([
      'DONNY ILHAM PAMBUDI',
      'MOCH. ALIF NURSYARIFUDDIN',
    ]);

    const belanjaAllRes = filterAndSummarizeBills(sampleRows, {
      statusFilter: 'ALL',
      depositTypeFilter: 'BELANJA',
    });
    expect(belanjaAllRes.filteredRows).toHaveLength(1);
    expect(belanjaAllRes.filteredRows[0].anggota.nama).toBe('MOCH. ALIF NURSYARIFUDDIN');
    expect(formatBillStatusLabel(sampleRows[0])).toBe('Menunggak (9 Bln)');
    expect(formatBillStatusLabel(sampleRows[1])).toBe('Lunas');
  });

  it('renders dynamic Jan-2026 cut-off subtitle, 11-month arrears badges, and KPI total without hardcoded Maret 2026', () => {
    const janCutoffRows: SavingsAggregateBillRow[] = [
      {
        id: 'mem-bagus:dt-lebaran',
        member_id: 'mem-bagus',
        member_deposit_id: 'md-bagus-lebaran',
        deposit_type_id: 'dt-lebaran',
        deposit_code: 'LEBARAN',
        deposit_name: 'Simpanan Hari Raya (Lebaran)',
        isPokok: false,
        anggota: { id: 'mem-bagus', nama: 'BAGUS BUDI PRASETYO', nrp: '00050543' },
        selectedYear: 2026,
        selectedMonth: 11,
        currentMonthDue: 200000,
        currentMonthPaid: 0,
        currentMonthRemaining: 200000,
        previousArrearsAmount: 2000000,
        previousArrearsMonthsCount: 10,
        totalAggregateBill: 2200000,
        remainingArrears: 2200000,
        totalPaidAllUnpaid: 0,
        unpaidMonths: [
          {
            year: 2026,
            month: 1,
            periodIndex: 2026 * 12 + 1,
            label: 'Jan-26',
            fullLabel: 'Januari 2026',
            expectedAmount: 200000,
            paidAmount: 0,
            remaining: 200000,
            isArrears: true,
          },
        ],
        unpaidMonthsCount: 11,
        unpaidMonthsSummary: 'Jan-26 s/d Nov-26',
        unpaidMonthsFullList: 'Jan-26, Feb-26, Mar-26, Apr-26, Mei-26, Jun-26, Jul-26, Ags-26, Sep-26, Okt-26, Nov-26',
        status: 'MENUNGGAK',
      },
      {
        id: 'mem-bagus:dt-belanja',
        member_id: 'mem-bagus',
        member_deposit_id: 'md-bagus-belanja',
        deposit_type_id: 'dt-belanja',
        deposit_code: 'BELANJA',
        deposit_name: 'Simpanan Belanja Bulanan',
        isPokok: false,
        anggota: { id: 'mem-bagus', nama: 'BAGUS BUDI PRASETYO', nrp: '00050543' },
        selectedYear: 2026,
        selectedMonth: 11,
        currentMonthDue: 50000,
        currentMonthPaid: 0,
        currentMonthRemaining: 50000,
        previousArrearsAmount: 500000,
        previousArrearsMonthsCount: 10,
        totalAggregateBill: 550000,
        remainingArrears: 550000,
        totalPaidAllUnpaid: 0,
        unpaidMonths: [
          {
            year: 2026,
            month: 1,
            periodIndex: 2026 * 12 + 1,
            label: 'Jan-26',
            fullLabel: 'Januari 2026',
            expectedAmount: 50000,
            paidAmount: 0,
            remaining: 50000,
            isArrears: true,
          },
        ],
        unpaidMonthsCount: 11,
        unpaidMonthsSummary: 'Jan-26 s/d Nov-26',
        unpaidMonthsFullList: 'Jan-26, Feb-26, Mar-26, Apr-26, Mei-26, Jun-26, Jul-26, Ags-26, Sep-26, Okt-26, Nov-26',
        status: 'MENUNGGAK',
      },
    ];

    const janDataset: SavingsBillingDataset = {
      rows: janCutoffRows,
      cutoffDate: '2026-01-01',
      cutoffYear: 2026,
      cutoffMonth: 1,
      totalActiveMembersCount: 1,
      availableDepositTypes: [
        { code: 'BELANJA', name: 'Simpanan Belanja Bulanan' },
        { code: 'LEBARAN', name: 'Simpanan Hari Raya (Lebaran)' },
      ],
      isSelectedPeriodBeforeCutoff: false,
    };

    const html = renderToStaticMarkup(
      <DashboardSimpanan
        initialDataset={janDataset}
        initialTargetMonth={11}
        initialTargetYear={2026}
      />
    );

    expect(html).toContain('(Cut-Off Januari 2026 s/d November 2026)');
    expect(html).not.toContain('Maret 2026');
    expect(html).toContain('BAGUS BUDI PRASETYO');
    expect(html).toContain('Menunggak 11 bln: Jan-26 s/d Nov-26');
    expect(html).toContain('Menunggak (11 Bln)');
    expect(html).toContain('10 bln lalu');
    expect(html).toContain('2.750.000');
    expect(html).toContain('2.200.000');
    expect(html).toContain('550.000');
  });

  it('renders dynamic cut-off month in before-cutoff warning banner', () => {
    const beforeCutoffDataset: SavingsBillingDataset = {
      rows: [],
      cutoffDate: '2026-01-01',
      cutoffYear: 2026,
      cutoffMonth: 1,
      totalActiveMembersCount: 1,
      availableDepositTypes: [],
      isSelectedPeriodBeforeCutoff: true,
    };

    const html = renderToStaticMarkup(
      <DashboardSimpanan
        initialDataset={beforeCutoffDataset}
        initialTargetMonth={12}
        initialTargetYear={2025}
      />
    );

    expect(html).toContain('<strong>Januari 2026</strong>');
    expect(html).not.toContain('Maret 2026');
  });
});
