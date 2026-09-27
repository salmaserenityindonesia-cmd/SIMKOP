import React, { useState, useEffect } from 'react';
import { 
  getDepositTypes, 
  addDepositType, 
  updateDepositType, 
  deleteDepositType, 
  getLoanTypes, 
  addLoanType, 
  updateLoanType, 
  deleteLoanType,
  DepositType,
  LoanType
} from '../../services/koperasiService';
import { formatCurrency } from '../../utils/formatCurrency';
import AdminLayout from '../../components/layout/AdminLayout';

export default function ManajemenProdukSimpanPinjam() {
  const [activeTab, setActiveTab] = useState<'simpanan' | 'pinjaman'>('simpanan');
  
  // Data States
  const [depositTypes, setDepositTypes] = useState<DepositType[]>([]);
  const [loanTypes, setLoanTypes] = useState<LoanType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal States
  const [isDepositModalOpen, setDepositModalOpen] = useState(false);
  const [isLoanModalOpen, setLoanModalOpen] = useState(false);
  
  // Form States
  const [depositForm, setDepositForm] = useState<Partial<DepositType>>({});
  const [loanForm, setLoanForm] = useState<Partial<LoanType>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [dTypes, lTypes] = await Promise.all([
        getDepositTypes(),
        getLoanTypes()
      ]);
      setDepositTypes(dTypes);
      setLoanTypes(lTypes);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Deposit Handlers
  const openDepositModal = (type?: DepositType) => {
    if (type) {
      setDepositForm(type);
    } else {
      setDepositForm({
        frequency_type: 'monthly',
        default_amount: 0,
        can_be_withdrawn: false,
        is_active: true
      });
    }
    setDepositModalOpen(true);
  };

  const handleSaveDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (depositForm.id) {
        await updateDepositType(depositForm.id, depositForm as Omit<DepositType, 'id'>);
      } else {
        await addDepositType(depositForm as Omit<DepositType, 'id'>);
      }
      setDepositModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteDeposit = async (id: string) => {
    if (window.confirm('Yakin ingin menghapus jenis simpanan ini?')) {
      try {
        await deleteDepositType(id);
        fetchData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  // Loan Handlers
  const openLoanModal = (type?: LoanType) => {
    if (type) {
      setLoanForm(type);
    } else {
      setLoanForm({
        max_duration_months: 12,
        is_active: true
      });
    }
    setLoanModalOpen(true);
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (loanForm.id) {
        await updateLoanType(loanForm.id, loanForm as Omit<LoanType, 'id'>);
      } else {
        await addLoanType(loanForm as Omit<LoanType, 'id'>);
      }
      setLoanModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteLoan = async (id: string) => {
    if (window.confirm('Yakin ingin menghapus jenis pinjaman ini?')) {
      try {
        await deleteLoanType(id);
        fetchData();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col gap-2">
        <h1 className="text-display-sm font-display-sm text-primary">Master Produk Simpan Pinjam</h1>
        <p className="text-body-lg text-on-surface-variant">Konfigurasi jenis simpanan dan pinjaman dinamis untuk anggota koperasi.</p>
      </div>

      {error && (
        <div className="bg-error-container text-on-error-container p-4 rounded-xl text-body-md font-medium">
          {error}
        </div>
      )}

      {/* TABS */}
      <div className="flex gap-4 border-b border-outline-variant/30 pb-2">
        <button 
          onClick={() => setActiveTab('simpanan')}
          className={`flex items-center gap-2 px-6 py-3 rounded-t-lg font-title-sm transition-colors relative ${activeTab === 'simpanan' ? 'text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
        >
          <span className="material-symbols-outlined">account_balance_wallet</span>
          Jenis Simpanan
          {activeTab === 'simpanan' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"></div>}
        </button>
        <button 
          onClick={() => setActiveTab('pinjaman')}
          className={`flex items-center gap-2 px-6 py-3 rounded-t-lg font-title-sm transition-colors relative ${activeTab === 'pinjaman' ? 'text-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
        >
          <span className="material-symbols-outlined">credit_card</span>
          Jenis Pinjaman
          {activeTab === 'pinjaman' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"></div>}
        </button>
      </div>

      {/* TAB CONTENT: SIMPANAN */}
      {activeTab === 'simpanan' && (
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-title-lg font-title-lg text-on-surface">Daftar Jenis Simpanan</h2>
            <button 
              onClick={() => openDepositModal()}
              className="bg-primary text-on-primary hover:bg-primary/90 px-5 py-2.5 rounded-xl font-label-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Tambah Simpanan
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-on-surface font-title-sm">
                  <th className="p-4 border-b border-outline-variant/20">Kode</th>
                  <th className="p-4 border-b border-outline-variant/20">Nama</th>
                  <th className="p-4 border-b border-outline-variant/20">Frekuensi</th>
                  <th className="p-4 border-b border-outline-variant/20">Default Jumlah</th>
                  <th className="p-4 border-b border-outline-variant/20">Bisa Ditarik?</th>
                  <th className="p-4 border-b border-outline-variant/20">Status</th>
                  <th className="p-4 border-b border-outline-variant/20 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {depositTypes.map(type => (
                  <tr key={type.id} className="hover:bg-surface-container-lowest transition-colors border-b border-outline-variant/10">
                    <td className="p-4 text-body-md font-medium">{type.code}</td>
                    <td className="p-4 text-body-md">{type.name}</td>
                    <td className="p-4 text-body-md capitalize">{type.frequency_type}</td>
                    <td className="p-4 text-body-md">{formatCurrency(type.default_amount)}</td>
                    <td className="p-4 text-body-md">
                      {type.can_be_withdrawn ? <span className="text-primary font-medium">Ya</span> : <span className="text-error font-medium">Tidak</span>}
                    </td>
                    <td className="p-4 text-body-md">
                      {type.is_active ? <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-label-sm">Aktif</span> : <span className="px-2.5 py-1 rounded-full bg-surface-variant text-on-surface-variant text-label-sm">Non-Aktif</span>}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button onClick={() => openDepositModal(type)} className="p-2 text-primary hover:bg-primary-container rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button onClick={() => handleDeleteDeposit(type.id)} className="p-2 text-error hover:bg-error-container rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {depositTypes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-on-surface-variant text-body-md">Belum ada data jenis simpanan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB CONTENT: PINJAMAN */}
      {activeTab === 'pinjaman' && (
        <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/20">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-title-lg font-title-lg text-on-surface">Daftar Jenis Pinjaman</h2>
            <button 
              onClick={() => openLoanModal()}
              className="bg-primary text-on-primary hover:bg-primary/90 px-5 py-2.5 rounded-xl font-label-lg flex items-center gap-2 transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Tambah Pinjaman
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-outline-variant/20">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-low text-on-surface font-title-sm">
                  <th className="p-4 border-b border-outline-variant/20">Kode</th>
                  <th className="p-4 border-b border-outline-variant/20">Nama</th>
                  <th className="p-4 border-b border-outline-variant/20">Max Tenor (Bulan)</th>
                  <th className="p-4 border-b border-outline-variant/20">Status</th>
                  <th className="p-4 border-b border-outline-variant/20 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loanTypes.map(type => (
                  <tr key={type.id} className="hover:bg-surface-container-lowest transition-colors border-b border-outline-variant/10">
                    <td className="p-4 text-body-md font-medium">{type.code}</td>
                    <td className="p-4 text-body-md">{type.name}</td>
                    <td className="p-4 text-body-md">{type.max_duration_months} Bulan</td>
                    <td className="p-4 text-body-md">
                      {type.is_active ? <span className="px-2.5 py-1 rounded-full bg-secondary-container text-on-secondary-container text-label-sm">Aktif</span> : <span className="px-2.5 py-1 rounded-full bg-surface-variant text-on-surface-variant text-label-sm">Non-Aktif</span>}
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button onClick={() => openLoanModal(type)} className="p-2 text-primary hover:bg-primary-container rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[20px]">edit</span>
                      </button>
                      <button onClick={() => handleDeleteLoan(type.id)} className="p-2 text-error hover:bg-error-container rounded-lg transition-colors">
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {loanTypes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-on-surface-variant text-body-md">Belum ada data jenis pinjaman.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DEPOSIT MODAL */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
              <h3 className="text-title-lg font-title-lg text-on-surface">{depositForm.id ? 'Edit' : 'Tambah'} Jenis Simpanan</h3>
              <button onClick={() => setDepositModalOpen(false)} className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveDeposit} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Kode</label>
                <input required type="text" value={depositForm.code || ''} onChange={e => setDepositForm({...depositForm, code: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Misal: SP, SW" />
              </div>
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Nama Simpanan</label>
                <input required type="text" value={depositForm.name || ''} onChange={e => setDepositForm({...depositForm, name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Misal: Simpanan Pokok" />
              </div>
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Frekuensi</label>
                <select value={depositForm.frequency_type || 'monthly'} onChange={e => setDepositForm({...depositForm, frequency_type: e.target.value as any})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all">
                  <option value="once">Sekali (Di awal)</option>
                  <option value="monthly">Bulanan</option>
                  <option value="yearly">Tahunan</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Default Jumlah (Rp)</label>
                <input required type="number" min="0" value={depositForm.default_amount || 0} onChange={e => setDepositForm({...depositForm, default_amount: Number(e.target.value)})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <input type="checkbox" id="can_be_withdrawn" checked={depositForm.can_be_withdrawn || false} onChange={e => setDepositForm({...depositForm, can_be_withdrawn: e.target.checked})} className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary" />
                <label htmlFor="can_be_withdrawn" className="text-body-md text-on-surface cursor-pointer">Bisa Ditarik sewaktu-waktu?</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="is_active_dep" checked={depositForm.is_active !== false} onChange={e => setDepositForm({...depositForm, is_active: e.target.checked})} className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary" />
                <label htmlFor="is_active_dep" className="text-body-md text-on-surface cursor-pointer">Aktif?</label>
              </div>
              
              <div className="pt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setDepositModalOpen(false)} className="px-5 py-2.5 text-on-surface hover:bg-surface-container-low rounded-xl font-label-lg transition-colors">Batal</button>
                <button type="submit" className="bg-primary text-on-primary hover:bg-primary/90 px-6 py-2.5 rounded-xl font-label-lg transition-colors shadow-sm">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOAN MODAL */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-outline-variant/20 flex justify-between items-center">
              <h3 className="text-title-lg font-title-lg text-on-surface">{loanForm.id ? 'Edit' : 'Tambah'} Jenis Pinjaman</h3>
              <button onClick={() => setLoanModalOpen(false)} className="text-on-surface-variant hover:bg-surface-container-low p-2 rounded-full transition-colors">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleSaveLoan} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Kode</label>
                <input required type="text" value={loanForm.code || ''} onChange={e => setLoanForm({...loanForm, code: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Misal: PN, PB" />
              </div>
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Nama Pinjaman</label>
                <input required type="text" value={loanForm.name || ''} onChange={e => setLoanForm({...loanForm, name: e.target.value})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" placeholder="Misal: Pinjaman Normal" />
              </div>
              <div className="space-y-1.5">
                <label className="text-label-md font-label-md text-on-surface">Maksimal Tenor (Bulan)</label>
                <input required type="number" min="1" value={loanForm.max_duration_months || 12} onChange={e => setLoanForm({...loanForm, max_duration_months: Number(e.target.value)})} className="w-full px-4 py-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest text-body-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <input type="checkbox" id="is_active_loan" checked={loanForm.is_active !== false} onChange={e => setLoanForm({...loanForm, is_active: e.target.checked})} className="w-5 h-5 rounded border-outline-variant text-primary focus:ring-primary" />
                <label htmlFor="is_active_loan" className="text-body-md text-on-surface cursor-pointer">Aktif?</label>
              </div>
              
              <div className="pt-6 flex justify-end gap-3">
                <button type="button" onClick={() => setLoanModalOpen(false)} className="px-5 py-2.5 text-on-surface hover:bg-surface-container-low rounded-xl font-label-lg transition-colors">Batal</button>
                <button type="submit" className="bg-primary text-on-primary hover:bg-primary/90 px-6 py-2.5 rounded-xl font-label-lg transition-colors shadow-sm">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </AdminLayout>
  );
}
