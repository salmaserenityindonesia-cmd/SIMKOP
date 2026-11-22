import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  formatBirthDate,
  formatTanggalLahir,
  formatTanggalLahirLong,
  formatTanggalLahirWithAge,
  hitungUsia,
  parseBirthDateInput,
} from './dateUtils';

describe('dateUtils', () => {
  describe('parseBirthDateInput', () => {
    it('returns null for empty or invalid values', () => {
      expect(parseBirthDateInput(null)).toBeNull();
      expect(parseBirthDateInput(undefined)).toBeNull();
      expect(parseBirthDateInput('')).toBeNull();
      expect(parseBirthDateInput('   ')).toBeNull();
      expect(parseBirthDateInput('-')).toBeNull();
      expect(parseBirthDateInput('null')).toBeNull();
      expect(parseBirthDateInput('Sertu')).toBeNull();
      expect(parseBirthDateInput('2020-02-30')).toBeNull();
      expect(parseBirthDateInput('31/02/1990')).toBeNull();
      expect(parseBirthDateInput(new Date('invalid'))).toBeNull();
    });

    it('parses ISO YYYY-MM-DD and YYYY/MM/DD strings', () => {
      expect(parseBirthDateInput('1985-05-20')).toBe('1985-05-20');
      expect(parseBirthDateInput('1985/5/2')).toBe('1985-05-02');
      expect(parseBirthDateInput('1983-08-15T00:00:00.000Z')).toBe('1983-08-15');
    });

    it('parses DD/MM/YYYY and DD-MM-YYYY strings', () => {
      expect(parseBirthDateInput('20/05/1985')).toBe('1985-05-20');
      expect(parseBirthDateInput('5-8-1983')).toBe('1983-08-05');
      expect(parseBirthDateInput('15/08/1983 (43 Thn)')).toBe('1983-08-15');
      expect(parseBirthDateInput('15/08/1983 (43 Tahun)')).toBe('1983-08-15');
    });

    it('parses Excel serial numbers including pre-1970 and stringified serials', () => {
      expect(parseBirthDateInput(31187)).toBe('1985-05-20');
      expect(parseBirthDateInput('31187')).toBe('1985-05-20');
      // Pre-1970 birth date: 1965-01-01 -> Excel serial 23743
      expect(parseBirthDateInput(23743)).toBe('1965-01-01');
    });

    it('parses Date objects without UTC midnight day-shift', () => {
      expect(parseBirthDateInput(new Date(Date.UTC(1985, 4, 20)))).toBe('1985-05-20');
      expect(parseBirthDateInput(new Date(1983, 7, 15, 10, 30, 0))).toBe('1983-08-15');
    });
  });

  describe('formatTanggalLahir & formatTanggalLahirLong', () => {
    it('formats valid birth dates and falls back to "-" for missing values', () => {
      expect(formatTanggalLahir('1983-08-15')).toBe('15/08/1983');
      expect(formatBirthDate('1983-08-15')).toBe('15/08/1983');
      expect(formatTanggalLahirLong('1983-08-15')).toBe('15 Agustus 1983');
      expect(formatTanggalLahir(null)).toBe('-');
      expect(formatTanggalLahirLong(undefined)).toBe('-');
    });
  });

  describe('hitungUsia & formatTanggalLahirWithAge', () => {
    it('calculates exact completed years before, on, and after birthday', () => {
      expect(hitungUsia('1983-08-15', new Date(2026, 7, 14))).toBe(42);
      expect(hitungUsia('1983-08-15', new Date(2026, 7, 15))).toBe(43);
      expect(calculateAge('1983-08-15', new Date(2026, 10, 22))).toBe(43);
      expect(hitungUsia(null)).toBeNull();
    });

    it('formats short and long birth date with age', () => {
      const ref = new Date(2026, 10, 22);
      expect(formatTanggalLahirWithAge('1983-08-15', { referenceDate: ref })).toBe(
        '15/08/1983 (43 Thn)'
      );
      expect(formatTanggalLahirWithAge('1983-08-15', { long: true, referenceDate: ref })).toBe(
        '15 Agustus 1983 (43 Tahun)'
      );
      expect(formatTanggalLahirWithAge(null, { referenceDate: ref })).toBe('-');
    });
  });
});
