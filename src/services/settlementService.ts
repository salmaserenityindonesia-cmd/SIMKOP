import { supabase } from '../lib/supabaseClient';
import {
  MEMBER_CLEARANCE_CATEGORY,
  descriptionContainsClearanceMemberNrp,
  formatMemberClearanceCashFlowDescription,
  isMemberClearanceCategory,
  stripResignedNrpPrefix,
} from '../utils/clearanceCashFlowFormat';

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

export interface ProcessClearanceCashFlowOptions {
  member?: { id?: string; nrp?: string | null; nama?: string | null } | null;
  summary?: SettlementSummary | null;
  clearanceTimestamp?: string;
}

function isPostgrestColumnError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

const activeClearanceCashFlowLocks = new Map<string, Promise<boolean>>();

export const settlementService = {
  /**
   * Mengambil data settlement hak dan kewajiban anggota (endpoint-like function)
   */
  async getSettlementByMember(memberId: string): Promise<SettlementSummary> {
    // 1. Hitung saldo simpanan langsung dari mutasi deposit_transactions (Single Source of Truth)
    //    bukan dari kolom cache member_deposits.balance atau RPC lama yang menjumlahkan amount tanpa transaction_type.
    const deposits: DepositSettlementDetail[] = await this._getManualDepositSettlement(memberId);

    const normalizedDeposits: DepositSettlementDetail[] = deposits.map((d: any) => ({
      deposit_name: d.deposit_name || 'Unknown',
      can_be_withdrawn: Boolean(d.can_be_withdrawn),
      total_amount: Math.max(0, Math.round(Number(d.total_amount || 0)))
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
   * Mengambil snapshot komponen kliring (simpanan, kewajiban, identitas anggota) sebelum eksekusi RPC.
   */
  async _resolvePreClearanceSnapshot(
    memberId: string,
    options?: ProcessClearanceCashFlowOptions
  ): Promise<{
    summary: SettlementSummary | null;
    member: { id?: string; nrp?: string | null; nama?: string | null } | null;
  }> {
    let snapshotSummary = options?.summary ?? null;
    let snapshotMember = options?.member ?? null;

    if (!snapshotSummary && supabase && typeof supabase.from === 'function') {
      try {
        const mdRef: any = supabase.from('member_deposits');
        if (mdRef && typeof mdRef.select === 'function') {
          snapshotSummary = await this.getSettlementByMember(memberId);
        }
      } catch {
        snapshotSummary = null;
      }
    }

    if (!snapshotMember && supabase && typeof supabase.from === 'function') {
      try {
        const anggotaRef: any = supabase.from('anggota');
        if (anggotaRef && typeof anggotaRef.select === 'function') {
          const q: any = anggotaRef.select('id, nrp, nama');
          if (q && typeof q.eq === 'function') {
            const eqQ: any = q.eq('id', memberId);
            const mRes: any =
              typeof eqQ?.maybeSingle === 'function'
                ? await eqQ.maybeSingle()
                : typeof eqQ?.single === 'function'
                  ? await eqQ.single()
                  : await eqQ;
            const row = Array.isArray(mRes?.data) ? mRes.data[0] : mRes?.data;
            if (row) {
              snapshotMember = row;
            }
          }
        }
      } catch {
        snapshotMember = null;
      }
    }

    return { summary: snapshotSummary, member: snapshotMember };
  },

  /**
   * Mencatat tepat 1 baris mutasi arus kas kliring anggota keluar (`KLIRING_ANGGOTA_KELUAR`)
   * ke `public.cash_flow` secara idempoten dengan per-member mutex lock dan cek berlapis.
   */
  async recordClearanceCashFlow(params: {
    memberId: string;
    memberNrp?: string | null;
    memberName?: string | null;
    totalSavings: number;
    totalDebtOffset: number;
    netSettlement: number;
    clearanceTimestamp?: string;
  }): Promise<boolean> {
    if (!supabase || typeof supabase.from !== 'function') return false;

    const totalSavings = Math.max(0, Math.round(Number(params.totalSavings || 0)));
    const totalDebtOffset = Math.max(0, Math.round(Number(params.totalDebtOffset || 0)));
    const netSettlement = Math.round(Number(params.netSettlement || 0));
    if (netSettlement === 0) return false;

    const cfTable: any = supabase.from('cash_flow');
    if (!cfTable || typeof cfTable.insert !== 'function') return false;

    const memberKey = String(params.memberId || '').trim();
    if (memberKey && activeClearanceCashFlowLocks.has(memberKey)) {
      await activeClearanceCashFlowLocks.get(memberKey);
      return false;
    }

    const executeRecord = async (): Promise<boolean> => {
      let memberNrp = params.memberNrp ?? null;
      let memberName = params.memberName ?? null;
      if (!memberNrp || !memberName) {
        try {
          const anggotaRef: any = supabase.from('anggota');
          if (anggotaRef && typeof anggotaRef.select === 'function') {
            const q: any = anggotaRef.select('id, nrp, nama');
            if (q && typeof q.eq === 'function') {
              const eqQ: any = q.eq('id', params.memberId);
              const mRes: any =
                typeof eqQ?.maybeSingle === 'function'
                  ? await eqQ.maybeSingle()
                  : typeof eqQ?.single === 'function'
                    ? await eqQ.single()
                    : await eqQ;
              const mData = Array.isArray(mRes?.data) ? mRes.data[0] : mRes?.data;
              if (mData) {
                memberNrp = memberNrp ?? mData.nrp ?? null;
                memberName = memberName ?? mData.nama ?? null;
              }
            }
          }
        } catch {
          // Non-blocking fallback
        }
      }

      // Idempotency guard lapis 1 & 2: cek eksistensi berdasarkan reference_id maupun NRP anggota
      if (typeof cfTable.select === 'function') {
        try {
          const queryByRef = async (cols: string) => {
            const selQ: any = cfTable.select(cols);
            if (selQ && typeof selQ.eq === 'function') {
              return await selQ.eq('reference_id', params.memberId);
            }
            if (selQ && typeof selQ.then === 'function') {
              return await selQ;
            }
            return null;
          };

          let res: any = await queryByRef('id, category, reference_id, description');
          if (res?.error && isPostgrestColumnError(res.error)) {
            res = await queryByRef('id, category, reference_id');
          }
          const rows = Array.isArray(res?.data) ? res.data : [];
          const alreadyRecordedByRef = rows.some(
            (r: any) =>
              String(r?.reference_id || '') === String(params.memberId) &&
              isMemberClearanceCategory(r?.category)
          );
          if (alreadyRecordedByRef) return false;

          const cleanNrp = stripResignedNrpPrefix(memberNrp);
          if (cleanNrp && cleanNrp !== '-') {
            const catSelQ: any = cfTable.select('id, category, reference_id, description');
            let catRes: any = null;
            if (catSelQ && typeof catSelQ.eq === 'function') {
              catRes = await catSelQ.eq('category', MEMBER_CLEARANCE_CATEGORY);
            } else if (catSelQ && typeof catSelQ.then === 'function') {
              catRes = await catSelQ;
            }
            if (!(catRes?.error && isPostgrestColumnError(catRes.error))) {
              const catRows = Array.isArray(catRes?.data) ? catRes.data : [];
              const alreadyRecordedByNrp = catRows.some(
                (r: any) =>
                  isMemberClearanceCategory(r?.category) &&
                  descriptionContainsClearanceMemberNrp(r?.description, memberNrp)
              );
              if (alreadyRecordedByNrp) return false;
            }
          }
        } catch {
          // Non-blocking fallback
        }
      }

      const direction = netSettlement > 0 ? 'out' : 'in';
      const amount = Math.round(Math.abs(netSettlement));
      const description = formatMemberClearanceCashFlowDescription({
        memberNrp,
        memberName,
        totalSavings,
        totalDebtOffset,
        netSettlement,
      });
      const createdAt = params.clearanceTimestamp || new Date().toISOString();

      let insRes: any = await cfTable.insert({
        direction,
        category: MEMBER_CLEARANCE_CATEGORY,
        amount,
        reference_id: params.memberId,
        description,
        created_at: createdAt,
      });

      if (insRes?.error && isPostgrestColumnError(insRes.error)) {
        insRes = await cfTable.insert({
          direction,
          category: MEMBER_CLEARANCE_CATEGORY,
          amount,
          reference_id: params.memberId,
          created_at: createdAt,
        });
      }

      if (insRes?.error) {
        console.warn(
          'Gagal mencatat arus kas kliring anggota keluar:',
          insRes.error?.message || insRes.error
        );
        return false;
      }

      return true;
    };

    if (!memberKey) {
      return executeRecord();
    }

    const lockPromise = executeRecord().finally(() => {
      if (activeClearanceCashFlowLocks.get(memberKey) === lockPromise) {
        activeClearanceCashFlowLocks.delete(memberKey);
      }
    });
    activeClearanceCashFlowLocks.set(memberKey, lockPromise);
    return lockPromise;
  },

  /**
   * Memproses pengunduran diri dengan metode Pelunasan Seketika (Instant Payoff / Surplus)
   */
  async processInstantPayoff(
    memberId: string,
    paymentMethod: string,
    notes: string,
    options ?: ProcessClearanceCashFlowOptions
  ): Promise < boolean > {
    const { summary: snapshotSummary, member: snapshotMember } =
      await this._resolvePreClearanceSnapshot(memberId, options);

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

    if(error) {
      throw new Error(`Gagal memproses kliring pelunasan seketika: ${error.message}`);
    }

    // Melunaskan seluruh sisa jadwal angsuran pinjaman dan mencatat riwayat pelunasan kliring
    await this.settleRemainingLoanSchedules(memberId, paymentMethod, notes);

    // Catat 1 baris mutasi kas keluar/masuk di public.cash_flow (idempoten)
    if(snapshotSummary && Math.round(Number(snapshotSummary.net_settlement || 0)) !== 0) {
      await this.recordClearanceCashFlow({
        memberId,
        memberNrp: snapshotMember?.nrp,
        memberName: snapshotMember?.nama,
        totalSavings: snapshotSummary.total_hak,
        totalDebtOffset: snapshotSummary.total_kewajiban,
        netSettlement: snapshotSummary.net_settlement,
        clearanceTimestamp: options?.clearanceTimestamp,
      }).catch((cfErr) => {
        console.warn('Non-blocking cash_flow clearance warning:', cfErr);
      });
    }

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
  async processClearance(
    memberId: string,
    options ?: ProcessClearanceCashFlowOptions
  ): Promise < boolean > {
    const { summary: snapshotSummary, member: snapshotMember } =
      await this._resolvePreClearanceSnapshot(memberId, options);

    const { data, error } = await supabase.rpc('process_member_clearance', {
      p_member_id: memberId
    });

    if(error) {
      throw new Error(`Gagal memproses kliring pengunduran diri: ${error.message}`);
    }

    // Melunaskan seluruh sisa jadwal angsuran pinjaman
    await this.settleRemainingLoanSchedules(memberId, 'POTONG_SIMPANAN_KLIRING', 'Pelunasan otomatis melalui kliring anggota keluar (legacy)');

    if(snapshotSummary && Math.round(Number(snapshotSummary.net_settlement || 0)) !== 0) {
      await this.recordClearanceCashFlow({
        memberId,
        memberNrp: snapshotMember?.nrp,
        memberName: snapshotMember?.nama,
        totalSavings: snapshotSummary.total_hak,
        totalDebtOffset: snapshotSummary.total_kewajiban,
        netSettlement: snapshotSummary.net_settlement,
        clearanceTimestamp: options?.clearanceTimestamp,
      }).catch((cfErr) => {
        console.warn('Non-blocking legacy cash_flow clearance warning:', cfErr);
      });
    }

    return data ?? true;
  },

  // --- Fallback Manual Methods if SQL Migration is not applied yet ---

  async _getManualDepositSettlement(memberId: string): Promise<DepositSettlementDetail[]> {
    const { data: mdData, error: mdError } = await supabase
      .from('member_deposits')
      .select(`
        id,
        deposit_types (id, code, name, can_be_withdrawn, is_active),
        deposit_transactions (transaction_type, amount)
      `)
      .eq('member_id', memberId);

    if (mdError) throw new Error(mdError.message);
    if (!mdData || mdData.length === 0) return [];

    const memberDepositIds = mdData.map((md: any) => md.id).filter(Boolean);
    const realBalanceMap = new Map<string, number>();

    if (memberDepositIds.length > 0) {
      const { data: txList, error: txError } = await supabase
        .from('deposit_transactions')
        .select('member_deposit_id, transaction_type, amount')
        .in('member_deposit_id', memberDepositIds);

      if (txError) throw new Error(txError.message);

      if (txList && txList.length > 0) {
        for (const tx of txList) {
          const current = realBalanceMap.get(tx.member_deposit_id) || 0;
          const amt = Number(tx.amount || 0);
          if (tx.transaction_type === 'deposit') {
            realBalanceMap.set(tx.member_deposit_id, current + amt);
          } else {
            realBalanceMap.set(tx.member_deposit_id, current - amt);
          }
        }
      } else {
        // Fallback ke relasi deposit_transactions jika query terpisah kosong (misal pada mock unit test)
        for (const md of mdData) {
          const embeddedTxs = (md as any).deposit_transactions || [];
          let sum = 0;
          for (const tx of embeddedTxs) {
            const amt = Number(tx.amount || 0);
            if (!tx.transaction_type || tx.transaction_type === 'deposit') {
              sum += amt;
            } else {
              sum -= amt;
            }
          }
          realBalanceMap.set(md.id, sum);
        }
      }
    }

    const result: DepositSettlementDetail[] = [];
    for (const md of mdData) {
      const typeInfo = Array.isArray(md.deposit_types) ? md.deposit_types[0] : md.deposit_types;
      const realBalance = Math.max(0, Math.round(realBalanceMap.get(md.id) ?? 0));

      const codeUpper = (typeInfo?.code || '').toUpperCase();
      const nameLower = (typeInfo?.name || '').toLowerCase();
      const isCorePokok = codeUpper === 'POKOK' || nameLower.includes('pokok');
      const isActiveType = typeInfo?.is_active !== false;

      // Sertakan semua simpanan bersaldo riil > 0 (termasuk SUKARELA / DD),
      // simpanan pokok, serta jenis simpanan aktif lainnya (seperti Lebaran bersaldo Rp 0).
      if (realBalance > 0 || isCorePokok || isActiveType) {
        result.push({
          deposit_name: typeInfo?.name || 'Unknown',
          can_be_withdrawn: Boolean(typeInfo?.can_be_withdrawn),
          total_amount: realBalance
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
