import { describe, it, expect } from 'vitest';
import {
  formatPosCashFlowDescription,
  formatPosPaymentSchemeLabel,
  isPosCashSaleCategory,
  needsPosDescriptionEnrichment,
  sanitizePosTerminology,
} from './posCashFlowFormat';

describe('posCashFlowFormat', () => {
  it('formats POS cash flow description with invoice number, member NRP + name, and formatted nominal', () => {
    expect(
      formatPosCashFlowDescription({
        saleNumber: 'INV-1795078441001',
        memberNrp: '00010062',
        memberName: 'MOCH. ALIF NURSYARIFUDDIN',
        amount: 100000,
      })
    ).toBe(
      'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)'
    );
  });

  it('formats POS cash flow description for non-member, partial identity, and missing sale number', () => {
    expect(
      formatPosCashFlowDescription({
        saleNumber: 'INV-1795078441002',
        memberNrp: null,
        memberName: null,
        amount: 45000,
      })
    ).toBe('Penjualan Tunai (INV-1795078441002) — Pelanggan Umum (Rp 45.000)');

    expect(
      formatPosCashFlowDescription({
        saleNumber: 'INV-1795078441003',
        memberNrp: '-',
        memberName: 'Siti Aminah',
        amount: 25000,
      })
    ).toBe('Penjualan Tunai (INV-1795078441003) — Siti Aminah (Rp 25.000)');

    expect(
      formatPosCashFlowDescription({
        saleNumber: null,
        memberNrp: '00010062',
        memberName: 'MOCH. ALIF NURSYARIFUDDIN',
        amount: 100000,
      })
    ).toBe('Penjualan Tunai — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)');
  });

  it('maps payment channels and schemes to cooperative-perspective Penjualan labels', () => {
    expect(
      formatPosPaymentSchemeLabel({
        paymentScheme: 'cash',
        paidCash: 100000,
        paidDeposit: 0,
        paidCredit: 0,
      })
    ).toBe('Penjualan Tunai');

    expect(
      formatPosPaymentSchemeLabel({
        paymentScheme: 'split',
        paidCash: 40000,
        paidDeposit: 60000,
        paidCredit: 0,
      })
    ).toBe('Penjualan Campuran');

    expect(
      formatPosPaymentSchemeLabel({
        paymentScheme: 'split',
        paidCash: 0,
        paidDeposit: 100000,
        paidCredit: 0,
      })
    ).toBe('Penjualan Potong Simpanan');

    expect(
      formatPosPaymentSchemeLabel({
        paymentScheme: 'store_credit',
        paidCash: 0,
        paidDeposit: 0,
        paidCredit: 120000,
      })
    ).toBe('Penjualan Bon Toko');

    expect(formatPosPaymentSchemeLabel({ paymentScheme: 'split' })).toBe('Penjualan Campuran');
    expect(formatPosPaymentSchemeLabel({ paymentScheme: 'Pembelian Tunai' })).toBe(
      'Penjualan Tunai'
    );
    expect(formatPosPaymentSchemeLabel({ paymentScheme: 'pembelian_tunai' })).toBe(
      'Penjualan Tunai'
    );
  });

  it('sanitizes legacy Pembelian Tunai terminology to Penjualan Tunai', () => {
    expect(sanitizePosTerminology('pembelian tunai (INV-123)')).toBe(
      'Penjualan Tunai (INV-123)'
    );
    expect(sanitizePosTerminology('Pembelian Tunai')).toBe('Penjualan Tunai');
    expect(sanitizePosTerminology('pembelian_tunai')).toBe('Penjualan Tunai');
  });

  it('classifies POS sale categories and excludes shift-level PENJUALAN_KASIR_TUNAI', () => {
    expect(isPosCashSaleCategory('penjualan_tunai')).toBe(true);
    expect(isPosCashSaleCategory('PENJUALAN_TUNAI')).toBe(true);
    expect(isPosCashSaleCategory('Penjualan POS')).toBe(true);
    expect(isPosCashSaleCategory('PENJUALAN_POS')).toBe(true);
    expect(isPosCashSaleCategory('PENJUALAN_KASIR_TUNAI')).toBe(false);
    expect(isPosCashSaleCategory('SETORAN_SIMPANAN')).toBe(false);
  });

  it('detects descriptions needing enrichment', () => {
    expect(needsPosDescriptionEnrichment(null)).toBe(true);
    expect(needsPosDescriptionEnrichment('')).toBe(true);
    expect(needsPosDescriptionEnrichment('-')).toBe(true);
    expect(needsPosDescriptionEnrichment('Penjualan Kasir Tunai')).toBe(true);
    expect(needsPosDescriptionEnrichment('Pembelian Tunai (INV-001)')).toBe(true);
    expect(
      needsPosDescriptionEnrichment(
        'Penjualan Tunai (INV-1795078441001) — 00010062 - MOCH. ALIF NURSYARIFUDDIN (Rp 100.000)'
      )
    ).toBe(false);
  });
});
