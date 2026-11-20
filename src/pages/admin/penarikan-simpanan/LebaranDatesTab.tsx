import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Clock, 
  Ban, 
  Eye
} from 'lucide-react';
import { 
  bulkWithdrawalService,
  formatCycleDisplayDate,
  LebaranDisbursementCycle
} from '../../../services/bulkWithdrawalService';
import CycleRecipientsModal from './CycleRecipientsModal';

interface LebaranDatesTabProps {
  onCyclesUpdated?: (count: number) => void;
}

export default function LebaranDatesTab({ onCyclesUpdated }: LebaranDatesTabProps) {
  const [cyclesHistory, setCyclesHistory] = useState<LebaranDisbursementCycle[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Recipients modal state
  const [isRecipientsModalOpen, setIsRecipientsModalOpen] = useState(false);
  const [selectedCycleForRecipients, setSelectedCycleForRecipients] = useState<LebaranDisbursementCycle | null>(null);

  useEffect(() => {
    loadCyclesData();
  }, []);

  const loadCyclesData = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await bulkWithdrawalService.getLebaranDisbursementCycles();
      setCyclesHistory(history);
      onCyclesUpdated?.(history.length);
    } catch (err: any) {
      console.error('Error loading cycles history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // View Recipients
  const handleViewRecipients = (cycle: LebaranDisbursementCycle) => {
    setSelectedCycleForRecipients(cycle);
    setIsRecipientsModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Alert Banners */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{successMessage}</p>
          </div>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {executionError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="font-medium leading-relaxed">{executionError}</p>
          </div>
          <button
            onClick={() => setExecutionError(null)}
            className="text-red-500 hover:text-red-700 font-bold text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabel Riwayat Seluruh Tanggal Siklus */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Riwayat Seluruh Tanggal Pencairan Lebaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tanggal pencairan tercatat secara otomatis setiap kali pencairan massal maupun penarikan perorangan Simpanan Lebaran dieksekusi.
              </p>
            </div>
          </div>
          <button
            onClick={loadCyclesData}
            disabled={isLoadingHistory}
            className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
            <span>Refresh Riwayat</span>
          </button>
        </div>

        {isLoadingHistory ? (
          <div className="py-12 flex justify-center items-center text-slate-400">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : cyclesHistory.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            Belum ada riwayat pencairan Simpanan Lebaran. Tanggal akan tercatat otomatis saat pencairan dieksekusi.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Tanggal Pencairan</th>
                  <th className="py-3 px-4">Nama Siklus / Keterangan</th>
                  <th className="py-3 px-4 text-center">Metode / Sumber</th>
                  <th className="py-3 px-4 text-center">Jumlah Penerima</th>
                  <th className="py-3 px-4 text-right">Total Dicairkan (Rp)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cyclesHistory.map((cycle, idx) => {
                  const displayDate = formatCycleDisplayDate(cycle);

                  // Badge Sumber
                  const src = cycle.source_type || 'MASSAL';
                  let sourceBadge = (
                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold rounded-md">
                      Pencairan Massal
                    </span>
                  );
                  if (src === 'HISTORICAL_INPUT') {
                    sourceBadge = (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold rounded-md">
                        Input Historis
                      </span>
                    );
                  } else if (src === 'MANUAL') {
                    sourceBadge = (
                      <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-semibold rounded-md">
                        Penarikan Perorangan
                      </span>
                    );
                  }

                  // Badge Status
                  let badge = (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg">
                      {cycle.status}
                    </span>
                  );

                  if (cycle.status === 'COMPLETED') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Selesai
                      </span>
                    );
                  } else if (cycle.status === 'APPROVED') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-blue-600" /> Disetujui
                      </span>
                    );
                  } else if (cycle.status === 'DRAFT') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-lg">
                        <Clock className="w-3.5 h-3.5 text-amber-600" /> Draf
                      </span>
                    );
                  } else if (cycle.status === 'REJECTED') {
                    badge = (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-lg">
                        <Ban className="w-3.5 h-3.5 text-red-600" /> Dibatalkan
                      </span>
                    );
                  }

                  return (
                    <tr key={cycle.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-center text-slate-400 text-xs font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 text-xs whitespace-nowrap">
                        {displayDate}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-800">{cycle.cycle_name}</div>
                        {cycle.notes && (
                          <div className="text-xs text-slate-400 font-normal">{cycle.notes}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {sourceBadge}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold text-slate-700 whitespace-nowrap">
                        {cycle.total_members.toLocaleString('id-ID')} Anggota
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-800 whitespace-nowrap">
                        Rp {Number(cycle.total_amount || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {badge}
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleViewRecipients(cycle)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title="Lihat daftar nominatif penerima pada tanggal ini"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Penerima</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Rincian Penerima Per Siklus */}
      <CycleRecipientsModal
        isOpen={isRecipientsModalOpen}
        onClose={() => {
          setIsRecipientsModalOpen(false);
          setSelectedCycleForRecipients(null);
        }}
        cycle={selectedCycleForRecipients}
      />
    </div>
  );
}
