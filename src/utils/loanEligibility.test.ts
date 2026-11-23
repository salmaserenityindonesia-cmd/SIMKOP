import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_LOAN_AGE_YEARS,
  validateMaxLoanAge,
  validateLoanAgeEligibility,
} from './loanEligibility';

const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

describe('validateMaxLoanAge', () => {
  const refDate = new Date('2026-11-23T00:00:00.000Z');
  const birthDate57YearsAgo = new Date(refDate.getTime() - 57 * MS_PER_YEAR).toISOString();

  it('exports alias validateLoanAgeEligibility matching validateMaxLoanAge', () => {
    expect(validateLoanAgeEligibility).toBe(validateMaxLoanAge);
    expect(DEFAULT_MAX_LOAN_AGE_YEARS).toBe(58);
  });

  it('returns eligible: true when birth date is missing, null, or invalid', () => {
    const missing = validateMaxLoanAge(null, 24, 58, refDate);
    expect(missing).toEqual({
      eligible: true,
      hasBirthDate: false,
      currentAgeYears: null,
      tenorYears: 2,
      projectedEndAgeYears: null,
      maxAgeYears: 58,
      formattedSummary: '',
      errorMessage: null,
    });

    const invalid = validateMaxLoanAge('not-a-date', 6, 58, refDate);
    expect(invalid.eligible).toBe(true);
    expect(invalid.hasBirthDate).toBe(false);
    expect(invalid.tenorYears).toBe(0.5);
  });

  it('returns eligible: true when maxAgeYears <= 0 even if birth date is present', () => {
    const res = validateMaxLoanAge(birthDate57YearsAgo, 36, 0, refDate);
    expect(res.eligible).toBe(true);
    expect(res.hasBirthDate).toBe(true);
    expect(res.projectedEndAgeYears).toBeNull();
    expect(res.errorMessage).toBeNull();
  });

  it('allows 57-year-old member with 6 months tenor (57.5 <= 58)', () => {
    const res = validateMaxLoanAge(birthDate57YearsAgo, 6, 58, refDate);
    expect(res.eligible).toBe(true);
    expect(res.hasBirthDate).toBe(true);
    expect(res.currentAgeYears).toBe(57);
    expect(res.tenorYears).toBe(0.5);
    expect(res.projectedEndAgeYears).toBe(57.5);
    expect(res.errorMessage).toBeNull();
    expect(res.formattedSummary).toContain('Usia 57 Thn 0 Bln + Tenor 6 Bln (0,5 Thn) = 57 Thn 6 Bln');
  });

  it('allows exact boundary where currentAge + tenorYears === maxAgeYears (57 + 12/12 = 58)', () => {
    const res = validateMaxLoanAge(birthDate57YearsAgo, 12, 58, refDate);
    expect(res.eligible).toBe(true);
    expect(res.currentAgeYears).toBe(57);
    expect(res.tenorYears).toBe(1);
    expect(res.projectedEndAgeYears).toBe(58);
    expect(res.errorMessage).toBeNull();
    expect(res.formattedSummary).toContain('Usia 57 Thn 0 Bln + Tenor 12 Bln (1,0 Thn) = 58 Thn 0 Bln');
  });

  it('rejects 57-year-old member with 24 months tenor (59.0 > 58) and provides clear errorMessage', () => {
    const res = validateMaxLoanAge(birthDate57YearsAgo, 24, 58, refDate);
    expect(res.eligible).toBe(false);
    expect(res.currentAgeYears).toBe(57);
    expect(res.tenorYears).toBe(2);
    expect(res.projectedEndAgeYears).toBe(59);
    expect(res.formattedSummary).toBe('Usia 57 Thn 0 Bln + Tenor 24 Bln (2,0 Thn) = 59 Thn 0 Bln');
    expect(res.errorMessage).toContain('Pengajuan ditolak:');
    expect(res.errorMessage).toContain('57,0 thn');
    expect(res.errorMessage).toContain('tenor 24 bulan (2,0 thn)');
    expect(res.errorMessage).toContain('59,0 tahun');
    expect(res.errorMessage).toContain('batas usia maksimal 58 tahun');
  });

  it('handles 3-month store-credit tenor conversion (0.25 years) accurately', () => {
    const birthDate57y10m = new Date(refDate.getTime() - (57 + 10 / 12) * MS_PER_YEAR).toISOString();
    const res = validateMaxLoanAge(birthDate57y10m, 3, 58, refDate);
    expect(res.eligible).toBe(false);
    expect(res.tenorYears).toBe(0.25);
    expect(res.projectedEndAgeYears).toBe(58.1);
    expect(res.formattedSummary).toContain('Tenor 3 Bln (0,25 Thn)');
    expect(res.errorMessage).toContain('(0,25 thn)');
  });
});
