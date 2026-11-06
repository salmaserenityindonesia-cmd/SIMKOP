import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

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
  member_pangkat?: string;
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

export const sanitizeNumber = (val: any, fallback = 0): number => {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
};

/**
 * 1. Mengambil ringkasan metrik global Piutang Bon Toko
 */
export async function getStoreCreditSummary(): Promise<StoreCreditSummary> {
  try {
    // 1. Kueri penjualan dengan paid_credit > 0
    let salesQuery: any = supabase
      .from('sales')
      .select('id, member_id, paid_credit, sale_status');

    if (salesQuery && typeof salesQuery.gt === 'function') {
      salesQuery = salesQuery.gt('paid_credit', 0);
    }

    const { data: rawSales, error: salesError } = await salesQuery;
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
      const { data: rawPayments, error: payError } = await supabase
        .from('store_credit_payments')
        .select('id, sale_id, amount');

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
    validSales.forEach((s: any) => {
      if (s.id) saleMap.set(s.id, s);
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
    const memberMap = new Map<string, { nama: string; nrp: string; pangkat?: string }>();
    if (memberIdSet.size > 0) {
      const { data: members } = await supabase
        .from('anggota')
        .select('id, nama, nrp, pangkat')
        .in('id', Array.from(memberIdSet));

      (members || []).forEach((m: any) => {
        memberMap.set(m.id, {
          nama: m.nama || 'Anggota Tanpa Nama',
          nrp: m.nrp || '-',
          pangkat: m.pangkat || '-'
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
        status: status
      });
    });

    // Tambah baris pelunasan bon
    validPayments.forEach((p: any) => {
      const creditAmt = sanitizeNumber(p.amount);
      const refNo = p.reference_no || `BYR-${p.id.slice(0, 8)}`;
      const pDate = p.payment_date || p.created_at || new Date().toISOString();

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
        status: 'PAID'
      });
    });

    // 8. Urutkan kronologis ascending (waktu terlama ke terbaru)
    unifiedList.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return timeA - timeB;
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

      const mInfo = memberMap.get(memberId) || { nama: 'Anggota Toko', nrp: '-', pangkat: '-' };
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
        member_pangkat: mInfo.pangkat,
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
        is_pos_sale: tx.is_pos_sale
      };

      // Filter Search Query
      if (filters?.searchQuery && filters.searchQuery.trim() !== '') {
        const q = filters.searchQuery.trim().toLowerCase();
        const matchesName = mInfo.nama.toLowerCase().includes(q);
        const matchesNrp = mInfo.nrp.toLowerCase().includes(q);
        const matchesRef = tx.reference_no.toLowerCase().includes(q);
        const matchesNotes = (tx.notes || '').toLowerCase().includes(q);
        const matchesCashier = cashierName.toLowerCase().includes(q);

        if (!matchesName && !matchesNrp && !matchesRef && !matchesNotes && !matchesCashier) {
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

    // Tentukan alokasi nota sales (spesifik atau FIFO)
    let allocations: { saleId: string; amount: number }[] = [];

    if (payload.saleId) {
      allocations = [{ saleId: payload.saleId, amount }];
    } else {
      // Pelunasan global: cari nota sales milik anggota dengan paid_credit > 0 urut FIFO (terlama)
      let salesQuery: any = supabase
        .from('sales')
        .select('id, paid_credit, created_at, sale_status')
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
      existingPayments.forEach((p: any) => {
        if (p.sale_id) {
          const cur = salePaidMap.get(p.sale_id) || 0;
          salePaidMap.set(p.sale_id, cur + sanitizeNumber(p.amount));
        }
      });

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

    // 1. Simpan ke tabel store_credit_payments (HANYA kolom yang sah sesuai skema: sale_id, amount, payment_date, receipt_number, notes, created_by, created_at)
    let firstPaymentId: string | undefined;

    for (let i = 0; i < allocations.length; i++) {
      const alloc = allocations[i];
      const itemRefNo = allocations.length > 1 ? `${refNo}-${i + 1}` : refNo;
      const formattedNotes = `[${methodLabel}] ${payload.notes || 'Pelunasan Bon Toko'}`.trim();

      const insertPayload = {
        sale_id: alloc.saleId,
        amount: Number(alloc.amount),
        payment_date: new Date().toISOString().split('T')[0],
        receipt_number: itemRefNo || null,
        notes: formattedNotes,
        created_by: currentUserId || null,
        created_at: new Date().toISOString()
      };

      const { data: newPayment, error: insertError } = await supabase
        .from('store_credit_payments')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      if (!firstPaymentId && newPayment?.id) {
        firstPaymentId = newPayment.id;
      }
    }

    // 2. Jika metode pembayaran tunai kasir, catat arus kas masuk ke cash_flow
    if (paymentMethod === 'tunai') {
      try {
        await supabase.from('cash_flow').insert({
          direction: 'in',
          amount: amount,
          category: 'pelunasan_bon_toko',
          reference_id: firstPaymentId,
          notes: `Penerimaan Pelunasan Bon Toko (#${refNo})`
        });
      } catch (cfErr) {
        console.warn('Warning catat cash_flow pelunasan bon:', cfErr);
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
    const { data: sales } = await supabase
      .from('sales')
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
    'Pangkat',
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
    { key: 'pangkat', width: 14 },
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
      item.member_pangkat || '-',
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

