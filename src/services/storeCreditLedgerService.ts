import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { formatTanggalLahirWithAge } from '../utils/dateUtils';

export interface StoreCreditSummary {
  totalCreditSales: number;   // Total Belanja Bon Kumulatif
  totalPaid: number;          // Realisasi Pelunasan Masuk
  outstandingDebt: number;    // Sisa Piutang Bon Belum Lunas
  activeDebtorCount: number;  // Anggota Berutang Aktif
  totalTransactions: number;  // Total Transaksi Mutasi
}

export interface StoreCreditLedgerItem {
  id: string;
  source_type: 'sale' | 'payment';
  date: string;
  member_id: string;
  member_name: string;
  member_nrp: string;
  member_tanggal_lahir?: string | null;
  reference_no: string;      // No. Struk POS (INV-...) atau No. Kwitansi (BYR-...)
  sale_id?: string;
  debit: number;             // Tambah Utang (+ Bon)
  credit: number;            // Pelunasan (- Bayar)
  running_debt: number;      // Sisa Saldo Utang Anggota saat mutasi terjadi
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  notes?: string;
  payment_method?: string;   // 'potong_gaji' | 'tunai' | 'transfer'
  cashier_name?: string;     // Kasir Toko atau Petugas Penerima
  created_at: string;
  is_pos_sale: boolean;
  parent_invoice_no?: string; // Referensi struk POS induk (INV-...) untuk baris pelunasan
  period_number?: number;     // Nomor periode angsuran (mis. 1, 2, 3) bila terdeteksi
}

export interface StoreCreditFilter {
  memberId?: string;
  statusFilter?: 'ALL' | 'UNPAID' | 'PAID';
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface SettleStoreCreditPayload {
  memberId: string;
  saleId?: string | null;
  amount: number;
  paymentMethod: 'potong_gaji' | 'tunai' | 'transfer';
  referenceNo?: string;
  notes?: string;
  receivedBy?: string | null;
}

export interface StoreCreditInstallmentPlan {
  id: string;
  member_id: string;
  latest_sale_id?: string | null;
  previous_unpaid_balance: number;
  new_credit_amount: number;
  total_consolidated_debt: number;
  tenor_months: number;
  monthly_installment: number;
  status: 'active' | 'superseded' | 'paid_off';
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  anggota?: {
    id?: string;
    nama?: string;
    nrp?: string;
    tanggal_lahir?: string | null;
  };
  schedules?: StoreCreditSchedule[];
}

export interface StoreCreditSchedule {
  id: string;
  plan_id: string;
  member_id: string;
  period_number: number;
  due_year: number;
  due_month: number;
  due_date: string;
  target_amount: number;
  paid_amount: number;
  status: 'unpaid' | 'partial' | 'paid';
  paid_at?: string | null;
  receipt_number?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface StoreCreditPlanWithSchedules extends StoreCreditInstallmentPlan {
  schedules: StoreCreditSchedule[];
}

export interface MemberStoreCreditSummary {
  unpaidBalance: number;
  activePlan: StoreCreditPlanWithSchedules | null;
  existingTenor: number;
  existingMonthlyInstallment: number;
}

export interface CreateStoreCreditPlanPayload {
  memberId: string;
  saleId?: string | null;
  previousUnpaidBalance: number;
  newCreditAmount: number;
  tenorMonths: number;
  userId?: string;
  baseDate?: string;
}

export interface PayStoreCreditSchedulePayload {
  scheduleId: string;
  amount: number;
  paymentMethod?: 'potong_gaji' | 'tunai' | 'transfer';
  receiptNo?: string;
  notes?: string;
  receivedBy?: string | null;
}

export const sanitizeNumber = (val: any, fallback = 0): number => {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
};

export function extractParentInvoiceFromNotes(notes?: string | null): string | undefined {
  if (!notes) return undefined;
  const match = String(notes).match(/Ref:\s*([A-Za-z0-9_-]+)/i);
  return match?.[1]?.trim() || undefined;
}

export function extractInstallmentPeriodNumber(
  referenceNo?: string | null,
  notes?: string | null
): number | undefined {
  if (referenceNo) {
    const refMatch = String(referenceNo).match(/-P(\d+)(?:-|$)/i);
    if (refMatch) {
      const n = Number(refMatch[1]);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  if (notes) {
    const noteMatch = String(notes).match(/Periode(?:\s+Ke-?)?\s*(\d+)/i);
    if (noteMatch) {
      const n = Number(noteMatch[1]);
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  return undefined;
}

export function resolvePaymentEffectiveTimestamp(p: {
  created_at?: string | null;
  payment_date?: string | null;
}): string {
  const created = String(p.created_at || '').trim();
  if (created) return created;
  const payDate = String(p.payment_date || '').trim();
  if (payDate) return payDate;
  return new Date().toISOString();
}

export interface OutstandingStoreCreditSummary {
  totalOutstandingReceivable: number;
  activeDebtorsCount: number;
  totalCreditSales: number;
  totalRepaid: number;
}

export function formatStoreCreditPaymentMethodLabel(method?: string | null): string {
  const raw = String(method || '').trim();
  const norm = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (norm === 'PAYROLL_DEDUCTION' || norm === 'POTONG_GAJI') return 'Potong Gaji';
  if (norm === 'TRANSFER' || norm === 'TRANSFER_BANK') return 'Transfer Bank';
  if (norm === 'TUNAI' || norm === 'CASH' || norm === 'TUNAI_KASIR') return 'Tunai Kasir';
  return raw || 'Potong Gaji';
}

export function inferStoreCreditPaymentMethod(
  method?: string | null,
  notes?: string | null
): 'potong_gaji' | 'tunai' | 'transfer' {
  const raw = String(method || '').trim().toLowerCase();
  if (raw === 'tunai' || raw === 'cash' || raw.includes('tunai')) return 'tunai';
  if (raw === 'transfer' || raw === 'transfer_bank' || raw.includes('transfer')) return 'transfer';
  if (raw === 'potong_gaji' || raw === 'payroll_deduction' || raw.includes('potong')) {
    return 'potong_gaji';
  }

  const noteLower = String(notes || '').toLowerCase();
  if (noteLower.includes('[tunai]') || noteLower.includes('tunai')) return 'tunai';
  if (noteLower.includes('[transfer]') || noteLower.includes('transfer')) return 'transfer';
  return 'potong_gaji';
}

export function formatStoreCreditCashFlowDescription(params: {
  paymentMethod?: string | null;
  receiptNumber?: string | null;
  memberNrp?: string | null;
  memberName?: string | null;
  paidAmount: number;
  remainingDebt?: number | null;
}): string {
  const fmtPaid = new Intl.NumberFormat('id-ID').format(Math.round(params.paidAmount));
  const methodLabel = formatStoreCreditPaymentMethodLabel(params.paymentMethod);
  const receiptTag = params.receiptNumber ? ` • ${params.receiptNumber}` : '';
  const nrp = String(params.memberNrp || '').trim();
  const nama = String(params.memberName || '').trim();
  const hasNrp = nrp !== '' && nrp !== '-';
  const hasNama = nama !== '' && nama !== '-';
  const memberSegment =
    hasNrp && hasNama
      ? ` — ${nrp} - ${nama}`
      : hasNama
      ? ` — ${nama}`
      : hasNrp
      ? ` — ${nrp}`
      : '';
  const remSegment =
    typeof params.remainingDebt === 'number' && !isNaN(params.remainingDebt)
      ? ` (Sisa Piutang: Rp ${new Intl.NumberFormat('id-ID').format(Math.max(0, Math.round(params.remainingDebt)))})`
      : '';
  return `Pelunasan Bon Toko (${methodLabel}${receiptTag})${memberSegment} | Piutang -Rp ${fmtPaid}${remSegment}`;
}

async function fetchPagedWithBuilder<T = any>(
  buildQuery: () => any
): Promise<{ data: T[]; error: any }> {
  const PAGE_SIZE = 1000;
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const q = buildQuery();
    if (!q) return { data: [], error: null };

    if (typeof q.range === 'function') {
      const res = await q.range(offset, offset + PAGE_SIZE - 1);
      if (res?.error) return { data: allRows, error: res.error };
      const batch = Array.isArray(res?.data) ? res.data : [];
      allRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    } else {
      const res = await q;
      if (res?.error) return { data: [], error: res.error };
      return { data: Array.isArray(res?.data) ? res.data : [], error: null };
    }
  }
  return { data: allRows, error: null };
}

/**
 * 1. Mengambil ringkasan metrik global Piutang Bon Toko
 */
export async function getStoreCreditSummary(): Promise<StoreCreditSummary> {
  try {
    // 1. Kueri penjualan dengan paid_credit > 0
    const { data: rawSales, error: salesError } = await fetchPagedWithBuilder<any>(() => {
      const salesTable: any = supabase.from('sales');
      if (!salesTable || typeof salesTable.select !== 'function') return null;
      let salesQuery: any = salesTable.select('id, member_id, paid_credit, sale_status');
      if (salesQuery && typeof salesQuery.gt === 'function') {
        salesQuery = salesQuery.gt('paid_credit', 0);
      }
      return salesQuery;
    });

    if (salesError) {
      console.warn('Gagal memuat data sales untuk summary bon:', salesError.message);
    }

    const validSales = (rawSales || []).filter((s: any) =>
      Number(s.paid_credit) > 0 &&
      (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')
    );

    // 2. Kueri riwayat pelunasan dari store_credit_payments
    let payments: any[] = [];
    try {
      const { data: rawPayments, error: payError } = await fetchPagedWithBuilder<any>(() => {
        const payTable: any = supabase.from('store_credit_payments');
        if (!payTable || typeof payTable.select !== 'function') return null;
        return payTable.select('id, sale_id, amount');
      });

      if (!payError && rawPayments) {
        payments = rawPayments;
      }
    } catch {
      payments = [];
    }

    let totalCreditSales = 0;
    const memberDebtMap = new Map<string, number>();
    const saleMemberMap = new Map<string, string>();

    validSales.forEach((s: any) => {
      const amt = sanitizeNumber(s.paid_credit);
      totalCreditSales += amt;
      if (s.member_id) {
        const cur = memberDebtMap.get(s.member_id) || 0;
        memberDebtMap.set(s.member_id, cur + amt);
        if (s.id) saleMemberMap.set(s.id, s.member_id);
      }
    });

    let totalPaid = 0;
    payments.forEach((p: any) => {
      const amt = sanitizeNumber(p.amount);
      totalPaid += amt;
      const mId = (p.sale_id && saleMemberMap.get(p.sale_id)) || p.member_id;
      if (mId) {
        const cur = memberDebtMap.get(mId) || 0;
        memberDebtMap.set(mId, cur - amt);
      }
    });

    let activeDebtorCount = 0;
    memberDebtMap.forEach((debt) => {
      if (debt > 0) activeDebtorCount++;
    });

    return {
      totalCreditSales,
      totalPaid,
      outstandingDebt: Math.max(0, totalCreditSales - totalPaid),
      activeDebtorCount,
      totalTransactions: validSales.length + payments.length
    };
  } catch (err: any) {
    console.warn('Exception getStoreCreditSummary:', err?.message || err);
    return {
      totalCreditSales: 0,
      totalPaid: 0,
      outstandingDebt: 0,
      activeDebtorCount: 0,
      totalTransactions: 0
    };
  }
}

export async function getOutstandingStoreCreditSummary(): Promise<OutstandingStoreCreditSummary> {
  const summary = await getStoreCreditSummary();
  return {
    totalOutstandingReceivable: summary.outstandingDebt,
    activeDebtorsCount: summary.activeDebtorCount,
    totalCreditSales: summary.totalCreditSales,
    totalRepaid: summary.totalPaid,
  };
}

/**
 * 2. Mengambil Buku Besar / Mutasi Piutang Bon Toko beserta Running Balance Utang
 */
export async function getStoreCreditLedger(
  filters?: StoreCreditFilter
): Promise<{ items: StoreCreditLedgerItem[]; summary: StoreCreditSummary; totalItems: number }> {
  try {
    // 1. Kueri seluruh penjualan yang menggunakan kredit bon
    let salesQuery: any = supabase
      .from('sales')
      .select('id, sale_number, member_id, cashier_id, total_amount, paid_credit, payment_scheme, sale_status, created_at');

    if (salesQuery && typeof salesQuery.gt === 'function') {
      salesQuery = salesQuery.gt('paid_credit', 0);
    }
    if (filters?.memberId && salesQuery && typeof salesQuery.eq === 'function') {
      salesQuery = salesQuery.eq('member_id', filters.memberId);
    }

    const { data: rawSales, error: salesError } = await salesQuery;
    if (salesError) {
      console.warn('Gagal memuat penjualan bon:', salesError.message);
    }

    const validSales = (rawSales || []).filter((s: any) =>
      Number(s.paid_credit) > 0 &&
      (!filters?.memberId || s.member_id === filters.memberId) &&
      (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')
    );

    const saleMap = new Map<string, any>();
    const saleNumberMap = new Map<string, string>();
    const saleTimeMap = new Map<string, number>();
    validSales.forEach((s: any) => {
      if (s.id) {
        saleMap.set(s.id, s);
        const invNo = s.sale_number || `INV-${s.id.slice(0, 8)}`;
        saleNumberMap.set(s.id, invNo);
        const saleTs = new Date(s.created_at || new Date().toISOString()).getTime();
        if (!Number.isNaN(saleTs)) {
          saleTimeMap.set(s.id, saleTs);
        }
      }
    });

    // 2. Kueri data pelunasan dari store_credit_payments
    const validSaleIds = validSales.map((s: any) => s.id).filter(Boolean);
    let paymentsQuery: any = supabase
      .from('store_credit_payments')
      .select('id, sale_id, amount, payment_date, receipt_number, notes, created_by, created_at');

    if (filters?.memberId && validSaleIds.length > 0 && paymentsQuery && typeof paymentsQuery.in === 'function') {
      paymentsQuery = paymentsQuery.in('sale_id', validSaleIds);
    }

    let rawPayments: any[] = [];
    try {
      if (!filters?.memberId || validSaleIds.length > 0) {
        const { data: pData, error: pError } = await paymentsQuery;
        if (!pError && pData) {
          rawPayments = pData;
        }
      }
    } catch {
      rawPayments = [];
    }

    const validPayments = rawPayments
      .map((p: any) => {
        const linkedSale = saleMap.get(p.sale_id);
        const memberId = linkedSale?.member_id || p.member_id || '';
        const refNo = p.receipt_number || p.reference_no || `BYR-${p.id.slice(0, 8)}`;
        const cashierId = p.created_by || p.received_by;
        let method = p.payment_method;
        if (!method && p.notes) {
          const match = p.notes.match(/^\[(.*?)\]/);
          if (match) {
            const m = match[1].toLowerCase();
            if (m.includes('tunai')) method = 'tunai';
            else if (m.includes('transfer')) method = 'transfer';
            else if (m.includes('potong')) method = 'potong_gaji';
          }
        }
        if (!method) method = 'potong_gaji';

        return {
          ...p,
          member_id: memberId,
          reference_no: refNo,
          received_by: cashierId,
          payment_method: method
        };
      })
      .filter((p: any) =>
        Number(p.amount) > 0 &&
        (!filters?.memberId || p.member_id === filters.memberId)
      );

    // 3. Kumpulkan seluruh member_id dan cashier/received_by id
    const memberIdSet = new Set<string>();
    const cashierIdSet = new Set<string>();

    validSales.forEach((s: any) => {
      if (s.member_id) memberIdSet.add(s.member_id);
      if (s.cashier_id) cashierIdSet.add(s.cashier_id);
    });

    validPayments.forEach((p: any) => {
      if (p.member_id) memberIdSet.add(p.member_id);
      if (p.received_by) cashierIdSet.add(p.received_by);
    });

    // 4. Kueri profil Anggota
    const memberMap = new Map<string, { nama: string; nrp: string; tanggal_lahir?: string | null }>();
    if (memberIdSet.size > 0) {
      const { data: members } = await supabase
        .from('anggota')
        .select('id, nama, nrp, tanggal_lahir')
        .in('id', Array.from(memberIdSet));

      (members || []).forEach((m: any) => {
        memberMap.set(m.id, {
          nama: m.nama || 'Anggota Tanpa Nama',
          nrp: m.nrp || '-',
          tanggal_lahir: m.tanggal_lahir ?? null
        });
      });
    }

    // 5. Kueri data Pengelola / Kasir
    const cashierMap = new Map<string, string>();
    try {
      const { data: pengelolaList } = await supabase
        .from('pengelola')
        .select('id, nama');

      (pengelolaList || []).forEach((p: any) => {
        cashierMap.set(p.id, p.nama);
      });
    } catch {
      // ignore
    }

    // 6. Alokasikan pelunasan per penjualan untuk mendeteksi status (PAID/PARTIAL/UNPAID)
    const salePaymentsMap = new Map<string, number>();
    const unallocatedPaymentsPerMember = new Map<string, number>();

    validPayments.forEach((p: any) => {
      const amt = sanitizeNumber(p.amount);
      if (p.sale_id) {
        const cur = salePaymentsMap.get(p.sale_id) || 0;
        salePaymentsMap.set(p.sale_id, cur + amt);
      } else if (p.member_id) {
        const cur = unallocatedPaymentsPerMember.get(p.member_id) || 0;
        unallocatedPaymentsPerMember.set(p.member_id, cur + amt);
      }
    });

    // 7. Satukan transaksi mutasi ke dalam array tunggal
    const unifiedList: {
      id: string;
      source_type: 'sale' | 'payment';
      date: string;
      member_id: string;
      sale_id?: string;
      reference_no: string;
      debit: number;
      credit: number;
      notes?: string;
      payment_method?: string;
      cashier_id?: string;
      created_at: string;
      is_pos_sale: boolean;
      status: 'PAID' | 'PARTIAL' | 'UNPAID';
      parent_invoice_no?: string;
      period_number?: number;
    }[] = [];

    // Tambah baris penjualan bon
    validSales.forEach((s: any) => {
      const debitAmt = sanitizeNumber(s.paid_credit);
      const invNo = s.sale_number || `INV-${s.id.slice(0, 8)}`;
      const directPaid = salePaymentsMap.get(s.id) || 0;

      // Status tagihan per bon
      let status: 'PAID' | 'PARTIAL' | 'UNPAID' = 'UNPAID';
      if (directPaid >= debitAmt) {
        status = 'PAID';
      } else if (directPaid > 0) {
        status = 'PARTIAL';
      }

      unifiedList.push({
        id: `sale-${s.id}`,
        source_type: 'sale',
        date: s.created_at || new Date().toISOString(),
        member_id: s.member_id || '',
        sale_id: s.id,
        reference_no: invNo,
        debit: debitAmt,
        credit: 0,
        notes: `Belanja Kasir POS (Bon Toko)`,
        payment_method: s.payment_scheme || 'store_credit',
        cashier_id: s.cashier_id,
        created_at: s.created_at || new Date().toISOString(),
        is_pos_sale: true,
        status: status,
        parent_invoice_no: invNo
      });
    });

    // Tambah baris pelunasan bon
    validPayments.forEach((p: any) => {
      const creditAmt = sanitizeNumber(p.amount);
      const refNo = p.reference_no || `BYR-${p.id.slice(0, 8)}`;
      const pDate = resolvePaymentEffectiveTimestamp(p);
      const parentInvoiceNo =
        (p.sale_id && saleNumberMap.get(p.sale_id)) || extractParentInvoiceFromNotes(p.notes);
      const periodNo = extractInstallmentPeriodNumber(refNo, p.notes);

      unifiedList.push({
        id: `pay-${p.id}`,
        source_type: 'payment',
        date: pDate,
        member_id: p.member_id || '',
        sale_id: p.sale_id || undefined,
        reference_no: refNo,
        debit: 0,
        credit: creditAmt,
        notes: p.notes || `Pelunasan Bon Toko (${p.payment_method || 'potong_gaji'})`,
        payment_method: p.payment_method || 'potong_gaji',
        cashier_id: p.received_by,
        created_at: p.created_at || pDate,
        is_pos_sale: false,
        status: 'PAID',
        parent_invoice_no: parentInvoiceNo,
        period_number: periodNo
      });
    });

    // 8. Urutkan kronologis ascending (waktu terlama ke terbaru, nota induk selalu mendahului pelunasannya)
    const getEffectiveSortTime = (tx: typeof unifiedList[number]) => {
      const rawTime = new Date(tx.date).getTime();
      const safeTime = Number.isNaN(rawTime) ? 0 : rawTime;
      if (tx.source_type === 'payment' && tx.sale_id && saleTimeMap.has(tx.sale_id)) {
        const parentTime = saleTimeMap.get(tx.sale_id)!;
        if (safeTime < parentTime) {
          return parentTime + (tx.period_number || 1);
        }
      }
      return safeTime;
    };

    unifiedList.sort((a, b) => {
      const timeDiff = getEffectiveSortTime(a) - getEffectiveSortTime(b);
      if (timeDiff !== 0) return timeDiff;
      if (a.source_type !== b.source_type) {
        return a.source_type === 'sale' ? -1 : 1;
      }
      if (
        a.source_type === 'payment' &&
        b.source_type === 'payment' &&
        a.member_id === b.member_id &&
        a.period_number !== undefined &&
        b.period_number !== undefined &&
        a.period_number !== b.period_number
      ) {
        return a.period_number - b.period_number;
      }
      return a.id.localeCompare(b.id);
    });

    // 9. Hitung Running Debt Balance per Anggota
    const memberDebtMap = new Map<string, number>();
    const processedItems: StoreCreditLedgerItem[] = [];

    const startFilterTime = filters?.startDate
      ? (filters.startDate.includes('T') ? new Date(filters.startDate).getTime() : new Date(`${filters.startDate}T00:00:00`).getTime())
      : null;
    const endFilterTime = filters?.endDate
      ? (filters.endDate.includes('T') ? new Date(filters.endDate).getTime() : new Date(`${filters.endDate}T23:59:59.999`).getTime())
      : null;

    let globalCreditSales = 0;
    let globalPaid = 0;

    for (const tx of unifiedList) {
      globalCreditSales += tx.debit;
      globalPaid += tx.credit;

      const memberId = tx.member_id;
      const prevDebt = memberDebtMap.get(memberId) || 0;
      const currentDebt = Math.max(0, prevDebt + tx.debit - tx.credit);
      memberDebtMap.set(memberId, currentDebt);

      const txTime = new Date(tx.date).getTime();

      // Filter Tanggal
      if (startFilterTime && txTime < startFilterTime) {
        continue;
      }
      if (endFilterTime && txTime > endFilterTime) {
        continue;
      }

      // Filter Status
      if (filters?.statusFilter && filters.statusFilter !== 'ALL') {
        if (filters.statusFilter === 'PAID') {
          if (tx.source_type === 'sale' && tx.status !== 'PAID') continue;
        } else if (filters.statusFilter === 'UNPAID') {
          if (tx.source_type === 'sale' && tx.status === 'PAID') continue;
          if (tx.source_type === 'payment') continue;
        }
      }

      const mInfo = memberMap.get(memberId) || { nama: 'Anggota Toko', nrp: '-', tanggal_lahir: null };
      const cashierName = (tx.cashier_id && cashierMap.get(tx.cashier_id)) || 'Kasir Toko / Petugas';

      // Jika ada unallocated payments di akun anggota, evaluasi status bon terkini
      let finalStatus = tx.status;
      if (tx.source_type === 'sale' && currentDebt === 0) {
        finalStatus = 'PAID';
      }

      const item: StoreCreditLedgerItem = {
        id: tx.id,
        source_type: tx.source_type,
        date: tx.date,
        member_id: memberId,
        member_name: mInfo.nama,
        member_nrp: mInfo.nrp,
        member_tanggal_lahir: mInfo.tanggal_lahir,
        reference_no: tx.reference_no,
        sale_id: tx.sale_id,
        debit: tx.debit,
        credit: tx.credit,
        running_debt: currentDebt,
        status: finalStatus,
        notes: tx.notes,
        payment_method: tx.payment_method,
        cashier_name: cashierName,
        created_at: tx.created_at,
        is_pos_sale: tx.is_pos_sale,
        parent_invoice_no: tx.parent_invoice_no,
        period_number: tx.period_number
      };

      // Filter Search Query
      if (filters?.searchQuery && filters.searchQuery.trim() !== '') {
        const q = filters.searchQuery.trim().toLowerCase();
        const matchesName = mInfo.nama.toLowerCase().includes(q);
        const matchesNrp = mInfo.nrp.toLowerCase().includes(q);
        const matchesRef = tx.reference_no.toLowerCase().includes(q);
        const matchesNotes = (tx.notes || '').toLowerCase().includes(q);
        const matchesCashier = cashierName.toLowerCase().includes(q);
        const matchesParentInvoice = (tx.parent_invoice_no || '').toLowerCase().includes(q);

        if (!matchesName && !matchesNrp && !matchesRef && !matchesNotes && !matchesCashier && !matchesParentInvoice) {
          continue;
        }
      }

      processedItems.push(item);
    }

    let activeDebtorCount = 0;
    memberDebtMap.forEach((debt) => {
      if (debt > 0) activeDebtorCount++;
    });

    const summary: StoreCreditSummary = {
      totalCreditSales: globalCreditSales,
      totalPaid: globalPaid,
      outstandingDebt: Math.max(0, globalCreditSales - globalPaid),
      activeDebtorCount,
      totalTransactions: processedItems.length
    };

    return {
      items: processedItems,
      summary,
      totalItems: processedItems.length
    };
  } catch (err: any) {
    console.warn('Exception getStoreCreditLedger:', err?.message || err);
    return {
      items: [],
      summary: {
        totalCreditSales: 0,
        totalPaid: 0,
        outstandingDebt: 0,
        activeDebtorCount: 0,
        totalTransactions: 0
      },
      totalItems: 0
    };
  }
}

function isStoreCreditPostgrestColumnError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    msg.includes('column') ||
    msg.includes('schema cache')
  );
}

/**
 * Helper internal untuk mencatat Kas Masuk (`direction = 'in'`) ke `public.cash_flow`
 * secara idempoten berdasarkan `reference_id = paymentId`.
 */
async function recordStoreCreditCashIn(params: {
  paymentId: string;
  memberName?: string;
  memberNrp?: string;
  amount: number;
  receiptNumber: string;
  paymentMethod?: string;
  notes?: string;
  previousDebt?: number | null;
  remainingDebt?: number | null;
  userId?: string | null;
  createdAt?: string;
}) {
  const nominal = Math.round(Number(params.amount || 0));
  if (nominal <= 0 || !params.paymentId) return;

  const cfTable: any = supabase.from('cash_flow');
  if (!cfTable || typeof cfTable.insert !== 'function') return;

  // Cegah duplikasi jika paymentId sudah pernah tercatat di cash_flow
  if (typeof cfTable.select === 'function') {
    const { data: existingCf } = await cfTable
      .select('id')
      .eq('reference_id', params.paymentId)
      .maybeSingle();

    if (existingCf) return;
  }

  const desc = formatStoreCreditCashFlowDescription({
    paymentMethod: params.paymentMethod,
    receiptNumber: params.receiptNumber,
    memberNrp: params.memberNrp,
    memberName: params.memberName,
    paidAmount: nominal,
    remainingDebt: params.remainingDebt,
  });

  const createdAt = params.createdAt || new Date().toISOString();
  const fullPayload = {
    direction: 'in',
    category: 'PELUNASAN_BON_TOKO',
    amount: nominal,
    description: desc,
    reference_id: params.paymentId,
    created_by: params.userId || null,
    created_at: createdAt,
  };

  let { error: cfError } = await cfTable.insert(fullPayload);

  if (cfError && isStoreCreditPostgrestColumnError(cfError)) {
    const fallback1 = {
      direction: 'in',
      category: 'PELUNASAN_BON_TOKO',
      amount: nominal,
      description: desc,
      reference_id: params.paymentId,
      created_at: createdAt,
    };
    const res1 = await cfTable.insert(fallback1);
    cfError = res1?.error ?? null;

    if (cfError && isStoreCreditPostgrestColumnError(cfError)) {
      const fallback2 = {
        direction: 'in',
        category: 'PELUNASAN_BON_TOKO',
        amount: nominal,
        reference_id: params.paymentId,
        created_at: createdAt,
      };
      const res2 = await cfTable.insert(fallback2);
      cfError = res2?.error ?? null;
    }
  }

  if (cfError) {
    console.error('Gagal mencatat pelunasan bon ke cash_flow:', cfError);
    throw cfError;
  }
}

/**
 * Sinkronisasi idempoten untuk seluruh pembayaran pelunasan bon di `store_credit_payments`
 * yang belum memiliki entri padanan (`reference_id`) di `public.cash_flow`.
 */
export async function syncUnrecordedStoreCreditPaymentsToCashFlow(): Promise<{ syncedCount: number }> {
  try {
    const paymentsTable: any = supabase.from('store_credit_payments');
    if (!paymentsTable || typeof paymentsTable.select !== 'function') {
      return { syncedCount: 0 };
    }

    let pQuery = paymentsTable
      .select('id, sale_id, amount, payment_date, receipt_number, notes, created_by, created_at');
    if (typeof pQuery?.order === 'function') {
      pQuery = pQuery.order('created_at', { ascending: true });
    }

    const { data: payments, error: payErr } = await pQuery;
    if (payErr || !payments || payments.length === 0) {
      return { syncedCount: 0 };
    }

    const paymentIds = payments.map((p: any) => p.id).filter(Boolean);
    if (paymentIds.length === 0) return { syncedCount: 0 };

    const cfTable: any = supabase.from('cash_flow');
    if (!cfTable || typeof cfTable.select !== 'function' || typeof cfTable.insert !== 'function') {
      return { syncedCount: 0 };
    }

    let cfQuery = cfTable.select('reference_id');
    if (typeof cfQuery?.in === 'function') {
      cfQuery = cfQuery.in('reference_id', paymentIds);
    }
    const { data: existingCfRows } = await cfQuery;
    const existingRefIds = new Set(
      (existingCfRows || []).map((r: any) => r.reference_id).filter(Boolean)
    );

    const unrecorded = payments.filter(
      (p: any) => p.id && !existingRefIds.has(p.id) && Math.round(Number(p.amount || 0)) > 0
    );
    if (unrecorded.length === 0) return { syncedCount: 0 };

    // Ambil relasi sales -> anggota untuk memperkaya deskripsi kas masuk & estimasi sisa piutang
    const allSaleIds = Array.from(new Set(payments.map((p: any) => p.sale_id).filter(Boolean)));
    const saleMemberMap = new Map<string, string>();
    const memberSalesCreditMap = new Map<string, number>();
    const memberHasCreditAmounts = new Set<string>();
    const memberMap = new Map<string, { nama?: string; nrp?: string }>();

    if (allSaleIds.length > 0) {
      const salesTable: any = supabase.from('sales');
      if (salesTable && typeof salesTable.select === 'function') {
        let sQuery = salesTable.select('id, member_id, paid_credit, created_at, sale_status');
        if (typeof sQuery?.in === 'function') {
          sQuery = sQuery.in('id', allSaleIds);
        }
        const { data: salesRows } = await sQuery;
        const memberIds = new Set<string>();
        (salesRows || []).forEach((s: any) => {
          if (s.id && s.member_id) {
            saleMemberMap.set(s.id, s.member_id);
            memberIds.add(s.member_id);
            if (s.paid_credit !== undefined && s.paid_credit !== null) {
              memberHasCreditAmounts.add(s.member_id);
              memberSalesCreditMap.set(
                s.member_id,
                (memberSalesCreditMap.get(s.member_id) || 0) + sanitizeNumber(s.paid_credit)
              );
            }
          }
        });

        if (memberIds.size > 0) {
          const anggotaTable: any = supabase.from('anggota');
          if (anggotaTable && typeof anggotaTable.select === 'function') {
            let aQuery = anggotaTable.select('id, nama, nrp');
            if (typeof aQuery?.in === 'function') {
              aQuery = aQuery.in('id', Array.from(memberIds));
            }
            const { data: anggotaRows } = await aQuery;
            (anggotaRows || []).forEach((a: any) => {
              if (a.id) memberMap.set(a.id, { nama: a.nama, nrp: a.nrp });
            });
          }
        }
      }
    }

    // Hitung sisa piutang berjalan per anggota secara kronologis untuk pembayaran yang belum tercatat
    const sortedPayments = [...payments].sort((a: any, b: any) => {
      const ta = new Date(a.created_at || a.payment_date || 0).getTime();
      const tb = new Date(b.created_at || b.payment_date || 0).getTime();
      return ta - tb;
    });
    const runningPaidByMember = new Map<string, number>();
    const remainingDebtByPaymentId = new Map<string, number | null>();

    for (const p of sortedPayments) {
      const memberId = p.sale_id ? saleMemberMap.get(p.sale_id) : undefined;
      if (!memberId || !memberHasCreditAmounts.has(memberId)) {
        if (p.id) remainingDebtByPaymentId.set(p.id, null);
        continue;
      }
      const nextPaid = (runningPaidByMember.get(memberId) || 0) + sanitizeNumber(p.amount);
      runningPaidByMember.set(memberId, nextPaid);
      const totalCredit = memberSalesCreditMap.get(memberId) || 0;
      if (p.id) {
        remainingDebtByPaymentId.set(p.id, Math.max(0, totalCredit - nextPaid));
      }
    }

    let syncedCount = 0;
    for (const p of unrecorded) {
      const memberId = p.sale_id ? saleMemberMap.get(p.sale_id) : undefined;
      const member = memberId ? memberMap.get(memberId) : undefined;
      const receiptNo = p.receipt_number || `BYR-${String(p.id).slice(0, 6).toUpperCase()}`;
      const inferredMethod = inferStoreCreditPaymentMethod(p.payment_method, p.notes);
      const createdAt =
        p.created_at ||
        (p.payment_date
          ? new Date(`${p.payment_date}T00:00:00.000Z`).toISOString()
          : new Date().toISOString());

      try {
        await recordStoreCreditCashIn({
          paymentId: p.id,
          memberName: member?.nama,
          memberNrp: member?.nrp,
          amount: Number(p.amount),
          receiptNumber: receiptNo,
          paymentMethod: inferredMethod,
          notes: p.notes || undefined,
          remainingDebt: p.id ? (remainingDebtByPaymentId.get(p.id) ?? null) : null,
          userId: p.created_by || null,
          createdAt,
        });
        syncedCount++;
      } catch (syncItemErr) {
        console.warn('Gagal menyinkronkan pembayaran bon ke cash_flow:', p.id, syncItemErr);
      }
    }

    return { syncedCount };
  } catch (err) {
    console.warn('Warning syncUnrecordedStoreCreditPaymentsToCashFlow:', err);
    return { syncedCount: 0 };
  }
}

export const syncStoreCreditPaymentsToCashFlow = syncUnrecordedStoreCreditPaymentsToCashFlow;

/**
 * 3. Catat Pelunasan Bon Toko (Bayar Tunai Kasir / Potong Gaji)
 */
export async function settleStoreCredit(
  payload: SettleStoreCreditPayload
): Promise<{ success: boolean; paymentId?: string; error?: string }> {
  try {
    if (!payload.memberId) {
      return { success: false, error: 'Pilih anggota yang akan melunasi bon.' };
    }

    const amount = Number(payload.amount);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: 'Nominal pelunasan harus lebih dari Rp 0.' };
    }

    const refNo = payload.referenceNo || `BYR-${Date.now().toString().slice(-6)}`;
    const paymentMethod = payload.paymentMethod || 'potong_gaji';
    const methodLabel =
      paymentMethod === 'tunai'
        ? 'Tunai'
        : paymentMethod === 'transfer'
        ? 'Transfer'
        : 'Potong Gaji';

    // Ambil user ID pengelola/kasir saat ini untuk audit created_by
    let currentUserId = payload.receivedBy || null;
    if (!currentUserId) {
      try {
        if (supabase.auth && typeof supabase.auth.getUser === 'function') {
          const { data: authData } = await supabase.auth.getUser();
          currentUserId = authData?.user?.id || null;
        }
      } catch {
        currentUserId = null;
      }
    }

    // Tentukan alokasi nota sales (spesifik atau FIFO) & hitung total piutang anggota sebelum bayar
    let allocations: { saleId: string; amount: number }[] = [];
    let runningDebtBeforePayment = amount;
    const saleNumberMap = new Map<string, string>();

    if (payload.saleId) {
      allocations = [{ saleId: payload.saleId, amount }];
      try {
        const salesTable: any = supabase.from('sales');
        if (salesTable && typeof salesTable.select === 'function') {
          let sQuery: any = salesTable.select('id, sale_number, paid_credit, created_at, sale_status');
          if (sQuery && typeof sQuery.eq === 'function') {
            sQuery = sQuery.eq('member_id', payload.memberId);
          }
          if (sQuery && typeof sQuery.gt === 'function') {
            sQuery = sQuery.gt('paid_credit', 0);
          }
          if (sQuery && typeof sQuery.order === 'function') {
            sQuery = sQuery.order('created_at', { ascending: true });
          }
          const { data: memberSales } = await sQuery;
          const validSales = (memberSales || []).filter(
            (s: any) =>
              Number(s.paid_credit) > 0 &&
              (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')
          );
          validSales.forEach((s: any) => {
            if (s.id && s.sale_number) {
              saleNumberMap.set(s.id, s.sale_number);
            }
          });
          if (validSales.length > 0) {
            const totalCredit = validSales.reduce(
              (sum: number, s: any) => sum + sanitizeNumber(s.paid_credit),
              0
            );
            const saleIds = validSales.map((s: any) => s.id).filter(Boolean);
            let existingPaid = 0;
            if (saleIds.length > 0) {
              const payTable: any = supabase.from('store_credit_payments');
              if (payTable && typeof payTable.select === 'function') {
                let pQuery: any = payTable.select('sale_id, amount');
                if (pQuery && typeof pQuery.in === 'function') {
                  pQuery = pQuery.in('sale_id', saleIds);
                }
                const { data: pData } = await pQuery;
                existingPaid = (pData || []).reduce(
                  (sum: number, p: any) => sum + sanitizeNumber(p.amount),
                  0
                );
              }
            }
            runningDebtBeforePayment = Math.max(amount, totalCredit - existingPaid);
          }
        }
      } catch {
        runningDebtBeforePayment = amount;
      }
    } else {
      // Pelunasan global: cari nota sales milik anggota dengan paid_credit > 0 urut FIFO (terlama)
      let salesQuery: any = supabase
        .from('sales')
        .select('id, sale_number, paid_credit, created_at, sale_status')
        .eq('member_id', payload.memberId);

      if (salesQuery && typeof salesQuery.gt === 'function') {
        salesQuery = salesQuery.gt('paid_credit', 0);
      }
      if (salesQuery && typeof salesQuery.order === 'function') {
        salesQuery = salesQuery.order('created_at', { ascending: true });
      }

      const { data: memberSales, error: salesError } = await salesQuery;
      if (salesError) {
        console.warn('Gagal memuat penjualan bon anggota:', salesError.message);
      }

      const validSales = (memberSales || []).filter(
        (s: any) =>
          Number(s.paid_credit) > 0 &&
          (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')
      );

      if (validSales.length === 0) {
        return { success: false, error: 'Tidak ditemukan transaksi bon terbuka untuk anggota ini.' };
      }

      validSales.forEach((s: any) => {
        if (s.id && s.sale_number) {
          saleNumberMap.set(s.id, s.sale_number);
        }
      });

      const saleIds = validSales.map((s: any) => s.id).filter(Boolean);

      // Kueri pembayaran yang sudah ada untuk nota-nota ini
      let existingPayments: any[] = [];
      try {
        let pQuery: any = supabase
          .from('store_credit_payments')
          .select('sale_id, amount');

        if (saleIds.length > 0 && pQuery && typeof pQuery.in === 'function') {
          pQuery = pQuery.in('sale_id', saleIds);
        }
        const { data: pData } = await pQuery;
        existingPayments = pData || [];
      } catch {
        existingPayments = [];
      }

      const salePaidMap = new Map<string, number>();
      let totalExistingPaid = 0;
      existingPayments.forEach((p: any) => {
        const amt = sanitizeNumber(p.amount);
        totalExistingPaid += amt;
        if (p.sale_id) {
          const cur = salePaidMap.get(p.sale_id) || 0;
          salePaidMap.set(p.sale_id, cur + amt);
        }
      });

      const totalMemberCredit = validSales.reduce(
        (sum: number, s: any) => sum + sanitizeNumber(s.paid_credit),
        0
      );
      runningDebtBeforePayment = Math.max(amount, totalMemberCredit - totalExistingPaid);

      // Hitung sisa utang per nota yang terbuka
      const openSales: { id: string; remainingDebt: number }[] = [];
      for (const s of validSales) {
        const bon = sanitizeNumber(s.paid_credit);
        const paid = salePaidMap.get(s.id) || 0;
        const remaining = Math.max(0, bon - paid);
        if (remaining > 0) {
          openSales.push({ id: s.id, remainingDebt: remaining });
        }
      }

      if (openSales.length === 0) {
        openSales.push({ id: validSales[validSales.length - 1].id, remainingDebt: amount });
      }

      let unallocated = amount;
      for (let i = 0; i < openSales.length; i++) {
        if (unallocated <= 0) break;
        const s = openSales[i];
        const isLast = i === openSales.length - 1;
        const payThis = isLast ? unallocated : Math.min(unallocated, s.remainingDebt);
        allocations.push({
          saleId: s.id,
          amount: payThis
        });
        unallocated -= payThis;
      }
    }

    // Ambil identitas anggota untuk memperkaya deskripsi mutasi kas masuk
    let memberName: string | undefined;
    let memberNrp: string | undefined;
    try {
      const anggotaTable: any = supabase.from('anggota');
      if (anggotaTable && typeof anggotaTable.select === 'function') {
        const q = anggotaTable.select('nama, nrp').eq('id', payload.memberId);
        const { data: memberRow } =
          typeof q?.maybeSingle === 'function' ? await q.maybeSingle() : await q;
        if (memberRow) {
          memberName = memberRow.nama || undefined;
          memberNrp = memberRow.nrp || undefined;
        }
      }
    } catch {
      // Abaikan jika gagal memuat profil anggota (deskripsi tetap valid tanpa nama)
    }

    // 1. Simpan ke tabel store_credit_payments (HANYA kolom yang sah sesuai skema: sale_id, amount, payment_date, receipt_number, notes, created_by, created_at)
    let firstPaymentId: string | undefined;
    let runningDebt = runningDebtBeforePayment;

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];
      const itemRefNo = allocations.length > 1 ? `${refNo}-${i + 1}` : refNo;
      const parentInvoiceNo = saleNumberMap.get(alloc.saleId);
      const baseNotes = (payload.notes || 'Pelunasan Bon Toko').trim();
      const hasRefTag = /\bRef:\s*[A-Za-z0-9_-]+/i.test(baseNotes);
      const notesWithRef =
        parentInvoiceNo && !hasRefTag ? `${baseNotes} | Ref: ${parentInvoiceNo}` : baseNotes;
      const formattedNotes = `[${methodLabel}] ${notesWithRef}`.trim();
      const nowIso = new Date().toISOString();

      const insertPayload = {
        sale_id: alloc.saleId,
        amount: Number(alloc.amount),
        payment_date: nowIso.split('T')[0],
        receipt_number: itemRefNo || null,
        notes: formattedNotes,
        created_by: currentUserId || null,
        created_at: nowIso
      };

      const { data: newPayment, error: insertError } = await supabase
        .from('store_credit_payments')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      if (newPayment?.id) {
        if (!firstPaymentId) {
          firstPaymentId = newPayment.id;
        }

        const paidAmt = Math.round(Number(alloc.amount || 0));
        const previousDebt = Math.max(paidAmt, Math.round(runningDebt));
        const remainingDebt = Math.max(0, previousDebt - paidAmt);
        runningDebt = remainingDebt;

        // 2. Catat arus kas masuk (direction = 'in') ke public.cash_flow untuk setiap pelunasan bon
        await recordStoreCreditCashIn({
          paymentId: newPayment.id,
          memberName,
          memberNrp,
          amount: paidAmt,
          receiptNumber: itemRefNo,
          paymentMethod: methodLabel,
          notes: payload.notes,
          previousDebt,
          remainingDebt,
          userId: currentUserId,
          createdAt: nowIso
        });
      }
    }

    return { success: true, paymentId: firstPaymentId };
  } catch (err: any) {
    console.error('Error settleStoreCredit:', err);
    return { success: false, error: err.message || 'Gagal menyimpan pelunasan bon toko.' };
  }
}

/**
 * 4. Mengambil Sisa Utang Bon Aktif untuk Seorang Anggota Tertentu
 */
export async function getMemberActiveDebt(memberId: string): Promise<number> {
  try {
    if (!memberId) return 0;

    // Hitung total belanja bon
    const salesTable = supabase.from('sales');
    if (!salesTable || typeof salesTable.select !== 'function') {
      return 0;
    }

    const { data: sales } = await salesTable
      .select('id, paid_credit, sale_status')
      .eq('member_id', memberId)
      .gt('paid_credit', 0);

    const validSales = (sales || [])
      .filter((s: any) => !s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success');

    const totalSales = validSales.reduce((acc: number, s: any) => acc + sanitizeNumber(s.paid_credit), 0);
    const saleIds = validSales.map((s: any) => s.id).filter(Boolean);

    if (saleIds.length === 0) return 0;

    // Hitung total pelunasan untuk nota belanja bon anggota ini
    let paymentsQuery: any = supabase
      .from('store_credit_payments')
      .select('amount, sale_id');

    if (paymentsQuery && typeof paymentsQuery.in === 'function') {
      paymentsQuery = paymentsQuery.in('sale_id', saleIds);
    } else if (paymentsQuery && typeof paymentsQuery.eq === 'function') {
      paymentsQuery = paymentsQuery.eq('sale_id', saleIds[0]);
    }

    const { data: payments } = await paymentsQuery;

    const totalPaid = (payments || []).reduce(
      (acc: number, p: any) => acc + sanitizeNumber(p.amount),
      0
    );

    return Math.max(0, totalSales - totalPaid);
  } catch (err) {
    console.warn('Error getMemberActiveDebt:', err);
    return 0;
  }
}

/**
 * 5. Mengambil daftar anggota yang masih memiliki sisa utang bon aktif (> 0)
 */
export async function getMembersWithDebt(): Promise<{ id: string; nama: string; nrp: string; debt: number }[]> {
  try {
    const { data: rawSales } = await supabase
      .from('sales')
      .select('id, member_id, paid_credit, sale_status')
      .gt('paid_credit', 0);

    const memberDebtMap = new Map<string, number>();
    const saleMemberMap = new Map<string, string>();

    (rawSales || []).forEach((s: any) => {
      if (s.member_id && (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')) {
        const cur = memberDebtMap.get(s.member_id) || 0;
        memberDebtMap.set(s.member_id, cur + sanitizeNumber(s.paid_credit));
        if (s.id) saleMemberMap.set(s.id, s.member_id);
      }
    });

    const { data: rawPayments } = await supabase
      .from('store_credit_payments')
      .select('sale_id, amount');

    (rawPayments || []).forEach((p: any) => {
      const mId = (p.sale_id && saleMemberMap.get(p.sale_id)) || p.member_id;
      if (mId) {
        const cur = memberDebtMap.get(mId) || 0;
        memberDebtMap.set(mId, Math.max(0, cur - sanitizeNumber(p.amount)));
      }
    });

    const debtorMemberIds = Array.from(memberDebtMap.entries())
      .filter(([_, debt]) => debt > 0)
      .map(([id]) => id);

    if (debtorMemberIds.length === 0) return [];

    const { data: members } = await supabase
      .from('anggota')
      .select('id, nama, nrp')
      .in('id', debtorMemberIds)
      .order('nama', { ascending: true });

    return (members || []).map((m: any) => ({
      id: m.id,
      nama: m.nama || 'Anggota Tanpa Nama',
      nrp: m.nrp || '-',
      debt: memberDebtMap.get(m.id) || 0
    }));
  } catch (err) {
    console.warn('Error getMembersWithDebt:', err);
    return [];
  }
}

/**
 * 6. Ekspor Buku Besar Bon Toko ke File Excel (.xlsx) Siap Potong Gaji Dinas
 */
export async function exportStoreCreditToExcel(
  items: StoreCreditLedgerItem[],
  filterInfo?: {
    memberName?: string;
    startDate?: string;
    endDate?: string;
    statusLabel?: string;
  }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP - Sistem Informasi Manajemen Koperasi';
  workbook.lastModifiedBy = 'Admin Kasir Toko Retail';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Buku Besar Bon Toko', {
    views: [{ showGridLines: true }]
  });

  // Judul Laporan & Info Header
  worksheet.mergeCells('A1:J1');
  const titleRow = worksheet.getCell('A1');
  titleRow.value = 'BUKU BESAR PEMBANTU PIUTANG BON TOKO (STORE CREDIT)';
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('A2:J2');
  const subtitleRow = worksheet.getCell('A2');
  subtitleRow.value = 'Rekapitulasi Tagihan Belanja Bon Anggota Siap Potong Gaji Dinas Koperasi';
  subtitleRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF475569' } };
  subtitleRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // Informasi Filter
  worksheet.getCell('A4').value = 'Filter Anggota:';
  worksheet.getCell('A4').font = { bold: true };
  worksheet.getCell('B4').value = filterInfo?.memberName || 'Semua Anggota';

  worksheet.getCell('A5').value = 'Periode:';
  worksheet.getCell('A5').font = { bold: true };
  const periodeText = (filterInfo?.startDate || filterInfo?.endDate)
    ? `${filterInfo?.startDate || 'Awal'} s/d ${filterInfo?.endDate || 'Sekarang'}`
    : 'Semua Periode';
  worksheet.getCell('B5').value = periodeText;

  worksheet.getCell('A6').value = 'Status Tagihan:';
  worksheet.getCell('A6').font = { bold: true };
  worksheet.getCell('B6').value = filterInfo?.statusLabel || 'Semua Status';

  worksheet.getCell('A7').value = 'Tanggal Unduh:';
  worksheet.getCell('A7').font = { bold: true };
  worksheet.getCell('B7').value = new Date().toLocaleString('id-ID');

  // Set Definisi Kolom Tabel
  worksheet.getRow(9).values = [
    'No',
    'Tanggal & Waktu',
    'NRP',
    'Nama Anggota',
    'Tanggal Lahir',
    'Jenis Mutasi',
    'No. Struk / Bukti',
    'Kasir / Petugas',
    'Tambah Utang (Debet)',
    'Pelunasan (Kredit)',
    'Sisa Saldo Utang',
    'Status'
  ];

  // Header Styling
  const headerRow = worksheet.getRow(9);
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF9F1239' } // Rose dark burgundy
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Lebar Kolom
  worksheet.columns = [
    { key: 'no', width: 6 },
    { key: 'date', width: 20 },
    { key: 'nrp', width: 14 },
    { key: 'name', width: 26 },
    { key: 'tanggal_lahir', width: 22 },
    { key: 'type', width: 18 },
    { key: 'ref', width: 22 },
    { key: 'cashier', width: 20 },
    { key: 'debit', width: 18 },
    { key: 'credit', width: 18 },
    { key: 'debt', width: 20 },
    { key: 'status', width: 14 }
  ];

  let totalDebit = 0;
  let totalCredit = 0;
  let currentRowIdx = 10;

  items.forEach((item, index) => {
    totalDebit += item.debit;
    totalCredit += item.credit;

    const row = worksheet.getRow(currentRowIdx);
    row.values = [
      index + 1,
      new Date(item.date).toLocaleString('id-ID'),
      item.member_nrp,
      item.member_name,
      formatTanggalLahirWithAge(item.member_tanggal_lahir),
      item.source_type === 'sale' ? 'Belanja Bon POS' : 'Pelunasan Bon',
      item.reference_no,
      item.cashier_name || '-',
      item.debit > 0 ? item.debit : 0,
      item.credit > 0 ? item.credit : 0,
      item.running_debt,
      item.status === 'PAID' ? 'Lunas' : item.status === 'PARTIAL' ? 'Sebagian' : 'Belum Lunas'
    ];

    // Format per baris
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };
    row.getCell(7).alignment = { horizontal: 'center' };
    row.getCell(12).alignment = { horizontal: 'center' };

    // Currency formatting
    const numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';
    row.getCell(9).numFmt = numFmt;
    row.getCell(10).numFmt = numFmt;
    row.getCell(11).numFmt = numFmt;

    // Borders
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

  // Baris Total Akuntansi
  const summaryRow = worksheet.getRow(currentRowIdx);
  summaryRow.height = 24;
  summaryRow.getCell(8).value = 'TOTAL MUTASI:';
  summaryRow.getCell(8).font = { bold: true };
  summaryRow.getCell(8).alignment = { horizontal: 'right' };

  summaryRow.getCell(9).value = totalDebit;
  summaryRow.getCell(9).font = { bold: true, color: { argb: 'FF9F1239' } };
  summaryRow.getCell(9).numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

  summaryRow.getCell(10).value = totalCredit;
  summaryRow.getCell(10).font = { bold: true, color: { argb: 'FF065F46' } };
  summaryRow.getCell(10).numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

  const finalOutstandingDebt = Math.max(0, totalDebit - totalCredit);
  summaryRow.getCell(11).value = finalOutstandingDebt;
  summaryRow.getCell(11).font = { bold: true, color: { argb: 'FF0F172A' } };
  summaryRow.getCell(11).numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

  summaryRow.eachCell(cell => {
    cell.border = {
      top: { style: 'medium' },
      bottom: { style: 'double' }
    };
  });

  // Write buffer and download in browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const fileName = `Buku_Besar_Bon_Toko_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}

/**
 * 7. Mengambil Ringkasan Sisa Saldo Bon Belum Lunas Anggota & Tenor Aktif
 * (Digunakan oleh kasir POS sebelum checkout untuk mencegah double-counting)
 */
export async function getMemberUnpaidStoreCreditSummary(
  memberId: string
): Promise<MemberStoreCreditSummary> {
  try {
    if (!memberId) {
      return {
        unpaidBalance: 0,
        activePlan: null,
        existingTenor: 1,
        existingMonthlyInstallment: 0
      };
    }

    // 1. Ambil rencana aktif terbaru milik memberId
    const planTable = supabase.from('store_credit_installment_plans');
    if (!planTable || typeof planTable.select !== 'function') {
      const ledgerDebt = await getMemberActiveDebt(memberId);
      return {
        unpaidBalance: Math.round(ledgerDebt),
        activePlan: null,
        existingTenor: 1,
        existingMonthlyInstallment: Math.round(ledgerDebt)
      };
    }

    let planQuery: any = planTable
      .select('*')
      .eq('member_id', memberId)
      .eq('status', 'active');

    if (planQuery && typeof planQuery.order === 'function') {
      planQuery = planQuery.order('created_at', { ascending: false });
    }
    if (planQuery && typeof planQuery.limit === 'function') {
      planQuery = planQuery.limit(1);
    }

    const { data: plans } = await planQuery;
    const activePlan = plans && plans.length > 0 ? plans[0] : null;

    let scheduleUnpaid = 0;
    let schedules: StoreCreditSchedule[] = [];

    if (activePlan) {
      let schedQuery: any = supabase
        .from('store_credit_schedules')
        .select('*')
        .eq('plan_id', activePlan.id);

      if (schedQuery && typeof schedQuery.order === 'function') {
        schedQuery = schedQuery.order('period_number', { ascending: true });
      }

      const { data: schedData } = await schedQuery;
      schedules = schedData || [];

      scheduleUnpaid = schedules.reduce((sum, s) => {
        const target = sanitizeNumber(s.target_amount);
        const paid = sanitizeNumber(s.paid_amount);
        return sum + Math.max(0, target - paid);
      }, 0);
    }

    // 2. Hitung ledgerDebt untuk transaksi historis tanpa rencana cicilan
    const ledgerDebt = await getMemberActiveDebt(memberId);

    // 3. Tentukan sisa saldo belum lunas
    // Jika activePlan ada dan memiliki sisa jadwal > 0, gunakan scheduleUnpaid; jika tidak ada activePlan, gunakan ledgerDebt.
    let unpaidBalance = 0;
    let existingTenor = 1;
    let existingMonthlyInstallment = 0;

    if (activePlan) {
      unpaidBalance = Math.round(scheduleUnpaid);
      existingTenor = Number(activePlan.tenor_months) || 1;
      existingMonthlyInstallment = Number(activePlan.monthly_installment) || 0;
    } else {
      unpaidBalance = Math.round(ledgerDebt);
      existingTenor = 1;
      existingMonthlyInstallment = unpaidBalance;
    }

    const planWithSchedules: StoreCreditPlanWithSchedules | null = activePlan
      ? { ...activePlan, schedules }
      : null;

    return {
      unpaidBalance,
      activePlan: planWithSchedules,
      existingTenor,
      existingMonthlyInstallment
    };
  } catch (err) {
    console.warn('Error getMemberUnpaidStoreCreditSummary:', err);
    return {
      unpaidBalance: 0,
      activePlan: null,
      existingTenor: 1,
      existingMonthlyInstallment: 0
    };
  }
}

/**
 * 8. Buat Rencana Angsuran Bon Toko Baru atau Ambil Alih (Takeover) Rencana Aktif Sebelumnya
 * Menjamin tidak menyentuh public.loans atau public.loan_schedules.
 */
export async function createOrTakeoverStoreCreditPlan(
  payload: CreateStoreCreditPlanPayload
): Promise<{ success: boolean; planId?: string; plan?: StoreCreditPlanWithSchedules; error?: string }> {
  try {
    if (!payload.memberId) {
      return { success: false, error: 'Member ID wajib diisi.' };
    }
    const newCredit = Number(payload.newCreditAmount);
    if (isNaN(newCredit) || newCredit <= 0) {
      return { success: false, error: 'Nominal bon baru harus lebih dari 0.' };
    }

    const tenorMonths = Math.max(1, Math.round(Number(payload.tenorMonths) || 1));
    const prevBalance = Math.max(0, Math.round(Number(payload.previousUnpaidBalance) || 0));
    const totalConsolidatedDebt = Math.round(prevBalance + newCredit);
    const monthlyInstallment = Math.round(totalConsolidatedDebt / tenorMonths);

    const nowIso = new Date().toISOString();

    // 1. Ubah seluruh rencana aktif lama milik member menjadi superseded
    const plansTable = supabase.from('store_credit_installment_plans');
    if (plansTable && typeof plansTable.update === 'function') {
      await plansTable
        .update({
          status: 'superseded',
          updated_at: nowIso
        })
        .eq('member_id', payload.memberId)
        .eq('status', 'active');
    }

    // 2. Simpan rencana baru dengan status active
    let currentUserId = payload.userId || null;
    if (!currentUserId) {
      try {
        if (supabase.auth && typeof supabase.auth.getUser === 'function') {
          const { data: authData } = await supabase.auth.getUser();
          currentUserId = authData?.user?.id || null;
        }
      } catch {
        currentUserId = null;
      }
    }

    const newPlanData = {
      member_id: payload.memberId,
      latest_sale_id: payload.saleId || null,
      previous_unpaid_balance: prevBalance,
      new_credit_amount: newCredit,
      total_consolidated_debt: totalConsolidatedDebt,
      tenor_months: tenorMonths,
      monthly_installment: monthlyInstallment,
      status: 'active',
      created_by: currentUserId || null,
      created_at: nowIso,
      updated_at: nowIso
    };

    let insertedPlan: any = null;
    if (plansTable && typeof plansTable.insert === 'function') {
      const insertPlanQuery = plansTable.insert(newPlanData);
      if (insertPlanQuery && typeof (insertPlanQuery as any).select === 'function') {
        const sel = (insertPlanQuery as any).select();
        if (sel && typeof sel.single === 'function') {
          const { data, error } = await sel.single();
          if (error) throw error;
          insertedPlan = data;
        } else {
          const { data, error } = await sel;
          if (error) throw error;
          insertedPlan = Array.isArray(data) ? data[0] : data;
        }
      } else {
        const { data, error } = await insertPlanQuery;
        if (error) throw error;
        insertedPlan = data;
      }
    }

    if (!insertedPlan) {
      insertedPlan = { id: `plan-${Date.now()}`, ...newPlanData };
    }

    const planId = insertedPlan.id;

    // 3. Bangkitkan baris jadwal angsuran (store_credit_schedules) mulai bulan berikutnya (+1 s/d +tenorMonths)
    const baseDateStr = payload.baseDate || new Date().toISOString().split('T')[0];
    const parts = baseDateStr.split('-').map((p) => parseInt(p, 10));
    const baseYear = parts[0];
    const baseMonth = parts[1] - 1; // 0-indexed
    const baseDay = parts[2] || 1;

    const schedulesToInsert = [];
    for (let period = 1; period <= tenorMonths; period++) {
      const isLastPeriod = period === tenorMonths;
      // Periode terakhir disesuaikan agar akumulasi target_amount tepat sama dengan totalConsolidatedDebt
      const targetAmount = isLastPeriod
        ? totalConsolidatedDebt - (monthlyInstallment * (tenorMonths - 1))
        : monthlyInstallment;

      const targetMonthOffset = baseMonth + period;
      const targetYear = baseYear + Math.floor(targetMonthOffset / 12);
      const targetMonth0 = ((targetMonthOffset % 12) + 12) % 12;
      const maxDayInMonth = new Date(targetYear, targetMonth0 + 1, 0).getDate();
      const clampedDay = Math.min(baseDay, maxDayInMonth);
      const dueDateStr = `${targetYear}-${String(targetMonth0 + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;

      schedulesToInsert.push({
        plan_id: planId,
        member_id: payload.memberId,
        period_number: period,
        due_year: targetYear,
        due_month: targetMonth0 + 1,
        due_date: dueDateStr,
        target_amount: targetAmount,
        paid_amount: 0,
        status: 'unpaid' as const,
        created_at: nowIso
      });
    }

    let insertedSchedules: any = null;
    const schedTable = supabase.from('store_credit_schedules');
    if (schedTable && typeof schedTable.insert === 'function') {
      const schedQuery = schedTable.insert(schedulesToInsert);
      if (schedQuery && typeof (schedQuery as any).select === 'function') {
        const { data, error } = await (schedQuery as any).select();
        if (error) throw error;
        insertedSchedules = data;
      } else {
        const { error } = await schedQuery;
        if (error) throw error;
      }
    }

    const createdSchedules = insertedSchedules || schedulesToInsert;

    return {
      success: true,
      planId,
      plan: {
        ...insertedPlan,
        schedules: createdSchedules
      }
    };
  } catch (err: any) {
    console.error('Error createOrTakeoverStoreCreditPlan:', err);
    return {
      success: false,
      error: err.message || 'Gagal membuat atau mengambil alih rencana cicilan bon toko.'
    };
  }
}

/**
 * 9. Mengambil Seluruh Rencana Angsuran Bon Toko yang Berstatus Aktif
 * Menggabungkan relasi profil anggota dan jadwal angsurannya.
 */
export async function getActiveStoreCreditPlans(): Promise<StoreCreditPlanWithSchedules[]> {
  try {
    const { data: plans, error } = await supabase
      .from('store_credit_installment_plans')
      .select(`
        *,
        anggota (id, nama, nrp, tanggal_lahir),
        store_credit_schedules (*)
      `)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error getActiveStoreCreditPlans:', error.message);
      return [];
    }

    if (!plans || plans.length === 0) return [];

    return plans.map((p: any) => {
      const rawSchedules = p.store_credit_schedules || p.schedules || [];
      const schedules = [...rawSchedules].sort(
        (a, b) => (a.period_number || 0) - (b.period_number || 0)
      );
      return {
        ...p,
        schedules
      };
    });
  } catch (err) {
    console.warn('Error getActiveStoreCreditPlans:', err);
    return [];
  }
}

/**
 * 10. Pelunasan Jadwal Angsuran Bon Toko
 * Menyinkronkan pembayaran ke store_credit_payments via settleStoreCredit()
 * dan mengubah status rencana menjadi 'paid_off' jika seluruh jadwal telah lunas.
 */
export async function payStoreCreditSchedule(
  payload: PayStoreCreditSchedulePayload
): Promise<{ success: boolean; scheduleId?: string; paymentId?: string; error?: string }> {
  try {
    if (!payload.scheduleId) {
      return { success: false, error: 'ID jadwal angsuran wajib diisi.' };
    }
    const payAmount = Number(payload.amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return { success: false, error: 'Nominal pembayaran harus lebih dari 0.' };
    }

    // 1. Ambil jadwal target
    let schedQuery = supabase
      .from('store_credit_schedules')
      .select('*')
      .eq('id', payload.scheduleId);

    const { data: schedule, error: schedError } = typeof (schedQuery as any).single === 'function'
      ? await (schedQuery as any).single()
      : await schedQuery;

    if (schedError || !schedule) {
      return { success: false, error: 'Jadwal angsuran tidak ditemukan.' };
    }

    // 2. Ambil rencana induk
    let planQuery = supabase
      .from('store_credit_installment_plans')
      .select('*')
      .eq('id', schedule.plan_id);

    const { data: plan, error: planError } = typeof (planQuery as any).single === 'function'
      ? await (planQuery as any).single()
      : await planQuery;

    if (planError || !plan) {
      return { success: false, error: 'Rencana angsuran induk tidak ditemukan.' };
    }

    const currentPaid = sanitizeNumber(schedule.paid_amount);
    const targetAmount = sanitizeNumber(schedule.target_amount);
    const newPaid = currentPaid + payAmount;
    const newStatus: 'paid' | 'partial' = newPaid >= targetAmount ? 'paid' : 'partial';

    const baseReceipt = (payload.receiptNo || `KWT-ANGS-${Date.now()}`).trim();
    const uniqueReceiptNumber = `${baseReceipt}-P${schedule.period_number}-${Math.floor(100 + Math.random() * 900)}`;

    // 3. Langkah A (Pertama): Simpan pembayaran ke store_credit_payments & cash_flow terlebih dahulu
    // agar jika INSERT gagal (mis. constraint unik), jadwal tidak ikut berubah menjadi paid secara diam-diam.
    const trimmedNote = payload.notes?.trim();
    const installmentNote = trimmedNote
      ? /periode/i.test(trimmedNote)
        ? trimmedNote
        : `Angsuran Bon Periode Ke-${schedule.period_number} - ${trimmedNote}`
      : `Angsuran Bon Periode Ke-${schedule.period_number}`;

    const settleRes = await settleStoreCredit({
      memberId: plan.member_id,
      amount: payAmount,
      paymentMethod: payload.paymentMethod || 'potong_gaji',
      referenceNo: uniqueReceiptNumber,
      notes: installmentNote,
      receivedBy: payload.receivedBy
    });

    if (!settleRes.success) {
      throw new Error(settleRes.error || 'Gagal mencatat pembayaran ke buku besar bon toko.');
    }

    // 4. Langkah B (Kedua): Setelah store_credit_payments berhasil tersimpan, baru perbarui jadwal angsuran
    const updateSchedulePayload = {
      paid_amount: newPaid,
      status: newStatus,
      paid_at: new Date().toISOString(),
      receipt_number: uniqueReceiptNumber,
      notes: payload.notes || schedule.notes || null
    };

    const { error: updateSchedError } = await supabase
      .from('store_credit_schedules')
      .update(updateSchedulePayload)
      .eq('id', schedule.id);

    if (updateSchedError) {
      throw updateSchedError;
    }

    // 5. Langkah C (Ketiga): Cek apakah seluruh jadwal pada rencana ini sudah lunas
    const { data: allSchedules } = await supabase
      .from('store_credit_schedules')
      .select('id, status')
      .eq('plan_id', plan.id);

    const isAllPaid =
      allSchedules &&
      allSchedules.length > 0 &&
      allSchedules.every((s: any) =>
        s.id === schedule.id ? newStatus === 'paid' : s.status === 'paid'
      );

    if (isAllPaid) {
      await supabase
        .from('store_credit_installment_plans')
        .update({
          status: 'paid_off',
          updated_at: new Date().toISOString()
        })
        .eq('id', plan.id);
    }

    return {
      success: true,
      scheduleId: schedule.id,
      paymentId: settleRes.paymentId
    };
  } catch (err: any) {
    console.error('Error payStoreCreditSchedule:', err);
    return {
      success: false,
      error: err.message || 'Gagal memproses pembayaran jadwal angsuran bon toko.'
    };
  }
}

