// File: src/types/loan.ts
// Kontrak tipe data untuk RPC Transaksi Atomic Pinjaman Supabase

export interface ApproveLoanRpcPayload {
  p_loan_id: string;
  p_start_date: string;
}

export interface ApproveLoanRpcResponse {
  success: boolean;
  id?: string;
  member_id?: string;
  status?: string;
  disbursed_at?: string;
  amount?: number;
  tenor?: number;
  monthly_target?: number;
  schedules_count?: number;
  message?: string;
}

export interface RecordLoanRepaymentRpcPayload {
  p_loan_id: string;
  p_amount_paid: number;
  p_payment_method: string;
  p_schedule_id?: string | null;
  p_notes?: string | null;
  p_receipt_number?: string | null;
}

export interface RecordLoanRepaymentRpcResponse {
  success: boolean;
  newStatus?: 'unpaid' | 'partial' | 'paid';
  newPaidTotal?: number;
  sisaPinjaman?: number;
  isAllPaid?: boolean;
  excess_amount?: number;
  repayment_id?: string;
  receipt_number?: string;
  message?: string;
}

export interface PayScheduleResult {
  success: boolean;
  newStatus?: 'unpaid' | 'partial' | 'paid';
  newPaidTotal?: number;
  sisaPinjaman?: number;
  isAllPaid?: boolean;
  repaymentId?: string;
  receiptNumber?: string;
}

export interface MakePaymentResult {
  success: boolean;
  excess_amount?: number;
  sisaPinjaman?: number;
  isAllPaid?: boolean;
}

