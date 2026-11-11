import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';

export interface DepositTypeOption {
  id: string;
  code: string;
  name: string;
  can_be_withdrawn?: boolean;
}

export async function getWithdrawableDepositTypes(): Promise<DepositTypeOption[]> {
  const { data, error } = await supabase
    .from('deposit_types')
    .select('id, code, name, can_be_withdrawn')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching deposit types for filter:', error);
    return [];
  }
  return data || [];
}

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
  transaction_type?: string;
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
  depositTypeCode?: string; // 'all' | 'TERMINATION' | 'lebaran' | 'belanja' | 'pokok_wajib' | dynamic deposit code or ID
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
 * Memeriksa apakah suatu jenis simpanan atau keterangan transaksi merujuk pada Simpanan Lebaran / THR
 */
export const isLebaran = (code?: string, name?: string, description?: string, notes?: string): boolean => {
  const c = (code || '').toUpperCase().trim();
  const n = (name || '').toUpperCase().trim();
  const d = (description || '').toUpperCase().trim();
  const nt = (notes || '').toUpperCase().trim();

  return (
    c.includes('LEBARAN') ||
    c.includes('THR') ||
    c === 'SL' ||
    c === 'SIMPANAN_LEBARAN' ||
    n.includes('LEBARAN') ||
    n.includes('HARI RAYA') ||
    n.includes('THR') ||
    d.includes('LEBARAN') ||
    d.includes('HARI RAYA') ||
    d.includes('THR') ||
    nt.includes('LEBARAN') ||
    nt.includes('HARI RAYA') ||
    nt.includes('THR')
  );
};

/**
 * Memeriksa apakah suatu jenis simpanan atau keterangan transaksi merujuk pada Simpanan Belanja Bulanan
 */
export const isBelanja = (
  code?: string,
  name?: string,
  description?: string,
  notes?: string,
  paymentMethod?: string,
  referenceNo?: string
): boolean => {
  const c = (code || '').toUpperCase().trim();
  const n = (name || '').toUpperCase().trim();
  const d = (description || '').toUpperCase().trim();
  const nt = (notes || '').toUpperCase().trim();
  const pm = (paymentMethod || '').toLowerCase().trim();
  const ref = (referenceNo || '').toUpperCase().trim();

  return (
    c.includes('BELANJA') ||
    c === 'SB' ||
    n.includes('BELANJA') ||
    d.includes('BELANJA') ||
    nt.includes('BELANJA') ||
    pm.includes('belanja') ||
    pm === 'potong_simpanan_belanja' ||
    ref.startsWith('INV-') ||
    d.includes('KASIR POS') ||
    nt.includes('BELANJA TOKO')
  );
};

/**
 * Mengkategorikan kode / nama jenis simpanan ke dalam bucket utama
 */
export function categorizeDepositType(
  code?: string,
  name?: string,
  description?: string,
  notes?: string
): 'lebaran' | 'belanja' | 'pokok_wajib' | 'sukarela_lainnya' {
  if (isLebaran(code, name, description, notes)) {
    return 'lebaran';
  }

  if (isBelanja(code, name, description, notes)) {
    return 'belanja';
  }

  const c = (code || '').toUpperCase().trim();
  const n = (name || '').toLowerCase().trim();
  const d = (description || '').toLowerCase().trim();
  const nt = (notes || '').toLowerCase().trim();

  if (
    c.includes('POKOK') ||
    c.includes('WAJIB') ||
    c === 'SP' ||
    c === 'SW' ||
    n.includes('pokok') ||
    n.includes('wajib') ||
    d.includes('pokok') ||
    d.includes('wajib')
  ) {
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
      .order('created_at', { ascending: false });

    const filterDepositCode = (filters?.depositTypeCode || '').trim().toUpperCase();
    if (filterDepositCode === 'TERMINATION') {
      query = query.eq('transaction_type', 'termination');
    } else if (filterDepositCode && filterDepositCode !== 'ALL') {
      query = query.eq('transaction_type', 'withdrawal');
    } else {
      query = query.in('transaction_type', ['withdrawal', 'termination']);
    }

    // Abaikan filter rentang tanggal jika filter periode 'Semua Waktu' (startDate/endDate kosong)
    if (filters?.startDate && filters.startDate.trim() !== '') {
      const startIso = filters.startDate.includes('T') ? filters.startDate : `${filters.startDate}T00:00:00.000Z`;
      query = query.gte('created_at', startIso);
    }
    if (filters?.endDate && filters.endDate.trim() !== '') {
      const endIso = filters.endDate.includes('T') ? filters.endDate : `${filters.endDate}T23:59:59.999Z`;
      query = query.lte('created_at', endIso);
    }

    let rawTxList: any[] = [];
    const { data: nestedData, error: txError } = await query;

    if (txError) {
      console.warn('Gagal memuat deposit_transactions withdrawal:', txError.message);
      // Fallback: direct select on deposit_transactions
      let fbQuery: any = supabase
        .from('deposit_transactions')
        .select('*');

      if (filterDepositCode === 'TERMINATION') {
        fbQuery = fbQuery.eq('transaction_type', 'termination');
      } else if (filterDepositCode && filterDepositCode !== 'ALL') {
        fbQuery = fbQuery.eq('transaction_type', 'withdrawal');
      } else {
        fbQuery = fbQuery.in('transaction_type', ['withdrawal', 'termination']);
      }

      if (filters?.startDate && filters.startDate.trim() !== '') {
        const startIso = filters.startDate.includes('T') ? filters.startDate : `${filters.startDate}T00:00:00.000Z`;
        fbQuery = fbQuery.gte('created_at', startIso);
      }
      if (filters?.endDate && filters.endDate.trim() !== '') {
        const endIso = filters.endDate.includes('T') ? filters.endDate : `${filters.endDate}T23:59:59.999Z`;
        fbQuery = fbQuery.lte('created_at', endIso);
      }
      if (fbQuery.order) {
        fbQuery = fbQuery.order('created_at', { ascending: false });
      }

      const { data: fbData, error: fbErr } = await fbQuery;
      if (fbErr) {
        console.warn('Fallback kueri deposit_transactions juga gagal:', fbErr.message);
        return [];
      }
      rawTxList = fbData || [];
    } else {
      rawTxList = nestedData || [];
    }

    if (!rawTxList || rawTxList.length === 0) {
      return [];
    }

    // Resolusi member_deposits yang belum ter-join secara lengkap
    const unjoinedMdIds = rawTxList
      .filter(tx => {
        const md = Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits;
        const mem = Array.isArray(md?.anggota) ? md.anggota[0] : md?.anggota;
        return (!mem || !(mem.nama || mem.name)) && tx.member_deposit_id;
      })
      .map(tx => tx.member_deposit_id);

    const mdLookup = new Map<string, any>();
    if (unjoinedMdIds.length > 0) {
      try {
        const { data: mdRecords } = await supabase
          .from('member_deposits')
          .select(`
            id,
            member_id,
            deposit_type_id,
            deposit_types (id, name, code)
          `)
          .in('id', Array.from(new Set(unjoinedMdIds)));

        if (mdRecords) {
          mdRecords.forEach(md => mdLookup.set(md.id, md));
        }
      } catch (e) {
        console.warn('Gagal memuat unjoined member_deposits:', e);
      }
    }

    // Ambil daftar seluruh anggota untuk lookup profil yang andal
    let allAnggotaList: any[] = [];
    try {
      const { data: aList, error: aErr } = await supabase
        .from('anggota')
        .select('*');
      if (aErr) {
        console.warn('Gagal memuat allAnggotaList:', aErr.message);
      }
      allAnggotaList = aList || [];
    } catch (_) {}

    // Identifikasi transaksi POS untuk cross-lookup ke tabel sales (berdasarkan sale_number atau reference_no)
    const posTxRefNos = Array.from(new Set(
      rawTxList
        .map(tx => (tx.reference_no || '').trim())
        .filter(ref => ref && ref !== '-')
    ));

    const salesMemberMap = new Map<string, string>(); // sale_number / ID -> member_id
    if (posTxRefNos.length > 0) {
      try {
        let salesData: any[] = [];
        const { data: sRows, error: sErr } = await supabase
          .from('sales')
          .select('id, sale_number, member_id')
          .in('sale_number', posTxRefNos);

        if (!sErr && sRows && sRows.length > 0) {
          salesData = sRows;
        } else {
          // Fallback tanpa filter kolom ketat
          const { data: fbSales } = await supabase
            .from('sales')
            .select('*')
            .in('sale_number', posTxRefNos);
          if (fbSales) salesData = fbSales;
        }

        salesData.forEach((s: any) => {
          const mId = s.member_id || (Array.isArray(s.anggota) ? s.anggota[0]?.id : s.anggota?.id);
          const num = s.sale_number || s.invoice_number;
          if (mId) {
            if (num) {
              const strNum = String(num).trim();
              salesMemberMap.set(strNum, mId);
              salesMemberMap.set(strNum.toUpperCase(), mId);
              salesMemberMap.set(strNum.replace(/^INV-/, ''), mId);
            }
            if (s.id) {
              salesMemberMap.set(s.id, mId);
              salesMemberMap.set(`sale-${s.id}`, mId);
            }
          }
        });
      } catch (e) {
        console.warn('Gagal memuat cross-lookup sales:', e);
      }
    }

    // Ekstrak kemungkinan UUID penjualan dari keterangan atau catatan transaksi (misal: "Transaksi penjualan POS ID: <uuid>")
    const notesSaleIds = new Set<string>();
    rawTxList.forEach(tx => {
      const fullNotes = `${tx.notes || ''} ${tx.description || ''}`;
      const uuidMatch = fullNotes.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (uuidMatch && !salesMemberMap.has(uuidMatch[0])) {
        notesSaleIds.add(uuidMatch[0]);
      }
    });

    if (notesSaleIds.size > 0) {
      try {
        const { data: salesByIds } = await supabase
          .from('sales')
          .select('id, sale_number, member_id')
          .in('id', Array.from(notesSaleIds));

        (salesByIds || []).forEach((s: any) => {
          const mId = s.member_id || (Array.isArray(s.anggota) ? s.anggota[0]?.id : s.anggota?.id);
          if (mId) {
            if (s.id) salesMemberMap.set(s.id, mId);
            const num = s.sale_number || s.invoice_number;
            if (num) {
              salesMemberMap.set(String(num).trim(), mId);
              salesMemberMap.set(String(num).trim().toUpperCase(), mId);
            }
          }
        });
      } catch (_) {}
    }

    // Helper pembanding ID yang tangguh (case & whitespace insensitive)
    const matchId = (id1?: any, id2?: any): boolean => {
      if (!id1 || !id2) return false;
      return String(id1).trim().toLowerCase() === String(id2).trim().toLowerCase();
    };

    // Pastikan semua member_id yang ditemukan sudah ada di allAnggotaList
    const targetMemberIds = new Set<string>();
    rawTxList.forEach(tx => {
      const md = (Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits) || mdLookup.get(tx.member_deposit_id);
      if (md?.member_id) targetMemberIds.add(md.member_id);
    });
    salesMemberMap.forEach(mId => targetMemberIds.add(mId));

    const missingMemberIds = Array.from(targetMemberIds).filter(
      id => id && !allAnggotaList.some(a => matchId(a.id, id))
    );

    if (missingMemberIds.length > 0) {
      try {
        const { data: extraMembers } = await supabase
          .from('anggota')
          .select('*')
          .in('id', missingMemberIds);
        if (extraMembers) {
          allAnggotaList.push(...extraMembers);
        }
      } catch (_) {}
    }

    // 1. Ekstrak data mentah transaksi dan kumpulkan member_id untuk cross-check pinjaman
    const memberIds = new Set<string>();
    const preliminaryItems: Array<Omit<WithdrawalLedgerItem, 'has_active_loan' | 'active_loan_balance' | 'active_loan_count'>> = [];

    for (const tx of rawTxList) {
      const md = (Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits) || mdLookup.get(tx.member_deposit_id);
      const dt = Array.isArray(md?.deposit_types) ? md.deposit_types[0] : md?.deposit_types;
      let member = Array.isArray(md?.anggota) ? md.anggota[0] : md?.anggota;

      // Prioritas 1: Coba cari member dari md.member_id yang terhubung di rekening simpanan
      const effectiveMdMemberId = md?.member_id;
      if ((!member || !(member.nama || member.name)) && effectiveMdMemberId) {
        const matched = allAnggotaList.find(a => matchId(a.id, effectiveMdMemberId));
        if (matched) member = matched;
      }

      // Prioritas 2: Coba cari member dari salesMemberMap berdasarkan reference_no (struk kasir POS)
      if ((!member || !(member.nama || member.name)) && tx.reference_no) {
        const trimmedRef = tx.reference_no.trim();
        const mId =
          salesMemberMap.get(trimmedRef) ||
          salesMemberMap.get(trimmedRef.toUpperCase()) ||
          salesMemberMap.get(trimmedRef.replace(/^INV-/, ''));
        if (mId) {
          const matched = allAnggotaList.find(a => matchId(a.id, mId));
          if (matched) member = matched;
        }
      }

      // Prioritas 3: Coba cari dari sale_id UUID di catatan (notes / description)
      if ((!member || !(member.nama || member.name))) {
        const fullNotes = `${tx.notes || ''} ${tx.description || ''}`;
        const uuidMatch = fullNotes.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
          const mId = salesMemberMap.get(uuidMatch[0]);
          if (mId) {
            const matched = allAnggotaList.find(a => matchId(a.id, mId));
            if (matched) member = matched;
          }
        }
      }

      // Prioritas 4: Direct single query ke sales jika reference_no ada
      if ((!member || !(member.nama || member.name)) && tx.reference_no && tx.reference_no !== '-') {
        try {
          const { data: sDirect } = await supabase
            .from('sales')
            .select('id, sale_number, member_id')
            .eq('sale_number', tx.reference_no.trim())
            .maybeSingle();

          if (sDirect?.member_id) {
            let matched = allAnggotaList.find(a => matchId(a.id, sDirect.member_id));
            if (!matched) {
              const { data: dMem } = await supabase
                .from('anggota')
                .select('*')
                .eq('id', sDirect.member_id)
                .maybeSingle();
              if (dMem) {
                matched = dMem;
                allAnggotaList.push(dMem);
              }
            }
            if (matched) member = matched;
          }
        } catch (_) {}
      }

      // Prioritas 5: Cek kecocokan nama atau nrp dari deskripsi / catatan transaksi
      if ((!member || !(member.nama || member.name)) && allAnggotaList.length > 0) {
        const descText = `${tx.description || ''} ${tx.notes || ''}`.toLowerCase();
        member = allAnggotaList.find(a =>
          (a.nama && descText.includes(a.nama.toLowerCase())) ||
          (a.name && descText.includes(a.name.toLowerCase())) ||
          (a.nrp && descText.includes(a.nrp.toLowerCase()))
        );
      }

      const memberId = member?.id || md?.member_id || '';
      if (memberId) {
        memberIds.add(memberId);
      }

      // Deteksi terminasi, simpanan lebaran & belanja secara fleksibel dan akurat
      const txType = (tx.transaction_type || '').toLowerCase();
      const isTerminationTx = txType === 'termination' ||
        (tx.notes || '').toLowerCase().includes('terminasi') ||
        (tx.notes || '').toLowerCase().includes('kliring') ||
        (tx.description || '').toLowerCase().includes('terminasi') ||
        (tx.description || '').toLowerCase().includes('kliring');

      const lebaranCheck = isLebaran(dt?.code, dt?.name, tx.description, tx.notes);
      const belanjaCheck = isBelanja(dt?.code, dt?.name, tx.description, tx.notes, tx.payment_method, tx.reference_no);

      let resolvedCode = dt?.code;
      if (!resolvedCode) {
        if (isTerminationTx) resolvedCode = 'TERMINATION';
        else if (lebaranCheck) resolvedCode = 'LEBARAN';
        else if (belanjaCheck) resolvedCode = 'BELANJA';
        else resolvedCode = 'LAINNYA';
      }

      let resolvedName = dt?.name;
      if (!resolvedName) {
        if (isTerminationTx) resolvedName = 'Kliring Penutupan Keanggotaan';
        else if (lebaranCheck) resolvedName = 'Simpanan Lebaran';
        else if (belanjaCheck) resolvedName = 'Simpanan Belanja Bulanan';
        else resolvedName = 'Simpanan Lainnya';
      } else {
        if (belanjaCheck && (resolvedName.toLowerCase() === 'simpanan belanja' || resolvedCode === 'BELANJA')) {
          resolvedName = 'Simpanan Belanja Bulanan';
        }
      }

      const memberName = member?.nama || member?.name || 'Anggota Tidak Dikenal';
      const memberNrp = member?.nrp || '-';
      const memberRank = member?.pangkat || '-';
      const bankName = member?.bank_name || '-';
      const bankAccountNumber = member?.bank_account_number || '-';

      preliminaryItems.push({
        id: tx.id,
        member_id: memberId,
        member_name: memberName,
        member_nrp: memberNrp,
        member_rank: memberRank,
        bank_name: bankName,
        bank_account_number: bankAccountNumber,
        deposit_type_id: dt?.id || md?.deposit_type_id || '',
        deposit_type_code: resolvedCode,
        deposit_type_name: resolvedName,
        amount: sanitizeNumber(tx.amount, 0),
        transaction_date: tx.created_at || new Date().toISOString(),
        reference_no: tx.reference_no || '-',
        payment_method: tx.payment_method || 'tunai',
        notes: tx.notes || tx.description || '-',
        created_by: tx.created_by || null,
        transaction_type: tx.transaction_type || 'withdrawal'
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
      const target = filters.depositTypeCode.toLowerCase().trim();
      items = items.filter(i => {
        if (target === 'termination') {
          const notesText = `${i.notes || ''}`.toLowerCase();
          return (
            i.deposit_type_code.toLowerCase() === 'termination' ||
            i.deposit_type_name.toLowerCase().includes('kliring') ||
            i.deposit_type_name.toLowerCase().includes('terminasi') ||
            notesText.includes('terminasi') ||
            notesText.includes('kliring') ||
            notesText.includes('pengunduran') ||
            i.transaction_type?.toLowerCase() === 'termination'
          );
        }
        if (target === 'lebaran') {
          return isLebaran(i.deposit_type_code, i.deposit_type_name, i.notes);
        }
        if (target === 'belanja') {
          return isBelanja(i.deposit_type_code, i.deposit_type_name, i.notes, undefined, i.payment_method, i.reference_no);
        }
        const cat = categorizeDepositType(i.deposit_type_code, i.deposit_type_name, i.notes);
        return (
          cat === target ||
          i.deposit_type_code.toLowerCase() === target ||
          i.deposit_type_name.toLowerCase() === target ||
          i.deposit_type_name.toLowerCase().includes(target) ||
          (i.deposit_type_id && i.deposit_type_id.toLowerCase() === target)
        );
      });
    }

    if (filters?.paymentMethod && filters.paymentMethod !== 'all') {
      const targetMethod = filters.paymentMethod.toLowerCase();
      items = items.filter(i => (i.payment_method || '').toLowerCase().includes(targetMethod));
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
    console.warn('Exception getWithdrawalDetailedLedger:', err?.message || err);
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

    // Periksa fokus simpanan lebaran secara fleksibel
    if (isLebaran(item.deposit_type_code, item.deposit_type_name, item.notes)) {
      breakdownByType.lebaran += amt;
    } else {
      const category = categorizeDepositType(item.deposit_type_code, item.deposit_type_name, item.notes);
      breakdownByType[category] = (breakdownByType[category] || 0) + amt;
    }

    // Evaluasi metode transfer non-tunai (ILIKE %transfer% / bank / rekening)
    const method = (item.payment_method || '').toLowerCase();
    if (method.includes('transfer') || method.includes('bank') || method.includes('rekening')) {
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
