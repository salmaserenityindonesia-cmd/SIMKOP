import { supabase } from '../lib/supabaseClient';
import { formatIndividualWithdrawalCashFlowDescription } from '../utils/withdrawalCashFlowFormat';
import { generateNextCompactRegister } from '../utils/receiptGenerator';

export interface WithdrawableDeposit {
  member_deposit_id: string;
  deposit_type_id: string;
  deposit_name: string;
  deposit_code: string;
  saldo: number;
}

export interface LockedDeposit {
  deposit_type_id: string;
  deposit_name: string;
  deposit_code: string;
  saldo: number;
}

async function calculateDepositSaldo(memberDepositId: string): Promise<number> {
  const { data: txs, error: txError } = await supabase
    .from('deposit_transactions')
    .select('amount, transaction_type')
    .eq('member_deposit_id', memberDepositId);

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
  return saldo;
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

    const saldo = await calculateDepositSaldo(md.id);

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

/**
 * Fetch active deposit types from master `deposit_types` with `can_be_withdrawn = false`
 * along with the member's current balance (if a member_deposits record exists).
 */
export async function getLockedSavings(memberId: string): Promise<LockedDeposit[]> {
  const { data: dTypes, error: dtError } = await supabase
    .from('deposit_types')
    .select('id, name, code, is_active')
    .eq('can_be_withdrawn', false);

  if (dtError) throw new Error(dtError.message);
  const activeTypes = (dTypes || []).filter(t => t.is_active !== false);
  if (activeTypes.length === 0) return [];

  const typeIds = activeTypes.map(t => t.id);
  const { data: mDeposits, error: mdError } = await supabase
    .from('member_deposits')
    .select('id, deposit_type_id')
    .eq('member_id', memberId)
    .in('deposit_type_id', typeIds);

  if (mdError) throw new Error(mdError.message);

  const results: LockedDeposit[] = [];
  for (const dType of activeTypes) {
    const md = (mDeposits || []).find(m => m.deposit_type_id === dType.id);
    const saldo = md ? await calculateDepositSaldo(md.id) : 0;
    results.push({
      deposit_type_id: dType.id,
      deposit_name: dType.name,
      deposit_code: dType.code,
      saldo,
    });
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
  depositTypeCode?: string;
  namaAnggota?: string;
  nrpAnggota?: string;
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

async function safeSelectSingleById(
  table: string,
  columns: string,
  id: string
): Promise<any | null> {
  try {
    const tableRef: any = supabase?.from?.(table);
    if (!tableRef || typeof tableRef.select !== 'function') return null;
    const q: any = tableRef.select(columns);
    if (!q || typeof q.eq !== 'function') return null;
    const eqQ: any = q.eq('id', id);
    const res =
      typeof eqQ?.maybeSingle === 'function'
        ? await eqQ.maybeSingle()
        : typeof eqQ?.single === 'function'
        ? await eqQ.single()
        : await eqQ;
    if (res?.error) return null;
    const row = Array.isArray(res?.data) ? res.data[0] : res?.data;
    return row ?? null;
  } catch {
    return null;
  }
}

async function resolveWithdrawalCashFlowDescription(
  payload: WithdrawalPayload
): Promise<string> {
  let depositTypeName = payload.jenisSimpananLabel;
  let depositTypeCode = payload.depositTypeCode;
  let memberName = payload.namaAnggota;
  let memberNrp = payload.nrpAnggota;

  if (
    (!depositTypeName || !depositTypeCode || !memberName || !memberNrp) &&
    payload.member_deposit_id
  ) {
    const md = await safeSelectSingleById(
      'member_deposits',
      'id, member_id, deposit_type_id',
      payload.member_deposit_id
    );
    if (md) {
      const [memberRow, typeRow] = await Promise.all([
        (!memberName || !memberNrp) && md.member_id
          ? safeSelectSingleById('anggota', 'id, nrp, nama', String(md.member_id))
          : Promise.resolve(null),
        (!depositTypeName || !depositTypeCode) && md.deposit_type_id
          ? safeSelectSingleById(
              'deposit_types',
              'id, code, name',
              String(md.deposit_type_id)
            )
          : Promise.resolve(null),
      ]);

      if (memberRow) {
        if (!memberName && memberRow.nama) memberName = String(memberRow.nama);
        if (!memberNrp && memberRow.nrp) memberNrp = String(memberRow.nrp);
      }
      if (typeRow) {
        if (!depositTypeName && typeRow.name) {
          depositTypeName = String(typeRow.name);
        }
        if (!depositTypeCode && typeRow.code) {
          depositTypeCode = String(typeRow.code);
        }
      }
    }
  }

  return formatIndividualWithdrawalCashFlowDescription({
    depositTypeName,
    depositTypeCode,
    memberNrp,
    memberName,
    amount: payload.amount,
  });
}

export async function withdrawSavings(payload: WithdrawalPayload) {
  const receiptNumber =
    payload.reference_no?.trim() ||
    (await generateNextCompactRegister(supabase, {
      table: 'deposit_transactions',
      column: 'reference_no',
      prefix: 'KS',
    }));
  const notes = payload.notes || payload.description || 'Pencairan simpanan anggota';
  const desc = payload.description || (
    payload.jenisSimpananLabel && payload.namaAnggota
      ? `Penarikan Simpanan ${payload.jenisSimpananLabel} - ${payload.namaAnggota}`
      : 'Penarikan Simpanan'
  );
  const cashFlowDescription = await resolveWithdrawalCashFlowDescription(payload);

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

    // Perbarui deskripsi cash_flow untuk transaksi penarikan dari RPC
    try {
      const cfTable: any = supabase.from('cash_flow');
      if (cfTable && typeof cfTable.update === 'function') {
        const updQ = cfTable.update({ description: cashFlowDescription });
        if (updQ && typeof updQ.eq === 'function') {
          const { error: cfUpdErr } = await updQ.eq('reference_id', txId);
          if (cfUpdErr && !isPostgrestColumnError(cfUpdErr)) {
            console.warn('Gagal memperbarui deskripsi cash_flow penarikan:', cfUpdErr);
          }
        }
      }
    } catch (e) {
      console.warn('Gagal update deskripsi cash_flow:', e);
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
    const cfRes: any = await supabase.from('cash_flow').insert([{
      direction: 'out',
      amount: Math.round(Number(payload.amount)),
      category: 'penarikan_simpanan',
      reference_id: insertData.id,
      description: cashFlowDescription,
      created_at: new Date().toISOString(),
    }]);
    if (cfRes?.error && isPostgrestColumnError(cfRes.error)) {
      await supabase.from('cash_flow').insert([{
        direction: 'out',
        amount: Math.round(Number(payload.amount)),
        category: 'penarikan_simpanan',
        reference_id: insertData.id,
      }]);
    }
  } catch(e) {
    console.warn('Cash flow table might not exist yet', e);
  }

  return {
    ...insertData,
    reference_no: receiptNumber
  };
}
