import { supabase } from '../lib/supabaseClient';
import type { Simpanan } from './depositManagementService';
import { getActiveSavingsRateTiers } from './savingsRateService';
import { normalizeName, type InitialSavingsRow } from '../utils/initialSavingsParser';
import {
  syncOpeningSavingsBalanceToCashFlow,
  syncInitialSavingsOpeningCashFlow,
} from './cashFlowService';
import {
  parseBirthDateInput,
  formatTanggalLahir,
  formatTanggalLahirLong,
  hitungUsia,
  formatTanggalLahirWithAge,
  formatBirthDate,
  calculateAge,
} from '../utils/dateUtils';

export type { InitialSavingsRow };
export {
  syncOpeningSavingsBalanceToCashFlow,
  syncInitialSavingsOpeningCashFlow,
  parseBirthDateInput,
  formatTanggalLahir,
  formatTanggalLahirLong,
  hitungUsia,
  formatTanggalLahirWithAge,
  formatBirthDate,
  calculateAge,
};

function shouldFallback(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || "").toLowerCase();
  return e.code === "42P01" || msg.includes("schema cache") || msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch");
}

export interface Anggota {
  id: string;
  nomor_referensi?: string | null;
  nrp: string;
  nama: string;
  tanggal_lahir?: string | null;
  status?: string;
  membership_status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_RESIGNED' | 'READY_TO_RESIGN' | 'RESIGNED' | 'BLOCKED';
  suspended_at?: string | null;
  suspension_reason?: string | null;
  master_thp?: number;
  take_home_pay?: number;
  bank_account_number?: string;
  created_at?: string;
}

export interface AnggotaWithSimpanan extends Anggota {
  simpanan_pokok: number;
  simpanan_wajib: number;
  total_saldo: number;
}

export interface ImportMembersChunkedResult {
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  errors: string[];
}

export interface MemberImportInput {
  nomor_referensi?: string | null;
  nrp: string;
  nama: string;
  tanggal_lahir?: string | null;
  bank_account_number?: string | null;
  status?: string;
  membership_status?: string;
  master_thp?: number;
  tgl_awal_anggota?: string | null;
  created_at?: string | null;
  jumlah_simpanan_pokok?: number;
  jumlah_simpanan_wajib?: number;
  jumlah_simpanan_belanja?: number;
  jumlah_simpanan_lebaran?: number;
  [key: string]: any;
}

export interface CreateMemberInput {
  nomor_referensi?: string | null;
  nrp: string;
  nama: string;
  tanggal_lahir?: string | null;
  master_thp?: number;
  take_home_pay?: number;
  bank_account_number?: string;
  tgl_awal_anggota?: string;
  status?: string;
  membership_status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING_RESIGNED' | 'READY_TO_RESIGN' | 'RESIGNED' | 'BLOCKED';
  suspended_at?: string | null;
  suspension_reason?: string | null;
}

export async function createMember(input: CreateMemberInput): Promise<Anggota> {
  let createdAt: string;
  if (input.tgl_awal_anggota && input.tgl_awal_anggota.trim()) {
    const d = new Date(input.tgl_awal_anggota);
    createdAt = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
  } else {
    createdAt = new Date().toISOString();
  }

  const resolvedMembershipStatus = input.membership_status || 'ACTIVE';
  const resolvedStatus = input.status || (resolvedMembershipStatus === 'ACTIVE' ? 'aktif' : 'nonaktif');

  const anggotaPayload: Record<string, any> = {
    nomor_referensi: input.nomor_referensi?.trim() || null,
    nrp: input.nrp.trim(),
    nama: input.nama.trim(),
    tanggal_lahir: parseBirthDateInput(input.tanggal_lahir),
    master_thp: Number(input.master_thp) || 0,
    bank_account_number: input.bank_account_number?.trim() || null,
    status: resolvedStatus,
    membership_status: resolvedMembershipStatus,
    created_at: createdAt,
  };

  if (input.take_home_pay !== undefined) {
    anggotaPayload.take_home_pay = Number(input.take_home_pay) || 0;
  }

  if (resolvedMembershipStatus === 'SUSPENDED' || input.suspended_at !== undefined) {
    anggotaPayload.suspended_at = input.suspended_at ?? new Date().toISOString();
  }
  if (resolvedMembershipStatus === 'SUSPENDED' || input.suspension_reason !== undefined) {
    anggotaPayload.suspension_reason = input.suspension_reason ?? null;
  }

  let { data: member, error: memberErr } = await supabase
    .from('anggota')
    .insert([anggotaPayload])
    .select()
    .single();

  if (
    memberErr &&
    'take_home_pay' in anggotaPayload &&
    String(memberErr.message || '').toLowerCase().includes('take_home_pay')
  ) {
    const fallbackPayload = { ...anggotaPayload };
    delete fallbackPayload.take_home_pay;
    const retryRes = await supabase
      .from('anggota')
      .insert([fallbackPayload])
      .select()
      .single();
    member = retryRes.data;
    memberErr = retryRes.error;
  }

  if (memberErr) {
    throw new Error(`Gagal mendaftarkan anggota baru: ${memberErr.message}`);
  }

  let { data: dTypes, error: dtErr } = await supabase.from('deposit_types').select('*');
  if (dtErr) {
    console.warn('Gagal memuat deposit_types:', dtErr.message);
  }

  if (!dTypes || dTypes.length === 0) {
    let activeRates: Record<string, number> = {};
    try {
      activeRates = await getActiveSavingsRateTiers();
    } catch (e) {
      console.warn('Gagal memuat tarif bertingkat saat seeding deposit_types:', e);
    }

    const seeds = [
      { code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: activeRates['POKOK'] || activeRates['SP'] || 100000, can_be_withdrawn: false, is_active: true },
      { code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: activeRates['WAJIB'] || activeRates['SW'] || 50000, can_be_withdrawn: false, is_active: true },
      { code: 'SB', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: activeRates['BELANJA'] || activeRates['SB'] || 25000, can_be_withdrawn: true, is_active: true },
      { code: 'SL', name: 'Simpanan Lebaran', frequency_type: 'monthly', default_amount: activeRates['LEBARAN'] || activeRates['SL'] || 30000, can_be_withdrawn: true, is_active: true }
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

export async function getAnggotaWithSimpanan(): Promise<AnggotaWithSimpanan[]> {
  const { data: anggotaData, error: anggotaError } = await supabase
    .from('anggota')
    .select('*')
    .order('created_at', { ascending: false });

  if (anggotaError) {
    if (shouldFallback(anggotaError)) {
      console.warn('Table "anggota" does not exist yet. Returning dummy data.');
      return [
        {
          id: 'dummy-anggota-1',
          nama: 'Budi Santoso',
          nrp: '123456',
          tanggal_lahir: '1985-05-20',
          status: 'aktif',
          created_at: new Date().toISOString(),
          simpanan_pokok: 100000,
          simpanan_wajib: 50000,
          total_saldo: 150000
        },
        {
          id: 'dummy-anggota-2',
          nama: 'Siti Aminah',
          nrp: '654321',
          tanggal_lahir: '1988-11-10',
          status: 'aktif',
          created_at: new Date().toISOString(),
          simpanan_pokok: 100000,
          simpanan_wajib: 200000,
          total_saldo: 300000
        }
      ];
    }
    console.error('Error fetching anggota:', anggotaError.message);
    throw new Error(`Failed to fetch anggota: ${anggotaError.message}`);
  }

  const { data: simpananData, error: simpananError } = await supabase
    .from('simpanan')
    .select('*');

  let simpananList: Simpanan[] = [];
  if (!simpananError && simpananData) {
    simpananList = simpananData as Simpanan[];
  }

  const result = (anggotaData as Anggota[]).map(a => {
    const s = simpananList.filter(sim => sim.anggota_id === a.id);
    const pokok = s.filter(sim => sim.jenis_simpanan === 'pokok').reduce((sum, sim) => sum + sim.jumlah, 0);
    const wajib = s.filter(sim => sim.jenis_simpanan === 'wajib').reduce((sum, sim) => sum + sim.jumlah, 0);
    return {
      ...a,
      simpanan_pokok: pokok,
      simpanan_wajib: wajib,
      total_saldo: pokok + wajib
    };
  });

  return result;
}

// --- Anggota CRUD ---

/**
 * Paged query untuk memuat seluruh anggota koperasi (>1.000 anggota)
 * tanpa terpotong batas default PostgREST (1.000 baris).
 */
export async function fetchAllAnggotaPaged(): Promise<Anggota[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;
  let allData: Anggota[] = [];

  while (hasMore) {
    const { data, error } = await supabase
      .from('anggota')
      .select('*')
      .order('nama', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      if (shouldFallback(error)) {
        console.warn('Table "anggota" does not exist yet. Returning empty array.');
        return [];
      }
      console.error('Error fetching paged anggota:', error.message);
      throw new Error(`Gagal mengambil data anggota: ${error.message}`);
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as Anggota[]);
      from += PAGE_SIZE;
      if (data.length < PAGE_SIZE) {
        hasMore = false;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}

export const fetchAnggota = fetchAllAnggotaPaged;

export async function getAnggota(): Promise<Anggota[]> {
  return fetchAllAnggotaPaged();
}

export async function addAnggota(data: Omit<Anggota, 'id' | 'created_at'>): Promise<Anggota> {
  const { data: result, error } = await supabase
    .from('anggota')
    .insert([data])
    .select()
    .single();

  if (error) {
    console.error('Error inserting anggota:', error.message);
    throw new Error(`Gagal menambah anggota: ${error.message}`);
  }

  return result as Anggota;
}

export async function updateAnggota(id: string, updates: Partial<Omit<Anggota, 'id' | 'created_at'>>): Promise<Anggota> {
  const payload: Partial<Omit<Anggota, 'id' | 'created_at'>> = { ...updates };

  if (updates.master_thp !== undefined && updates.take_home_pay === undefined) {
    payload.take_home_pay = Number(updates.master_thp) || 0;
  }

  if (updates.membership_status) {
    payload.status = updates.membership_status === 'ACTIVE' ? 'aktif' : 'nonaktif';
    if (updates.membership_status === 'SUSPENDED') {
      payload.suspended_at = updates.suspended_at ?? new Date().toISOString();
      payload.suspension_reason = updates.suspension_reason ?? null;
    } else if (updates.membership_status === 'ACTIVE') {
      payload.suspended_at = null;
      payload.suspension_reason = null;
    }
  }

  let { data, error } = await supabase
    .from('anggota')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (
    error &&
    'take_home_pay' in payload &&
    String(error.message || '').toLowerCase().includes('take_home_pay')
  ) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.take_home_pay;
    const retryRes = await supabase
      .from('anggota')
      .update(fallbackPayload)
      .eq('id', id)
      .select()
      .single();
    data = retryRes.data;
    error = retryRes.error;
  }

  if (error) {
    console.error(`Error updating anggota ${id}:`, error.message);
    throw new Error(`Gagal mengupdate anggota: ${error.message}`);
  }

  if (updates.membership_status) {
    try {
      const auditTable: any = supabase.from('audit_logs');
      if (auditTable && typeof auditTable.insert === 'function') {
        await auditTable.insert([{
          table_name: 'anggota',
          action:
            updates.membership_status === 'SUSPENDED'
              ? 'SUSPEND_MEMBER'
              : updates.membership_status === 'ACTIVE'
              ? 'ACTIVATE_MEMBER'
              : 'UPDATE_STATUS',
          record_id: id,
          entity_name: 'anggota',
          entity_id: id,
          new_data: payload,
          notes:
            updates.suspension_reason ||
            (updates.membership_status === 'ACTIVE'
              ? 'Aktivasi kembali anggota'
              : `Perubahan status ke ${updates.membership_status}`),
        }]);
      }
    } catch (auditErr) {
      console.warn('Gagal mencatat audit log perubahan status anggota:', auditErr);
    }
  }

  return data as Anggota;
}

export interface UpdateMemberSuspensionPayload {
  memberId: string;
  memberName: string;
  memberNrp: string;
  oldStatus: string;
  newStatus: 'ACTIVE' | 'SUSPENDED';
  reason: string;
  userId?: string;
}

export async function updateMemberSuspensionStatus(
  payload: UpdateMemberSuspensionPayload
): Promise<void> {
  const trimmedReason = (payload.reason || '').trim();
  if (!trimmedReason) {
    throw new Error('Alasan perubahan status keanggotaan wajib diisi.');
  }

  const isSuspending = payload.newStatus === 'SUSPENDED';
  const updateData: Record<string, any> = {
    membership_status: payload.newStatus,
    status: isSuspending ? 'nonaktif' : 'aktif',
    suspended_at: isSuspending ? new Date().toISOString() : null,
    suspension_reason: isSuspending ? trimmedReason : null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('anggota')
    .update(updateData)
    .eq('id', payload.memberId);

  if (error) {
    throw new Error(`Gagal memperbarui status keanggotaan: ${error.message}`);
  }

  try {
    const auditTable: any = supabase.from('audit_logs');
    if (auditTable && typeof auditTable.insert === 'function') {
      await auditTable.insert({
        table_name: 'anggota',
        action: isSuspending ? 'SUSPEND_MEMBER' : 'REACTIVATE_MEMBER',
        record_id: payload.memberId,
        entity_name: 'anggota',
        entity_id: payload.memberId,
        old_data: { membership_status: payload.oldStatus },
        new_data: { membership_status: payload.newStatus, reason: trimmedReason },
        performed_by: payload.userId || null,
        notes: `${isSuspending ? 'Pembekuan Sementara' : 'Aktivasi Kembali'} Anggota ${payload.memberName} (${payload.memberNrp}) - Alasan: ${trimmedReason}`,
      });
    }
  } catch (auditErr) {
    console.warn('Gagal mencatat audit log perubahan status anggota:', auditErr);
  }
}

export async function deleteAnggota(id: string): Promise<void> {
  const { error } = await supabase
    .from('anggota')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Error deleting anggota ${id}:`, error.message);
    throw new Error(`Gagal menghapus anggota: ${error.message}`);
  }
}

// --- Mass Member Chunked Import & Auto-Provisioning Engine ---

/**
 * Engine impor anggota massal dengan chunking (100 baris per batch),
 * auto-provisioning rekening simpanan, dan inisialisasi saldo awal.
 */
export async function importMembersChunked(
  parsedMemberList: MemberImportInput[],
  onProgress?: (currentCount: number, totalCount: number) => void
): Promise<ImportMembersChunkedResult> {
  const result: ImportMembersChunkedResult = {
    totalProcessed: 0,
    successCount: 0,
    failedCount: 0,
    errors: [],
  };

  if (!parsedMemberList || parsedMemberList.length === 0) {
    return result;
  }

  // 1. Ambil daftar master deposit_types (ID untuk 'POKOK', 'WAJIB', 'BELANJA', 'LEBARAN')
  let { data: dTypes, error: dtErr } = await supabase.from('deposit_types').select('*');
  if (dtErr) {
    console.warn('Gagal memuat deposit_types:', dtErr.message);
  }

  if (!dTypes || dTypes.length === 0) {
    const seeds = [
      { code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
      { code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true },
      { code: 'SB', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: 25000, can_be_withdrawn: true, is_active: true },
      { code: 'SL', name: 'Simpanan Lebaran', frequency_type: 'monthly', default_amount: 30000, can_be_withdrawn: true, is_active: true },
    ];
    try {
      await supabase.from('deposit_types').insert(seeds);
      const { data: refreshed } = await supabase.from('deposit_types').select('*');
      dTypes = refreshed;
    } catch (e: any) {
      console.warn('Gagal seeding deposit_types:', e?.message);
    }
  }

  const typeMap: Record<string, string> = {};
  (dTypes || []).forEach((dt: any) => {
    if (dt.name) typeMap[dt.name.toLowerCase()] = dt.id;
    if (dt.code) typeMap[dt.code.toLowerCase()] = dt.id;
  });

  const keys = Object.keys(typeMap);
  const typePokok = typeMap[keys.find(k => k.includes('pokok') || k === 'sp') || ''];
  const typeWajib = typeMap[keys.find(k => k.includes('wajib') || k === 'sw') || ''];
  const typeBelanja = typeMap[keys.find(k => k.includes('belanja') || k === 'sb') || ''];
  const typeLebaran = typeMap[keys.find(k => k.includes('lebaran') || k.includes('hari raya') || k === 'sl') || ''];
  const defaultDepositTypeIds = [typePokok, typeWajib, typeBelanja, typeLebaran].filter(Boolean);

  // 2. Tentukan ukuran chunk: const CHUNK_SIZE = 100;
  const CHUNK_SIZE = 100;
  const totalCount = parsedMemberList.length;

  // 3. Loop array anggota dalam potongan chunk:
  for (let i = 0; i < totalCount; i += CHUNK_SIZE) {
    const chunk = parsedMemberList.slice(i, i + CHUNK_SIZE);

    try {
      // Langkah A (Insert / Upsert Anggota):
      const memberPayloads = chunk
        .map((m) => {
          let createdAt = new Date().toISOString();
          if (m.tgl_awal_anggota && String(m.tgl_awal_anggota).trim()) {
            const d = new Date(m.tgl_awal_anggota);
            if (!isNaN(d.getTime())) createdAt = d.toISOString();
          } else if (m.created_at) {
            const d = new Date(m.created_at);
            if (!isNaN(d.getTime())) createdAt = d.toISOString();
          }

          return {
            nomor_referensi: m.nomor_referensi ? String(m.nomor_referensi).trim() : null,
            nrp: String(m.nrp || '').trim(),
            nama: String(m.nama || '').trim(),
            tanggal_lahir: parseBirthDateInput(m.tanggal_lahir),
            bank_account_number: m.bank_account_number ? String(m.bank_account_number).trim() : null,
            status: m.status || 'aktif',
            membership_status: m.membership_status || 'ACTIVE',
            created_at: createdAt,
          };
        })
        .filter((m) => m.nrp && m.nama);

      if (memberPayloads.length === 0) {
        result.totalProcessed += chunk.length;
        result.failedCount += chunk.length;
        result.errors.push(`Batch ${Math.floor(i / CHUNK_SIZE) + 1}: Data anggota tidak memiliki NRP atau Nama yang valid.`);
        onProgress?.(result.totalProcessed, totalCount);
        continue;
      }

      const { error: upsertErr } = await supabase
        .from('anggota')
        .upsert(memberPayloads, { onConflict: 'nrp' });

      if (upsertErr) {
        throw new Error(`Gagal upsert batch anggota: ${upsertErr.message}`);
      }

      // Langkah B (Ambil ID Anggota Batch Tersebut):
      const chunkNrps = memberPayloads.map((p) => p.nrp);
      const { data: dbMembers, error: fetchErr } = await supabase
        .from('anggota')
        .select('id, nrp, created_at')
        .in('nrp', chunkNrps);

      if (fetchErr || !dbMembers || dbMembers.length === 0) {
        throw new Error(`Gagal mengambil ID anggota batch: ${fetchErr?.message || 'Data kosong'}`);
      }

      const memberIdMap = new Map<string, string>();
      const memberCreatedMap = new Map<string, string>();
      dbMembers.forEach((dm: any) => {
        memberIdMap.set(dm.nrp, dm.id);
        if (dm.created_at) memberCreatedMap.set(dm.id, dm.created_at);
      });

      const memberIds = Array.from(memberIdMap.values());

      // Langkah C (Auto-Provisioning member_deposits):
      if (defaultDepositTypeIds.length > 0 && memberIds.length > 0) {
        const { data: existingDeposits } = await supabase
          .from('member_deposits')
          .select('id, member_id, deposit_type_id')
          .in('member_id', memberIds);

        const existingSet = new Set(
          (existingDeposits || []).map((ed: any) => `${ed.member_id}_${ed.deposit_type_id}`)
        );

        const depositsToInsert: any[] = [];
        for (const mid of memberIds) {
          for (const dtId of defaultDepositTypeIds) {
            if (!existingSet.has(`${mid}_${dtId}`)) {
              depositsToInsert.push({
                member_id: mid,
                deposit_type_id: dtId,
                is_terminated: false,
              });
            }
          }
        }

        if (depositsToInsert.length > 0) {
          const { error: insDepErr } = await supabase
            .from('member_deposits')
            .insert(depositsToInsert);
          if (insDepErr) {
            console.warn('Gagal provisioning member_deposits:', insDepErr.message);
          }
        }
      }

      // Langkah D (Clean Overwrite Saldo Simpanan Migrasi per Anggota):
      const { data: allMemberDeposits } = await supabase
        .from('member_deposits')
        .select('id, member_id, deposit_type_id')
        .in('member_id', memberIds);

      const memberDepositLookup = new Map<string, string>();
      (allMemberDeposits || []).forEach((amd: any) => {
        memberDepositLookup.set(`${amd.member_id}_${amd.deposit_type_id}`, amd.id);
      });

      const transactionsToInsert: any[] = [];

      for (const m of chunk) {
        const nrpKey = String(m.nrp || '').trim();
        const mid = memberIdMap.get(nrpKey);
        if (!mid) continue;

        let accounts: any[] = [];
        const selQuery: any = supabase
          .from('member_deposits')
          .select('id, deposit_type:deposit_types(code)');

        if (typeof selQuery?.eq === 'function') {
          const { data: fetchedAccounts } = await selQuery.eq('member_id', mid);
          if (fetchedAccounts && fetchedAccounts.length > 0) {
            accounts = fetchedAccounts;
          }
        }

        if (accounts.length === 0) {
          accounts = (allMemberDeposits || []).filter((amd: any) => amd.member_id === mid);
        }

        const jmlWajib = Number(m.jumlah_simpanan_wajib) || 0;
        const jmlBelanja = Number(m.jumlah_simpanan_belanja) || 0;
        const jmlLebaran = Number(m.jumlah_simpanan_lebaran) || 0;
        const jmlPokok = Number(m.jumlah_simpanan_pokok) || 0;
        const hasPositiveSavings = jmlWajib > 0 || jmlBelanja > 0 || jmlLebaran > 0 || jmlPokok > 0;

        if (hasPositiveSavings && accounts && accounts.length > 0) {
          const accountIds = accounts.map((a: any) => a.id).filter(Boolean);
          if (accountIds.length > 0) {
            const { error: delErr } = await supabase
              .from('deposit_transactions')
              .delete()
              .in('member_deposit_id', accountIds);

            if (delErr) {
              console.error(`Gagal membersihkan mutasi lama anggota ${m.nama}:`, delErr);
              throw delErr;
            }
          }
        }

        const dateStr = m.tgl_awal_anggota || memberCreatedMap.get(mid) || new Date().toISOString();
        const validDate = new Date(dateStr);
        const safeDate = !isNaN(validDate.getTime()) ? validDate : new Date();

        const findAccId = (code: string, fallbackTypeId?: string) => {
          const found = accounts.find((a: any) => {
            const c = a.deposit_type?.code || '';
            return c.toUpperCase() === code.toUpperCase();
          });
          if (found) return found.id;
          if (fallbackTypeId) {
            return memberDepositLookup.get(`${mid}_${fallbackTypeId}`);
          }
          return undefined;
        };

        const wId = findAccId('SW', typeWajib);
        const bId = findAccId('SB', typeBelanja);
        const lId = findAccId('SL', typeLebaran);
        const pId = findAccId('SP', typePokok);

        if (wId && jmlWajib > 0) {
          transactionsToInsert.push({
            member_deposit_id: wId,
            amount: jmlWajib,
            transaction_type: 'deposit',
            description: 'Saldo Awal Migrasi Sistem',
            for_month: null,
            for_year: null,
            created_at: safeDate.toISOString(),
          });
        }

        if (bId && jmlBelanja > 0) {
          transactionsToInsert.push({
            member_deposit_id: bId,
            amount: jmlBelanja,
            transaction_type: 'deposit',
            description: 'Saldo Awal Migrasi Sistem',
            for_month: null,
            for_year: null,
            created_at: safeDate.toISOString(),
          });
        }

        if (lId && jmlLebaran > 0) {
          transactionsToInsert.push({
            member_deposit_id: lId,
            amount: jmlLebaran,
            transaction_type: 'deposit',
            description: 'Saldo Awal Migrasi Sistem',
            for_month: null,
            for_year: null,
            created_at: safeDate.toISOString(),
          });
        }

        if (pId && jmlPokok > 0) {
          transactionsToInsert.push({
            member_deposit_id: pId,
            amount: jmlPokok,
            transaction_type: 'deposit',
            description: 'Saldo Awal Migrasi Sistem',
            for_month: null,
            for_year: null,
            created_at: safeDate.toISOString(),
          });
        }
      }

      if (transactionsToInsert.length > 0) {
        for (let t = 0; t < transactionsToInsert.length; t += 100) {
          const txSubChunk = transactionsToInsert.slice(t, t + 100);
          const { error: txErr } = await supabase
            .from('deposit_transactions')
            .insert(txSubChunk);
          if (txErr) {
            console.warn('Gagal insert batch deposit_transactions:', txErr.message);
          }
        }
      }

      result.totalProcessed += chunk.length;
      result.successCount += chunk.length;
    } catch (batchErr: any) {
      result.totalProcessed += chunk.length;
      result.failedCount += chunk.length;
      const errorMsg = `Batch ${Math.floor(i / CHUNK_SIZE) + 1} (${chunk.length} data): ${batchErr?.message || 'Gagal'}`;
      result.errors.push(errorMsg);
      console.error(errorMsg, batchErr);
    }

    onProgress?.(result.totalProcessed, totalCount);
  }

  return result;
}

export const batchInsertMembers = importMembersChunked;
export const processBatchMemberMigration = importMembersChunked;
export const executeMemberMigration = importMembersFromExcel;

export async function importMembersFromExcel(
  fileOrBuffer: File | ArrayBuffer,
  onProgress?: (currentCount: number, totalCount: number) => void
): Promise<ImportMembersChunkedResult> {
  const { parseMemberExcel } = await import('../utils/memberExcelParser');
  const parseResult = await parseMemberExcel(fileOrBuffer);
  if (parseResult.errors.length > 0 && parseResult.rows.length === 0) {
    throw new Error(`Gagal mem-parsing file Excel: ${parseResult.errors.join(', ')}`);
  }
  return importMembersChunked(parseResult.rows, onProgress);
}

/**
 * Mengambil nilai acuan tarif simpanan aktif (Simpanan Pokok, Wajib, Belanja, Lebaran)
 * untuk digunakan pada pendaftaran anggota baru atau validasi default rekening simpanan.
 */
export async function getActiveMemberDepositDefaults(): Promise<{
  pokok: number;
  wajib: number;
  belanja: number;
  lebaran: number;
}> {
  let activeRates: Record<string, number> = {};
  try {
    activeRates = await getActiveSavingsRateTiers();
  } catch (e) {
    console.warn('Gagal memuat tarif bertingkat untuk default anggota:', e);
  }

  return {
    pokok: activeRates['POKOK'] || activeRates['SP'] || 100000,
    wajib: activeRates['WAJIB'] || activeRates['SW'] || 50000,
    belanja: activeRates['BELANJA'] || activeRates['SB'] || 25000,
    lebaran: activeRates['LEBARAN'] || activeRates['SL'] || 30000,
  };
}

/**
 * Sanitasi nilai numerik THP agar bersih dari karakter non-numerik (Rp, titik, spasi, desimal ,00).
 */
export function cleanThpNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim().replace(/[,.]00$/, '');
  const cleaned = str.replace(/[^0-9]/g, '');
  return Number(cleaned) || 0;
}

/**
 * Ekstraksi nilai THP numerik anggota dengan fallback berurutan dan pembersihan karakter non-numerik.
 * Mendukung variasi kolom: take_home_pay, master_thp, salary.
 */
export function extractMemberTHP(member: any): number {
  if (!member) return 0;
  // Cari kolom yang memiliki nominal > 0 terlebih dahulu
  const candidates = [
    member.master_thp,
    member.take_home_pay,
    member.gaji_pokok,
    member.base_salary,
    member.salary,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') {
      const num = cleanThpNumber(c);
      if (num > 0) return num;
    }
  }
  const rawThp = member.master_thp ?? member.take_home_pay ?? member.gaji_pokok ?? member.base_salary ?? member.salary ?? 0;
  return cleanThpNumber(rawThp);
}

/**
 * Mengambil daftar anggota aktif dengan kolom data gaji lengkap untuk keperluan pinjaman.
 */
export async function getActiveMembersForLoan() {
  let { data, error } = await supabase
    .from('anggota')
    .select('id, nrp, nama, tanggal_lahir, take_home_pay, master_thp, salary, bank_account_number, status, membership_status')
    .eq('status', 'aktif')
    .order('nama');

  if (error) {
    const fallback = await supabase
      .from('anggota')
      .select('*')
      .eq('status', 'aktif')
      .order('nama');
    data = fallback.data;
  }

  return (data || []).filter(
    (m: any) =>
      (!m.status || String(m.status).toLowerCase() === 'aktif') &&
      (!m.membership_status || String(m.membership_status).toUpperCase() === 'ACTIVE')
  );
}

export interface MemberComprehensiveExportRow {
  nrp: string;
  nama: string;
  tanggal_lahir: string;
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
    .select('id, nomor_referensi, nrp, nama, tanggal_lahir, bank_account_number, membership_status, created_at, status');

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
      tanggal_lahir: formatSafeDate(m.tanggal_lahir),
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

export const RESET_MEMBERS_CONFIRMATION_PHRASE = 'RESET ANGGOTA' as const;

export interface ResetMembersResult {
  success: boolean;
  members_deleted?: number;
  cash_flow_deleted?: number;
  loans_deleted?: number;
  deposits_deleted?: number;
  message?: string;
}

/**
 * Mengosongkan seluruh data anggota dan mutasi terkait secara permanen melalui
 * RPC PostgreSQL atomik `reset_all_members_data` (TRUNCATE ... RESTART IDENTITY CASCADE).
 */
export async function resetAllMembersData(
  confirmationPhrase: string = RESET_MEMBERS_CONFIRMATION_PHRASE
): Promise<ResetMembersResult> {
  const trimmedPhrase = (confirmationPhrase ?? '').trim();
  if (trimmedPhrase !== RESET_MEMBERS_CONFIRMATION_PHRASE) {
    throw new Error(`Konfirmasi tidak valid. Ketik tepat: ${RESET_MEMBERS_CONFIRMATION_PHRASE}`);
  }

  const { data, error } = await supabase.rpc('reset_all_members_data', {
    p_confirmation_phrase: trimmedPhrase,
  });

  if (error) {
    const rawMsg = String(error.message || '');
    if (
      error.code === 'PGRST202' ||
      rawMsg.includes('schema cache') ||
      rawMsg.includes('Could not find the function')
    ) {
      throw new Error(
        'Fungsi database reset_all_members_data belum terpasang di Supabase. Jalankan migrasi supabase/migrations/20261122_add_reset_all_members_rpc.sql di SQL Editor Supabase terlebih dahulu.'
      );
    }
    throw new Error(rawMsg || 'Gagal mengosongkan data anggota.');
  }

  await syncOpeningSavingsBalanceToCashFlow().catch((cfErr) => {
    console.warn('Gagal menyinkronkan cash_flow setelah reset anggota:', cfErr);
  });

  const payload = data && typeof data === 'object' ? (data as Record<string, any>) : {};
  return {
    success: payload.success ?? true,
    members_deleted: typeof payload.members_deleted === 'number' ? payload.members_deleted : 0,
    cash_flow_deleted: typeof payload.cash_flow_deleted === 'number' ? payload.cash_flow_deleted : 0,
    message:
      payload.message || 'Seluruh data anggota dan mutasi terkait berhasil dikosongkan.',
  };
}

export {
  syncInitialLoanBalances,
  type InitialLoansSyncResult,
} from './loanService';

export interface InitialSavingsSyncResult {
  updatedCount: number;
  skippedNrps: string[];
  effectiveDate: string;
}

/**
 * Menyimpan saldo awal simpanan anggota (Pokok, Wajib, Belanja, Lebaran) berdasarkan NRP
 * dengan prinsip Clean Overwrite dan mencatat tanggal aktif saldo awal ke system_settings & audit_logs.
 */
export async function syncInitialSavingsBalances(
  rows: InitialSavingsRow[],
  effectiveDate: string,
  onProgress?: (current: number, total: number, currentMemberName?: string) => void
): Promise<InitialSavingsSyncResult> {
  const trimmedDate = typeof effectiveDate === 'string' ? effectiveDate.trim() : '';
  if (!trimmedDate || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
    throw new Error('Tanggal aktif saldo awal wajib diisi dengan format YYYY-MM-DD yang valid.');
  }

  const cutOffIso = `${trimmedDate}T00:00:00.000Z`;
  const parsedEffectiveDate = new Date(cutOffIso);
  if (isNaN(parsedEffectiveDate.getTime())) {
    throw new Error('Tanggal aktif saldo awal wajib diisi dengan format YYYY-MM-DD yang valid.');
  }

  if (!rows || rows.length === 0) {
    throw new Error('Tidak ada data baris saldo awal untuk disimpan.');
  }

  const cutOffYear = Number(trimmedDate.slice(0, 4));
  const cutOffMonth = Number(trimmedDate.slice(5, 7));
  const openingForYear = cutOffMonth > 1 ? cutOffYear : cutOffYear - 1;
  const openingForMonth = cutOffMonth > 1 ? cutOffMonth - 1 : 12;
  const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const openingDescription = `Saldo Awal Cut-Off (s/d ${SHORT_MONTHS[openingForMonth - 1]} ${openingForYear})`;
  const preCutOffFilter =
    cutOffMonth > 1
      ? `and(for_year.eq.${cutOffYear},for_month.lte.${cutOffMonth - 1})`
      : `for_year.lt.${cutOffYear}`;
  const cleanOrFilter = `description.ilike.%saldo awal%,description.ilike.%migrasi%,description.ilike.%cut-off%,${preCutOffFilter}`;

  // 1. Pemetaan NRP -> anggota.id & nama
  let memberRows: Array<{ id: string; nrp: string; nama?: string }> = [];
  const { data: queriedMembers, error: memberFetchErr } = await supabase
    .from('anggota')
    .select('id, nrp, nama');

  if (memberFetchErr) {
    throw new Error(`Gagal memuat data anggota: ${memberFetchErr.message}`);
  }
  memberRows = (queriedMembers || []) as Array<{ id: string; nrp: string; nama?: string }>;

  // Jika jumlah anggota >= 1000, muat seluruh halaman via fetchAllAnggotaPaged agar tidak terpotong
  if (memberRows.length >= 1000) {
    try {
      const paged = await fetchAllAnggotaPaged();
      if (paged.length > memberRows.length) {
        memberRows = paged.map((a) => ({ id: a.id, nrp: a.nrp, nama: a.nama }));
      }
    } catch (e) {
      console.warn('Gagal memuat anggota paged tambahan:', e);
    }
  }

  const memberMap = new Map<string, { id: string; nama?: string }>();
  for (const m of memberRows) {
    if (m.nrp) {
      memberMap.set(String(m.nrp).trim(), { id: m.id, nama: m.nama });
    }
  }

  // 1b. Validasi ketat NRP & Nama sebelum menulis transaksi saldo awal ke database
  for (const row of rows) {
    if (row.isValid === false) {
      throw new Error(row.errorMessage || `Data saldo awal untuk NRP ${row.nrp} tidak valid.`);
    }

    const rowTotal =
      (Number(row.jumlah_simpanan_pokok) || 0) +
      (Number(row.jumlah_simpanan_wajib) || 0) +
      (Number(row.jumlah_simpanan_belanja) || 0) +
      (Number(row.jumlah_simpanan_lebaran) || 0);

    if (rowTotal > 0) {
      const nrpKey = String(row.nrp || '').trim();
      const dbMember = memberMap.get(nrpKey);
      if (!dbMember) {
        throw new Error(
          `NRP ${nrpKey} (${row.nama || '-'}) belum terdaftar di sistem. Silakan isi/impor data anggotanya terlebih dahulu!`
        );
      }
      if (
        dbMember.nama &&
        String(dbMember.nama).trim() !== '' &&
        normalizeName(row.nama) !== normalizeName(dbMember.nama)
      ) {
        throw new Error(
          `Nama tidak cocok! Di Excel tertulis '${row.nama || '-'}', sedangkan di sistem untuk NRP ${nrpKey} terdaftar atas nama '${dbMember.nama}'.`
        );
      }
    }
  }

  // 2. Pemetaan deposit_types (POKOK, WAJIB, BELANJA, LEBARAN)
  let { data: dTypes, error: dtErr } = await supabase.from('deposit_types').select('*');
  if (dtErr) {
    throw new Error(`Gagal memuat jenis simpanan: ${dtErr.message}`);
  }

  const defaultSeedSpecs = [
    {
      codes: ['pokok', 'sp'],
      patterns: ['pokok'],
      seed: { code: 'SP', name: 'Simpanan Pokok', frequency_type: 'one_time', default_amount: 100000, can_be_withdrawn: false, is_active: true },
    },
    {
      codes: ['wajib', 'sw'],
      patterns: ['wajib'],
      seed: { code: 'SW', name: 'Simpanan Wajib', frequency_type: 'monthly', default_amount: 50000, can_be_withdrawn: false, is_active: true },
    },
    {
      codes: ['belanja', 'sb'],
      patterns: ['belanja'],
      seed: { code: 'SB', name: 'Simpanan Belanja', frequency_type: 'monthly', default_amount: 25000, can_be_withdrawn: true, is_active: true },
    },
    {
      codes: ['lebaran', 'sl'],
      patterns: ['lebaran', 'hari raya'],
      seed: { code: 'SL', name: 'Simpanan Lebaran', frequency_type: 'monthly', default_amount: 30000, can_be_withdrawn: true, is_active: true },
    },
  ];

  const buildTypeResolver = (typesList: any[]) => {
    const map: Record<string, string> = {};
    (typesList || []).forEach((dt: any) => {
      if (dt.code) map[String(dt.code).toLowerCase()] = dt.id;
      if (dt.name) map[String(dt.name).toLowerCase()] = dt.id;
    });
    const keys = Object.keys(map);
    const resolve = (codes: string[], namePatterns: string[]) => {
      for (const c of codes) {
        if (map[c]) return map[c];
      }
      const matchedKey = keys.find((k) => namePatterns.some((p) => k.includes(p)));
      return matchedKey ? map[matchedKey] : undefined;
    };
    return resolve;
  };

  let resolveTypeId = buildTypeResolver(dTypes || []);
  const missingSeeds = defaultSeedSpecs
    .filter((spec) => !resolveTypeId(spec.codes, spec.patterns))
    .map((spec) => spec.seed);

  if (missingSeeds.length > 0) {
    try {
      const dtTable: any = supabase.from('deposit_types');
      if (dtTable && typeof dtTable.insert === 'function') {
        await dtTable.insert(missingSeeds);
        const { data: refreshed } = await supabase.from('deposit_types').select('*');
        if (refreshed) {
          dTypes = refreshed;
          resolveTypeId = buildTypeResolver(dTypes);
        }
      }
    } catch (seedErr) {
      console.warn('Gagal melengkapi jenis simpanan bawaan:', seedErr);
    }
  }

  const typePokok = resolveTypeId(['pokok', 'sp'], ['pokok']);
  const typeWajib = resolveTypeId(['wajib', 'sw'], ['wajib']);
  const typeBelanja = resolveTypeId(['belanja', 'sb'], ['belanja']);
  const typeLebaran = resolveTypeId(['lebaran', 'sl'], ['lebaran', 'hari raya']);

  let updatedCount = 0;
  let totalImportedOpening = 0;
  const skippedNrps: string[] = [];

  // 3. Proses per anggota dengan Clean Overwrite pada deposit_transactions
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nrpKey = String(row.nrp || '').trim();
    const memberId = memberMap.get(nrpKey)?.id;

    if (!memberId) {
      if (nrpKey) skippedNrps.push(nrpKey);
      onProgress?.(i + 1, rows.length, row.nama);
      continue;
    }

    const { data: existingAccounts, error: accErr } = await supabase
      .from('member_deposits')
      .select('id, deposit_type_id')
      .eq('member_id', memberId);

    if (accErr) {
      throw new Error(`Gagal memuat rekening simpanan anggota ${nrpKey}: ${accErr.message}`);
    }

    const accountsByType = new Map<string, string[]>();
    (existingAccounts || []).forEach((acc: any) => {
      if (acc.deposit_type_id && acc.id) {
        const list = accountsByType.get(acc.deposit_type_id) || [];
        list.push(acc.id);
        accountsByType.set(acc.deposit_type_id, list);
      }
    });

    const savingsEntries = [
      { typeId: typePokok, amount: Math.round(Number(row.jumlah_simpanan_pokok) || 0) },
      { typeId: typeWajib, amount: Math.round(Number(row.jumlah_simpanan_wajib) || 0) },
      { typeId: typeBelanja, amount: Math.round(Number(row.jumlah_simpanan_belanja) || 0) },
      { typeId: typeLebaran, amount: Math.round(Number(row.jumlah_simpanan_lebaran) || 0) },
    ];

    for (const entry of savingsEntries) {
      if (!entry.typeId) continue;

      let accountIdsForType = accountsByType.get(entry.typeId) || [];
      if (accountIdsForType.length === 0) {
        const { data: createdAcc, error: createAccErr } = await supabase
          .from('member_deposits')
          .insert({
            member_id: memberId,
            deposit_type_id: entry.typeId,
            is_terminated: false,
          })
          .select('id')
          .single();

        if (createAccErr || !createdAcc?.id) {
          throw new Error(
            `Gagal membuat rekening simpanan anggota ${nrpKey}: ${createAccErr?.message || 'ID kosong'}`
          );
        }
        accountIdsForType = [createdAcc.id as string];
        accountsByType.set(entry.typeId, accountIdsForType);
      }

      const primaryDepositAccountId = accountIdsForType[0];

      // Clean Overwrite: bersihkan transaksi saldo awal / cut-off / migrasi sebelumnya untuk rekening ini
      for (const accId of accountIdsForType) {
        const delBase: any = supabase
          .from('deposit_transactions')
          .delete()
          .eq('member_deposit_id', accId);

        let delErr: any = null;
        if (typeof delBase?.or === 'function') {
          const res = await delBase.or(cleanOrFilter);
          delErr = res?.error;
          if (delErr) {
            const retryBase: any = supabase
              .from('deposit_transactions')
              .delete()
              .eq('member_deposit_id', accId);
            if (typeof retryBase?.or === 'function') {
              const retryRes = await retryBase.or(
                'description.ilike.%saldo awal%,description.ilike.%migrasi%,description.ilike.%cut-off%'
              );
              delErr = retryRes?.error;
            }
          }
        } else {
          const res = await delBase;
          delErr = res?.error;
        }

        if (delErr) {
          throw new Error(`Gagal membersihkan saldo awal lama anggota ${nrpKey}: ${delErr.message}`);
        }
      }

      if (entry.amount > 0) {
        const { error: insTxErr } = await supabase.from('deposit_transactions').insert({
          member_deposit_id: primaryDepositAccountId,
          transaction_type: 'deposit',
          amount: Math.round(entry.amount),
          for_year: openingForYear,
          for_month: openingForMonth,
          description: openingDescription,
          created_at: cutOffIso,
        });

        if (insTxErr) {
          throw new Error(`Gagal menyimpan transaksi saldo awal anggota ${nrpKey}: ${insTxErr.message}`);
        }
      }

      totalImportedOpening += entry.amount;

      // Selaraskan cache kolom member_deposits.balance dengan total mutasi bersih deposit_transactions
      try {
        const mdTable: any = supabase.from('member_deposits');
        if (mdTable && typeof mdTable.update === 'function') {
          let syncedBalance = entry.amount;
          try {
            const dtTable: any = supabase.from('deposit_transactions');
            if (dtTable && typeof dtTable.select === 'function') {
              const q = dtTable.select('amount, transaction_type');
              if (q && typeof q.eq === 'function') {
                const { data: accTxs, error: txSumErr } = await q.eq('member_deposit_id', primaryDepositAccountId);
                if (!txSumErr && Array.isArray(accTxs) && accTxs.length > 0) {
                  syncedBalance = Math.max(
                    0,
                    Math.round(
                      accTxs.reduce((sum: number, t: any) => {
                        const amt = Number(t?.amount || 0);
                        return t?.transaction_type === 'withdrawal' || t?.transaction_type === 'termination'
                          ? sum - amt
                          : sum + amt;
                      }, 0)
                    )
                  );
                }
              }
            }
          } catch {
            // Fallback ke entry.amount
          }

          const updPrimary = mdTable.update({ balance: syncedBalance });
          if (updPrimary && typeof updPrimary.eq === 'function') {
            await updPrimary.eq('id', primaryDepositAccountId);
          }
          for (const extraAccId of accountIdsForType.slice(1)) {
            const updExtra = mdTable.update({ balance: 0 });
            if (updExtra && typeof updExtra.eq === 'function') {
              await updExtra.eq('id', extraAccId);
            }
          }
        }
      } catch {
        // Non-blocking jika kolom cache balance tidak tersedia
      }
    }

    updatedCount++;
    onProgress?.(i + 1, rows.length, row.nama);
  }

  // 4. Catat metadata ke system_settings & audit_logs
  try {
    await supabase.from('system_settings').upsert(
      {
        key: 'initial_savings_effective_date',
        value: trimmedDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
  } catch (e) {
    console.warn('Gagal menyimpan initial_savings_effective_date ke system_settings:', e);
  }

  try {
    await supabase.from('audit_logs').insert({
      table_name: 'deposit_transactions',
      action: 'UPLOAD_INITIAL_SAVINGS',
      record_id: trimmedDate,
      new_data: {
        effective_date: trimmedDate,
        updated_count: updatedCount,
        skipped_nrps: skippedNrps,
      },
      notes: `Upload Saldo Awal Simpanan aktif sejak ${trimmedDate} (${updatedCount} anggota diperbarui)`,
    });
  } catch (e) {
    console.warn('Gagal mencatat UPLOAD_INITIAL_SAVINGS ke audit_logs:', e);
  }

  // 5. Sinkronkan rekap saldo awal simpanan ke public.cash_flow secara idempoten berbasis selisih
  await syncOpeningSavingsBalanceToCashFlow(trimmedDate, totalImportedOpening).catch((cfErr) => {
    console.warn('Gagal menyinkronkan saldo awal simpanan ke cash_flow:', cfErr);
  });

  onProgress?.(rows.length, rows.length, rows[rows.length - 1]?.nama);

  return {
    updatedCount,
    skippedNrps,
    effectiveDate: trimmedDate,
  };
}
