import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  History, 
  Clock, 
  Ban, 
  Plus, 
  Trash2, 
  Eye, 
  PlayCircle 
} from 'lucide-react';
import { 
  bulkWithdrawalService,
  LebaranDisbursementCycle
} from '../../../services/bulkWithdrawalService';
import CycleRecipientsModal from './CycleRecipientsModal';

interface LebaranDatesTabProps {
  onCyclesUpdated?: (count: number) => void;
}

export default function LebaranDatesTab({ onCyclesUpdated }: LebaranDatesTabProps) {
  const [cyclesHistory, setCyclesHistory] = useState<LebaranDisbursementCycle[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSubmittingDate, setIsSubmittingDate] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Single date form state (input 1 per 1)
  const [singleDate, setSingleDate] = useState('');
  const [singleCycleName, setSingleCycleName] = useState('');

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

  // Handle Add Single Historical Date (1 per 1)
  const handleAddSingleHistoricalDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleDate) {
      alert('Silakan pilih tanggal pencairan terlebih dahulu.');
      return;
    }

    setIsSubmittingDate(true);
    setExecutionError(null);
    try {
      await bulkWithdrawalService.addHistoricalDisbursementDate(
        singleDate,
        singleCycleName.trim() || undefined
      );
      setSuccessMessage(`Tanggal historis ${singleDate} berhasil ditambahkan ke daftar riwayat siklus.`);
      setSingleDate('');
      setSingleCycleName('');
      await loadCyclesData();
    } catch (err: any) {
      setExecutionError(err.message || 'Gagal menambahkan tanggal historis');
    } finally {
      setIsSubmittingDate(false);
    }
  };

  // Handle Delete Cycle Date
  const handleDeleteCycle = async (cycle: LebaranDisbursementCycle) => {
    const cycleDate = cycle.disbursement_date || (cycle.cut_off_date ? cycle.cut_off_date.slice(0, 10) : cycle.created_at.slice(0, 10));
    if (!window.confirm(`Hapus tanggal siklus "${cycle.cycle_name}" (${cycleDate}) dari daftar riwayat?`)) {
      return;
    }

    try {
      await bulkWithdrawalService.deleteHistoricalDisbursementDate(cycle.id);
      setSuccessMessage(`Siklus "${cycle.cycle_name}" berhasil dihapus.`);
      await loadCyclesData();
    } catch (err: any) {
      setExecutionError(err.message || 'Gagal menghapus siklus');
    }
  };

  // Handle Replay All Cycles (Simulasi Pengosongan Ulang)
  const handleExecuteReplay = async () => {
    if (cyclesHistory.length === 0) {
      alert('Belum ada tanggal siklus pencairan yang terdaftar. Tambahkan tanggal pencairan terlebih dahulu.');
      return;
    }

    const confirmMsg = 
      `Apakah Anda yakin ingin menjalankan SIMULASI PENGOSONGAN ULANG (REPLAY) sesuai seluruh ${cyclesHistory.length} tanggal siklus tercatat?\n\n` +
      `Sistem akan mengosongkan mutasi penarikan lebaran sebelumnya dan menghitung ulang setoran anggota secara berantai dari tanggal tertua s/d terbaru sehingga saldo terkini terhitung presisi dari tanggal pencairan terakhir.`;

    if (!window.confirm(confirmMsg)) return;

    setIsReplaying(true);
    setExecutionError(null);
    setSuccessMessage(null);

    try {
      const replayResult = await bulkWithdrawalService.executeReplayAllCycles();
      setSuccessMessage(
        `Pengosongan ulang berhasil dieksekusi (${replayResult.mode === 'rpc' ? 'Engine Atomik Database' : 'Kalkulasi Fallback Klien'}). Total ${replayResult.totalCycles} siklus dan ${replayResult.totalRecipients} mutasi pencairan telah disinkronkan senilai Rp ${replayResult.totalAmount.toLocaleString('id-ID')}. Saldo berjalan telah disegarkan!`
      );
      await loadCyclesData();
    } catch (err: any) {
      console.error('Error executing replay:', err);
      setExecutionError(err.message || 'Gagal menjalankan simulasi pengosongan ulang.');
    } finally {
      setIsReplaying(false);
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

      {/* Panel Utama: Header & Tombol Eksekusi Replay */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                <History className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-800 text-base md:text-lg">
                Daftar Tanggal Pencairan Simpanan Lebaran
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Daftarkan tanggal pencairan lebaran satu per satu untuk mencatat riwayat siklus dan menjalankan pengosongan ulang saldo lebaran.
            </p>
          </div>

          <button
            onClick={handleExecuteReplay}
            disabled={isReplaying || cyclesHistory.length === 0}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-100 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
            title="Mengosongkan dan menghitung ulang mutasi penarikan simpanan lebaran sesuai seluruh tanggal terdaftar"
          >
            <PlayCircle className={`w-4 h-4 ${isReplaying ? 'animate-spin' : ''}`} />
            <span>
              {isReplaying 
                ? 'Sedang Menjalankan Simulasi Replay...' 
                : `Kosongkan Ulang Sesuai Semua Tanggal (${cyclesHistory.length} Siklus)`}
            </span>
          </button>
        </div>

        {/* Form Tambah Tanggal 1 per 1 */}
        <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Tambah Tanggal Pencairan (1 per 1)
            </span>
          </div>

          <form onSubmit={handleAddSingleHistoricalDate} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] max-w-xs">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Tanggal Pencairan <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={singleDate}
                onChange={(e) => setSingleDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                required
              />
            </div>

            <div className="flex-[2] min-w-[250px]">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Keterangan / Nama Siklus (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: Pencairan Lebaran Idul Fitri 2025"
                value={singleCycleName}
                onChange={(e) => setSingleCycleName(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmittingDate || !singleDate}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isSubmittingDate ? 'Menyimpan...' : '+ Tambah Tanggal'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

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
                Daftar siklus pencairan yang terdaftar, diajukan, atau dicatat dalam simulasi berantai
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
            Belum ada riwayat tanggal pencairan lebaran yang tercatat. Silakan tambahkan tanggal pencairan di form atas.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-semibold text-xs uppercase tracking-wider">
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  <th className="py-3 px-4">Tanggal Pencairan</th>
                  <th className="py-3 px-4">Nama Siklus / Keterangan</th>
                  <th className="py-3 px-4 text-center">Sumber</th>
                  <th className="py-3 px-4 text-center">Penerima</th>
                  <th className="py-3 px-4 text-right">Total Cair (Rp)</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cyclesHistory.map((cycle, idx) => {
                  const dateStr = cycle.disbursement_date || (cycle.cut_off_date ? cycle.cut_off_date.slice(0, 10) : cycle.created_at.slice(0, 10));
                  const displayDate = dateStr ? new Date(dateStr).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  }) : '-';

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
                        Penarikan Manual
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
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleViewRecipients(cycle)}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            title="Lihat daftar nominatif penerima pada tanggal ini"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Lihat Penerima</span>
                          </button>

                          <button
                            onClick={() => handleDeleteCycle(cycle)}
                            className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                            title="Hapus tanggal siklus ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
