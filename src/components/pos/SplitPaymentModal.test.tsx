import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import SplitPaymentModal, {
  applyDepositChange,
  applyBonChange,
  applyCashChange,
  getInitialSplitAmounts,
} from './SplitPaymentModal';

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

  describe('Interactive Split Payment Auto-Balancing', () => {
    it('executes 4-step interactive auto-balancing scenario on total Rp 6.000 in Bon Toko mode', () => {
      const totalTagihan = 6000;
      const availableShoppingBalance = 10000;
      const maxSafeCreditLimit = 50000;

      // Step 1: Awal dibuka dalam mode Bon Toko
      const step1 = getInitialSplitAmounts({
        totalTagihan,
        isNonMember: false,
        primaryMode: 'store_credit',
        financials: {
          belanjaBalance: availableShoppingBalance,
          remainingCreditLimit: maxSafeCreditLimit,
        },
      });
      expect(step1).toEqual({
        depositAmount: 0,
        bonAmount: 6000,
        cashAmount: 0,
      });

      // Step 2: Isi Potong Simpanan Belanja = 2000 -> Catat Bon Toko otomatis menjadi 4000
      const step2 = applyDepositChange({
        rawVal: 2000,
        totalTagihan,
        availableShoppingBalance,
        maxSafeCreditLimit,
        currentBon: step1.bonAmount,
        currentCash: step1.cashAmount,
        primaryMode: 'store_credit',
      });
      expect(step2).toEqual({
        depositAmount: 2000,
        bonAmount: 4000,
        cashAmount: 0,
      });

      // Step 3: Isi Tunai Diterima = 2000 -> Catat Bon Toko otomatis menjadi 2000
      const step3 = applyCashChange({
        rawVal: 2000,
        totalTagihan,
        maxSafeCreditLimit,
        currentDeposit: step2.depositAmount,
        currentBon: step2.bonAmount,
        primaryMode: 'store_credit',
      });
      expect(step3).toEqual({
        depositAmount: 2000,
        bonAmount: 2000,
        cashAmount: 2000,
      });
      const totalPaidStep3 = step3.depositAmount + step3.bonAmount + step3.cashAmount;
      expect(totalPaidStep3).toBe(6000);
      expect(Math.max(0, totalPaidStep3 - totalTagihan)).toBe(0);

      // Step 4: Klik tombol cepat Rp 50.000 -> Bon Toko otomatis 0, Simpanan tetap 2000, Kembalian Rp 46.000
      const step4 = applyCashChange({
        rawVal: 50000,
        totalTagihan,
        maxSafeCreditLimit,
        currentDeposit: step3.depositAmount,
        currentBon: step3.bonAmount,
        primaryMode: 'store_credit',
      });
      expect(step4).toEqual({
        depositAmount: 2000,
        bonAmount: 0,
        cashAmount: 50000,
      });
      expect(step4.depositAmount + step4.bonAmount).toBeLessThanOrEqual(totalTagihan);
      const totalPaidStep4 = step4.depositAmount + step4.bonAmount + step4.cashAmount;
      expect(Math.max(0, totalPaidStep4 - totalTagihan)).toBe(46000);
    });

    it('clamps initial deposit/bon to available balance/limit and spills remainder to cashAmount', () => {
      const depositShortage = getInitialSplitAmounts({
        totalTagihan: 6000,
        isNonMember: false,
        primaryMode: 'deposit',
        financials: { belanjaBalance: 2500, remainingCreditLimit: 50000 },
      });
      expect(depositShortage).toEqual({
        depositAmount: 2500,
        bonAmount: 0,
        cashAmount: 3500,
      });

      const creditShortage = getInitialSplitAmounts({
        totalTagihan: 6000,
        isNonMember: false,
        primaryMode: 'store_credit',
        financials: { belanjaBalance: 10000, remainingCreditLimit: 4000 },
      });
      expect(creditShortage).toEqual({
        depositAmount: 0,
        bonAmount: 4000,
        cashAmount: 2000,
      });
    });

    it('rebalances cash and bon safely via applyBonChange and Gunakan Maksimal without exceeding tagihan', () => {
      // Gunakan Maksimal when in store_credit mode with balance < total
      const useMaxStoreCredit = applyDepositChange({
        rawVal: 2000,
        totalTagihan: 6000,
        availableShoppingBalance: 2000,
        maxSafeCreditLimit: 50000,
        currentBon: 6000,
        currentCash: 0,
        primaryMode: 'store_credit',
      });
      expect(useMaxStoreCredit).toEqual({
        depositAmount: 2000,
        bonAmount: 4000,
        cashAmount: 0,
      });

      // Gunakan Maksimal when in deposit mode with balance < total
      const useMaxDepositMode = applyDepositChange({
        rawVal: 2000,
        totalTagihan: 6000,
        availableShoppingBalance: 2000,
        maxSafeCreditLimit: 50000,
        currentBon: 0,
        currentCash: 6000,
        primaryMode: 'deposit',
      });
      expect(useMaxDepositMode).toEqual({
        depositAmount: 2000,
        bonAmount: 0,
        cashAmount: 4000,
      });

      // Adjusting Bon manually rebalances cash and clamps non-cash total to tagihan
      const bonAdjusted = applyBonChange({
        rawVal: 10000,
        totalTagihan: 6000,
        maxSafeCreditLimit: 50000,
        currentDeposit: 2000,
        currentCash: 4000,
      });
      expect(bonAdjusted).toEqual({
        depositAmount: 2000,
        bonAmount: 4000,
        cashAmount: 0,
      });
    });

    it('renders initial store_credit and deposit amounts cleanly in modal markup', () => {
      const bonMarkup = renderToStaticMarkup(
        React.createElement(SplitPaymentModal, {
          isOpen: true,
          onClose: () => {},
          cart: dummyCart,
          total: 6000,
          selectedMember: dummyMember,
          memberId: dummyMember.id,
          isNonMember: false,
          primaryMode: 'store_credit',
          initialFinancials: { belanjaBalance: 10000, remainingCreditLimit: 50000 },
          onConfirm: () => {},
        })
      );
      expect(bonMarkup).toContain('value="6000"');
    });
  });
});
