import { supabase } from '../lib/supabaseClient';

export type DisbursementCycleStatus = 'DRAFT' | 'APPROVED' | 'COMPLETED' | 'REJECTED';

export interface LebaranDisbursementCycle {
  id: string;
  cycle_name: string;
  cut_off_date: string;
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
  // Bagi chunk jika mdIds banyak untuk mencegah query overload
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
      // Fallback: coba query sederhana tanpa nested relations
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

  // Urutkan nominatif berdasarkan nama anggota secara ascending
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
 * Menjalankan simulasi terlebih dahulu untuk memastikan data total terkini,
 * kemudian membuat record baru pada `lebaran_disbursement_cycles` dengan status 'DRAFT'.
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

  // 1. Jalankan simulasi terlebih dahulu
  const simulation = await simulateLebaranDisbursement();

  // 2. Insert record baru ke lebaran_disbursement_cycles
  const draftRecord = {
    cycle_name: payload.cycleName.trim(),
    cut_off_date: payload.cutOffDate,
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
 * Menjalankan approval dan eksekusi pencairan massal simpanan lebaran:
 * Mencoba memanggil fungsi RPC PostgreSQL atomik `execute_bulk_lebaran_disbursement` terlebih dahulu.
 * Jika RPC belum diaplikasikan atau gagal karena keterbatasan schema, menjalankan client-side fallback terstruktur.
 */
export async function approveAndExecuteDisbursement(
  cycleId: string,
  approverId?: string
): Promise<ExecuteDisbursementResult> {
  if (!cycleId) {
    throw new Error('ID siklus pencairan wajib diisi.');
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
  // A. Ambil data siklus pencairan
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

  // B. Ambil data nominatif simulasi terkini
  const simulation = await simulateLebaranDisbursement();
  const cutOffDateObj = cycle.cut_off_date ? new Date(cycle.cut_off_date) : new Date();
  const yearStr = isNaN(cutOffDateObj.getTime())
    ? new Date().getFullYear().toString()
    : cutOffDateObj.getFullYear().toString();

  // C. Iterasi dan insert transaksi withdrawal untuk masing-masing anggota
  for (const m of simulation.members) {
    if (!m.memberDepositId || m.saldoLebaran <= 0) continue;

    const refNo = `KW-THR-${yearStr}-${(m.nrp || 'ANGGOTA').trim()}`;
    const desc = `Pencairan Massal Simpanan Lebaran - ${cycle.cycle_name}`;

    const { data: tx, error: txErr } = await supabase
      .from('deposit_transactions')
      .insert([{
        member_deposit_id: m.memberDepositId,
        transaction_date: new Date().toISOString().slice(0, 10),
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
      } catch (_) {
        // Abaikan jika tabel cash_flow belum tersedia
      }
    }
  }

  // D. Update status siklus menjadi 'COMPLETED'
  const { error: updateErr } = await supabase
    .from('lebaran_disbursement_cycles')
    .update({
      status: 'COMPLETED',
      approved_by: approverId || null,
      approved_at: new Date().toISOString(),
      total_members: simulation.totalMembers,
      total_amount: simulation.totalAmount,
      updated_at: new Date().toISOString()
    })
    .eq('id', cycleId);

  if (updateErr) {
    throw new Error(`Gagal memperbarui status siklus pencairan menjadi COMPLETED: ${updateErr.message}`);
  }

  return {
    success: true,
    cycleId,
    totalMembers: simulation.totalMembers,
    totalAmount: simulation.totalAmount,
    executionMode: 'client_fallback'
  };
}

/**
 * 5. rejectDisbursementDraft()
 * Menolak / membatalkan draf siklus pencairan lebaran (status menjadi 'REJECTED').
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
 * 6. getLebaranDisbursementCycles()
 * Mengambil seluruh riwayat siklus pencairan dari tabel `lebaran_disbursement_cycles`
 * diurutkan berdasarkan waktu pembuatan terbaru (created_at DESC).
 */
export async function getLebaranDisbursementCycles(): Promise<LebaranDisbursementCycle[]> {
  const { data, error } = await supabase
    .from('lebaran_disbursement_cycles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Gagal memuat daftar siklus pencairan simpanan lebaran: ${error.message}`);
  }

  return (data || []) as LebaranDisbursementCycle[];
}

/**
 * 7. getLastCompletedLebaranCycle()
 * Mengambil 1 record siklus pencairan terakhir yang berstatus 'COMPLETED'
 * untuk referensi cut-off date periode sebelumnya.
 */
export async function getLastCompletedLebaranCycle(): Promise<LebaranDisbursementCycle | null> {
  try {
    const { data, error } = await supabase
      .from('lebaran_disbursement_cycles')
      .select('*')
      .eq('status', 'COMPLETED')
      .order('cut_off_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('Gagal memuat siklus pencairan lebaran terakhir yang selesai:', error.message);
      return null;
    }

    return (data as LebaranDisbursementCycle) || null;
  } catch (err) {
    console.warn('Exception saat mengambil siklus lebaran terakhir yang selesai:', err);
    return null;
  }
}

export const bulkWithdrawalService = {
  isLebaranDepositType,
  simulateLebaranDisbursement,
  createDisbursementDraft,
  approveAndExecuteDisbursement,
  rejectDisbursementDraft,
  getLebaranDisbursementCycles,
  getLastCompletedLebaranCycle
};
