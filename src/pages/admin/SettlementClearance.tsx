import React, { useState, useEffect, useRef } from 'react';
import { Search, Printer, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { Anggota, getAnggotaWithSimpanan } from '../../services/koperasiService';
import { settlementService, SettlementSummary } from '../../services/settlementService';
import { formatCurrency } from '../../utils/formatCurrency';
import { ClearancePrintTemplate } from '../../components/settlement/ClearancePrintTemplate';
import { ClearanceActionModal } from '../../components/settlement/ClearanceActionModal';
import AdminLayout from '../../components/layout/AdminLayout';
export default function SettlementClearance() {
  const [members, setMembers] = useState<Anggota[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedMember, setSelectedMember] = useState<Anggota | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [summary, setSummary] = useState<SettlementSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMembers();
  }, []);

  const fetchMembers = async () => {
    try {
      const data = await getAnggotaWithSimpanan();
      // Only active members can be cleared
      setMembers(data.filter(a => a.status !== 'keluar'));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSelectMember = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mId = e.target.value;
    setSelectedMemberId(mId);
    setSummary(null);
    setError(null);
    setSuccess(null);
    
    if (!mId) {
      setSelectedMember(null);
      return;
    }

    const member = members.find(m => m.id === mId) || null;
    setSelectedMember(member);
    
    if (member) {
      fetchSettlement(member.id);
    }
  };

  const fetchSettlement = async (memberId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await settlementService.getSettlementByMember(memberId);
      setSummary(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const originalContent = document.body.innerHTML;
    
    document.body.innerHTML = printContent;
    window.print();
    document.body.innerHTML = originalContent;
    window.location.reload(); // Quick reload to restore React event listeners after destructive DOM replace
  };

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleConfirmInstantPayoff = async (paymentMethod: string, notes: string) => {
    if (!summary || !selectedMember) return;
    await settlementService.processInstantPayoff(selectedMember.id, paymentMethod, notes);
    setSuccess(`Kliring berhasil diproses. ${selectedMember.nama} telah ditandai keluar (RESIGNED).`);
    resetAfterProcess();
  };

  const handleConfirmDebtorTransition = async (notes: string) => {
    if (!summary || !selectedMember) return;
    await settlementService.processDebtorTransition(selectedMember.id, notes);
    setSuccess(`Kliring berhasil diproses. ${selectedMember.nama} telah ditransisi ke Piutang Eks-Anggota (PENDING_RESIGNED).`);
    resetAfterProcess();
  };

  const resetAfterProcess = () => {
    setSummary(null);
    setSelectedMember(null);
    setSelectedMemberId('');
    fetchMembers(); // refresh
  };

  const filteredMembers = members.filter(m => 
    m.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.nrp.includes(searchTerm)
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Buku Pembantu & Kliring Anggota Keluar</h1>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-center">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-center">
          <CheckCircle className="w-5 h-5 mr-2" />
          {success}
        </div>
      )}

      {/* Readiness Alert if PENDING_RESIGNED and fully paid */}
      {selectedMember?.membership_status === 'READY_TO_RESIGN' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-lg flex items-start gap-3 shadow-sm">
          <Info className="w-6 h-6 shrink-0 mt-0.5 text-blue-600" />
          <div className="flex-1">
            <h3 className="font-bold">Anggota Siap Keluar Final</h3>
            <p className="text-sm mt-1">Sisa pinjaman anggota ini telah lunas sepenuhnya. Anda dapat mengesahkan pengunduran diri final.</p>
          </div>
          <button
            onClick={() => handleConfirmInstantPayoff('Otomatis Lunas', 'Pengesahan final dari status READY_TO_RESIGN')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
          >
            Sahkan Pengunduran Diri Final
          </button>
        </div>
      )}

      {/* Selector Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cari Berdasarkan NRP/Nama
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="text" 
                placeholder="Ketik NRP atau Nama..."
                className="pl-10 w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2.5 bg-gray-50/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Pilih Anggota untuk Kliring
            </label>
            <select
              value={selectedMemberId}
              onChange={handleSelectMember}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 px-4 py-2.5 bg-white font-medium"
            >
              <option value="">-- Pilih Anggota ({filteredMembers.length} hasil) --</option>
              {filteredMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nrp} - {m.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-500">
          Memuat data settlement...
        </div>
      )}

      {!loading && summary && selectedMember && (
        <>
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-green-50 rounded-xl p-6 border border-green-100 shadow-sm">
              <h3 className="text-green-800 text-sm font-medium">Total Hak Simpanan</h3>
              <p className="text-3xl font-bold text-green-700 mt-2">{formatCurrency(summary.total_hak)}</p>
            </div>
            <div className="bg-orange-50 rounded-xl p-6 border border-orange-100 shadow-sm">
              <h3 className="text-orange-800 text-sm font-medium">Total Kewajiban Pinjaman</h3>
              <p className="text-3xl font-bold text-orange-700 mt-2">{formatCurrency(summary.total_kewajiban)}</p>
            </div>
            <div className={`rounded-xl p-6 border shadow-sm ${summary.net_settlement >= 0 ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
              <h3 className={`text-sm font-medium ${summary.net_settlement >= 0 ? 'text-blue-800' : 'text-red-800'}`}>Hak Bersih Anggota (Net Settlement)</h3>
              <p className={`text-4xl font-black mt-2 ${summary.net_settlement >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                {formatCurrency(summary.net_settlement)}
              </p>
              {summary.net_settlement < 0 && (
                <p className="text-red-600 text-xs font-semibold mt-2">* Defisit harus dilunasi sebelum pengesahan.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Tabel Hak */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-800">Rincian Simpanan (Hak)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jenis Simpanan</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Berhak</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summary.deposit_details.map((d, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {d.deposit_name}
                          <span className="block text-xs text-gray-500">
                            {d.can_be_withdrawn ? 'Bisa ditarik harian' : 'Wajib/Pokok (Saat keluar)'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {formatCurrency(d.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabel Kewajiban */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-4 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-800">Rincian Pinjaman Paralel Aktif (Kewajiban)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No/Peruntukan</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sisa Pokok</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summary.loan_details.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-8 text-center text-gray-500 text-sm">
                          Tidak ada pinjaman berjalan
                        </td>
                      </tr>
                    ) : (
                      summary.loan_details.map((l, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {l.loan_number || '-'}
                            <span className="block text-xs text-gray-500">{l.purpose} (Tenor: {l.tenor} bln)</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium text-orange-600">
                            {formatCurrency(l.remaining_balance)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex gap-4 pt-4 border-t border-gray-200 justify-end">
            <button 
              onClick={handlePrint}
              className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center font-medium"
            >
              <Printer className="w-5 h-5 mr-2" />
              Cetak Lembar Settlement (PDF)
            </button>
            <button 
              onClick={handleOpenModal}
              disabled={selectedMember.membership_status === 'RESIGNED' || selectedMember.membership_status === 'PENDING_RESIGNED'}
              className={`px-6 py-2 rounded-lg text-white font-medium flex items-center ${
                selectedMember.membership_status === 'RESIGNED' || selectedMember.membership_status === 'PENDING_RESIGNED'
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Proses Pengunduran Diri
            </button>
          </div>

          {/* Hidden Print Template */}
          <div className="hidden">
            <ClearancePrintTemplate ref={printRef} member={selectedMember} summary={summary} />
          </div>
          
          <ClearanceActionModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            summary={summary}
            member={selectedMember}
            onConfirmInstantPayoff={handleConfirmInstantPayoff}
            onConfirmDebtorTransition={handleConfirmDebtorTransition}
          />
        </>
      )}
    </div>
    </AdminLayout>
  );
}
