import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export type ReconciliationResult = {
  nrp: string;
  nama: string;
  gaji_pokok?: number | null;
  thp?: number | null;
  take_home_pay: number | null;
  angsuran_lain_lain?: number | null;
  rekening_baru?: string | null;
  excel_account_number: string | null;
  db_account_number: string | null;
  status: 'MATCH' | 'NOT_FOUND' | 'CONFLICT';
};

export interface ReconciliationItemPayload {
  nrp: string | number;
  gaji_pokok?: any;
  thp?: any;
  take_home_pay?: any;
  angsuran_lain_lain?: any;
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

const extractCellValue = (val: any): any => {
  if (val && typeof val === 'object') {
    if ('result' in val && val.result !== undefined) return val.result;
    if ('text' in val && val.text !== undefined) return val.text;
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((rt: any) => rt?.text ?? '').join('');
    }
    if ('value' in val && val.value !== undefined) return val.value;
  }
  return val;
};

const normalizeHeader = (raw: any): string =>
  String(extractCellValue(raw) ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');

/**
 * Menghasilkan dan mengunduh template Excel 5 kolom untuk rekonsiliasi gaji & rekening:
 * NRP, Nama Lengkap, Nomor Rekening, Gaji Pokok, Angsuran Lain-lain.
 */
export const downloadSalaryReconciliationTemplate = async (): Promise<boolean> => {
  try {
    // 1. Ambil data anggota aktif dari public.anggota dengan fallback kolom
    let { data, error }: { data: any; error: any } = await supabase
      .from('anggota')
      .select('nrp, nama, bank_account_number, master_thp, take_home_pay, angsuran_lain_lain')
      .eq('status', 'aktif');

    if (error && error.message) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('angsuran_lain_lain') ||
        msg.includes('master_thp') ||
        msg.includes('take_home_pay') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        const retry = await supabase
          .from('anggota')
          .select('nrp, nama, bank_account_number, master_thp, take_home_pay')
          .eq('status', 'aktif');

        if (retry.error) {
          const minimalRetry = await supabase
            .from('anggota')
            .select('nrp, nama, bank_account_number')
            .eq('status', 'aktif');
          data = minimalRetry.data;
          error = minimalRetry.error;
        } else {
          data = retry.data;
          error = retry.error;
        }
      }
    }

    if (error) {
      throw error;
    }

    // 2. Inisialisasi workbook dan worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Rekonsiliasi');

    // 3. Definisikan 5 kolom baku
    worksheet.columns = [
      { header: 'NRP', key: 'nrp', width: 20 },
      { header: 'Nama Lengkap', key: 'nama', width: 30 },
      { header: 'Nomor Rekening', key: 'nomor_rekening', width: 25 },
      { header: 'Gaji Pokok', key: 'gaji_pokok', width: 25 },
      { header: 'Angsuran Lain-lain', key: 'angsuran_lain_lain', width: 25 },
    ];

    // Format header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' },
    };

    // 4. Isi baris data anggota aktif
    if (data && data.length > 0) {
      data.forEach((anggota: any) => {
        const row = worksheet.addRow({
          nrp: anggota.nrp,
          nama: anggota.nama,
          nomor_rekening: anggota.bank_account_number || '',
          gaji_pokok: anggota.master_thp || anggota.take_home_pay || 0,
          angsuran_lain_lain: anggota.angsuran_lain_lain || 0,
        });

        // Pastikan NRP dibaca sebagai teks
        row.getCell(1).numFmt = '@';
      });
    } else {
      const row = worksheet.addRow({
        nrp: '12345678',
        nama: 'Contoh Nama',
        nomor_rekening: '0011223344',
        gaji_pokok: 0,
        angsuran_lain_lain: 0,
      });
      row.getCell(1).numFmt = '@';
    }

    // 5. Generate dan trigger unduhan file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Template_Rekonsiliasi_${new Date().toISOString().split('T')[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();

    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Error generating salary template:', error);
    throw error;
  }
};

export const downloadSalaryTemplate = downloadSalaryReconciliationTemplate;

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

    // Default posisi kolom 1-based dengan dukungan deteksi header dinamis
    const colIndex = {
      nrp: 1,
      nama: 2,
      account: 3,
      gajiPokok: 4,
      angsuranLainLain: 5,
    };

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, colNum) => {
          const header = normalizeHeader(cell.value);
          if (header === 'nrp') {
            colIndex.nrp = colNum;
          } else if (header === 'nama lengkap' || header === 'nama' || header === 'nama anggota') {
            colIndex.nama = colNum;
          } else if (
            header === 'nomor rekening' ||
            header === 'no rekening' ||
            header === 'no. rekening' ||
            header === 'rekening' ||
            header === 'bank account number'
          ) {
            colIndex.account = colNum;
          } else if (
            header === 'gaji pokok' ||
            header === 'take home pay (thp)' ||
            header === 'take home pay' ||
            header === 'thp' ||
            header === 'gaji'
          ) {
            colIndex.gajiPokok = colNum;
          } else if (
            header === 'angsuran lain lain' ||
            header === 'angsuran luar'
          ) {
            colIndex.angsuranLainLain = colNum;
          }
        });
        return;
      }

      const rawNrp = extractCellValue(row.getCell(colIndex.nrp).value);
      const nrp = String(rawNrp ?? '').trim();

      const rawNama = extractCellValue(row.getCell(colIndex.nama).value);
      const nama = String(rawNama ?? '').trim();

      const rawAccount = extractCellValue(row.getCell(colIndex.account).value);
      const account_number = String(rawAccount ?? '').trim();

      const rawGajiPokok = extractCellValue(row.getCell(colIndex.gajiPokok).value);
      const gajiPokok =
        rawGajiPokok !== undefined && rawGajiPokok !== null && String(rawGajiPokok).trim() !== ''
          ? cleanNumber(rawGajiPokok)
          : null;

      const rawAngsuranLain = extractCellValue(row.getCell(colIndex.angsuranLainLain).value);
      const angsuranLainLain =
        rawAngsuranLain !== undefined && rawAngsuranLain !== null && String(rawAngsuranLain).trim() !== ''
          ? cleanNumber(rawAngsuranLain)
          : 0;

      if (nrp) {
        nrpList.push(nrp);
        excelDataMap.set(nrp, {
          nama,
          account_number,
          thp: gajiPokok,
          angsuran_lain_lain: angsuranLainLain,
        });
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
        gaji_pokok: excelRow.thp,
        thp: excelRow.thp,
        take_home_pay: excelRow.thp,
        angsuran_lain_lain: excelRow.angsuran_lain_lain ?? 0,
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
  gaji_pokok?: number | null;
  take_home_pay: number | null;
  angsuran_lain_lain?: number | null;
  final_account_number: string | null;
};

/**
 * Update data Gaji Pokok (master_thp, take_home_pay, salary), Angsuran Lain-lain, dan nomor rekening per baris ke tabel public.anggota.
 */
export const applySalaryReconciliation = async (
  previewRows: (ReconciliationItemPayload | ReconciliationResult | FinalReconciliationPayload)[]
): Promise<boolean> => {
  const errors: string[] = [];

  for (const item of previewRows) {
    const rawGajiPokok = (item as any).gaji_pokok ?? (item as any).thp ?? item.take_home_pay;
    const hasGajiPokok =
      rawGajiPokok !== undefined && rawGajiPokok !== null && String(rawGajiPokok).trim() !== '';
    const gajiPokok = cleanNumber(rawGajiPokok);

    const rawAngsuranLain =
      (item as any).angsuran_lain_lain ??
      (item as any)['Angsuran Lain-lain'] ??
      (item as any).angsuran_luar;
    const hasAngsuranLain =
      rawAngsuranLain !== undefined && rawAngsuranLain !== null && String(rawAngsuranLain).trim() !== '';
    const angsuranLainLain = cleanNumber(rawAngsuranLain);

    const bankAcc = String(
      (item as any).rekening_baru ||
      (item as any).bank_account_number ||
      (item as any).final_account_number ||
      (item as any).excel_account_number ||
      ''
    ).trim();

    const updatePayload: Record<string, any> = {};

    if (hasGajiPokok && gajiPokok >= 0) {
      updatePayload.master_thp = gajiPokok;
      updatePayload.take_home_pay = gajiPokok;
      updatePayload.salary = gajiPokok;
    }

    if (hasAngsuranLain && angsuranLainLain >= 0) {
      updatePayload.angsuran_lain_lain = angsuranLainLain;
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

    // Defensive retry jika kolom opsional belum ada di skema database / schema cache
    if (error && error.message) {
      const errMsg = error.message.toLowerCase();
      let needsRetry = false;

      if (errMsg.includes('salary') && 'salary' in updatePayload) {
        delete updatePayload.salary;
        needsRetry = true;
      }
      if (errMsg.includes('angsuran_lain_lain') && 'angsuran_lain_lain' in updatePayload) {
        delete updatePayload.angsuran_lain_lain;
        needsRetry = true;
      }
      if (errMsg.includes('updated_at') && 'updated_at' in updatePayload) {
        delete updatePayload.updated_at;
        needsRetry = true;
      }

      if (needsRetry && Object.keys(updatePayload).length > 0) {
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
  angsuran_lain_lain?: number | null;
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
 * Mengambil data gaji, angsuran lain-lain, dan rekening anggota untuk refresh instan.
 */
export async function fetchMemberSalaryData(): Promise<MemberSalaryAccountItem[]> {
  try {
    const baseFields = ['id', 'nrp', 'nama', 'pangkat', 'bank_account_number', 'take_home_pay', 'master_thp'];
    let selectFields = [...baseFields, 'salary', 'angsuran_lain_lain'];

    let { data, error }: { data: any; error: any } = await supabase
      .from('anggota')
      .select(selectFields.join(', '))
      .order('nama', { ascending: true });

    if (error && error.message) {
      const errMsg = error.message.toLowerCase();
      const missingSalary = errMsg.includes('salary');
      const missingAngsuran = errMsg.includes('angsuran_lain_lain');
      if (missingSalary || missingAngsuran) {
        if (missingSalary) selectFields = selectFields.filter((f) => f !== 'salary');
        if (missingAngsuran) selectFields = selectFields.filter((f) => f !== 'angsuran_lain_lain');
        const retry = await supabase
          .from('anggota')
          .select(selectFields.join(', '))
          .order('nama', { ascending: true });
        data = retry.data;
        error = retry.error;
      }
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
 * Mengambil seluruh data anggota beserta gaji (take_home_pay/master_thp/salary),
 * angsuran_lain_lain, dan nomor rekening dengan paginasi loop ber-batch 1000 item.
 */
export async function fetchMembersSalaryAndAccounts(): Promise<MemberSalaryAccountItem[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  let hasMore = true;
  let allData: MemberSalaryAccountItem[] = [];

  try {
    while (hasMore) {
      let selectFields = [
        'id',
        'nrp',
        'nama',
        'pangkat',
        'bank_account_number',
        'take_home_pay',
        'master_thp',
        'salary',
        'angsuran_lain_lain',
        'status',
        'membership_status',
        'created_at',
      ];

      let { data, error }: { data: any; error: any } = await supabase
        .from('anggota')
        .select(selectFields.join(', '))
        .order('nama', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error && error.message) {
        const errMsg = error.message.toLowerCase();
        const missingSalary = errMsg.includes('salary');
        const missingAngsuran = errMsg.includes('angsuran_lain_lain');
        if (missingSalary || missingAngsuran) {
          if (missingSalary) selectFields = selectFields.filter((f) => f !== 'salary');
          if (missingAngsuran) selectFields = selectFields.filter((f) => f !== 'angsuran_lain_lain');
          const retry = await supabase
            .from('anggota')
            .select(selectFields.join(', '))
            .order('nama', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
          data = retry.data;
          error = retry.error;
        }
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
