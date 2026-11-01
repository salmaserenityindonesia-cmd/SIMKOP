import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

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

export const exportMemberTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Migrasi Anggota');

  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 15 },
    { header: 'nama', key: 'nama', width: 30 },
    { header: 'pangkat', key: 'pangkat', width: 20 },
    { header: 'bank_account_number', key: 'bank_account_number', width: 25 },
    { header: 'membership_status', key: 'membership_status', width: 20 },
    { header: 'tgl_awal_anggota', key: 'tgl_awal_anggota', width: 20 },
    { header: 'jumlah_simpanan_pokok', key: 'jumlah_simpanan_pokok', width: 25 },
    { header: 'jumlah_simpanan_wajib', key: 'jumlah_simpanan_wajib', width: 25 },
    { header: 'jumlah_simpanan_belanja', key: 'jumlah_simpanan_belanja', width: 25 },
    { header: 'jumlah_simpanan_lebaran', key: 'jumlah_simpanan_lebaran', width: 25 },
    { header: 'jumlah_pinjaman', key: 'jumlah_pinjaman', width: 20 },
    { header: 'tgl_awal_pinjaman', key: 'tgl_awal_pinjaman', width: 20 },
    { header: 'tenor', key: 'tenor', width: 15 },
    { header: 'sisa_pinjaman', key: 'sisa_pinjaman', width: 20 },
  ];

  ['nrp', 'nama', 'pangkat', 'bank_account_number', 'membership_status'].forEach(k => worksheet.getColumn(k).numFmt = '@');
  ['tgl_awal_anggota', 'tgl_awal_pinjaman'].forEach(k => worksheet.getColumn(k).numFmt = 'yyyy-mm-dd');

  worksheet.addRow({
    nrp: '12345679', nama: 'Putut Ardian', pangkat: 'Briptu', bank_account_number: '014567890', membership_status: 'ACTIVE',
    tgl_awal_anggota: '2023-01-01', jumlah_simpanan_pokok: 100000, jumlah_simpanan_wajib: 1200000, jumlah_simpanan_belanja: 600000, jumlah_simpanan_lebaran: 300000,
    jumlah_pinjaman: 5000000, tgl_awal_pinjaman: '2023-06-01', tenor: 12, sisa_pinjaman: 2000000
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'template_migrasi_anggota_v2.xlsx';
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

  if (!headers['nrp'] || !headers['nama'] || !headers['tgl_awal_anggota']) {
    throw new Error('Format kolom tidak valid. Pastikan kolom minimal (nrp, nama, tgl_awal_anggota) ada.');
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

    const jumlah_pinjaman = parseAmount(getVal('jumlah_pinjaman'));
    const rawTglPinj = getVal('tgl_awal_pinjaman');
    let tgl_awal_pinjaman: string | null = null;
    if (rawTglPinj !== null && rawTglPinj !== undefined) {
      const str = rawTglPinj instanceof Date ? rawTglPinj.toISOString().split('T')[0] : String(rawTglPinj).trim();
      tgl_awal_pinjaman = str.length > 0 ? str : null;
    }
    const tenor = Math.max(0, Math.floor(parseAmount(getVal('tenor'))));
    const sisa_pinjaman = parseAmount(getVal('sisa_pinjaman'));

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
      bank_account_number: getVal('bank_account_number')?.toString().trim() || null,
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

export const executeMigration = async (result: MemberParseResult): Promise<void> => {
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

      // B. Setup Member Deposits & Transactions (Timpa Mutlak / Exact Replacement Overwrite)
      // B.1 Hapus mutasi migrasi lama pada deposit_transactions untuk seluruh member_deposits milik memberId
      const { data: existingDeposits, error: errFetchDeposits } = await supabase
        .from('member_deposits')
        .select('id')
        .eq('member_id', memberId);

      if (errFetchDeposits) {
        console.warn(`Gagal memeriksa simpanan lama untuk member ${row.nrp}:`, errFetchDeposits.message);
      }

      if (existingDeposits && existingDeposits.length > 0) {
        const mdIds = existingDeposits.map((d: any) => d.id);
        const { error: errDelTx } = await supabase
          .from('deposit_transactions')
          .delete()
          .in('member_deposit_id', mdIds)
          .in('description', [
            'Migrasi Saldo Awal (As-Is)',
            'Migrasi Saldo Awal',
            'One-Time Principal Deposit Migration',
            'Historical Balance Migration'
          ]);

        if (errDelTx) {
          console.warn(`Gagal membersihkan mutasi migrasi lama untuk member ${row.nrp}:`, errDelTx.message);
        }
      }

      // B.2 Masukkan satu mutasi transaksi saldo migrasi baru per tipe simpanan dengan amount murni dari file Excel
      const depositTypesNeeded = [
        { id: typePokok, amount: row.jumlah_simpanan_pokok, isRoutine: false },
        { id: typeWajib, amount: row.jumlah_simpanan_wajib, isRoutine: true },
        { id: typeBelanja, amount: row.jumlah_simpanan_belanja, isRoutine: true },
        { id: typeLebaran, amount: row.jumlah_simpanan_lebaran, isRoutine: true }
      ];

      for (const dt of depositTypesNeeded) {
        if (!dt.id || dt.amount <= 0) continue;

        // Upsert relasi member_deposits
        const { data: mdRecord } = await supabase.from('member_deposits')
          .select('id').eq('member_id', memberId).eq('deposit_type_id', dt.id).single();

        let mdId = mdRecord?.id;
        if (!mdId) {
          const { data: newMd } = await supabase.from('member_deposits')
            .insert({ member_id: memberId, deposit_type_id: dt.id, is_terminated: false })
            .select('id').single();
          mdId = newMd?.id;
        }
        if (!mdId) continue;

        // Insert Transactions
        const txsToInsert = [];
        const dateObj = row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota) : new Date();
        const validDate = !isNaN(dateObj.getTime()) ? dateObj : new Date();

        if (!dt.isRoutine) {
          // One-time Pokok
          txsToInsert.push({
            member_deposit_id: mdId,
            amount: dt.amount,
            transaction_type: 'deposit',
            for_month: validDate.getMonth() + 1,
            for_year: validDate.getFullYear(),
            description: 'One-Time Principal Deposit Migration',
            created_at: validDate.toISOString()
          });
        } else {
          // Rutin As-Is: Masukkan satu mutasi saldo migrasi utuh tanpa perulangan pembagian bulan
          txsToInsert.push({
            member_deposit_id: mdId,
            amount: dt.amount,
            transaction_type: 'deposit',
            for_month: validDate.getMonth() + 1,
            for_year: validDate.getFullYear(),
            description: 'Migrasi Saldo Awal (As-Is)',
            created_at: validDate.toISOString()
          });
        }

        if (txsToInsert.length > 0) {
          await supabase.from('deposit_transactions').insert(txsToInsert);
        }
      }

      // C. Setup Loans
      if (row.jumlah_pinjaman > 0 && loanTypeId) {
        // Bersihkan pinjaman migrasi aktif lama (jika ada) sebelum membuat pinjaman migrasi baru
        const { data: existingLoans, error: errFetchLoans } = await supabase
          .from('loans')
          .select('id, loan_number, notes, status')
          .eq('member_id', memberId);

        if (errFetchLoans) {
          console.warn(`Gagal memeriksa pinjaman lama untuk member ${row.nrp}:`, errFetchLoans.message);
        }

        const migLoanIds = (existingLoans || [])
          .filter((l: any) =>
            (l.status === 'active' || !l.status) &&
            ((l.loan_number && typeof l.loan_number === 'string' && l.loan_number.startsWith('LOAN-MIG-')) ||
             (l.notes && typeof l.notes === 'string' && l.notes.includes('Migrasi Histori Pinjaman')))
          )
          .map((l: any) => l.id);

        if (migLoanIds.length > 0) {
          // Hapus repayments terlebih dahulu (foreign key ke loan_schedules / loans)
          const { error: errDelRepay } = await supabase
            .from('loan_repayments')
            .delete()
            .in('loan_id', migLoanIds);
          if (errDelRepay) {
            console.warn(`Gagal membersihkan repayment pinjaman migrasi lama member ${row.nrp}:`, errDelRepay.message);
          }

          // Hapus schedules (foreign key ke loans)
          const { error: errDelSched } = await supabase
            .from('loan_schedules')
            .delete()
            .in('loan_id', migLoanIds);
          if (errDelSched) {
            console.warn(`Gagal membersihkan jadwal pinjaman migrasi lama member ${row.nrp}:`, errDelSched.message);
          }

          // Hapus pinjaman migrasi lama
          const { error: errDelLoan } = await supabase
            .from('loans')
            .delete()
            .in('id', migLoanIds);
          if (errDelLoan) {
            console.warn(`Gagal membersihkan pinjaman migrasi lama member ${row.nrp}:`, errDelLoan.message);
          }
        }

        let isTglPinjValid = false;
        let disbursedDate = new Date();

        if (row.tgl_awal_pinjaman && !/^\d+$/.test(row.tgl_awal_pinjaman)) {
          const parsed = new Date(row.tgl_awal_pinjaman);
          if (!isNaN(parsed.getTime())) {
            isTglPinjValid = true;
            disbursedDate = parsed;
          }
        }

        const disbursedAt = isTglPinjValid
          ? disbursedDate.toISOString()
          : new Date().toISOString();

        const loanNotes = isTglPinjValid
          ? 'Migrasi Histori Pinjaman'
          : `Migrasi Histori Pinjaman (Nilai asli tgl/siklus Excel: "${row.tgl_awal_pinjaman || '-'}")`;

        const tenor = row.tenor > 0 ? row.tenor : 1;
        const plannedInstallment = Math.floor(row.jumlah_pinjaman / tenor);

        const loanPayload = {
          loan_number: `LOAN-MIG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          member_id: memberId,
          loan_type_id: loanTypeId,
          principal_amount: row.jumlah_pinjaman,
          agreed_tenor_months: tenor,
          planned_installment_amount: plannedInstallment,
          amount: row.jumlah_pinjaman,
          tenor: tenor,
          monthly_target: plannedInstallment,
          status: 'active',
          disbursed_at: disbursedAt,
          notes: loanNotes
        };

        const { data: newLoan } = await supabase.from('loans').insert(loanPayload).select('id').single();
        if (newLoan) {
          // Generate ALL schedules
          const scheds = [];
          let lDate = isTglPinjValid ? disbursedDate : new Date();
          const targetPerMonth = plannedInstallment;

          let remainingPaidAmt = row.sudah_diangsur;

          for (let i = 0; i < tenor; i++) {
            const d = new Date(lDate);
            const sm = d.getMonth();
            d.setMonth(sm + i + 1);
            if (d.getMonth() !== (sm + i + 1) % 12) d.setDate(0);

            let paidAmt = 0;
            let status = 'unpaid';

            if (remainingPaidAmt >= targetPerMonth) {
              paidAmt = targetPerMonth;
              status = 'paid';
              remainingPaidAmt -= targetPerMonth;
            } else if (remainingPaidAmt > 0) {
              paidAmt = remainingPaidAmt;
              status = 'partial';
              remainingPaidAmt = 0;
            }

            scheds.push({
              loan_id: newLoan.id,
              period_number: i + 1,
              due_date: d.toISOString().split('T')[0],
              target_amount: targetPerMonth,
              paid_amount: paidAmt,
              status: status
            });
          }

          if (scheds.length > 0) {
            const { data: insertedScheds } = await supabase.from('loan_schedules').insert(scheds).select('*');

            // Insert Repayments untuk yang sudah diangsur
            if (row.sudah_diangsur > 0 && insertedScheds) {
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
              if (repays.length > 0) await supabase.from('loan_repayments').insert(repays);
            }
          }
        }
      }
    } catch (err: any) {
      console.error(`Gagal memproses migrasi anggota NRP ${row.nrp} (${row.nama}):`, err);
    }
  }
};
