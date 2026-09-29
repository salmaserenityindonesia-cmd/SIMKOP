import React, { useState } from 'react';
import { 
    downloadBatchTemplate, 
    parseBatchUpdateFile, 
    executeBatchUpdate,
    BatchPreviewRow
} from '../../services/batchUpdateService';
import AdminLayout from '../../components/layout/AdminLayout';

export default function BatchUpdater() {
  const [updateType, setUpdateType] = useState<'savings' | 'loans'>('savings');
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<BatchPreviewRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const handleDownloadTemplate = async () => {
    try {
      await downloadBatchTemplate(updateType, month, year);
    } catch (err: any) {
      setErrorMsg('Gagal mengunduh template: ' + err.message);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setResults([]);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setIsParsing(true);
    setErrorMsg(null);
    try {
      const data = await parseBatchUpdateFile(file, updateType, month, year);
      setResults(data);
    } catch (err: any) {
      setErrorMsg('Gagal memproses file: ' + err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (results.length === 0) return;
    setIsConfirming(true);
    setErrorMsg(null);
    try {
      await executeBatchUpdate(results, updateType, month, year);
      setSuccessMsg('Update massal berhasil dieksekusi!');
      setResults([]);
      setFile(null);
    } catch (err: any) {
      setErrorMsg('Gagal mengeksekusi update: ' + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  const totalCollected = results.reduce((sum, r) => sum + r.nominal_baru, 0);
  const validRows = results.filter(r => r.status === 'READY').length;

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <div className="flex items-center gap-2 text-label-md font-label-md text-on-surface-variant mb-2">
              <span className="font-title-sm text-primary">SIMKOP</span>
              <span className="text-outline-variant">/</span>
              <span>Simpan Pinjam</span>
              <span className="text-outline-variant">/</span>
              <span className="text-on-surface font-title-sm">Update Massal Bulanan</span>
          </div>
          <h1 className="text-title-lg font-title-lg text-primary">Update Massal Bulanan</h1>
          <p className="text-body-md text-on-surface-variant">
            Gunakan fitur ini untuk memutakhirkan pembayaran simpanan atau angsuran pinjaman anggota secara massal via Excel (.xlsx).
          </p>
        </div>

        {errorMsg && (
            <div className="p-4 rounded-lg bg-error-container text-on-error-container">
                {errorMsg}
            </div>
        )}

        {successMsg && (
            <div className="p-4 rounded-lg bg-success-container text-on-success-container">
                {successMsg}
            </div>
        )}

        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 space-y-6 shadow-sm">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-label-sm font-label-sm text-on-surface-variant">Jenis Update</label>
              <select 
                value={updateType} 
                onChange={(e) => setUpdateType(e.target.value as 'savings' | 'loans')}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 text-on-surface"
              >
                <option value="savings">Update Simpanan Bulanan</option>
                <option value="loans">Update Angsuran Pinjaman</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-label-sm text-on-surface-variant">Bulan</label>
              <select 
                value={month} 
                onChange={(e) => setMonth(parseInt(e.target.value))}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 text-on-surface"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i+1} value={i+1}>{new Date(0, i).toLocaleString('id-ID', { month: 'long' })}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-label-sm font-label-sm text-on-surface-variant">Tahun</label>
              <input 
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-2 text-on-surface"
              />
            </div>
            
            <button
              onClick={handleDownloadTemplate}
              className="px-6 py-2 rounded-lg bg-emerald-600 text-white font-label-lg transition-colors hover:bg-emerald-700 flex items-center gap-2"
            >
              <span className="material-symbols-outlined">download</span>
              Unduh Template Terisi
            </button>
          </div>

          <div className="border-t border-outline-variant/30 pt-6 space-y-4">
            <h3 className="text-title-md font-title-md text-on-surface">Unggah File Pemutakhiran (.xlsx)</h3>
            <div className="flex gap-4 items-center">
              <input
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                className="block w-full text-sm text-on-surface-variant
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-semibold
                  file:bg-secondary-container file:text-on-secondary-container
                  hover:file:bg-secondary-container/80"
              />
              <button
                onClick={handleParse}
                disabled={!file || isParsing}
                className="px-6 py-2 rounded-lg bg-secondary text-on-secondary font-label-lg transition-colors hover:bg-secondary/90 disabled:opacity-50 whitespace-nowrap"
              >
                {isParsing ? 'Memproses...' : 'Review & Konfirmasi'}
              </button>
            </div>
          </div>
        </div>

        {results.length > 0 && (
          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 space-y-6 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-title-md font-title-md text-on-surface">Modal Konfirmasi Pratinjau</h3>
                <div className="flex gap-6 mt-2 text-sm text-on-surface-variant">
                    <div>Total Baris: <span className="font-semibold text-on-surface">{results.length}</span></div>
                    <div>Baris Valid: <span className="font-semibold text-success">{validRows}</span></div>
                    <div>Baris Error/Konflik: <span className="font-semibold text-error">{results.length - validRows}</span></div>
                    <div>Total Nominal: <span className="font-semibold text-primary">Rp {totalCollected.toLocaleString('id-ID')}</span></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (window.confirm("Batal melakukan pemutakhiran?")) {
                        setResults([]);
                        setFile(null);
                    }
                  }}
                  disabled={isConfirming}
                  className="px-6 py-2 rounded-lg border border-outline-variant text-on-surface-variant font-label-lg transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
                >
                  Batal Konfirmasi
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming || validRows === 0}
                  className="px-6 py-2 rounded-lg bg-primary text-on-primary font-label-lg transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isConfirming ? 'Mengeksekusi...' : 'Eksekusi Update Database'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-outline-variant/30 max-h-[60vh]">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low text-on-surface-variant sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-medium">NRP</th>
                    <th className="px-4 py-3 font-medium">Nama</th>
                    <th className="px-4 py-3 font-medium">Periode</th>
                    <th className="px-4 py-3 font-medium">Jenis/Kontrak</th>
                    <th className="px-4 py-3 font-medium text-right">Nilai Lama</th>
                    <th className="px-4 py-3 font-medium text-right">Nilai Baru</th>
                    <th className="px-4 py-3 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {results.map((r, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-lowest/50">
                      <td className="px-4 py-3">{r.nrp}</td>
                      <td className="px-4 py-3">{r.nama}</td>
                      <td className="px-4 py-3">{r.periode}</td>
                      <td className="px-4 py-3">{r.jenis_tagihan}</td>
                      <td className="px-4 py-3 text-right">Rp {r.nominal_lama.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-right font-medium text-primary">Rp {r.nominal_baru.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wider ${
                            r.status === 'READY' ? 'bg-success/20 text-success' :
                            r.status === 'MISMATCH' ? 'bg-error/20 text-error' :
                            'bg-error text-on-error'
                        }`}>
                            {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
