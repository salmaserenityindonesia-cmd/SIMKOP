import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SplitPaymentModal from './SplitPaymentModal';

describe('SplitPaymentModal - Customer Identity & Member Rendering', () => {
  const dummyMember = {
    id: 'm1',
    nrp: '95118296',
    nama: 'Ahmad Hidayat'
  };

  const dummyCart = [
    { id: 'p1', name: 'Minyak Goreng 2L', price: 35000, qty: 1 }
  ];

  it('renders member identity correctly when selectedMember is provided', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SplitPaymentModal, {
        isOpen: true,
        onClose: () => {},
        cart: dummyCart,
        total: 35000,
        selectedMember: dummyMember,
        memberId: dummyMember.id,
        isNonMember: false,
        onConfirm: () => {}
      })
    );

    expect(markup).toContain('Ahmad Hidayat');
    expect(markup).toContain('95118296');
    expect(markup).toContain('Anggota Koperasi');
    expect(markup).toContain('Transaksi Atas Nama Anggota:');
    expect(markup).not.toContain('Transaksi Non-Anggota (Pelanggan Umum)');
  });

  it('renders non-member banner and cash-only restriction when selectedMember is null', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SplitPaymentModal, {
        isOpen: true,
        onClose: () => {},
        cart: dummyCart,
        total: 35000,
        selectedMember: null,
        memberId: null,
        isNonMember: true,
        onConfirm: () => {}
      })
    );

    expect(markup).toContain('Transaksi Non-Anggota (Pelanggan Umum)');
    expect(markup).toContain('Umum');
    expect(markup).toContain('Khusus Tunai');
    expect(markup).toContain('Pembeli Non-Anggota / Umum');
    expect(markup).not.toContain('Anggota Koperasi');
  });

  it('returns empty string when isOpen is false', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SplitPaymentModal, {
        isOpen: false,
        onClose: () => {},
        cart: dummyCart,
        total: 35000,
        selectedMember: dummyMember,
        memberId: dummyMember.id,
        isNonMember: false,
        onConfirm: () => {}
      })
    );

    expect(markup).toBe('');
  });
});
