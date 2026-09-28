
import { supabase } from '../lib/supabaseClient';

export interface ComplianceMonthData {
  w: boolean;
  b: boolean;
  l: boolean;
}

export interface ComplianceMatrixRow {
  member_id: string;
  nrp: string;
  nama: string;
  pokokLunas: boolean;
  compliance: number;
  months: (ComplianceMonthData | null)[];
}

export async function getComplianceMatrixData(year: number): Promise<ComplianceMatrixRow[]> {
  // 1. Fetch deposit types to identify Pokok, Wajib, Belanja, Lebaran
  const { data: dTypes } = await supabase.from('deposit_types').select('*');
  if (!dTypes) return [];

  const typeMap: Record<string, string> = {}; // lowercase name -> id
  dTypes.forEach((dt: any) => {
    typeMap[dt.name.toLowerCase()] = dt.id;
  });

  const pokokId = typeMap['simpanan pokok'] || typeMap['pokok'];
  const wajibId = typeMap['simpanan wajib'] || typeMap['wajib'];
  const belanjaId = typeMap['simpanan belanja bulanan'] || typeMap['belanja'];
  const lebaranId = typeMap['simpanan hari raya'] || typeMap['lebaran'];

  // 2. Fetch all active members
  const { data: members } = await supabase.from('anggota').select('id, nama, nrp, status, created_at').eq('status', 'aktif');
  if (!members) return [];

  // 3. Fetch deposit commitments / transactions for the year
  // Let's use deposit_transactions joined with member_deposits
  const { data: transactions } = await supabase
    .from('deposit_transactions')
    .select('*, member_deposits(member_id, deposit_type_id)')
    .eq('for_year', year);
    
  // Also check pokok which might not be tied to a specific month/year, but just paid.
  const { data: pokokTxs } = await supabase
    .from('deposit_transactions')
    .select('amount, member_deposits(member_id, deposit_type_id)')
    .eq('member_deposits.deposit_type_id', pokokId);

  const pokokPaidByMember = new Set<string>();
  if (pokokTxs) {
    pokokTxs.forEach((tx: any) => {
      if (tx.member_deposits && tx.member_deposits.member_id) {
        pokokPaidByMember.add(tx.member_deposits.member_id);
      }
    });
  }

  // Aggregate monthly payments
  const paymentsByMember: Record<string, Record<number, { w: boolean, b: boolean, l: boolean }>> = {};
  
  if (transactions) {
    transactions.forEach((tx: any) => {
      if (!tx.member_deposits || !tx.for_month) return;
      const mId = tx.member_deposits.member_id;
      const tId = tx.member_deposits.deposit_type_id;
      const month = tx.for_month - 1; // 0-indexed for the array

      if (!paymentsByMember[mId]) paymentsByMember[mId] = {};
      if (!paymentsByMember[mId][month]) paymentsByMember[mId][month] = { w: false, b: false, l: false };

      if (tId === wajibId) paymentsByMember[mId][month].w = true;
      if (tId === belanjaId) paymentsByMember[mId][month].b = true;
      if (tId === lebaranId) paymentsByMember[mId][month].l = true;
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
        const p = paymentsByMember[m.id]?.[i] || { w: false, b: false, l: false };
        monthsData.push(p);
        
        expectedCount += 3;
        if (p.w) paidCount++;
        if (p.b) paidCount++;
        if (p.l) paidCount++;
      }
    }

    const compliance = expectedCount > 0 ? Math.round((paidCount / expectedCount) * 100) : 100;

    return {
      member_id: m.id,
      nrp: m.nrp,
      nama: m.nama,
      pokokLunas: pokokPaidByMember.has(m.id),
      compliance,
      months: monthsData
    };
  });

  return results;
}

