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

const diffInMonths = (startDate: Date, endDate: Date) => {
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
};

const parseDate = (val: any): string | null => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const parsed = new Date(val);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return null;
};

const parseNumber = (val: any): number => {
  if (!val) return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export const parseMemberUpload = async (file: File): Promise<MemberParseResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
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
          const jumlah_simpanan_pokok = parseNumber(getVal('jumlah_simpanan_pokok'));
          const jumlah_simpanan_wajib = parseNumber(getVal('jumlah_simpanan_wajib'));
          const jumlah_simpanan_belanja = parseNumber(getVal('jumlah_simpanan_belanja'));
          const jumlah_simpanan_lebaran = parseNumber(getVal('jumlah_simpanan_lebaran'));
          
          let n_bulan_simpanan = 1;
          if (tgl_awal_anggota) {
             const diff = diffInMonths(new Date(tgl_awal_anggota), currentDate);
             n_bulan_simpanan = Math.max(1, diff);
          }
          
          const wajib_per_bulan = Math.floor(jumlah_simpanan_wajib / n_bulan_simpanan);
          const belanja_per_bulan = Math.floor(jumlah_simpanan_belanja / n_bulan_simpanan);
          const lebaran_per_bulan = Math.floor(jumlah_simpanan_lebaran / n_bulan_simpanan);
          
          const jumlah_pinjaman = parseNumber(getVal('jumlah_pinjaman'));
          const tgl_awal_pinjaman = parseDate(getVal('tgl_awal_pinjaman'));
          const tenor = parseNumber(getVal('tenor'));
          const sisa_pinjaman = parseNumber(getVal('sisa_pinjaman'));
          
          let n_bulan_pinjaman = 1;
          let sudah_diangsur = 0;
          let angsuran_lampau_per_bulan = 0;
          
          if (jumlah_pinjaman > 0 && sisa_pinjaman > 0) {
             sudah_diangsur = jumlah_pinjaman - sisa_pinjaman;
             if (tgl_awal_pinjaman) {
               const diffP = diffInMonths(new Date(tgl_awal_pinjaman), currentDate);
               n_bulan_pinjaman = Math.max(1, diffP);
             }
             angsuran_lampau_per_bulan = Math.floor(sudah_diangsur / n_bulan_pinjaman);
          }

          rows.push({
            nrp, nama, 
            pangkat: getVal('pangkat')?.toString().trim() || null,
            bank_account_number: getVal('bank_account_number')?.toString().trim() || null,
            membership_status,
            tgl_awal_anggota, jumlah_simpanan_pokok, jumlah_simpanan_wajib, jumlah_simpanan_belanja, jumlah_simpanan_lebaran,
            jumlah_pinjaman, tgl_awal_pinjaman, tenor, sisa_pinjaman,
            n_bulan_simpanan, wajib_per_bulan, belanja_per_bulan, lebaran_per_bulan,
            n_bulan_pinjaman, sudah_diangsur, angsuran_lampau_per_bulan
          });
        });

        if (rows.length === 0) throw new Error('Tidak ada data valid yang ditemukan.');
        resolve({ rows, errors });
      } catch (error: any) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
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

    // B. Setup Member Deposits & Transactions
    const depositTypesNeeded = [
      { id: typePokok, amount: row.jumlah_simpanan_pokok, isRoutine: false },
      { id: typeWajib, amount: row.jumlah_simpanan_wajib, monthly: row.wajib_per_bulan, isRoutine: true },
      { id: typeBelanja, amount: row.jumlah_simpanan_belanja, monthly: row.belanja_per_bulan, isRoutine: true },
      { id: typeLebaran, amount: row.jumlah_simpanan_lebaran, monthly: row.lebaran_per_bulan, isRoutine: true }
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
      if (!dt.isRoutine) {
         // One-time Pokok
         txsToInsert.push({
           member_deposit_id: mdId,
           amount: dt.amount,
           transaction_type: 'deposit',
           for_month: row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota).getMonth() + 1 : 1,
           for_year: row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota).getFullYear() : new Date().getFullYear(),
           description: 'One-Time Principal Deposit Migration',
           created_at: row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota).toISOString() : new Date().toISOString()
         });
      } else {
         // Routine Division
         let startDate = row.tgl_awal_anggota ? new Date(row.tgl_awal_anggota) : new Date();
         for(let i=0; i < row.n_bulan_simpanan; i++) {
            const mDate = new Date(startDate);
            mDate.setMonth(mDate.getMonth() + i);
            txsToInsert.push({
               member_deposit_id: mdId,
               amount: dt.monthly || 0,
               transaction_type: 'deposit',
               for_month: mDate.getMonth() + 1,
               for_year: mDate.getFullYear(),
               description: 'Historical Balance Migration',
               created_at: mDate.toISOString()
            });
         }
      }

      if (txsToInsert.length > 0) {
        await supabase.from('deposit_transactions').insert(txsToInsert);
      }
    }

    // C. Setup Loans
    if (row.jumlah_pinjaman > 0 && loanTypeId) {
       const loanPayload = {
         loan_number: `LOAN-MIG-${Date.now()}-${Math.floor(Math.random()*1000)}`,
         member_id: memberId,
         loan_type_id: loanTypeId,
         principal_amount: row.jumlah_pinjaman,
         agreed_tenor_months: row.tenor,
         planned_installment_amount: Math.floor(row.jumlah_pinjaman / row.tenor),
         amount: row.jumlah_pinjaman,
         tenor: row.tenor,
         monthly_target: Math.floor(row.jumlah_pinjaman / row.tenor),
         status: 'active',
         disbursed_at: row.tgl_awal_pinjaman ? new Date(row.tgl_awal_pinjaman).toISOString() : new Date().toISOString(),
         notes: 'Migrasi Histori Pinjaman'
       };

       const { data: newLoan } = await supabase.from('loans').insert(loanPayload).select('id').single();
       if (newLoan) {
         // Insert Repayments untuk yang sudah diangsur
         if (row.sudah_diangsur > 0) {
            const repays = [];
            let lDate = row.tgl_awal_pinjaman ? new Date(row.tgl_awal_pinjaman) : new Date();
            for(let i=0; i<row.n_bulan_pinjaman; i++) {
               const rDate = new Date(lDate);
               rDate.setMonth(rDate.getMonth() + i + 1); // bulan depan
               repays.push({
                 loan_id: newLoan.id,
                 amount_paid: row.angsuran_lampau_per_bulan,
                 payment_method: 'migration',
                 payment_date: rDate.toISOString(),
                 notes: 'Migrasi Angsuran Lampau'
               });
            }
            if (repays.length > 0) await supabase.from('loan_repayments').insert(repays);
         }
         
         // Insert Schedules untuk sisa_pinjaman
         const remainingMonths = row.tenor - row.n_bulan_pinjaman;
         if (remainingMonths > 0) {
            const scheds = [];
            let sDate = new Date();
            for(let i=0; i<remainingMonths; i++) {
               const d = new Date(sDate);
               d.setMonth(d.getMonth() + i + 1);
               scheds.push({
                 loan_id: newLoan.id,
                 period_number: row.n_bulan_pinjaman + i + 1,
                 due_date: d.toISOString().split('T')[0],
                 target_amount: Math.floor(row.sisa_pinjaman / remainingMonths),
                 paid_amount: 0,
                 status: 'unpaid'
               });
            }
            if (scheds.length > 0) await supabase.from('loan_schedules').insert(scheds);
         }
       }
    }
  }
};
