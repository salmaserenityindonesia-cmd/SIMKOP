import { supabase } from '../lib/supabaseClient';
import { DepositType } from './depositManagementService';
import { insertAuditLog } from './auditService';

export interface AdditionalDepositProduct extends DepositType {
  frequency_label: string;
}

export interface ProductBalanceSummary {
  depositTypeId: string;
  code: string;
  name: string;
  frequency_type: string;
  can_be_withdrawn: boolean;
  balance: number;
}

export interface MemberAdditionalSavingsSummary {
  memberId: string;
  nrp: string;
  nama: string;
  status: string;
  totalAdditionalBalance: number;
  productBalances: Record<string, number>;
  products: ProductBalanceSummary[];
}

export interface StatementEntry {
  id: string;
  date: string;
  referenceNo: string;
  description: string;
  paymentMethod: string;
  transactionType: string;
  credit: number;
  debit: number;
  runningBalance: number;
}

export interface MemberProductStatement {
  memberId: string;
  depositTypeId: string;
  memberDepositId: string | null;
  currentBalance: number;
  totalCredit: number;
  totalDebit: number;
  entries: StatementEntry[];
}

export interface RecordVoluntaryDepositPayload {
  memberId: string;
  depositTypeId: string;
  amount: number;
  paymentMethod: string;
  referenceNo?: string;
  notes?: string;
  userId?: string;
}

function isPokokProduct(dt: { code?: string; name?: string }): boolean {
  const code = String(dt.code || '').trim().toUpperCase();
  const name = String(dt.name || '').trim().toLowerCase();
  return code === 'POKOK' || code === 'SP' || name.includes('simpanan pokok') || name === 'pokok';
}

function isAdditionalFrequency(frequencyType?: string): boolean {
  const freq = String(frequencyType || '').trim().toLowerCase();
  return freq === 'voluntary' || freq === 'one_time' || freq === 'once';
}

function getFrequencyLabel(frequencyType?: string): string {
  const freq = String(frequencyType || '').trim().toLowerCase();
  if (freq === 'voluntary') return 'Ditambah Mandiri';
  if (freq === 'one_time' || freq === 'once') return 'Sekali di Awal';
  return frequencyType || '-';
}

async function fetchAllPaged<T = any>(
  table: string,
  selectColumns: string,
  applyFilter?: (q: any) => any
): Promise<T[]> {
  const pageSize = 1000;
  let offset = 0;
  const results: T[] = [];

  while (true) {
    let query = supabase.from(table).select(selectColumns).range(offset, offset + pageSize - 1);
    if (applyFilter) {
      query = applyFilter(query);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`Gagal memuat data ${table}: ${error.message}`);
    }
    const rows = (data || []) as T[];
    results.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return results;
}

/**
 * Mengambil daftar produk simpanan aktif bertipe 'voluntary' atau 'one_time'
 * dengan mengecualikan Simpanan Pokok secara ketat.
 */
export async function getAdditionalDepositProducts(): Promise<AdditionalDepositProduct[]> {
  const { data, error } = await supabase
    .from('deposit_types')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat produk simpanan tambahan: ${error.message}`);
  }

  return (data || [])
    .filter((dt: any) => isAdditionalFrequency(dt.frequency_type) && !isPokokProduct(dt))
    .map((dt: any) => ({
      ...dt,
      frequency_label: getFrequencyLabel(dt.frequency_type),
    }));
}

/**
 * Mengambil daftar seluruh anggota aktif (paginasi anti-1000-baris) beserta ringkasan
 * saldo bersih masing-masing produk simpanan tambahan.
 */
export async function getMembersWithAdditionalSavingsSummary(): Promise<{
  products: AdditionalDepositProduct[];
  members: MemberAdditionalSavingsSummary[];
}> {
  const products = await getAdditionalDepositProducts();
  const productIds = products.map((p) => p.id);

  const membersRaw = await fetchAllPaged<any>('anggota', 'id, nrp, nama, status', (q) =>
    q.eq('status', 'aktif').order('nama', { ascending: true })
  );

  let memberDeposits: any[] = [];
  if (productIds.length > 0) {
    memberDeposits = await fetchAllPaged<any>(
      'member_deposits',
      'id, member_id, deposit_type_id',
      (q) => q.in('deposit_type_id', productIds)
    );
  }

  const depositIds = memberDeposits.map((md) => md.id).filter(Boolean);
  const allTxs: any[] = [];
  if (depositIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < depositIds.length; i += chunkSize) {
      const chunk = depositIds.slice(i, i + chunkSize);
      const chunkTxs = await fetchAllPaged<any>(
        'deposit_transactions',
        'id, member_deposit_id, amount, transaction_type',
        (q) => q.in('member_deposit_id', chunk)
      );
      allTxs.push(...chunkTxs);
    }
  }

  const netByAccountId = new Map<string, number>();
  for (const tx of allTxs) {
    const accId = tx.member_deposit_id;
    if (!accId) continue;
    const amt = Number(tx.amount || 0);
    const delta = tx.transaction_type === 'withdrawal' ? -amt : amt;
    netByAccountId.set(accId, (netByAccountId.get(accId) || 0) + delta);
  }

  const balanceByMemberProduct = new Map<string, number>();
  for (const md of memberDeposits) {
    const key = `${md.member_id}::${md.deposit_type_id}`;
    const accNet = netByAccountId.get(md.id) || 0;
    balanceByMemberProduct.set(key, (balanceByMemberProduct.get(key) || 0) + accNet);
  }

  const members: MemberAdditionalSavingsSummary[] = membersRaw.map((m) => {
    const productBalances: Record<string, number> = {};
    let totalAdditionalBalance = 0;

    const productSummaries: ProductBalanceSummary[] = products.map((prod) => {
      const bal = balanceByMemberProduct.get(`${m.id}::${prod.id}`) || 0;
      productBalances[prod.id] = bal;
      totalAdditionalBalance += bal;
      return {
        depositTypeId: prod.id,
        code: prod.code,
        name: prod.name,
        frequency_type: prod.frequency_type,
        can_be_withdrawn: Boolean(prod.can_be_withdrawn),
        balance: bal,
      };
    });

    return {
      memberId: m.id,
      nrp: m.nrp || '-',
      nama: m.nama || 'Tanpa Nama',
      status: m.status || 'aktif',
      totalAdditionalBalance,
      productBalances,
      products: productSummaries,
    };
  });

  return { products, members };
}

/**
 * Mengambil rekening koran lengkap per produk per anggota dengan saldo berjalan (running balance).
 */
export async function getMemberProductStatement(
  memberId: string,
  depositTypeId: string
): Promise<MemberProductStatement> {
  const { data: accounts, error: accErr } = await supabase
    .from('member_deposits')
    .select('id, member_id, deposit_type_id')
    .eq('member_id', memberId)
    .eq('deposit_type_id', depositTypeId);

  if (accErr) {
    throw new Error(`Gagal memuat rekening simpanan anggota: ${accErr.message}`);
  }

  const accountIds = (accounts || []).map((a: any) => a.id).filter(Boolean);
  if (accountIds.length === 0) {
    return {
      memberId,
      depositTypeId,
      memberDepositId: null,
      currentBalance: 0,
      totalCredit: 0,
      totalDebit: 0,
      entries: [],
    };
  }

  const txs = await fetchAllPaged<any>(
    'deposit_transactions',
    '*',
    (q) => q.in('member_deposit_id', accountIds).order('created_at', { ascending: true }).order('id', { ascending: true })
  );

  let runningBalance = 0;
  let totalCredit = 0;
  let totalDebit = 0;

  const entries: StatementEntry[] = txs.map((tx: any) => {
    const amt = Number(tx.amount || 0);
    const isDeposit = !tx.transaction_type || tx.transaction_type === 'deposit';
    const credit = isDeposit ? amt : 0;
    const debit = isDeposit ? 0 : amt;
    runningBalance += credit - debit;
    totalCredit += credit;
    totalDebit += debit;

    return {
      id: tx.id,
      date: tx.transaction_date || tx.created_at || new Date().toISOString(),
      referenceNo: tx.reference_no || `TRX-${String(tx.id).slice(0, 8).toUpperCase()}`,
      description: tx.description || (isDeposit ? 'Setoran Simpanan Mandiri' : 'Penarikan Simpanan'),
      paymentMethod: tx.payment_method || '-',
      transactionType: tx.transaction_type || 'deposit',
      credit,
      debit,
      runningBalance,
    };
  });

  return {
    memberId,
    depositTypeId,
    memberDepositId: accountIds[0],
    currentBalance: runningBalance,
    totalCredit,
    totalDebit,
    entries,
  };
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

/**
 * Mencatat setoran simpanan mandiri langsung ke rekening anggota dan audit_logs.
 */
export async function recordVoluntaryDeposit(
  payload: RecordVoluntaryDepositPayload
): Promise<{ transactionId: string; referenceNo: string; memberDepositId: string }> {
  const amount = Number(payload.amount || 0);
  if (!payload.memberId || !payload.depositTypeId) {
    throw new Error('Anggota dan produk simpanan wajib dipilih.');
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Nominal setoran harus lebih besar dari 0.');
  }

  // 1. Pastikan rekening member_deposits tersedia
  const { data: existingAccounts, error: findErr } = await supabase
    .from('member_deposits')
    .select('id')
    .eq('member_id', payload.memberId)
    .eq('deposit_type_id', payload.depositTypeId)
    .limit(1);

  if (findErr) {
    throw new Error(`Gagal memeriksa rekening simpanan: ${findErr.message}`);
  }

  let memberDepositId = existingAccounts?.[0]?.id as string | undefined;
  if (!memberDepositId) {
    const { data: createdAcc, error: createErr } = await supabase
      .from('member_deposits')
      .insert({
        member_id: payload.memberId,
        deposit_type_id: payload.depositTypeId,
      })
      .select('id')
      .single();

    if (createErr || !createdAcc?.id) {
      throw new Error(`Gagal membuat rekening simpanan anggota: ${createErr?.message || 'Unknown error'}`);
    }
    memberDepositId = createdAcc.id;
  }

  const now = new Date();
  const referenceNo = (payload.referenceNo || '').trim() || `KW-MANDIRI-${Date.now()}`;
  const description = (payload.notes || '').trim() || `Setoran Mandiri (${payload.paymentMethod || 'Tunai'})`;

  const fullInsert: Record<string, any> = {
    member_deposit_id: memberDepositId,
    transaction_type: 'deposit',
    amount,
    for_month: now.getMonth() + 1,
    for_year: now.getFullYear(),
    description,
    reference_no: referenceNo,
    payment_method: payload.paymentMethod || 'Tunai',
    transaction_date: now.toISOString(),
  };

  let insertedTx: any = null;
  const { data: d1, error: e1 } = await supabase
    .from('deposit_transactions')
    .insert(fullInsert)
    .select('id')
    .single();

  if (!e1) {
    insertedTx = d1;
  } else if (isPostgrestColumnError(e1)) {
    const fallbackPayload: Record<string, any> = {
      member_deposit_id: memberDepositId,
      transaction_type: 'deposit',
      amount,
      for_month: now.getMonth() + 1,
      for_year: now.getFullYear(),
      description: `${description} [${referenceNo}]`,
    };
    const { data: d2, error: e2 } = await supabase
      .from('deposit_transactions')
      .insert(fallbackPayload)
      .select('id')
      .single();
    if (e2) {
      throw new Error(`Gagal menyimpan setoran mandiri: ${e2.message}`);
    }
    insertedTx = d2;
  } else {
    throw new Error(`Gagal menyimpan setoran mandiri: ${e1.message}`);
  }

  const txId = String(insertedTx?.id || referenceNo);

  try {
    await insertAuditLog({
      table_name: 'deposit_transactions',
      action: 'VOLUNTARY_DEPOSIT',
      record_id: txId,
      performed_by: payload.userId || null,
      notes: `Setoran mandiri ${referenceNo} sebesar ${amount}`,
      new_data: {
        member_id: payload.memberId,
        deposit_type_id: payload.depositTypeId,
        member_deposit_id: memberDepositId,
        amount,
        payment_method: payload.paymentMethod,
        reference_no: referenceNo,
      },
    });
  } catch {
    // Non-blocking audit log
  }

  return {
    transactionId: txId,
    referenceNo,
    memberDepositId,
  };
}
