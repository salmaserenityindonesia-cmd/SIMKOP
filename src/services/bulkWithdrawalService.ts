import { supabase } from '../lib/supabaseClient';

export type DisbursementCycleStatus = 'DRAFT' | 'APPROVED' | 'COMPLETED' | 'REJECTED';
export type DisbursementCycleSource = 'HISTORICAL_INPUT' | 'MASSAL' | 'MANUAL';

export interface LebaranDisbursementCycle {
  id: string;
  cycle_name: string;
  disbursement_date?: string;
  cut_off_date: string;
  source_type?: DisbursementCycleSource;
  total_members: number;
  total_amount: number;
  status: DisbursementCycleStatus;
  notes?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LebaranDisbursementItem {
  id: string;
  cycle_id: string;
  member_id: string;
  nrp?: string | null;
  member_name?: string | null;
  bank_account?: string | null;
  amount_disbursed: number;
  created_at: string;
}

export interface LebaranSimulationMember {
  memberId: string;
  memberDepositId?: string;
  nrp: string;
  nama: string;
  pangkat: string;
  bankAccount: string;
  bankName: string;
  saldoLebaran: number;
  hasActiveLoan: boolean;
  activeLoanRemaining: number;
}

export interface LebaranSimulationSummary {
  totalMembers: number;
  totalAmount: number;
  averageAmount: number;
  members: LebaranSimulationMember[];
}

export interface CreateDisbursementDraftPayload {
  cycleName: string;
  cutOffDate: string;
  notes?: string;
  createdBy?: string;
}

export interface ExecuteDisbursementResult {
  success: boolean;
  cycleId: string;
  totalMembers: number;
  totalAmount: number;
  executionMode: 'rpc' | 'client_fallback';
}

export interface RecordManualLebaranPayload {
  memberId: string;
  memberName: string;
  nrp?: string;
  bankAccount?: string;
  amount: number;
  transactionDate?: string;
  cycleName?: string;
  notes?: string;
}

export interface ReplayExecutionResult {
  success: boolean;
  totalCycles: number;
  totalRecipients: number;
  totalAmount: number;
  mode: 'rpc' | 'client_fallback';
}

/**
 * Memeriksa apakah deposit_type merupakan simpanan Lebaran / Hari Raya
 */
export function isLebaranDepositType(code?: string | null, name?: string | null): boolean {
  const c = (code || '').toUpperCase().trim();
  const n = (name || '').toLowerCase().trim();
  return (
    c.includes('LEBARAN') ||
    c === 'SL' ||
    c === 'THR' ||
    n.includes('lebaran') ||
    n.includes('hari raya')
  );
}

/**
 * 2. simulateLebaranDisbursement()
 * Menghitung simulasi daftar nominatif anggota aktif yang berhak menerima pencairan simpanan lebaran,
 * total dana yang dibutuhkan, rata-rata nominal per anggota, serta mengecek ada tidaknya pinjaman aktif.
 */
export async function simulateLebaranDisbursement(): Promise<LebaranSimulationSummary> {
  // 1. Ambil master deposit type untuk kategori 'LEBARAN'
  const { data: dTypes, error: dtError } = await supabase
    .from('deposit_types')
    .select('id, name, code');

  if (dtError) {
    throw new Error(`Gagal memuat jenis simpanan: ${dtError.message}`);
  }

  const lebaranTypes = (dTypes || []).filter(dt => isLebaranDepositType(dt.code, dt.name));

  if (lebaranTypes.length === 0) {
    return {
      totalMembers: 0,
      totalAmount: 0,
      averageAmount: 0,
      members: []
    };
  }

  const lebaranTypeIds = lebaranTypes.map(t => t.id);

  // 2. Query seluruh member_deposits terkait jenis simpanan lebaran
  const { data: mDeposits, error: mdError } = await supabase
    .from('member_deposits')
    .select('id, member_id, deposit_type_id')
    .in('deposit_type_id', lebaranTypeIds);

  if (mdError) {
    throw new Error(`Gagal memuat data rekening simpanan anggota: ${mdError.message}`);
  }

  if (!mDeposits || mDeposits.length === 0) {
    return {
      totalMembers: 0,
      totalAmount: 0,
      averageAmount: 0,
      members: []
    };
  }

  // 3. Query seluruh anggota berstatus 'aktif'
  const { data: membersData, error: memError } = await supabase
    .from('anggota')
    .select('id, nrp, nama, pangkat, bank_account_number, status');

  if (memError) {
    throw new Error(`Gagal memuat profil anggota: ${memError.message}`);
  }

  const activeMembers = (membersData || []).filter(
    m => (m.status || '').toLowerCase() === 'aktif'
  );

  const activeMembersMap = new Map<string, any>(
    activeMembers.map(m => [m.id, m])
  );

  // Filter member_deposits yang dimiliki oleh anggota berstatus aktif
  const activeMemberDeposits = mDeposits.filter(md => activeMembersMap.has(md.member_id));
  if (activeMemberDeposits.length === 0) {
    return {
      totalMembers: 0,
      totalAmount: 0,
      averageAmount: 0,
      members: []
    };
  }

  const mdIds = activeMemberDeposits.map(md => md.id);

  // 4. Query transaksi deposit_transactions untuk menghitung saldo berjalan masing-masing
  const chunkSize = 200;
  const allTxs: any[] = [];

  for (let i = 0; i < mdIds.length; i += chunkSize) {
    const chunk = mdIds.slice(i, i + chunkSize);
    const { data: txs, error: txError } = await supabase
      .from('deposit_transactions')
      .select('member_deposit_id, amount, transaction_type')
      .in('member_deposit_id', chunk);

    if (txError) {
      throw new Error(`Gagal memuat mutasi transaksi simpanan: ${txError.message}`);
    }

    if (txs) {
      allTxs.push(...txs);
    }
  }

  // Hitung saldo berjalan per member_deposit_id
  const mdBalanceMap = new Map<string, number>();
  for (const tx of allTxs) {
    const current = mdBalanceMap.get(tx.member_deposit_id) || 0;
    const amt = Number(tx.amount || 0);
    if (tx.transaction_type === 'deposit') {
      mdBalanceMap.set(tx.member_deposit_id, current + amt);
    } else if (tx.transaction_type === 'withdrawal') {
      mdBalanceMap.set(tx.member_deposit_id, current - amt);
    }
  }

  // Akumulasikan per anggota & filter yang memiliki saldo > 0
  const memberBalances: Array<{
    member: any;
    memberDepositId: string;
    saldoLebaran: number;
  }> = [];

  for (const md of activeMemberDeposits) {
    const saldo = mdBalanceMap.get(md.id) || 0;
    if (saldo > 0) {
      const mem = activeMembersMap.get(md.member_id);
      if (mem) {
        memberBalances.push({
          member: mem,
          memberDepositId: md.id,
          saldoLebaran: saldo
        });
      }
    }
  }

  if (memberBalances.length === 0) {
    return {
      totalMembers: 0,
      totalAmount: 0,
      averageAmount: 0,
      members: []
    };
  }

  // 5. Cross-lookup ke tabel pinjaman (loans) untuk mendeteksi anggota yang memiliki pinjaman aktif / belum lunas
  const targetMemberIds = memberBalances.map(mb => mb.member.id);
  const loanMap = new Map<string, { hasActiveLoan: boolean; remaining: number }>();

  try {
    let loansQuery: any = supabase
      .from('loans')
      .select(`
        id,
        member_id,
        amount,
        principal_amount,
        sisa_pinjaman,
        status,
        loan_schedules ( id, target_amount, paid_amount, status ),
        loan_repayments ( amount_paid )
      `)
      .in('status', ['active', 'approved']);

    if (targetMemberIds.length > 0) {
      loansQuery = loansQuery.in('member_id', targetMemberIds);
    }

    const { data: loansData, error: loansError } = await loansQuery;

    let loanRows: any[] = [];
    if (!loansError && loansData) {
      loanRows = loansData;
    } else {
      const { data: simpleLoans } = await supabase
        .from('loans')
        .select('id, member_id, amount, principal_amount, status')
        .in('status', ['active', 'approved'])
        .in('member_id', targetMemberIds);
      loanRows = simpleLoans || [];
    }

    for (const loan of loanRows) {
      const mId = loan.member_id;
      if (!mId) continue;
      const principal = Number(loan.principal_amount || loan.amount || 0);
      let remaining = 0;

      if (loan.sisa_pinjaman !== undefined && loan.sisa_pinjaman !== null) {
        remaining = Number(loan.sisa_pinjaman);
      } else if (Array.isArray(loan.loan_schedules) && loan.loan_schedules.length > 0) {
        remaining = loan.loan_schedules
          .filter((s: any) => s.status !== 'paid')
          .reduce((sum: number, s: any) => {
            const target = Number(s.target_amount || 0);
            const paid = Number(s.paid_amount || 0);
            return sum + Math.max(0, target - paid);
          }, 0);
      } else if (Array.isArray(loan.loan_repayments) && loan.loan_repayments.length > 0) {
        const paidTotal = loan.loan_repayments.reduce(
          (sum: number, r: any) => sum + Number(r.amount_paid || 0),
          0
        );
        remaining = Math.max(0, principal - paidTotal);
      } else {
        remaining = principal;
      }

      const prev = loanMap.get(mId) || { hasActiveLoan: false, remaining: 0 };
      loanMap.set(mId, {
        hasActiveLoan: true,
        remaining: prev.remaining + remaining
      });
    }
  } catch (loanErr) {
    console.warn('Peringatan: Gagal memuat info pinjaman aktif:', loanErr);
  }

  // 6. Bentuk daftar LebaranSimulationMember
  const members: LebaranSimulationMember[] = memberBalances.map(mb => {
    const loanInfo = loanMap.get(mb.member.id) || { hasActiveLoan: false, remaining: 0 };
    return {
      memberId: mb.member.id,
      memberDepositId: mb.memberDepositId,
      nrp: mb.member.nrp || '',
      nama: mb.member.nama || '',
      pangkat: mb.member.pangkat || '',
      bankAccount: mb.member.bank_account_number || '',
      bankName: mb.member.bank_name || 'Bank BRI',
      saldoLebaran: mb.saldoLebaran,
      hasActiveLoan: loanInfo.hasActiveLoan,
      activeLoanRemaining: loanInfo.remaining
    };
  });

  members.sort((a, b) => a.nama.localeCompare(b.nama));

  const totalMembers = members.length;
  const totalAmount = members.reduce((sum, m) => sum + m.saldoLebaran, 0);
  const averageAmount = totalMembers > 0 ? Math.round(totalAmount / totalMembers) : 0;

  return {
    totalMembers,
    totalAmount,
    averageAmount,
    members
  };
}

/**
 * 3. createDisbursementDraft()
 */
export async function createDisbursementDraft(
  payload: CreateDisbursementDraftPayload
): Promise<LebaranDisbursementCycle> {
  if (!payload.cycleName || !payload.cycleName.trim()) {
    throw new Error('Nama siklus pencairan wajib diisi.');
  }

  if (!payload.cutOffDate) {
    throw new Error('Tanggal cut-off wajib diisi.');
  }

  const simulation = await simulateLebaranDisbursement();
  const dateOnly = payload.cutOffDate.slice(0, 10);

  const draftRecord = {
    cycle_name: payload.cycleName.trim(),
    disbursement_date: dateOnly,
    cut_off_date: payload.cutOffDate,
    source_type: 'MASSAL',
    total_members: simulation.totalMembers,
    total_amount: simulation.totalAmount,
    status: 'DRAFT',
    notes: payload.notes?.trim() || null,
    created_by: payload.createdBy || null
  };

  const { data, error } = await supabase
    .from('lebaran_disbursement_cycles')
    .insert([draftRecord])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal membuat draf siklus pencairan lebaran: ${error.message}`);
  }

  return data as LebaranDisbursementCycle;
}

/**
 * 4. approveAndExecuteDisbursement()
 * Eksekusi pencairan massal dan pencatatan penerima ke lebaran_disbursement_items
 */
export async function approveAndExecuteDisbursement(
  cycleId: string,
  approverId?: string
): Promise<ExecuteDisbursementResult> {
  if (!cycleId) {
    throw new Error('ID siklus pencairan wajib diisi.');
  }

  // Ambil simulasi nominatif terkini untuk data penerima
  let simulation: LebaranSimulationSummary | null = null;
  try {
    simulation = await simulateLebaranDisbursement();
  } catch (simErr) {
    console.warn('Gagal menghitung simulasi penerima:', simErr);
  }

  // 1. Coba panggil RPC atomik execute_bulk_lebaran_disbursement
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'execute_bulk_lebaran_disbursement',
      {
        p_cycle_id: cycleId,
        p_approver_id: approverId || null
      }
    );

    if (!rpcError && rpcData?.success) {
      // Pastikan penerima tercatat di lebaran_disbursement_items jika ada data nominatif
      if (simulation && simulation.members.length > 0) {
        try {
          const itemsPayload = simulation.members.map(m => ({
            cycle_id: cycleId,
            member_id: m.memberId,
            nrp: m.nrp || null,
            member_name: m.nama || null,
            bank_account: m.bankAccount || null,
            amount_disbursed: m.saldoLebaran,
            created_at: new Date().toISOString()
          }));
          await supabase.from('lebaran_disbursement_items').insert(itemsPayload);
        } catch (itemErr) {
          console.warn('Catatan: Gagal mencatat items penerima setelah RPC:', itemErr);
        }
      }

      return {
        success: true,
        cycleId,
        totalMembers: Number(rpcData.total_members || 0),
        totalAmount: Number(rpcData.total_amount || 0),
        executionMode: 'rpc'
      };
    }

    if (rpcError) {
      console.warn('RPC execute_bulk_lebaran_disbursement mengembalikan error, menjalankan fallback:', rpcError.message);
    }
  } catch (rpcCatchErr) {
    console.warn('Panggilan RPC gagal terhubung, beralih ke fallback eksekusi klien:', rpcCatchErr);
  }

  // 2. Client-side Fallback
  const { data: cycle, error: cycleErr } = await supabase
    .from('lebaran_disbursement_cycles')
    .select('*')
    .eq('id', cycleId)
    .single();

  if (cycleErr || !cycle) {
    throw new Error(cycleErr?.message || `Siklus pencairan lebaran dengan ID ${cycleId} tidak ditemukan.`);
  }

  if (cycle.status !== 'DRAFT' && cycle.status !== 'APPROVED') {
    throw new Error(`Siklus pencairan lebaran tidak dapat dieksekusi karena berstatus ${cycle.status}.`);
  }

  const sim = simulation || await simulateLebaranDisbursement();
  const cutOffDateObj = cycle.cut_off_date ? new Date(cycle.cut_off_date) : new Date();
  const yearStr = isNaN(cutOffDateObj.getTime())
    ? new Date().getFullYear().toString()
    : cutOffDateObj.getFullYear().toString();
  const dateOnly = isNaN(cutOffDateObj.getTime())
    ? new Date().toISOString().slice(0, 10)
    : cutOffDateObj.toISOString().slice(0, 10);

  const itemsPayload: any[] = [];

  for (const m of sim.members) {
    if (!m.memberDepositId || m.saldoLebaran <= 0) continue;

    const refNo = `KW-THR-${yearStr}-${(m.nrp || 'ANGGOTA').trim()}`;
    const desc = `Pencairan Massal Simpanan Lebaran - ${cycle.cycle_name}`;

    const { data: tx, error: txErr } = await supabase
      .from('deposit_transactions')
      .insert([{
        member_deposit_id: m.memberDepositId,
        transaction_date: dateOnly,
        transaction_type: 'withdrawal',
        amount: m.saldoLebaran,
        description: desc,
        reference_no: refNo,
        payment_method: 'transfer',
        notes: 'Pencairan Massal Simpanan Lebaran',
        created_by: approverId || null,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (txErr) {
      console.warn(`Gagal mencatat mutasi penarikan untuk ${m.nama}:`, txErr.message);
    }

    if (tx?.id) {
      try {
        await supabase.from('cash_flow').insert([{
          direction: 'out',
          amount: m.saldoLebaran,
          category: 'penarikan_simpanan',
          reference_id: tx.id,
          created_at: new Date().toISOString()
        }]);
      } catch (_) {}
    }

    itemsPayload.push({
      cycle_id: cycleId,
      member_id: m.memberId,
      nrp: m.nrp || null,
      member_name: m.nama || null,
      bank_account: m.bankAccount || null,
      amount_disbursed: m.saldoLebaran,
      created_at: new Date().toISOString()
    });
  }

  // Simpan record penerima ke lebaran_disbursement_items
  if (itemsPayload.length > 0) {
    try {
      await supabase.from('lebaran_disbursement_items').insert(itemsPayload);
    } catch (itemErr) {
      console.warn('Gagal menyimpan detail penerima di fallback:', itemErr);
    }
  }

  // Update status siklus menjadi 'COMPLETED'
  const { error: updateErr } = await supabase
    .from('lebaran_disbursement_cycles')
    .update({
      disbursement_date: dateOnly,
      source_type: 'MASSAL',
      status: 'COMPLETED',
      approved_by: approverId || null,
      approved_at: new Date().toISOString(),
      total_members: sim.totalMembers,
      total_amount: sim.totalAmount,
      updated_at: new Date().toISOString()
    })
    .eq('id', cycleId);

  if (updateErr) {
    throw new Error(`Gagal memperbarui status siklus pencairan menjadi COMPLETED: ${updateErr.message}`);
  }

  return {
    success: true,
    cycleId,
    totalMembers: sim.totalMembers,
    totalAmount: sim.totalAmount,
    executionMode: 'client_fallback'
  };
}

/**
 * 5. rejectDisbursementDraft()
 */
export async function rejectDisbursementDraft(
  cycleId: string,
  notes?: string
): Promise<LebaranDisbursementCycle> {
  if (!cycleId) {
    throw new Error('ID siklus pencairan wajib diisi.');
  }

  const updatePayload: any = {
    status: 'REJECTED',
    updated_at: new Date().toISOString()
  };

  if (notes && notes.trim()) {
    updatePayload.notes = notes.trim();
  }

  const { data, error } = await supabase
    .from('lebaran_disbursement_cycles')
    .update(updatePayload)
    .eq('id', cycleId)
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menolak draf siklus pencairan: ${error.message}`);
  }

  return data as LebaranDisbursementCycle;
}

/**
 * 6. getLebaranDisbursementCycles() / getLebaranCycleHistory()
 * Mengambil seluruh riwayat siklus pencairan dari tabel `lebaran_disbursement_cycles`
 */
export async function getLebaranDisbursementCycles(): Promise<LebaranDisbursementCycle[]> {
  try {
    const { data, error } = await supabase
      .from('lebaran_disbursement_cycles')
      .select('*')
      .order('disbursement_date', { ascending: false });

    if (error) {
      const { data: fbData, error: fbError } = await supabase
        .from('lebaran_disbursement_cycles')
        .select('*')
        .order('created_at', { ascending: false });
      if (fbError) throw fbError;
      return (fbData || []) as LebaranDisbursementCycle[];
    }

    return (data || []) as LebaranDisbursementCycle[];
  } catch (err: any) {
    console.error('Error fetching lebaran cycles:', err);
    throw new Error(`Gagal memuat daftar siklus pencairan simpanan lebaran: ${err.message}`);
  }
}

export const getLebaranCycleHistory = getLebaranDisbursementCycles;

/**
 * 7. getLastCompletedLebaranCycle()
 * Mengambil record siklus pencairan terakhir yang berstatus 'COMPLETED'
 */
export async function getLastCompletedLebaranCycle(): Promise<LebaranDisbursementCycle | null> {
  try {
    const tableQuery: any = supabase.from('lebaran_disbursement_cycles');
    if (!tableQuery || typeof tableQuery.select !== 'function') {
      return null;
    }
    const selQuery = tableQuery.select('*');
    if (!selQuery || typeof selQuery.eq !== 'function') {
      return null;
    }

    const { data, error } = await selQuery
      .eq('status', 'COMPLETED')
      .order('disbursement_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const { data: fallbackData } = await supabase
        .from('lebaran_disbursement_cycles')
        .select('*')
        .eq('status', 'COMPLETED')
        .order('cut_off_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (fallbackData as LebaranDisbursementCycle) || null;
    }

    return (data as LebaranDisbursementCycle) || null;
  } catch (err) {
    console.warn('Exception saat mengambil siklus lebaran terakhir yang selesai:', err);
    return null;
  }
}

/**
 * 8. getCycleRecipients(cycleId: string)
 * Mengambil daftar detail anggota penerima dari `lebaran_disbursement_items`
 */
export async function getCycleRecipients(cycleId: string): Promise<LebaranDisbursementItem[]> {
  if (!cycleId) return [];
  try {
    const { data, error } = await supabase
      .from('lebaran_disbursement_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('member_name', { ascending: true });

    if (error) {
      console.warn('Gagal memuat detail penerima siklus:', error.message);
      return [];
    }

    return (data || []) as LebaranDisbursementItem[];
  } catch (err) {
    console.warn('Exception memuat detail penerima siklus:', err);
    return [];
  }
}

/**
 * 9. addHistoricalDisbursementDate()
 * Menyisipkan tanggal pencairan historis ke `lebaran_disbursement_cycles`
 */
export async function addHistoricalDisbursementDate(
  date: string,
  cycleName?: string,
  notes?: string
): Promise<LebaranDisbursementCycle> {
  if (!date || !date.trim()) {
    throw new Error('Tanggal pencairan wajib diisi.');
  }

  const cleanDate = date.trim();
  const year = cleanDate.slice(0, 4);
  const defaultName = cycleName?.trim() || `Pencairan Lebaran ${year}`;

  const payload: any = {
    cycle_name: defaultName,
    disbursement_date: cleanDate,
    cut_off_date: cleanDate,
    source_type: 'HISTORICAL_INPUT',
    status: 'COMPLETED',
    total_members: 0,
    total_amount: 0,
    notes: notes?.trim() || 'Input tanggal pencairan historis',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('lebaran_disbursement_cycles')
    .insert([payload])
    .select()
    .single();

  if (error) {
    if (error.code === '23505' || error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
      throw new Error(`Tanggal pencairan ${cleanDate} sudah terdaftar dalam siklus.`);
    }
    throw new Error(`Gagal menambahkan tanggal pencairan historis: ${error.message}`);
  }

  return data as LebaranDisbursementCycle;
}

/**
 * 10. addHistoricalDisbursementDates()
 * Menyisipkan beberapa tanggal pencairan historis sekaligus (bulk input)
 */
export async function addHistoricalDisbursementDates(
  dates: string[],
  defaultPrefix?: string
): Promise<{ added: number; errors: string[] }> {
  const uniqueDates = Array.from(new Set(dates.map(d => d.trim()).filter(Boolean)));
  let added = 0;
  const errors: string[] = [];

  for (const date of uniqueDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Format tanggal tidak valid: "${date}" (harus YYYY-MM-DD)`);
      continue;
    }
    try {
      const year = date.slice(0, 4);
      const name = defaultPrefix ? `${defaultPrefix} ${year}` : `Pencairan Lebaran ${year}`;
      await addHistoricalDisbursementDate(date, name);
      added++;
    } catch (err: any) {
      errors.push(`${date}: ${err.message}`);
    }
  }

  return { added, errors };
}

/**
 * 11. deleteHistoricalDisbursementDate()
 * Menghapus tanggal siklus dari `lebaran_disbursement_cycles`
 */
export async function deleteHistoricalDisbursementDate(cycleId: string): Promise<boolean> {
  if (!cycleId) throw new Error('ID siklus pencairan wajib diisi.');

  const { error } = await supabase
    .from('lebaran_disbursement_cycles')
    .delete()
    .eq('id', cycleId);

  if (error) {
    throw new Error(`Gagal menghapus siklus pencairan: ${error.message}`);
  }

  return true;
}

/**
 * 12. recordManualLebaranWithdrawal()
 * Auto-sync ketika ada penarikan perorangan/manual simpanan lebaran
 */
export async function recordManualLebaranWithdrawal(payload: RecordManualLebaranPayload): Promise<void> {
  const dateStr = payload.transactionDate || new Date().toISOString().slice(0, 10);
  const cycleName = payload.cycleName || `Pencairan Manual Lebaran ${dateStr}`;

  try {
    // 1. Cari siklus pada tanggal tersebut
    const { data: existingCycle } = await supabase
      .from('lebaran_disbursement_cycles')
      .select('id, total_members, total_amount')
      .eq('disbursement_date', dateStr)
      .maybeSingle();

    let cycleId = existingCycle?.id;

    if (!cycleId) {
      const { data: newCycle, error: insertCycleErr } = await supabase
        .from('lebaran_disbursement_cycles')
        .insert([{
          cycle_name: cycleName,
          disbursement_date: dateStr,
          cut_off_date: dateStr,
          source_type: 'MANUAL',
          total_members: 1,
          total_amount: payload.amount,
          status: 'COMPLETED',
          notes: payload.notes || 'Pencairan Simpanan Lebaran Manual',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }])
        .select('id')
        .single();

      if (!insertCycleErr && newCycle) {
        cycleId = newCycle.id;
      }
    } else {
      await supabase
        .from('lebaran_disbursement_cycles')
        .update({
          total_members: (existingCycle.total_members || 0) + 1,
          total_amount: (existingCycle.total_amount || 0) + payload.amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', cycleId);
    }

    if (cycleId) {
      await supabase
        .from('lebaran_disbursement_items')
        .insert([{
          cycle_id: cycleId,
          member_id: payload.memberId,
          nrp: payload.nrp || null,
          member_name: payload.memberName || null,
          bank_account: payload.bankAccount || null,
          amount_disbursed: payload.amount,
          created_at: new Date().toISOString()
        }]);
    }
  } catch (err) {
    console.warn('Gagal mencatat siklus historis pencairan manual simpanan lebaran:', err);
  }
}

/**
 * 13. executeReplayAllCycles()
 * Menjalankan simulasi pengosongan ulang berantai (Replay) dari tanggal tertua s/d terbaru
 */
export async function executeReplayAllCycles(): Promise<ReplayExecutionResult> {
  // 1. Panggil RPC atomik replay_lebaran_disbursement_cycles terlebih dahulu
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('replay_lebaran_disbursement_cycles');
    if (!rpcError && rpcData?.success) {
      return {
        success: true,
        totalCycles: Number(rpcData.total_cycles || 0),
        totalRecipients: Number(rpcData.total_recipients || 0),
        totalAmount: Number(rpcData.total_amount || 0),
        mode: 'rpc'
      };
    }
    if (rpcError) {
      console.warn('RPC replay_lebaran_disbursement_cycles gagal, beralih ke fallback klien:', rpcError.message);
    }
  } catch (err) {
    console.warn('Exception RPC replay, menjalankan fallback klien:', err);
  }

  // 2. Client-side Fallback
  return await executeReplayClientFallback();
}

/**
 * Client-side fallback untuk simulasi pengosongan ulang (Replay)
 */
async function executeReplayClientFallback(): Promise<ReplayExecutionResult> {
  // 1. Ambil seluruh siklus dari lebaran_disbursement_cycles
  const { data: cycles, error: cycleErr } = await supabase
    .from('lebaran_disbursement_cycles')
    .select('*')
    .order('disbursement_date', { ascending: true });

  if (cycleErr) {
    throw new Error(`Gagal memuat siklus: ${cycleErr.message}`);
  }

  const sortedCycles = (cycles || []).sort((a, b) => {
    const dateA = a.disbursement_date || a.cut_off_date || a.created_at;
    const dateB = b.disbursement_date || b.cut_off_date || b.created_at;
    return new Date(dateA).getTime() - new Date(dateB).getTime();
  });

  // 2. Bersihkan transaksi withdrawal simpanan lebaran lama
  try {
    await supabase
      .from('deposit_transactions')
      .delete()
      .eq('transaction_type', 'withdrawal')
      .or('description.ilike.%Pencairan%Simpanan Lebaran%,notes.ilike.%Pencairan%Simpanan Lebaran%,reference_no.ilike.KW-THR-%');
  } catch (delErr) {
    console.warn('Gagal membersihkan mutasi penarikan lama (fallback):', delErr);
  }

  // 3. Bersihkan lebaran_disbursement_items
  try {
    await supabase.from('lebaran_disbursement_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (delItemsErr) {
    console.warn('Gagal membersihkan items lama (fallback):', delItemsErr);
  }

  if (sortedCycles.length === 0) {
    return {
      success: true,
      totalCycles: 0,
      totalRecipients: 0,
      totalAmount: 0,
      mode: 'client_fallback'
    };
  }

  // 4. Ambil master deposit types LEBARAN
  const { data: dTypes } = await supabase.from('deposit_types').select('id, name, code');
  const lebaranTypes = (dTypes || []).filter(dt => isLebaranDepositType(dt.code, dt.name));
  const lebaranTypeIds = lebaranTypes.map(t => t.id);

  const { data: mDeposits } = await supabase
    .from('member_deposits')
    .select('id, member_id, deposit_type_id')
    .in('deposit_type_id', lebaranTypeIds);

  const activeMds = mDeposits || [];
  const mdIds = activeMds.map(m => m.id);

  const { data: membersData } = await supabase
    .from('anggota')
    .select('id, nrp, nama, pangkat, bank_account_number, status, joined_at, created_at');

  const membersMap = new Map<string, any>((membersData || []).map(m => [m.id, m]));

  let totalRecipientsAll = 0;
  let totalAmountAll = 0;

  for (const cycle of sortedCycles) {
    const cycleDateStr = cycle.disbursement_date || (cycle.cut_off_date ? cycle.cut_off_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    const cycleDate = new Date(cycleDateStr);
    const yearStr = cycleDate.getFullYear().toString();

    // Query mutasi s/d tanggal siklus
    const { data: txs } = await supabase
      .from('deposit_transactions')
      .select('id, member_deposit_id, amount, transaction_type, transaction_date, created_at')
      .in('member_deposit_id', mdIds);

    const balanceMap = new Map<string, number>();
    for (const tx of (txs || [])) {
      const txDateStr = tx.transaction_date || (tx.created_at ? tx.created_at.slice(0, 10) : '');
      if (txDateStr && txDateStr <= cycleDateStr) {
        const cur = balanceMap.get(tx.member_deposit_id) || 0;
        const amt = Number(tx.amount || 0);
        if (tx.transaction_type === 'deposit') {
          balanceMap.set(tx.member_deposit_id, cur + amt);
        } else if (tx.transaction_type === 'withdrawal') {
          balanceMap.set(tx.member_deposit_id, cur - amt);
        }
      }
    }

    let cycleMembersCount = 0;
    let cycleTotalAmount = 0;
    const itemsToInsert: any[] = [];
    const txsToInsert: any[] = [];

    for (const md of activeMds) {
      const saldo = balanceMap.get(md.id) || 0;
      if (saldo > 0) {
        const mem = membersMap.get(md.member_id);
        if (!mem) continue;

        const joinDateStr = mem.joined_at || (mem.created_at ? mem.created_at.slice(0, 10) : '');
        if (joinDateStr && joinDateStr > cycleDateStr) {
          continue; // Anggota belum bergabung saat siklus ini terjadi
        }

        cycleMembersCount++;
        cycleTotalAmount += saldo;

        const refNo = `KW-THR-${yearStr}-${(mem.nrp || 'ANGGOTA').trim()}`;
        txsToInsert.push({
          member_deposit_id: md.id,
          transaction_date: cycleDateStr,
          transaction_type: 'withdrawal',
          amount: saldo,
          description: `Pencairan Massal Simpanan Lebaran - ${cycle.cycle_name}`,
          reference_no: refNo,
          payment_method: 'transfer',
          notes: 'Pencairan Simpanan Lebaran (Replay Timeline)',
          created_at: new Date(cycleDateStr + 'T12:00:00Z').toISOString()
        });

        itemsToInsert.push({
          cycle_id: cycle.id,
          member_id: mem.id,
          nrp: mem.nrp || null,
          member_name: mem.nama || null,
          bank_account: mem.bank_account_number || null,
          amount_disbursed: saldo,
          created_at: new Date(cycleDateStr + 'T12:00:00Z').toISOString()
        });
      }
    }

    if (txsToInsert.length > 0) {
      await supabase.from('deposit_transactions').insert(txsToInsert);
    }
    if (itemsToInsert.length > 0) {
      await supabase.from('lebaran_disbursement_items').insert(itemsToInsert);
    }

    await supabase
      .from('lebaran_disbursement_cycles')
      .update({
        total_members: cycleMembersCount,
        total_amount: cycleTotalAmount,
        status: 'COMPLETED',
        updated_at: new Date().toISOString()
      })
      .eq('id', cycle.id);

    totalRecipientsAll += cycleMembersCount;
    totalAmountAll += cycleTotalAmount;
  }

  return {
    success: true,
    totalCycles: sortedCycles.length,
    totalRecipients: totalRecipientsAll,
    totalAmount: totalAmountAll,
    mode: 'client_fallback'
  };
}

export const bulkWithdrawalService = {
  isLebaranDepositType,
  simulateLebaranDisbursement,
  createDisbursementDraft,
  approveAndExecuteDisbursement,
  rejectDisbursementDraft,
  getLebaranDisbursementCycles,
  getLastCompletedLebaranCycle,
  getLebaranCycleHistory,
  getCycleRecipients,
  addHistoricalDisbursementDate,
  addHistoricalDisbursementDates,
  deleteHistoricalDisbursementDate,
  executeReplayAllCycles,
  recordManualLebaranWithdrawal
};
