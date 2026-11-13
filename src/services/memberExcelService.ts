import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import {
  MEMBER_IMPORT_TEMPLATE_FILENAME,
  MEMBER_IMPORT_TEMPLATE_SAMPLE_ROWS,
  sanitizeMigrationLoanRow,
  generateMigrationLoanSchedules,
} from '../utils/memberMigrationParser';

export interface MigrationRowData {
  nrp: string;
  nama: string;
  pangkat: string | null;
  bank_account_number: string | null;
  membership_status: string;
  tgl_awal_anggota: string | null;
  jumlah_simpanan_pokok: number;
  jumlah_simpanan_wajib: number;
  jumlah_simpanan_belanja: number;
  jumlah_simpanan_lebaran: number;
  jumlah_pinjaman: number;
  tgl_awal_pinjaman: string | null;
  tenor: number;
  sisa_pinjaman: number;

  // Calculated distributions
  n_bulan_simpanan: number;
  wajib_per_bulan: number;
  belanja_per_bulan: number;
  lebaran_per_bulan: number;

  n_bulan_pinjaman: number;
  sudah_diangsur: number;
  angsuran_lampau_per_bulan: number;
}

export interface MemberParseResult {
  rows: MigrationRowData[];
  errors: string[];
}

export const buildMemberTemplateWorkbook = async (): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Import Anggota');

  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 15 },
    { header: 'nama', key: 'nama', width: 30 },
    { header: 'pangkat', key: 'pangkat', width: 20 },
    { header: 'bank_account_number', key: 'bank_account_number', width: 25 },
    { header: 'membership_status', key: 'membership_status', width: 20 },
    { header: 'tgl_awal_anggota', key: 'tgl_awal_anggota', width: 20 },
  ];

  ['nrp', 'nama', 'pangkat', 'bank_account_number', 'membership_status'].forEach((k) => {
    worksheet.getColumn(k).numFmt = '@';
  });
  worksheet.getColumn('tgl_awal_anggota').numFmt = 'yyyy-mm-dd';

  for (const sampleRow of MEMBER_IMPORT_TEMPLATE_SAMPLE_ROWS) {
    worksheet.addRow(sampleRow);
  }

  return workbook;
};

export const exportMemberTemplate = async () => {
  const workbook = await buildMemberTemplateWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = MEMBER_IMPORT_TEMPLATE_FILENAME;
  link.click();

  window.URL.revokeObjectURL(url);
};

export const calculateExcelDatedifMonths = (
  startDate: Date | string,
  endDate: Date | string = new Date()
): number => {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return 1;
  }

  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());

  // Jika tanggal hari pada end belum mencapai tanggal hari pada start, kurangi 1 bulan (belum genap)
  if (end.getDate() < start.getDate()) {
    months--;
  }

  return Math.max(1, months);
};

// Backward-compatible alias
export const diffInMonths = calculateExcelDatedifMonths;

const parseDate = (val: any): string | null => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
};

export const parseAmount = (val: unknown): number => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.max(0, val);
  if (typeof val === 'string') {
    let str = val.trim();
    if (!str) return 0;

    // Bersihkan karakter pemisah ribuan dan desimal
    if (str.includes('.') && str.includes(',')) {
      const lastDot = str.lastIndexOf('.');
      const lastComma = str.lastIndexOf(',');
      if (lastDot < lastComma) {
        // Format Indo: 1.500.000,00 -> titik ribuan, koma desimal
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        // Format US: 1,500,000.00 -> koma ribuan, titik desimal
        str = str.replace(/,/g, '');
      }
    } else if (str.includes('.')) {
      // Deteksi format ribuan bertitik seperti "2.000.000" atau "50.000"
      const parts = str.split('.');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        str = str.replace(/\./g, '');
      }
    } else if (str.includes(',')) {
      // Deteksi format ribuan berkoma seperti "2,000,000" atau desimal koma "50000,50"
      const parts = str.split(',');
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
        str = str.replace(/,/g, '');
      } else {
        str = str.replace(',', '.');
      }
    }

    const cleaned = str.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.max(0, num);
  }
  return 0;
};

export const parseNumber = parseAmount;

export const parseMemberUpload = async (file: File): Promise<MemberParseResult> => {
  let buffer: ArrayBuffer;
  if (typeof file.arrayBuffer === 'function') {
    buffer = await file.arrayBuffer();
  } else {
    buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      reader.readAsArrayBuffer(file);
    });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('File Excel kosong atau tidak valid');

  const rows: MigrationRowData[] = [];
  const errors: string[] = [];

  const headers: { [key: string]: number } = {};
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const value = cell.value?.toString().toLowerCase().trim();
    if (value) headers[value] = colNumber;
  });

  if (!headers['nrp'] || !headers['nama']) {
    throw new Error('Format kolom tidak valid. Pastikan kolom minimal (nrp, nama) ada.');
  }

  const allowedStatus = ['ACTIVE', 'PENDING_RESIGNED', 'READY_TO_RESIGN', 'RESIGNED', 'BLOCKED'];
  const currentDate = new Date();

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const getVal = (colName: string) => {
      const idx = headers[colName.toLowerCase()];
      if (!idx) return null;
      const cell = row.getCell(idx);
      let val = cell.value;
      if (val && typeof val === 'object' && 'result' in val) val = (val as any).result;
      return val === null || val === undefined ? null : val;
    };

    const nrp = getVal('nrp')?.toString().trim();
    const nama = getVal('nama')?.toString().trim();
    const rawStatus = getVal('membership_status')?.toString().trim();

    if (!nrp || !nama) {
      errors.push(`Baris ${rowNumber}: NRP dan Nama wajib diisi.`);
      return;
    }

    let membership_status = 'ACTIVE';
    if (rawStatus) {
      const upperStatus = rawStatus.toUpperCase();
      if (allowedStatus.includes(upperStatus)) membership_status = upperStatus;
      else {
        errors.push(`Baris ${rowNumber}: membership_status tidak valid.`);
        return;
      }
    }

    const tgl_awal_anggota = parseDate(getVal('tgl_awal_anggota'));
    const jumlah_simpanan_pokok = parseAmount(getVal('jumlah_simpanan_pokok'));
    const jumlah_simpanan_wajib = parseAmount(getVal('jumlah_simpanan_wajib'));
    const jumlah_simpanan_belanja = parseAmount(getVal('jumlah_simpanan_belanja'));
    const jumlah_simpanan_lebaran = parseAmount(getVal('jumlah_simpanan_lebaran'));

    // Hilangkan rumus pembagian bulanan simpanan wajib: murni As-Is apa adanya dari Excel
    const wajib_per_bulan = jumlah_simpanan_wajib;
    const belanja_per_bulan = jumlah_simpanan_belanja;
    const lebaran_per_bulan = jumlah_simpanan_lebaran;
    const n_bulan_simpanan = 1;

    const sanitizedLoan = sanitizeMigrationLoanRow({
      bank_account_number: getVal('bank_account_number'),
      jumlah_pinjaman: getVal('jumlah_pinjaman'),
      tgl_awal_pinjaman: getVal('tgl_awal_pinjaman'),
      tenor: getVal('tenor'),
      sisa_pinjaman: getVal('sisa_pinjaman'),
    });

    const {
      bank_account_number,
      jumlah_pinjaman,
      tgl_awal_pinjaman,
      tenor,
      sisa_pinjaman,
    } = sanitizedLoan;

    let n_bulan_pinjaman = 1;
    let sudah_diangsur = 0;
    let angsuran_lampau_per_bulan = 0;

    if (jumlah_pinjaman > 0) {
      sudah_diangsur = Math.max(0, jumlah_pinjaman - sisa_pinjaman);
      if (tgl_awal_pinjaman && !/^\d+$/.test(tgl_awal_pinjaman)) {
        const parsedDate = new Date(tgl_awal_pinjaman);
        if (!isNaN(parsedDate.getTime())) {
          const diffP = diffInMonths(parsedDate, currentDate);
          n_bulan_pinjaman = Math.max(1, diffP);
        }
      }
      angsuran_lampau_per_bulan = Math.floor(sudah_diangsur / n_bulan_pinjaman);
    }

    rows.push({
      nrp,
      nama,
      pangkat: getVal('pangkat')?.toString().trim() || null,
      bank_account_number,
      membership_status,
      tgl_awal_anggota,
      jumlah_simpanan_pokok,
      jumlah_simpanan_wajib,
      jumlah_simpanan_belanja,
      jumlah_simpanan_lebaran,
      jumlah_pinjaman,
      tgl_awal_pinjaman,
      tenor,
      sisa_pinjaman,
      n_bulan_simpanan,
      wajib_per_bulan,
      belanja_per_bulan,
      lebaran_per_bulan,
      n_bulan_pinjaman,
      sudah_diangsur,
      angsuran_lampau_per_bulan
    });
  });

  if (rows.length === 0) throw new Error('Tidak ada data valid yang ditemukan.');
  return { rows, errors };
};

export const executeMigration = async (
  result: MemberParseResult,
  onProgress?: (current: number, total: number) => void
): Promise<void> => {
  const { rows } = result;
  if (rows.length === 0) return;

  // 1. Ambil ID Tipe Simpanan
  const { data: dTypes } = await supabase.from('deposit_types').select('*');
  const typeMap: Record<string, string> = {};
  dTypes?.forEach(dt => typeMap[dt.name.toLowerCase()] = dt.id);
  const keys = Object.keys(typeMap);
  const typePokok = typeMap[keys.find(k => k.includes('pokok')) || ''];
  const typeWajib = typeMap[keys.find(k => k.includes('wajib')) || ''];
  const typeBelanja = typeMap[keys.find(k => k.includes('belanja')) || ''];
  const typeLebaran = typeMap[keys.find(k => k.includes('lebaran') || k.includes('hari raya')) || ''];

  // 2. Ambil ID Tipe Pinjaman (Fallback ke tipe default pertama)
  const { data: lTypes } = await supabase.from('loan_types').select('*').eq('is_active', true).limit(1);
  const loanTypeId = lTypes?.[0]?.id;

  let processedCount = 0;
  onProgress?.(0, rows.length);

  for (const row of rows) {
    try {
      // A. Upsert Anggota
      const anggotaPayload = {
        nrp: row.nrp,
        nama: row.nama,
        pangkat: row.pangkat,
        bank_account_number: row.bank_account_number,
        membership_status: row.membership_status,
        status: 'aktif',
        created_at: row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota).toISOString() : new Date().toISOString()
      };

      const { data: upsertedMember, error: errA } = await supabase.from('anggota')
        .upsert(anggotaPayload, { onConflict: 'nrp' })
        .select('id').single();

      if (errA || !upsertedMember) {
        console.error('Failed upsert anggota:', errA);
        continue; // Skip jika gagal
      }
      const memberId = upsertedMember.id;

      const hasPositiveSavings =
        row.jumlah_simpanan_pokok > 0 ||
        row.jumlah_simpanan_wajib > 0 ||
        row.jumlah_simpanan_belanja > 0 ||
        row.jumlah_simpanan_lebaran > 0;

      // B. Setup Member Deposits & Transactions (Timpa Mutlak / Exact Replacement Overwrite)
      // B.1 Hapus mutasi lama pada deposit_transactions HANYA jika file membawa nominal simpanan > 0.
      // Jika seluruh nominal simpanan bernilai 0 (template 6 kolom), pertahankan saldo anggota lama.
      const { data: existingDeposits, error: errFetchDeposits } = await supabase
        .from('member_deposits')
        .select('id, deposit_type:deposit_types(code)')
        .eq('member_id', memberId);

      if (errFetchDeposits) {
        console.warn(`Gagal memeriksa simpanan lama untuk member ${row.nrp}:`, errFetchDeposits.message);
      }

      if (hasPositiveSavings && existingDeposits && existingDeposits.length > 0) {
        const mdIds = existingDeposits.map((d: any) => d.id);
        const delQuery: any = supabase
          .from('deposit_transactions')
          .delete()
          .in('member_deposit_id', mdIds);

        let errDelTx: any = null;
        if (typeof delQuery?.or === 'function' && typeof delQuery.then !== 'function') {
          const res = await delQuery.or('description.ilike.%migrasi%,description.ilike.%saldo awal%,description.ilike.%migration%,description.ilike.%historical%');
          errDelTx = res?.error;
        } else if (typeof delQuery?.in === 'function' && typeof delQuery.then !== 'function') {
          const res = await delQuery.in('description', [
            'Saldo Awal Migrasi Sistem',
            'Migrasi Saldo Awal (As-Is)',
            'Migrasi Saldo Awal',
            'One-Time Principal Deposit Migration',
            'Historical Balance Migration'
          ]);
          errDelTx = res?.error;
        } else {
          // Real Supabase: Clean Overwrite mutlak seluruh mutasi rekening lama anggota
          const res = await delQuery;
          errDelTx = res?.error;
        }

        if (errDelTx) {
          console.error(`Gagal membersihkan mutasi lama anggota ${row.nama}:`, errDelTx);
          throw errDelTx;
        }
      }

      // B.2 Pastikan akun rekening member_deposits dibuatkan (saldo awal 0) dan masukkan mutasi jika amount > 0
      const depositTypesNeeded = [
        { id: typePokok, amount: row.jumlah_simpanan_pokok, isRoutine: false },
        { id: typeWajib, amount: row.jumlah_simpanan_wajib, isRoutine: true },
        { id: typeBelanja, amount: row.jumlah_simpanan_belanja, isRoutine: true },
        { id: typeLebaran, amount: row.jumlah_simpanan_lebaran, isRoutine: true }
      ];

      for (const dt of depositTypesNeeded) {
        if (!dt.id) continue;

        // Pastikan relasi member_deposits tersedia (bahkan saat nominal = 0)
        const mdQueryBuilder: any = supabase.from('member_deposits')
          .select('id').eq('member_id', memberId);

        let mdId: string | undefined;
        if (typeof mdQueryBuilder?.eq === 'function') {
          const { data: mdRecord } = await mdQueryBuilder.eq('deposit_type_id', dt.id).single();
          mdId = mdRecord?.id;
        } else if (typeof mdQueryBuilder?.single === 'function') {
          const { data: mdRecord } = await mdQueryBuilder.single();
          mdId = mdRecord?.id;
        }

        if (!mdId) {
          const mdTable: any = supabase.from('member_deposits');
          if (typeof mdTable?.insert === 'function') {
            const insBuilder = mdTable.insert({
              member_id: memberId,
              deposit_type_id: dt.id,
              is_terminated: false,
            });
            if (typeof insBuilder?.select === 'function') {
              const { data: newMd } = await insBuilder.select('id').single();
              mdId = newMd?.id;
            } else {
              const insRes = await insBuilder;
              mdId = insRes?.data?.id;
            }
          }
        }
        if (!mdId || dt.amount <= 0) continue;

        // Insert Transactions (Murni As-Is: for_month & for_year = null)
        const txsToInsert = [];
        const dateObj = row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota) : new Date();
        const validDate = !isNaN(dateObj.getTime()) ? dateObj : new Date();

        if (!dt.isRoutine) {
          // One-time Pokok
          txsToInsert.push({
            member_deposit_id: mdId,
            amount: dt.amount,
            transaction_type: 'deposit',
            for_month: null,
            for_year: null,
            description: 'One-Time Principal Deposit Migration',
            created_at: validDate.toISOString()
          });
        } else {
          // Rutin As-Is: Masukkan satu mutasi saldo migrasi utuh tanpa alokasi bulan (for_month & for_year = null)
          txsToInsert.push({
            member_deposit_id: mdId,
            amount: dt.amount,
            transaction_type: 'deposit',
            for_month: null,
            for_year: null,
            description: 'Migrasi Saldo Awal (As-Is)',
            created_at: validDate.toISOString()
          });
        }

        if (txsToInsert.length > 0) {
          await supabase.from('deposit_transactions').insert(txsToInsert);
        }
      }

      // C. Setup Loans (Atomic Clean Overwrite & Synchronization)
      if (row.jumlah_pinjaman > 0 && loanTypeId) {
        // Step 1: Clean Overwrite (Idempotency)
        const { data: existingLoans, error: errFetchLoans } = await supabase
          .from('loans')
          .select('id, loan_number, notes, status')
          .eq('member_id', memberId);

        if (errFetchLoans) {
          console.warn(`Gagal memeriksa pinjaman lama untuk member ${row.nrp}:`, errFetchLoans.message);
        }

        const migLoanIds = (existingLoans || [])
          .filter((l: any) => {
            const loanNum = typeof l.loan_number === 'string' ? l.loan_number.toUpperCase() : '';
            const notes = typeof l.notes === 'string' ? l.notes.toUpperCase() : '';
            return loanNum.startsWith('PINJ-MIGRASI-') ||
                   loanNum.startsWith('LOAN-MIG-') ||
                   notes.includes('MIGRASI');
          })
          .map((l: any) => l.id);

        if (migLoanIds.length > 0) {
          // 1. Hapus repayments terlebih dahulu (FK ke loan_schedules & loans)
          const { error: errDelRepay } = await supabase
            .from('loan_repayments')
            .delete()
            .in('loan_id', migLoanIds);
          if (errDelRepay) {
            console.warn(`Gagal membersihkan repayment pinjaman migrasi lama member ${row.nrp}:`, errDelRepay.message);
          }

          // 2. Hapus schedules (FK ke loans)
          const { error: errDelSched } = await supabase
            .from('loan_schedules')
            .delete()
            .in('loan_id', migLoanIds);
          if (errDelSched) {
            console.warn(`Gagal membersihkan jadwal pinjaman migrasi lama member ${row.nrp}:`, errDelSched.message);
          }

          // 3. Hapus pinjaman migrasi lama
          const { error: errDelLoan } = await supabase
            .from('loans')
            .delete()
            .in('id', migLoanIds);
          if (errDelLoan) {
            console.warn(`Gagal membersihkan pinjaman migrasi lama member ${row.nrp}:`, errDelLoan.message);
          }
        }

        let isTglPinjValid = false;
        let validDisbursedDate = new Date();

        if (row.tgl_awal_pinjaman && !/^\d+$/.test(row.tgl_awal_pinjaman.trim())) {
          const parsed = new Date(row.tgl_awal_pinjaman);
          if (!isNaN(parsed.getTime())) {
            isTglPinjValid = true;
            validDisbursedDate = parsed;
          }
        }

        const loanNotes = isTglPinjValid
          ? `Migrasi Pinjaman Awal (Sisa: Rp ${row.sisa_pinjaman})`
          : `Migrasi Pinjaman Awal (Sisa: Rp ${row.sisa_pinjaman}) (Nilai asli tgl/siklus Excel: "${row.tgl_awal_pinjaman || '-'}")`;

        const tenor = row.tenor > 0 ? row.tenor : 1;
        const monthlyInstallment = Math.round(row.jumlah_pinjaman / tenor);

        // Step 2: Generate Schedules
        const generatedSchedules = generateMigrationLoanSchedules(
          row.jumlah_pinjaman,
          tenor,
          row.sisa_pinjaman,
          validDisbursedDate
        );

        // Step 3: Insert Loan Record
        const loanPayload = {
          loan_number: `PINJ-MIGRASI-${row.nrp}`,
          member_id: memberId,
          loan_type_id: loanTypeId,
          principal_amount: row.jumlah_pinjaman,
          amount: row.jumlah_pinjaman,
          agreed_tenor_months: tenor,
          tenor: tenor,
          planned_installment_amount: monthlyInstallment,
          monthly_target: monthlyInstallment,
          disbursed_at: validDisbursedDate.toISOString(),
          status: row.sisa_pinjaman <= 0 ? 'completed' : 'active',
          notes: loanNotes
        };

        const { data: newLoan, error: errLoan } = await supabase
          .from('loans')
          .insert(loanPayload)
          .select('id')
          .single();

        if (errLoan || !newLoan) {
          console.error(`Gagal membuat data pinjaman migrasi member ${row.nrp}:`, errLoan);
          continue;
        }

        // Step 4: Insert Schedules & Repayments
        if (generatedSchedules.length > 0) {
          const schedsToInsert = generatedSchedules.map(sched => ({
            loan_id: newLoan.id,
            period_number: sched.period_number,
            due_date: sched.due_date,
            target_amount: sched.target_amount,
            paid_amount: sched.paid_amount,
            status: sched.status
          }));

          const { data: insertedScheds, error: errSched } = await supabase
            .from('loan_schedules')
            .insert(schedsToInsert)
            .select('*');

          if (errSched) {
            console.warn(`Gagal menyimpan jadwal pinjaman member ${row.nrp}:`, errSched.message);
          }

          if (insertedScheds && insertedScheds.length > 0) {
            const repays = [];
            for (const sched of insertedScheds) {
              if (sched.paid_amount > 0) {
                repays.push({
                  loan_id: newLoan.id,
                  schedule_id: sched.id,
                  amount_paid: sched.paid_amount,
                  payment_method: 'migration',
                  payment_date: sched.due_date,
                  notes: 'Migrasi Angsuran Lampau'
                });
              }
            }
            if (repays.length > 0) {
              const { error: errRepay } = await supabase.from('loan_repayments').insert(repays);
              if (errRepay) {
                console.warn(`Gagal menyimpan mutasi cicilan migrasi member ${row.nrp}:`, errRepay.message);
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`Gagal memproses migrasi anggota NRP ${row.nrp} (${row.nama}):`, err);
    } finally {
      processedCount++;
      onProgress?.(processedCount, rows.length);
    }
  }
};

export const parseMemberMigrationExcel = parseMemberUpload;
export const syncMigratedMembers = executeMigration;
