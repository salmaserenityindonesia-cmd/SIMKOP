import { describe, it, expect } from 'vitest';
import { calculateExcelDatedifMonths } from './memberExcelService';

describe('calculateExcelDatedifMonths (Excel DATEDIF "m")', () => {
  it('should return 10 months for 2025-12-08 to 2026-11-01 (day has not reached 8)', () => {
    const start = new Date('2025-12-08');
    const end = new Date('2026-11-01');
    expect(calculateExcelDatedifMonths(start, end)).toBe(10);
  });

  it('should return 11 months for 2025-12-08 to 2026-11-08 (day has reached 8)', () => {
    const start = new Date('2025-12-08');
    const end = new Date('2026-11-08');
    expect(calculateExcelDatedifMonths(start, end)).toBe(11);
  });

  it('should return 11 months for 2025-12-08 to 2026-11-20 (day past 8)', () => {
    const start = new Date('2025-12-08');
    const end = new Date('2026-11-20');
    expect(calculateExcelDatedifMonths(start, end)).toBe(11);
  });

  it('should support string date inputs', () => {
    expect(calculateExcelDatedifMonths('2025-12-08', '2026-11-01')).toBe(10);
  });

  it('should fallback to 1 month if start date is in the future or invalid', () => {
    expect(calculateExcelDatedifMonths('invalid-date', '2026-11-01')).toBe(1);
    expect(calculateExcelDatedifMonths('2027-01-01', '2026-11-01')).toBe(1);
  });

  it('should return 1 month when difference is 0 months', () => {
    expect(calculateExcelDatedifMonths('2026-11-01', '2026-11-05')).toBe(1);
  });
});
