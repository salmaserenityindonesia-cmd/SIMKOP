import { supabase } from '../lib/supabaseClient';

export interface WithdrawableDeposit {
  member_deposit_id: string;
  deposit_type_id: string;
  deposit_name: string;
  deposit_code: string;
  saldo: number;
}

export async function getWithdrawableSavings(memberId: string): Promise<WithdrawableDeposit[]> {
  // Fetch deposit types that can be withdrawn
  const { data: dTypes, error: dtError } = await supabase
    .from('deposit_types')
    .select('id, name, code')
    .eq('can_be_withdrawn', true);

  if (dtError) throw new Error(dtError.message);
  if (!dTypes || dTypes.length === 0) return [];

  const typeIds = dTypes.map(t => t.id);

  // Fetch member deposits for these types
  const { data: mDeposits, error: mdError } = await supabase
    .from('member_deposits')
    .select('id, deposit_type_id')
    .eq('member_id', memberId)
    .in('deposit_type_id', typeIds);

  if (mdError) throw new Error(mdError.message);
  if (!mDeposits || mDeposits.length === 0) return [];

  const results: WithdrawableDeposit[] = [];

  // Calculate saldo for each
  for (const md of mDeposits) {
    const dType = dTypes.find(t => t.id === md.deposit_type_id);
    if (!dType) continue;

    // Fetch transactions
    const { data: txs, error: txError } = await supabase
      .from('deposit_transactions')
      .select('amount, transaction_type')
      .eq('member_deposit_id', md.id);
    
    if (txError) throw new Error(txError.message);

    let saldo = 0;
    if (txs) {
      for (const tx of txs) {
        if (tx.transaction_type === 'deposit') {
          saldo += tx.amount;
        } else if (tx.transaction_type === 'withdrawal') {
          saldo -= tx.amount;
        }
      }
    }

    if (saldo > 0) {
      results.push({
        member_deposit_id: md.id,
        deposit_type_id: md.deposit_type_id,
        deposit_name: dType.name,
        deposit_code: dType.code,
        saldo
      });
    }
  }

  return results;
}

export interface WithdrawalPayload {
  member_deposit_id: string;
  amount: number;
  payment_method: 'transfer' | 'tunai' | string;
  description?: string;
  reference_no?: string;
  notes?: string;
  created_by?: string | null;
  jenisSimpananLabel?: string;
  namaAnggota?: string;
}

export async function withdrawSavings(payload: WithdrawalPayload) {
  const receiptNumber = payload.reference_no || `KW-WD-${Date.now()}`;
  const notes = payload.notes || payload.description || 'Pencairan simpanan anggota';
  const desc = payload.description || (
    payload.jenisSimpananLabel && payload.namaAnggota
      ? `Penarikan Simpanan ${payload.jenisSimpananLabel} - ${payload.namaAnggota}`
      : 'Penarikan Simpanan'
  );

  // Try RPC first for atomic transaction
  const { data: rpcData, error: rpcError } = await supabase.rpc('withdraw_savings_atomic', {
    p_member_deposit_id: payload.member_deposit_id,
    p_amount: payload.amount,
    p_description: desc,
    p_payment_method: payload.payment_method
  });

  if (!rpcError && rpcData?.success) {
    const txId = rpcData.transaction_id;
    // Enrich with audit and receipt fields (migration 034)
    try {
      await supabase
        .from('deposit_transactions')
        .update({
          reference_no: receiptNumber,
          payment_method: payload.payment_method || 'tunai',
          notes: notes,
          created_by: payload.created_by || null
        })
        .eq('id', txId);
    } catch (e) {
      console.warn('Gagal update metadata transaksi penarikan:', e);
    }
    return { id: txId, reference_no: receiptNumber };
  }

  // Fallback to manual inserts if RPC not yet deployed
  // 1. Double check saldo
  const { data: txs, error: txError } = await supabase
    .from('deposit_transactions')
    .select('amount, transaction_type')
    .eq('member_deposit_id', payload.member_deposit_id);
    
  if (txError) throw new Error(txError.message);
  
  let saldo = 0;
  if (txs) {
    for (const tx of txs) {
      if (tx.transaction_type === 'deposit') {
        saldo += tx.amount;
      } else if (tx.transaction_type === 'withdrawal') {
        saldo -= tx.amount;
      }
    }
  }

  if (saldo < payload.amount) {
    throw new Error('Saldo tidak mencukupi untuk penarikan');
  }

  // 2. Insert withdrawal transaction with official 'withdrawal' enum and complete metadata
  const { data: insertData, error: insertError } = await supabase
    .from('deposit_transactions')
    .insert([{
      member_deposit_id: payload.member_deposit_id,
      transaction_type: 'withdrawal',
      amount: Number(payload.amount),
      description: desc,
      reference_no: receiptNumber,
      payment_method: payload.payment_method || 'tunai',
      notes: notes,
      created_by: payload.created_by || null,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);

  // 3. Insert cash flow (optional fallback, since table might not exist in fallback scenario)
  try {
    await supabase.from('cash_flow').insert([{
      direction: 'out',
      amount: Number(payload.amount),
      category: 'penarikan_simpanan',
      reference_id: insertData.id
    }]);
  } catch(e) {
    console.warn('Cash flow table might not exist yet', e);
  }

  return {
    ...insertData,
    reference_no: receiptNumber
  };
}
