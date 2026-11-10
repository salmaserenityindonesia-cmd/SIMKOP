import { loanService } from './loanService';

/**
 * Service untuk manajemen jadwal dan rekonsiliasi pinjaman (Loan Schedules)
 */
export * from './loanMatrixService';

export const paySchedule = (
  loanId: string,
  scheduleId: string,
  paymentAmount: number,
  paymentMethod: string = 'CASH',
  notes?: string,
  receiptNumber?: string
) => loanService.paySchedule(loanId, scheduleId, paymentAmount, paymentMethod, notes, receiptNumber);

