import { supabase } from '../lib/supabaseClient';

export interface DepositTypeItem {
  id: string;
  name: string;
  code?: string;
  default_amount?: number;
}

/**
 * Helper to identify deposit type based on code or name keywords.
 */
export function matchDepositType(
  types: DepositTypeItem[],
  codes: string[],
  nameKeywords: string[]
): DepositTypeItem | undefined {
  return types.find((t) => {
    const code = (t.code || '').toUpperCase();
    if (codes.some((c) => c.toUpperCase() === code)) return true;
    const name = (t.name || '').toLowerCase();
    return nameKeywords.some((k) => name.includes(k.toLowerCase()));
  });
}

/**
 * Mengambil rentang tahun (descending) yang tersedia untuk tracking kepatuhan simpanan
 * berdasarkan 3 kondisi kewajiban masa lalu yang belum terselesaikan:
 * 1. Simpanan pokok belum lunas oleh anggota aktif (dihitung sejak tahun registrasinya).
 * 2. Simpanan hari raya/lebaran yang masih memiliki sisa saldo (belum ditarik habis).
 * 3. Bulan simpanan wajib yang belum terbayar (menunggak) oleh anggota aktif.
 *
 * Fallback: Mengembalikan [currentYear] jika terjadi gangguan koneksi/query atau seluruh
 * kewajiban masa lampau telah terpenuhi.
 */
export async function getSavingsComplianceAvailableYears(
  referenceDate: Date = new Date()
): Promise<number[]> {
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth(); // 0-indexed (0: Jan, 11: Des)
  const candidateYears: number[] = [currentYear];

  try {
    // 1. Fetch deposit types
    const { data: dTypes, error: dTypesError } = await supabase
      .from('deposit_types')
      .select('*');

    if (dTypesError || !dTypes || dTypes.length === 0) {
      if (dTypesError) {
        console.error('Error fetching deposit types for available years:', dTypesError);
      }
      return [currentYear];
    }

    const pokokType = matchDepositType(dTypes, ['POKOK', 'SP'], ['pokok']);
    const wajibType = matchDepositType(dTypes, ['WAJIB', 'SW'], ['wajib']);
    const lebaranType = matchDepositType(dTypes, ['LEBARAN', 'SL'], ['lebaran', 'hari raya']);

    // 2. Fetch all active members from public.anggota (BUKAN members)
    let members: any[] = [];
    let membersError: any = null;

    const selectBuilder: any = supabase
      .from('anggota')
      .select('id, nama, nrp, status, membership_status, created_at');

    if (typeof selectBuilder.order === 'function') {
      const resp = await selectBuilder.order('nama', { ascending: true });
      members = resp.data || [];
      membersError = resp.error;
    } else if (typeof selectBuilder.eq === 'function') {
      const resp = await selectBuilder.eq('status', 'aktif');
      members = resp.data || [];
      membersError = resp.error;
    } else {
      const resp = await selectBuilder;
      members = resp.data || [];
      membersError = resp.error;
    }

    if (membersError || !members || members.length === 0) {
      if (membersError) {
        console.error('Error fetching active members for available years:', membersError);
      }
      return [currentYear];
    }

    const activeMembers = members.filter((m: any) => {
      const st = (m.status || '').toLowerCase();
      const mst = (m.membership_status || '').toUpperCase();
      return st !== 'nonaktif' && mst !== 'RESIGNED';
    });

    const membersToUse = activeMembers.length > 0 ? activeMembers : members;
    members = membersToUse;

    // 3. Fetch deposit transactions
    const { data: transactions, error: txError } = await supabase
      .from('deposit_transactions')
      .select('amount, transaction_type, for_year, for_month, created_at, member_deposits!inner(member_id, deposit_type_id)');

    if (txError) {
      console.error('Error fetching deposit transactions for available years:', txError);
      return [currentYear];
    }

    const txList = transactions || [];

    // Helper to extract transaction metadata safely
    const parseTx = (tx: any) => {
      const md = Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits;
      const memberId = tx.member_id || md?.member_id;
      const depositTypeId = tx.deposit_type_id || md?.deposit_type_id;
      const amount = Number(tx.amount) || 0;
      const type = tx.transaction_type || 'deposit';

      let year = currentYear;
      if (tx.for_year !== null && tx.for_year !== undefined && !isNaN(Number(tx.for_year))) {
        year = Number(tx.for_year);
      } else if (tx.created_at) {
        const y = new Date(tx.created_at).getFullYear();
        if (!isNaN(y)) year = y;
      }

      let month = 0;
      const hasExplicitMonth = tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month));
      if (hasExplicitMonth) {
        month = Number(tx.for_month) - 1; // 1-indexed to 0-indexed
      } else if (tx.created_at) {
        const m = new Date(tx.created_at).getMonth();
        if (!isNaN(m)) month = m;
      }

      return { memberId, depositTypeId, amount, type, year, month, hasExplicitMonth };
    };

    // --- KONDISI 1: Simpanan Pokok Belum Lunas ---
    if (pokokType) {
      const pokokDefaultAmount = Number(pokokType.default_amount) || 100000;
      const pokokDepositsByMember: Record<string, number> = {};

      txList.forEach((tx: any) => {
        const parsed = parseTx(tx);
        if (parsed.depositTypeId === pokokType.id && parsed.memberId) {
          if (!pokokDepositsByMember[parsed.memberId]) {
            pokokDepositsByMember[parsed.memberId] = 0;
          }
          if (parsed.type === 'deposit') {
            pokokDepositsByMember[parsed.memberId] += parsed.amount;
          } else if (parsed.type === 'withdrawal') {
            pokokDepositsByMember[parsed.memberId] -= parsed.amount;
          }
        }
      });

      members.forEach((m: any) => {
        const totalPokok = pokokDepositsByMember[m.id] || 0;
        if (totalPokok < pokokDefaultAmount) {
          const regDate = m.created_at ? new Date(m.created_at) : new Date();
          const regYear = isNaN(regDate.getFullYear()) ? currentYear : regDate.getFullYear();
          if (regYear <= currentYear) {
            candidateYears.push(regYear);
          }
        }
      });
    }

    // --- KONDISI 2: Saldo Simpanan Lebaran Belum Ditarik Habis ---
    if (lebaranType) {
      const lebaranTxsByMember: Record<
        string,
        { totalDeposit: number; totalWithdrawal: number; depositYears: number[] }
      > = {};

      txList.forEach((tx: any) => {
        const parsed = parseTx(tx);
        if (parsed.depositTypeId === lebaranType.id && parsed.memberId) {
          if (!lebaranTxsByMember[parsed.memberId]) {
            lebaranTxsByMember[parsed.memberId] = {
              totalDeposit: 0,
              totalWithdrawal: 0,
              depositYears: [],
            };
          }
          if (parsed.type === 'deposit') {
            lebaranTxsByMember[parsed.memberId].totalDeposit += parsed.amount;
            if (parsed.year <= currentYear) {
              lebaranTxsByMember[parsed.memberId].depositYears.push(parsed.year);
            }
          } else if (parsed.type === 'withdrawal') {
            lebaranTxsByMember[parsed.memberId].totalWithdrawal += parsed.amount;
          }
        }
      });

      members.forEach((m: any) => {
        const record = lebaranTxsByMember[m.id];
        if (record) {
          const netBalance = record.totalDeposit - record.totalWithdrawal;
          if (netBalance > 0) {
            const uniqueYears = Array.from(new Set(record.depositYears));
            uniqueYears.forEach((y) => candidateYears.push(y));
          }
        }
      });
    }

    // --- KONDISI 3: Tunggakan Bulan Simpanan Wajib ---
    if (wajibType) {
      const paidWajibSet = new Set<string>();

      txList.forEach((tx: any) => {
        const parsed = parseTx(tx);
        if (
          parsed.depositTypeId === wajibType.id &&
          parsed.memberId &&
          parsed.type === 'deposit' &&
          parsed.amount > 0
        ) {
          paidWajibSet.add(`${parsed.memberId}_${parsed.year}_${parsed.month}`);
        }
      });

      let oldestRegYear = currentYear;
      members.forEach((m: any) => {
        const regDate = m.created_at ? new Date(m.created_at) : new Date();
        const y = isNaN(regDate.getFullYear()) ? currentYear : regDate.getFullYear();
        if (y < oldestRegYear) {
          oldestRegYear = y;
        }
      });

      for (let y = oldestRegYear; y <= currentYear; y++) {
        let yearHasArrears = false;

        for (const m of members) {
          const regDate = m.created_at ? new Date(m.created_at) : new Date();
          const joinYear = isNaN(regDate.getFullYear()) ? currentYear : regDate.getFullYear();
          const joinMonth = isNaN(regDate.getMonth()) ? 0 : regDate.getMonth();

          if (y < joinYear) {
            continue;
          }

          const startMonth = y === joinYear ? joinMonth : 0;
          const endMonth = y === currentYear ? currentMonth : 11;

          for (let month = startMonth; month <= endMonth; month++) {
            const key = `${m.id}_${y}_${month}`;
            if (!paidWajibSet.has(key)) {
              yearHasArrears = true;
              break;
            }
          }

          if (yearHasArrears) {
            break;
          }
        }

        if (yearHasArrears) {
          candidateYears.push(y);
        }
      }
    }

    const startYear = Math.min(...candidateYears);
    const years: number[] = [];
    for (let y = currentYear; y >= startYear; y--) {
      years.push(y);
    }

    return years.length > 0 ? years : [currentYear];
  } catch (err) {
    console.error('Unexpected error resolving savings compliance available years:', err);
    return [currentYear];
  }
}


export interface SavingsSubItem {
  status: 'paid' | 'unpaid' | 'not_applicable';
  amount: number;
}

export interface MonthSavingsCell {
  month: number;
  wajib: SavingsSubItem;
  belanja: SavingsSubItem;
  lebaran: SavingsSubItem;
}

export interface ComplianceMonthData {
  w: number;
  b: number;
  l: number;
  bal_w: number;
  bal_b: number;
  bal_l: number;
  wajib?: SavingsSubItem;
  belanja?: SavingsSubItem;
  lebaran?: SavingsSubItem;
}

export interface ComplianceMatrixRow {
  member_id: string;
  nrp: string;
  nama: string;
  pokokLunas: boolean;
  compliance: number;
  balances: { w: number; b: number; l: number };
  months: (ComplianceMonthData | null)[];
  created_at?: string;
  tgl_awal_anggota?: string;
}

export interface ComplianceMatrixResult {
  rows: ComplianceMatrixRow[];
  targets: {
    wajib: number;
    belanja: number;
    lebaran: number;
  };
}

/**
 * Memuat data matriks kepatuhan simpanan seluruh anggota aktif untuk tahun tertentu.
 * Menjamin:
 * 1. Mengambil master data dari tabel `public.anggota` (BUKAN `members`).
 * 2. Menyertakan seluruh anggota aktif yang terdaftar sebelum atau pada tahun tersebut (misal terdaftar 2023/2025 tetap muncul di 2026).
 * 3. Menggunakan LEFT JOIN / pemisahan kueri transaksi sehingga anggota yang belum memiliki setoran di tahun tersebut TIDAK tereliminasi.
 */
export async function getComplianceMatrixData(
  year: number,
  depositType?: string
): Promise<ComplianceMatrixResult> {
  // 1. Ambil tipe simpanan
  const { data: dTypes } = await supabase.from('deposit_types').select('*');
  const typeList = dTypes || [];
  const typeMap: Record<string, string> = {};
  typeList.forEach((dt: any) => {
    typeMap[(dt.name || '').toLowerCase()] = dt.id;
    if (dt.code) typeMap[(dt.code || '').toLowerCase()] = dt.id;
  });

  const isTypeMatch = (dt: any, codes: string[], keywords: string[]) => {
    const c = (dt.code || '').toUpperCase();
    const n = (dt.name || '').toLowerCase();
    return codes.some((code) => c === code.toUpperCase()) || keywords.some((k) => n.includes(k.toLowerCase()));
  };

  const pokokType = matchDepositType(typeList, ['POKOK', 'SP'], ['pokok']);
  const wajibType = matchDepositType(typeList, ['WAJIB', 'SW'], ['wajib']);
  const belanjaType = matchDepositType(typeList, ['BELANJA', 'SB'], ['belanja']);
  const lebaranType = matchDepositType(typeList, ['LEBARAN', 'SL', 'SHR'], ['lebaran', 'hari raya']);

  const keys = Object.keys(typeMap);
  const pokokId = pokokType?.id || typeMap[keys.find((k) => k.includes('pokok') || k === 'sp') || ''] || '';
  const wajibId = wajibType?.id || typeMap[keys.find((k) => k.includes('wajib') || k === 'sw') || ''] || '';
  const belanjaId = belanjaType?.id || typeMap[keys.find((k) => k.includes('belanja') || k === 'sb') || ''] || '';
  const lebaranId = lebaranType?.id || typeMap[keys.find((k) => k.includes('lebaran') || k.includes('hari raya') || k === 'sl') || ''] || '';

  const pokokTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['POKOK', 'SP'], ['pokok'])).map((dt) => dt.id));
  const wajibTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['WAJIB', 'SW'], ['wajib'])).map((dt) => dt.id));
  const belanjaTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['BELANJA', 'SB'], ['belanja'])).map((dt) => dt.id));
  const lebaranTypeIds = new Set(typeList.filter((dt) => isTypeMatch(dt, ['LEBARAN', 'SL', 'SHR'], ['lebaran', 'hari raya'])).map((dt) => dt.id));

  if (pokokId) pokokTypeIds.add(pokokId);
  if (wajibId) wajibTypeIds.add(wajibId);
  if (belanjaId) belanjaTypeIds.add(belanjaId);
  if (lebaranId) lebaranTypeIds.add(lebaranId);

  // 2. Ambil seluruh anggota dari public.anggota (BUKAN members)
  // WAJIB mengambil seluruh anggota aktif dari public.anggota yang terdaftar pada atau sebelum tahun yang dipilih
  const endOfYear = `${year}-12-31`;
  const endOfYearIso = `${year}-12-31T23:59:59.999Z`;
  let rawMembers: any[] = [];
  let memberErr: any = null;

  try {
    const memberSelectBuilder: any = supabase
      .from('anggota')
      .select('id, nrp, nama, pangkat, bank_account_number, membership_status, created_at, status');

    let executed = false;
    // Chaining kueri Supabase PostgREST: .eq('status', 'aktif').lte('created_at', endOfYear).order('nama', { ascending: true })
    if (typeof memberSelectBuilder.eq === 'function') {
      const eqBuilder = memberSelectBuilder.eq('status', 'aktif');
      if (eqBuilder && typeof eqBuilder.lte === 'function') {
        const lteBuilder = eqBuilder.lte('created_at', endOfYearIso);
        if (lteBuilder && typeof lteBuilder.order === 'function') {
          const resp = await lteBuilder.order('nama', { ascending: true });
          rawMembers = resp.data || [];
          memberErr = resp.error;
          executed = true;
        } else {
          const resp = await (lteBuilder || eqBuilder);
          rawMembers = resp.data || [];
          memberErr = resp.error;
          executed = true;
        }
      } else if (eqBuilder && typeof eqBuilder.order === 'function') {
        const resp = await eqBuilder.order('nama', { ascending: true });
        rawMembers = resp.data || [];
        memberErr = resp.error;
        executed = true;
      } else if (eqBuilder && typeof eqBuilder.then === 'function') {
        const resp = await eqBuilder;
        rawMembers = resp.data || [];
        memberErr = resp.error;
        executed = true;
      }
    }

    if (!executed) {
      if (typeof memberSelectBuilder.order === 'function') {
        const resp = await memberSelectBuilder.order('nama', { ascending: true });
        rawMembers = resp.data || [];
        memberErr = resp.error;
      } else {
        const resp = await memberSelectBuilder;
        rawMembers = resp.data || [];
        memberErr = resp.error;
      }
    }

    // Jika filter status di DB mengembalikan data kosong (misal karena status legacy bernilai NULL),
    // lakukan fallback query tanpa filter status agar data anggota aktif tetap diambil
    if ((!rawMembers || rawMembers.length === 0) && !memberErr && typeof memberSelectBuilder.order === 'function') {
      const fallbackResp = await memberSelectBuilder.order('nama', { ascending: true });
      if (fallbackResp?.data && fallbackResp.data.length > 0) {
        rawMembers = fallbackResp.data;
      }
    }
  } catch (err: any) {
    console.error('Error fetching members from anggota for compliance matrix:', err);
    memberErr = err;
  }

  if (memberErr) {
    console.error('Error fetching members from anggota for compliance matrix:', memberErr);
    return { rows: [], targets: { wajib: 0, belanja: 0, lebaran: 0 } };
  }

  const allMembers = rawMembers || [];

  // Filter anggota aktif: bukan berstatus nonaktif atau RESIGNED
  const activeMembers = allMembers.filter((m: any) => {
    const st = (m.status || '').toLowerCase();
    const mst = (m.membership_status || '').toUpperCase();
    return st !== 'nonaktif' && mst !== 'RESIGNED';
  });

  const membersToFilter = activeMembers.length > 0 ? activeMembers : allMembers;

  // Filter berdasarkan masa keanggotaan: anggota yang bergabung sebelum atau pada akhir tahun yang dipilih
  const endOfYearDate = new Date(endOfYearIso);
  const eligibleMembers = membersToFilter.filter((m: any) => {
    const joinDateStr = m.created_at || m.tgl_awal_anggota;
    if (!joinDateStr) return true;
    const joinDate = new Date(joinDateStr);
    return isNaN(joinDate.getTime()) || joinDate <= endOfYearDate;
  });

  // 3. Ambil Rekening Simpanan & Transaksi Secara Terpisah (LEFT JOIN)
  const { data: memberDepositsList } = await supabase
    .from('member_deposits')
    .select('id, member_id, deposit_type_id');
  const mdMap = new Map<string, { member_id: string; deposit_type_id: string }>();
  (memberDepositsList || []).forEach((md: any) => {
    if (md.id) {
      mdMap.set(md.id, { member_id: md.member_id, deposit_type_id: md.deposit_type_id });
    }
  });

  const { data: transactions } = await supabase
    .from('deposit_transactions')
    .select('id, member_deposit_id, amount, transaction_type, for_year, for_month, created_at, description, member_deposits(member_id, deposit_type_id)');

  // Helper untuk mengekstrak member_id dan deposit_type_id dari transaksi
  const parseTxInfo = (tx: any) => {
    const md = Array.isArray(tx.member_deposits) ? tx.member_deposits[0] : tx.member_deposits;
    const mdFromMap = tx.member_deposit_id ? mdMap.get(tx.member_deposit_id) : undefined;
    const memberId = tx.member_id || md?.member_id || mdFromMap?.member_id;
    const depositTypeId = tx.deposit_type_id || md?.deposit_type_id || mdFromMap?.deposit_type_id;
    return { memberId, depositTypeId };
  };

  // Ambil transaksi pokok
  const { data: pokokTxs } = await supabase
    .from('deposit_transactions')
    .select('id, member_deposit_id, amount, transaction_type, member_deposits(member_id, deposit_type_id)');

  const pokokPaidByMember = new Set<string>();
  if (pokokTxs) {
    const pokokSums: Record<string, number> = {};
    pokokTxs.forEach((tx: any) => {
      const { memberId: mId, depositTypeId: tId } = parseTxInfo(tx);
      if (mId && (!pokokId || pokokTypeIds.has(tId) || tId === pokokId)) {
        const amt = Number(tx.amount) || 0;
        if (tx.transaction_type === 'deposit') {
          pokokSums[mId] = (pokokSums[mId] || 0) + amt;
        } else if (tx.transaction_type === 'withdrawal') {
          pokokSums[mId] = (pokokSums[mId] || 0) - amt;
        }
      }
    });

    const pokokTarget = typeList.find((dt: any) => dt.id === pokokId)?.default_amount || 100000;
    Object.keys(pokokSums).forEach((mId) => {
      if (pokokSums[mId] >= pokokTarget) {
        pokokPaidByMember.add(mId);
      }
    });
  }

  // Helper untuk mengidentifikasi transaksi gelondongan migrasi / saldo awal
  const isBulkMigrationTx = (tx: any): boolean => {
    const desc = (tx.description || '').toLowerCase();
    const isMigrationDesc =
      desc.includes('migra') ||
      desc.includes('saldo awal') ||
      desc.includes('historical') ||
      desc.includes('one-time');

    const hasExplicitMonth =
      tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month));
    const isLumpSumAmount = Number(tx.amount) > 200000;

    return (
      isMigrationDesc &&
      (!hasExplicitMonth ||
        (isLumpSumAmount &&
          (desc.includes('saldo awal migrasi sistem') || desc.includes('migrasi saldo awal (as-is)'))))
    );
  };

  // Cek apakah akun simpanan anggota sudah memiliki rincian bulanan (breakdown mutasi)
  const hasBreakdownSet = new Set<string>();
  if (transactions) {
    transactions.forEach((tx: any) => {
      const { memberId: mId, depositTypeId: tId } = parseTxInfo(tx);
      if (!mId) return;
      const key = `${mId}_${tId}`;

      const desc = (tx.description || '').toLowerCase();
      const isBreakdown =
        tx.transaction_type === 'deposit' &&
        tx.for_month !== null &&
        tx.for_month !== undefined &&
        tx.for_year !== null &&
        tx.for_year !== undefined &&
        (desc.includes('setoran matriks') || !isBulkMigrationTx(tx));

      if (isBreakdown) {
        hasBreakdownSet.add(key);
      }
    });
  }

  // Agregasi setoran bulanan dan transaksi anggota
  const paymentsByMember: Record<string, Record<number, { w: number; b: number; l: number }>> = {};
  const memberTxs: Record<
    string,
    Array<{ year: number; month: number; type: string; amt: number; tId: string }>
  > = {};

  if (transactions) {
    transactions.forEach((tx: any) => {
      const { memberId: mId, depositTypeId: tId } = parseTxInfo(tx);
      if (!mId) return;
      const amt = Number(tx.amount) || 0;
      const key = `${mId}_${tId}`;

      const isBulk = isBulkMigrationTx(tx);
      const hasBreakdown = hasBreakdownSet.has(key);

      // Jika rincian bulanan sudah ada, singkirkan transaksi gelondongan awal migrasi agar tidak terhitung dua kali
      if (isBulk && hasBreakdown) {
        return;
      }

      let txYear = 0;
      let txMonth = -1; // 0-indexed: 0 = Jan .. 11 = Des

      if (tx.transaction_type === 'deposit') {
        txYear = Number(tx.for_year) || (tx.created_at ? new Date(tx.created_at).getFullYear() : 0);
        if (tx.for_month !== null && tx.for_month !== undefined && !isNaN(Number(tx.for_month))) {
          const rawM = Number(tx.for_month);
          txMonth = rawM >= 1 && rawM <= 12 ? rawM - 1 : rawM;
        } else if (tx.created_at) {
          txMonth = new Date(tx.created_at).getMonth();
        }
      } else {
        const d = tx.created_at ? new Date(tx.created_at) : new Date();
        txYear = d.getFullYear();
        txMonth = d.getMonth();
      }

      if (!memberTxs[mId]) memberTxs[mId] = [];
      memberTxs[mId].push({ year: txYear, month: txMonth, type: tx.transaction_type, amt, tId });

      // Cek setoran rutin bulanan khusus pada tahun yang dipilih
      // Saldo gelondongan migrasi (isBulk) TIDAK BOLEH dihitung sebagai setoran bulanan rutin
      const isRoutineMonthly = tx.for_month !== null && tx.for_month !== undefined && !isBulk;

      if (txYear === year && tx.transaction_type === 'deposit' && isRoutineMonthly) {
        const month = txMonth; // 0-indexed
        if (month >= 0 && month < 12) {
          if (!paymentsByMember[mId]) paymentsByMember[mId] = {};
          if (!paymentsByMember[mId][month]) paymentsByMember[mId][month] = { w: 0, b: 0, l: 0 };

          if (wajibTypeIds.has(tId) || tId === wajibId) paymentsByMember[mId][month].w += amt;
          if (belanjaTypeIds.has(tId) || tId === belanjaId) paymentsByMember[mId][month].b += amt;
          if (lebaranTypeIds.has(tId) || tId === lebaranId) paymentsByMember[mId][month].l += amt;
        }
      }
    });
  }

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const targetWajib = typeList.find((dt: any) => dt.id === wajibId)?.default_amount || 25000;
  const targetBelanja = typeList.find((dt: any) => dt.id === belanjaId)?.default_amount || 50000;
  const targetLebaran = typeList.find((dt: any) => dt.id === lebaranId)?.default_amount || 50000;

  // 4. Susun baris untuk setiap anggota yang eligible
  // PENTING: Jangan buang anggota yang belum memiliki transaksi di tahun tersebut!
  const results: ComplianceMatrixRow[] = eligibleMembers.map((m: any) => {
    const monthsData: (ComplianceMonthData | null)[] = [];
    let expectedCount = 0;
    let paidCount = 0;

    const joinDateStr = m.tgl_awal_anggota || m.created_at;
    const joinDate = joinDateStr ? new Date(joinDateStr) : new Date(0);
    const joinMonth = isNaN(joinDate.getMonth()) ? 0 : joinDate.getMonth();
    const joinYear = isNaN(joinDate.getFullYear()) ? currentYear : joinDate.getFullYear();

    for (let i = 0; i < 12; i++) {
      // Jika bulan sebelum tanggal anggota bergabung atau bulan di masa depan
      const isBeforeJoin = year < joinYear || (year === joinYear && i < joinMonth);
      const isFuture = year > currentYear || (year === currentYear && i > currentMonth);

      const p = paymentsByMember[m.id]?.[i] || { w: 0, b: 0, l: 0 };
      const hasAnyPayment = p.w > 0 || p.b > 0 || p.l > 0;

      if (isFuture) {
        monthsData.push(null);
      } else if (isBeforeJoin && !hasAnyPayment) {
        monthsData.push(null);
      } else {
        // Hitung running balance hingga (year, i)
        const memberTxList = memberTxs[m.id] || [];
        let balW = 0;
        let balB = 0;
        let balL = 0;

        for (const t of memberTxList) {
          if (t.year < year || (t.year === year && t.month <= i)) {
            const isWajib = wajibTypeIds.has(t.tId) || t.tId === wajibId;
            const isBelanja = belanjaTypeIds.has(t.tId) || t.tId === belanjaId;
            const isLebaran = lebaranTypeIds.has(t.tId) || t.tId === lebaranId;

            if (t.type === 'deposit') {
              if (isWajib) balW += t.amt;
              if (isBelanja) balB += t.amt;
              if (isLebaran) balL += t.amt;
            } else if (t.type === 'withdrawal') {
              if (isWajib) balW -= t.amt;
              if (isBelanja) balB -= t.amt;
              if (isLebaran) balL -= t.amt;
            }
          }
        }

        const wajibItem: SavingsSubItem = {
          status: p.w > 0 ? 'paid' : isBeforeJoin ? 'not_applicable' : 'unpaid',
          amount: p.w > 0 ? p.w : isBeforeJoin ? 0 : targetWajib,
        };
        const belanjaItem: SavingsSubItem = {
          status: p.b > 0 ? 'paid' : isBeforeJoin ? 'not_applicable' : 'unpaid',
          amount: p.b > 0 ? p.b : isBeforeJoin ? 0 : targetBelanja,
        };
        const lebaranItem: SavingsSubItem = {
          status: p.l > 0 ? 'paid' : isBeforeJoin ? 'not_applicable' : 'unpaid',
          amount: p.l > 0 ? p.l : isBeforeJoin ? 0 : targetLebaran,
        };

        monthsData.push({
          ...p,
          bal_w: balW,
          bal_b: balB,
          bal_l: balL,
          wajib: wajibItem,
          belanja: belanjaItem,
          lebaran: lebaranItem,
        });

        if (wajibItem.status !== 'not_applicable') {
          expectedCount += 1;
          if (wajibItem.status === 'paid') paidCount += 1;
        }
        if (belanjaItem.status !== 'not_applicable') {
          expectedCount += 1;
          if (belanjaItem.status === 'paid') paidCount += 1;
        }
        if (lebaranItem.status !== 'not_applicable') {
          expectedCount += 1;
          if (lebaranItem.status === 'paid') paidCount += 1;
        }
      }
    }

    const compliance = expectedCount > 0 ? Math.round((paidCount / expectedCount) * 100) : 100;

    return {
      member_id: m.id,
      nrp: m.nrp,
      nama: m.nama,
      pokokLunas: pokokPaidByMember.has(m.id),
      compliance,
      balances: { w: 0, b: 0, l: 0 },
      months: monthsData,
      created_at: m.created_at,
      tgl_awal_anggota: m.tgl_awal_anggota || m.created_at,
    };
  });

  return {
    rows: results,
    targets: {
      wajib: targetWajib,
      belanja: targetBelanja,
      lebaran: targetLebaran,
    },
  };
}
