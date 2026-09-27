import React, { useState } from 'react';
import { downloadSalaryTemplate } from '../../services/salaryTemplateService';
import { 
    parseSalaryReconciliationFile, 
    ReconciliationResult, 
    confirmSalaryReconciliation 
} from '../../services/salaryImportService';
import AdminLayout from '../../components/layout/AdminLayout';

export default function SalaryImport() {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      await downloadSalaryTemplate();
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
      const data = await parseSalaryReconciliationFile(file);
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
      const payload = results.map(r => ({
        nrp: r.nrp,
        take_home_pay: r.take_home_pay,
        final_account_number: r.excel_account_number || r.db_account_number // simplistic logic for now
      }));
      await confirmSalaryReconciliation(payload);
      setSuccessMsg('Rekonsiliasi berhasil disimpan!');
      setResults([]);
      setFile(null);
    } catch (err: any) {
      setErrorMsg('Gagal menyimpan konfirmasi: ' + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-title-lg font-title-lg text-primary">Import Gaji & Rekening</h1>
          <p className="text-body-md text-on-surface-variant">
            Unduh template, isi Take Home Pay, lalu unggah kembali untuk melakukan sinkronisasi data rekening dan gaji anggota.
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
          <div className="flex gap-4">
            <button
              onClick={handleDownloadTemplate}
              className="px-6 py-2 rounded-lg bg-primary text-on-primary font-label-lg transition-colors hover:bg-primary/90 flex items-center gap-2"
            >
              <span className="material-symbols-outlined">download</span>
              Unduh Template
            </button>
          </div>

          <div className="border-t border-outline-variant/30 pt-6 space-y-4">
            <h3 className="text-title-md font-title-md text-on-surface">Unggah File Rekonsiliasi</h3>
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
                {isParsing ? 'Memproses...' : 'Proses File'}
              </button>
            </div>
          </div>
        </div>

        {results.length > 0 && (
          <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 space-y-6 shadow-sm">
            <div className="flex justify-between items-center">
              <h3 className="text-title-md font-title-md text-on-surface">Hasil Pengecekan ({results.length} baris)</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const confirmed = window.confirm("Apakah Anda yakin ingin membatalkan? Data hasil pengecekan yang belum disimpan akan hilang.");
                    if (confirmed) {
                        setResults([]);
                        setFile(null);
                        setErrorMsg(null);
                        setSuccessMsg(null);
                    }
                  }}
                  disabled={isConfirming}
                  className="px-6 py-2 rounded-lg border border-outline-variant text-on-surface-variant font-label-lg transition-colors hover:bg-surface-container-high hover:text-on-surface disabled:opacity-50"
                >
                  Batal Konfirmasi
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="px-6 py-2 rounded-lg bg-primary text-on-primary font-label-lg transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {isConfirming ? 'Menyimpan...' : 'Simpan Konfirmasi'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-outline-variant/30">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3 font-medium">NRP</th>
                    <th className="px-4 py-3 font-medium">Nama</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">THP</th>
                    <th className="px-4 py-3 font-medium">Rekening Lama</th>
                    <th className="px-4 py-3 font-medium">Rekening Baru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {results.map((r, idx) => (
                    <tr key={idx} className="hover:bg-surface-container-lowest/50">
                      <td className="px-4 py-3">{r.nrp}</td>
                      <td className="px-4 py-3">{r.nama}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            r.status === 'MATCH' ? 'bg-success/20 text-success' :
                            r.status === 'CONFLICT' ? 'bg-error/20 text-error' :
                            'bg-surface-variant text-on-surface-variant'
                        }`}>
                            {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">Rp {r.take_home_pay?.toLocaleString('id-ID') || '-'}</td>
                      <td className="px-4 py-3">{r.db_account_number || '-'}</td>
                      <td className="px-4 py-3 font-medium text-primary">{r.excel_account_number || '-'}</td>
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
