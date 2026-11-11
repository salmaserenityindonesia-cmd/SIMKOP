// File: src/services/depositManagementService.ts
// Domain service untuk konfigurasi jenis simpanan, tagihan komitmen bulanan, dan mutasi setoran simpanan

import { supabase } from '../lib/supabaseClient';
import { getActiveSavingsRateTiers } from './savingsRateService';

function shouldFallback(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || "").toLowerCase();
  return e.code === "42P01" || msg.includes("schema cache") || msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch");
}

export interface Simpanan {
  id: string;
  anggota_id: string;
  jenis_simpanan: 'pokok' | 'wajib';
  jumlah: number;
  tanggal: string;
}

export interface DepositType {
  id: string;
  code: string;
  name: string;
  frequency_type: 'one_time' | 'monthly' | 'yearly' | string;
  default_amount: number;
  can_be_withdrawn: boolean;
  is_active: boolean;
  effective_amount?: number;
}

export interface MemberDeposit {
  id: string;
  member_id: string;
  deposit_type_id: string;
  is_terminated?: boolean;
  created_at?: string;
}

export interface DepositTransaction {
  id: string;
  member_deposit_id: string;
  amount: number;
  for_month?: number;
  for_year?: number;
  transaction_type: string;
  description?: string;
  created_at?: string;
}

export interface MonthlyDepositCommitment {
  id?: string;
  member_deposit_id: string;
  member_id: string;
  deposit_type_id: string;
  deposit_name: string;
  commitment_amount: number;
  for_month: number | null;
  for_year: number | null;
  total_paid: number;
  remaining_balance: number;
  status: 'lunas' | 'belum_lunas' | string;
  expected_amount?: number;
  paid_amount?: number;
  anggota?: {
    nama: string;
    nrp: string;
    created_at?: string;
  };
}

export async function getDepositTypes(): Promise<DepositType[]> {
  const { data, error } = await supabase.from('deposit_types').select('*').order('name');
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch deposit types: ${error.message}`);
  }

  const depositTypes = (data || []) as DepositType[];

  try {
    const activeRates = await getActiveSavingsRateTiers();
    return depositTypes.map((dt) => {
      const codeUpper = (dt.code || '').toUpperCase();
      const nameLower = (dt.name || '').toLowerCase();

      let effectiveRate = activeRates[codeUpper];
      if (effectiveRate === undefined || effectiveRate <= 0) {
        if (codeUpper === 'SW' || nameLower.includes('wajib')) {
          effectiveRate = activeRates['WAJIB'] || activeRates['SW'];
        } else if (codeUpper === 'SB' || nameLower.includes('belanja')) {
          effectiveRate = activeRates['BELANJA'] || activeRates['SB'];
        } else if (codeUpper === 'SL' || nameLower.includes('lebaran') || nameLower.includes('hari raya')) {
          effectiveRate = activeRates['LEBARAN'] || activeRates['SL'];
        } else if (codeUpper === 'SP' || codeUpper === 'POKOK' || nameLower.includes('pokok')) {
          effectiveRate = activeRates['POKOK'] || activeRates['SP'];
        }
      }

      return {
        ...dt,
        effective_amount: (effectiveRate !== undefined && effectiveRate > 0) ? effectiveRate : dt.default_amount
      };
    });
  } catch (err) {
    console.warn('Gagal menyinkronkan tarif bertingkat ke deposit_types:', err);
    return depositTypes.map((dt) => ({
      ...dt,
      effective_amount: dt.default_amount
    }));
  }
}

export async function addDepositType(depositType: Omit<DepositType, 'id'>): Promise<DepositType> {
  const { data, error } = await supabase.from('deposit_types').insert([depositType]).select().single();
  if (error) {
    throw new Error(`Failed to add deposit type: ${error.message}`);
  }
  return data as DepositType;
}

export async function updateDepositType(id: string, updates: Partial<Omit<DepositType, 'id'>>): Promise<DepositType> {
  const { data, error } = await supabase.from('deposit_types').update(updates).eq('id', id).select().single();
  if (error) {
    throw new Error(`Failed to update deposit type: ${error.message}`);
  }
  return data as DepositType;
}

export async function deleteDepositType(id: string): Promise<void> {
  const { error } = await supabase.from('deposit_types').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete deposit type: ${error.message}`);
  }
}

export async function getMemberDeposits(memberId: string): Promise<MemberDeposit[]> {
  const { data, error } = await supabase.from('member_deposits').select('*').eq('member_id', memberId);
  if (error) {
    if (shouldFallback(error)) return [];
    throw new Error(`Failed to fetch member deposits: ${error.message}`);
  }
  return data as MemberDeposit[];
}

export async function ensureMandatoryDepositsAndEnroll(memberId: string) {
  // 1. Fetch deposit_types
  let { data: dTypes, error: dtError } = await supabase.from('deposit_types').select('*');
  if (dtError) {
    throw new Error(`Gagal memuat deposit_types: ${dtError.message}. Pastikan tabel deposit_types sudah dibuat di Supabase.`);
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
      throw new Error(`Gagal membuat data awal deposit_types: ${seedErr.message}`);
    }
    const { data: refreshed } = await supabase.from('deposit_types').select('*');
    dTypes = refreshed;
  }

  // 2. Fetch member_deposits for this member
  const { data: mDeposits, error: mdFetchErr } = await supabase.from('member_deposits').select('*').eq('member_id', memberId);
  if (mdFetchErr) {
    throw new Error(`Gagal memuat member_deposits: ${mdFetchErr.message}. Pastikan tabel member_deposits sudah dibuat.`);
  }
  
  const enrolledTypeIds = mDeposits?.map(md => md.deposit_type_id) || [];

  // 3. Enroll missing
  const toEnroll = dTypes?.filter(dt => !enrolledTypeIds.includes(dt.id) && dt.is_active) || [];
  if (toEnroll.length > 0) {
    const inserts = toEnroll.map(dt => ({
      member_id: memberId,
      deposit_type_id: dt.id
    }));
    const { error: insertErr } = await supabase.from('member_deposits').insert(inserts);
    if (insertErr) {
      console.error(`Gagal mendaftarkan anggota ke simpanan otomatis (member_deposits): ${insertErr.message}`);
    }
  }
}

export async function getMemberDepositBills(memberId: string, month: number, year: number) {
  await ensureMandatoryDepositsAndEnroll(memberId);
  const dTypes = await getDepositTypes();
  const mDeposits = await getMemberDeposits(memberId);

  const mdIds = mDeposits.map(md => md.id);
  let txs: any[] = [];
  if (mdIds.length > 0) {
    const { data } = await supabase.from('deposit_transactions').select('*').in('member_deposit_id', mdIds);
    if (data) txs = data;
  }
  
  const bills = [];
  for (const dt of dTypes) {
    if (!dt.is_active) continue;

    const md = mDeposits.find(m => m.deposit_type_id === dt.id) || {
      id: `mock-md-${dt.id}`,
      deposit_type_id: dt.id,
      member_id: memberId
    };

    if (dt.frequency_type === 'one_time' || dt.frequency_type === 'once') {
      const totalPaid = txs.filter(tx => tx.member_deposit_id === md.id).reduce((sum, tx) => sum + tx.amount, 0);
      const remaining = dt.default_amount - totalPaid;
      if (remaining > 0) {
        bills.push({
          member_deposit_id: md.id,
          deposit_name: dt.name,
          remaining_balance: remaining
        });
      }
    } else if (dt.frequency_type === 'monthly') {
      const totalPaid = txs
        .filter(tx => tx.member_deposit_id === md.id && tx.for_month === month && tx.for_year === year)
        .reduce((sum, tx) => sum + tx.amount, 0);
      const remaining = dt.default_amount - totalPaid;
      if (remaining > 0) {
        bills.push({
          member_deposit_id: md.id,
          deposit_name: dt.name,
          remaining_balance: remaining
        });
      }
    }
  }
  return bills;
}

export async function addDepositTransaction(
  member_deposit_id: string, 
  amount: number, 
  for_month: number, 
  for_year: number, 
  transaction_type: string = 'deposit',
  description: string = 'Pembayaran cicilan simpanan'
) {
  const { data, error } = await supabase
    .from('deposit_transactions')
    .insert([{
      member_deposit_id,
      amount,
      for_month,
      for_year,
      transaction_type,
      description
    }])
    .select()
    .single();

  if (error) {
    throw new Error(`Gagal menyimpan transaksi simpanan ke Supabase: ${error.message}`);
  }
  return data;
}

export async function getMonthlyDepositCommitments(month?: number, year?: number): Promise<MonthlyDepositCommitment[]> {
  let query = supabase.from('monthly_deposit_commitments').select(`
    *,
    anggota!member_id (nama, nrp, created_at)
  `);
  
  if (month) query = query.eq('for_month', month);
  if (year) query = query.eq('for_year', year);

  const { data, error } = await query;
  
  if (error) {
    if (shouldFallback(error)) {
      console.warn('View "monthly_deposit_commitments" does not exist yet. Returning empty array.');
      return [];
    }
    throw new Error(`Failed to fetch monthly deposit commitments: ${error.message}`);
  }
  
  // Filter out commitments that are prior to the member's join date
  const filteredData = (data || []).filter((c: any) => {
    if (!c.anggota?.created_at) return true; // If no created_at, assume valid
    
    const joinDate = new Date(c.anggota.created_at);
    const joinMonth = joinDate.getMonth() + 1; // 1-12
    const joinYear = joinDate.getFullYear();
    
    const commitMonth = c.for_month;
    const commitYear = c.for_year;
    
    // If commitment year is before join year, exclude
    if (commitYear < joinYear) return false;
    // If commitment year is same as join year, but month is before join month, exclude
    if (commitYear === joinYear && commitMonth < joinMonth) return false;
    
    return true;
  });
  
  return filteredData as MonthlyDepositCommitment[];
}
