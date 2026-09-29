
import { supabase } from '../lib/supabaseClient';

export interface ComplianceMonthData {
  w: number;
  b: number;
  l: number;
  bal_w: number;
  bal_b: number;
  bal_l: number;
}

export interface ComplianceMatrixRow {
  member_id: string;
  nrp: string;
  nama: string;
  pokokLunas: boolean;
  compliance: number;
  balances: { w: number, b: number, l: number };
  months: (ComplianceMonthData | null)[];
}
export interface ComplianceMatrixResult {
  rows: ComplianceMatrixRow[];
  targets: {
    wajib: number;
    belanja: number;
    lebaran: number;
  };
}

export async function getComplianceMatrixData(year: number): Promise<ComplianceMatrixResult> {
  // 1. Fetch deposit types to identify Pokok, Wajib, Belanja, Lebaran
  const { data: dTypes } = await supabase.from('deposit_types').select('*');
  if (!dTypes) return { rows: [], targets: { wajib: 0, belanja: 0, lebaran: 0 } };

  const typeMap: Record<string, string> = {}; // lowercase name -> id
  dTypes.forEach((dt: any) => {
    typeMap[dt.name.toLowerCase()] = dt.id;
  });

  const keys = Object.keys(typeMap);
  const pokokId = typeMap[keys.find(k => k.includes('pokok')) || ''];
  const wajibId = typeMap[keys.find(k => k.includes('wajib')) || ''];
  const belanjaId = typeMap[keys.find(k => k.includes('belanja')) || ''];
  const lebaranId = typeMap[keys.find(k => k.includes('lebaran') || k.includes('hari raya')) || ''];

  // 2. Fetch all active members
  const { data: members } = await supabase.from('anggota').select('id, nama, nrp, status, created_at').eq('status', 'aktif');
  if (!members) return { rows: [], targets: { wajib: 0, belanja: 0, lebaran: 0 } };

  // 3. Fetch deposit commitments / transactions
  // We fetch all to calculate total accumulated balance, but only use 'for_year' for the matrix checkboxes
  const { data: transactions } = await supabase
    .from('deposit_transactions')
    .select('amount, transaction_type, for_year, for_month, created_at, member_deposits!inner(member_id, deposit_type_id)');
    
  // Also check pokok which might not be tied to a specific month/year, but just paid.
  const { data: pokokTxs } = await supabase
    .from('deposit_transactions')
    .select('amount, member_deposits!inner(member_id, deposit_type_id)')
    .eq('member_deposits.deposit_type_id', pokokId);

  const pokokPaidByMember = new Set<string>();
  if (pokokTxs) {
    pokokTxs.forEach((tx: any) => {
      if (tx.member_deposits && tx.member_deposits.member_id) {
        pokokPaidByMember.add(tx.member_deposits.member_id);
      }
    });
  }

  // Aggregate monthly payments & transactions for running balance
  const paymentsByMember: Record<string, Record<number, { w: number, b: number, l: number }>> = {};
  const memberTxs: Record<string, Array<{ year: number, month: number, type: string, amt: number, tId: string }>> = {};
  
  if (transactions) {
    transactions.forEach((tx: any) => {
      if (!tx.member_deposits) return;
      const mId = tx.member_deposits.member_id;
      const tId = tx.member_deposits.deposit_type_id;
      const amt = Number(tx.amount) || 0;
      
      let txYear = 0;
      let txMonth = 0;
      
      if (tx.transaction_type === 'deposit') {
        txYear = tx.for_year || new Date(tx.created_at).getFullYear();
        txMonth = tx.for_month ? tx.for_month - 1 : new Date(tx.created_at).getMonth();
      } else {
        const d = new Date(tx.created_at);
        txYear = d.getFullYear();
        txMonth = d.getMonth();
      }
      
      if (!memberTxs[mId]) memberTxs[mId] = [];
      memberTxs[mId].push({ year: txYear, month: txMonth, type: tx.transaction_type, amt, tId });

      // Check monthly compliance for the selected year
      if (tx.for_year === year && tx.for_month && tx.transaction_type === 'deposit') {
        const month = tx.for_month - 1; // 0-indexed for the array
        if (!paymentsByMember[mId]) paymentsByMember[mId] = {};
        if (!paymentsByMember[mId][month]) paymentsByMember[mId][month] = { w: 0, b: 0, l: 0 };

        if (tId === wajibId) paymentsByMember[mId][month].w += amt;
        if (tId === belanjaId) paymentsByMember[mId][month].b += amt;
        if (tId === lebaranId) paymentsByMember[mId][month].l += amt;
      }
    });
  }

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const results: ComplianceMatrixRow[] = members.map((m: any) => {
    const monthsData: (ComplianceMonthData | null)[] = [];
    let expectedCount = 0;
    let paidCount = 0;
    
    const joinDate = m.created_at ? new Date(m.created_at) : new Date(0);
    const joinMonth = joinDate.getMonth(); // 0-indexed
    const joinYear = joinDate.getFullYear();

    for (let i = 0; i < 12; i++) {
      // If it's a future month in the current year, or any month in a future year, we might set it to null
      // OR if the month is before the member joined
      const isBeforeJoin = year < joinYear || (year === joinYear && i < joinMonth);
      const isFuture = year > currentYear || (year === currentYear && i > currentMonth);
      
      if (isFuture || isBeforeJoin) {
        monthsData.push(null);
      } else {
        const p = paymentsByMember[m.id]?.[i] || { w: 0, b: 0, l: 0 };
        
        // Calculate running balance up to (year, i)
        const memberTxList = memberTxs[m.id] || [];
        let balW = 0;
        let balB = 0;
        let balL = 0;
        
        for (const t of memberTxList) {
          if (t.year < year || (t.year === year && t.month <= i)) {
            if (t.type === 'deposit') {
              if (t.tId === wajibId) balW += t.amt;
              if (t.tId === belanjaId) balB += t.amt;
              if (t.tId === lebaranId) balL += t.amt;
            } else if (t.type === 'withdrawal') {
              if (t.tId === wajibId) balW -= t.amt;
              if (t.tId === belanjaId) balB -= t.amt;
              if (t.tId === lebaranId) balL -= t.amt;
            }
          }
        }
        
        monthsData.push({ ...p, bal_w: balW, bal_b: balB, bal_l: balL });
        
        expectedCount += 3;
        if (p.w > 0) paidCount++;
        if (p.b > 0) paidCount++;
        if (p.l > 0) paidCount++;
      }
    }

    const compliance = expectedCount > 0 ? Math.round((paidCount / expectedCount) * 100) : 100;

    return {
      member_id: m.id,
      nrp: m.nrp,
      nama: m.nama,
      pokokLunas: pokokPaidByMember.has(m.id),
      compliance,
      balances: { w: 0, b: 0, l: 0 }, // no longer used globally
      months: monthsData
    };
  });

  return {
    rows: results,
    targets: {
      wajib: dTypes.find((dt: any) => dt.id === wajibId)?.default_amount || 25000,
      belanja: dTypes.find((dt: any) => dt.id === belanjaId)?.default_amount || 50000,
      lebaran: dTypes.find((dt: any) => dt.id === lebaranId)?.default_amount || 50000
    }
  };
}

