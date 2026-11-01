import { describe, it, expect } from 'vitest';
import {
  generateMigrationLoanSchedules,
  sanitizeMigrationLoanRow,
  parseAmount,
  parseSafeDate,
  sanitizeBankAccountNumber,
  sanitizeDateString,
} from './memberMigrationParser';

describe('memberMigrationParser - generateMigrationLoanSchedules', () => {
  it('returns empty array when principal <= 0 or tenor <= 0', () => {
    expect(generateMigrationLoanSchedules(0, 12, 0)).toEqual([]);
    expect(generateMigrationLoanSchedules(-1000000, 12, 500000)).toEqual([]);
    expect(generateMigrationLoanSchedules(5000000, 0, 5000000)).toEqual([]);
    expect(generateMigrationLoanSchedules(5000000, -5, 5000000)).toEqual([]);
  });

  it('accurately distributes amortization with rounding adjustment and matches remaining balance', () => {
    const principal = 5000000;
    const tenor = 12;
    const remainingBalance = 2000000;
    const startDate = '2023-01-15';

    const schedules = generateMigrationLoanSchedules(principal, tenor, remainingBalance, startDate);

    expect(schedules).toHaveLength(12);

    // Sum of target amounts must equal principal exactly
    const totalTarget = schedules.reduce((sum, s) => sum + s.target_amount, 0);
    expect(totalTarget).toBe(principal);

    // Sum of paid amounts must equal (principal - remainingBalance)
    const totalPaid = schedules.reduce((sum, s) => sum + s.paid_amount, 0);
    expect(totalPaid).toBe(principal - remainingBalance);

    // Sum of unpaid remainder across all schedules must equal remainingBalance exactly
    const totalUnpaid = schedules.reduce((sum, s) => sum + (s.target_amount - s.paid_amount), 0);
    expect(totalUnpaid).toBe(remainingBalance);

    // Check statuses
    const paidCount = schedules.filter(s => s.status === 'paid').length;
    const partialCount = schedules.filter(s => s.status === 'partial').length;
    const unpaidCount = schedules.filter(s => s.status === 'unpaid').length;

    expect(paidCount).toBeGreaterThan(0);
    expect(unpaidCount).toBeGreaterThan(0);
    expect(partialCount).toBeLessThanOrEqual(1);

    // Sequence check: paid first, then at most one partial, then unpaid
    let foundPartial = false;
    let foundUnpaid = false;
    for (const s of schedules) {
      if (s.status === 'paid') {
        expect(foundPartial).toBe(false);
        expect(foundUnpaid).toBe(false);
        expect(s.paid_amount).toBe(s.target_amount);
      } else if (s.status === 'partial') {
        expect(foundPartial).toBe(false);
        expect(foundUnpaid).toBe(false);
        expect(s.paid_amount).toBeGreaterThan(0);
        expect(s.paid_amount).toBeLessThan(s.target_amount);
        foundPartial = true;
      } else if (s.status === 'unpaid') {
        foundUnpaid = true;
        expect(s.paid_amount).toBe(0);
      }
    }
  });

  it('handles fully paid loan (remainingBalance = 0)', () => {
    const schedules = generateMigrationLoanSchedules(3000000, 6, 0, '2023-06-01');
    expect(schedules).toHaveLength(6);
    expect(schedules.every(s => s.status === 'paid')).toBe(true);
    expect(schedules.every(s => s.paid_amount === s.target_amount)).toBe(true);
    const totalRemaining = schedules.reduce((sum, s) => sum + (s.target_amount - s.paid_amount), 0);
    expect(totalRemaining).toBe(0);
  });

  it('handles completely unpaid loan (remainingBalance = principal)', () => {
    const schedules = generateMigrationLoanSchedules(6000000, 6, 6000000, '2023-06-01');
    expect(schedules).toHaveLength(6);
    expect(schedules.every(s => s.status === 'unpaid')).toBe(true);
    expect(schedules.every(s => s.paid_amount === 0)).toBe(true);
    const totalRemaining = schedules.reduce((sum, s) => sum + (s.target_amount - s.paid_amount), 0);
    expect(totalRemaining).toBe(6000000);
  });

  it('handles partially paid loan with clean installments (e.g. 12.000.000 tenor 12 sisa 5.000.000)', () => {
    const principal = 12000000;
    const tenor = 12;
    const remainingBalance = 5000000;
    const schedules = generateMigrationLoanSchedules(principal, tenor, remainingBalance, '2023-01-01');

    expect(schedules).toHaveLength(12);

    // 7 installments paid (7.000.000)
    for (let i = 0; i < 7; i++) {
      expect(schedules[i].status).toBe('paid');
      expect(schedules[i].paid_amount).toBe(1000000);
      expect(schedules[i].target_amount).toBe(1000000);
    }

    // 5 installments unpaid (5.000.000)
    for (let i = 7; i < 12; i++) {
      expect(schedules[i].status).toBe('unpaid');
      expect(schedules[i].paid_amount).toBe(0);
      expect(schedules[i].target_amount).toBe(1000000);
    }

    const totalUnpaid = schedules.reduce((sum, s) => sum + (s.target_amount - s.paid_amount), 0);
    expect(totalUnpaid).toBe(5000000);

    const hasPartial = schedules.some(s => s.status === 'partial');
    expect(hasPartial).toBe(false);
  });

  it('handles loan with uneven remainder producing exactly one partial schedule', () => {
    const principal = 10000000;
    const tenor = 10; // 1.000.000 per month
    const remainingBalance = 4500000; // paid = 5.500.000 -> 5 paid + 1 partial of 500.000 + 4 unpaid
    const schedules = generateMigrationLoanSchedules(principal, tenor, remainingBalance, '2023-01-01');

    expect(schedules).toHaveLength(10);

    // First 5 periods: paid in full
    for (let i = 0; i < 5; i++) {
      expect(schedules[i].status).toBe('paid');
      expect(schedules[i].paid_amount).toBe(1000000);
    }

    // Period 6: partial (paid 500.000, target 1.000.000)
    expect(schedules[5].period_number).toBe(6);
    expect(schedules[5].status).toBe('partial');
    expect(schedules[5].paid_amount).toBe(500000);
    expect(schedules[5].target_amount).toBe(1000000);

    // Remaining periods 7 to 10: unpaid
    for (let i = 6; i < 10; i++) {
      expect(schedules[i].status).toBe('unpaid');
      expect(schedules[i].paid_amount).toBe(0);
    }

    const totalUnpaid = schedules.reduce((sum, s) => sum + (s.target_amount - s.paid_amount), 0);
    expect(totalUnpaid).toBe(4500000);
  });

  it('absorbs rounding difference on the last period so sum of targets equals principal', () => {
    const principal = 10000000;
    const tenor = 3; // 10.000.000 / 3 = 3.333.333 each month, last period gets 3.333.334
    const remainingBalance = 10000000;
    const schedules = generateMigrationLoanSchedules(principal, tenor, remainingBalance, '2023-01-01');

    expect(schedules).toHaveLength(3);
    expect(schedules[0].target_amount).toBe(3333333);
    expect(schedules[1].target_amount).toBe(3333333);
    expect(schedules[2].target_amount).toBe(3333334);

    const sumTarget = schedules.reduce((sum, s) => sum + s.target_amount, 0);
    expect(sumTarget).toBe(principal);
  });

  it('clamps remaining balance when greater than principal or negative', () => {
    // Greater than principal -> clamped to principal (all unpaid)
    const schedulesOver = generateMigrationLoanSchedules(1000000, 4, 1500000);
    expect(schedulesOver.every(s => s.status === 'unpaid')).toBe(true);

    // Negative -> clamped to 0 (all paid)
    const schedulesNeg = generateMigrationLoanSchedules(1000000, 4, -200000);
    expect(schedulesNeg.every(s => s.status === 'paid')).toBe(true);
  });

  it('handles month-end rollovers correctly, including February leap year', () => {
    const schedules = generateMigrationLoanSchedules(1200000, 4, 600000, '2024-01-31');
    expect(schedules[0].due_date).toBe('2024-02-29'); // Leap year Feb
    expect(schedules[1].due_date).toBe('2024-03-31');
    expect(schedules[2].due_date).toBe('2024-04-30'); // 30-day month
    expect(schedules[3].due_date).toBe('2024-05-31');
  });

  it('handles raw digit string or invalid date by defaulting safely', () => {
    const schedulesRaw = generateMigrationLoanSchedules(1000000, 2, 500000, '10');
    expect(schedulesRaw).toHaveLength(2);
    expect(schedulesRaw[0].due_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('memberMigrationParser - sanitizeMigrationLoanRow', () => {
  it('returns safe fallback for invalid input', () => {
    const res = sanitizeMigrationLoanRow(null);
    expect(res).toEqual({
      bank_account_number: null,
      jumlah_pinjaman: 0,
      tgl_awal_pinjaman: null,
      tenor: 0,
      sisa_pinjaman: 0,
    });
  });

  it('sanitizes valid loan row and caps sisa_pinjaman to jumlah_pinjaman', () => {
    const res = sanitizeMigrationLoanRow({
      bank_account_number: '  0123456789  ',
      jumlah_pinjaman: '5.000.000',
      tgl_awal_pinjaman: '2023-05-10',
      tenor: '12',
      sisa_pinjaman: '6.000.000', // exceeds jumlah_pinjaman!
    });

    expect(res.bank_account_number).toBe('0123456789');
    expect(res.jumlah_pinjaman).toBe(5000000);
    expect(res.tgl_awal_pinjaman).toBe('2023-05-10');
    expect(res.tenor).toBe(12);
    expect(res.sisa_pinjaman).toBe(5000000); // capped
  });

  it('handles edge cases: negative values, tenor 0, and formatted string currencies', () => {
    const resNeg = sanitizeMigrationLoanRow({
      bank_account_number: '9999',
      jumlah_pinjaman: -5000000,
      tgl_awal_pinjaman: '2023-01-01',
      tenor: -10,
      sisa_pinjaman: -1000000,
    });

    expect(resNeg.jumlah_pinjaman).toBe(0);
    expect(resNeg.tenor).toBe(0);
    expect(resNeg.sisa_pinjaman).toBe(0);

    const resTenorZero = sanitizeMigrationLoanRow({
      bank_account_number: '1234',
      jumlah_pinjaman: 5000000,
      tgl_awal_pinjaman: '2023-01-01',
      tenor: 0,
      sisa_pinjaman: 5000000,
    });

    expect(resTenorZero.jumlah_pinjaman).toBe(5000000);
    expect(resTenorZero.tenor).toBe(0);
    expect(resTenorZero.sisa_pinjaman).toBe(5000000);

    const resFormatted = sanitizeMigrationLoanRow({
      bank_account_number: '  123-456-789  ',
      jumlah_pinjaman: 'Rp. 15.000.000,00',
      tgl_awal_pinjaman: '2023-03-15',
      tenor: '24 bulan',
      sisa_pinjaman: 'Rp 7.500.000',
    });

    expect(resFormatted.bank_account_number).toBe('123-456-789');
    expect(resFormatted.jumlah_pinjaman).toBe(15000000);
    expect(resFormatted.tenor).toBe(24);
    expect(resFormatted.sisa_pinjaman).toBe(7500000);
  });

  it('sanitizes bank account number properly', () => {
    expect(sanitizeBankAccountNumber(' - ')).toBeNull();
    expect(sanitizeBankAccountNumber('null')).toBeNull();
    expect(sanitizeBankAccountNumber('undefined')).toBeNull();
    expect(sanitizeBankAccountNumber('')).toBeNull();
    expect(sanitizeBankAccountNumber(987654321)).toBe('987654321');
    expect(sanitizeBankAccountNumber('  BCA 12345 ')).toBe('BCA 12345');
  });

  it('sanitizes date strings including Excel serial dates and raw values', () => {
    expect(sanitizeDateString(new Date('2023-06-15'))).toBe('2023-06-15');
    expect(sanitizeDateString('2023-08-20')).toBe('2023-08-20');
    expect(sanitizeDateString('10')).toBe('10');
    expect(sanitizeDateString(null)).toBeNull();
  });
});
