import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export type ReconciliationResult = {
  nrp: string;
  nama: string;
  thp?: number | null;
  take_home_pay: number | null;
  rekening_baru?: string | null;
  excel_account_number: string | null;
  db_account_number: string | null;
  status: 'MATCH' | 'NOT_FOUND' | 'CONFLICT';
};

export interface ReconciliationItemPayload {
  nrp: string | number;
  thp?: any;
  take_home_pay?: any;
  rekening_baru?: string | null;
  bank_account_number?: string | null;
  excel_account_number?: string | null;
  final_account_number?: string | null;
  [key: string]: any;
}

/**
 * Sanitasi nilai numerik agar bersih dari karakter non-numerik (Rp, titik, spasi, desimal ,00).
 */
export const cleanNumber = (val: any): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  let str = String(val).trim();
  // Tangani format mata uang yang diakhiri sen seperti ',00' atau '.00'
  str = str.replace(/[,.]00$/, '');
  const cleaned = str.replace(/[^0-9]/g, '');
  return Number(cleaned) || 0;
};

export const parseSalaryReconciliationFile = async (file: File): Promise<ReconciliationResult[]> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error('Worksheet tidak ditemukan dalam file Excel');
    }

    const results: ReconciliationResult[] = [];
    const nrpList: string[] = [];

    // Temporary store from excel
    const excelDataMap = new Map<string, any>();

    worksheet.eachRow((row, rowNumber) => {
      // Skip header row
      if (rowNumber === 1) return;

      let nrp = row.getCell(1).value?.toString() || '';
      if (typeof row.getCell(1).value === 'object' && row.getCell(1).value !== null) {
        const val: any = row.getCell(1).value;
        nrp = val.result || val.text || nrp;
      }
      nrp = String(nrp).trim();

      let nama = row.getCell(2).value?.toString() || '';
      if (typeof row.getCell(2).value === 'object' && row.getCell(2).value !== null) {
        const val: any = row.getCell(2).value;
        nama = val.result || val.text || nama;
      }
      nama = String(nama).trim();

      let account_number = row.getCell(3).value?.toString() || '';
      if (typeof row.getCell(3).value === 'object' && row.getCell(3).value !== null) {
        const val: any = row.getCell(3).value;
        account_number = val.result || val.text || account_number;
      }
      account_number = String(account_number).trim();

      let rawThp = row.getCell(4).value;
      if (typeof rawThp === 'object' && rawThp !== null) {
        const val: any = rawThp;
        rawThp = val.result ?? val.text ?? val.value ?? '';
      }
      const thp = rawThp !== undefined && rawThp !== null && rawThp !== '' ? cleanNumber(rawThp) : null;

      if (nrp) {
        nrpList.push(nrp);
        excelDataMap.set(nrp, { nama, account_number, thp });
      }
    });

    // Fetch members from DB
    const { data: anggotaData, error } = await supabase
      .from('anggota')
      .select('nrp, nama, bank_account_number')
      .in('nrp', nrpList);

    if (error) {
      throw error;
    }

    const dbDataMap = new Map<string, any>();
    if (anggotaData) {
      anggotaData.forEach((a: any) => {
        dbDataMap.set(a.nrp, a);
      });
    }

    // Classify
    excelDataMap.forEach((excelRow, nrp) => {
      const dbRow = dbDataMap.get(nrp);
      
      let status: 'MATCH' | 'NOT_FOUND' | 'CONFLICT' = 'MATCH';
      
      if (!dbRow) {
        status = 'NOT_FOUND';
      } else if (excelRow.account_number && dbRow.bank_account_number && excelRow.account_number !== dbRow.bank_account_number) {
        status = 'CONFLICT';
      } else if (excelRow.account_number && !dbRow.bank_account_number) {
        status = 'CONFLICT'; 
      }

      results.push({
        nrp,
        nama: excelRow.nama,
        thp: excelRow.thp,
        take_home_pay: excelRow.thp,
        rekening_baru: excelRow.account_number || null,
        excel_account_number: excelRow.account_number || null,
        db_account_number: dbRow?.bank_account_number || null,
        status,
      });
    });

    return results;
  } catch (error) {
    console.error('Error parsing excel file:', error);
    throw error;
  }
};

export type FinalReconciliationPayload = {
  nrp: string;
  take_home_pay: number | null;
  final_account_number: string | null;
};

/**
 * Update data THP, master_thp, salary, dan nomor rekening per baris ke tabel public.anggota.
 */
export const applySalaryReconciliation = async (
  previewRows: (ReconciliationItemPayload | ReconciliationResult | FinalReconciliationPayload)[]
): Promise<boolean> => {
  const errors: string[] = [];

  for (const item of previewRows) {
    const rawThp = (item as any).thp ?? item.take_home_pay;
    const thpNumeric = cleanNumber(rawThp);
    const bankAcc = String(
      (item as any).rekening_baru ||
      (item as any).bank_account_number ||
      (item as any).final_account_number ||
      (item as any).excel_account_number ||
      ''
    ).trim();

    const updatePayload: Record<string, any> = {};

    if (thpNumeric > 0) {
      updatePayload.master_thp = thpNumeric;
      updatePayload.take_home_pay = thpNumeric;
      updatePayload.salary = thpNumeric;
    }

    if (bankAcc) {
      updatePayload.bank_account_number = bankAcc;
    }

    if (Object.keys(updatePayload).length === 0) {
      continue;
    }

    let { error } = await supabase
      .from('anggota')
      .update(updatePayload)
      .eq('nrp', String(item.nrp).trim());

    // Defensive retry jika kolom 'salary' atau 'updated_at' belum ada di skema database / schema cache
    if (error && error.message) {
      const errMsg = error.message.toLowerCase();
      let needsRetry = false;

      if (errMsg.includes('salary') && 'salary' in updatePayload) {
        delete updatePayload.salary;
        needsRetry = true;
      }
      if (errMsg.includes('updated_at') && 'updated_at' in updatePayload) {
        delete updatePayload.updated_at;
        needsRetry = true;
      }

      if (needsRetry) {
        const retryResult = await supabase
          .from('anggota')
          .update(updatePayload)
          .eq('nrp', String(item.nrp).trim());
        error = retryResult.error;
      }
    }

    if (error) {
      console.error(`Gagal update anggota NRP ${item.nrp}:`, error);
      errors.push(`Gagal update NRP ${item.nrp}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return true;
};

export const confirmSalaryReconciliation = async (payload: FinalReconciliationPayload[]): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase.rpc('batch_update_salary_reconciliation', {
      payload: payload,
      admin_id: user?.id || null
    });

    if (error) {
      throw error;
    }

    return true;
  } catch (error) {
    console.error('Error confirming reconciliation:', error);
    throw error;
  }
};

export interface MemberSalaryAccountItem {
  id: string;
  nrp: string;
  nama: string;
  pangkat?: string | null;
  bank_account_number?: string | null;
  take_home_pay?: number | null;
  master_thp?: number | null;
  salary?: number | null;
  status?: string | null;
  membership_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function isFallbackError(error: any): boolean {
  if (!error) return false;
  const msg = String(error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to fetch')
  );
}

/**
 * Mengambil data gaji dan rekening anggota untuk refresh instan.
 */
export async function fetchMemberSalaryData(): Promise<MemberSalaryAccountItem[]> {
  try {
    let { data, error }: { data: any; error: any } = await supabase
      .from('anggota')
      .select('id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp, salary')
      .order('nama', { ascending: true });

    if (error && error.message && error.message.toLowerCase().includes('salary')) {
      const retry = await supabase
        .from('anggota')
        .select('id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp')
        .order('nama', { ascending: true });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      if (isFallbackError(error)) {
        return [];
      }
      throw error;
    }

    return (data as MemberSalaryAccountItem[]) || [];
  } catch (err: any) {
    if (isFallbackError(err)) {
      return [];
    }
    throw err;
  }
}

/**
 * Mengambil seluruh data anggota beserta gaji (take_home_pay/master_thp/salary)
 * dan nomor rekening dengan paginasi loop ber-batch 1000 item.
 */
export async function fetchMembersSalaryAndAccounts(): Promise<MemberSalaryAccountItem[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;
  let allData: MemberSalaryAccountItem[] = [];

  try {
    while (hasMore) {
      let { data, error }: { data: any; error: any } = await supabase
        .from('anggota')
        .select(
          'id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp, salary, status, membership_status, created_at'
        )
        .order('nama', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error && error.message && error.message.toLowerCase().includes('salary')) {
        const retry = await supabase
          .from('anggota')
          .select(
            'id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp, status, membership_status, created_at'
          )
          .order('nama', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        if (isFallbackError(error)) {
          console.warn('Fallback error fetching anggota salary data:', error.message);
          return [];
        }
        console.error('Error fetching paged member salary and accounts:', error.message);
        throw new Error(`Gagal mengambil data gaji dan rekening anggota: ${error.message}`);
      }

      if (data && data.length > 0) {
        allData = allData.concat(data as MemberSalaryAccountItem[]);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return allData;
  } catch (err: any) {
    if (isFallbackError(err)) {
      console.warn('Graceful fallback for fetchMembersSalaryAndAccounts:', err?.message);
      return [];
    }
    throw err;
  }
}
