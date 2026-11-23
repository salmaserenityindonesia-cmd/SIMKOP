export const DEFAULT_MAX_LOAN_AGE_YEARS = 58;

const MS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

export interface LoanAgeValidationResult {
  eligible: boolean;
  hasBirthDate: boolean;
  currentAgeYears: number | null;
  tenorYears: number;
  projectedEndAgeYears: number | null;
  maxAgeYears: number;
  formattedSummary: string;
  errorMessage: string | null;
}

function splitYearsAndMonths(decimalYears: number): { years: number; months: number } {
  const safeYears = Math.max(0, decimalYears);
  let years = Math.floor(safeYears);
  let months = Math.round((safeYears - years) * 12);
  if (months >= 12) {
    years += 1;
    months = 0;
  }
  return { years, months };
}

function formatIndonesianDecimal(value: number, fractionDigits: number = 1): string {
  return value.toFixed(fractionDigits).replace('.', ',');
}

/**
 * Validates whether a member's current age plus converted loan/store-credit tenor (months / 12)
 * stays within the RAT maximum loan completion age limit.
 */
export function validateMaxLoanAge(
  tanggalLahir: string | null | undefined,
  tenorMonths: number,
  maxAgeYears: number = DEFAULT_MAX_LOAN_AGE_YEARS,
  referenceDate: Date = new Date()
): LoanAgeValidationResult {
  const safeTenorMonths = Math.max(0, Number(tenorMonths) || 0);
  const rawTenorYears = safeTenorMonths / 12;
  const tenorYears = Math.round(rawTenorYears * 100) / 100;

  if (!maxAgeYears || maxAgeYears <= 0 || !tanggalLahir) {
    return {
      eligible: true,
      hasBirthDate: Boolean(tanggalLahir),
      currentAgeYears: null,
      tenorYears,
      projectedEndAgeYears: null,
      maxAgeYears,
      formattedSummary: '',
      errorMessage: null,
    };
  }

  const birthDate = new Date(tanggalLahir);
  if (isNaN(birthDate.getTime())) {
    return {
      eligible: true,
      hasBirthDate: false,
      currentAgeYears: null,
      tenorYears,
      projectedEndAgeYears: null,
      maxAgeYears,
      formattedSummary: '',
      errorMessage: null,
    };
  }

  const diffMs = referenceDate.getTime() - birthDate.getTime();
  const rawCurrentAgeYears = Math.max(0, diffMs / MS_PER_YEAR);
  const rawProjectedEndAgeYears = rawCurrentAgeYears + rawTenorYears;
  const eligible = rawProjectedEndAgeYears <= maxAgeYears;

  const currentAgeYears = Math.round(rawCurrentAgeYears * 10) / 10;
  const projectedEndAgeYears = Math.round(rawProjectedEndAgeYears * 10) / 10;

  const currentSplit = splitYearsAndMonths(rawCurrentAgeYears);
  const projectedSplit = splitYearsAndMonths(rawProjectedEndAgeYears);
  const tenorYearsDisplay = formatIndonesianDecimal(tenorYears, Number.isInteger(tenorYears * 10) ? 1 : 2);

  const formattedSummary = `Usia ${currentSplit.years} Thn ${currentSplit.months} Bln + Tenor ${safeTenorMonths} Bln (${tenorYearsDisplay} Thn) = ${projectedSplit.years} Thn ${projectedSplit.months} Bln`;

  const currAgeStr = formatIndonesianDecimal(currentAgeYears, 1);
  const projAgeStr = formatIndonesianDecimal(projectedEndAgeYears, 1);
  const errorMessage = !eligible
    ? `Pengajuan ditolak: Usia anggota saat ini (${currAgeStr} thn) + tenor ${safeTenorMonths} bulan (${tenorYearsDisplay} thn) = ${projAgeStr} tahun, melebihi batas usia maksimal ${maxAgeYears} tahun sesuai kebijakan RAT.`
    : null;

  return {
    eligible,
    hasBirthDate: true,
    currentAgeYears,
    tenorYears,
    projectedEndAgeYears,
    maxAgeYears,
    formattedSummary,
    errorMessage,
  };
}

export const validateLoanAgeEligibility = validateMaxLoanAge;
