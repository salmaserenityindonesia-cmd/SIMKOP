import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export type ReconciliationResult = {
  nomor_referensi?: string;
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

export interface SalaryImportProgress {
  processed: number;
  total: number;
  currentLabel: string;
  updatedCount: number;
  skippedCount: number;
}

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

/**
 * Mengambil nilai gaji pokok numerik secara konsisten dari berbagai alias kolom pada anggota.
 * Mengutamakan nilai positif pertama dari master_thp, take_home_pay, gaji_pokok, base_salary, atau salary.
 */
export function resolveMemberSalary(
  member: {
    master_thp?: any;
    take_home_pay?: any;
    gaji_pokok?: any;
    base_salary?: any;
    salary?: any;
  } | null | undefined
): number {
  if (!member) return 0;
  const candidates = [
    member.master_thp,
    member.take_home_pay,
    member.gaji_pokok,
    member.base_salary,
    member.salary,
  ];
  for (const val of candidates) {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const num = cleanNumber(val);
      if (num > 0) return num;
    }
  }
  return 0;
}

export function normalizeNrpValue(raw: any): string {
  if (raw === null || raw === undefined) return '';
  if (typeof raw === 'number') {
    if (isNaN(raw)) return '';
    return String(Math.trunc(raw)).trim();
  }
  return String(raw).trim();
}

export function stripLeadingZeros(nrp: string): string {
  return nrp.replace(/^0+/, '') || nrp;
}

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

const queryActiveMembersForTemplate = async (fields: string) => {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData: any[] = [];
  let hasMore = true;

  while (hasMore) {
    let query: any = supabase
      .from('anggota')
      .select(fields)
      .eq('status', 'aktif');
    if (query && typeof query.order === 'function') {
      query = query.order('nama', { ascending: true });
    }
    if (query && typeof query.range === 'function') {
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) {
        return { data: null, error };
      }
      if (data && data.length > 0) {
        allData = allData.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    } else {
      return await query;
    }
  }

  return { data: allData, error: null };
};

/**
 * Membangun workbook Excel template rekonsiliasi 6 kolom:
 * nomor_referensi, NRP, Nama Lengkap, Nomor Rekening, Gaji Pokok, Angsuran Lain-lain.
 */
export const buildSalaryReconciliationWorkbook = (members: any[]): ExcelJS.Workbook => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Rekonsiliasi');

  worksheet.columns = [
    { header: 'nomor_referensi', key: 'nomor_referensi', width: 20 },
    { header: 'NRP', key: 'nrp', width: 20 },
    { header: 'Nama Lengkap', key: 'nama', width: 30 },
    { header: 'Nomor Rekening', key: 'nomor_rekening', width: 25 },
    { header: 'Gaji Pokok', key: 'gaji_pokok', width: 25 },
    { header: 'Angsuran Lain-lain', key: 'angsuran_lain_lain', width: 25 },
  ];

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' },
  };

  const applyRowFormats = (row: ExcelJS.Row) => {
    row.getCell(1).numFmt = '@';
    row.getCell(2).numFmt = '@';
    row.getCell(4).numFmt = '@';
    row.getCell(5).numFmt = '#,##0';
    row.getCell(6).numFmt = '#,##0';
  };

  if (members && members.length > 0) {
    members.forEach((anggota: any) => {
      const row = worksheet.addRow({
        nomor_referensi: String(anggota.nomor_referensi ?? ''),
        nrp: String(anggota.nrp ?? ''),
        nama: String(anggota.nama ?? ''),
        nomor_rekening: String(anggota.bank_account_number ?? ''),
        gaji_pokok: resolveMemberSalary(anggota),
        angsuran_lain_lain: Number(anggota.angsuran_lain_lain ?? 0) || 0,
      });
      applyRowFormats(row);
    });
  } else {
    const row = worksheet.addRow({
      nomor_referensi: 'REF-001',
      nrp: '12345678',
      nama: 'Contoh Nama',
      nomor_rekening: '0011223344',
      gaji_pokok: 0,
      angsuran_lain_lain: 0,
    });
    applyRowFormats(row);
  }

  return workbook;
};

/**
 * Menghasilkan dan mengunduh template Excel 6 kolom untuk rekonsiliasi gaji & rekening:
 * nomor_referensi, NRP, Nama Lengkap, Nomor Rekening, Gaji Pokok, Angsuran Lain-lain.
 */
export const downloadSalaryReconciliationTemplate = async (): Promise<boolean> => {
  try {
    // 1. Ambil data anggota aktif dari public.anggota urut nama ASC dengan paginasi & fallback kolom
    let { data, error }: { data: any; error: any } = await queryActiveMembersForTemplate(
      'id, nomor_referensi, nrp, nama, bank_account_number, master_thp, take_home_pay, angsuran_lain_lain'
    );

    if (error && error.message) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('nomor_referensi') ||
        msg.includes('angsuran_lain_lain') ||
        msg.includes('master_thp') ||
        msg.includes('take_home_pay') ||
        msg.includes('schema cache') ||
        msg.includes('does not exist')
      ) {
        const retry = await queryActiveMembersForTemplate(
          'id, nrp, nama, bank_account_number, master_thp, take_home_pay'
        );

        if (retry.error) {
          const minimalRetry = await queryActiveMembersForTemplate(
            'id, nrp, nama, bank_account_number'
          );
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

    // 2. Inisialisasi workbook dan worksheet 6 kolom baku
    const workbook = buildSalaryReconciliationWorkbook(data || []);

    // 3. Generate dan trigger unduhan file
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

export const parseSalaryReconciliationFile = async (
  file: File,
  onProgress?: (progress: SalaryImportProgress) => void
): Promise<ReconciliationResult[]> => {
  try {
    onProgress?.({
      processed: 0,
      total: 0,
      currentLabel: 'Membaca file Excel...',
      updatedCount: 0,
      skippedCount: 0,
    });
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
      nomorReferensi: null as number | null,
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
          const cleanHeader = header.replace(/\./g, '').trim();
          if (cleanHeader === 'nomor referensi' || cleanHeader === 'no referensi') {
            colIndex.nomorReferensi = colNum;
          } else if (header === 'nrp' || header === 'no nrp' || header === 'nomor nrp') {
            colIndex.nrp = colNum;
          } else if (header === 'nama lengkap' || header === 'nama' || header === 'nama anggota') {
            colIndex.nama = colNum;
          } else if (
            header.includes('rekening') ||
            header === 'bank account number'
          ) {
            colIndex.account = colNum;
          } else if (
            header.startsWith('gaji pokok') ||
            header.includes('take home pay') ||
            header === 'thp' ||
            header === 'master thp' ||
            header === 'gaji' ||
            header === 'base salary' ||
            header === 'salary'
          ) {
            colIndex.gajiPokok = colNum;
          } else if (
            header.startsWith('angsuran lain') ||
            header.includes('angsuran luar')
          ) {
            colIndex.angsuranLainLain = colNum;
          }
        });
        return;
      }

      const rawNomorReferensi = colIndex.nomorReferensi
        ? extractCellValue(row.getCell(colIndex.nomorReferensi).value)
        : '';
      const nomor_referensi = String(rawNomorReferensi ?? '').trim();

      const rawNrp = extractCellValue(row.getCell(colIndex.nrp).value);
      const nrp = normalizeNrpValue(rawNrp);

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
          nomor_referensi,
          nama,
          account_number,
          thp: gajiPokok,
          angsuran_lain_lain: angsuranLainLain,
        });
      }
    });

    // Fetch members from DB (chunked .in + fallback untuk nol di depan / spasi NRP)
    const uniqueNrps = Array.from(new Set(nrpList));
    const dbDataMap = new Map<string, any>();

    if (uniqueNrps.length > 0) {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < uniqueNrps.length; i += CHUNK_SIZE) {
        const chunk = uniqueNrps.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase
          .from('anggota')
          .select('nrp, nama, bank_account_number')
          .in('nrp', chunk);

        if (error) {
          throw error;
        }

        (data || []).forEach((a: any) => {
          const cleanDbNrp = normalizeNrpValue(a.nrp);
          if (cleanDbNrp) {
            dbDataMap.set(cleanDbNrp, a);
          }
        });
      }

      if (dbDataMap.size < uniqueNrps.length) {
        try {
          const missingNrps = uniqueNrps.filter((n) => !dbDataMap.has(n));
          if (missingNrps.length > 0) {
            const PAGE_SIZE = 1000;
            let from = 0;
            let hasMore = true;
            const fallbackMembers: any[] = [];
            while (hasMore) {
              const table: any = supabase.from('anggota');
              const selQuery = table?.select?.('nrp, nama, bank_account_number');
              if (!selQuery || typeof selQuery.range !== 'function') break;
              const { data: pageData, error: pageErr } = await selQuery.range(from, from + PAGE_SIZE - 1);
              if (pageErr || !pageData || pageData.length === 0) {
                hasMore = false;
              } else {
                fallbackMembers.push(...pageData);
                from += PAGE_SIZE;
                if (pageData.length < PAGE_SIZE) hasMore = false;
              }
            }

            if (fallbackMembers.length > 0) {
              const byStripped = new Map<string, any>();
              fallbackMembers.forEach((a: any) => {
                const cleanDbNrp = normalizeNrpValue(a.nrp);
                if (cleanDbNrp) {
                  if (!byStripped.has(cleanDbNrp)) {
                    byStripped.set(cleanDbNrp, a);
                  }
                  const stripped = stripLeadingZeros(cleanDbNrp);
                  if (stripped && !byStripped.has(stripped)) {
                    byStripped.set(stripped, a);
                  }
                }
              });

              missingNrps.forEach((excelNrp) => {
                const match =
                  byStripped.get(excelNrp) || byStripped.get(stripLeadingZeros(excelNrp));
                if (match) {
                  dbDataMap.set(excelNrp, match);
                }
              });
            }
          }
        } catch {
          // Abaikan jika environment/mock tidak mendukung query fallback paged
        }
      }
    }

    // Classify in measured chunks so UI progress stays responsive
    const entries = Array.from(excelDataMap.entries());
    const total = entries.length;
    const CHUNK_SIZE = 20;
    let processed = 0;
    let matchedCount = 0;
    let skippedCount = 0;

    if (total === 0) {
      onProgress?.({
        processed: 0,
        total: 0,
        currentLabel: 'Tidak ada baris data valid',
        updatedCount: 0,
        skippedCount: 0,
      });
    } else {
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        let lastNama = '';
        let lastCanonicalNrp = '';

        for (const [nrp, excelRow] of chunk) {
          const dbRow = dbDataMap.get(nrp);
          const canonicalNrp = dbRow?.nrp ? normalizeNrpValue(dbRow.nrp) : nrp;

          let status: 'MATCH' | 'NOT_FOUND' | 'CONFLICT' = 'MATCH';

          if (!dbRow) {
            status = 'NOT_FOUND';
          } else if (
            excelRow.account_number &&
            dbRow.bank_account_number &&
            excelRow.account_number !== dbRow.bank_account_number
          ) {
            status = 'CONFLICT';
          } else if (excelRow.account_number && !dbRow.bank_account_number) {
            status = 'CONFLICT';
          }

          results.push({
            nomor_referensi: excelRow.nomor_referensi || '',
            nrp: canonicalNrp,
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

          processed += 1;
          if (status === 'NOT_FOUND') {
            skippedCount += 1;
          } else {
            matchedCount += 1;
          }
          lastNama = excelRow.nama || dbRow?.nama || '';
          lastCanonicalNrp = canonicalNrp;
        }

        onProgress?.({
          processed,
          total,
          currentLabel: `${lastNama || 'Tanpa Nama'} (NRP: ${lastCanonicalNrp})`,
          updatedCount: matchedCount,
          skippedCount,
        });

        if (onProgress && i + CHUNK_SIZE < total) {
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
      }
    }

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
  previewRows: (ReconciliationItemPayload | ReconciliationResult | FinalReconciliationPayload)[],
  onProgress?: (progress: SalaryImportProgress) => void
): Promise<boolean> => {
  const errors: string[] = [];
  const total = previewRows.length;
  const CHUNK_SIZE = 20;
  let processed = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  onProgress?.({
    processed: 0,
    total,
    currentLabel: 'Memulai sinkronisasi data...',
    updatedCount: 0,
    skippedCount: 0,
  });

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = previewRows.slice(i, i + CHUNK_SIZE);

    for (const item of chunk) {
      const cleanNrp = normalizeNrpValue(item.nrp);
      const rowName = String((item as any).nama ?? '').trim();
      const rowLabel = rowName ? `${rowName} (NRP: ${cleanNrp || '-'})` : `NRP: ${cleanNrp || '-'}`;

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

      if ((item as any).status === 'NOT_FOUND' || !cleanNrp || Object.keys(updatePayload).length === 0) {
        skippedCount += 1;
        processed += 1;
        onProgress?.({
          processed,
          total,
          currentLabel: rowLabel,
          updatedCount,
          skippedCount,
        });
        continue;
      }

      let { error } = await supabase
        .from('anggota')
        .update(updatePayload)
        .eq('nrp', cleanNrp);

      // Defensive multi-retry jika kolom opsional belum ada di skema database / schema cache
      let retryCount = 0;
      const optionalCols = ['salary', 'angsuran_lain_lain', 'take_home_pay', 'updated_at'] as const;
      while (error && error.message && retryCount < 4) {
        const errMsg = error.message.toLowerCase();
        let removedAny = false;
        for (const col of optionalCols) {
          if (errMsg.includes(col) && col in updatePayload) {
            delete updatePayload[col];
            removedAny = true;
          }
        }
        if (!removedAny || Object.keys(updatePayload).length === 0) {
          break;
        }
        retryCount += 1;
        const retryResult = await supabase
          .from('anggota')
          .update(updatePayload)
          .eq('nrp', cleanNrp);
        error = retryResult.error;
      }

      if (error) {
        console.error(`Gagal update anggota NRP ${item.nrp}:`, error);
        errors.push(`Gagal update NRP ${item.nrp}: ${error.message}`);
      } else {
        updatedCount += 1;
      }

      processed += 1;
      onProgress?.({
        processed,
        total,
        currentLabel: rowLabel,
        updatedCount,
        skippedCount,
      });
    }

    if (onProgress && i + CHUNK_SIZE < total) {
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  if (updatedCount > 0) {
    try {
      const authRes =
        supabase.auth && typeof supabase.auth.getUser === 'function'
          ? await supabase.auth.getUser()
          : null;
      const user = authRes?.data?.user || null;
      const auditTable: any = supabase.from('audit_logs');
      if (auditTable && typeof auditTable.insert === 'function') {
        const auditRes = await auditTable.insert({
          table_name: 'anggota',
          action: 'IMPORT_GAJI_BULANAN',
          record_id: 'BATCH',
          performed_by: user?.id || null,
          new_data: {
            updated_count: updatedCount,
            total_rows: previewRows.length,
            timestamp: new Date().toISOString(),
          },
          notes: `Import Gaji Bulanan berhasil memperbarui ${updatedCount} data anggota`,
        });
        if (auditRes?.error) {
          console.warn('Gagal mencatat IMPORT_GAJI_BULANAN ke audit_logs:', auditRes.error);
        }
      }
    } catch (auditErr) {
      console.warn('Gagal mencatat IMPORT_GAJI_BULANAN ke audit_logs:', auditErr);
    }
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
  nomor_referensi?: string | null;
  nrp: string;
  nama: string;
  tanggal_lahir?: string | null;
  bank_account_number?: string | null;
  take_home_pay?: number | null;
  master_thp?: number | null;
  gaji_pokok?: number | null;
  base_salary?: number | null;
  salary?: number | null;
  angsuran_lain_lain?: number | null;
  status?: string | null;
  membership_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const OPTIONAL_MEMBER_SALARY_SELECT_COLS = [
  'nomor_referensi',
  'salary',
  'angsuran_lain_lain',
  'gaji_pokok',
  'take_home_pay',
  'master_thp',
  'tanggal_lahir',
  'membership_status',
];

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
    const baseFields = ['id', 'nomor_referensi', 'nrp', 'nama', 'tanggal_lahir', 'bank_account_number', 'take_home_pay', 'master_thp'];
    let selectFields = [...baseFields, 'salary', 'angsuran_lain_lain'];

    let { data, error }: { data: any; error: any } = await supabase
      .from('anggota')
      .select(selectFields.join(', '))
      .order('nama', { ascending: true });

    let retryCount = 0;
    while (error && error.message && retryCount < 4) {
      const errMsg = error.message.toLowerCase();
      const toRemove = OPTIONAL_MEMBER_SALARY_SELECT_COLS.filter(
        (col) => errMsg.includes(col) && selectFields.includes(col)
      );
      if (toRemove.length === 0) break;
      selectFields = selectFields.filter((f) => !toRemove.includes(f));
      retryCount += 1;
      const retry = await supabase
        .from('anggota')
        .select(selectFields.join(', '))
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
        'nomor_referensi',
        'nrp',
        'nama',
        'tanggal_lahir',
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

      let retryCount = 0;
      while (error && error.message && retryCount < 4) {
        const errMsg = error.message.toLowerCase();
        const toRemove = OPTIONAL_MEMBER_SALARY_SELECT_COLS.filter(
          (col) => errMsg.includes(col) && selectFields.includes(col)
        );
        if (toRemove.length === 0) break;
        selectFields = selectFields.filter((f) => !toRemove.includes(f));
        retryCount += 1;
        const retry = await supabase
          .from('anggota')
          .select(selectFields.join(', '))
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
