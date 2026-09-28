import { supabase } from '../lib/supabaseClient';

export interface DepositSettlementDetail {
  deposit_name: string;
  can_be_withdrawn: boolean;
  total_amount: number;
}

export interface LoanSettlementDetail {
  loan_id: string;
  loan_number: string | null;
  purpose: string;
  principal_amount: number;
  tenor: number;
  total_paid: number;
  remaining_balance: number;
}

export interface SettlementSummary {
  member_id: string;
  total_hak: number;
  total_kewajiban: number;
  net_settlement: number;
  deposit_details: DepositSettlementDetail[];
  loan_details: LoanSettlementDetail[];
}

export const settlementService = {
  /**
   * Mengambil data settlement hak dan kewajiban anggota (endpoint-like function)
   */
  async getSettlementByMember(memberId: string): Promise<SettlementSummary> {
    // 1. Fetch deposit settlement via RPC (or we can just fetch and calculate manually if RPC is not deployed)
    const { data: depositData, error: depositError } = await supabase.rpc('get_member_deposit_settlement', {
      p_member_id: memberId
    });

    // Fallback to manual calculation if RPC is missing (e.g., migration not run)
    let deposits: DepositSettlementDetail[] = depositData || [];
    if (depositError && depositError.code === '42883') { // function does not exist
      console.warn('RPC get_member_deposit_settlement not found. Falling back to manual calculation.');
      deposits = await this._getManualDepositSettlement(memberId);
    } else if (depositError) {
      throw new Error(`Gagal mengambil rincian simpanan: ${depositError.message}`);
    }

    // 2. Fetch loan settlement via RPC
    const { data: loanData, error: loanError } = await supabase.rpc('get_member_loan_settlement', {
      p_member_id: memberId
    });

    let loans: LoanSettlementDetail[] = loanData || [];
    if (loanError && loanError.code === '42883') {
      console.warn('RPC get_member_loan_settlement not found. Falling back to manual calculation.');
      loans = await this._getManualLoanSettlement(memberId);
    } else if (loanError) {
      throw new Error(`Gagal mengambil rincian pinjaman: ${loanError.message}`);
    }

    // 3. Calculate totals
    const total_hak = deposits.reduce((sum, d) => sum + Number(d.total_amount), 0);
    const total_kewajiban = loans.reduce((sum, l) => sum + Number(l.remaining_balance), 0);
    const net_settlement = total_hak - total_kewajiban;

    return {
      member_id: memberId,
      total_hak,
      total_kewajiban,
      net_settlement,
      deposit_details: deposits,
      loan_details: loans
    };
  },

  /**
   * Memproses pengunduran diri dan kliring via RPC
   */
  async processClearance(memberId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('process_member_clearance', {
      p_member_id: memberId
    });

    if (error) {
      throw new Error(`Gagal memproses kliring pengunduran diri: ${error.message}`);
    }

    return data;
  },

  // --- Fallback Manual Methods if SQL Migration is not applied yet ---

  async _getManualDepositSettlement(memberId: string): Promise<DepositSettlementDetail[]> {
    const { data: mdData, error: mdError } = await supabase
      .from('member_deposits')
      .select(`
        id, 
        deposit_types (name, can_be_withdrawn),
        deposit_transactions (amount)
      `)
      .eq('member_id', memberId);

    if (mdError) throw new Error(mdError.message);

    const result: DepositSettlementDetail[] = [];
    if (mdData) {
      for (const md of mdData) {
        const typeInfo = Array.isArray(md.deposit_types) ? md.deposit_types[0] : md.deposit_types;
        const txs = md.deposit_transactions || [];
        const total = txs.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
        
        result.push({
          deposit_name: typeInfo?.name || 'Unknown',
          can_be_withdrawn: typeInfo?.can_be_withdrawn || false,
          total_amount: total
        });
      }
    }
    return result;
  },

  async _getManualLoanSettlement(memberId: string): Promise<LoanSettlementDetail[]> {
    const { data: lData, error: lError } = await supabase
      .from('loans')
      .select(`
        id, loan_number, notes, amount, tenor,
        loan_repayments (amount_paid)
      `)
      .eq('member_id', memberId)
      .in('status', ['approved', 'active']);

    if (lError) throw new Error(lError.message);

    const result: LoanSettlementDetail[] = [];
    if (lData) {
      for (const loan of lData) {
        const reps = loan.loan_repayments || [];
        const total_paid = reps.reduce((sum: number, r: any) => sum + Number(r.amount_paid || 0), 0);
        
        result.push({
          loan_id: loan.id,
          loan_number: loan.loan_number,
          purpose: loan.notes || '-',
          principal_amount: Number(loan.amount),
          tenor: Number(loan.tenor),
          total_paid,
          remaining_balance: Number(loan.amount) - total_paid
        });
      }
    }
    return result;
  }
};
