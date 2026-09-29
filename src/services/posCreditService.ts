import { supabase } from '../lib/supabaseClient';

export interface MemberFinancials {
  belanjaBalance: number;
  remainingCreditLimit: number;
  thpSafetyThreshold: number;
}

export const getMemberFinancials = async (memberId: string): Promise<MemberFinancials> => {
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // 1. Get member's THP
  const { data: member } = await supabase
    .from('anggota')
    .select('take_home_pay')
    .eq('id', memberId)
    .single();
    
  const thp = Number(member?.take_home_pay || 0);

  // 2. Get active Simpanan Belanja balance
  // Find "Simpanan Belanja" deposit type id
  const { data: dTypes } = await supabase.from('deposit_types').select('id, name, default_amount').ilike('name', '%belanja%');
  const belanjaType = dTypes?.[0];
  
  let belanjaBalance = 0;
  if (belanjaType) {
    const { data: txs } = await supabase
      .from('deposit_transactions')
      .select('amount, transaction_type, member_deposits!inner(member_id)')
      .eq('member_deposits.member_id', memberId)
      .eq('member_deposits.deposit_type_id', belanjaType.id);

    if (txs) {
      belanjaBalance = txs.reduce((acc, tx) => {
        return tx.transaction_type === 'deposit' ? acc + Number(tx.amount) : acc - Number(tx.amount);
      }, 0);
    }
  }

  // 3. Get monthly obligations (Cicilan)
  // Cicilan bulan ini
  let cicilanBulanIni = 0;
  const { data: schedules } = await supabase
    .from('loan_schedules')
    .select('target_amount, paid_amount, loan:loans!inner(member_id)')
    .eq('loan.member_id', memberId)
    .gte('due_date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`)
    .lte('due_date', `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`);

  if (schedules) {
    cicilanBulanIni = schedules.reduce((acc, sched) => acc + (Number(sched.target_amount) - Number(sched.paid_amount)), 0);
  }

  // 4. Beban Simpanan Rutin (Wajib & Belanja)
  // Let's just fetch all active deposit types for the member
  let simpananRutin = 0;
  const { data: activeDeposits } = await supabase
    .from('member_deposits')
    .select('deposit_type:deposit_types(default_amount)')
    .eq('member_id', memberId)
    .eq('is_active', true);

  if (activeDeposits) {
    simpananRutin = activeDeposits.reduce((acc, md: any) => acc + Number(md.deposit_type?.default_amount || 0), 0);
  }

  // 5. Akumulasi Bon Bulan Ini (Sales store_credit not fully paid)
  let bonBerjalan = 0;
  // If the sales table is not created yet, we just gracefully catch the error
  try {
    const { data: sales, error } = await supabase
      .from('sales')
      .select('total_amount, paid_amount')
      .eq('member_id', memberId)
      .eq('payment_scheme', 'store_credit')
      .gte('created_at', `${currentYear}-${String(currentMonth).padStart(2, '0')}-01T00:00:00Z`);

    if (sales && !error) {
      bonBerjalan = sales.reduce((acc, s) => acc + (Number(s.total_amount) - Number(s.paid_amount)), 0);
    }
  } catch (e) {
    console.warn('Sales table might not exist yet');
  }

  const thpSafetyThreshold = 1500000;
  const kapasitasGaji = thp - (cicilanBulanIni + simpananRutin);
  const remainingCreditLimit = Math.max(0, kapasitasGaji - thpSafetyThreshold - bonBerjalan);

  return {
    belanjaBalance,
    remainingCreditLimit,
    thpSafetyThreshold
  };
};
