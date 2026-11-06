import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export interface ShoppingSavingsSummary {
  totalDeposit: number;
  totalWithdrawal: number;
  currentBalance: number;
  activeMemberCount: number;
  totalTransactions: number;
}

export interface ShoppingLedgerItem {
  id: string;
  member_deposit_id: string;
  transaction_date: string;
  member_id: string;
  member_name: string;
  member_nrp: string;
  transaction_type: 'deposit' | 'withdrawal';
  amount: number;
  debit: number; // Masuk (deposit)
  credit: number; // Keluar (withdrawal)
  running_balance: number; // Saldo berjalan
  member_running_balance: number; // Saldo spesifik anggota terkait saat mutasi terjadi
  reference_no: string;
  description: string;
  notes?: string;
  payment_method?: string;
  cashier_id?: string;
  cashier_name?: string;
  created_at: string;
  is_pos_sale: boolean;
}

export interface ShoppingLedgerFilter {
  memberId?: string;
  startDate?: string;
  endDate?: string;
  transactionType?: 'all' | 'deposit' | 'withdrawal';
  searchQuery?: string;
}

export interface SaleDetailItem {
  id: string;
  product_id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface SaleDetail {
  id: string;
  sale_number: string;
  created_at: string;
  cashier_name: string;
  member_name: string;
  member_nrp?: string;
  subtotal: number;
  discount: number;
  total_amount: number;
  paid_amount: number;
  paid_cash: number;
  paid_deposit: number;
  paid_credit: number;
  payment_scheme: string;
  items: SaleDetailItem[];
}

export const sanitizeNumber = (val: any, fallback = 0): number => {
  const num = Number(val);
  return isNaN(num) ? fallback : num;
};

/**
 * Mengambil daftar ID deposit_types untuk kategori Simpanan Belanja.
 */
export async function getBelanjaDepositTypeIds(): Promise<string[]> {
  try {
    const { data: dTypes, error } = await supabase
      .from('deposit_types')
      .select('id, code, name');

    if (error) {
      console.warn('Gagal memuat deposit_types:', error.message);
      return [];
    }

    if (!dTypes || dTypes.length === 0) return [];

    return dTypes
      .filter(dt => {
        const code = (dt.code || '').toUpperCase();
        const name = (dt.name || '').toLowerCase();
        return code === 'BELANJA' || code === 'SB' || name.includes('belanja');
      })
      .map(dt => dt.id);
  } catch (err: any) {
    console.warn('Exception getBelanjaDepositTypeIds:', err?.message || err);
    return [];
  }
}

/**
 * Sinkronkan penjualan kasir yang belum tercatat di deposit_transactions (backfill orphan sales)
 */
export async function syncOrphanSalesToDepositLedger(): Promise<void> {
  try {
    let salesQuery: any = supabase
      .from('sales')
      .select('id, sale_number, member_id, paid_deposit, cashier_id, created_at');

    if (salesQuery && typeof salesQuery.gt === 'function') {
      salesQuery = salesQuery.gt('paid_deposit', 0);
    }
    if (salesQuery && typeof salesQuery.eq === 'function') {
      salesQuery = salesQuery.eq('sale_status', 'completed');
    }

    const { data: rawSales, error: salesError } = await salesQuery;
    if (salesError || !rawSales || rawSales.length === 0) return;

    const orphanSales = (rawSales || []).filter((s: any) =>
      Number(s.paid_deposit) > 0 && (!s.sale_status || s.sale_status === 'completed')
    );

    if (orphanSales.length === 0) return;

    // Ambil deposit_type_id untuk BELANJA
    let depTypeId: string | null = null;
    const depTypeQuery: any = supabase
      .from('deposit_types')
      .select('id')
      .eq('code', 'BELANJA');

    if (depTypeQuery && typeof depTypeQuery.maybeSingle === 'function') {
      const { data: depType } = await depTypeQuery.maybeSingle();
      if (depType?.id) depTypeId = depType.id;
    } else if (depTypeQuery && typeof depTypeQuery.single === 'function') {
      try {
        const { data: depType } = await depTypeQuery.single();
        if (depType?.id) depTypeId = depType.id;
      } catch {
        // ignore
      }
    } else if (depTypeQuery && typeof depTypeQuery.then === 'function') {
      const res = await depTypeQuery;
      const first = Array.isArray(res?.data) ? res.data[0] : res?.data;
      if (first?.id) depTypeId = first.id;
    }

    if (!depTypeId) {
      const belanjaTypeIds = await getBelanjaDepositTypeIds();
      if (belanjaTypeIds.length > 0) {
        depTypeId = belanjaTypeIds[0];
      }
    }

    if (!depTypeId) return;

    for (const sale of orphanSales) {
      if (!sale.member_id) continue;
      const invNo = sale.sale_number || `INV-${sale.id}`;

      // Cek apakah mutasi dengan reference_no invoice ini sudah ada di deposit_transactions
      let txQuery: any = supabase
        .from('deposit_transactions')
        .select('id')
        .eq('reference_no', invNo);

      let existingTx: any = null;
      if (txQuery && typeof txQuery.maybeSingle === 'function') {
        const res = await txQuery.maybeSingle();
        existingTx = res?.data;
      } else if (txQuery && typeof txQuery.single === 'function') {
        try {
          const res = await txQuery.single();
          existingTx = res?.data;
        } catch {
          // ignore
        }
      } else if (txQuery && typeof txQuery.then === 'function') {
        const res = await txQuery;
        existingTx = Array.isArray(res?.data) ? res.data[0] : res?.data;
      }

      if (!existingTx) {
        // Dapatkan atau buat member_deposits
        let mdQuery: any = supabase
          .from('member_deposits')
          .select('id')
          .eq('member_id', sale.member_id)
          .eq('deposit_type_id', depTypeId);

        let mDep: any = null;
        if (mdQuery && typeof mdQuery.maybeSingle === 'function') {
          const res = await mdQuery.maybeSingle();
          mDep = res?.data;
        } else if (mdQuery && typeof mdQuery.single === 'function') {
          try {
            const res = await mdQuery.single();
            mDep = res?.data;
          } catch {
            // ignore
          }
        } else if (mdQuery && typeof mdQuery.then === 'function') {
          const res = await mdQuery;
          mDep = Array.isArray(res?.data) ? res.data[0] : res?.data;
        }

        if (!mDep) {
          const insQuery: any = supabase
            .from('member_deposits')
            .insert({ member_id: sale.member_id, deposit_type_id: depTypeId });

          if (insQuery && typeof insQuery.select === 'function') {
            const sel = insQuery.select('id');
            if (typeof sel.single === 'function') {
              const res = await sel.single();
              mDep = res?.data;
            } else if (typeof sel.maybeSingle === 'function') {
              const res = await sel.maybeSingle();
              mDep = res?.data;
            } else {
              const res = await sel;
              mDep = Array.isArray(res?.data) ? res.data[0] : res?.data;
            }
          }
        }

        const targetMemberDepId = mDep?.id;
        if (targetMemberDepId) {
          await supabase.from('deposit_transactions').insert({
            member_deposit_id: targetMemberDepId,
            transaction_date: sale.created_at || new Date().toISOString(),
            transaction_type: 'withdrawal',
            amount: Number(sale.paid_deposit),
            description: `Belanja Kasir POS (${invNo})`,
            reference_no: invNo,
            payment_method: 'potong_simpanan_belanja',
            notes: 'Sinkronisasi transaksi penjualan POS',
            created_by: sale.cashier_id,
            created_at: sale.created_at || new Date().toISOString()
          });
        }
      }
    }
  } catch (err: any) {
    console.warn('Exception syncOrphanSalesToDepositLedger:', err?.message || err);
  }
}

/**
 * 1. Mengambil ringkasan statistik Simpanan Belanja Koperasi
 */
export async function getShoppingSavingsSummary(): Promise<ShoppingSavingsSummary> {
  try {
    await syncOrphanSalesToDepositLedger();

    const belanjaTypeIds = await getBelanjaDepositTypeIds();
    if (belanjaTypeIds.length === 0) {
      return {
        totalDeposit: 0,
        totalWithdrawal: 0,
        currentBalance: 0,
        activeMemberCount: 0,
        totalTransactions: 0
      };
    }

    // Ambil rekening member_deposits untuk simpanan belanja
    const { data: memberDeposits, error: mdError } = await supabase
      .from('member_deposits')
      .select('id, member_id')
      .in('deposit_type_id', belanjaTypeIds);

    if (mdError) {
      console.warn('Gagal memuat member_deposits untuk ringkasan belanja:', mdError.message);
      return { totalDeposit: 0, totalWithdrawal: 0, currentBalance: 0, activeMemberCount: 0, totalTransactions: 0 };
    }

    if (!memberDeposits || memberDeposits.length === 0) {
      return { totalDeposit: 0, totalWithdrawal: 0, currentBalance: 0, activeMemberCount: 0, totalTransactions: 0 };
    }

    const mdIds = memberDeposits.map(md => md.id);

    // Kueri seluruh deposit_transactions belanja
    const { data: transactions, error: txError } = await supabase
      .from('deposit_transactions')
      .select('member_deposit_id, transaction_type, amount')
      .in('member_deposit_id', mdIds);

    if (txError) {
      console.warn('Gagal memuat deposit_transactions untuk ringkasan belanja:', txError.message);
      return { totalDeposit: 0, totalWithdrawal: 0, currentBalance: 0, activeMemberCount: 0, totalTransactions: 0 };
    }

    let totalDeposit = 0;
    let totalWithdrawal = 0;
    const membersWithTx = new Set<string>();

    const mdToMemberMap = new Map<string, string>();
    memberDeposits.forEach(md => mdToMemberMap.set(md.id, md.member_id));

    (transactions || []).forEach(tx => {
      const amt = sanitizeNumber(tx.amount);
      if (tx.transaction_type === 'deposit') {
        totalDeposit += amt;
      } else if (tx.transaction_type === 'withdrawal') {
        totalWithdrawal += amt;
      }
      const memberId = mdToMemberMap.get(tx.member_deposit_id);
      if (memberId) membersWithTx.add(memberId);
    });

    // Validasi tambahan: kueri sales dengan paid_deposit > 0 agar total belanja kasir POS selalu akurat
    try {
      let salesQuery: any = supabase
        .from('sales')
        .select('id, sale_number, member_id, paid_deposit, sale_status');

      if (salesQuery && typeof salesQuery.gt === 'function') {
        salesQuery = salesQuery.gt('paid_deposit', 0);
      }

      const { data: posSales } = await salesQuery;
      const validSales = (posSales || []).filter((s: any) =>
        Number(s.paid_deposit) > 0 &&
        (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')
      );

      let salesDepositTotal = 0;
      validSales.forEach((s: any) => {
        salesDepositTotal += Number(s.paid_deposit);
        if (s.member_id) membersWithTx.add(s.member_id);
      });

      if (salesDepositTotal > totalWithdrawal) {
        totalWithdrawal = salesDepositTotal;
      }
    } catch {
      // ignore
    }

    return {
      totalDeposit,
      totalWithdrawal,
      currentBalance: totalDeposit - totalWithdrawal,
      activeMemberCount: membersWithTx.size,
      totalTransactions: (transactions || []).length
    };
  } catch (err: any) {
    console.warn('Exception getShoppingSavingsSummary:', err?.message || err);
    return {
      totalDeposit: 0,
      totalWithdrawal: 0,
      currentBalance: 0,
      activeMemberCount: 0,
      totalTransactions: 0
    };
  }
}

/**
 * 2. Mengambil Buku Besar / Mutasi Simpanan Belanja dengan Running Balance
 */
export async function getMemberShoppingLedger(
  filters?: ShoppingLedgerFilter
): Promise<{ items: ShoppingLedgerItem[]; openingBalance: number; totalItems: number }> {
  try {
    await syncOrphanSalesToDepositLedger();

    const belanjaTypeIds = await getBelanjaDepositTypeIds();
    if (belanjaTypeIds.length === 0) {
      return { items: [], openingBalance: 0, totalItems: 0 };
    }

    // 1. Ambil member_deposits belanja
    let mdQuery = supabase
      .from('member_deposits')
      .select('id, member_id, deposit_type_id')
      .in('deposit_type_id', belanjaTypeIds);

    if (filters?.memberId) {
      mdQuery = mdQuery.eq('member_id', filters.memberId);
    }

    const { data: memberDeposits, error: mdError } = await mdQuery;
    if (mdError) {
      console.warn('Error fetching member_deposits:', mdError.message);
      return { items: [], openingBalance: 0, totalItems: 0 };
    }

    const mdList = memberDeposits || [];
    const mdIds = mdList.map(md => md.id);
    const mdMap = new Map<string, string>(); // md.id -> member_id
    const memberIdSet = new Set<string>();
    mdList.forEach(md => {
      mdMap.set(md.id, md.member_id);
      if (md.member_id) memberIdSet.add(md.member_id);
    });

    // Ambil data penjualan POS dengan paid_deposit > 0 untuk menjamin nota belanja kasir selalu tampil
    let posSales: any[] = [];
    try {
      let salesQuery: any = supabase
        .from('sales')
        .select('id, sale_number, member_id, cashier_id, paid_deposit, total_amount, payment_scheme, sale_status, created_at');

      if (salesQuery && typeof salesQuery.gt === 'function') {
        salesQuery = salesQuery.gt('paid_deposit', 0);
      }
      if (filters?.memberId && salesQuery && typeof salesQuery.eq === 'function') {
        salesQuery = salesQuery.eq('member_id', filters.memberId);
      }

      const { data: sData } = await salesQuery;
      posSales = (sData || []).filter((s: any) =>
        Number(s.paid_deposit) > 0 &&
        (!filters?.memberId || s.member_id === filters.memberId) &&
        (!s.sale_status || s.sale_status === 'completed' || s.sale_status === 'success')
      );
    } catch (sErr) {
      console.warn('Warning fetching sales for shopping ledger:', sErr);
    }

    posSales.forEach(s => {
      if (s.member_id) memberIdSet.add(s.member_id);
    });

    // 2. Ambil data anggota (nama & nrp)
    const memberMap = new Map<string, { nama: string; nrp: string }>();
    if (memberIdSet.size > 0) {
      const { data: members } = await supabase
        .from('anggota')
        .select('id, nama, nrp')
        .in('id', Array.from(memberIdSet));

      (members || []).forEach(m => {
        memberMap.set(m.id, {
          nama: m.nama || 'Anggota Tanpa Nama',
          nrp: m.nrp || '-'
        });
      });
    }

    // 3. Ambil data pengelola / kasir
    const cashierMap = new Map<string, string>();
    try {
      const { data: pengelolaList } = await supabase
        .from('pengelola')
        .select('id, nama');
      (pengelolaList || []).forEach(p => {
        cashierMap.set(p.id, p.nama);
      });
    } catch {
      // ignore
    }

    // 4. Kueri deposit_transactions untuk akun-akun ini secara aman tanpa kolom yang tidak ada di schema
    let txData: any[] = [];
    if (mdIds.length > 0) {
      try {
        const txQuery: any = supabase
          .from('deposit_transactions')
          .select('*')
          .in('member_deposit_id', mdIds);

        const orderedQuery = typeof txQuery.order === 'function'
          ? txQuery.order('created_at', { ascending: true })
          : txQuery;

        const { data: rawTx, error: txError } = await orderedQuery;
        if (txError) {
          console.warn('Warning select * on deposit_transactions:', txError.message);
          const { data: fallbackTx } = await supabase
            .from('deposit_transactions')
            .select('id, member_deposit_id, transaction_type, amount, description')
            .in('member_deposit_id', mdIds);
          txData = fallbackTx || [];
        } else {
          txData = rawTx || [];
        }
      } catch (err: any) {
        console.warn('Exception querying deposit_transactions:', err?.message || err);
        txData = [];
      }
    }

    // Gabungkan deposit_transactions dengan posSales agar nota kasir belanja tidak pernah hilang
    const matchedInvoiceSet = new Set<string>();
    const rawItems: {
      id: string;
      member_deposit_id: string;
      member_id: string;
      transaction_date: string;
      transaction_type: 'deposit' | 'withdrawal';
      amount: number;
      reference_no: string;
      description: string;
      notes: string;
      payment_method: string;
      cashier_id?: string;
      created_at: string;
      is_pos_sale: boolean;
    }[] = [];

    for (const tx of txData) {
      const memberId = mdMap.get(tx.member_deposit_id) || '';
      const isDeposit = tx.transaction_type === 'deposit';
      const amt = sanitizeNumber(tx.amount);
      const refNo = tx.reference_no || '';
      const desc = tx.description || '';
      const notes = tx.notes || '';
      const payMethod = tx.payment_method || (isDeposit ? 'Manual / Potong Gaji' : 'potong_simpanan_belanja');

      let isPosSale = (
        refNo.toUpperCase().startsWith('INV-') ||
        refNo.toUpperCase().startsWith('POS-') ||
        payMethod === 'potong_simpanan_belanja' ||
        desc.toLowerCase().includes('kasir pos') ||
        desc.toLowerCase().includes('belanja toko') ||
        desc.toLowerCase().includes('nota #')
      );

      const matchingSale = posSales.find(s =>
        (s.sale_number && refNo && s.sale_number.toUpperCase() === refNo.toUpperCase()) ||
        (s.sale_number && desc.includes(s.sale_number)) ||
        (s.id && notes.includes(s.id))
      );

      let effectiveRefNo = refNo;
      let effectiveCashierId = tx.created_by;

      if (matchingSale) {
        isPosSale = true;
        effectiveRefNo = matchingSale.sale_number || effectiveRefNo;
        effectiveCashierId = matchingSale.cashier_id || effectiveCashierId;
        matchedInvoiceSet.add(matchingSale.sale_number || matchingSale.id);
      } else if (refNo) {
        matchedInvoiceSet.add(refNo);
      }

      const txDateStr = tx.transaction_date || tx.created_at || (tx.for_year && tx.for_month ? `${tx.for_year}-${String(tx.for_month).padStart(2, '0')}-01T00:00:00Z` : new Date().toISOString());

      rawItems.push({
        id: tx.id || `tx-${Math.random()}`,
        member_deposit_id: tx.member_deposit_id,
        member_id: memberId,
        transaction_date: txDateStr,
        transaction_type: isDeposit ? 'deposit' : 'withdrawal',
        amount: amt,
        reference_no: effectiveRefNo || (isDeposit ? 'SETORAN' : 'BELANJA'),
        description: desc || (isDeposit ? 'Setoran Simpanan Belanja' : 'Belanja Toko di Kasir POS'),
        notes: notes,
        payment_method: payMethod,
        cashier_id: effectiveCashierId,
        created_at: tx.created_at || txDateStr,
        is_pos_sale: isPosSale
      });
    }

    // Sisipkan nota posSales yang belum ada di deposit_transactions
    for (const sale of posSales) {
      const invNo = sale.sale_number || `INV-${sale.id}`;
      if (matchedInvoiceSet.has(invNo) || matchedInvoiceSet.has(sale.id)) {
        continue;
      }

      const saleDate = sale.created_at || new Date().toISOString();
      rawItems.push({
        id: `sale-${sale.id}`,
        member_deposit_id: '',
        member_id: sale.member_id || '',
        transaction_date: saleDate,
        transaction_type: 'withdrawal',
        amount: sanitizeNumber(sale.paid_deposit),
        reference_no: invNo,
        description: `Belanja Kasir POS (${invNo})`,
        notes: `Transaksi belanja kasir POS nota #${invNo}`,
        payment_method: 'potong_simpanan_belanja',
        cashier_id: sale.cashier_id,
        created_at: saleDate,
        is_pos_sale: true
      });
      matchedInvoiceSet.add(invNo);
    }

    // Urutkan kronologis ascending
    rawItems.sort((a, b) => {
      const timeA = new Date(a.transaction_date).getTime();
      const timeB = new Date(b.transaction_date).getTime();
      return timeA - timeB;
    });

    // 5. Kalkulasi Saldo Berjalan (Running Balance) secara kronologis
    let runningBalance = 0;
    const memberBalanceMap = new Map<string, number>();
    const processedList: ShoppingLedgerItem[] = [];

    // Track opening balance if startDate is specified
    let openingBalance = 0;
    const startFilterTime = filters?.startDate
      ? (filters.startDate.includes('T') ? new Date(filters.startDate).getTime() : new Date(`${filters.startDate}T00:00:00`).getTime())
      : null;
    const endFilterTime = filters?.endDate
      ? (filters.endDate.includes('T') ? new Date(filters.endDate).getTime() : new Date(`${filters.endDate}T23:59:59.999`).getTime())
      : null;

    for (const tx of rawItems) {
      const amt = tx.amount;
      const isDeposit = tx.transaction_type === 'deposit';
      const delta = isDeposit ? amt : -amt;

      runningBalance += delta;

      const memberId = tx.member_id;
      const prevMemberBal = memberBalanceMap.get(memberId) || 0;
      const currentMemberBal = prevMemberBal + delta;
      memberBalanceMap.set(memberId, currentMemberBal);

      const txTime = new Date(tx.transaction_date).getTime();

      // Opening balance check: transactions before startDate
      if (startFilterTime && txTime < startFilterTime) {
        openingBalance += delta;
        continue;
      }

      // Check endDate boundary
      if (endFilterTime && txTime > endFilterTime) {
        continue;
      }

      const memberInfo = memberMap.get(memberId) || { nama: 'Anggota Tidak Dikenal', nrp: '-' };
      const cashierName = (tx.cashier_id && cashierMap.get(tx.cashier_id)) || 'Kasir Toko / Petugas';

      const item: ShoppingLedgerItem = {
        id: tx.id,
        member_deposit_id: tx.member_deposit_id,
        transaction_date: tx.transaction_date,
        member_id: memberId,
        member_name: memberInfo.nama,
        member_nrp: memberInfo.nrp,
        transaction_type: isDeposit ? 'deposit' : 'withdrawal',
        amount: amt,
        debit: isDeposit ? amt : 0,
        credit: !isDeposit ? amt : 0,
        running_balance: runningBalance,
        member_running_balance: currentMemberBal,
        reference_no: tx.reference_no,
        description: tx.description,
        notes: tx.notes,
        payment_method: tx.payment_method,
        cashier_id: tx.cashier_id,
        cashier_name: cashierName,
        created_at: tx.created_at,
        is_pos_sale: tx.is_pos_sale
      };

      // Filter jenis mutasi
      if (filters?.transactionType && filters.transactionType !== 'all') {
        if (filters.transactionType !== tx.transaction_type) {
          continue;
        }
      }

      // Filter search query
      if (filters?.searchQuery && filters.searchQuery.trim() !== '') {
        const q = filters.searchQuery.trim().toLowerCase();
        const matchesName = memberInfo.nama.toLowerCase().includes(q);
        const matchesNrp = memberInfo.nrp.toLowerCase().includes(q);
        const matchesRef = tx.reference_no.toLowerCase().includes(q);
        const matchesDesc = tx.description.toLowerCase().includes(q);
        const matchesCashier = cashierName.toLowerCase().includes(q);

        if (!matchesName && !matchesNrp && !matchesRef && !matchesDesc && !matchesCashier) {
          continue;
        }
      }

      processedList.push(item);
    }

    return {
      items: processedList,
      openingBalance,
      totalItems: processedList.length
    };
  } catch (err: any) {
    console.warn('Exception getMemberShoppingLedger:', err?.message || err);
    return { items: [], openingBalance: 0, totalItems: 0 };
  }
}

/**
 * 3. Mengambil rincian struk POS saat admin klik No. Bukti / Struk Kasir
 */
export async function getSaleDetailByInvoice(invoiceNumber: string): Promise<SaleDetail | null> {
  try {
    if (!invoiceNumber) return null;

    // Bersihkan nomor invoice jika ada spasi
    const trimmed = invoiceNumber.trim();

    // 1. Cari penjualan di tabel sales
    let sale: any = null;
    const { data: saleByNumber, error: saleError } = await supabase
      .from('sales')
      .select('*')
      .eq('sale_number', trimmed)
      .maybeSingle();

    if (saleByNumber) {
      sale = saleByNumber;
    } else {
      const { data: saleById } = await supabase
        .from('sales')
        .select('*')
        .eq('id', trimmed.replace(/^sale-/, ''))
        .maybeSingle();
      sale = saleById;
    }

    if (!sale) {
      console.warn('Data penjualan tidak ditemukan:', saleError?.message);
      return null;
    }

    // 2. Ambil detail produk di sale_items
    const { data: items, error: itemsError } = await supabase
      .from('sale_items')
      .select('id, product_id, product_name, quantity, unit_price, subtotal')
      .eq('sale_id', sale.id);

    if (itemsError) {
      console.warn('Error fetching sale_items:', itemsError.message);
    }

    // 3. Ambil nama kasir
    let cashierName = 'Kasir Toko';
    if (sale.cashier_id) {
      const { data: cashier } = await supabase
        .from('pengelola')
        .select('nama')
        .eq('id', sale.cashier_id)
        .maybeSingle();
      if (cashier?.nama) cashierName = cashier.nama;
    }

    // 4. Ambil nama anggota
    let memberName = 'Anggota Toko';
    let memberNrp = '-';
    if (sale.member_id) {
      const { data: member } = await supabase
        .from('anggota')
        .select('nama, nrp')
        .eq('id', sale.member_id)
        .maybeSingle();
      if (member) {
        memberName = member.nama || memberName;
        memberNrp = member.nrp || memberNrp;
      }
    }

    const saleItems: SaleDetailItem[] = (items || []).map(i => ({
      id: i.id,
      product_id: i.product_id,
      product_name: i.product_name || 'Produk Kasir',
      quantity: sanitizeNumber(i.quantity, 1),
      unit_price: sanitizeNumber(i.unit_price, 0),
      subtotal: sanitizeNumber(i.subtotal, sanitizeNumber(i.quantity, 1) * sanitizeNumber(i.unit_price, 0))
    }));

    return {
      id: sale.id,
      sale_number: sale.sale_number,
      created_at: sale.created_at,
      cashier_name: cashierName,
      member_name: memberName,
      member_nrp: memberNrp,
      subtotal: sanitizeNumber(sale.subtotal),
      discount: sanitizeNumber(sale.discount),
      total_amount: sanitizeNumber(sale.total_amount),
      paid_amount: sanitizeNumber(sale.paid_amount),
      paid_cash: sanitizeNumber(sale.paid_cash),
      paid_deposit: sanitizeNumber(sale.paid_deposit),
      paid_credit: sanitizeNumber(sale.paid_credit),
      payment_scheme: sale.payment_scheme || 'deposit',
      items: saleItems
    };
  } catch (err: any) {
    console.warn('Exception getSaleDetailByInvoice:', err?.message || err);
    return null;
  }
}

/**
 * 4. Ekspor Buku Besar Simpanan Belanja ke File Excel (.xlsx) dengan Format Akuntansi Standar
 */
export async function exportShoppingLedgerToExcel(
  items: ShoppingLedgerItem[],
  filterInfo?: {
    memberName?: string;
    startDate?: string;
    endDate?: string;
    transactionTypeLabel?: string;
  }
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIMKOP - Sistem Informasi Manajemen Koperasi';
  workbook.lastModifiedBy = 'Admin Simpan Pinjam';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Buku Besar Belanja', {
    views: [{ showGridLines: true }]
  });

  // Judul Laporan & Info Header
  worksheet.mergeCells('A1:J1');
  const titleRow = worksheet.getCell('A1');
  titleRow.value = 'BUKU BESAR PEMBANTU SIMPANAN BELANJA';
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleRow.alignment = { horizontal: 'center', vertical: 'middle' };

  worksheet.mergeCells('A2:J2');
  const subtitleRow = worksheet.getCell('A2');
  subtitleRow.value = 'Koperasi Pegawai Republik Indonesia (KPRI)';
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

  worksheet.getCell('A6').value = 'Tanggal Unduh:';
  worksheet.getCell('A6').font = { bold: true };
  worksheet.getCell('B6').value = new Date().toLocaleString('id-ID');

  // Set Definisi Kolom Tabel
  worksheet.getRow(8).values = [
    'No',
    'Tanggal & Waktu',
    'NRP',
    'Nama Anggota',
    'Jenis Mutasi',
    'No. Bukti / Struk',
    'Uraian Transaksi',
    'Kasir / Petugas',
    'Masuk (Setoran)',
    'Keluar (Belanja POS)',
    'Saldo Berjalan'
  ];

  // Header Styling
  const headerRow = worksheet.getRow(8);
  headerRow.height = 26;
  headerRow.eachCell(cell => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF065F46' } // Emerald Dark Green
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
    { key: 'name', width: 28 },
    { key: 'type', width: 18 },
    { key: 'ref', width: 22 },
    { key: 'desc', width: 35 },
    { key: 'cashier', width: 20 },
    { key: 'debit', width: 18 },
    { key: 'credit', width: 18 },
    { key: 'balance', width: 20 }
  ];

  let totalDebit = 0;
  let totalCredit = 0;
  let currentRowIdx = 9;

  items.forEach((item, index) => {
    totalDebit += item.debit;
    totalCredit += item.credit;

    const row = worksheet.getRow(currentRowIdx);
    row.values = [
      index + 1,
      new Date(item.transaction_date).toLocaleString('id-ID'),
      item.member_nrp,
      item.member_name,
      item.transaction_type === 'deposit' ? 'Setoran Simpanan' : 'Belanja Toko POS',
      item.reference_no,
      item.description,
      item.cashier_name || '-',
      item.debit > 0 ? item.debit : 0,
      item.credit > 0 ? item.credit : 0,
      item.running_balance
    ];

    // Format per baris
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).alignment = { horizontal: 'center' };

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
  summaryRow.getCell(7).value = 'TOTAL MUTASI:';
  summaryRow.getCell(7).font = { bold: true };
  summaryRow.getCell(7).alignment = { horizontal: 'right' };

  summaryRow.getCell(9).value = totalDebit;
  summaryRow.getCell(9).font = { bold: true, color: { argb: 'FF065F46' } };
  summaryRow.getCell(9).numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

  summaryRow.getCell(10).value = totalCredit;
  summaryRow.getCell(10).font = { bold: true, color: { argb: 'FF1E40AF' } };
  summaryRow.getCell(10).numFmt = '_("Rp"* #,##0_);_("Rp"* (#,##0);_("Rp"* "-"_);_(@_)';

  const finalBalance = items.length > 0 ? items[items.length - 1].running_balance : 0;
  summaryRow.getCell(11).value = finalBalance;
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
  const fileName = `Buku_Besar_Simpanan_Belanja_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.download = fileName;
  a.click();
  window.URL.revokeObjectURL(url);
}

