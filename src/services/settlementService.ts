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

    const normalizedDeposits: DepositSettlementDetail[] = deposits.map((d: any) => ({
      deposit_name: d.deposit_name || 'Unknown',
      can_be_withdrawn: Boolean(d.can_be_withdrawn),
      total_amount: Math.max(0, Number(d.total_amount || 0))
    }));

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

    // Normalisasi nilai pinjaman menjadi nilai positif mutlak (mencegah bug double negation)
    const normalizedLoans: LoanSettlementDetail[] = loans.map((l: any) => ({
      loan_id: l.loan_id || l.id,
      loan_number: l.loan_number ?? null,
      purpose: l.purpose || l.notes || '-',
      principal_amount: Math.max(0, Math.abs(Number(l.principal_amount || l.amount || 0))),
      tenor: Number(l.tenor || 0),
      total_paid: Math.max(0, Math.abs(Number(l.total_paid || 0))),
      remaining_balance: Math.max(0, Math.abs(Number(l.remaining_balance || 0)))
    }));

    // 3. Calculate totals
    const total_hak = normalizedDeposits.reduce((sum, d) => sum + Number(d.total_amount), 0);
    const total_kewajiban = normalizedLoans.reduce((sum, l) => sum + Math.max(0, Math.abs(Number(l.remaining_balance || 0))), 0);
    const net_settlement = total_hak - total_kewajiban;

    return {
      member_id: memberId,
      total_hak,
      total_kewajiban,
      net_settlement,
      deposit_details: normalizedDeposits,
      loan_details: normalizedLoans
    };
  },

  /**
   * Melunaskan seluruh sisa jadwal angsuran pinjaman aktif anggota dan mencatat riwayat pelunasannya
   */
  async settleRemainingLoanSchedules(
    memberId: string,
    paymentMethod: string = 'POTONG_SIMPANAN_KLIRING',
    notes: string = 'Pelunasan otomatis melalui kliring anggota keluar (net settlement)'
  ): Promise<void> {
    if (!supabase || typeof supabase.from !== 'function') return;

    // 1. Ambil pinjaman aktif anggota (status IN 'active', 'approved', 'draft')
    // juga sertakan 'completed' bila status pinjaman telah diubah oleh RPC namun jadwal belum selesai
    const { data: activeLoans, error: loanErr } = await supabase
      .from('loans')
      .select('id, amount, principal_amount, status')
      .eq('member_id', memberId)
      .in('status', ['active', 'approved', 'draft', 'completed']);

    if (loanErr || !activeLoans || activeLoans.length === 0) return;

    for (const loan of activeLoans) {
      // 2. Ambil seluruh jadwal angsuran yang belum lunas
      const { data: unpaidSchedules, error: schedErr } = await supabase
        .from('loan_schedules')
        .select('id, loan_id, period_number, target_amount, paid_amount, status')
        .eq('loan_id', loan.id)
        .in('status', ['unpaid', 'partial']);

      if (schedErr) {
        console.warn(`Gagal mengambil jadwal angsuran pinjaman ${loan.id}:`, schedErr.message);
        continue;
      }

      if (unpaidSchedules && unpaidSchedules.length > 0) {
        for (const sched of unpaidSchedules) {
          const target = Math.max(0, Number(sched.target_amount || 0));
          const currentPaid = Math.max(0, Number(sched.paid_amount || 0));
          const sisa = Math.max(0, target - currentPaid);

          // Update jadwal angsuran menjadi lunas (paid)
          await supabase
            .from('loan_schedules')
            .update({
              paid_amount: target,
              status: 'paid'
            })
            .eq('id', sched.id);

          // Masukkan catatan pembayaran di loan_repayments jika terdapat sisa yang dilunasi
          if (sisa > 0) {
            const repayEntry: any = {
              loan_id: loan.id,
              schedule_id: sched.id,
              amount_paid: sisa,
              payment_method: paymentMethod || 'POTONG_SIMPANAN_KLIRING',
              notes: notes || 'Pelunasan otomatis melalui kliring anggota keluar (net settlement)',
              payment_date: new Date().toISOString(),
              created_at: new Date().toISOString()
            };

            const { error: insErr } = await supabase.from('loan_repayments').insert(repayEntry);
            if (insErr) {
              // Fallback tanpa created_at jika skema tabel belum memiliki kolom created_at
              await supabase.from('loan_repayments').insert({
                loan_id: repayEntry.loan_id,
                schedule_id: repayEntry.schedule_id,
                amount_paid: repayEntry.amount_paid,
                payment_method: repayEntry.payment_method,
                payment_date: repayEntry.payment_date,
                notes: repayEntry.notes
              });
            }
          }
        }
      }

      // Update data pinjaman induk di tabel loans: status = 'completed', sisa_pinjaman = 0
      await supabase
        .from('loans')
        .update({
          status: 'completed',
          sisa_pinjaman: 0
        })
        .eq('id', loan.id);
    }
  },

  /**
   * Memproses pengunduran diri dengan metode Pelunasan Seketika (Instant Payoff / Surplus)
   */
  async processInstantPayoff(memberId: string, paymentMethod: string, notes: string): Promise<boolean> {
    // Requires authenticated user id to be passed to RPC, but Supabase auth.uid() handles it in RPC if needed.
    // We pass NULL for p_processed_by since the RPC will use auth.uid() internally if we rewrite it,
    // or we can just fetch session.
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const { data, error } = await supabase.rpc('process_instant_payoff_clearance', {
      p_member_id: memberId,
      p_payment_method: paymentMethod,
      p_notes: notes,
      p_processed_by: userId
    });

    if (error) {
      throw new Error(`Gagal memproses kliring pelunasan seketika: ${error.message}`);
    }

    // Melunaskan seluruh sisa jadwal angsuran pinjaman dan mencatat riwayat pelunasan kliring
    await this.settleRemainingLoanSchedules(memberId, paymentMethod, notes);

    return data ?? true;
  },

  /**
   * Memproses pengunduran diri dengan metode Transisi Piutang Eks-Anggota
   */
  async processDebtorTransition(memberId: string, notes: string): Promise<boolean> {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || null;

    const { data, error } = await supabase.rpc('process_debtor_transition_clearance', {
      p_member_id: memberId,
      p_notes: notes,
      p_processed_by: userId
    });

    if (error) {
      throw new Error(`Gagal memproses transisi piutang: ${error.message}`);
    }

    return data;
  },

  /**
   * (Legacy/Deprecated) Memproses pengunduran diri dan kliring via RPC lama
   */
  async processClearance(memberId: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('process_member_clearance', {
      p_member_id: memberId
    });

    if (error) {
      throw new Error(`Gagal memproses kliring pengunduran diri: ${error.message}`);
    }

    // Melunaskan seluruh sisa jadwal angsuran pinjaman
    await this.settleRemainingLoanSchedules(memberId, 'POTONG_SIMPANAN_KLIRING', 'Pelunasan otomatis melalui kliring anggota keluar (legacy)');

    return data ?? true;
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
          can_be_withdrawn: Boolean(typeInfo?.can_be_withdrawn),
          total_amount: Math.max(0, total)
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
        const total_paid = reps.reduce((sum: number, r: any) => sum + Math.max(0, Number(r.amount_paid || 0)), 0);
        const principal = Math.max(0, Math.abs(Number((loan as any).principal_amount || loan.amount || 0)));
        const remaining_balance = Math.max(0, principal - total_paid);
        
        result.push({
          loan_id: loan.id,
          loan_number: loan.loan_number || null,
          purpose: loan.notes || '-',
          principal_amount: principal,
          tenor: Number(loan.tenor || 0),
          total_paid,
          remaining_balance
        });
      }
    }
    return result;
  }
};
