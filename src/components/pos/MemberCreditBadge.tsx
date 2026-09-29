import React, { useEffect, useState } from 'react';
import { getMemberFinancials } from '../../services/posCreditService';
import { formatCurrency } from '../../utils/formatCurrency';

interface Props {
  memberId: string;
  onFinancialsLoaded?: (data: any) => void;
}

export default function MemberCreditBadge({ memberId, onFinancialsLoaded }: Props) {
  const [loading, setLoading] = useState(true);
  const [financials, setFinancials] = useState<any>(null);

  useEffect(() => {
    if (!memberId) return;
    setLoading(true);
    getMemberFinancials(memberId).then(data => {
      setFinancials(data);
      if (onFinancialsLoaded) onFinancialsLoaded(data);
    }).catch(err => {
      console.error(err);
    }).finally(() => {
      setLoading(false);
    });
  }, [memberId]);

  if (loading) {
    return <div className="text-xs text-slate-400 animate-pulse">Memuat limit kredit...</div>;
  }

  if (!financials) return null;

  return (
    <div className="flex gap-4 items-center bg-surface-container-low p-3 rounded-lg border border-outline-variant/30 mt-2">
      <div className="flex flex-col">
        <span className="text-[11px] text-on-surface-variant font-medium">Saldo Simpanan Belanja</span>
        <span className="text-sm font-bold text-primary">{formatCurrency(financials.belanjaBalance)}</span>
      </div>
      <div className="w-px h-8 bg-outline-variant/30"></div>
      <div className="flex flex-col">
        <span className="text-[11px] text-on-surface-variant font-medium">Sisa Limit Bon Aman (THP &gt; 1.5jt)</span>
        <span className={`text-sm font-bold ${financials.remainingCreditLimit > 0 ? 'text-emerald-600' : 'text-error'}`}>
          {formatCurrency(financials.remainingCreditLimit)}
        </span>
      </div>
    </div>
  );
}
