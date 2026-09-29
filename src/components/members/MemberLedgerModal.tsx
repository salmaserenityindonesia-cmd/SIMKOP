import { useState, useEffect } from 'react';
import { X, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';

interface Props {
  memberId: string;
  memberNrp: string;
  memberName: string;
  onClose: () => void;
}

interface TransactionRow {
  id: string;
  amount: number;
  created_at: string;
  description: string;
  for_month: number;
  for_year: number;
  transaction_type: string;
  deposit_name: string;
}

export default function MemberLedgerModal({ memberId, memberNrp, memberName, onClose }: Props) {
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('deposit_transactions')
          .select(`
            id, amount, created_at, description, for_month, for_year, transaction_type,
            member_deposits!inner (
              deposit_types (name)
            )
          `)
          .eq('member_deposits.member_id', memberId)
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mapped = (data || []).map((row: any) => ({
          id: row.id,
          amount: row.amount,
          created_at: row.created_at,
          description: row.description || '-',
          for_month: row.for_month,
          for_year: row.for_year,
          transaction_type: row.transaction_type,
          deposit_name: row.member_deposits?.deposit_types?.name || 'Simpanan',
        }));
        
        setTransactions(mapped);
      } catch (error) {
        console.error('Error fetching ledger:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [memberId]);

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
              <h2 className="text-lg font-bold text-slate-800">Buku Bantu Simpanan</h2>
              <p className="text-sm text-slate-500">{memberName} ({memberNrp})</p>
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
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              Tidak ada data transaksi simpanan untuk anggota ini.
            </div>
          ) : (
            <div className="space-y-6">
              {/* Aggregates Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(
                  transactions.reduce((acc, tx) => {
                    if (tx.transaction_type === 'deposit') {
                      acc[tx.deposit_name] = (acc[tx.deposit_name] || 0) + tx.amount;
                    } else if (tx.transaction_type === 'withdrawal') {
                      acc[tx.deposit_name] = (acc[tx.deposit_name] || 0) - tx.amount;
                    }
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([name, total]) => (
                  <div key={name} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm">
                    <p className="text-xs font-medium text-slate-500 mb-1">{name}</p>
                    <h3 className="text-lg font-bold text-emerald-600">Rp {total.toLocaleString('id-ID')}</h3>
                  </div>
                ))}
              </div>

              {/* Transactions Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-600 font-medium">
                  <tr>
                    <th className="py-3 px-4 border-b">Tanggal</th>
                    <th className="py-3 px-4 border-b">Jenis Simpanan</th>
                    <th className="py-3 px-4 border-b">Keterangan</th>
                    <th className="py-3 px-4 border-b">Bulan/Tahun</th>
                    <th className="py-3 px-4 border-b">Tipe</th>
                    <th className="py-3 px-4 border-b text-right">Nominal (Rp)</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 border-b border-slate-100 last:border-0">
                      <td className="py-3 px-4 whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleDateString('id-ID', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-700">{tx.deposit_name}</td>
                      <td className="py-3 px-4 text-slate-600">{tx.description}</td>
                      <td className="py-3 px-4">
                        {tx.for_month ? `${String(tx.for_month).padStart(2, '0')}/${tx.for_year}` : '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                          tx.transaction_type === 'deposit' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {tx.transaction_type.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium">
                        {tx.amount.toLocaleString('id-ID')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
