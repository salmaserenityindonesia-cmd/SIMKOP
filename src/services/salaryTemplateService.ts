import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient'; // Assuming standard supabase client location

export const downloadSalaryTemplate = async () => {
  try {
    // 1. Fetch data from public.anggota
    const { data, error } = await supabase
      .from('anggota')
      .select('nrp, nama, bank_account_number')
      .eq('status', 'aktif');

    if (error) {
      throw error;
    }

    // 2. Initialize workbook and worksheet
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Rekonsiliasi');

    // 3. Define columns
    worksheet.columns = [
      { header: 'NRP', key: 'nrp', width: 20 },
      { header: 'Nama Lengkap', key: 'nama', width: 30 },
      { header: 'Nomor Rekening', key: 'nomor_rekening', width: 25 },
      { header: 'Take Home Pay (THP)', key: 'take_home_pay', width: 25 },
    ];

    // Format header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // 4. Populate rows
    if (data && data.length > 0) {
      data.forEach((anggota: any) => {
        const row = worksheet.addRow({
          nrp: anggota.nrp,
          nama: anggota.nama,
          nomor_rekening: anggota.bank_account_number || '',
          take_home_pay: '', // Empty as requested
        });
        
        // Force NRP to be treated as text
        row.getCell(1).numFmt = '@';
      });
    } else {
        // Add one empty sample row if no data
        const row = worksheet.addRow({
            nrp: '12345678',
            nama: 'Contoh Nama',
            nomor_rekening: '0011223344',
            take_home_pay: '',
        });
        row.getCell(1).numFmt = '@';
    }

    // 5. Generate and download file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Template_Rekonsiliasi_${new Date().toISOString().split('T')[0]}.xlsx`);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
    
    return true;
  } catch (error) {
    console.error('Error generating salary template:', error);
    throw error;
  }
};
