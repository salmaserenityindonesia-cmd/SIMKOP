import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export interface MemberExcelRow {
  nrp: string;
  nama: string;
  pangkat: string | null;
  bank_account_number: string | null;
  membership_status: string;
}

export interface MemberParseResult {
  newMembers: MemberExcelRow[];
  updatedMembers: MemberExcelRow[];
  errors: string[];
}

export const exportMemberTemplate = async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Template Anggota');

  worksheet.columns = [
    { header: 'nrp', key: 'nrp', width: 20 },
    { header: 'nama', key: 'nama', width: 30 },
    { header: 'pangkat', key: 'pangkat', width: 20 },
    { header: 'bank_account_number', key: 'bank_account_number', width: 25 },
    { header: 'membership_status', key: 'membership_status', width: 20 },
  ];

  // Set default format to TEXT
  worksheet.getColumn('nrp').numFmt = '@';
  worksheet.getColumn('nama').numFmt = '@';
  worksheet.getColumn('pangkat').numFmt = '@';
  worksheet.getColumn('bank_account_number').numFmt = '@';
  worksheet.getColumn('membership_status').numFmt = '@';

  worksheet.addRow({ nrp: '12345679', nama: 'Putut Ardian', pangkat: 'Briptu', bank_account_number: '014567890', membership_status: 'ACTIVE' });
  worksheet.addRow({ nrp: '87654321', nama: 'Contoh Anggota 2', pangkat: 'Brigadir', bank_account_number: '098765432', membership_status: 'ACTIVE' });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = 'template_import_anggota.xlsx';
  link.click();
  
  window.URL.revokeObjectURL(url);
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
        if (!worksheet) {
          throw new Error('File Excel kosong atau tidak valid');
        }

        const rows: MemberExcelRow[] = [];
        const errors: string[] = [];

        // Dapatkan header dari baris pertama (index 1 di exceljs)
        const headers: { [key: string]: number } = {};
        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
          const value = cell.value?.toString().toLowerCase().trim();
          if (value) {
            headers[value] = colNumber;
          }
        });

        // Validasi header wajib
        if (!headers['nrp'] || !headers['nama']) {
          throw new Error('Format kolom tidak valid. Pastikan ada kolom "nrp" dan "nama".');
        }

        const allowedStatus = ['ACTIVE', 'PENDING_RESIGNED', 'READY_TO_RESIGN', 'RESIGNED', 'BLOCKED'];

        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header

          const getCellValue = (colIndex: number | undefined) => {
            if (!colIndex) return null;
            const cell = row.getCell(colIndex);
            let val = cell.value;
            // Jika ada formula atau objek, ambil nilai aslinya
            if (val && typeof val === 'object' && 'result' in val) {
              val = (val as any).result;
            }
            if (val === null || val === undefined) return null;
            return val.toString().trim();
          };

          const nrp = getCellValue(headers['nrp']);
          const nama = getCellValue(headers['nama']);
          const pangkat = getCellValue(headers['pangkat']);
          const bank_account_number = getCellValue(headers['bank_account_number']);
          const rawStatus = getCellValue(headers['membership_status']);

          if (!nrp || !nama) {
            errors.push(`Baris ${rowNumber}: NRP dan Nama wajib diisi.`);
            return;
          }

          let membership_status = 'ACTIVE';
          if (rawStatus) {
            const upperStatus = rawStatus.toUpperCase();
            if (allowedStatus.includes(upperStatus)) {
              membership_status = upperStatus;
            } else {
              errors.push(`Baris ${rowNumber}: membership_status tidak valid. Harus salah satu dari ACTIVE, PENDING_RESIGNED, READY_TO_RESIGN, RESIGNED, BLOCKED.`);
              return;
            }
          }

          rows.push({
            nrp,
            nama,
            pangkat: pangkat || null,
            bank_account_number: bank_account_number || null,
            membership_status
          });
        });

        if (rows.length === 0) {
          throw new Error('Tidak ada data anggota valid yang ditemukan.');
        }

        // Ambil data NRP yang sudah ada
        const { data: existingMembers, error: fetchError } = await supabase
          .from('anggota')
          .select('nrp')
          .in('nrp', rows.map(r => r.nrp));

        if (fetchError) {
          throw new Error('Gagal memeriksa data duplikat di database.');
        }

        const existingNrps = new Set(existingMembers?.map(m => m.nrp));

        const newMembers: MemberExcelRow[] = [];
        const updatedMembers: MemberExcelRow[] = [];

        rows.forEach(row => {
          if (existingNrps.has(row.nrp)) {
            updatedMembers.push(row);
          } else {
            newMembers.push(row);
          }
        });

        resolve({ newMembers, updatedMembers, errors });
      } catch (error: any) {
        reject(error);
      }
    };
    
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsArrayBuffer(file);
  });
};

export const batchUpsertMembers = async (result: MemberParseResult): Promise<void> => {
  const { newMembers, updatedMembers } = result;

  // Insert new members
  if (newMembers.length > 0) {
    const { error } = await supabase
      .from('anggota')
      .insert(newMembers.map(m => ({
        nrp: m.nrp,
        nama: m.nama,
        pangkat: m.pangkat,
        bank_account_number: m.bank_account_number,
        membership_status: m.membership_status,
        status: 'aktif'
      })));
      
    if (error) {
      console.error('Insert error:', error);
      throw new Error('Gagal menambahkan anggota baru: ' + error.message);
    }
  }

  // Update existing members
  if (updatedMembers.length > 0) {
    // Memastikan `id` atau upsert conflict target valid
    // Di Supabase `upsert` dengan `onConflict: 'nrp'` memungkinkan update berdasarkan nrp
    const upsertPayload = updatedMembers.map(m => ({
      nrp: m.nrp,
      nama: m.nama,
      pangkat: m.pangkat,
      bank_account_number: m.bank_account_number,
      membership_status: m.membership_status,
      status: 'aktif'
    }));

    const { error } = await supabase
      .from('anggota')
      .upsert(upsertPayload, { onConflict: 'nrp' });

    if (error) {
      console.error('Update error:', error);
      throw new Error('Gagal memperbarui data anggota: ' + error.message);
    }
  }
};
