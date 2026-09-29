import React, { useState, useEffect } from 'react';
import AdminLayout from '../../../components/layout/AdminLayout';
import { supabase } from '../../../lib/supabaseClient';
import { Search, Wallet, Lock, AlertCircle, ArrowRight, CheckCircle2, Banknote, Landmark } from 'lucide-react';
import { getWithdrawableSavings, withdrawSavings, WithdrawableDeposit } from '../../../services/withdrawal.service';
import WithdrawalReceiptModal from '../../../components/withdrawal/WithdrawalReceiptModal';

interface Anggota {
  id: string;
  nama: string;
  nrp: string;
  pangkat: string;
  bank_account_number?: string;
  bank_name?: string;
}

export default function PenarikanSimpanan() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Anggota[]>([]);
  const [selectedAnggota, setSelectedAnggota] = useState<Anggota | null>(null);
  
  const [withdrawableSavings, setWithdrawableSavings] = useState<WithdrawableDeposit[]>([]);
  const [isLoadingSavings, setIsLoadingSavings] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState<WithdrawableDeposit | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [isFullWithdrawal, setIsFullWithdrawal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'tunai'>('transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Receipt Modal State
  const [receiptData, setReceiptData] = useState<any>(null);

  useEffect(() => {
    if (searchQuery.length >= 3) {
      const delayDebounceFn = setTimeout(() => {
        searchAnggota();
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const searchAnggota = async () => {
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from('anggota')
        .select('id, nama, nrp, pangkat, bank_account_number')
        .eq('status', 'aktif')
        .or(`nama.ilike.%${searchQuery}%,nrp.ilike.%${searchQuery}%`)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error('Error searching anggota:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectAnggota = async (anggota: Anggota) => {
    setSelectedAnggota(anggota);
    setSearchQuery('');
    setSearchResults([]);
    
    setIsLoadingSavings(true);
    try {
      const savings = await getWithdrawableSavings(anggota.id);
      setWithdrawableSavings(savings);
    } catch (err) {
      console.error('Error fetching savings:', err);
    } finally {
      setIsLoadingSavings(false);
    }
  };

  const handleOpenWithdraw = (deposit: WithdrawableDeposit, isFull: boolean = false) => {
    setSelectedDeposit(deposit);
    setIsFullWithdrawal(isFull);
    setWithdrawAmount(isFull ? deposit.saldo.toString() : '');
    setError('');
    setIsModalOpen(true);
  };

  const handleSubmitWithdrawal = async () => {
    if (!selectedDeposit || !selectedAnggota) return;
    
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Nominal tidak valid');
      return;
    }
    if (amountNum > selectedDeposit.saldo) {
      setError('Nominal melebihi saldo tersedia');
      return;
    }

    setIsSubmitting(true);
    setError('');
    
    try {
      const methodText = paymentMethod === 'transfer' 
        ? `Transfer (${selectedAnggota.bank_name || 'Bank'} - ${selectedAnggota.bank_account_number || '-'})` 
        : 'Tunai Kasir';
        
      const tx = await withdrawSavings({
        member_deposit_id: selectedDeposit.member_deposit_id,
        amount: amountNum,
        payment_method: paymentMethod,
        description: `Pencairan ${selectedDeposit.deposit_name} - ${methodText}`
      });

      // Show receipt
      setReceiptData({
        transactionId: tx.id,
        member: selectedAnggota,
        depositName: selectedDeposit.deposit_name,
        amount: amountNum,
        paymentMethod: methodText,
        date: new Date().toISOString()
      });

      setIsModalOpen(false);
      
      // Refresh savings
      const savings = await getWithdrawableSavings(selectedAnggota.id);
      setWithdrawableSavings(savings);
      
    } catch (err: any) {
      setError(err.message || 'Terjadi kesalahan saat penarikan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header & Breadcrumb */}
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <span>SIMKOP</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span>Simpan Pinjam</span>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-emerald-600 font-medium">Penarikan Simpanan</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Penarikan & Pencairan Simpanan</h1>
          <p className="text-slate-500">Cairkan simpanan sukarela / berkala milik anggota aktif.</p>
        </div>

        {/* Search Bar */}
        <div className="relative z-10 max-w-2xl">
          <div className="relative flex items-center">
            <Search className="absolute left-4 text-slate-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Cari NRP atau Nama Anggota..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
            />
            {isSearching && (
              <div className="absolute right-4 w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
              {searchResults.map((anggota) => (
                <button
                  key={anggota.id}
                  onClick={() => handleSelectAnggota(anggota)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 text-left"
                >
                  <div>
                    <div className="font-medium text-slate-800">{anggota.nama}</div>
                    <div className="text-sm text-slate-500">{anggota.nrp} • {anggota.pangkat}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Member Profile & Cards */}
        {selectedAnggota && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Member Profile Card */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center font-bold text-xl">
                  {selectedAnggota.nama.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedAnggota.nama}</h2>
                  <p className="text-slate-500">{selectedAnggota.nrp} • {selectedAnggota.pangkat}</p>
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
                <Landmark className="text-slate-400 w-5 h-5" />
                <div>
                  <div className="text-xs text-slate-500 font-medium uppercase">Rekening Bank</div>
                  <div className="font-semibold text-slate-700">
                    {selectedAnggota.bank_name || 'Belum diisi'} - {selectedAnggota.bank_account_number || '-'}
                  </div>
                </div>
              </div>
            </div>

            {/* Savings Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoadingSavings ? (
                <div className="col-span-full py-12 flex justify-center">
                  <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {withdrawableSavings.map((deposit) => (
                    <div key={deposit.member_deposit_id} className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-hidden flex flex-col">
                      <div className="p-5 flex-1">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2">
                            <Wallet className="text-emerald-500 w-5 h-5" />
                            <h3 className="font-bold text-slate-800">{deposit.deposit_name}</h3>
                          </div>
                          <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-md">
                            Bisa Ditarik
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mb-1">Saldo Tersedia</p>
                        <p className="text-2xl font-black text-slate-800">
                          Rp {deposit.saldo.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="p-3 bg-emerald-50/50 border-t border-emerald-100 grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => handleOpenWithdraw(deposit, false)}
                          className="px-4 py-2 text-sm font-medium text-emerald-700 bg-white border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
                        >
                          Tarik Sebagian
                        </button>
                        <button 
                          onClick={() => handleOpenWithdraw(deposit, true)}
                          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-200"
                        >
                          Cairkan Penuh
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Mock Simpanan Pokok (Non-withdrawable) */}
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col opacity-75">
                    <div className="p-5 flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <Lock className="text-slate-400 w-5 h-5" />
                          <h3 className="font-bold text-slate-600">Simpanan Pokok & Wajib</h3>
                        </div>
                        <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs font-bold rounded-md flex items-center gap-1">
                          <Lock className="w-3 h-3" /> Terkunci
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 mb-1">Status Penarikan</p>
                      <p className="text-sm font-medium text-slate-700">
                        Hanya bisa dicairkan saat pengunduran diri (Kliring).
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Withdrawal Modal */}
      {isModalOpen && selectedDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">Tarik Simpanan</h2>
              <p className="text-slate-500 text-sm mt-1">{selectedDeposit.deposit_name}</p>
            </div>
            <div className="p-6 space-y-5">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nominal Penarikan</label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-slate-500 font-medium">Rp</span>
                  <input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => {
                      setWithdrawAmount(e.target.value);
                      setIsFullWithdrawal(parseFloat(e.target.value) === selectedDeposit.saldo);
                    }}
                    className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-lg"
                    placeholder="0"
                  />
                </div>
                <div className="mt-2 flex justify-between items-center text-sm">
                  <span className="text-slate-500">Saldo Maksimal: Rp {selectedDeposit.saldo.toLocaleString('id-ID')}</span>
                  <button 
                    onClick={() => {
                      setWithdrawAmount(selectedDeposit.saldo.toString());
                      setIsFullWithdrawal(true);
                    }}
                    className="text-emerald-600 font-medium hover:underline"
                  >
                    Tarik Semua
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Metode Penyaluran Dana</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setPaymentMethod('transfer')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      paymentMethod === 'transfer' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Landmark className="w-6 h-6 mb-2" />
                    <span className="font-medium text-sm">Transfer Bank</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod('tunai')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                      paymentMethod === 'tunai' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Banknote className="w-6 h-6 mb-2" />
                    <span className="font-medium text-sm">Tunai Kasir</span>
                  </button>
                </div>
                
                {paymentMethod === 'transfer' && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                    <span className="text-slate-500 block mb-1">Transfer ke Rekening:</span>
                    {selectedAnggota?.bank_account_number ? (
                      <span className="font-semibold text-slate-800">{selectedAnggota.bank_name} - {selectedAnggota.bank_account_number}</span>
                    ) : (
                      <span className="text-red-500 font-medium flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Anggota belum mendaftarkan rekening bank</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-4 py-3 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
                disabled={isSubmitting}
              >
                Batal
              </button>
              <button
                onClick={handleSubmitWithdrawal}
                disabled={isSubmitting || (paymentMethod === 'transfer' && !selectedAnggota?.bank_account_number)}
                className="flex-[2] px-4 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm flex justify-center items-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Proses Penarikan <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptData && (
        <WithdrawalReceiptModal 
          data={receiptData}
          onClose={() => setReceiptData(null)}
        />
      )}
    </AdminLayout>
  );
}
