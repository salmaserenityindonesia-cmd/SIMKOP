import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export interface WithdrawalLedgerItem {
  id: string;
  member_id: string;
  member_name: string;
  member_nrp: string;
  member_rank: string;
  bank_name: string;
  bank_account_number: string;
  deposit_type_id: string;
  deposit_type_code: string;
  deposit_type_name: string;
  amount: number;
  transaction_date: string;
  reference_no: string;
  payment_method: string;
  notes: string;
  created_by: string | null;
  has_active_loan: boolean;
  active_loan_balance: number;
  active_loan_count: number;
}

export interface PaymentMethodBreakdown {
  amount: number;
  percentage: number;
  count: number;
}

export interface WithdrawalSummary {
  totalWithdrawalAmount: number;
  totalTransactions: number;
  uniqueMembers: number;
  breakdownByType: {
    lebaran: number;
    belanja: number;
    pokok_wajib: number;
    sukarela_lainnya: number;
    [key: string]: number;
  };
  breakdownByMethod: {
    tunai: PaymentMethodBreakdown;
    transfer: PaymentMethodBreakdown;
    [key: string]: PaymentMethodBreakdown;
  };
  membersWithActiveLoansCount: number;
  totalActiveLoansObligation: number;
}

export interface WithdrawalReportFilters {
  startDate?: string;
  endDate?: string;
  depositTypeCode?: string; // 'all' | 'lebaran' | 'belanja' | 'pokok_wajib' | 'sukarela_lainnya' or custom code
  paymentMethod?: string;   // 'all' | 'tunai' | 'transfer'
  searchQuery?: string;
  hasActiveLoanOnly?: boolean;
}

export const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(val || 0);
};

export const sanitizeNumber = (val: any, fallback = 0): number => {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
};

/**
 * Mengkategorikan kode / nama jenis simpanan ke dalam bucket utama
 */
export function categorizeDepositType(code?: string, name?: string): 'lebaran' | 'belanja' | 'pokok_wajib' | 'sukarela_lainnya' {
  const c = (code || '').toUpperCase().trim();
  const n = (name || '').toLowerCase().trim();

  if (c.includes('LEBARAN') || c.includes('THR') || n.includes('lebaran') || n.includes('thr') || c === 'SL') {
    return 'lebaran';
  }
  if (c.includes('BELANJA') || c === 'SB' || n.includes('belanja')) {
    return 'belanja';
  }
  if (c.includes('POKOK') || c.includes('WAJIB') || c === 'SP' || c === 'SW' || n.includes('pokok') || n.includes('wajib')) {
    return 'pokok_wajib';
  }
  return 'sukarela_lainnya';
}

/**
 * Mengambil buku besar detail pencairan simpanan lengkap dengan deteksi pinjaman aktif (Cross-Obligation Risk Indicator).
 */
export async function getWithdrawalDetailedLedger(filters?: WithdrawalReportFilters): Promise<WithdrawalLedgerItem[]> {
  try {
    let query: any = supabase
      .from('deposit_transactions')
      .select(`
        id,
        amount,
        created_at,
        reference_no,
        payment_method,
        notes,
        description,
        created_by,
        transaction_type,
        member_deposit_id,
        member_deposits (
          id,
          member_id,
          deposit_type_id,
          deposit_types (
            id,
            name,
            code
          ),
          anggota (
            id,
            nama,
            nrp,
            pangkat,
            bank_name,
            bank_account_number,
            status
          )
        )
      `)
      .eq('transaction_type', 'withdrawal');

    if (filters?.startDate) {
      const startIso = filters.startDate.includes('T') ? filters.startDate : `${filters.startDate}T00:00:00.000Z`;
      query = query.gte('created_at', startIso);
    }
    if (filters?.endDate) {
      const endIso = filters.endDate.includes('T') ? filters.endDate : `${filters.endDate}T23:59:59.999Z`;
      query = query.lte('created_at', endIso);
    }

    if (query.order) {
      query = query.order('created_at', { ascending: false });
    }

    const { data: rawTxList, error: txError } = await query;

    if (txError) {
      console.warn('Gagal memuat deposit_transactions withdrawal:', txError.message);
      return [];
    }

    if (!rawTxList || rawTxList.length === 0) {
      return [];
    }

    // 1. Ekstrak data mentah transaksi dan kumpulkan member_id untuk cross-check pinjaman
    const memberIds = new Set<string>();
    const preliminaryItems: Array<Omit<WithdrawalLedgerItem, 'has_active_loan' | 'active_loan_balance' | 'active_loan_count'>> = [];

    for (const tx of rawTxList) {
      const md = Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits;
      const dt = Array.isArray(md?.deposit_types) ? md.deposit_types[0] : md?.deposit_types;
      const member = Array.isArray(md?.anggota) ? md.anggota[0] : md?.anggota;

      const memberId = member?.id || md?.member_id || '';
      if (memberId) {
        memberIds.add(memberId);
      }

      preliminaryItems.push({
        id: tx.id,
        member_id: memberId,
        member_name: member?.nama || 'Anggota Tidak Dikenal',
        member_nrp: member?.nrp || '-',
        member_rank: member?.pangkat || '-',
        bank_name: member?.bank_name || '-',
        bank_account_number: member?.bank_account_number || '-',
        deposit_type_id: dt?.id || md?.deposit_type_id || '',
        deposit_type_code: dt?.code || 'SUKARELA',
        deposit_type_name: dt?.name || 'Simpanan Sukarela',
        amount: sanitizeNumber(tx.amount, 0),
        transaction_date: tx.created_at || new Date().toISOString(),
        reference_no: tx.reference_no || '-',
        payment_method: tx.payment_method || 'tunai',
        notes: tx.notes || tx.description || '-',
        created_by: tx.created_by || null
      });
    }

    // 2. Cross-referencing pinjaman aktif dari tabel loans
    interface MemberLoanObligation {
      count: number;
      totalBalance: number;
    }
    const memberLoanMap = new Map<string, MemberLoanObligation>();

    if (memberIds.size > 0) {
      try {
        const { data: loansData, error: loansError } = await supabase
          .from('loans')
          .select(`
            id,
            member_id,
            amount,
            status,
            loan_repayments (
              amount_paid
            )
          `)
          .in('member_id', Array.from(memberIds))
          .in('status', ['approved', 'active']);

        if (!loansError && loansData) {
          for (const loan of loansData) {
            const repayments = Array.isArray(loan.loan_repayments) ? loan.loan_repayments : [];
            const totalPaid = repayments.reduce((sum: number, r: any) => sum + sanitizeNumber(r?.amount_paid, 0), 0);
            const remaining = Math.max(0, sanitizeNumber(loan.amount, 0) - totalPaid);

            if (remaining > 0) {
              const current = memberLoanMap.get(loan.member_id) || { count: 0, totalBalance: 0 };
              memberLoanMap.set(loan.member_id, {
                count: current.count + 1,
                totalBalance: current.totalBalance + remaining
              });
            }
          }
        } else if (loansError) {
          console.warn('Gagal memuat pinjaman aktif untuk verifikasi kewajiban:', loansError.message);
        }
      } catch (err: any) {
        console.warn('Exception saat kueri loans:', err?.message || err);
      }
    }

    // 3. Gabungkan data pencairan dengan status pinjaman aktif
    let items: WithdrawalLedgerItem[] = preliminaryItems.map(item => {
      const loanInfo = memberLoanMap.get(item.member_id);
      const hasActiveLoan = !!loanInfo && loanInfo.count > 0 && loanInfo.totalBalance > 0;
      return {
        ...item,
        has_active_loan: hasActiveLoan,
        active_loan_balance: loanInfo?.totalBalance || 0,
        active_loan_count: loanInfo?.count || 0
      };
    });

    // 4. Terapkan filter lanjutan di memori (depositTypeCode, paymentMethod, hasActiveLoanOnly, searchQuery)
    if (filters?.depositTypeCode && filters.depositTypeCode !== 'all') {
      const target = filters.depositTypeCode.toLowerCase();
      items = items.filter(i => {
        const cat = categorizeDepositType(i.deposit_type_code, i.deposit_type_name);
        return cat === target || i.deposit_type_code.toLowerCase() === target;
      });
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
      const targetMethod = filters.paymentMethod.toLowerCase();
      items = items.filter(i => (i.payment_method || '').toLowerCase() === targetMethod);
    }

    if (filters?.hasActiveLoanOnly === true) {
      items = items.filter(i => i.has_active_loan);
    }

    if (filters?.searchQuery && filters.searchQuery.trim().length > 0) {
      const q = filters.searchQuery.toLowerCase().trim();
      items = items.filter(i =>
        i.member_name.toLowerCase().includes(q) ||
        i.member_nrp.toLowerCase().includes(q) ||
        i.member_rank.toLowerCase().includes(q) ||
        i.reference_no.toLowerCase().includes(q) ||
        i.deposit_type_name.toLowerCase().includes(q) ||
        i.notes.toLowerCase().includes(q)
      );
    }

    // Pastikan terurut tanggal terbaru
    items.sort((a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());

    return items;
  } catch (err: any) {
    console.error('Exception getWithdrawalDetailedLedger:', err?.message || err);
    return [];
  }
}

/**
 * Menghitung ringkasan agregasi metrik dari mutasi penarikan simpanan
 */
export function calculateWithdrawalSummary(items: WithdrawalLedgerItem[]): WithdrawalSummary {
  let totalWithdrawalAmount = 0;
  const uniqueMemberIds = new Set<string>();
  const membersWithLoans = new Set<string>();
  const memberLoanBalances = new Map<string, number>();

  const breakdownByType = {
    lebaran: 0,
    belanja: 0,
    pokok_wajib: 0,
    sukarela_lainnya: 0
  };

  let tunaiAmount = 0;
  let tunaiCount = 0;
  let transferAmount = 0;
  let transferCount = 0;

  for (const item of items) {
    const amt = sanitizeNumber(item.amount, 0);
    totalWithdrawalAmount += amt;

    if (item.member_id) {
      uniqueMemberIds.add(item.member_id);
      if (item.has_active_loan) {
        membersWithLoans.add(item.member_id);
        if (!memberLoanBalances.has(item.member_id)) {
          memberLoanBalances.set(item.member_id, item.active_loan_balance);
        }
      }
    }

    const category = categorizeDepositType(item.deposit_type_code, item.deposit_type_name);
    breakdownByType[category] = (breakdownByType[category] || 0) + amt;

    const method = (item.payment_method || '').toLowerCase();
    if (method === 'transfer' || method === 'bank_transfer') {
      transferAmount += amt;
      transferCount += 1;
    } else {
      tunaiAmount += amt;
      tunaiCount += 1;
    }
  }

  const tunaiPercentage = totalWithdrawalAmount > 0 ? (tunaiAmount / totalWithdrawalAmount) * 100 : 0;
  const transferPercentage = totalWithdrawalAmount > 0 ? (transferAmount / totalWithdrawalAmount) * 100 : 0;

  let totalActiveLoansObligation = 0;
  for (const bal of memberLoanBalances.values()) {
    totalActiveLoansObligation += bal;
  }

  return {
    totalWithdrawalAmount,
    totalTransactions: items.length,
    uniqueMembers: uniqueMemberIds.size,
    breakdownByType,
    breakdownByMethod: {
      tunai: {
        amount: tunaiAmount,
        percentage: Number(tunaiPercentage.toFixed(1)),
        count: tunaiCount
      },
      transfer: {
        amount: transferAmount,
        percentage: Number(transferPercentage.toFixed(1)),
        count: transferCount
      }
    },
    membersWithActiveLoansCount: membersWithLoans.size,
    totalActiveLoansObligation
  };
}

/**
 * Mengambil ringkasan metrik pencairan (mendukung pemuatan otomatis atau reuse data).
 */
export async function getWithdrawalSummary(
  filters?: WithdrawalReportFilters,
  preloadedItems?: WithdrawalLedgerItem[]
): Promise<WithdrawalSummary> {
  const items = preloadedItems || (await getWithdrawalDetailedLedger(filters));
  return calculateWithdrawalSummary(items);
}

/**
 * Ekspor Laporan Audit Pengawasan & Pencairan Simpanan ke file Excel (.xlsx) dengan ExcelJS
 */
export async function exportWithdrawalReportExcel(
  data: WithdrawalLedgerItem[],
  summary: WithdrawalSummary,
  filterInfo?: {
    startDate?: string;
    endDate?: string;
    filterLabel?: string;
  }
): Promise<any> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP - Sistem Informasi Manajemen Koperasi';
  workbook.lastModifiedBy = 'Pengawas & Admin Simpanan';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Laporan Pengawasan Pencairan', {
    views: [{ showGridLines: true }]
  });

  // 1. Header Judul Laporan
  worksheet.mergeCells('A1:L1');
  const titleRow = worksheet.getCell('A1');
  titleRow.value = 'LAPORAN AUDIT PENGAWASAN & PENCAIRAN SIMPANAN';
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('A2:L2');
  const subtitleRow = worksheet.getCell('A2');
  subtitleRow.value = 'Koperasi Pegawai Republik Indonesia (KPRI) - Sistem Informasi Manajemen Terpadu';
  subtitleRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  subtitleRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // 2. Metadata Periode & Filter
  worksheet.getCell('A4').value = 'Periode Pencairan:';
  worksheet.getCell('A4').font = { bold: true };
  const periodeText = (filterInfo?.startDate || filterInfo?.endDate)
    ? `${filterInfo?.startDate || 'Awal'} s/d ${filterInfo?.endDate || 'Sekarang'}`
    : 'Semua Periode (Keseluruhan)';
  worksheet.getCell('B4').value = periodeText;

  worksheet.getCell('A5').value = 'Kriteria Filter:';
  worksheet.getCell('A5').font = { bold: true };
  worksheet.getCell('B5').value = filterInfo?.filterLabel || 'Semua Jenis Simpanan & Metode Pembayaran';

  worksheet.getCell('A6').value = 'Tanggal Unduh Dokumen:';
  worksheet.getCell('A6').font = { bold: true };
  worksheet.getCell('B6').value = new Date().toLocaleString('id-ID');

  // 3. Ringkasan KPI Audit (Box Summary)
  worksheet.mergeCells('A8:B8');
  worksheet.getCell('A8').value = 'RINGKASAN PENGAWASAN KAS';
  worksheet.getCell('A8').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getCell('A8').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate 800
  };

  worksheet.getRow(9).values = ['Total Nominal Pencairan:', summary.totalWithdrawalAmount];
  worksheet.getRow(10).values = ['Total Frekuensi Transaksi:', `${summary.totalTransactions} Transaksi`];
  worksheet.getRow(11).values = ['Jumlah Anggota Mencairkan:', `${summary.uniqueMembers} Orang`];
  worksheet.getRow(12).values = ['Metode Kas Tunai:', `${formatRupiah(summary.breakdownByMethod.tunai.amount)} (${summary.breakdownByMethod.tunai.percentage}% - ${summary.breakdownByMethod.tunai.count} Trx)`];
  worksheet.getRow(13).values = ['Metode Transfer Bank:', `${formatRupiah(summary.breakdownByMethod.transfer.amount)} (${summary.breakdownByMethod.transfer.percentage}% - ${summary.breakdownByMethod.transfer.count} Trx)`];
  worksheet.getRow(14).values = ['Anggota dg Pinjaman Aktif:', `${summary.membersWithActiveLoansCount} Orang`];
  worksheet.getRow(15).values = ['Total Kewajiban Pinjaman Aktif:', summary.totalActiveLoansObligation];

  // Number formatting untuk box KPI
  worksheet.getCell('B9').numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';
  worksheet.getCell('B9').font = { bold: true, color: { argb: 'FFB91C1C' } };
  worksheet.getCell('B15').numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';
  worksheet.getCell('B15').font = { bold: true, color: { argb: 'FFC2410C' } };

  for (let r = 9; r <= 15; r++) {
    worksheet.getCell(`A${r}`).font = { bold: true };
    worksheet.getCell(`A${r}`).border = {
      left: { style: 'thin' },
      right: { style: 'thin' },
      top: { style: 'thin' },
      bottom: { style: 'thin' }
    };
    worksheet.getCell(`B${r}`).border = {
      left: { style: 'thin' },
      right: { style: 'thin' },
      top: { style: 'thin' },
      bottom: { style: 'thin' }
    };
  }

  // 4. Header Tabel Data Pencairan
  const startTableRow = 17;
  const headerRow = worksheet.getRow(startTableRow);
  headerRow.values = [
    'No',
    'Tanggal Transaksi',
    'No. Referensi',
    'NRP',
    'Nama Anggota',
    'Pangkat / Korps',
    'Jenis Simpanan',
    'Nominal Pencairan',
    'Metode Bayar',
    'Rekening Bank Tujuan',
    'Pengawasan Pinjaman Aktif',
    'Keterangan'
  ];
  headerRow.height = 28;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' } // Dark Navy / Slate 900
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'medium' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' }
    };
  });

  // Lebar Kolom
  worksheet.columns = [
    { key: 'no', width: 6 },
    { key: 'date', width: 18 },
    { key: 'ref', width: 22 },
    { key: 'nrp', width: 14 },
    { key: 'name', width: 26 },
    { key: 'rank', width: 18 },
    { key: 'deposit_type', width: 22 },
    { key: 'amount', width: 20 },
    { key: 'method', width: 15 },
    { key: 'bank_account', width: 24 },
    { key: 'active_loan_status', width: 30 },
    { key: 'notes', width: 32 }
  ];

  // 5. Isi Data Baris Tabel
  let currentRowIdx = startTableRow + 1;
  let totalNominal = 0;

  data.forEach((item, index) => {
    totalNominal += item.amount;
    const row = worksheet.getRow(currentRowIdx);

    const loanAlert = item.has_active_loan
      ? `PERINGATAN: Ada Pinjaman (${formatRupiah(item.active_loan_balance)})`
      : 'Bebas Pinjaman';

    const bankInfo = item.payment_method.toLowerCase() === 'transfer'
      ? `${item.bank_name || '-'} (${item.bank_account_number || '-'})`
      : 'Kasir Tunai Koperasi';

    row.values = [
      index + 1,
      new Date(item.transaction_date).toLocaleString('id-ID'),
      item.reference_no,
      item.member_nrp,
      item.member_name,
      item.member_rank,
      item.deposit_type_name,
      item.amount,
      item.payment_method.toUpperCase(),
      bankInfo,
      loanAlert,
      item.notes
    ];

    // Alignments
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'left' };
    row.getCell(6).alignment = { horizontal: 'left' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(9).alignment = { horizontal: 'center' };
    row.getCell(10).alignment = { horizontal: 'left' };
    row.getCell(11).alignment = { horizontal: 'center' };
    row.getCell(12).alignment = { horizontal: 'left' };

    // Currency Formatting
    const numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';
    row.getCell(8).numFmt = numFmt;

    // Styling alert pinjaman aktif
    if (item.has_active_loan) {
      row.getCell(11).font = { bold: true, color: { argb: 'FFDC2626' } }; // Red
      row.getCell(11).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' } // Light red fill
      };
    } else {
      row.getCell(11).font = { color: { argb: 'FF16A34A' } }; // Green
    }

    // Cell Borders
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });

    currentRowIdx++;
  });

  // 6. Baris Total Akuntansi
  const summaryRow = worksheet.getRow(currentRowIdx);
  summaryRow.height = 26;
  summaryRow.getCell(7).value = 'TOTAL PENCAIRAN:';
  summaryRow.getCell(7).font = { bold: true };
  summaryRow.getCell(7).alignment = { horizontal: 'right' };

  summaryRow.getCell(8).value = totalNominal;
  summaryRow.getCell(8).font = { bold: true, color: { argb: 'FFB91C1C' } };
  summaryRow.getCell(8).numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

  summaryRow.eachCell(cell => {
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'double' }
    };
  });

  // 7. Unduh File di Browser
  const buffer = await workbook.xlsx.writeBuffer();
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `Laporan_Pengawasan_Pencairan_Simpanan_${dateStr}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return buffer;
}
