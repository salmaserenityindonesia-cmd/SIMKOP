import { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/formatCurrency';

interface Props {
  loanId: string;
  memberNrp: string;
  memberName: string;
  onClose: () => void;
}

interface LoanDetails {
  loan_number: string;
  principal_amount: number;
  tenor: number;
  schedules: any[];
  repayments: any[];
}

export default function LoanLedgerModal({ loanId, memberNrp, memberName, onClose }: Props) {
  const [loan, setLoan] = useState<LoanDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLoanData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('loans')
          .select(`
            loan_number,
            principal_amount,
            tenor,
            loan_schedules (
              id, period_number, due_date, target_amount, paid_amount, status
            ),
            loan_repayments (
              id, amount_paid, payment_date, notes
            )
          `)
          .eq('id', loanId)
          .single();

        if (error) throw error;
        
        // Sort schedules
        if (data && data.loan_schedules) {
            data.loan_schedules.sort((a: any, b: any) => a.period_number - b.period_number);
        }

        setLoan(data as any);
      } catch (error) {
        console.error('Error fetching loan ledger:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLoanData();
  }, [loanId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Buku Bantu Angsuran Pinjaman</h2>
              <p className="text-sm text-slate-500">{memberName} ({memberNrp}) {loan ? `- ${loan.loan_number}` : ''}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-slate-500">Memuat data buku bantu...</p>
            </div>
          ) : !loan ? (
            <div className="text-center py-12 text-slate-500">
              Data pinjaman tidak ditemukan.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <p className="text-xs font-medium text-slate-500 mb-1">Total Pinjaman Pokok</p>
                  <h3 className="text-lg font-bold text-emerald-600">{formatCurrency(loan.principal_amount)}</h3>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <p className="text-xs font-medium text-slate-500 mb-1">Tenor</p>
                  <h3 className="text-lg font-bold text-slate-700">{loan.tenor} Bulan</h3>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <p className="text-xs font-medium text-slate-500 mb-1">Total Angsuran Masuk</p>
                  <h3 className="text-lg font-bold text-emerald-600">
                    {formatCurrency(loan.loan_repayments?.reduce((acc: number, cur: any) => acc + Number(cur.amount_paid), 0) || 0)}
                  </h3>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                  <p className="text-xs font-medium text-slate-500 mb-1">Sisa Pinjaman (Estimasi)</p>
                  <h3 className="text-lg font-bold text-rose-600">
                    {formatCurrency(
                        Math.max(0, loan.principal_amount - (loan.loan_repayments?.reduce((acc: number, cur: any) => acc + Number(cur.amount_paid), 0) || 0))
                    )}
                  </h3>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium">
                  <tr>
                    <th className="py-3 px-4 border-b">Bulan Ke</th>
                    <th className="py-3 px-4 border-b">Tgl Jatuh Tempo</th>
                    <th className="py-3 px-4 border-b text-right">Target (Rp)</th>
                    <th className="py-3 px-4 border-b text-right">Terbayar (Rp)</th>
                    <th className="py-3 px-4 border-b text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(loan.loan_schedules || []).map((sched: any) => (
                    <tr key={sched.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-700">
                        {sched.period_number}
                      </td>
                      <td className="py-3 px-4">
                        {new Date(sched.due_date).toLocaleDateString('id-ID', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {sched.target_amount.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-emerald-600">
                        {sched.paid_amount.toLocaleString('id-ID')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                          sched.status === 'paid' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : sched.status === 'partial' 
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {sched.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
             {/* Riwayat Pembayaran Tambahan */}
             {loan.loan_repayments && loan.loan_repayments.length > 0 && (
                 <div className="mt-8">
                     <h3 className="text-md font-bold text-slate-800 mb-4">Riwayat Pembayaran Angsuran</h3>
                     <div className="overflow-x-auto border border-slate-200 rounded-xl">
                        <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 font-medium">
                        <tr>
                            <th className="py-3 px-4 border-b">Tanggal Bayar</th>
                            <th className="py-3 px-4 border-b">Catatan</th>
                            <th className="py-3 px-4 border-b text-right">Nominal (Rp)</th>
                        </tr>
                        </thead>
                        <tbody>
                        {loan.loan_repayments.map((rep: any) => (
                            <tr key={rep.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                            <td className="py-3 px-4">
                                {new Date(rep.payment_date).toLocaleDateString('id-ID', {
                                day: '2-digit', month: 'short', year: 'numeric'
                                })}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{rep.notes || '-'}</td>
                            <td className="py-3 px-4 text-right font-medium text-emerald-600">
                                {rep.amount_paid.toLocaleString('id-ID')}
                            </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                     </div>
                 </div>
             )}

          </div>
          )}
        </div>
      </div>
    </div>
  );
}
