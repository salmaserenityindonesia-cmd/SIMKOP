import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '../lib/supabaseClient';
import { calculateRepaymentPortions } from './loanService';
import type { KoperasiProfile } from './settingsService';
import { formatTanggalLahirWithAge } from '../utils/dateUtils';

export interface LoanTypeOption {
  id: string;
  code: string;
  name: string;
}

export interface PaidOffLoanScheduleItem {
  id: string;
  periodNumber: number;
  dueDate: string;
  targetAmount: number;
  paidAmount: number;
  principalPortion?: number;
  marginPortion?: number;
  status: string;
  paymentDate?: string | null;
  paymentMethod?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
}

export interface PaidOffLoanRepaymentItem {
  id: string;
  scheduleId: string | null;
  periodNumber?: number | null;
  amountPaid: number;
  principalPortion?: number;
  marginPortion?: number;
  paymentDate: string | null;
  paymentMethod?: string | null;
  receiptNumber?: string | null;
  notes?: string | null;
}

export interface PaidOffLoanReportRow {
  id: string;
  loanId: string;
  loanNumber: string;
  memberId: string;
  memberName: string;
  nrp: string;
  tanggal_lahir: string | null;
  loanTypeId: string;
  loanTypeCode: string;
  loanTypeName: string;
  financingScheme?: 'CASH_ZERO_INTEREST' | 'GOODS_MARKUP' | string | null;
  itemDescription?: string | null;
  costPrice?: number;
  markupAmount?: number;
  notes?: string | null;
  principalAmount: number;
  tenor: number;
  monthlyInstallment: number;
  totalPaid: number;
  disbursedAt: string | null;
  paidOffDate: string | null;
  paidOffYear: number | null;
  status: 'completed' | 'paid_off';
  paidPeriodsCount: number;
  schedules: PaidOffLoanScheduleItem[];
  repayments?: PaidOffLoanRepaymentItem[];
}

export interface PaidOffLoansSummary {
  totalPaidOffLoans: number;
  uniqueMembersCount: number;
  totalPrincipalAmount: number;
  totalPaidAmount: number;
  rows: PaidOffLoanReportRow[];
}

const INDO_MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des',
];

const INDO_MONTHS_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatRp(amount: number = 0): string {
  return 'Rp ' + Math.round(Number(amount) || 0).toLocaleString('id-ID');
}

export function formatReportDate(dateStr?: string | null, fullMonth = false): string {
  if (!dateStr) return '-';
  const trimmed = String(dateStr).trim();
  if (!trimmed) return '-';

  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const monthArr = fullMonth ? INDO_MONTHS_FULL : INDO_MONTHS_SHORT;
    const monthLabel = monthArr[month - 1] || String(month);
    return `${day} ${monthLabel} ${year}`;
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return trimmed;
  const monthArr = fullMonth ? INDO_MONTHS_FULL : INDO_MONTHS_SHORT;
  return `${parsed.getDate()} ${monthArr[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

function extractYearFromDate(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const trimmed = String(dateStr).trim();
  const match = trimmed.match(/^(\d{4})/);
  if (match) {
    const y = parseInt(match[1], 10);
    if (!isNaN(y) && y > 1900) return y;
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.getFullYear();
  }
  return null;
}

function toTimestamp(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  const t = d.getTime();
  return isNaN(t) ? 0 : t;
}

function isScheduleSettled(sched: any): boolean {
  if (!sched) return false;
  if (String(sched.status || '').toLowerCase() === 'paid') return true;
  const target = Math.round(Number(sched.target_amount || 0));
  const paid = Math.round(Number(sched.paid_amount || 0));
  if (target <= 0) return false;
  return paid >= target || Math.abs(target - paid) <= 5;
}

function unwrapRelation<T = any>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function getLoanTypesForFilter(): Promise<LoanTypeOption[]> {
  try {
    let query: any = supabase
      .from('loan_types')
      .select('id, code, name');

    if (query && typeof query.order === 'function') {
      query = query.order('name', { ascending: true });
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Gagal memuat daftar loan_types:', error.message);
      return [];
    }
    return (data || []) as LoanTypeOption[];
  } catch (err) {
    console.warn('Exception saat memuat loan_types:', err);
    return [];
  }
}

export async function getPaidOffLoansReport(): Promise<PaidOffLoansSummary> {
  let rawLoans: any[] = [];

  try {
    const { data: joinedLoans, error: joinErr } = await supabase
      .from('loans')
      .select(`
        *,
        loan_types ( id, code, name, financing_scheme ),
        member:anggota ( id, nrp, nama, tanggal_lahir )
      `);

    if (!joinErr && Array.isArray(joinedLoans)) {
      rawLoans = joinedLoans;
    } else {
      console.warn('Fallback query loans tanpa kolom financing_scheme:', joinErr?.message);
      const { data: fallbackJoinedLoans, error: fallbackJoinErr } = await supabase
        .from('loans')
        .select(`
          *,
          loan_types ( id, code, name ),
          member:anggota ( id, nrp, nama, tanggal_lahir )
        `);

      if (!fallbackJoinErr && Array.isArray(fallbackJoinedLoans)) {
        rawLoans = fallbackJoinedLoans;
      } else {
        console.warn('Fallback query loans tanpa relasi bersarang:', fallbackJoinErr?.message);
        const { data: plainLoans, error: plainErr } = await supabase
          .from('loans')
          .select('*');
        if (plainErr) {
          console.error('Gagal mengambil data loans:', plainErr.message);
          throw plainErr;
        }
        rawLoans = plainLoans || [];
      }
    }
  } catch (err) {
    console.error('Error fetching loans for paid-off report:', err);
    throw err;
  }

  if (rawLoans.length === 0) {
    return {
      totalPaidOffLoans: 0,
      uniqueMembersCount: 0,
      totalPrincipalAmount: 0,
      totalPaidAmount: 0,
      rows: [],
    };
  }

  // Filter awal agar tidak memuat jadwal untuk pinjaman yang jelas ditolak / masih draft
  const candidateLoans = rawLoans.filter((loan) => {
    const st = String(loan?.status || '').toLowerCase();
    return st !== 'rejected' && st !== 'draft' && st !== 'cancelled';
  });

  if (candidateLoans.length === 0) {
    return {
      totalPaidOffLoans: 0,
      uniqueMembersCount: 0,
      totalPrincipalAmount: 0,
      totalPaidAmount: 0,
      rows: [],
    };
  }

  // Siapkan lookup anggota dan loan_types bila relasi pada baris tertentu tidak lengkap
  const needsMemberLookup = candidateLoans.some((l) => !unwrapRelation(l.member) && !unwrapRelation(l.anggota));
  const needsLoanTypeLookup = candidateLoans.some((l) => !unwrapRelation(l.loan_types) && !unwrapRelation(l.loanType));

  const memberMap = new Map<string, any>();
  if (needsMemberLookup) {
    try {
      const { data: membersData } = await supabase
        .from('anggota')
        .select('id, nrp, nama, tanggal_lahir');
      (membersData || []).forEach((m: any) => {
        if (m?.id) memberMap.set(m.id, m);
      });
    } catch {
      // Non-fatal fallback
    }
  }

  const loanTypeMap = new Map<string, LoanTypeOption>();
  if (needsLoanTypeLookup) {
    const types = await getLoanTypesForFilter();
    types.forEach((lt) => {
      if (lt?.id) loanTypeMap.set(lt.id, lt);
    });
  }

  const loanIds = Array.from(new Set(candidateLoans.map((l) => l.id).filter(Boolean)));
  const schedulesByLoan = new Map<string, any[]>();
  const repaymentsByLoan = new Map<string, any[]>();

  for (const idChunk of chunkArray(loanIds, 200)) {
    try {
      let schedQ: any = supabase
        .from('loan_schedules')
        .select('*')
        .in('loan_id', idChunk);
      if (schedQ && typeof schedQ.order === 'function') {
        schedQ = schedQ.order('period_number', { ascending: true });
      }
      const { data: schedData, error: schedErr } = await schedQ;
      if (!schedErr && Array.isArray(schedData)) {
        schedData.forEach((s: any) => {
          const list = schedulesByLoan.get(s.loan_id) || [];
          list.push(s);
          schedulesByLoan.set(s.loan_id, list);
        });
      }
    } catch (err) {
      console.warn('Gagal memuat loan_schedules untuk laporan lunas:', err);
    }

    try {
      let repayQ: any = supabase
        .from('loan_repayments')
        .select('*')
        .in('loan_id', idChunk);
      if (repayQ && typeof repayQ.order === 'function') {
        repayQ = repayQ.order('payment_date', { ascending: true });
      }
      const { data: repayData, error: repayErr } = await repayQ;
      if (!repayErr && Array.isArray(repayData)) {
        repayData.forEach((r: any) => {
          const list = repaymentsByLoan.get(r.loan_id) || [];
          list.push(r);
          repaymentsByLoan.set(r.loan_id, list);
        });
      }
    } catch (err) {
      console.warn('Gagal memuat loan_repayments untuk laporan lunas:', err);
    }
  }

  const rows: PaidOffLoanReportRow[] = [];

  for (const loan of candidateLoans) {
    const loanSchedules = (schedulesByLoan.get(loan.id) || []).slice().sort(
      (a, b) => Number(a.period_number || 0) - Number(b.period_number || 0)
    );
    const loanRepayments = (repaymentsByLoan.get(loan.id) || []).slice().sort(
      (a, b) => toTimestamp(a.payment_date) - toTimestamp(b.payment_date)
    );

    const statusLower = String(loan.status || '').toLowerCase();
    const principalAmount = Number(loan.principal_amount || loan.amount || 0);

    const totalPaidFromRepayments = loanRepayments.reduce(
      (sum, r) => sum + Number(r.amount_paid || 0),
      0
    );
    const totalPaidFromSchedules = loanSchedules.reduce(
      (sum, s) => sum + Number(s.paid_amount || 0),
      0
    );
    const totalPaidComputed = Math.max(totalPaidFromRepayments, totalPaidFromSchedules);

    const isExplicitCompleted = statusLower === 'completed' || statusLower === 'paid_off';
    const isZeroRemaining =
      loan.sisa_pinjaman !== undefined &&
      loan.sisa_pinjaman !== null &&
      Number(loan.sisa_pinjaman) <= 0 &&
      principalAmount > 0;
    const isAllSchedulesPaid =
      loanSchedules.length > 0 && loanSchedules.every((s) => isScheduleSettled(s));
    const isPrincipalFullyPaid =
      principalAmount > 0 &&
      loanSchedules.length > 0 &&
      totalPaidComputed >= principalAmount - 5;

    const isPaidOff =
      isExplicitCompleted ||
      isZeroRemaining ||
      isAllSchedulesPaid ||
      isPrincipalFullyPaid;

    if (!isPaidOff) continue;

    // Sinkronkan status pinjaman yang masih 'active'/'approved' namun sudah 100% lunas
    if (
      (statusLower === 'active' || statusLower === 'approved') &&
      (isAllSchedulesPaid || isPrincipalFullyPaid)
    ) {
      try {
        await supabase.from('loans').update({ status: 'completed' }).eq('id', loan.id);
      } catch {
        // Non-blocking synchronization
      }
    }

    const relMember =
      unwrapRelation(loan.member) ||
      unwrapRelation(loan.anggota) ||
      memberMap.get(loan.member_id) ||
      null;

    const relLoanType =
      unwrapRelation(loan.loan_types) ||
      unwrapRelation(loan.loanType) ||
      unwrapRelation(loan.loan_type) ||
      loanTypeMap.get(loan.loan_type_id) ||
      null;

    const costPrice = Math.max(0, Math.round(Number(loan.cost_price || 0)));
    const markupAmount = Math.max(0, Math.round(Number(loan.markup_amount || 0)));
    const itemDescription =
      typeof loan.item_description === 'string' && loan.item_description.trim()
        ? loan.item_description.trim()
        : null;
    const loanTypeCodeUpper = String(relLoanType?.code || '').trim().toUpperCase();
    const financingScheme =
      relLoanType?.financing_scheme ||
      (costPrice > 0 ||
      markupAmount > 0 ||
      Boolean(itemDescription) ||
      loanTypeCodeUpper === 'PEMBIAYAAN_BARANG' ||
      loanTypeCodeUpper === 'GOODS_MARKUP'
        ? 'GOODS_MARKUP'
        : 'CASH_ZERO_INTEREST');

    const scheduleById = new Map<string, any>();
    loanSchedules.forEach((s) => {
      if (s?.id) scheduleById.set(s.id, s);
    });

    const repaymentsBySchedule = new Map<string, any[]>();
    loanRepayments.forEach((r) => {
      if (!r?.schedule_id) return;
      const arr = repaymentsBySchedule.get(r.schedule_id) || [];
      arr.push(r);
      repaymentsBySchedule.set(r.schedule_id, arr);
    });

    const mappedSchedules: PaidOffLoanScheduleItem[] = loanSchedules.map((s) => {
      const schedRepays = repaymentsBySchedule.get(s.id) || [];
      const latestRepay = schedRepays.length > 0 ? schedRepays[schedRepays.length - 1] : null;
      const receiptNumbers = schedRepays
        .map((r) => r.receipt_number)
        .filter(Boolean)
        .join(', ');

      const schedPaid = Number(s.paid_amount || 0);
      const schedTarget = Number(s.target_amount || 0);
      const rawPrincipalPortion =
        s.principal_portion != null ? Math.round(Number(s.principal_portion || 0)) : null;
      const rawMarginPortion =
        s.margin_portion != null ? Math.round(Number(s.margin_portion || 0)) : null;
      const hasExplicitPortions =
        (rawPrincipalPortion !== null || rawMarginPortion !== null) &&
        ((rawPrincipalPortion || 0) + (rawMarginPortion || 0) > 0 || schedPaid <= 0);

      const computedSchedPortions = hasExplicitPortions
        ? {
            principalPortion: rawPrincipalPortion ?? 0,
            marginPortion: rawMarginPortion ?? 0,
          }
        : calculateRepaymentPortions({
            amountPaid: schedPaid > 0 ? schedPaid : schedTarget,
            targetAmount: schedTarget,
            loanCostPrice: costPrice,
            loanMarkupAmount: markupAmount,
            loanTotalAmount: principalAmount,
          });

      return {
        id: s.id,
        periodNumber: Number(s.period_number || 0),
        dueDate: s.due_date || '',
        targetAmount: schedTarget,
        paidAmount: schedPaid,
        principalPortion: computedSchedPortions.principalPortion,
        marginPortion: computedSchedPortions.marginPortion,
        status: isScheduleSettled(s) ? 'paid' : String(s.status || 'unpaid'),
        paymentDate: latestRepay?.payment_date || null,
        paymentMethod: latestRepay?.payment_method || null,
        receiptNumber: receiptNumbers || latestRepay?.receipt_number || null,
        notes: latestRepay?.notes || null,
      };
    });

    const mappedRepayments: PaidOffLoanRepaymentItem[] = loanRepayments.map((r) => {
      const linkedSched = r.schedule_id ? scheduleById.get(r.schedule_id) : undefined;
      const amountPaid = Number(r.amount_paid || 0);
      const rawRepayPrincipal =
        r.principal_portion != null ? Math.round(Number(r.principal_portion || 0)) : null;
      const rawRepayMargin =
        r.margin_portion != null ? Math.round(Number(r.margin_portion || 0)) : null;
      const hasExplicitRepayPortions =
        (rawRepayPrincipal !== null || rawRepayMargin !== null) &&
        (rawRepayPrincipal || 0) + (rawRepayMargin || 0) > 0;

      const computedRepayPortions = hasExplicitRepayPortions
        ? {
            principalPortion: rawRepayPrincipal ?? 0,
            marginPortion: rawRepayMargin ?? 0,
          }
        : calculateRepaymentPortions({
            amountPaid,
            targetAmount: Number(linkedSched?.target_amount || amountPaid),
            schedulePrincipalPortion: linkedSched?.principal_portion,
            scheduleMarginPortion: linkedSched?.margin_portion,
            loanCostPrice: costPrice,
            loanMarkupAmount: markupAmount,
            loanTotalAmount: principalAmount,
          });

      return {
        id: r.id,
        scheduleId: r.schedule_id || null,
        periodNumber: linkedSched ? Number(linkedSched.period_number || 0) : null,
        amountPaid,
        principalPortion: computedRepayPortions.principalPortion,
        marginPortion: computedRepayPortions.marginPortion,
        paymentDate: r.payment_date || null,
        paymentMethod: r.payment_method || null,
        receiptNumber: r.receipt_number || null,
        notes: r.notes || null,
      };
    });

    // Tentukan tanggal pelunasan terakhir
    let paidOffDate: string | null = null;
    if (loanRepayments.length > 0) {
      const sortedRepayDates = loanRepayments
        .map((r) => r.payment_date)
        .filter(Boolean)
        .sort((a, b) => toTimestamp(b) - toTimestamp(a));
      paidOffDate = sortedRepayDates[0] || null;
    }
    if (!paidOffDate && loanSchedules.length > 0) {
      const settledScheds = loanSchedules.filter((s) => isScheduleSettled(s));
      const targetList = settledScheds.length > 0 ? settledScheds : loanSchedules;
      const lastSched = targetList[targetList.length - 1];
      paidOffDate = lastSched?.due_date || null;
    }
    if (!paidOffDate) {
      paidOffDate = loan.updated_at || loan.disbursed_at || loan.created_at || null;
    }

    const tenor = Number(loan.agreed_tenor_months || loan.tenor || loanSchedules.length || 0);
    const monthlyInstallment = Number(
      loan.monthly_target ||
        loan.planned_installment_amount ||
        (tenor > 0 ? Math.round(principalAmount / tenor) : 0)
    );
    const totalPaid =
      totalPaidComputed > 0
        ? totalPaidComputed
        : isExplicitCompleted || isZeroRemaining
          ? principalAmount
          : 0;

    const resolvedStatus: 'completed' | 'paid_off' =
      statusLower === 'paid_off' ? 'paid_off' : 'completed';

    rows.push({
      id: loan.id,
      loanId: loan.id,
      loanNumber: loan.loan_number || '-',
      memberId: relMember?.id || loan.member_id || '',
      memberName: relMember?.nama || relMember?.name || '-',
      nrp: relMember?.nrp || '-',
      tanggal_lahir: relMember?.tanggal_lahir ?? null,
      loanTypeId: relLoanType?.id || loan.loan_type_id || '',
      loanTypeCode: relLoanType?.code || '',
      loanTypeName: relLoanType?.name || loan.loanTypeName || 'Pinjaman Reguler',
      financingScheme,
      itemDescription,
      costPrice,
      markupAmount,
      notes: loan.notes || null,
      principalAmount,
      tenor,
      monthlyInstallment,
      totalPaid,
      disbursedAt: loan.disbursed_at || loan.created_at || null,
      paidOffDate,
      paidOffYear: extractYearFromDate(paidOffDate),
      status: resolvedStatus,
      paidPeriodsCount: mappedSchedules.filter((s) => s.status === 'paid').length || tenor,
      schedules: mappedSchedules,
      repayments: mappedRepayments,
    });
  }

  // Urutkan berdasarkan tanggal pelunasan terbaru (DESC), lalu nama anggota (ASC)
  rows.sort((a, b) => {
    const diff = toTimestamp(b.paidOffDate) - toTimestamp(a.paidOffDate);
    if (diff !== 0) return diff;
    return a.memberName.localeCompare(b.memberName, 'id');
  });

  const uniqueMembersCount = new Set(
    rows.map((r) => r.memberId || r.nrp).filter(Boolean)
  ).size;
  const totalPrincipalAmount = rows.reduce((sum, r) => sum + r.principalAmount, 0);
  const totalPaidAmount = rows.reduce((sum, r) => sum + r.totalPaid, 0);

  return {
    totalPaidOffLoans: rows.length,
    uniqueMembersCount,
    totalPrincipalAmount,
    totalPaidAmount,
    rows,
  };
}

export async function exportPaidOffLoansExcel(
  rows: PaidOffLoanReportRow[],
  profile?: KoperasiProfile | null,
  autoSave = true
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP Enterprise';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Laporan Pinjaman Lunas', {
    views: [{ showGridLines: true }],
  });

  const namaKoperasi = (profile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  const titleKop = worksheet.addRow([namaKoperasi]);
  titleKop.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F766E' } };

  const contactInfo = [profile?.alamat, profile?.telepon ? `Telp: ${profile.telepon}` : '']
    .filter(Boolean)
    .join(' | ');
  if (contactInfo) {
    const contactRow = worksheet.addRow([contactInfo]);
    contactRow.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF475569' } };
  }

  const reportTitleRow = worksheet.addRow(['LAPORAN DAFTAR ANGGOTA PINJAMAN LUNAS']);
  reportTitleRow.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };

  const totalPrincipal = rows.reduce((sum, r) => sum + r.principalAmount, 0);
  const uniqueMembers = new Set(rows.map((r) => r.memberId || r.nrp).filter(Boolean)).size;

  const metaRow = worksheet.addRow([
    `Total Berkas Lunas: ${rows.length} | Anggota Unik: ${uniqueMembers} | Total Plafon: ${formatRp(totalPrincipal)} | Dicetak: ${new Date().toLocaleString('id-ID')}`,
  ]);
  metaRow.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF334155' } };

  worksheet.addRow([]);

  const headers = [
    'No',
    'NRP',
    'Nama Anggota',
    'Tanggal Lahir',
    'No. Pinjaman',
    'Nama Jenis Pinjaman',
    'Plafon Pokok (Rp)',
    'Total Terbayar (Rp)',
    'Tenor (Bulan)',
    'Tgl Mulai',
    'Tgl Lunas',
    'Status',
  ];

  const headerRow = worksheet.addRow(headers);
  headerRow.height = 26;
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  if (rows.length === 0) {
    const emptyRow = worksheet.addRow(['Tidak ada data anggota dengan pinjaman lunas.']);
    emptyRow.font = { name: 'Calibri', size: 9.5, italic: true };
  } else {
    rows.forEach((item, index) => {
      const row = worksheet.addRow([
        index + 1,
        item.nrp || '-',
        item.memberName || '-',
        formatTanggalLahirWithAge(item.tanggal_lahir),
        item.loanNumber || '-',
        item.loanTypeName || 'Pinjaman Reguler',
        item.principalAmount,
        item.totalPaid,
        item.tenor,
        formatReportDate(item.disbursedAt),
        formatReportDate(item.paidOffDate),
        'Lunas Penuh',
      ]);

      row.height = 20;
      row.font = { name: 'Calibri', size: 9.5 };
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle' };

      row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(7).numFmt = '"Rp "#,##0';

      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).numFmt = '"Rp "#,##0';

      row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(9).numFmt = '#,##0';

      row.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(11).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(12).font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF047857' } };

      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    const totalPaidSum = rows.reduce((sum, r) => sum + r.totalPaid, 0);
    const totalRow = worksheet.addRow([
      'TOTAL',
      '',
      '',
      '',
      '',
      `${rows.length} Berkas Lunas`,
      totalPrincipal,
      totalPaidSum,
      '',
      '',
      '',
      '',
    ]);
    totalRow.height = 22;
    totalRow.font = { name: 'Calibri', size: 9.5, bold: true };
    totalRow.getCell(7).numFmt = '"Rp "#,##0';
    totalRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(8).numFmt = '"Rp "#,##0';
    totalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF0F766E' } },
        bottom: { style: 'double', color: { argb: 'FF0F766E' } },
      };
    });
  }

  worksheet.columns = [
    { width: 6 },
    { width: 14 },
    { width: 26 },
    { width: 16 },
    { width: 22 },
    { width: 24 },
    { width: 20 },
    { width: 20 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 15 },
  ];

  if (autoSave && typeof document !== 'undefined') {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `Laporan_Pinjaman_Lunas_${dateStr}.xlsx`;
    document.body?.appendChild?.(a);
    a.click();
    document.body?.removeChild?.(a);
    URL.revokeObjectURL(url);
  }

  return workbook;
}

export function exportPaidOffLoansPdf(
  rows: PaidOffLoanReportRow[],
  profile?: KoperasiProfile | null,
  autoSave = true
): jsPDF {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  const namaKoperasi = (profile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(namaKoperasi, marginX, 15);

  let currentY = 20;
  const contactDetails = [profile?.alamat, profile?.telepon ? `Telp: ${profile.telepon}` : '']
    .filter(Boolean)
    .join(' | ');
  if (contactDetails) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(contactDetails, marginX, currentY);
    currentY += 5;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 118, 110);
  doc.text('LAPORAN DAFTAR ANGGOTA PINJAMAN LUNAS', marginX, currentY + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Daftar anggota yang telah melunasi seluruh kewajiban angsuran pinjaman beserta nama jenis pinjamannya',
    marginX,
    currentY + 7
  );
  currentY += 10;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);
  currentY += 4;

  const totalPrincipal = rows.reduce((sum, r) => sum + r.principalAmount, 0);
  const totalPaid = rows.reduce((sum, r) => sum + r.totalPaid, 0);
  const uniqueMembers = new Set(rows.map((r) => r.memberId || r.nrp).filter(Boolean)).size;

  const kpiCards = [
    { label: 'TOTAL BERKAS LUNAS', value: `${rows.length} Pinjaman` },
    { label: 'JUMLAH ANGGOTA LUNAS', value: `${uniqueMembers} Anggota` },
    { label: 'TOTAL PLAFON POKOK', value: formatRp(totalPrincipal) },
    { label: 'TOTAL REALISASI TERBAYAR', value: formatRp(totalPaid) },
  ];

  const cardGap = 4;
  const cardWidth = (pageWidth - marginX * 2 - cardGap * (kpiCards.length - 1)) / kpiCards.length;
  const cardHeight = 13;

  kpiCards.forEach((card, idx) => {
    const cardX = marginX + idx * (cardWidth + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, cardX + 3, currentY + 4.3);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(card.value, cardX + 3, currentY + 9.8);
  });

  currentY += cardHeight + 5;

  const bodyRows: any[] =
    rows.length > 0
      ? rows.map((row, idx) => [
          idx + 1,
          row.nrp || '-',
          `${row.memberName}${row.tanggal_lahir ? `\n${formatTanggalLahirWithAge(row.tanggal_lahir)}` : ''}`.trim(),
          row.loanNumber || '-',
          row.loanTypeName || 'Pinjaman Reguler',
          formatRp(row.principalAmount),
          `${row.tenor} Bln`,
          formatReportDate(row.disbursedAt),
          formatReportDate(row.paidOffDate),
          'Lunas Penuh',
        ])
      : [
          [
            {
              content: 'Tidak ada data anggota dengan pinjaman lunas',
              colSpan: 10,
              styles: { halign: 'center' as const, fontStyle: 'italic' as const },
            },
          ],
        ];

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        'NO',
        'NRP',
        'NAMA ANGGOTA',
        'NO. PINJAMAN',
        'NAMA PINJAMAN',
        'PLAFON POKOK',
        'TENOR',
        'TGL MULAI',
        'TGL LUNAS',
        'STATUS',
      ],
    ],
    body: bodyRows,
    theme: 'striped',
    margin: { left: marginX, right: marginX, bottom: 16 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [51, 65, 85],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 9, halign: 'center' },
      1: { cellWidth: 22, halign: 'center' },
      2: { cellWidth: 44, halign: 'left' },
      3: { cellWidth: 34, halign: 'left' },
      4: { cellWidth: 34, halign: 'left' },
      5: { cellWidth: 30, halign: 'right' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 26, halign: 'center' },
      8: { cellWidth: 26, halign: 'center' },
      9: { cellWidth: 24, halign: 'center' },
    },
  });

  const totalPages = doc.getNumberOfPages();
  const printTimestamp = new Date().toLocaleString('id-ID');
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(`Dicetak pada: ${printTimestamp} | SIMKOP Simpan Pinjam`, marginX, pageHeight - 8);
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  if (autoSave) {
    const dateStr = new Date().toISOString().slice(0, 10);
    doc.save(`Laporan_Pinjaman_Lunas_${dateStr}.pdf`);
  }

  return doc;
}

export function exportPaidOffLoanCertificatePdf(
  row: PaidOffLoanReportRow,
  profile?: KoperasiProfile | null,
  autoSave = true
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;

  // Kop Surat Koperasi
  const namaKoperasi = (profile?.nama_koperasi || 'KOPERASI PRIMKOPPOL').toUpperCase();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(namaKoperasi, pageWidth / 2, 18, { align: 'center' });

  const contactDetails = [profile?.alamat, profile?.telepon ? `Telp: ${profile.telepon}` : '']
    .filter(Boolean)
    .join(' | ');
  if (contactDetails) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(contactDetails, pageWidth / 2, 23, { align: 'center' });
  }

  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.8);
  doc.line(marginX, 27, pageWidth - marginX, 27);

  // Judul Surat Keterangan Lunas
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 118, 110);
  doc.text('SURAT KETERANGAN LUNAS PINJAMAN', pageWidth / 2, 36, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`No. Kontrak: ${row.loanNumber}`, pageWidth / 2, 41.5, { align: 'center' });

  // Box Identitas Anggota & Kontrak
  let y = 48;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 46, 2, 2, 'FD');

  const leftColX = marginX + 5;
  const valLeftX = marginX + 42;
  const rightColX = pageWidth / 2 + 4;
  const valRightX = pageWidth / 2 + 38;

  const infoPairsLeft = [
    ['Nama Anggota', row.memberName],
    ['NRP', row.nrp],
    ['Tanggal Lahir', formatTanggalLahirWithAge(row.tanggal_lahir)],
    ['Jenis Pinjaman', row.loanTypeName],
    ['Status Pinjaman', 'LUNAS PENUH'],
  ];

  const infoPairsRight = [
    ['No. Pinjaman', row.loanNumber],
    ['Plafon Pokok', formatRp(row.principalAmount)],
    ['Tenor', `${row.tenor} Bulan`],
    ['Total Terbayar', formatRp(row.totalPaid)],
    ['Tgl Pelunasan', formatReportDate(row.paidOffDate, true)],
  ];

  infoPairsLeft.forEach(([label, val], i) => {
    const rowY = y + 8 + i * 7.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, leftColX, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(label === 'Status Pinjaman' ? 4 : 15, label === 'Status Pinjaman' ? 120 : 23, label === 'Status Pinjaman' ? 87 : 42);
    doc.text(`: ${val}`, valLeftX, rowY);
  });

  infoPairsRight.forEach(([label, val], i) => {
    const rowY = y + 8 + i * 7.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, rightColX, rowY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(`: ${val}`, valRightX, rowY);
  });

  y += 52;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const statement = `Dengan ini menerangkan bahwa anggota tersebut di atas telah menyelesaikan seluruh kewajiban angsuran pinjaman (${row.loanTypeName}) mulai pencairan tanggal ${formatReportDate(row.disbursedAt, true)} hingga pelunasan akhir tanggal ${formatReportDate(row.paidOffDate, true)}.`;
  const splitText = doc.splitTextToSize(statement, pageWidth - marginX * 2);
  doc.text(splitText, marginX, y);
  y += splitText.length * 4.5 + 4;

  // Tabel Rincian Angsuran
  const schedRows =
    row.schedules.length > 0
      ? row.schedules.map((s) => [
          `Bulan ${s.periodNumber}`,
          formatReportDate(s.dueDate),
          formatRp(s.targetAmount),
          formatRp(s.paidAmount),
          s.paymentDate ? formatReportDate(s.paymentDate) : '-',
          s.receiptNumber || s.paymentMethod || '-',
          s.status === 'paid' ? 'Lunas' : s.status,
        ])
      : [
          [
            {
              content: 'Pinjaman diselesaikan secara lunas penuh.',
              colSpan: 7,
              styles: { halign: 'center' as const, fontStyle: 'italic' as const },
            },
          ],
        ];

  autoTable(doc, {
    startY: y,
    head: [['PERIODE', 'JATUH TEMPO', 'TARGET', 'TERBAYAR', 'TGL BAYAR', 'KWITANSI / METODE', 'STATUS']],
    body: schedRows,
    theme: 'grid',
    margin: { left: marginX, right: marginX, bottom: 20 },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [51, 65, 85],
    },
    headStyles: {
      fillColor: [15, 118, 110],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 23, halign: 'center' },
      2: { cellWidth: 25, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 23, halign: 'center' },
      5: { cellWidth: 44, halign: 'left' },
      6: { cellWidth: 16, halign: 'center' },
    },
  });

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Dicetak pada: ${new Date().toLocaleString('id-ID')} | SIMKOP`,
      marginX,
      pageHeight - 8
    );
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - marginX, pageHeight - 8, {
      align: 'right',
    });
  }

  if (autoSave) {
    const safeNrp = (row.nrp || 'ANGGOTA').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeLoan = (row.loanNumber || 'PINJ').replace(/[^a-zA-Z0-9_-]/g, '');
    doc.save(`Surat_Keterangan_Lunas_${safeNrp}_${safeLoan}.pdf`);
  }

  return doc;
}
