import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LaporanPenarikanSimpanan, { DepositTypeBadge } from './LaporanPenarikanSimpanan';
import * as withdrawalReportService from '../../services/withdrawalReportService';

// Mock AdminLayout
vi.mock('../../components/layout/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="admin-layout">{children}</div>
  ),
}));

// Mock WithdrawalReceiptModal
vi.mock('../../components/withdrawal/WithdrawalReceiptModal', () => ({
  default: ({ data, onClose }: any) => (
    <div data-testid="withdrawal-receipt-modal">
      <div data-testid="receipt-trx-id">{data.transactionId}</div>
      <div data-testid="receipt-member-name">{data.member.nama}</div>
      <div data-testid="receipt-amount">{data.amount}</div>
      <div data-testid="receipt-method">{data.paymentMethod}</div>
      <button onClick={onClose} data-testid="close-receipt-btn">Tutup</button>
    </div>
  ),
}));

// Mock withdrawalReportService
const mockLedgerItems: withdrawalReportService.WithdrawalLedgerItem[] = [
  {
    id: 'tx-001',
    member_id: 'mem-001',
    member_name: 'Mayor Budi Prakoso',
    member_nrp: '19840101',
    member_rank: 'Mayor Inf',
    bank_name: 'BRI',
    bank_account_number: '1234-5678-90',
    deposit_type_id: 'dt-leb',
    deposit_type_code: 'LEBARAN',
    deposit_type_name: 'Simpanan Hari Raya (Lebaran)',
    amount: 5000000,
    transaction_date: '2026-03-20T10:30:00.000Z',
    reference_no: 'WD-2026-001',
    payment_method: 'transfer',
    notes: 'Pencairan THR Hari Raya',
    created_by: 'adm-01',
    has_active_loan: true,
    active_loan_balance: 15000000,
    active_loan_count: 1
  },
  {
    id: 'tx-002',
    member_id: 'mem-002',
    member_name: 'Kapten Siti Rahma',
    member_nrp: '19890202',
    member_rank: 'Kapten Cku',
    bank_name: 'Mandiri',
    bank_account_number: '9876-5432-10',
    deposit_type_id: 'dt-suk',
    deposit_type_code: 'SUKARELA',
    deposit_type_name: 'Simpanan Sukarela Mandiri',
    amount: 2500000,
    transaction_date: '2026-03-21T09:15:00.000Z',
    reference_no: 'WD-2026-002',
    payment_method: 'tunai',
    notes: 'Keperluan mendesak keluarga',
    created_by: 'adm-01',
    has_active_loan: false,
    active_loan_balance: 0,
    active_loan_count: 0
  },
  {
    id: 'tx-003',
    member_id: 'mem-wawan',
    member_name: 'Wawan Gunawan',
    member_nrp: '92185332',
    member_rank: 'PNS III/a',
    bank_name: 'BRI',
    bank_account_number: '92185332001',
    deposit_type_id: 'dt-leb',
    deposit_type_code: 'LEBARAN',
    deposit_type_name: 'Simpanan Lebaran',
    amount: 2500000,
    transaction_date: '2026-03-22T11:00:00.000Z',
    reference_no: 'KW-WD-92185332',
    payment_method: 'Transfer (BRI - 92185332001)',
    notes: 'Penarikan Simpanan Lebaran - Wawan Gunawan',
    created_by: 'adm-01',
    has_active_loan: false,
    active_loan_balance: 0,
    active_loan_count: 0
  }
];

const mockSummary: withdrawalReportService.WithdrawalSummary = {
  totalWithdrawalAmount: 10000000,
  totalTransactions: 3,
  uniqueMembers: 3,
  breakdownByType: {
    lebaran: 7500000,
    belanja: 0,
    pokok_wajib: 0,
    sukarela_lainnya: 2500000
  },
  breakdownByMethod: {
    tunai: {
      amount: 2500000,
      percentage: 25.0,
      count: 1
    },
    transfer: {
      amount: 7500000,
      percentage: 75.0,
      count: 2
    }
  },
  membersWithActiveLoansCount: 1,
  totalActiveLoansObligation: 15000000
};

describe('LaporanPenarikanSimpanan Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(withdrawalReportService, 'getWithdrawalDetailedLedger').mockResolvedValue(mockLedgerItems);
    vi.spyOn(withdrawalReportService, 'getWithdrawalSummary').mockResolvedValue(mockSummary);
    vi.spyOn(withdrawalReportService, 'exportWithdrawalReportExcel').mockResolvedValue(undefined as any);
  });

  it('renders header, title, and action buttons', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanPenarikanSimpanan initialItems={mockLedgerItems} initialSummary={mockSummary} />
      </MemoryRouter>
    );

    expect(html).toContain('Laporan Pengawasan &amp; Pencairan Simpanan');
    expect(html).toContain('Monitoring real-time arus kas keluar penarikan simpanan');
    expect(html).toContain('Ekspor Excel (.xlsx)');
    expect(html).toContain('Cetak Rekap PDF');
  });

  it('renders 4 KPI surveillance metrics cards accurately', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanPenarikanSimpanan initialItems={mockLedgerItems} initialSummary={mockSummary} />
      </MemoryRouter>
    );

    // KPI 1: Total Pencairan Kas
    expect(html).toContain('Total Pencairan Kas');
    expect(html).toContain('10.000.000');
    expect(html).toContain('3 transaksi');
    expect(html).toContain('3 anggota');

    // KPI 2: Fokus Lebaran
    expect(html).toContain('Fokus Lebaran (THR)');
    expect(html).toContain('7.500.000');
    expect(html).toContain('75.0% dari total');

    // KPI 3: Transfer Non-Tunai
    expect(html).toContain('Transfer Non-Tunai');
    expect(html).toContain('7.500.000');
    expect(html).toContain('75% Akuntabilitas');

    // KPI 4: Pinjaman Aktif Alert
    expect(html).toContain('Kewajiban Pinjaman Aktif');
    expect(html).toContain('1 Anggota');
    expect(html).toContain('15.000.000');
  });

  it('renders filter controls, date presets, and reload button', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanPenarikanSimpanan initialItems={mockLedgerItems} initialSummary={mockSummary} />
      </MemoryRouter>
    );

    // Date presets
    expect(html).toContain('Bulan Ini');
    expect(html).toContain('Kuartal Ini');
    expect(html).toContain('Hari Ini');
    expect(html).toContain('Semua Waktu');
    expect(html).toContain('Custom');
    expect(html).toContain('Muat Ulang');

    // Dropdown options
    expect(html).toContain('Semua Jenis Simpanan');
    expect(html).toContain('Simpanan Hari Raya (Lebaran)');
    expect(html).toContain('Simpanan Belanja');
    expect(html).toContain('Semua Metode Penyaluran');
    expect(html).toContain('Tunai Kasir Koperasi');
    expect(html).toContain('Transfer Bank');

    // Search and special risk toggle
    expect(html).toContain('Cari Transaksi / Anggota');
    expect(html).toContain('Hanya yang Memiliki Pinjaman Aktif');
  });

  it('renders surveillance ledger table rows with Wawan Gunawan and cross-obligation indicator', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanPenarikanSimpanan initialItems={mockLedgerItems} initialSummary={mockSummary} />
      </MemoryRouter>
    );

    // Member 1: Has active loan
    expect(html).toContain('Mayor Budi Prakoso');
    expect(html).toContain('19840101');
    expect(html).toContain('Mayor Inf');
    expect(html).toContain('WD-2026-001');
    expect(html).toContain('Simpanan Hari Raya (Lebaran)');
    expect(html).toContain(withdrawalReportService.formatRupiah(5000000));
    expect(html).toContain('Transfer Bank');
    expect(html).toContain('Ada Pinjaman Aktif');
    expect(html).toContain('15.000.000');

    // Member 2: Free of active loans
    expect(html).toContain('Kapten Siti Rahma');
    expect(html).toContain('19890202');
    expect(html).toContain('Kapten Cku');
    expect(html).toContain('WD-2026-002');
    expect(html).toContain('Kasir Tunai');
    expect(html).toContain('Bebas Pinjaman');

    // Member 3: Wawan Gunawan (Simpanan Lebaran)
    expect(html).toContain('Wawan Gunawan');
    expect(html).toContain('92185332');
    expect(html).toContain('KW-WD-92185332');
    expect(html).toContain('Simpanan Lebaran');
    expect(html).toContain(withdrawalReportService.formatRupiah(2500000));

    // Table summary row
    expect(html).toContain('TOTAL PENCAIRAN (3 TRANSAKSI):');
    expect(html).toContain(withdrawalReportService.formatRupiah(10000000));
  });

  it('renders empty state placeholder when no records are found', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanPenarikanSimpanan initialItems={[]} />
      </MemoryRouter>
    );

    expect(html).toContain('Tidak ada catatan penarikan simpanan');
    expect(html).toContain('Coba ubah filter periode atau kata kunci pencarian.');
  });

  it('renders receipt modal when initialReceiptData is passed', () => {
    const mockReceipt = {
      transactionId: 'WD-2026-001',
      member: { id: 'mem-001', nama: 'Mayor Budi Prakoso', nrp: '19840101' },
      depositName: 'Simpanan Hari Raya (Lebaran)',
      amount: 5000000,
      paymentMethod: 'Transfer Bank (BRI - 1234-5678-90)',
      date: '2026-03-20T10:30:00.000Z'
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LaporanPenarikanSimpanan
          initialItems={mockLedgerItems}
          initialSummary={mockSummary}
          initialReceiptData={mockReceipt}
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="withdrawal-receipt-modal"');
    expect(html).toContain('WD-2026-001');
    expect(html).toContain('Mayor Budi Prakoso');
    expect(html).toContain('5000000');
  });

  it('DepositTypeBadge renders appropriate badge color classes for each type', () => {
    const lebaranBadge = renderToStaticMarkup(<DepositTypeBadge code="LEBARAN" name="Simpanan Hari Raya" />);
    expect(lebaranBadge).toContain('bg-emerald-100');
    expect(lebaranBadge).toContain('Simpanan Hari Raya');

    const belanjaBadge = renderToStaticMarkup(<DepositTypeBadge code="SB" name="Simpanan Belanja" />);
    expect(belanjaBadge).toContain('bg-sky-100');

    const pokokBadge = renderToStaticMarkup(<DepositTypeBadge code="POKOK" name="Simpanan Pokok" />);
    expect(pokokBadge).toContain('bg-slate-100');

    const sukarelaBadge = renderToStaticMarkup(<DepositTypeBadge code="SUKARELA" name="Simpanan Sukarela" />);
    expect(sukarelaBadge).toContain('bg-purple-100');
  });
});
