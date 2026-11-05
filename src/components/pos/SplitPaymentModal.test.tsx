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

    // Verify high-contrast Tailwind classes for member card
    expect(markup).toContain('bg-blue-50/80');
    expect(markup).toContain('border-blue-200');
    expect(markup).toContain('bg-blue-600');
    expect(markup).toContain('text-blue-700');
    expect(markup).toContain('text-slate-900');
    expect(markup).toContain('text-slate-600');
    expect(markup).toContain('border-emerald-300');
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

    // Verify high-contrast Tailwind classes for non-member card
    expect(markup).toContain('bg-slate-100');
    expect(markup).toContain('border-slate-300');
    expect(markup).toContain('bg-slate-500');
    expect(markup).toContain('text-slate-600');
    expect(markup).toContain('text-slate-900');
    expect(markup).toContain('bg-slate-200');
    expect(markup).toContain('text-slate-700');
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

  describe('Shopping Savings Balance Validation', () => {
    it('renders available balance badge and enables input when member has shopping savings', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaymentModal, {
          isOpen: true,
          onClose: () => {},
          cart: dummyCart,
          total: 50000,
          selectedMember: dummyMember,
          memberId: dummyMember.id,
          isNonMember: false,
          initialFinancials: { belanjaBalance: 75000, remainingCreditLimit: 500000 },
          onConfirm: () => {}
        })
      );

      expect(markup).toContain('Saldo Tersedia: Rp 75.000');
      expect(markup).toContain('Gunakan Maksimal');
      expect(markup).not.toContain('* Saldo simpanan belanja Rp 0 atau belum tersedia');
      expect(markup).not.toContain('* Tidak tersedia untuk Non-Anggota');
    });

    it('disables deposit input and displays warning when member has zero shopping savings', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaymentModal, {
          isOpen: true,
          onClose: () => {},
          cart: dummyCart,
          total: 50000,
          selectedMember: dummyMember,
          memberId: dummyMember.id,
          isNonMember: false,
          initialFinancials: { belanjaBalance: 0, remainingCreditLimit: 500000 },
          onConfirm: () => {}
        })
      );

      expect(markup).toContain('Saldo Tersedia: Rp 0');
      expect(markup).toContain('* Saldo simpanan belanja Rp 0 atau belum tersedia');
      expect(markup).toContain('disabled=""');
      expect(markup).not.toContain('Gunakan Maksimal');
    });

    it('disables deposit input and shows non-member message when isNonMember is true', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaymentModal, {
          isOpen: true,
          onClose: () => {},
          cart: dummyCart,
          total: 50000,
          selectedMember: null,
          memberId: null,
          isNonMember: true,
          onConfirm: () => {}
        })
      );

      expect(markup).toContain('* Tidak tersedia untuk Non-Anggota');
      expect(markup).toContain('Khusus Anggota');
      expect(markup).not.toContain('Saldo Tersedia: Rp');
      expect(markup).not.toContain('Gunakan Maksimal');
    });

    it('clampDepositInput restricts values correctly preventing overdraft and overpayment', async () => {
      const { clampDepositInput } = await import('./SplitPaymentModal');

      // Clamps to belanjaBalance when input exceeds balance
      expect(clampDepositInput(50000, 100000, 30000)).toBe('30000');

      // Clamps to total when input exceeds total
      expect(clampDepositInput(80000, 50000, 100000)).toBe('50000');

      // Accepts exact or lower value within both bounds
      expect(clampDepositInput(25000, 50000, 100000)).toBe('25000');

      // Disallows input when member is non-member
      expect(clampDepositInput(25000, 50000, 100000, true)).toBe('0');

      // Returns empty string when balance is 0
      expect(clampDepositInput(25000, 50000, 0)).toBe('');

      // Returns empty string for 0 or negative values
      expect(clampDepositInput(0, 50000, 100000)).toBe('');
      expect(clampDepositInput(-5000, 50000, 100000)).toBe('');
    });
  });
});
