import React, { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { 
  getAnggota, 
  Anggota,
  getLoans,
  getMonthlyLoanCommitments,
  addDepositTransaction,
  addLoanInstallment,
  getMemberDepositBills
} from '../../services/koperasiService';
import { Search, Loader2, DollarSign, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';

export default function TerimaSetoran() {
  const [anggotaList, setAnggotaList] = useState<Anggota[]>([]);
  const [search, setSearch] = useState('');
  const [selectedAnggota, setSelectedAnggota] = useState<Anggota | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to current month/year
  const [targetMonth, setTargetMonth] = useState<number>(new Date().getMonth() + 1);
  const [targetYear, setTargetYear] = useState<number>(new Date().getFullYear());

  // Billing State
  const [depositBills, setDepositBills] = useState<any[]>([]);
  const [loanBills, setLoanBills] = useState<any[]>([]);
  const [selectedBills, setSelectedBills] = useState<Record<string, number>>({}); // map of id -> amount to pay

  useEffect(() => {
    fetchAnggota();
  }, []);

  useEffect(() => {
    if (selectedAnggota) {
      loadMemberBilling(selectedAnggota.id);
    } else {
      setDepositBills([]);
      setLoanBills([]);
      setSelectedBills({});
    }
  }, [selectedAnggota, targetMonth, targetYear]);

  const fetchAnggota = async () => {
    try {
      const data = await getAnggota();
      setAnggotaList(data.filter(a => a.status === 'aktif'));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const loadMemberBilling = async (memberId: string) => {
    try {
      setLoading(true);
      setError(null);
      setSelectedBills({});

      // 1. Fetch Deposit Commitments (Auto enrolls and calculates both 'once' and 'monthly' types)
      const memberDeposits = await getMemberDepositBills(memberId, targetMonth, targetYear);
      setDepositBills(memberDeposits);

      // 2. Fetch Loan Commitments
      const loans = await getLoans(memberId);
      const activeLoans = loans.filter(l => l.status === 'approved');
      const loanCommitments = await getMonthlyLoanCommitments({ memberId });
      
      const currentLoanBills = [];
      
      for (const loan of activeLoans) {
        const startDate = loan.created_at ? new Date(loan.created_at) : new Date();
        
        for (let i = 1; i <= loan.agreed_tenor_months; i++) {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + i);
          const m = d.getMonth() + 1;
          const y = d.getFullYear();
          
          if (m === targetMonth && y === targetYear) {
            // Found the installment for target month!
            const commitment = loanCommitments.find(c => c.loan_id === loan.id && c.for_month === m && c.for_year === y);
            const total_paid = commitment ? commitment.total_paid : 0;
            const remaining = Math.max(0, loan.planned_installment_amount - total_paid);
            
            if (remaining > 0) {
              currentLoanBills.push({
                ...loan,
                bulan_ke: i,
                for_month: m,
                for_year: y,
                total_paid,
                remaining_balance: remaining
              });
            }
            break; // Move to next loan
          }
        }
      }
      setLoanBills(currentLoanBills);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredAnggota = useMemo(() => {
    if (!search.trim()) return [];
    return anggotaList.filter(a => 
      a.nama.toLowerCase().includes(search.toLowerCase()) || 
      (a.nrp && a.nrp.toLowerCase().includes(search.toLowerCase()))
    ).slice(0, 5); // show top 5 matches
  }, [search, anggotaList]);

  const toggleBillSelection = (id: string, maxAmount: number) => {
    setSelectedBills(prev => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = maxAmount; // default select full amount
      }
      return next;
    });
  };

  const handleAmountChange = (id: string, amount: string, maxAmount: number) => {
    const val = parseInt(amount.replace(/\D/g, ''), 10) || 0;
    setSelectedBills(prev => ({
      ...prev,
      [id]: Math.min(val, maxAmount) // cap at max amount
    }));
  };

  const getTotalSelected = () => {
    return Object.values(selectedBills).reduce((sum, val) => sum + val, 0);
  };

  const handleProcessPayment = async () => {
    if (!selectedAnggota || Object.keys(selectedBills).length === 0) return;
    
    const totalToPay = getTotalSelected();
    if (totalToPay <= 0) return;

    if (!window.confirm(`Proses pembayaran sebesar Rp ${totalToPay.toLocaleString('id-ID')}?`)) {
      return;
    }

    try {
      setSubmitting(true);
      
      // Process Deposits
      for (const bill of depositBills) {
        const payAmount = selectedBills[`dep-${bill.member_deposit_id}`];
        if (payAmount > 0) {
          await addDepositTransaction(
            bill.member_deposit_id,
            payAmount,
            targetMonth,
            targetYear,
            'deposit',
            `Pembayaran Portal - ${bill.deposit_name}`
          );
        }
      }

      // Process Loans
      for (const bill of loanBills) {
        const payAmount = selectedBills[`loan-${bill.id}`];
        if (payAmount > 0) {
          await addLoanInstallment({
            loan_id: bill.id,
            amount: payAmount,
            payment_date: new Date().toISOString(),
            for_month: targetMonth,
            for_year: targetYear,
            notes: `Pembayaran Portal - Cicilan ke-${bill.bulan_ke}`
          });
        }
      }

      alert("Pembayaran berhasil diproses!");
      await loadMemberBilling(selectedAnggota.id);
      
    } catch (err: any) {
      alert(err.message || 'Gagal memproses pembayaran');
    } finally {
      setSubmitting(false);
    }
  };

  const selectAll = () => {
    const newSelected: Record<string, number> = {};
    depositBills.forEach(b => newSelected[`dep-${b.member_deposit_id}`] = b.remaining_balance);
    loanBills.forEach(b => newSelected[`loan-${b.id}`] = b.remaining_balance);
    setSelectedBills(newSelected);
  };

  return (
    <AdminLayout>
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Pusat Pembayaran Anggota</h1>
          <p className="text-[var(--color-text-secondary)]">Terima pembayaran seluruh tagihan (Simpanan & Pinjaman) dalam 1 layar</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column: Search & Filters */}
        <div className="w-full lg:w-1/3 space-y-4">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-4">Pilih Anggota</h2>
            
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Ketik nama atau NRP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              />
              
              {search && filteredAnggota.length > 0 && !selectedAnggota && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                  {filteredAnggota.map(a => (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelectedAnggota(a);
                        setSearch('');
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                    >
                      <div className="font-medium text-gray-900">{a.nama}</div>
                      <div className="text-sm text-gray-500">NRP: {a.nrp || '-'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedAnggota && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 relative">
                <button 
                  onClick={() => setSelectedAnggota(null)}
                  className="absolute top-2 right-2 text-blue-400 hover:text-blue-600"
                >
                  ✕
                </button>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700 font-bold">
                    {selectedAnggota.nama.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedAnggota.nama}</h3>
                    <p className="text-sm text-gray-600">NRP: {selectedAnggota.nrp || '-'}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-4">Periode Tagihan</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Bulan</label>
                <select 
                  value={targetMonth} 
                  onChange={(e) => setTargetMonth(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <option key={i+1} value={i+1}>Bulan {i+1}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Tahun</label>
                <select 
                  value={targetYear} 
                  onChange={(e) => setTargetYear(parseInt(e.target.value))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                >
                  {[targetYear - 1, targetYear, targetYear + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Billing & Checkout */}
        <div className="w-full lg:w-2/3 bg-white p-6 rounded-xl shadow-sm border border-gray-200 min-h-[500px] flex flex-col">
          {!selectedAnggota ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <DollarSign className="w-16 h-16 mb-4 text-gray-200" />
              <p className="text-lg font-medium text-gray-500">Pilih anggota terlebih dahulu</p>
              <p className="text-sm">Untuk melihat rincian tagihan bulan {targetMonth}/{targetYear}</p>
            </div>
          ) : loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 mb-4 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <span className="text-2xl font-bold">!</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Terjadi Kesalahan</h3>
              <p className="text-red-600 max-w-md">{error}</p>
            </div>
          ) : (depositBills.length === 0 && loanBills.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
              <CheckCircle2 className="w-16 h-16 mb-4 text-green-200" />
              <p className="text-lg font-medium text-gray-500">Semua Tagihan Lunas!</p>
              <p className="text-sm">Tidak ada tagihan tertunggak untuk periode ini.</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <h2 className="font-semibold text-lg text-gray-900">Rincian Tagihan {targetMonth}/{targetYear}</h2>
                <button 
                  onClick={selectAll}
                  className="text-sm text-[var(--color-primary)] hover:underline font-medium"
                >
                  Pilih Semua
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-2">
                {/* DEPOSIT BILLS */}
                {depositBills.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span> Tagihan Simpanan
                    </h3>
                    <div className="space-y-3">
                      {depositBills.map((bill) => {
                        const id = `dep-${bill.member_deposit_id}`;
                        const isSelected = selectedBills[id] !== undefined;
                        return (
                          <div key={id} className={`p-4 border rounded-lg flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between transition-colors ${isSelected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => toggleBillSelection(id, bill.remaining_balance)}
                                className="w-5 h-5 text-[var(--color-primary)] rounded border-gray-300 cursor-pointer"
                              />
                              <div>
                                <p className="font-medium text-gray-900">{bill.deposit_name}</p>
                                <p className="text-xs text-red-500 font-medium mt-0.5">Sisa Tagihan: {formatCurrency(bill.remaining_balance)}</p>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-full sm:w-auto">
                                <label className="text-xs text-gray-500 mb-1 block">Nominal Bayar (Rp)</label>
                                <input 
                                  type="text" 
                                  value={selectedBills[id] ? selectedBills[id].toLocaleString('id-ID') : ''}
                                  onChange={(e) => handleAmountChange(id, e.target.value, bill.remaining_balance)}
                                  className="w-full sm:w-32 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-[var(--color-primary)] text-right font-medium"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* LOAN BILLS */}
                {loanBills.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-3 mt-6 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-orange-500"></span> Cicilan Pinjaman
                    </h3>
                    <div className="space-y-3">
                      {loanBills.map((bill) => {
                        const id = `loan-${bill.id}`;
                        const isSelected = selectedBills[id] !== undefined;
                        return (
                          <div key={id} className={`p-4 border rounded-lg flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between transition-colors ${isSelected ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-gray-200 hover:border-gray-300'}`}>
                            <div className="flex items-center gap-3">
                              <input 
                                type="checkbox" 
                                checked={isSelected}
                                onChange={() => toggleBillSelection(id, bill.remaining_balance)}
                                className="w-5 h-5 text-[var(--color-primary)] rounded border-gray-300 cursor-pointer"
                              />
                              <div>
                                <p className="font-medium text-gray-900">{bill.loan_types?.name || 'Pinjaman'} (Cicilan ke-{bill.bulan_ke})</p>
                                <p className="text-xs text-red-500 font-medium mt-0.5">Sisa Tagihan: {formatCurrency(bill.remaining_balance)}</p>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-full sm:w-auto">
                                <label className="text-xs text-gray-500 mb-1 block">Nominal Bayar (Rp)</label>
                                <input 
                                  type="text" 
                                  value={selectedBills[id] ? selectedBills[id].toLocaleString('id-ID') : ''}
                                  onChange={(e) => handleAmountChange(id, e.target.value, bill.remaining_balance)}
                                  className="w-full sm:w-32 px-3 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-[var(--color-primary)] text-right font-medium"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Checkout Footer */}
              <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50 p-4 rounded-xl">
                <div>
                  <p className="text-sm text-gray-500">Total Pembayaran</p>
                  <p className="text-2xl font-bold text-[var(--color-primary)]">
                    {formatCurrency(getTotalSelected())}
                  </p>
                </div>
                <button
                  onClick={handleProcessPayment}
                  disabled={submitting || getTotalSelected() <= 0}
                  className="w-full sm:w-auto px-8 py-3 bg-[var(--color-primary)] text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  {submitting ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Memproses...</>
                  ) : (
                    'Proses Pembayaran'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
