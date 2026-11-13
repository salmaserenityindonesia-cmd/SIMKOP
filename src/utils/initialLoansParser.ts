import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { parseAmount, sanitizeDateString } from './memberMigrationParser';

export const INITIAL_LOANS_TEMPLATE_FILENAME = 'template_saldo_awal_pinjaman.xlsx';

export const REQUIRED_LOAN_HEADERS = [
  'nrp',
  'nama',
  'jenis_pinjaman',
  'jumlah_pinjaman',
  'tgl_awal_pinjaman',
  'nilai_angsuran',
  'tenor',
  'total_terangsur',
] as const;

export const INITIAL_LOANS_HEADERS = REQUIRED_LOAN_HEADERS;

export interface InitialLoanRow {
  nrp: string;
  nama: string;
  jenis_pinjaman: string;
  loan_type_id: string | null;
  loan_type_name: string;
  jumlah_pinjaman: number;
  tgl_awal_pinjaman: string;
  nilai_angsuran: number;
  tenor: number;
  total_terangsur: number;
  sisa_pinjaman: number;
  isValid: boolean;
  errorMessage?: string;
}

export interface InitialLoansTemplateMember {
  nrp?: string | null;
  nama?: string | null;
  status?: string | null;
  membership_status?: string | null;
}

export interface InitialLoansTemplateLoanType {
  id: string;
  code: string;
  name: string;
  max_duration_months: number;
  is_active?: boolean;
}

export const normalizeName = (val: unknown): string =>
  String(val || '').trim().replace(/\s+/g, ' ').toLowerCase();

async function fetchRegisteredMembersFallback(): Promise<InitialLoansTemplateMember[] | null> {
  try {
    const query: any = supabase.from('anggota')?.select('nrp, nama');
    if (!query || typeof query.then !== 'function') return null;
    const { data, error } = await query;
    if (!error && Array.isArray(data)) {
      return data as InitialLoansTemplateMember[];
    }
  } catch (err) {
    console.warn('Gagal mengambil daftar anggota untuk validasi saldo awal pinjaman:', err);
  }
  return null;
}

/**
 * Mengambil daftar jenis pinjaman aktif dari public.loan_types.
 */
async function fetchActiveLoanTypesFallback(): Promise<InitialLoansTemplateLoanType[]> {
  try {
    const { data, error } = await supabase
      .from('loan_types')
      .select('id, code, name, max_duration_months, is_active')
      .eq('is_active', true)
      .order('code', { ascending: true });

    if (!error && Array.isArray(data)) {
      return data as InitialLoansTemplateLoanType[];
    }
  } catch (err) {
    console.warn('Gagal mengambil daftar loan_types aktif:', err);
  }
  return [];
}

/**
 * Membangun workbook Excel template Saldo Awal Pinjaman dengan 2 sheet:
 * 1) Sheet 'Saldo Awal Pinjaman' berisi 8 kolom wajib & daftar anggota aktif + dropdown jenis pinjaman.
 * 2) Sheet 'Referensi Jenis Pinjaman' berisi daftar produk pinjaman aktif dari Master Produk.
 */
export async function buildInitialLoansTemplateWorkbook(
  members?: InitialLoansTemplateMember[],
  activeLoanTypes?: InitialLoansTemplateLoanType[]
): Promise<ExcelJS.Workbook> {
  let loanTypes: InitialLoansTemplateLoanType[] = Array.isArray(activeLoanTypes)
    ? [...activeLoanTypes]
    : [];

  if (loanTypes.length === 0) {
    loanTypes = await fetchActiveLoanTypesFallback();
  }

  let targetMembers: InitialLoansTemplateMember[] = Array.isArray(members) ? [...members] : [];

  if (targetMembers.length === 0) {
    try {
      const { data, error } = await supabase
        .from('anggota')
        .select('nrp, nama, status, membership_status')
        .order('nama', { ascending: true });

      if (!error && Array.isArray(data) && data.length > 0) {
        targetMembers = data;
      }
    } catch (err) {
      console.warn('Gagal mengambil daftar anggota untuk template saldo awal pinjaman:', err);
    }
  }

  const activeMembers = targetMembers.filter((m) => {
    const ms = m.membership_status ? String(m.membership_status).toUpperCase().trim() : '';
    const st = m.status ? String(m.status).toLowerCase().trim() : '';
    if (ms && ms !== 'ACTIVE') return false;
    if (st && st !== 'aktif' && st !== 'active') return false;
    return Boolean(m.nrp && String(m.nrp).trim());
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Saldo Awal Pinjaman');

  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 18 },
    { header: 'nama', key: 'nama', width: 30 },
    { header: 'jenis_pinjaman', key: 'jenis_pinjaman', width: 24 },
    { header: 'jumlah_pinjaman', key: 'jumlah_pinjaman', width: 20 },
    { header: 'tgl_awal_pinjaman', key: 'tgl_awal_pinjaman', width: 20 },
    { header: 'nilai_angsuran', key: 'nilai_angsuran', width: 20 },
    { header: 'tenor', key: 'tenor', width: 14 },
    { header: 'total_terangsur', key: 'total_terangsur', width: 20 },
  ];

  worksheet.getColumn('nrp').numFmt = '@';
  worksheet.getColumn('nama').numFmt = '@';
  worksheet.getColumn('jenis_pinjaman').numFmt = '@';
  worksheet.getColumn('tgl_awal_pinjaman').numFmt = 'yyyy-mm-dd';

  const rowsToWrite =
    activeMembers.length > 0
      ? activeMembers.map((member) => ({
          nrp: String(member.nrp || '').trim(),
          nama: String(member.nama || '-').trim(),
          jenis_pinjaman: '',
          jumlah_pinjaman: 0,
          tgl_awal_pinjaman: '',
          nilai_angsuran: 0,
          tenor: 0,
          total_terangsur: 0,
        }))
      : [
          {
            nrp: '95168420',
            nama: 'Budi Santoso',
            jenis_pinjaman: '',
            jumlah_pinjaman: 0,
            tgl_awal_pinjaman: '',
            nilai_angsuran: 0,
            tenor: 0,
            total_terangsur: 0,
          },
        ];

  for (const r of rowsToWrite) {
    worksheet.addRow(r);
  }

  // Sheet 2: Referensi Jenis Pinjaman dari Master Produk
  const refSheet = workbook.addWorksheet('Referensi Jenis Pinjaman');
  refSheet.columns = [
    { header: 'code', key: 'code', width: 18 },
    { header: 'name', key: 'name', width: 32 },
    { header: 'max_duration_months', key: 'max_duration_months', width: 22 },
  ];

  for (const lt of loanTypes) {
    refSheet.addRow({
      code: String(lt.code || '').trim(),
      name: String(lt.name || '').trim(),
      max_duration_months: Number(lt.max_duration_months) || 0,
    });
  }

  // DataValidation dropdown pada kolom jenis_pinjaman (kolom C)
  if (loanTypes.length > 0) {
    const formulaRange = `'Referensi Jenis Pinjaman'!$A$2:$A$${loanTypes.length + 1}`;
    for (let rowIdx = 2; rowIdx <= rowsToWrite.length + 1; rowIdx++) {
      const cell = worksheet.getCell(`C${rowIdx}`);
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formulaRange],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Jenis Pinjaman Tidak Terdaftar',
        error: 'Pilih kode/nama jenis pinjaman sesuai sheet Referensi Jenis Pinjaman.',
      };
    }
  }

  return workbook;
}

/**
 * Mengunduh file Excel template_saldo_awal_pinjaman.xlsx ke browser pengguna.
 */
export async function downloadInitialLoansTemplate(
  members?: InitialLoansTemplateMember[],
  activeLoanTypes?: InitialLoansTemplateLoanType[]
): Promise<void> {
  const workbook = await buildInitialLoansTemplateWorkbook(members, activeLoanTypes);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = INITIAL_LOANS_TEMPLATE_FILENAME;
  link.click();

  window.URL.revokeObjectURL(url);
}

function extractCellValue(cell: ExcelJS.Cell): unknown {
  let val: unknown = cell.value;
  if (val && typeof val === 'object' && 'result' in val) {
    val = (val as { result: unknown }).result;
  }
  return val === null || val === undefined ? null : val;
}

function matchLoanType(
  rawInput: string,
  loanTypes: InitialLoansTemplateLoanType[]
): InitialLoansTemplateLoanType | null {
  const normalized = rawInput.trim().toLowerCase();
  if (!normalized) return null;

  for (const lt of loanTypes) {
    const code = String(lt.code || '').trim().toLowerCase();
    const name = String(lt.name || '').trim().toLowerCase();
    const combined = code && name ? `${code} - ${name}` : '';
    if (
      (code && normalized === code) ||
      (name && normalized === name) ||
      (combined && normalized === combined)
    ) {
      return lt;
    }
  }

  return null;
}

/**
 * Mem-parsing file Excel upload Saldo Awal Pinjaman, menyaring baris dengan jumlah_pinjaman > 0,
 * memvalidasi kecocokan NRP & Nama terhadap master anggota,
 * mencocokkan jenis_pinjaman terhadap Master Produk (loan_types), dan menghitung sisa_pinjaman.
 */
export async function parseInitialLoansExcel(
  fileOrBuffer: File | ArrayBuffer | Uint8Array,
  activeLoanTypes?: InitialLoansTemplateLoanType[],
  registeredMembers?: InitialLoansTemplateMember[]
): Promise<InitialLoanRow[]> {
  let buffer: any;
  if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else if (ArrayBuffer.isView(fileOrBuffer)) {
    buffer = fileOrBuffer.buffer.slice(
      fileOrBuffer.byteOffset,
      fileOrBuffer.byteOffset + fileOrBuffer.byteLength
    );
  } else if (typeof (fileOrBuffer as File)?.arrayBuffer === 'function') {
    buffer = await (fileOrBuffer as File).arrayBuffer();
  } else if (typeof FileReader !== 'undefined') {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Gagal membaca file Excel'));
      reader.readAsArrayBuffer(fileOrBuffer as File);
    });
  } else {
    throw new Error('Format input file Excel tidak didukung.');
  }

  let loanTypes: InitialLoansTemplateLoanType[] = Array.isArray(activeLoanTypes)
    ? activeLoanTypes
    : [];
  if (activeLoanTypes === undefined) {
    const fetched = await fetchActiveLoanTypesFallback();
    if (fetched.length > 0) {
      loanTypes = fetched;
    }
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('File Excel kosong atau tidak valid');
  }

  const headers: Record<string, number> = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const raw = extractCellValue(cell);
    const headerName = raw !== null && raw !== undefined ? String(raw).trim().toLowerCase() : '';
    if (headerName) {
      headers[headerName] = colNumber;
    }
  });

  const headerList = Object.keys(headers);

  if (
    headerList.includes('jumlah_simpanan_wajib') ||
    headerList.includes('jumlah_simpanan_pokok') ||
    headerList.includes('pangkat')
  ) {
    throw new Error(
      'File tidak sesuai! Pastikan Anda mengunggah file dari "Unduh Template Saldo Awal Pinjaman (.xlsx)" pada menu ini.'
    );
  }

  const missingColumns = REQUIRED_LOAN_HEADERS.filter((col) => !headers[col]);
  if (missingColumns.length > 0) {
    throw new Error(
      `Header kolom tidak sesuai template Saldo Awal Pinjaman. Kolom yang kurang: ${missingColumns.join(', ')}`
    );
  }

  let membersToValidate: InitialLoansTemplateMember[] | null = null;
  if (Array.isArray(registeredMembers)) {
    membersToValidate = registeredMembers;
  } else if (registeredMembers === undefined) {
    membersToValidate = await fetchRegisteredMembersFallback();
  }

  const memberMap = new Map<string, string>();
  if (membersToValidate !== null) {
    for (const m of membersToValidate) {
      const nrpKey = m.nrp !== null && m.nrp !== undefined ? String(m.nrp).trim() : '';
      if (nrpKey) {
        memberMap.set(nrpKey, m.nama !== null && m.nama !== undefined ? String(m.nama).trim() : '');
      }
    }
  }

  const rows: InitialLoanRow[] = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const getVal = (colName: string): unknown => {
      const idx = headers[colName];
      if (!idx) return null;
      return extractCellValue(row.getCell(idx));
    };

    const rawNrp = getVal('nrp');
    const nrp = rawNrp !== null && rawNrp !== undefined ? String(rawNrp).trim() : '';
    const rawNama = getVal('nama');
    const namaStr = rawNama !== null && rawNama !== undefined ? String(rawNama).trim() : '';

    if (!nrp) {
      return;
    }

    const jumlahPinjaman = parseAmount(getVal('jumlah_pinjaman'));
    if (jumlahPinjaman <= 0) {
      return;
    }

    const namaDisplay = namaStr || '-';
    let isMemberValid = true;
    let memberErrorMessage: string | undefined;

    if (membersToValidate !== null) {
      if (!memberMap.has(nrp)) {
        isMemberValid = false;
        memberErrorMessage = `NRP ${nrp} (${namaDisplay}) belum terdaftar di sistem. Silakan isi/impor data anggotanya terlebih dahulu!`;
      } else if (normalizeName(namaDisplay) !== normalizeName(memberMap.get(nrp) || '')) {
        const dbNama = memberMap.get(nrp) || '';
        isMemberValid = false;
        memberErrorMessage = `Nama tidak cocok! Di Excel tertulis '${namaDisplay}', sedangkan di sistem untuk NRP ${nrp} terdaftar atas nama '${dbNama}'.`;
      }
    }

    const rawJenis = getVal('jenis_pinjaman');
    const jenisPinjaman = rawJenis !== null && rawJenis !== undefined ? String(rawJenis).trim() : '';
    const matchedLoanType = matchLoanType(jenisPinjaman, loanTypes);

    const tglAwalPinjaman = sanitizeDateString(getVal('tgl_awal_pinjaman')) || '';
    const nilaiAngsuran = parseAmount(getVal('nilai_angsuran'));
    const tenor = Math.max(0, Math.floor(parseAmount(getVal('tenor'))));
    const totalTerangsur = parseAmount(getVal('total_terangsur'));
    const sisaPinjaman = Math.max(0, jumlahPinjaman - totalTerangsur);

    let loanTypeErrorMessage: string | undefined;
    if (!matchedLoanType) {
      loanTypeErrorMessage = jenisPinjaman
        ? `Jenis pinjaman "${jenisPinjaman}" tidak terdaftar di Master Produk`
        : 'Jenis pinjaman wajib diisi';
    }

    const isValid = Boolean(isMemberValid && matchedLoanType && nrp && jumlahPinjaman > 0);
    const errorMessage = memberErrorMessage || loanTypeErrorMessage;

    rows.push({
      nrp,
      nama: namaDisplay,
      jenis_pinjaman: jenisPinjaman,
      loan_type_id: matchedLoanType ? matchedLoanType.id : null,
      loan_type_name: matchedLoanType ? matchedLoanType.name : jenisPinjaman || 'Tidak Terdaftar',
      jumlah_pinjaman: jumlahPinjaman,
      tgl_awal_pinjaman: tglAwalPinjaman,
      nilai_angsuran: nilaiAngsuran,
      tenor,
      total_terangsur: totalTerangsur,
      sisa_pinjaman: sisaPinjaman,
      isValid,
      errorMessage,
    });
  });

  if (rows.length === 0) {
    throw new Error(
      'Tidak ada data saldo awal pinjaman (jumlah_pinjaman > 0) yang ditemukan di dalam file Excel.'
    );
  }

  return rows;
}
