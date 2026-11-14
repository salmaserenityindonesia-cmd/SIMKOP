import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import {
  getApplicableRate,
  getActivePokokTariff,
  getRateTiers,
  buildSavingsRateResolver,
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
  member_id?: string;
};

export interface BatchExecutionSummary {
  success: boolean;
  totalProcessed: number;
  recurringCount?: number;
  pokokCount?: number;
  loansCount?: number;
  message?: string;
}

export interface SavingsTemplateRow {
  nrp: string;
  nama: string;
  nomor_rekening: string;
  bank_account_number?: string;
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
  jumlah_simpanan_pokok?: number | null;
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
  const { getRateForPeriod } = buildSavingsRateResolver(rateTiers || [], depositTypes);

  const getDepositTypeInfo = (dep: MemberDepositItem): DepositTypeItem | undefined => {
    if (dep.deposit_types) {
      return Array.isArray(dep.deposit_types) ? dep.deposit_types[0] : dep.deposit_types;
    }
    if (dep.deposit_type_id && depositTypes.length > 0) {
      return depositTypes.find(dt => dt.id === dep.deposit_type_id);
    }
    return undefined;
  };

  let effectivePokokTarget = Number(pokokTargetAmount) > 0 ? Number(pokokTargetAmount) : 0;
  if (effectivePokokTarget <= 0) {
    const rateFromTier = getRateForPeriod('POKOK', year, month);
    if (rateFromTier > 0) {
      effectivePokokTarget = rateFromTier;
    } else {
      const dtPokok = depositTypes.find(dt => isPokokDepositType(dt));
      if (dtPokok?.default_amount && Number(dtPokok.default_amount) > 0) {
        effectivePokokTarget = Number(dtPokok.default_amount);
      } else {
        effectivePokokTarget = 10000;
      }
    }
  }

  for (const m of members) {
    const memberDeps = deposits.filter(d => d.member_id === m.id);

    // 1. Akumulasi pembayaran Simpanan Pokok historis & profil
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
      if (!tx.transaction_type || tx.transaction_type === 'deposit') {
        return sum + amt;
      }
      return sum;
    }, 0);

    const profilePokok = Number(m.jumlah_simpanan_pokok) || 0;
    const totalPokokPaid = Math.max(0, Math.max(paidPokok, profilePokok));
    const isPokokLunas = totalPokokPaid >= effectivePokokTarget;

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
        const resolvedRate = getRateForPeriod(typeCode || dt?.name || '', year, month);
        const expected = resolvedRate > 0 ? resolvedRate : (dt?.default_amount || 0);

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
          bank_account_number: m.bank_account_number || '-',
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
        const resolvedRate = getRateForPeriod(code, year, month);
        const expected = resolvedRate > 0 ? resolvedRate : (matchedDt?.default_amount || 0);

        rows.push({
          nrp: m.nrp,
          nama: m.nama,
          nomor_rekening: m.bank_account_number || '-',
          bank_account_number: m.bank_account_number || '-',
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
      const sisaPokok = Math.max(0, effectivePokokTarget - totalPokokPaid);
      rows.push({
        nrp: m.nrp,
        nama: m.nama,
        nomor_rekening: m.bank_account_number || '-',
        bank_account_number: m.bank_account_number || '-',
        bulan: month,
        tahun: year,
        kode_simpanan: 'POKOK',
        telah_dibayar: totalPokokPaid,
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

  let members: MemberBatchItem[] = [];
  const { data: membersData, error: mErr } = await supabase
    .from('anggota')
    .select('id, nrp, nama, bank_account_number, jumlah_simpanan_pokok')
    .eq('status', 'aktif');

  if (mErr) {
    const { data: fallbackMembers, error: fbErr } = await supabase
      .from('anggota')
      .select('id, nrp, nama, bank_account_number')
      .eq('status', 'aktif');
    if (fbErr) {
      console.error("Error fetching anggota:", fbErr);
    }
    members = (fallbackMembers || []) as MemberBatchItem[];
  } else {
    members = (membersData || []) as MemberBatchItem[];
  }

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

  if (dErr || tErr || dtErr) {
    console.error("Error fetching savings batch template data:", { dErr, tErr, dtErr });
  }

  const rateTiers = await getRateTiers(undefined, false).catch(() => []);

  const { getRateForPeriod } = buildSavingsRateResolver(rateTiers, depositTypes || []);

  // Ambil nominal tarif Simpanan Pokok aktif
  let pokokTargetAmount = await getActivePokokTariff().catch(() => 0);
  if (!pokokTargetAmount || pokokTargetAmount <= 0) {
    pokokTargetAmount = getRateForPeriod('POKOK', year, month);
  }
  if (!pokokTargetAmount || pokokTargetAmount <= 0) {
    const matchedDt = (depositTypes || []).find(t => isPokokDepositType(t));
    pokokTargetAmount = matchedDt?.default_amount && Number(matchedDt.default_amount) > 0
      ? Number(matchedDt.default_amount)
      : 10000;
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
    const arrayBuffer = typeof (file as any).arrayBuffer === 'function'
      ? await (file as any).arrayBuffer()
      : file;
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
        const { data: members } = await supabase
            .from('anggota')
            .select('id, nrp, nama, member_deposits(id, deposit_type_id, deposit_types(id, code, name))')
            .in('nrp', nrpList);
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
            const kode_simpanan = getVal(row, 6).trim().toUpperCase();

            const m = memberMap.get(nrp);
            let status: 'READY' | 'MISMATCH' | 'ERROR' = 'READY';
            let ref_id = undefined;

            if (!m) {
                status = 'ERROR'; // NRP not found
            } else {
                const isPokok = kode_simpanan === 'POKOK' || kode_simpanan === 'SP';
                const depList = Array.isArray(m.member_deposits) ? m.member_deposits : [];
                const dep = depList.find((d: any) => {
                    const dt = Array.isArray(d.deposit_types) ? d.deposit_types[0] : d.deposit_types;
                    if (isPokok) {
                        return isPokokDepositType(dt);
                    }
                    return (dt?.code || '').toUpperCase() === kode_simpanan;
                });

                if (dep) {
                    ref_id = dep.id;
                    status = 'READY';
                } else if (isPokok) {
                    // Jika anggota belum memiliki entri member_deposits bertipe POKOK,
                    // tandai status tetap READY (akan dibuat otomatis saat eksekusi)
                    status = 'READY';
                    ref_id = undefined;
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
                ref_id,
                member_id: m?.id
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

export const executeBatchUpdate = async (
    payload: BatchPreviewRow[],
    type: 'savings' | 'loans',
    month: number,
    year: number
): Promise<BatchExecutionSummary> => {
    const isPokokTag = (tag: string) => {
        const t = (tag || '').trim().toUpperCase();
        return t === 'POKOK' || t === 'SP';
    };

    // Valid rows: status READY and nominal_baru > 0
    const validRows = payload.filter(r => {
        if (r.status !== 'READY' || r.nominal_baru <= 0) return false;
        if (type === 'loans') {
            return r.nominal_baru !== r.nominal_lama;
        }
        return true;
    });

    if (validRows.length === 0) {
        throw new Error("Tidak ada data dengan nominal pembayaran > 0 yang valid untuk diproses.");
    }

    // Fast client-side bulk operations
    if (type === 'savings') {
        const pokokRows = validRows.filter(r => isPokokTag(r.jenis_tagihan));
        const recurringRows = validRows.filter(r => !isPokokTag(r.jenis_tagihan));

        // 1. Tangani Simpanan Rutin Bulanan (WAJIB, LEBARAN, BELANJA, dll)
        const recurringRefIds = recurringRows.map(r => r.ref_id).filter(Boolean);
        if (recurringRefIds.length > 0) {
            // Hapus mutasi lama pada bulan/tahun tersebut (idempotensi bulanan)
            const { error: delError } = await supabase
                .from('deposit_transactions')
                .delete()
                .in('member_deposit_id', recurringRefIds)
                .eq('for_month', month)
                .eq('for_year', year);

            if (delError) throw delError;

            // Masukkan transaksi baru
            const recurringTxs = recurringRows
                .filter(r => r.ref_id)
                .map(r => ({
                    member_deposit_id: r.ref_id,
                    amount: r.nominal_baru,
                    for_month: month,
                    for_year: year,
                    transaction_type: 'deposit',
                    description: `Batch Update ${month}/${year}`
                }));

            if (recurringTxs.length > 0) {
                const { error: insError } = await supabase.from('deposit_transactions').insert(recurringTxs);
                if (insError) throw insError;
            }
        }

        // 2. Tangani Simpanan Pokok (POKOK)
        if (pokokRows.length > 0) {
            // Ambil master deposit_types untuk mencari ID tipe simpanan POKOK
            const { data: depTypes } = await supabase
                .from('deposit_types')
                .select('id, code, name, default_amount, frequency_type');

            const pokokType = (depTypes || []).find(dt => isPokokDepositType(dt));
            const pokokTypeId = pokokType?.id;

            // Cari member_id jika ada baris pokok yang belum memilikinya
            const missingMemberNrps = pokokRows.filter(r => !r.member_id && !r.ref_id).map(r => r.nrp);
            const memberLookup = new Map<string, string>();
            if (missingMemberNrps.length > 0) {
                const { data: memberData } = await supabase
                    .from('anggota')
                    .select('id, nrp')
                    .in('nrp', missingMemberNrps);
                (memberData || []).forEach(m => memberLookup.set(m.nrp, m.id));
            }

            const pokokTxs: any[] = [];

            for (const r of pokokRows) {
                let targetDepositId = r.ref_id;
                const memberId = r.member_id || memberLookup.get(r.nrp);

                // Jika belum memiliki member_deposit_id, pastikan akun member_deposits tersedia
                if (!targetDepositId && memberId && pokokTypeId) {
                    const { data: existingDep } = await supabase
                        .from('member_deposits')
                        .select('id')
                        .eq('member_id', memberId)
                        .eq('deposit_type_id', pokokTypeId)
                        .maybeSingle();

                    if (existingDep?.id) {
                        targetDepositId = existingDep.id;
                    } else {
                        const tableDeposits: any = supabase.from('member_deposits');
                        const insQuery = tableDeposits.insert({
                            member_id: memberId,
                            deposit_type_id: pokokTypeId,
                            is_terminated: false
                        });

                        let insRes: any = null;
                        if (typeof insQuery?.select === 'function') {
                            const selQuery = insQuery.select('id');
                            insRes = typeof selQuery.maybeSingle === 'function'
                                ? await selQuery.maybeSingle()
                                : (typeof selQuery.single === 'function' ? await selQuery.single() : await selQuery);
                        } else if (typeof insQuery?.then === 'function') {
                            insRes = await insQuery;
                        }

                        targetDepositId = insRes?.data?.id || (Array.isArray(insRes?.data) ? insRes?.data[0]?.id : null);

                        if (!targetDepositId) {
                            const { data: fallbackDep } = await supabase
                                .from('member_deposits')
                                .select('id')
                                .eq('member_id', memberId)
                                .eq('deposit_type_id', pokokTypeId)
                                .maybeSingle();
                            targetDepositId = fallbackDep?.id;
                        }
                    }
                }

                if (targetDepositId) {
                    pokokTxs.push({
                        member_deposit_id: targetDepositId,
                        transaction_type: 'deposit',
                        amount: r.nominal_baru,
                        for_month: month,
                        for_year: year,
                        description: 'Setoran Simpanan Pokok via Update Massal Bulanan'
                    });
                }
            }

            if (pokokTxs.length > 0) {
                const { error: pInsError } = await supabase.from('deposit_transactions').insert(pokokTxs);
                if (pInsError) throw pInsError;
            }
        }

        return {
            success: true,
            totalProcessed: validRows.length,
            recurringCount: recurringRows.length,
            pokokCount: pokokRows.length,
            message: `Update massal simpanan berhasil diproses (${recurringRows.length} simpanan rutin, ${pokokRows.length} simpanan pokok).`
        };
    } else {
        // Loans
        const loanIds = validRows.map(r => r.ref_id).filter(Boolean);
        const { data: schedules } = await supabase.from('loan_schedules').select('*').in('loan_id', loanIds);
        
        let processedLoans = 0;
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
                    processedLoans++;
                }
            }
        }
        return {
            success: true,
            totalProcessed: processedLoans,
            loansCount: processedLoans,
            message: `Update massal pinjaman berhasil diproses (${processedLoans} pinjaman).`
        };
    }
};
