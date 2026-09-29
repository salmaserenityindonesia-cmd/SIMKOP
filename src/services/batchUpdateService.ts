import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export type BatchPreviewRow = {
  nrp: string;
  nama: string;
  nomor_rekening: string;
  periode: string; // MM/YYYY
  jenis_tagihan: string; // e.g. WAJIB, LEBARAN or Loan Number
  nominal_lama: number;
  nominal_baru: number;
  status: 'READY' | 'MISMATCH' | 'ERROR';
  ref_id?: string; // loan_id or member_deposit_id
  schedule_id?: string; // for loans
};

export const downloadBatchTemplate = async (type: 'savings' | 'loans', month: number, year: number) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Template ${type === 'savings' ? 'Simpanan' : 'Pinjaman'} ${month}-${year}`);

  if (type === 'savings') {
    worksheet.columns = [
      { header: 'NRP', key: 'nrp', width: 15 },
      { header: 'Nama', key: 'nama', width: 30 },
      { header: 'Nomor Rekening', key: 'nomor_rekening', width: 20 },
      { header: 'Bulan', key: 'bulan', width: 10 },
      { header: 'Tahun', key: 'tahun', width: 10 },
      { header: 'Kode Simpanan', key: 'kode_simpanan', width: 15 },
      { header: 'Telah Dibayar', key: 'telah_dibayar', width: 20 },
      { header: 'Jumlah Bayar', key: 'jumlah_bayar', width: 20 },
    ];

    const { data: members, error: mErr } = await supabase.from('anggota').select('id, nrp, nama, bank_account_number').eq('status', 'aktif');
    const { data: deposits, error: dErr } = await supabase.from('member_deposits').select('id, member_id, deposit_types(code, default_amount, frequency_type)');
    const { data: txs, error: tErr } = await supabase.from('deposit_transactions').select('member_deposit_id, amount').eq('for_month', month).eq('for_year', year);

    if (members && deposits) {
      for (const m of members) {
        const memberDeps = deposits.filter(d => d.member_id === m.id);
        for (const dep of memberDeps) {
          const freq = (dep.deposit_types as any)?.frequency_type;
          if (freq === 'one_time' || freq === 'once') continue;

          const typeCode = (dep.deposit_types as any)?.code || '';
          const expected = (dep.deposit_types as any)?.default_amount || 0;
          
          const memberTxs = (txs || []).filter(tx => tx.member_deposit_id === dep.id);
          const paid = memberTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);

          worksheet.addRow({
              nrp: m.nrp,
              nama: m.nama,
              nomor_rekening: m.bank_account_number || '-',
              bulan: month,
              tahun: year,
              kode_simpanan: typeCode,
              telah_dibayar: paid,
              jumlah_bayar: expected > paid ? expected - paid : 0
          });
        }
      }
    } else {
        console.error("Error fetching savings data:", mErr, dErr, tErr);
    }

  } else {
    worksheet.columns = [
      { header: 'NRP', key: 'nrp', width: 15 },
      { header: 'Nama', key: 'nama', width: 30 },
      { header: 'Nomor Rekening', key: 'nomor_rekening', width: 20 },
      { header: 'ID Pinjaman', key: 'loan_number', width: 40 },
      { header: 'Bulan', key: 'bulan', width: 10 },
      { header: 'Tahun', key: 'tahun', width: 10 },
      { header: 'Target Angsuran', key: 'target_angsuran', width: 20 },
      { header: 'Telah Dibayar', key: 'telah_dibayar', width: 20 },
      { header: 'Jumlah Bayar', key: 'jumlah_bayar', width: 20 },
    ];

    const { data: activeLoans, error: lErr } = await supabase
      .from('loans')
      .select('id, amount, status, anggota(nrp, nama, bank_account_number), loan_schedules(*)')
      .in('status', ['approved', 'active']);
    
    if (activeLoans) {
        activeLoans.forEach(loan => {
            const member = (loan.anggota as any);
            if (member) {
              const schedules = loan.loan_schedules || [];
              // Find the schedule for the requested month/year
              const currentSchedule = schedules.find((s: any) => {
                  if (!s.due_date) return false;
                  const d = new Date(s.due_date);
                  return (d.getMonth() + 1) === month && d.getFullYear() === year;
              });
              
              const target = currentSchedule ? currentSchedule.target_amount : 0;
              const paid = currentSchedule ? currentSchedule.paid_amount : 0;
              
              worksheet.addRow({
                  nrp: member.nrp,
                  nama: member.nama,
                  nomor_rekening: member.bank_account_number || '-',
                  loan_number: loan.id,
                  bulan: month,
                  tahun: year,
                  target_angsuran: target,
                  telah_dibayar: paid,
                  jumlah_bayar: target > paid ? target - paid : 0
              });
            }
        });
    } else {
        console.error("Error fetching loans data:", lErr);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Template_${type}_${month}_${year}.xlsx`;
  anchor.click();
  window.URL.revokeObjectURL(url);
};

export const parseBatchUpdateFile = async (file: File, type: 'savings' | 'loans', month: number, year: number): Promise<BatchPreviewRow[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const worksheet = workbook.getWorksheet(1);
    
    if (!worksheet) throw new Error('Worksheet tidak ditemukan');

    const results: BatchPreviewRow[] = [];
    
    // Helper to get string
    const getVal = (row: ExcelJS.Row, col: number) => {
        let val = row.getCell(col).value;
        if (typeof val === 'object' && val !== null) {
            const richObj: any = val;
            val = richObj.result || richObj.text || '';
        }
        return val?.toString().trim() || '';
    };

    if (type === 'savings') {
        const nrpList: string[] = [];
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // skip header
            const nrp = getVal(row, 1);
            if (nrp) nrpList.push(nrp);
        });

        // Pre-fetch member deposits for matching
        const { data: members } = await supabase.from('anggota').select('id, nrp, nama, member_deposits(id, deposit_types(code))').in('nrp', nrpList);
        const memberMap = new Map();
        if (members) {
            members.forEach(m => memberMap.set(m.nrp, m));
        }

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const nrp = getVal(row, 1);
            if (!nrp) return;
            
            // Kolom 7: Telah Dibayar, Kolom 8: Jumlah Bayar
            const nominalLamaStr = getVal(row, 7);
            const nominalBaruStr = getVal(row, 8); 
            const nominal_baru = parseFloat(nominalBaruStr.replace(/[^0-9.-]+/g, '')) || 0;
            const nominal_lama = parseFloat(nominalLamaStr.replace(/[^0-9.-]+/g, '')) || 0;
            const kode_simpanan = getVal(row, 6);

            const m = memberMap.get(nrp);
            let status: 'READY' | 'MISMATCH' | 'ERROR' = 'READY';
            let ref_id = undefined;

            if (!m) {
                status = 'ERROR'; // NRP not found
            } else {
                const dep = m.member_deposits.find((d: any) => d.deposit_types.code === kode_simpanan);
                if (dep) {
                    ref_id = dep.id;
                } else {
                    status = 'MISMATCH';
                }
            }

            results.push({
                nrp,
                nama: m ? m.nama : getVal(row, 2),
                nomor_rekening: getVal(row, 3),
                periode: `${month.toString().padStart(2, '0')}/${year}`,
                jenis_tagihan: kode_simpanan,
                nominal_lama,
                nominal_baru,
                status,
                ref_id
            });
        });
    } else {
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const nrp = getVal(row, 1);
            if (!nrp) return;
            
            // Kolom 8: Telah Dibayar, Kolom 9: Jumlah Bayar
            const nominalLamaStr = getVal(row, 8);
            const nominalBaruStr = getVal(row, 9);
            const nominal_baru = parseFloat(nominalBaruStr.replace(/[^0-9.-]+/g, '')) || 0;
            const nominal_lama = parseFloat(nominalLamaStr.replace(/[^0-9.-]+/g, '')) || 0;

            const loan_number = getVal(row, 4);

            results.push({
                nrp,
                nama: getVal(row, 2),
                nomor_rekening: getVal(row, 3),
                periode: `${month.toString().padStart(2, '0')}/${year}`,
                jenis_tagihan: `Pinjaman: ${loan_number}`,
                nominal_lama,
                nominal_baru,
                status: loan_number ? 'READY' : 'ERROR',
                ref_id: loan_number
            });
        });
    }

    return results;
};

export const executeBatchUpdate = async (payload: BatchPreviewRow[], type: 'savings' | 'loans', month: number, year: number) => {
    // We only process rows where nominal_baru > 0 AND it's different from what was already paid
    const validRows = payload.filter(r => r.status === 'READY' && r.nominal_baru > 0 && r.nominal_baru !== r.nominal_lama);
    if (validRows.length === 0) {
        throw new Error("Tidak ada data dengan nominal pembayaran > 0 yang berbeda dari nilai Telah Dibayar sebelumnya.");
    }

    // Fast client-side bulk operations
    if (type === 'savings') {
        const txs = validRows.map(r => ({
            member_deposit_id: r.ref_id,
            amount: r.nominal_baru - r.nominal_lama,
            for_month: month,
            for_year: year,
            transaction_type: 'deposit',
            description: `Batch Update ${month}/${year}`
        }));
        const { error } = await supabase.from('deposit_transactions').insert(txs);
        if (error) throw error;
    } else {
        // Loans are trickier because of schedules.
        // We will fetch all relevant schedules first
        const loanIds = validRows.map(r => r.ref_id).filter(Boolean);
        const { data: schedules } = await supabase.from('loan_schedules').select('*').in('loan_id', loanIds);
        
        if (schedules) {
            for (const r of validRows) {
                const sched = schedules.find(s => {
                    if (s.loan_id !== r.ref_id) return false;
                    if (!s.due_date) return false;
                    const d = new Date(s.due_date);
                    return (d.getMonth() + 1) === month && d.getFullYear() === year;
                });
                
                if (sched) {
                    const delta = r.nominal_baru - sched.paid_amount;
                    if (delta === 0) continue;

                    const newPaid = r.nominal_baru;
                    const newStatus = newPaid >= sched.target_amount ? 'paid' : 'partial';
                    
                    // Update schedule
                    await supabase.from('loan_schedules').update({ paid_amount: newPaid, status: newStatus }).eq('id', sched.id);
                    
                    // Insert repayment
                    await supabase.from('loan_repayments').insert({
                        loan_id: sched.loan_id,
                        schedule_id: sched.id,
                        amount_paid: delta,
                        payment_method: 'batch_transfer',
                        notes: `Batch Update Correction ${month}/${year}`
                    });
                }
            }
        }
    }
    return true;
};
