import { renderToStaticMarkup } from 'react-dom/server';
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
            pangkat: 'Aipda',
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
        member: { nrp: '88010001', nama: 'Budi Santoso', pangkat: 'Aipda' },
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
        member: { nrp: '88010002', nama: 'Siti Aminah', pangkat: 'Bripka' },
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
          pangkat: 'Aipda',
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
    expect(wdHtml).toContain('Aipda');
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
            pangkat: 'Aipda',
            bankName: 'Bank BRI',
            bankAccountNumber: '111222333',
            amount: 2400000,
          },
          {
            id: 'r-2',
            memberId: 'm-2',
            nrp: '88010002',
            nama: 'Siti Aminah',
            pangkat: 'Bripka',
            bankName: 'Bank Mandiri',
            bankAccountNumber: '444555666',
            amount: 2400000,
          },
          {
            id: 'r-3',
            memberId: 'm-3',
            nrp: '88010003',
            nama: 'Agus Setiawan',
            pangkat: 'Briptu',
            bankName: 'Bank BRI',
            bankAccountNumber: '777888999',
            amount: 2400000,
          },
          {
            id: 'r-4',
            memberId: 'm-4',
            nrp: '88010004',
            nama: 'Dedi Kurniawan',
            pangkat: 'Serka',
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

  it('renders individual_deposit breakdown card with receipt number, member identity, deposit type, period, payment method, and amount', () => {
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
        nrp: '00050543',
        nama: 'BAGUS BUDI PRASETYO',
        pangkat: 'Serka',
        depositTypeCode: 'WAJIB',
        depositTypeName: 'Simpanan Wajib',
        forMonth: 3,
        forYear: 2026,
        periodLabel: 'Mar 2026',
        shortPeriodLabel: 'Mar-26',
        referenceNo: 'KW-2026/03/00050543',
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
        member: { nrp: '88010001', nama: 'Budi Santoso', pangkat: 'Aipda' },
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
});
