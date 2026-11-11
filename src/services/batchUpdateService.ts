import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import {
  getApplicableRate,
  getActivePokokTariff,
  getRateTiers,
  SavingsRateTier,
} from './savingsRateService';

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

export interface SavingsTemplateRow {
  nrp: string;
  nama: string;
  nomor_rekening: string;
  bulan: number;
  tahun: number;
  kode_simpanan: string;
  telah_dibayar: number;
  jumlah_bayar: number;
}

export interface MemberBatchItem {
  id: string;
  nrp: string;
  nama: string;
  bank_account_number?: string | null;
  status?: string;
}

export interface DepositTypeItem {
  id?: string;
  code?: string;
  name?: string;
  default_amount?: number;
  frequency_type?: string;
}

export interface MemberDepositItem {
  id: string;
  member_id: string;
  deposit_type_id?: string;
  deposit_types?: DepositTypeItem | DepositTypeItem[] | null;
}

export interface DepositTransactionItem {
  id?: string;
  member_deposit_id: string;
  amount: number;
  transaction_type?: string;
  for_month?: number | null;
  for_year?: number | null;
}

/**
 * Memeriksa apakah tipe simpanan merupakan Simpanan Pokok (POKOK / SP / nama 'pokok')
 */
export function isPokokDepositType(dt?: { code?: string; name?: string } | null): boolean {
  if (!dt) return false;
  const c = (dt.code || '').toUpperCase();
  const n = (dt.name || '').toLowerCase();
  return c === 'POKOK' || c === 'SP' || n.includes('pokok');
}

/**
 * Urutan prioritas simpanan rutin: 1: WAJIB, 2: LEBARAN, 3: BELANJA, sisanya urutan berikutnya
 */
export function getDepositTypeSortOrder(dt?: { code?: string; name?: string } | null): number {
  if (!dt) return 99;
  const c = (dt.code || '').toUpperCase();
  const n = (dt.name || '').toLowerCase();
  if (c === 'WAJIB' || c === 'SW' || n.includes('wajib')) return 1;
  if (c === 'LEBARAN' || c === 'SL' || n.includes('lebaran') || n.includes('hari raya')) return 2;
  if (c === 'BELANJA' || c === 'SB' || n.includes('belanja')) return 3;
  return 10;
}

/**
 * Menyusun baris-baris data template simpanan bulanan Excel.
 * Setiap anggota aktif memiliki urutan:
 * Baris 1: WAJIB
 * Baris 2: LEBARAN
 * Baris 3: BELANJA
 * Baris 4: POKOK (Kondisional: HANYA jika Simpanan Pokok anggota belum lunas).
 */
export function buildSavingsTemplateRows(
  members: MemberBatchItem[],
  deposits: MemberDepositItem[],
  depositTypes: DepositTypeItem[] = [],
  txsForMonth: DepositTransactionItem[] = [],
  allPokokTxs: DepositTransactionItem[] = [],
  pokokTargetAmount: number = 10000,
  month: number,
  year: number,
  rateTiers?: SavingsRateTier[]
): SavingsTemplateRow[] {
  const rows: SavingsTemplateRow[] = [];

  const getDepositTypeInfo = (dep: MemberDepositItem): DepositTypeItem | undefined => {
    if (dep.deposit_types) {
      return Array.isArray(dep.deposit_types) ? dep.deposit_types[0] : dep.deposit_types;
    }
    if (dep.deposit_type_id && depositTypes.length > 0) {
      return depositTypes.find(dt => dt.id === dep.deposit_type_id);
    }
    return undefined;
  };

  const effectivePokokTarget = Number(pokokTargetAmount) > 0 ? Number(pokokTargetAmount) : 10000;

  for (const m of members) {
    const memberDeps = deposits.filter(d => d.member_id === m.id);

    // 1. Akumulasi pembayaran Simpanan Pokok historis
    const memberPokokDeps = memberDeps.filter(dep => isPokokDepositType(getDepositTypeInfo(dep)));
    const memberPokokDepIds = new Set(memberPokokDeps.map(dep => dep.id));

    const memberPokokTxs = allPokokTxs.filter(tx =>
      memberPokokDepIds.has(tx.member_deposit_id) || (tx as any).member_id === m.id
    );

    const paidPokok = memberPokokTxs.reduce((sum, tx) => {
      const amt = Number(tx.amount) || 0;
      if (tx.transaction_type === 'withdrawal') {
        return sum - amt;
      }
      return sum + amt;
    }, 0);

    const effectivePaidPokok = Math.max(0, paidPokok);
    const isPokokLunas = effectivePaidPokok >= effectivePokokTarget;

    // 2. Baris Simpanan Rutin Bulanan
    const memberRecurringDeps = memberDeps.filter(dep => {
      const dt = getDepositTypeInfo(dep);
      if (isPokokDepositType(dt)) return false;
      const freq = dt?.frequency_type;
      if (freq === 'one_time' || freq === 'once') return false;
      return true;
    });

    if (memberRecurringDeps.length > 0) {
      // Urutkan simpanan rutin: 1. WAJIB, 2. LEBARAN, 3. BELANJA, dll.
      memberRecurringDeps.sort((a, b) => {
        const dtA = getDepositTypeInfo(a);
        const dtB = getDepositTypeInfo(b);
        return getDepositTypeSortOrder(dtA) - getDepositTypeSortOrder(dtB);
      });

      for (const dep of memberRecurringDeps) {
        const dt = getDepositTypeInfo(dep);
        const typeCode = dt?.code || '';
        const rateFromTier = getApplicableRate(typeCode, year, month, rateTiers);
        const expected = rateFromTier > 0 ? rateFromTier : (dt?.default_amount || 0);

        const memberTxs = txsForMonth.filter(tx => tx.member_deposit_id === dep.id);
        const paid = memberTxs.reduce((sum, tx) => {
          const amt = Number(tx.amount) || 0;
          if (tx.transaction_type === 'withdrawal') {
            return sum - amt;
          }
          return sum + amt;
        }, 0);
        const effectivePaid = Math.max(0, paid);

        rows.push({
          nrp: m.nrp,
          nama: m.nama,
          nomor_rekening: m.bank_account_number || '-',
          bulan: month,
          tahun: year,
          kode_simpanan: typeCode,
          telah_dibayar: effectivePaid,
          jumlah_bayar: expected > effectivePaid ? expected - effectivePaid : 0
        });
      }
    } else {
      // Fallback jika belum memiliki rekening simpanan rutin terdaftar:
      // Sediakan 3 baris simpanan standar bulanan
      const standardCodes = ['WAJIB', 'LEBARAN', 'BELANJA'];
      for (const code of standardCodes) {
        const matchedDt = depositTypes.find(t => (t.code || '').toUpperCase() === code);
        const rateFromTier = getApplicableRate(code, year, month, rateTiers);
        const expected = rateFromTier > 0 ? rateFromTier : (matchedDt?.default_amount || 0);

        rows.push({
          nrp: m.nrp,
          nama: m.nama,
          nomor_rekening: m.bank_account_number || '-',
          bulan: month,
          tahun: year,
          kode_simpanan: code,
          telah_dibayar: 0,
          jumlah_bayar: expected
        });
      }
    }

    // 3. Pengecekan Kondisional Pokok
    if (!isPokokLunas) {
      const sisaPokok = Math.max(0, effectivePokokTarget - effectivePaidPokok);
      rows.push({
        nrp: m.nrp,
        nama: m.nama,
        nomor_rekening: m.bank_account_number || '-',
        bulan: month,
        tahun: year,
        kode_simpanan: 'POKOK',
        telah_dibayar: effectivePaidPokok,
        jumlah_bayar: sisaPokok
      });
    }
  }

  return rows;
}

/**
 * Menghasilkan workbook template batch update simpanan bulanan lengkap dengan baris pokok kondisional.
 */
export const generateSavingsBatchTemplate = async (
  month: number,
  year: number
): Promise<{ workbook: ExcelJS.Workbook; rows: SavingsTemplateRow[] }> => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`Template Simpanan ${month}-${year}`);

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

  const { data: members, error: mErr } = await supabase
    .from('anggota')
    .select('id, nrp, nama, bank_account_number')
    .eq('status', 'aktif');

  const { data: deposits, error: dErr } = await supabase
    .from('member_deposits')
    .select('id, member_id, deposit_type_id, deposit_types(id, code, name, default_amount, frequency_type)');

  const { data: depositTypes, error: dtErr } = await supabase
    .from('deposit_types')
    .select('id, code, name, default_amount, frequency_type');

  const { data: txs, error: tErr } = await supabase
    .from('deposit_transactions')
    .select('id, member_deposit_id, amount, transaction_type, for_month, for_year')
    .eq('for_month', month)
    .eq('for_year', year);

  if (mErr || dErr || tErr || dtErr) {
    console.error("Error fetching savings batch template data:", { mErr, dErr, tErr, dtErr });
  }

  const rateTiers = await getRateTiers(undefined, false).catch(() => []);

  // Ambil nominal tarif Simpanan Pokok aktif
  let pokokTargetAmount = await getActivePokokTariff().catch(() => 0);
  if (!pokokTargetAmount || pokokTargetAmount <= 0) {
    pokokTargetAmount = getApplicableRate('POKOK', year, month, rateTiers) || 10000;
  }

  // Ambil riwayat setoran pokok dari semua rekening simpanan pokok anggota
  const pokokDepositIds = (deposits || [])
    .filter(d => {
      const dt = Array.isArray(d.deposit_types) ? d.deposit_types[0] : d.deposit_types;
      if (isPokokDepositType(dt)) return true;
      if (d.deposit_type_id && depositTypes) {
        const match = depositTypes.find(t => t.id === d.deposit_type_id);
        return isPokokDepositType(match);
      }
      return false;
    })
    .map(d => d.id);

  const allPokokTxs: any[] = [];
  if (pokokDepositIds.length > 0) {
    const chunkSize = 200;
    for (let i = 0; i < pokokDepositIds.length; i += chunkSize) {
      const chunk = pokokDepositIds.slice(i, i + chunkSize);
      const { data: pData } = await supabase
        .from('deposit_transactions')
        .select('id, member_deposit_id, amount, transaction_type')
        .in('member_deposit_id', chunk);
      if (pData) {
        allPokokTxs.push(...pData);
      }
    }
  }

  const rows = buildSavingsTemplateRows(
    members || [],
    deposits || [],
    depositTypes || [],
    txs || [],
    allPokokTxs,
    pokokTargetAmount,
    month,
    year,
    rateTiers
  );

  rows.forEach(r => worksheet.addRow(r));

  return { workbook, rows };
};

export const downloadBatchTemplate = async (type: 'savings' | 'loans', month: number, year: number) => {
  let workbook: ExcelJS.Workbook;

  if (type === 'savings') {
    const res = await generateSavingsBatchTemplate(month, year);
    workbook = res.workbook;
  } else {
    workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Template Pinjaman ${month}-${year}`);

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

  if (typeof window !== 'undefined' && window.URL && document.createElement) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Template_${type}_${month}_${year}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  }
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
        const refIds = validRows.map(r => r.ref_id).filter(Boolean);
        if (refIds.length > 0) {
            // Delete old transactions for this month/year for the affected deposits
            const { error: delError } = await supabase
                .from('deposit_transactions')
                .delete()
                .in('member_deposit_id', refIds)
                .eq('for_month', month)
                .eq('for_year', year);
                
            if (delError) throw delError;

            // Insert new transactions with the updated total
            const txs = validRows.map(r => ({
                member_deposit_id: r.ref_id,
                amount: r.nominal_baru,
                for_month: month,
                for_year: year,
                transaction_type: 'deposit',
                description: `Batch Update ${month}/${year}`
            }));
            const { error: insError } = await supabase.from('deposit_transactions').insert(txs);
            if (insError) throw insError;
        }
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
