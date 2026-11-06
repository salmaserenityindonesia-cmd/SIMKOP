import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BayarBonModal from './BayarBonModal';

// Mock feedback context
vi.mock('../../context/FeedbackContext', () => ({
  useFeedback: () => ({
    showToast: vi.fn(),
    showConfirm: vi.fn(),
    showAlert: vi.fn(),
  }),
}));

// Mock storeCreditLedgerService
vi.mock('../../services/storeCreditLedgerService', () => ({
  settleStoreCredit: vi.fn().mockResolvedValue({ id: 'scp-1' }),
  getMemberActiveDebt: vi.fn().mockResolvedValue(150000),
  getMembersWithDebt: vi.fn().mockResolvedValue([
    { id: 'm-1', nama: 'Sertu Budi', nrp: '12345', debt: 150000 },
    { id: 'm-2', nama: 'Kopda Joko', nrp: '67890', debt: 85000 }
  ]),
}));

describe('BayarBonModal Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <BayarBonModal
        isOpen={false}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    );
    expect(html).toBe('');
  });

  it('renders modal dialog with headers, form inputs, and payment methods when isOpen is true', () => {
    const html = renderToStaticMarkup(
      <BayarBonModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialMemberId="m-1"
        initialMemberName="Sertu Budi (12345)"
        initialDebtAmount={150000}
        initialReceiptNo="TRX-20261105-001"
      />
    );

    expect(html).toContain('Catat Pelunasan Bon Toko');
    expect(html).toContain('Pembayaran Piutang Belanja Kasir Anggota');
    expect(html).toContain('Sertu Budi (12345)');
    expect(html).toContain('Total Sisa Bon Tertunggak:');
    expect(html).toContain('Nominal Pelunasan (Rp)');
    expect(html).toContain('Metode Pembayaran');
    expect(html).toContain('Potong Gaji');
    expect(html).toContain('Tunai Kasir');
    expect(html).toContain('Transfer Bank');
    expect(html).toContain('Nomor Bukti / Referensi');
    expect(html).toContain('Catatan / Keterangan');
    expect(html).toContain('Simpan Pelunasan');
  });

  it('renders quick action button to pay in full', () => {
    const html = renderToStaticMarkup(
      <BayarBonModal
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        initialMemberId="m-1"
        initialDebtAmount={150000}
      />
    );

    expect(html).toContain('Lunasi Semua');
  });
});
