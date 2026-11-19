import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import ShuReferenceDetailModal, {
  type ShuReferenceRow,
} from './ShuReferenceDetailModal';

const samplePosReference: ShuReferenceRow = {
  id: 'pos-sale-1',
  referenceNumber: 'INV-1795079184845',
  sourceType: 'pos_cash',
  transactionDate: '19/11/2026',
  rawDate: '2026-11-19T08:15:00.000Z',
  memberName: 'Budi Santoso',
  memberNrp: '88010001',
  paymentMethodLabel: 'POS • Tunai',
  omzet: 150000,
  hpp: 120000,
  grossProfit: 30000,
  marginPercent: 20,
  items: [
    {
      productName: 'Kertas HVS A4 70gr',
      categoryName: 'ATK',
      qty: 2,
      sellPrice: 55000,
      buyPrice: 45000,
      subtotalOmzet: 110000,
      subtotalHpp: 90000,
      subtotalProfit: 20000,
    },
    {
      productName: 'Kanebo Serbaguna',
      categoryName: 'Otomotif',
      qty: 1,
      sellPrice: 40000,
      buyPrice: 30000,
      subtotalOmzet: 40000,
      subtotalHpp: 30000,
      subtotalProfit: 10000,
    },
  ],
};

describe('ShuReferenceDetailModal Component', () => {
  it('renders empty output when referenceItem is null', () => {
    const html = renderToStaticMarkup(
      <ShuReferenceDetailModal referenceItem={null} onClose={() => {}} />
    );
    expect(html).toBe('');
  });

  it('renders POS invoice details, 3 summary cards, 7-column item table, multi-qty subtext, TOTAL footer, and action buttons', () => {
    const html = renderToStaticMarkup(
      <ShuReferenceDetailModal
        referenceItem={samplePosReference}
        onClose={() => {}}
      />
    );

    // Header & metadata
    expect(html).toContain('Rincian Bukti Transaksi Pembentuk SHU');
    expect(html).toContain('INV-1795079184845');
    expect(html).toContain('19/11/2026');
    expect(html).toContain('POS • Tunai');
    expect(html).toContain('88010001 - Budi Santoso');

    // 3 summary cards
    expect(html).toContain('Total Omzet');
    expect(html).toContain('150.000');
    expect(html).toContain('Total HPP / Modal');
    expect(html).toContain('120.000');
    expect(html).toContain('Laba Kotor / Kontribusi SHU');
    expect(html).toContain('30.000');
    expect(html).toContain('Margin 20.0%');

    // 7-column item table headers & rows
    expect(html).toContain('NO');
    expect(html).toContain('NAMA BARANG / URAIAN');
    expect(html).toContain('KATEGORI');
    expect(html).toContain('QTY');
    expect(html).toContain('HARGA JUAL');
    expect(html).toContain('HPP / MODAL');
    expect(html).toContain('LABA KOTOR (RP)');

    expect(html).toContain('Kertas HVS A4 70gr');
    expect(html).toContain('ATK');
    expect(html).toContain('2 × Rp 55.000');
    expect(html).toContain('2 × Rp 45.000');
    expect(html).toContain('Kanebo Serbaguna');
    expect(html).toContain('Otomotif');

    // Footer total & action buttons
    expect(html).toContain('TOTAL');
    expect(html).toContain('Salin No. Referensi');
    expect(html).toContain('Tutup');
  });

  it('renders goods financing margin breakdown and Pokok vs Margin context banner', () => {
    const goodsFinancingRef: ShuReferenceRow = {
      id: 'loan-repay-1',
      referenceNumber: 'PAY-BRG-20261119',
      sourceType: 'goods_financing',
      transactionDate: '19/11/2026',
      rawDate: '2026-11-19T09:00:00.000Z',
      memberName: 'Andi Wijaya',
      memberNrp: '91020045',
      paymentMethodLabel: 'Margin Pembiayaan',
      omzet: 60000,
      hpp: 0,
      grossProfit: 60000,
      marginPercent: 100,
      repaymentAmount: 460000,
      principalPortion: 400000,
      loanNumber: 'LOAN-BRG-001',
      items: [
        {
          productName: 'Margin Pembiayaan Barang — Laptop Kantor',
          categoryName: 'Pembiayaan Barang',
          qty: 1,
          sellPrice: 60000,
          buyPrice: 0,
          subtotalOmzet: 60000,
          subtotalHpp: 0,
          subtotalProfit: 60000,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ShuReferenceDetailModal
        referenceItem={goodsFinancingRef}
        onClose={() => {}}
      />
    );

    expect(html).toContain('PAY-BRG-20261119');
    expect(html).toContain('LOAN-BRG-001');
    expect(html).toContain('91020045 - Andi Wijaya');
    expect(html).toContain('Margin 100.0%');
    expect(html).toContain('Pemisahan Porsi Angsuran Pembiayaan Barang');
    expect(html).toContain('460.000');
    expect(html).toContain('Pokok Non-SHU: Rp 400.000');
    expect(html).toContain('Realisasi Margin SHU: Rp 60.000');
    expect(html).toContain('Margin Pembiayaan Barang — Laptop Kantor');
  });

  it('renders discount notice and reconciles TOTAL footer with net omzet when discount > 0', () => {
    const discountedRef: ShuReferenceRow = {
      id: 'pos-sale-disc',
      referenceNumber: 'INV-1795078441001',
      sourceType: 'pos_deposit',
      transactionDate: '19/11/2026',
      rawDate: '2026-11-19T10:30:00.000Z',
      memberName: 'Pelanggan Umum',
      memberNrp: '',
      paymentMethodLabel: 'POS • Potong Simpanan',
      omzet: 190000,
      hpp: 150000,
      grossProfit: 40000,
      marginPercent: 21.0526,
      discount: 10000,
      items: [
        {
          productName: 'Flashdisk 64GB',
          categoryName: 'Elektronik',
          qty: 2,
          sellPrice: 100000,
          buyPrice: 75000,
          subtotalOmzet: 200000,
          subtotalHpp: 150000,
          subtotalProfit: 50000,
        },
      ],
    };

    const html = renderToStaticMarkup(
      <ShuReferenceDetailModal
        referenceItem={discountedRef}
        onClose={() => {}}
      />
    );

    expect(html).toContain('INV-1795078441001');
    expect(html).toContain('Pembeli: Pelanggan Umum');
    expect(html).toContain('Diskon Nota: -Rp 10.000');
    // Footer TOTAL reconciles with net omzet (190.000) & net grossProfit (40.000)
    expect(html).toContain('190.000');
    expect(html).toContain('150.000');
    expect(html).toContain('40.000');
  });
});
