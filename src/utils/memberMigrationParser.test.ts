import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  generateMigrationLoanSchedules,
  sanitizeMigrationLoanRow,
  parseAmount,
  parseSafeDate,
  sanitizeBankAccountNumber,
  sanitizeDateString,
  computeReverseWajibBreakdown,
  REQUIRED_MEMBER_HEADERS,
  validateMemberImportHeaders,
  buildMemberImportTemplateWorkbook,
  parseMemberImportExcel,
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

describe('memberMigrationParser - computeReverseWajibBreakdown', () => {
  const tiers = [
    {
      startYear: 2024,
      startMonth: 1,
      endYear: 2025,
      endMonth: 10,
      monthlyAmount: 150000,
    },
    {
      startYear: 2025,
      startMonth: 11,
      endYear: null,
      endMonth: null,
      monthlyAmount: 200000,
    },
  ];

  it('correctly calculates reverse breakdown from current date back to join date with zero difference', () => {
    // Current date: 2026-11-15 (Nov 2026)
    // Joined: 2025-10-01 (Oct 2025)
    // Breakdown months:
    // 2026: Nov, Oct, Sep, Aug, Jul, Jun, May, Apr, Mar, Feb, Jan (11 months @ 200k = 2,200,000)
    // 2025: Dec, Nov (2 months @ 200k = 400,000)
    // 2025: Oct (1 month @ 150k = 150,000)
    // Total months: 14 months, calculatedTotal = 2,750,000
    const fakeNow = new Date(2026, 10, 15); // Nov 2026
    const res = computeReverseWajibBreakdown('2025-10-01', 2750000, tiers, fakeNow);

    expect(res.monthsCount).toBe(14);
    expect(res.calculatedTotal).toBe(2750000);
    expect(res.excelWajibAmount).toBe(2750000);
    expect(res.difference).toBe(0);
    expect(res.hasDifference).toBe(false);
    expect(res.isPre2020Member).toBe(false);
    expect(res.pre2020LumpSum).toBe(0);

    // Verify reverse order: starts with Nov 2026, ends with Oct 2025
    expect(res.monthlyBreakdown[0]).toEqual({ year: 2026, month: 11, amount: 200000 });
    expect(res.monthlyBreakdown[13]).toEqual({ year: 2025, month: 10, amount: 150000 });
  });

  it('detects positive and negative difference for members joined after 2020', () => {
    const fakeNow = new Date(2026, 10, 15); // Nov 2026
    // Joined 2026-09-01 -> Sept, Oct, Nov 2026 = 3 months @ 200k = 600,000
    
    // Case 1: Excel has excess (800,000 vs 600,000)
    const excessRes = computeReverseWajibBreakdown('2026-09-01', 800000, tiers, fakeNow);
    expect(excessRes.monthsCount).toBe(3);
    expect(excessRes.calculatedTotal).toBe(600000);
    expect(excessRes.difference).toBe(200000);
    expect(excessRes.hasDifference).toBe(true);

    // Case 2: Excel has deficit (500,000 vs 600,000)
    const deficitRes = computeReverseWajibBreakdown('2026-09-01', 500000, tiers, fakeNow);
    expect(deficitRes.difference).toBe(-100000);
    expect(deficitRes.hasDifference).toBe(true);
  });

  it('handles pre-2020 members by stopping breakdown at Jan 2020 and storing remainder as lump sum', () => {
    // Current date: 2020-03-01
    // Tiers: default fallback @ 200,000
    // Joined: 2015-05-10 (pre-2020)
    // Breakdown >= 2020: Jan 2020, Feb 2020, Mar 2020 = 3 months @ 200,000 = 600,000
    // Total in Excel: 5,000,000
    // Remaining for pre-2020 lump sum: 5,000,000 - 600,000 = 4,400,000
    const fakeNow = new Date(2020, 2, 15); // March 2020
    const res = computeReverseWajibBreakdown('2015-05-10', 5000000, [], fakeNow);

    expect(res.isPre2020Member).toBe(true);
    expect(res.monthsCount).toBe(3);
    expect(res.calculatedTotal).toBe(600000);
    expect(res.pre2020LumpSum).toBe(4400000);
    expect(res.difference).toBe(0);
    expect(res.hasDifference).toBe(false);

    // Check oldest month in breakdown is Jan 2020
    expect(res.monthlyBreakdown[res.monthlyBreakdown.length - 1]).toEqual({
      year: 2020,
      month: 1,
      amount: 200000,
    });
  });

  it('detects deficit for pre-2020 members if Excel amount is lower than breakdown >= 2020', () => {
    const fakeNow = new Date(2020, 2, 15); // March 2020 -> 3 months = 600,000
    const res = computeReverseWajibBreakdown('2015-05-10', 400000, [], fakeNow);

    expect(res.isPre2020Member).toBe(true);
    expect(res.calculatedTotal).toBe(600000);
    expect(res.pre2020LumpSum).toBe(0);
    expect(res.difference).toBe(-200000);
    expect(res.hasDifference).toBe(true);
  });

  it('handles null or invalid join dates gracefully', () => {
    const res = computeReverseWajibBreakdown(null, 100000, tiers);
    expect(res.monthsCount).toBe(1);
    expect(res.isPre2020Member).toBe(false);
  });
});

describe('memberMigrationParser - Strict Header Validation & parseMemberImportExcel', () => {
  it('accepts valid 6-column member headers (case-insensitive & trimmed)', () => {
    const result = validateMemberImportHeaders([
      ' NRP ',
      'Nama',
      'PANGKAT',
      'bank_account_number',
      'membership_status',
      'tgl_awal_anggota',
    ]);
    expect(result).toEqual([...REQUIRED_MEMBER_HEADERS]);
  });

  it('rejects Initial Savings template with specific cross-file error message', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Simpanan');
    ws.addRow([
      'nrp',
      'nama',
      'jumlah_simpanan_pokok',
      'jumlah_simpanan_wajib',
      'jumlah_simpanan_belanja',
      'jumlah_simpanan_lebaran',
    ]);
    ws.addRow(['12345678', 'Budi Santoso', 100000, 500000, 0, 0]);
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseMemberImportExcel(buffer as ArrayBuffer)).rejects.toThrow(
      /template "Saldo Awal Simpanan".*tombol hijau "Saldo Awal Simpanan"/
    );
  });

  it('rejects Initial Loans template with specific cross-file error message', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Saldo Awal Pinjaman');
    ws.addRow([
      'nrp',
      'nama',
      'jenis_pinjaman',
      'jumlah_pinjaman',
      'tgl_awal_pinjaman',
      'nilai_angsuran',
      'tenor',
      'total_terangsur',
    ]);
    ws.addRow(['12345678', 'Budi Santoso', 'REG', 5000000, '2026-01-01', 500000, 10, 1000000]);
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseMemberImportExcel(buffer as ArrayBuffer)).rejects.toThrow(
      /template "Saldo Awal Pinjaman".*tombol kuning "Saldo Awal Pinjaman"/
    );
  });

  it('rejects incomplete headers with exact missing column names', async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Sheet1');
    ws.addRow(['nrp', 'nama', 'pangkat']);
    ws.addRow(['12345678', 'Budi Santoso', 'Aipda']);
    const buffer = await workbook.xlsx.writeBuffer();

    await expect(parseMemberImportExcel(buffer as ArrayBuffer)).rejects.toThrow(
      /Header kolom tidak sesuai template Data Anggota\. Kolom yang kurang: bank_account_number, membership_status, tgl_awal_anggota/
    );
  });

  it('builds and parses the 6-column member import template with zeroed savings/loan balances', async () => {
    const wb = await buildMemberImportTemplateWorkbook();
    const buffer = await wb.xlsx.writeBuffer();
    const rows = await parseMemberImportExcel(buffer as ArrayBuffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nrp: '95168420',
      nama: 'Budi Santoso',
      pangkat: 'Aipda',
      bank_account_number: '367800973556',
      membership_status: 'ACTIVE',
      tgl_awal_anggota: '2026-11-13',
      jumlah_simpanan_pokok: 0,
      jumlah_simpanan_wajib: 0,
      jumlah_simpanan_belanja: 0,
      jumlah_simpanan_lebaran: 0,
      jumlah_pinjaman: 0,
      tenor: 0,
      sisa_pinjaman: 0,
    });
  });
});
