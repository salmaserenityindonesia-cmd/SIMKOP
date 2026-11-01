import { supabase } from '../lib/supabaseClient';
import type { Anggota } from './koperasiService';

export interface CreateMemberInput {
  nrp: string;
  nama: string;
  pangkat?: string;
  master_thp?: number;
  bank_account_number?: string;
  tgl_awal_anggota?: string;
  status?: string;
  membership_status?: 'ACTIVE' | 'PENDING_RESIGNED' | 'READY_TO_RESIGN' | 'RESIGNED' | 'BLOCKED';
}

export async function createMember(input: CreateMemberInput): Promise<Anggota> {
  let createdAt: string;
  if (input.tgl_awal_anggota && input.tgl_awal_anggota.trim()) {
    const d = new Date(input.tgl_awal_anggota);
    createdAt = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
  } else {
    createdAt = new Date().toISOString();
  }

  const anggotaPayload = {
    nrp: input.nrp.trim(),
    nama: input.nama.trim(),
    pangkat: input.pangkat?.trim() || null,
    master_thp: Number(input.master_thp) || 0,
    bank_account_number: input.bank_account_number?.trim() || null,
    status: input.status || 'aktif',
    membership_status: input.membership_status || 'ACTIVE',
    created_at: createdAt,
  };

  const { data: member, error: memberErr } = await supabase
    .from('anggota')
    .insert([anggotaPayload])
    .select()
    .single();

  if (memberErr) {
    throw new Error(`Gagal mendaftarkan anggota baru: ${memberErr.message}`);
  }

  let { data: dTypes, error: dtErr } = await supabase.from('deposit_types').select('*');
  if (dtErr) {
    console.warn('Gagal memuat deposit_types:', dtErr.message);
  }

  if (!dTypes || dTypes.length === 0) {
    const seeds = [
      { code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
      { code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true },
      { code: 'SB', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: 25000, can_be_withdrawn: true, is_active: true },
      { code: 'SL', name: 'Simpanan Lebaran', frequency_type: 'monthly', default_amount: 30000, can_be_withdrawn: true, is_active: true }
    ];
    const { error: seedErr } = await supabase.from('deposit_types').insert(seeds);
    if (seedErr) {
      console.warn('Gagal membuat data awal deposit_types:', seedErr.message);
    } else {
      const { data: refreshed } = await supabase.from('deposit_types').select('*');
      dTypes = refreshed;
    }
  }

  const toEnroll = (dTypes || []).filter((dt: any) => dt.is_active !== false);
  if (toEnroll.length > 0) {
    const inserts = toEnroll.map((dt: any) => ({
      member_id: member.id,
      deposit_type_id: dt.id,
      is_terminated: false,
    }));
    const { error: insErr } = await supabase.from('member_deposits').insert(inserts);
    if (insErr) {
      console.warn('Gagal menginisialisasi akun simpanan anggota:', insErr.message);
    }
  }

  return member as Anggota;
}

export interface MemberComprehensiveExportRow {
  nrp: string;
  nama: string;
  pangkat: string;
  bank_account_number: string;
  membership_status: string;
  tgl_awal_anggota: string;
  jumlah_simpanan_pokok: number;
  jumlah_simpanan_wajib: number;
  jumlah_simpanan_belanja: number;
  jumlah_simpanan_lebaran: number;
  jumlah_pinjaman: number;
  tgl_awal_pinjaman: string;
  tenor: number;
  sisa_pinjaman: number;
}

function formatSafeDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (!trimmed) return '';
    // Format YYYY-MM-DD
    const match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = String(parseInt(match[2], 10)).padStart(2, '0');
      const d = String(parseInt(match[3], 10)).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getMembersComprehensiveReport(
  memberIds?: string[]
): Promise<MemberComprehensiveExportRow[]> {
  if (memberIds && memberIds.length === 0) {
    return [];
  }

  // Query 1: Anggota
  let memberQuery = supabase
    .from('anggota')
    .select('id, nrp, nama, pangkat, bank_account_number, membership_status, created_at, status');

  if (memberIds && memberIds.length > 0) {
    memberQuery = memberQuery.in('id', memberIds);
  }

  const { data: members, error: memberError } = await memberQuery.order('nama', { ascending: true });
  if (memberError) {
    throw new Error(`Gagal memuat data anggota: ${memberError.message}`);
  }

  if (!members || members.length === 0) {
    return [];
  }

  const targetMemberIds = members.map((m: any) => m.id);

  // Query 2: Simpanan
  let depositsQuery = supabase
    .from('member_deposits')
    .select(`
      member_id,
      deposit_types ( name ),
      deposit_transactions ( amount, transaction_type )
    `);

  if (targetMemberIds.length > 0) {
    depositsQuery = depositsQuery.in('member_id', targetMemberIds);
  }

  const { data: depositsData, error: depositsError } = await depositsQuery;
  if (depositsError) {
    console.warn('Gagal memuat relasi simpanan anggota:', depositsError.message);
  }

  // Agregasi saldo simpanan per member_id dan kategori
  const depositTotals: Record<
    string,
    { pokok: number; wajib: number; belanja: number; lebaran: number }
  > = {};

  if (depositsData) {
    for (const item of depositsData as any[]) {
      const memberId = item.member_id;
      if (!memberId) continue;

      if (!depositTotals[memberId]) {
        depositTotals[memberId] = { pokok: 0, wajib: 0, belanja: 0, lebaran: 0 };
      }

      const typeInfo = Array.isArray(item.deposit_types)
        ? item.deposit_types[0]
        : item.deposit_types;
      const typeName = (typeInfo?.name || '').toLowerCase();

      const txs = Array.isArray(item.deposit_transactions)
        ? item.deposit_transactions
        : [];

      let netBalance = 0;
      for (const tx of txs) {
        const amt = Number(tx.amount || 0);
        if (isNaN(amt)) continue;
        if (tx.transaction_type === 'withdrawal') {
          netBalance -= amt;
        } else {
          netBalance += amt;
        }
      }

      if (typeName.includes('pokok')) {
        depositTotals[memberId].pokok += netBalance;
      } else if (typeName.includes('wajib')) {
        depositTotals[memberId].wajib += netBalance;
      } else if (typeName.includes('belanja')) {
        depositTotals[memberId].belanja += netBalance;
      } else if (typeName.includes('lebaran') || typeName.includes('hari raya')) {
        depositTotals[memberId].lebaran += netBalance;
      }
    }
  }

  // Query 3: Pinjaman Aktif
  let loansQuery = supabase
    .from('loans')
    .select(`
      id, member_id, amount, principal_amount, tenor, agreed_tenor_months, disbursed_at, created_at, status,
      loan_schedules ( id, target_amount, paid_amount, status ),
      loan_repayments ( amount_paid )
    `)
    .in('status', ['active', 'approved']);

  if (targetMemberIds.length > 0) {
    loansQuery = loansQuery.in('member_id', targetMemberIds);
  }

  const { data: loansData, error: loansError } = await loansQuery;
  if (loansError) {
    console.warn('Gagal memuat pinjaman aktif anggota:', loansError.message);
  }

  // Kelompokkan pinjaman per member_id
  const memberLoansMap: Record<string, any[]> = {};
  if (loansData) {
    for (const loan of loansData as any[]) {
      const memberId = loan.member_id;
      if (!memberId) continue;
      if (!memberLoansMap[memberId]) {
        memberLoansMap[memberId] = [];
      }
      memberLoansMap[memberId].push(loan);
    }
  }

  // Petakan ke MemberComprehensiveExportRow[]
  const result: MemberComprehensiveExportRow[] = members.map((m: any) => {
    const dep = depositTotals[m.id] || { pokok: 0, wajib: 0, belanja: 0, lebaran: 0 };
    const memberLoans = memberLoansMap[m.id] || [];

    let jumlahPinjaman = 0;
    let sisaPinjaman = 0;
    let tenor = 0;
    let tglAwalPinjaman = '';

    if (memberLoans.length > 0) {
      for (const loan of memberLoans) {
        const principal = Number(loan.principal_amount || loan.amount || 0);
        jumlahPinjaman += principal;

        let sisa = 0;
        const scheds = Array.isArray(loan.loan_schedules) ? loan.loan_schedules : [];
        if (scheds.length > 0) {
          sisa = scheds
            .filter((s: any) => s.status !== 'paid')
            .reduce((sum: number, s: any) => {
              const target = Number(s.target_amount || 0);
              const paid = Number(s.paid_amount || 0);
              return sum + Math.max(0, target - paid);
            }, 0);
        } else {
          const reps = Array.isArray(loan.loan_repayments) ? loan.loan_repayments : [];
          const paidReps = reps.reduce(
            (sum: number, r: any) => sum + Number(r.amount_paid || 0),
            0
          );
          sisa = Math.max(0, principal - paidReps);
        }
        sisaPinjaman += sisa;

        const loanTenor = Number(loan.agreed_tenor_months || loan.tenor || 0);
        if (loanTenor > tenor) {
          tenor = loanTenor;
        }

        const dateStr = loan.disbursed_at || loan.created_at;
        if (dateStr) {
          const formatted = formatSafeDate(dateStr);
          if (!tglAwalPinjaman || (formatted && formatted < tglAwalPinjaman)) {
            tglAwalPinjaman = formatted;
          }
        }
      }
    }

    return {
      nrp: m.nrp || '',
      nama: m.nama || '',
      pangkat: m.pangkat || '',
      bank_account_number: m.bank_account_number || '',
      membership_status: m.membership_status || m.status || 'ACTIVE',
      tgl_awal_anggota: formatSafeDate(m.tgl_awal_anggota || m.created_at),
      jumlah_simpanan_pokok: Math.max(0, dep.pokok),
      jumlah_simpanan_wajib: Math.max(0, dep.wajib),
      jumlah_simpanan_belanja: Math.max(0, dep.belanja),
      jumlah_simpanan_lebaran: Math.max(0, dep.lebaran),
      jumlah_pinjaman: Math.max(0, jumlahPinjaman),
      tgl_awal_pinjaman: tglAwalPinjaman,
      tenor: Math.max(0, tenor),
      sisa_pinjaman: Math.max(0, sisaPinjaman),
    };
  });

  return result;
}
