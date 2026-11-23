import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import CashFlowReferenceModal, {
  type CashFlowReferenceModalItem,
} from './CashFlowReferenceModal';
import type { CashFlowReferenceBreakdown } from '../../services/cashFlowAuditService';

const baseOpeningItem: CashFlowReferenceModalItem = {
  id: 'b27310a3-1111-2222-3333-444455556666',
  tanggal: '1/3/2026',
  referensi: 'CF-B27310A3',
  deskripsi: 'Saldo Awal Simpanan Anggota (Pokok, Wajib, Belanja & Lebaran - Cut-Off)',
  kategori: 'SALDO_AWAL_SIMPANAN',
  unit_usaha: 'Umum',
  kas_masuk: 26840000,
  kas_keluar: 0,
  direction: 'in',
  created_at: '2026-03-01T00:00:00.000Z',
};

describe('CashFlowReferenceModal Component', () => {
  it('renders empty output when cashFlowItem is null', () => {
    const html = renderToStaticMarkup(
      <CashFlowReferenceModal cashFlowItem={null} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders SALDO_AWAL_SIMPANAN summary cards, reconciliation badge, search, member rows, pagination, and footer actions', () => {
    const breakdown: CashFlowReferenceBreakdown = {
      kind: 'opening_savings',
      journal: {
        id: baseOpeningItem.id,
        refCode: 'CF-B27310A3',
        category: 'SALDO_AWAL_SIMPANAN',
        direction: 'in',
        amount: 26840000,
        description: baseOpeningItem.deskripsi,
        unitUsaha: 'Umum',
        referenceId: null,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
      openingSavings: {
        byDepositType: {
          pokok: 5000000,
          wajib: 15000000,
          belanja: 3840000,
          lebaran: 3000000,
          lainnya: 0,
          items: [],
        },
        memberRows: [
          {
            member_id: 'm-1',
            nrp: '88010001',
            nama: 'Budi Santoso',
            tanggal_lahir: '1983-08-15',
            pokok: 100000,
            wajib: 1500000,
            belanja: 250000,
            lebaran: 300000,
            lainnya: 0,
            total: 2150000,
          },
        ],
        calculatedTotal: 26840000,
        journalAmount: 26840000,
        difference: 0,
        isMatched: true,
        transactionCount: 4,
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={baseOpeningItem}
        onClose={() => {}}
        initialBreakdown={breakdown}
      />
    );

    expect(html).toContain('Bukti Jurnal &amp; Buku Pembantu Referensi');
    expect(html).toContain('CF-B27310A3');
    expect(html).toContain('Simpanan Pokok');
    expect(html).toContain('Simpanan Wajib');
    expect(html).toContain('Simpanan Belanja');
    expect(html).toContain('Simpanan Lebaran');
    expect(html).toContain('26.840.000');
    expect(html).toContain('Cocok dengan Jurnal Kas');
    expect(html).toContain('Cari NRP atau Nama Anggota...');
    expect(html).toContain('88010001');
    expect(html).toContain('Budi Santoso');
    expect(html).toContain('10 / halaman');
    expect(html).toContain('25 / halaman');
    expect(html).toContain('50 / halaman');
    expect(html).toContain('Salin Kode Referensi');
    expect(html).toContain('Tutup');
  });

  it('renders pos_sale, store_credit_payment, deposit_withdrawal, and journal_only breakdown views', () => {
    const posBreakdown: CashFlowReferenceBreakdown = {
      kind: 'pos_sale',
      journal: {
        id: 'cf-pos-1',
        refCode: 'CF-POS11111',
        category: 'penjualan_tunai',
        direction: 'in',
        amount: 55000,
        description: 'Penjualan POS',
        unitUsaha: 'Retail Toko',
        referenceId: 'sale-1',
        createdAt: '2026-11-19T08:00:00.000Z',
      },
      posSale: {
        saleId: 'sale-1',
        saleNumber: 'POS-20261119-077',
        createdAt: '2026-11-19T08:00:00.000Z',
        paymentScheme: 'cash',
        subtotal: 55000,
        discount: 0,
        totalAmount: 55000,
        paidCash: 55000,
        paidDeposit: 0,
        paidCredit: 0,
        member: { nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
        items: [
          { id: 'si-1', productName: 'Minyak Goreng 2L', qty: 1, price: 38000, subtotal: 38000 },
          { id: 'si-2', productName: 'Teh Celup', qty: 1, price: 17000, subtotal: 17000 },
        ],
      },
    };

    const posHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-pos-1',
          referensi: 'CF-POS11111',
          kategori: 'penjualan_tunai',
          kas_masuk: 55000,
        }}
        onClose={() => {}}
        initialBreakdown={posBreakdown}
      />
    );
    expect(posHtml).toContain('POS-20261119-077');
    expect(posHtml).toContain('Minyak Goreng 2L');
    expect(posHtml).toContain('Budi Santoso');
    expect(posHtml).toContain('Kategori: Penjualan POS');
    expect(posHtml).toContain('Skema: Penjualan Tunai');
    expect(posHtml).not.toMatch(/pembelian tunai/i);

    const splitGuestBreakdown: CashFlowReferenceBreakdown = {
      kind: 'pos_sale',
      journal: {
        id: 'cf-pos-split',
        refCode: 'CF-POS22222',
        category: 'penjualan_tunai',
        direction: 'in',
        amount: 40000,
        description: 'Penjualan Tunai (INV-1795078449999) — Pelanggan Umum (Rp 40.000)',
        unitUsaha: 'Retail Toko',
        referenceId: 'sale-split',
        createdAt: '2026-11-19T09:00:00.000Z',
      },
      posSale: {
        saleId: 'sale-split',
        saleNumber: 'INV-1795078449999',
        createdAt: '2026-11-19T09:00:00.000Z',
        paymentScheme: 'split',
        paidCash: 40000,
        paidDeposit: 60000,
        paidCredit: 0,
        subtotal: 100000,
        discount: 0,
        totalAmount: 100000,
        member: null,
        items: [],
      },
    };
    const splitGuestHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-pos-split',
          referensi: 'CF-POS22222',
          kategori: 'penjualan_tunai',
          kas_masuk: 40000,
        }}
        onClose={() => {}}
        initialBreakdown={splitGuestBreakdown}
      />
    );
    expect(splitGuestHtml).toContain('Skema: Penjualan Campuran');
    expect(splitGuestHtml).toContain('Pelanggan Umum');
    expect(splitGuestHtml).not.toContain('Pembeli Umum / Tunai');
    expect(splitGuestHtml).not.toMatch(/pembelian tunai/i);

    const bonBreakdown: CashFlowReferenceBreakdown = {
      kind: 'store_credit_payment',
      journal: {
        id: 'cf-bon-1',
        refCode: 'CF-BON11111',
        category: 'PELUNASAN_BON_TOKO',
        direction: 'in',
        amount: 120000,
        description: 'Pelunasan Bon',
        unitUsaha: 'Umum',
        referenceId: 'scp-1',
        createdAt: '2026-11-18T08:00:00.000Z',
      },
      storeCreditPayment: {
        paymentId: 'scp-1',
        receiptNumber: 'KW-BON-777',
        amount: 120000,
        paymentDate: '2026-11-18',
        notes: 'Lunas',
        saleNumber: 'POS-CREDIT-99',
        member: { nrp: '88010002', nama: 'Siti Aminah', tanggal_lahir: '1985-05-20' },
      },
    };

    const bonHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-bon-1',
          referensi: 'CF-BON11111',
          kategori: 'PELUNASAN_BON_TOKO',
          kas_masuk: 120000,
        }}
        onClose={() => {}}
        initialBreakdown={bonBreakdown}
      />
    );
    expect(bonHtml).toContain('KW-BON-777');
    expect(bonHtml).toContain('POS-CREDIT-99');
    expect(bonHtml).toContain('Siti Aminah');

    const wdBreakdown: CashFlowReferenceBreakdown = {
      kind: 'deposit_withdrawal',
      journal: {
        id: 'cf-wd-1',
        refCode: 'CF-WD111111',
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 300000,
        description: 'Penarikan Simpanan Lebaran',
        unitUsaha: 'Umum',
        referenceId: 'dtx-1',
        createdAt: '2026-11-15T08:00:00.000Z',
      },
      depositWithdrawal: {
        transactionId: 'dtx-1',
        amount: 300000,
        transactionType: 'withdrawal',
        description: 'Pencairan THR',
        referenceNo: 'KW-THR-01',
        paymentMethod: 'transfer',
        notes: 'Rekening BRI',
        createdAt: '2026-11-15T08:00:00.000Z',
        depositTypeName: 'Simpanan Lebaran',
        depositTypeCode: 'SL',
        isLebaranPersonal: true,
        member: {
          nrp: '88010001',
          nama: 'Budi Santoso',
          tanggal_lahir: '1983-08-15',
          bankName: 'Bank BRI',
          bankAccountNumber: '1234567890',
        },
      },
    };

    const wdHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-wd-1',
          referensi: 'CF-WD111111',
          kategori: 'penarikan_simpanan',
          kas_masuk: 0,
          kas_keluar: 300000,
          direction: 'out',
        }}
        onClose={() => {}}
        initialBreakdown={wdBreakdown}
      />
    );
    expect(wdHtml).toContain('Bukti Penarikan / Pencairan Simpanan');
    expect(wdHtml).toContain('Simpanan Lebaran (Personal)');
    expect(wdHtml).toContain('15/08/1983');
    expect(wdHtml).toContain('Transfer Bank');
    expect(wdHtml).toContain('Bank BRI — 1234567890');
    expect(wdHtml).toContain('KW-THR-01');

    const journalOnlyBreakdown: CashFlowReferenceBreakdown = {
      kind: 'journal_only',
      journal: {
        id: 'cf-gen-uuid-9999',
        refCode: 'CF-GEN99999',
        category: 'beban_operasional',
        direction: 'out',
        amount: 95000,
        description: 'Beli ATK kantor koperasi',
        unitUsaha: 'Umum',
        referenceId: null,
        createdAt: '2026-11-12T08:00:00.000Z',
      },
    };

    const journalOnlyHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-gen-uuid-9999',
          referensi: 'CF-GEN99999',
          kategori: 'beban_operasional',
          kas_masuk: 0,
          kas_keluar: 95000,
          direction: 'out',
        }}
        onClose={() => {}}
        initialBreakdown={journalOnlyBreakdown}
      />
    );
    expect(journalOnlyHtml).toContain('Metadata Lengkap Jurnal Arus Kas');
    expect(journalOnlyHtml).toContain('cf-gen-uuid-9999');
    expect(journalOnlyHtml).toContain('Beli ATK kantor koperasi');
  });

  it('renders bulk_lebaran_withdrawal summary cards, long date, match badge, search, footer total, and paginated recipient table', () => {
    const bulkBreakdown: CashFlowReferenceBreakdown = {
      kind: 'bulk_lebaran_withdrawal',
      journal: {
        id: 'cf-bulk-1',
        refCode: 'CF-BULK1111',
        category: 'penarikan_simpanan',
        direction: 'out',
        amount: 10800000,
        description: 'Pencairan Massal Simpanan Lebaran (Pencairan THR Idul Fitri 2026) — 4 Anggota (Rp 10.800.000)',
        unitUsaha: 'Umum',
        referenceId: 'cycle-1',
        createdAt: '2026-11-19T10:00:00.000Z',
      },
      bulkLebaranWithdrawal: {
        cycleId: 'cycle-1',
        cycleName: 'Pencairan THR Idul Fitri 2026',
        disbursementDate: '2026-11-19',
        sourceType: 'MASSAL',
        notes: null,
        recipientCount: 4,
        calculatedTotal: 10800000,
        journalAmount: 10800000,
        difference: 0,
        isMatched: true,
        recipients: [
          {
            id: 'r-1',
            memberId: 'm-1',
            nrp: '88010001',
            nama: 'Budi Santoso',
            tanggal_lahir: '1983-08-15',
            bankName: 'Bank BRI',
            bankAccountNumber: '111222333',
            amount: 2400000,
          },
          {
            id: 'r-2',
            memberId: 'm-2',
            nrp: '88010002',
            nama: 'Siti Aminah',
            tanggal_lahir: '1985-05-20',
            bankName: 'Bank Mandiri',
            bankAccountNumber: '444555666',
            amount: 2400000,
          },
          {
            id: 'r-3',
            memberId: 'm-3',
            nrp: '88010003',
            nama: 'Agus Setiawan',
            tanggal_lahir: '1990-02-10',
            bankName: 'Bank BRI',
            bankAccountNumber: '777888999',
            amount: 2400000,
          },
          {
            id: 'r-4',
            memberId: 'm-4',
            nrp: '88010004',
            nama: 'Dedi Kurniawan',
            tanggal_lahir: '1986-07-15',
            bankName: 'Bank BRI',
            bankAccountNumber: '123999888',
            amount: 3600000,
          },
        ],
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-bulk-1',
          referensi: 'CF-BULK1111',
          kategori: 'penarikan_simpanan',
          kas_masuk: 0,
          kas_keluar: 10800000,
          direction: 'out',
        }}
        onClose={() => {}}
        initialBreakdown={bulkBreakdown}
      />
    );

    expect(html).toContain('Pencairan THR Idul Fitri 2026');
    expect(html).toContain('19 November 2026');
    expect(html).toContain('4 Anggota');
    expect(html).toContain('10.800.000');
    expect(html).toContain('✓ Cocok dengan Jurnal Kas');
    expect(html).toContain('Cari NRP, Nama Anggota, atau Rekening...');
    expect(html).toContain('Nominal Dicairkan (Rp)');
    expect(html).toContain('TOTAL KOMPONEN PENERIMA');
    expect(html).toContain('88010001');
    expect(html).toContain('Budi Santoso');
    expect(html).toContain('Dedi Kurniawan');
    expect(html).toContain('Bank BRI — 111222333');
    expect(html).toContain('10 / halaman');
    expect(html).toContain('25 / halaman');
    expect(html).toContain('50 / halaman');
  });

  it('renders individual_deposit breakdown card with receipt number, member identity, deposit type, period, payment method, amount, and bidirectional audit bar', () => {
    const depositBreakdown: CashFlowReferenceBreakdown = {
      kind: 'individual_deposit',
      journal: {
        id: 'cf-dep-1',
        refCode: 'CF-DEP12345',
        category: 'Setoran Simpanan',
        direction: 'in',
        amount: 200000,
        description:
          'Setoran Simpanan Wajib [Mar 2026] — 00050543 - BAGUS BUDI PRASETYO (KW-2026/03/00050543)',
        unitUsaha: 'Umum',
        referenceId: 'tx-bagus-mar26',
        createdAt: '2026-11-19T09:15:00.000Z',
      },
      individualDeposit: {
        transactionId: 'tx-bagus-mar26',
        memberId: 'm-bagus',
        nrp: '00050543',
        nama: 'BAGUS BUDI PRASETYO',
        memberNrp: '00050543',
        memberName: 'BAGUS BUDI PRASETYO',
        tanggal_lahir: '1986-07-15',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 3,
        forYear: 2026,
        periodLabel: 'Mar 2026',
        shortPeriodLabel: 'Mar-26',
        periodCode: 'Mar-26',
        referenceNo: 'KW-2026/03/00050543',
        receiptNumber: 'KW-2026/03/00050543',
        paymentMethod: 'tunai',
        description: 'Setoran Matriks WAJIB Mar 2026',
        notes: 'Pembayaran iuran rutin Maret 2026',
        createdAt: '2026-11-19T09:15:00.000Z',
        amount: 200000,
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-dep-1',
          referensi: 'CF-DEP12345',
          kategori: 'Setoran Simpanan',
          kas_masuk: 200000,
          kas_keluar: 0,
          direction: 'in',
        }}
        onClose={() => {}}
        initialBreakdown={depositBreakdown}
      />
    );

    expect(html).toContain('Bukti Setoran Simpanan Anggota');
    expect(html).toContain('KW-2026/03/00050543');
    expect(html).toContain('BAGUS BUDI PRASETYO');
    expect(html).toContain('00050543');
    expect(html).toContain('Simpanan Wajib');
    expect(html).toContain('Mar 2026');
    expect(html).toContain('Mar-26');
    expect(html).toContain('Tunai Kasir');
    expect(html).toContain('Pembayaran iuran rutin Maret 2026');
    expect(html).toContain('200.000');
    expect(html).toContain('data-testid="single-deposit-audit-bar"');
    expect(html).toContain('Audit Dua Arah:');
    expect(html).toContain('Telusuri di Buku Besar Simpanan');
    expect(html).toContain(
      'href="/admin/compliance-matrix?search=00050543&amp;ref=KW-2026%2F03%2F00050543&amp;type=WAJIB&amp;period=Mar-26"'
    );
  });

  it('renders single-deposit bidirectional audit bar with NRP • periodCode badge fallback when receiptNo is empty (CF-6C928789) both outside and inside MemoryRouter', () => {
    const donnyBreakdown: CashFlowReferenceBreakdown = {
      kind: 'individual_deposit',
      journal: {
        id: '6c928789-0000-4000-8000-000000000001',
        refCode: 'CF-6C928789',
        category: 'Setoran Simpanan',
        direction: 'in',
        amount: 200000,
        description: 'Setoran Simpanan Wajib [Mar 2026] — 00060019 - DONNY ILHAM PAMBUDI',
        unitUsaha: 'Umum',
        referenceId: 'tx-donny-mar26',
        createdAt: '2026-03-10T08:00:00.000Z',
      },
      individualDeposit: {
        transactionId: 'tx-donny-mar26',
        memberId: 'mem-donny',
        nrp: '00060019',
        nama: 'DONNY ILHAM PAMBUDI',
        memberNrp: '00060019',
        memberName: 'DONNY ILHAM PAMBUDI',
        tanggal_lahir: '1985-05-20',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 3,
        forYear: 2026,
        periodLabel: 'Mar 2026',
        shortPeriodLabel: 'Mar-26',
        periodCode: 'Mar-26',
        referenceNo: null,
        receiptNumber: 'CF-6C928789',
        paymentMethod: 'tunai',
        description: 'Setoran Matriks WAJIB Mar 2026',
        notes: null,
        createdAt: '2026-03-10T08:00:00.000Z',
        amount: 200000,
      },
    };

    const item: CashFlowReferenceModalItem = {
      ...baseOpeningItem,
      id: '6c928789-0000-4000-8000-000000000001',
      referensi: 'CF-6C928789',
      kategori: 'Setoran Simpanan',
      kas_masuk: 200000,
      kas_keluar: 0,
      direction: 'in',
    };

    const expectedHref =
      'href="/admin/compliance-matrix?search=00060019&amp;ref=CF-6C928789&amp;type=WAJIB&amp;period=Mar-26"';

    const staticHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={item}
        onClose={() => {}}
        initialBreakdown={donnyBreakdown}
      />
    );

    expect(staticHtml).toContain('data-testid="single-deposit-audit-bar"');
    expect(staticHtml).toContain('Audit Dua Arah:');
    expect(staticHtml).toContain('00060019 • Mar-26');
    expect(staticHtml).toContain('Telusuri di Buku Besar Simpanan');
    expect(staticHtml).toContain('data-testid="btn-trace-savings-ledger"');
    expect(staticHtml).toContain(expectedHref);

    const routerHtml = renderToStaticMarkup(
      <MemoryRouter>
        <CashFlowReferenceModal
          cashFlowItem={item}
          onClose={() => {}}
          initialBreakdown={donnyBreakdown}
        />
      </MemoryRouter>
    );

    expect(routerHtml).toContain('data-testid="single-deposit-audit-bar"');
    expect(routerHtml).toContain('data-testid="btn-trace-savings-ledger"');
    expect(routerHtml).toContain('00060019 • Mar-26');
    expect(routerHtml).toContain(expectedHref);
  });

  it('renders store_credit_payment side-by-side receivable reduction and cash addition cards with related INV receipts', () => {
    const bonBreakdown: CashFlowReferenceBreakdown = {
      kind: 'store_credit_payment',
      journal: {
        id: 'cf-bon-detail-1',
        refCode: 'CF-BON99999',
        category: 'PELUNASAN_BON_TOKO',
        direction: 'in',
        amount: 100000,
        description:
          'Pelunasan Bon Toko (Potong Gaji • BYR-9901) — 88010001 - Budi Santoso | Piutang -Rp 100.000 (Sisa Piutang: Rp 50.000)',
        unitUsaha: 'Umum',
        referenceId: 'scp-2',
        createdAt: '2026-11-19T08:00:00.000Z',
      },
      storeCreditPayment: {
        paymentId: 'scp-2',
        receiptNumber: 'BYR-9901',
        amount: 100000,
        paymentDate: '2026-11-19',
        paymentMethod: 'potong_gaji',
        notes: 'Potong gaji November',
        saleNumber: 'INV-20261112-02',
        saleTotal: 80000,
        salePaidCredit: 50000,
        beforeBalance: 150000,
        afterBalance: 50000,
        relatedSales: [
          {
            saleId: 'sale-2',
            saleNumber: 'INV-20261112-02',
            totalAmount: 80000,
            paidCredit: 50000,
            createdAt: '2026-11-12T08:00:00.000Z',
          },
          {
            saleId: 'sale-1',
            saleNumber: 'INV-20261101-01',
            totalAmount: 150000,
            paidCredit: 150000,
            createdAt: '2026-11-01T08:00:00.000Z',
          },
        ],
        member: { nrp: '88010001', nama: 'Budi Santoso', tanggal_lahir: '1983-08-15' },
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-bon-detail-1',
          referensi: 'CF-BON99999',
          kategori: 'PELUNASAN_BON_TOKO',
          kas_masuk: 100000,
          kas_keluar: 0,
          direction: 'in',
        }}
        onClose={() => {}}
        initialBreakdown={bonBreakdown}
      />
    );

    expect(html).toContain('Aset Piutang Bon Berkurang');
    expect(html).toContain('Piutang Awal (Sebelum Bayar)');
    expect(html).toContain('150.000');
    expect(html).toContain('Dikurangi Pelunasan');
    expect(html).toContain('-Rp 100.000');
    expect(html).toContain('Sisa Piutang Anggota');
    expect(html).toContain('50.000');

    expect(html).toContain('Kas Koperasi Bertambah');
    expect(html).toContain('Kas Masuk Diterima');
    expect(html).toContain('+Rp 100.000');
    expect(html).toContain('Potong Gaji');
    expect(html).toContain('BYR-9901');

    expect(html).toContain('Daftar Nota Belanja Bon Terkait (2 struk)');
    expect(html).toContain('INV-20261112-02');
    expect(html).toContain('INV-20261101-01');
  });

  it('renders MEMBER_CLEARANCE breakdown with member status, 4 savings types, zero debt offset, and net payout for MOCH. ALIF NURSYARIFUDDIN', () => {
    const clearanceBreakdown: CashFlowReferenceBreakdown = {
      kind: 'MEMBER_CLEARANCE',
      journal: {
        id: 'cf-clr-alif-1',
        refCode: 'CF-CLR00001',
        category: 'KLIRING_ANGGOTA_KELUAR',
        direction: 'out',
        amount: 10460000,
        description:
          'Kliring Pengunduran Diri — 00010062 - MOCH. ALIF NURSYARIFUDDIN | Hak Simpanan: Rp 10.460.000, Potong Utang: Rp 0, Kas Dibayarkan: Rp 10.460.000',
        unitUsaha: 'Umum',
        referenceId: 'mem-alif',
        createdAt: '2026-11-19T14:20:00.000Z',
      },
      memberClearance: {
        memberId: 'mem-alif',
        member: {
          nrp: '00010062',
          nama: 'MOCH. ALIF NURSYARIFUDDIN',
          tanggal_lahir: '1990-02-10',
          status: 'nonaktif',
          membershipStatus: 'RESIGNED',
          bankName: 'BRI',
          bankAccountNumber: '1234567890',
        },
        clearanceDate: '2026-11-19T14:20:00.000Z',
        settlementType: 'SURPLUS_PAYOUT',
        paymentMethod: 'Transfer Bank',
        notes: 'Pengunduran diri selesai',
        savingsItems: [
          { depositTypeId: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib', bucket: 'wajib', amount: 5000000 },
          { depositTypeId: 'dt-p', code: 'POKOK', name: 'Simpanan Pokok', bucket: 'pokok', amount: 10000 },
          { depositTypeId: 'dt-b', code: 'BELANJA', name: 'Simpanan Belanja', bucket: 'belanja', amount: 1250000 },
          { depositTypeId: 'dt-l', code: 'LEBARAN', name: 'Simpanan Lebaran', bucket: 'lebaran', amount: 4200000 },
        ],
        savingsByBucket: {
          wajib: 5000000,
          pokok: 10000,
          belanja: 1250000,
          lebaran: 4200000,
          lainnya: 0,
        },
        totalSavings: 10460000,
        debtItems: [],
        totalDebtOffset: 0,
        netSettlement: 10460000,
        journalAmount: 10460000,
        difference: 0,
        isMatched: true,
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-clr-alif-1',
          referensi: 'CF-CLR00001',
          kategori: 'KLIRING_ANGGOTA_KELUAR',
          kas_masuk: 0,
          kas_keluar: 10460000,
          direction: 'out',
        }}
        onClose={() => {}}
        initialBreakdown={clearanceBreakdown}
      />
    );

    expect(html).toContain('Kategori: Kliring Anggota Keluar');
    expect(html).toContain('MOCH. ALIF NURSYARIFUDDIN');
    expect(html).toContain('00010062');
    expect(html).toContain('RESIGNED / KELUAR');
    expect(html).toContain('Simpanan Wajib');
    expect(html).toContain('5.000.000');
    expect(html).toContain('Simpanan Pokok');
    expect(html).toContain('10.000');
    expect(html).toContain('Simpanan Belanja');
    expect(html).toContain('1.250.000');
    expect(html).toContain('Simpanan Lebaran');
    expect(html).toContain('4.200.000');
    expect(html).toContain('10.460.000');
    expect(html).toContain('Total Kas Bersih Diserahkan ke Anggota');
    expect(html).toContain('Tidak ada potongan kewajiban pinjaman / bon');
    expect(html).toContain('Cocok dengan Jurnal Kas');
  });

  it('renders MEMBER_CLEARANCE deficit + debt-offset variant cleanly', () => {
    const deficitBreakdown: CashFlowReferenceBreakdown = {
      kind: 'MEMBER_CLEARANCE',
      journal: {
        id: 'cf-clr-def-1',
        refCode: 'CF-CLRDEF01',
        category: 'KLIRING_ANGGOTA_KELUAR',
        direction: 'in',
        amount: 3500000,
        description:
          'Kliring Pengunduran Diri — 88010051 - Dedi Kurniawan | Hak Simpanan: Rp 2.000.000, Potong Utang: Rp 5.500.000, Kekurangan Disetor Anggota: Rp 3.500.000',
        unitUsaha: 'Umum',
        referenceId: 'mem-def-paid',
        createdAt: '2026-11-19T09:00:00.000Z',
      },
      memberClearance: {
        memberId: 'mem-def-paid',
        member: {
          nrp: '88010051',
          nama: 'Dedi Kurniawan',
          tanggal_lahir: '1992-04-05',
          status: 'nonaktif',
          membershipStatus: 'RESIGNED',
        },
        clearanceDate: '2026-11-19T09:00:00.000Z',
        settlementType: 'INSTANT_PAYOFF',
        paymentMethod: 'Tunai Kasir',
        notes: 'Pelunasan defisit saat keluar',
        savingsItems: [
          { depositTypeId: 'dt-w', code: 'WAJIB', name: 'Simpanan Wajib', bucket: 'wajib', amount: 2000000 },
        ],
        savingsByBucket: { wajib: 2000000, pokok: 0, belanja: 0, lebaran: 0, lainnya: 0 },
        totalSavings: 2000000,
        debtItems: [
          {
            loanId: 'loan-dedi-1',
            loanNumber: 'PJ-2026-77',
            purpose: 'Pinjaman Konsumtif',
            offsetAmount: 5500000,
          },
        ],
        totalDebtOffset: 5500000,
        netSettlement: -3500000,
        journalAmount: 3500000,
        difference: 0,
        isMatched: true,
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'cf-clr-def-1',
          referensi: 'CF-CLRDEF01',
          kategori: 'KLIRING_ANGGOTA_KELUAR',
          kas_masuk: 3500000,
          kas_keluar: 0,
          direction: 'in',
        }}
        onClose={() => {}}
        initialBreakdown={deficitBreakdown}
      />
    );

    expect(html).toContain('PJ-2026-77');
    expect(html).toContain('5.500.000');
    expect(html).toContain('Total Kekurangan Disetor Anggota ke Koperasi');
    expect(html).toContain('3.500.000');
  });

  it('renders MEMBER_DEPOSIT_BATCH (CF-EED98D59 / SETORAN_ANGGOTA) with source menu, kwitansi badge, itemized table, and trace-back link', () => {
    const batchBreakdown: CashFlowReferenceBreakdown = {
      kind: 'MEMBER_DEPOSIT_BATCH',
      journal: {
        id: 'eed98d59-1111-4000-8000-000000000001',
        refCode: 'CF-EED98D59',
        category: 'SETORAN_ANGGOTA',
        direction: 'in',
        amount: 4050000,
        description:
          'Setoran Anggota BAGUS BUDI PRASETYO (00050543) - Tunai [KW-SETOR-20261120-3663]',
        unitUsaha: 'Simpan Pinjam',
        referenceId: null,
        createdAt: '2026-11-20T09:00:00.000Z',
      },
      memberDepositBatch: {
        sourceMenu: 'Simpanan & Buku Besar → Setoran Simpanan',
        receiptNumber: 'KW-SETOR-20261120-3663',
        paymentMethod: 'tunai',
        member: {
          id: 'mem-bagus',
          nrp: '00050543',
          nama: 'BAGUS BUDI PRASETYO',
          tanggal_lahir: '1986-07-15',
        },
        items: [
          {
            id: 'tx-1',
            depositTypeName: 'Simpanan Pokok',
            depositTypeCode: 'POKOK',
            forMonth: null,
            forYear: null,
            periodLabel: 'Kewajiban Pokok',
            paymentMethod: 'tunai',
            referenceNo: 'KW-SETOR-20261120-3663',
            description: 'Setoran Simpanan Pokok',
            notes: 'Pelunasan Simpanan Pokok',
            amount: 500000,
            createdAt: '2026-11-20T09:00:00.000Z',
          },
          {
            id: 'tx-2',
            depositTypeName: 'Simpanan Wajib',
            depositTypeCode: 'WAJIB',
            forMonth: 10,
            forYear: 2026,
            periodLabel: 'Oktober 2026',
            paymentMethod: 'tunai',
            referenceNo: 'KW-SETOR-20261120-3663',
            description: 'Setoran Simpanan Wajib (Okt 2026)',
            notes: null,
            amount: 3550000,
            createdAt: '2026-11-20T09:00:01.000Z',
          },
        ],
        totalAmount: 4050000,
        journalAmount: 4050000,
        difference: 0,
        isMatched: true,
      },
    };

    const html = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={{
          ...baseOpeningItem,
          id: 'eed98d59-1111-4000-8000-000000000001',
          referensi: 'CF-EED98D59',
          kategori: 'SETORAN_ANGGOTA',
          deskripsi:
            'Setoran Anggota BAGUS BUDI PRASETYO (00050543) - Tunai [KW-SETOR-20261120-3663]',
          kas_masuk: 4050000,
          kas_keluar: 0,
          direction: 'in',
        }}
        onClose={() => {}}
        initialBreakdown={batchBreakdown}
      />
    );

    expect(html).toContain('Kategori: Setoran Anggota');
    expect(html).toContain('Metadata Lengkap Jurnal Arus Kas');
    expect(html).toContain('data-testid="member-deposit-batch-banner"');
    expect(html).toContain('Simpanan &amp; Buku Besar → Setoran Simpanan');
    expect(html).toContain('KW-SETOR-20261120-3663');
    expect(html).toContain('BAGUS BUDI PRASETYO');
    expect(html).toContain('NRP: 00050543');
    expect(html).toContain('data-testid="member-deposit-batch-table"');
    expect(html).toContain('Simpanan Pokok');
    expect(html).toContain('Kewajiban Pokok');
    expect(html).toContain('500.000');
    expect(html).toContain('Simpanan Wajib');
    expect(html).toContain('Oktober 2026');
    expect(html).toContain('3.550.000');
    expect(html).toContain('TOTAL SETORAN MASUK KAS');
    expect(html).toContain('4.050.000');
    expect(html).toContain('Cocok dengan Jurnal Kas');
    expect(html).toContain(
      'href="/admin/compliance-matrix?search=00050543&amp;ref=KW-SETOR-20261120-3663"'
    );
    expect(html).toContain('Telusuri di Buku Besar Simpanan');
  });

  it('renders KOREKSI_PEMBATALAN (deposit_cancellation_reversal) audit card with reason box, member details, and matrix link', () => {
    const reversalBreakdown: CashFlowReferenceBreakdown = {
      kind: 'deposit_cancellation_reversal',
      journal: {
        id: 'rev-1111-2222-3333-444455556666',
        refCode: 'CF-REV11111',
        category: 'KOREKSI_PEMBATALAN',
        direction: 'out',
        amount: 200000,
        description:
          'Pembatalan Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Salah input bulan" (Oleh: Admin Keuangan)',
        unitUsaha: 'Umum',
        referenceId: 'tx-donny-nov26',
        createdAt: '2026-11-21T10:00:00.000Z',
      },
      cancellationReversal: {
        originalTransactionId: 'tx-donny-nov26',
        memberId: 'mem-donny',
        memberNrp: '00060019',
        memberName: 'DONNY ILHAM PAMBUDI',
        tanggal_lahir: '1985-05-20',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 11,
        forYear: 2026,
        periodLabel: 'Nov 2026',
        shortPeriodLabel: 'Nov-26',
        amount: 200000,
        cancelReason: 'Salah input bulan',
        adminName: 'Admin Keuangan',
        canceledAt: '2026-11-21T10:00:00.000Z',
        originalReferenceNo: 'KW-2026/11/00060019',
        originalPaymentMethod: 'potong_gaji',
        originalCreatedAt: '2026-11-20T08:00:00.000Z',
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CashFlowReferenceModal
          cashFlowItem={{
            ...baseOpeningItem,
            id: 'rev-1111-2222-3333-444455556666',
            referensi: 'CF-REV11111',
            kategori: 'KOREKSI_PEMBATALAN',
            deskripsi:
              'Pembatalan Setoran Simpanan Wajib [Nov 2026] — 00060019 - DONNY ILHAM PAMBUDI | Alasan: "Salah input bulan" (Oleh: Admin Keuangan)',
            kas_masuk: 0,
            kas_keluar: 200000,
            direction: 'out',
          }}
          onClose={() => {}}
          initialBreakdown={reversalBreakdown}
        />
      </MemoryRouter>
    );

    expect(html).toContain('Kategori: Koreksi / Pembatalan');
    expect(html).toContain('data-testid="cancellation-reversal-card"');
    expect(html).toContain('Bukti Jurnal Balik / Pembatalan Setoran');
    expect(html).toContain('Simpanan Wajib');
    expect(html).toContain('Nov 2026 (Nov-26)');
    expect(html).toContain('DONNY ILHAM PAMBUDI');
    expect(html).toContain('00060019');
    expect(html).toContain('-Rp 200.000');
    expect(html).toContain('Admin Keuangan');
    expect(html).toContain('KW-2026/11/00060019');
    expect(html).toContain('Potong Gaji');
    expect(html).toContain('data-testid="cancellation-reason-box"');
    expect(html).toContain('Alasan Pembatalan');
    expect(html).toContain('Salah input bulan');
    expect(html).toContain(
      'href="/admin/compliance-matrix?search=00060019&amp;type=WAJIB&amp;period=Nov-26"'
    );
  });

  it('renders loan_installment (CF-9F0EE1EF) detail card with pokok/margin split and two-way audit link to /admin/loan-matrix both outside and inside MemoryRouter', () => {
    const loanInstallmentBreakdown: CashFlowReferenceBreakdown = {
      kind: 'loan_installment',
      journal: {
        id: '9f0ee1ef-1111-2222-3333-444455556666',
        refCode: 'CF-9F0EE1EF',
        category: 'angsuran_pinjaman',
        direction: 'in',
        amount: 200000,
        description:
          'Angsuran Pembiayaan Barang (beli hp) Bln ke-1 — 99999999 - anggota tes 1 | Pokok: Rp 181.818 | Margin: Rp 18.182',
        unitUsaha: 'Simpan Pinjam',
        referenceId: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
        createdAt: '2026-11-22T10:00:00.000Z',
      },
      loanInstallment: {
        loanId: 'loan-hp-1',
        scheduleId: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
        loanNumber: 'LOAN-1795333396946',
        loanTypeName: 'Pembiayaan Barang',
        itemDescription: 'beli hp',
        isGoodsFinancing: true,
        periodNumber: 1,
        tenor: 11,
        amount: 200000,
        principalPortion: 181818,
        marginPortion: 18182,
        paymentMethod: 'potong_gaji',
        createdAt: '2026-11-22T10:00:00.000Z',
        description:
          'Angsuran Pembiayaan Barang (beli hp) Bln ke-1 — 99999999 - anggota tes 1 | Pokok: Rp 181.818 | Margin: Rp 18.182',
        member: {
          nrp: '99999999',
          nama: 'anggota tes 1',
          tanggal_lahir: '1990-01-15',
        },
      },
    };

    const item: CashFlowReferenceModalItem = {
      ...baseOpeningItem,
      id: '9f0ee1ef-1111-2222-3333-444455556666',
      referensi: 'CF-9F0EE1EF',
      kategori: 'angsuran_pinjaman',
      deskripsi:
        'Angsuran Pembiayaan Barang (beli hp) Bln ke-1 — 99999999 - anggota tes 1 | Pokok: Rp 181.818 | Margin: Rp 18.182',
      kas_masuk: 200000,
      kas_keluar: 0,
      direction: 'in',
      reference_id: '4b1eaebf-a9df-470a-b21d-6f1f3d576977',
    };

    const staticHtml = renderToStaticMarkup(
      <CashFlowReferenceModal
        cashFlowItem={item}
        onClose={() => {}}
        initialBreakdown={loanInstallmentBreakdown}
      />
    );

    expect(staticHtml).toContain('Kategori: Angsuran Pinjaman');
    expect(staticHtml).toContain('data-testid="loan-installment-card"');
    expect(staticHtml).toContain('Bukti Angsuran Pinjaman Anggota');
    expect(staticHtml).toContain('Angsuran Pembiayaan Barang');
    expect(staticHtml).toContain('Bln ke-1');
    expect(staticHtml).toContain('LOAN-1795333396946');
    expect(staticHtml).toContain('anggota tes 1');
    expect(staticHtml).toContain('99999999');
    expect(staticHtml).toContain('Pembiayaan Barang (beli hp)');
    expect(staticHtml).toContain('Bulan ke-1 dari 11 Bln');
    expect(staticHtml).toContain('Pokok: Rp 181.818 • Margin: Rp 18.182');
    expect(staticHtml).toContain('200.000');
    expect(staticHtml).toContain('data-testid="loan-installment-audit-bar"');
    expect(staticHtml).toContain('Audit Dua Arah:');
    expect(staticHtml).toContain('Telusuri di Buku Besar Pinjaman');
    expect(staticHtml).toContain('data-testid="btn-trace-loan-ledger"');
    expect(staticHtml).toContain('href="/admin/loan-matrix?search=LOAN-1795333396946&amp;traceRef=CF-9F0EE1EF&amp;loanNo=LOAN-1795333396946&amp;nrp=99999999&amp;traceYear=2026&amp;installmentNo=1&amp;traceAmount=200000');

    const routerHtml = renderToStaticMarkup(
      <MemoryRouter>
        <CashFlowReferenceModal
          cashFlowItem={item}
          onClose={() => {}}
          initialBreakdown={loanInstallmentBreakdown}
        />
      </MemoryRouter>
    );

    expect(routerHtml).toContain('data-testid="loan-installment-audit-bar"');
    expect(routerHtml).toContain('data-testid="btn-trace-loan-ledger"');
    expect(routerHtml).toContain('href="/admin/loan-matrix?search=LOAN-1795333396946&amp;traceRef=CF-9F0EE1EF&amp;loanNo=LOAN-1795333396946&amp;nrp=99999999&amp;traceYear=2026&amp;installmentNo=1&amp;traceAmount=200000');
  });

  it('renders loan_installment (CF-AFC2CE08) with full traceMonth=12, traceYear=2026, installmentNo=1 coordinates derived from dueDate', () => {
    const cfAfcBreakdown: CashFlowReferenceBreakdown = {
      kind: 'loan_installment',
      journal: {
        id: 'afc2ce08-1111-2222-3333-444455556666',
        refCode: 'CF-AFC2CE08',
        category: 'angsuran_pinjaman',
        direction: 'in',
        amount: 1100000,
        description:
          'Angsuran Pembiayaan Barang (beli sepeda listrik) Bln ke-1 — 99999998 - Anggota Tes 2 | Pokok: Rp 1.000.000 | Margin: Rp 100.000',
        unitUsaha: 'Simpan Pinjam',
        referenceId: 'sched-dec-2026-1',
        createdAt: '2026-11-23T02:00:00.000Z',
      },
      loanInstallment: {
        loanId: 'loan-tes-2',
        scheduleId: 'sched-dec-2026-1',
        loanNumber: 'LOAN-1795334228834',
        loanTypeName: 'Pembiayaan Barang',
        itemDescription: 'beli sepeda listrik',
        isGoodsFinancing: true,
        periodNumber: 1,
        tenor: 3,
        dueDate: '2026-12-23',
        amount: 1100000,
        principalPortion: 1000000,
        marginPortion: 100000,
        paymentMethod: 'potong_gaji',
        createdAt: '2026-11-23T02:00:00.000Z',
        description:
          'Angsuran Pembiayaan Barang (beli sepeda listrik) Bln ke-1 — Pokok: Rp 1.000.000 | Margin: Rp 100.000',
        member: {
          nrp: '99999998',
          nama: 'Anggota Tes 2',
          tanggal_lahir: '1991-05-10',
        },
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CashFlowReferenceModal
          cashFlowItem={{
            ...baseOpeningItem,
            id: 'afc2ce08-1111-2222-3333-444455556666',
            referensi: 'CF-AFC2CE08',
            kategori: 'angsuran_pinjaman',
            deskripsi: cfAfcBreakdown.journal.description,
            kas_masuk: 1100000,
            kas_keluar: 0,
            direction: 'in',
            reference_id: 'sched-dec-2026-1',
          }}
          onClose={() => {}}
          initialBreakdown={cfAfcBreakdown}
        />
      </MemoryRouter>
    );

    const hrefMatch = html.match(/href="([^"]*\/admin\/loan-matrix[^"]*)"/);
    expect(hrefMatch).not.toBeNull();
    const decodedHref = hrefMatch![1].replace(/&amp;/g, '&');
    const url = new URL(decodedHref, 'http://localhost');
    expect(url.pathname).toBe('/admin/loan-matrix');
    expect(url.searchParams.get('search')).toBe('LOAN-1795334228834');
    expect(url.searchParams.get('traceRef')).toBe('CF-AFC2CE08');
    expect(url.searchParams.get('loanNo')).toBe('LOAN-1795334228834');
    expect(url.searchParams.get('nrp')).toBe('99999998');
    expect(url.searchParams.get('traceMonth')).toBe('12');
    expect(url.searchParams.get('traceYear')).toBe('2026');
    expect(url.searchParams.get('installmentNo')).toBe('1');
    expect(url.searchParams.get('traceAmount')).toBe('1100000');
    expect(url.searchParams.get('traceDate')).toBe('2026-11-23T02:00:00.000Z');
    expect(url.searchParams.get('traceDesc')).toContain('Angsuran Pembiayaan Barang (beli sepeda listrik) Bln ke-1');
  });

  it('renders loan_disbursement detail card with two-way audit link to /admin/loan-matrix using NRP fallback when loanNumber is absent', () => {
    const disbursementBreakdown: CashFlowReferenceBreakdown = {
      kind: 'loan_disbursement',
      journal: {
        id: 'cf-disb-ui-1',
        refCode: 'CF-DISB0001',
        category: 'Pembiayaan Barang',
        direction: 'out',
        amount: 2000000,
        description: 'Pencairan Pembiayaan Barang (beli hp) — 99999999 - anggota tes 1',
        unitUsaha: 'Simpan Pinjam',
        referenceId: 'loan-hp-1',
        createdAt: '2026-11-20T08:00:00.000Z',
      },
      loanDisbursement: {
        loanId: 'loan-hp-1',
        loanNumber: null,
        loanTypeName: 'Pembiayaan Barang',
        amount: 2000000,
        tenor: 11,
        status: 'active',
        disbursedAt: '2026-11-20T08:00:00.000Z',
        itemDescription: 'beli hp',
        costPrice: 2000000,
        markupAmount: 200000,
        description: 'Pencairan Pembiayaan Barang (beli hp) — 99999999 - anggota tes 1',
        member: {
          nrp: '99999999',
          nama: 'anggota tes 1',
          tanggal_lahir: '1990-01-15',
        },
      },
    };

    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CashFlowReferenceModal
          cashFlowItem={{
            ...baseOpeningItem,
            id: 'cf-disb-ui-1',
            referensi: 'CF-DISB0001',
            kategori: 'Pembiayaan Barang',
            kas_masuk: 0,
            kas_keluar: 2000000,
            direction: 'out',
          }}
          onClose={() => {}}
          initialBreakdown={disbursementBreakdown}
        />
      </MemoryRouter>
    );

    expect(html).toContain('data-testid="loan-disbursement-card"');
    expect(html).toContain('Bukti Pencairan Pinjaman Anggota');
    expect(html).toContain('anggota tes 1 (99999999)');
    expect(html).toContain('beli hp');
    expect(html).toContain('data-testid="loan-disbursement-audit-bar"');
    expect(html).toContain('Telusuri di Buku Besar Pinjaman');
    expect(html).toContain('href="/admin/loan-matrix?search=99999999&amp;traceRef=CF-DISB0001&amp;nrp=99999999&amp;traceYear=2026&amp;traceAmount=2000000');
  });
});
