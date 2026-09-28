import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { SettlementSummary } from '../../services/settlementService';
import { Anggota } from '../../services/koperasiService';

interface ClearanceActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  summary: SettlementSummary;
  member: Anggota;
  onConfirmInstantPayoff: (paymentMethod: string, notes: string) => Promise<void>;
  onConfirmDebtorTransition: (notes: string) => Promise<void>;
}

export const ClearanceActionModal: React.FC<ClearanceActionModalProps> = ({
  isOpen,
  onClose,
  summary,
  member,
  onConfirmInstantPayoff,
  onConfirmDebtorTransition
}) => {
  const isDeficit = summary.net_settlement < 0;
  
  // Tab state for deficit handling: 'instant' | 'debtor'
  const [activeTab, setActiveTab] = useState<'instant' | 'debtor'>('instant');
  
  // Form state
  const [paymentMethod, setPaymentMethod] = useState('Tunai Kasir');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProcess = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      if (isDeficit) {
        if (activeTab === 'instant') {
          await onConfirmInstantPayoff(paymentMethod, notes);
        } else {
          await onConfirmDebtorTransition(notes);
        }
      } else {
        // Surplus is treated as instant payoff where the coop pays the member
        await onConfirmInstantPayoff('Transfer Bank', notes); 
      }
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-xl font-bold text-gray-900">Konfirmasi Pengunduran Diri</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
            <p className="text-sm text-gray-600 mb-1">Anggota:</p>
            <p className="font-semibold text-lg">{member.nama} ({member.nrp})</p>
            <div className="flex gap-6 mt-4">
              <div>
                <p className="text-xs text-gray-500">Total Hak</p>
                <p className="font-semibold text-green-600">{formatCurrency(summary.total_hak)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Sisa Utang</p>
                <p className="font-semibold text-red-600">{formatCurrency(summary.total_kewajiban)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Hak Bersih</p>
                <p className={`font-bold ${isDeficit ? 'text-red-700' : 'text-blue-700'}`}>
                  {formatCurrency(summary.net_settlement)}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 text-red-600 p-4 rounded-lg flex items-start gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {!isDeficit ? (
            // SURPLUS SCENARIO
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex gap-3 text-blue-800 text-sm">
                <Info className="w-5 h-5 shrink-0" />
                <p>
                  Anggota memiliki surplus. Setelah proses ini, status anggota akan menjadi <strong>Keluar Final (RESIGNED)</strong> dan koperasi berkewajiban menyerahkan dana sebesar {formatCurrency(summary.net_settlement)} kepada anggota.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Penyerahan Dana</label>
                <textarea
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Misal: Ditransfer ke rekening BCA anggota..."
                />
              </div>
            </div>
          ) : (
            // DEFICIT SCENARIO
            <div className="space-y-6">
              <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg text-orange-800 text-sm flex gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>
                  Anggota memiliki <strong>defisit (utang lebih besar dari simpanan)</strong> sebesar {formatCurrency(Math.abs(summary.net_settlement))}. Pilih metode penyelesaian di bawah ini:
                </p>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-200">
                <button
                  className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'instant' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('instant')}
                >
                  Pelunasan Seketika
                </button>
                <button
                  className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'debtor' 
                      ? 'border-blue-600 text-blue-600' 
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTab('debtor')}
                >
                  Transisi ke Piutang Eks-Anggota
                </button>
              </div>

              {/* Tab Content */}
              <div className="pt-2">
                {activeTab === 'instant' ? (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <p className="text-sm text-gray-600">
                      Anggota melunasi sisa utang saat ini juga. Status anggota akan langsung menjadi <strong>Keluar Final (RESIGNED)</strong>.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Metode Pembayaran</label>
                        <select
                          className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          value={paymentMethod}
                          onChange={e => setPaymentMethod(e.target.value)}
                        >
                          <option value="Tunai Kasir">Tunai Kasir</option>
                          <option value="Transfer Bank">Transfer Bank</option>
                          <option value="Potong Gaji Terakhir">Potong Gaji Terakhir</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Catatan / Bukti Bayar</label>
                      <textarea
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        rows={3}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Misal: Lunas via transfer Mandiri..."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-2 text-sm text-gray-700">
                      <p><strong>Implikasi Opsi Ini:</strong></p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Semua hak simpanan ditarik untuk memotong pokok pinjaman.</li>
                        <li>Status anggota menjadi <strong>PENDING_RESIGNED</strong> (Menunggu Lunas).</li>
                        <li>Pemotongan/tagihan Simpanan Wajib & Belanja <strong>dihentikan permanen</strong>.</li>
                        <li>Jadwal cicilan utang pinjaman <strong>tetap berjalan</strong> hingga lunas.</li>
                      </ul>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Catatan Persetujuan</label>
                      <textarea
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        rows={3}
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Misal: Anggota setuju mencicil sisa utang selama 6 bulan..."
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            {isProcessing ? 'Memproses...' : (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Konfirmasi & Proses
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
