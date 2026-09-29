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
  
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [tempAccountNumber, setTempAccountNumber] = useState<string>('');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const normalizeAccount = (acc: string | null) => (acc || '').replace(/[\s-]/g, '');

  const handleSaveInlineEdit = (idx: number) => {
    const newData = [...results];
    const row = newData[idx];
    
    // Update account number
    row.excel_account_number = tempAccountNumber;
    
    // Evaluate status
    const normExcel = normalizeAccount(row.excel_account_number);
    const normDb = normalizeAccount(row.db_account_number);
    
    if (normDb && normExcel === normDb) {
        row.status = 'MATCH';
    } else if (row.status !== 'NOT_FOUND') {
        row.status = 'CONFLICT';
    }
    
    setResults(newData);
    setEditingRowIdx(null);
  };

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
      setCurrentPage(1);
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

  const totalItems = results.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const paginatedResults = results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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
                    <th className="px-4 py-3 font-medium">THP</th>
                    <th className="px-4 py-3 font-medium">Rekening Lama</th>
                    <th className="px-4 py-3 font-medium">Rekening Baru</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {paginatedResults.map((r, idx) => {
                    const actualIdx = (currentPage - 1) * itemsPerPage + idx;
                    return (
                    <tr key={actualIdx} className="hover:bg-surface-container-lowest/50">
                      <td className="px-4 py-3">{r.nrp}</td>
                      <td className="px-4 py-3">{r.nama}</td>
                      <td className="px-4 py-3">Rp {r.take_home_pay?.toLocaleString('id-ID') || '-'}</td>
                      <td className="px-4 py-3">{r.db_account_number || '-'}</td>
                      <td className="px-4 py-3 font-medium text-primary">
                        {editingRowIdx === actualIdx ? (
                           <div className="flex items-center gap-2">
                             <input 
                                type="text"
                                value={tempAccountNumber}
                                onChange={(e) => setTempAccountNumber(e.target.value.replace(/[^0-9-\s]/g, ''))}
                                className="border border-outline-variant rounded px-2 py-1 text-sm w-36 bg-surface-container-lowest"
                                autoFocus
                             />
                             <button onClick={() => handleSaveInlineEdit(actualIdx)} className="text-success hover:text-success/80 flex items-center" title="Simpan">
                               <span className="material-symbols-outlined text-[18px]">check_circle</span>
                             </button>
                             <button onClick={() => setEditingRowIdx(null)} className="text-error hover:text-error/80 flex items-center" title="Batal">
                               <span className="material-symbols-outlined text-[18px]">cancel</span>
                             </button>
                           </div>
                        ) : (
                           <div className="flex items-center gap-2">
                             <span>{r.excel_account_number || '-'}</span>
                             {r.status === 'CONFLICT' && (
                               <button 
                                 onClick={() => { setEditingRowIdx(actualIdx); setTempAccountNumber(r.excel_account_number || ''); }} 
                                 className="text-on-surface-variant hover:text-primary transition-colors flex items-center"
                                 title="Edit Rekening Baru"
                               >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                               </button>
                             )}
                           </div>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-outline-variant/30 flex flex-col md:flex-row justify-between items-center gap-4 text-sm bg-surface-container-low/50">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span>
                  Menampilkan {totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
                  {Math.min(currentPage * itemsPerPage, totalItems)} dari {totalItems} data
                </span>
                <select 
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="ml-2 border border-outline-variant rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-primary bg-surface-container-lowest"
                >
                  <option value={10}>10 / halaman</option>
                  <option value={25}>25 / halaman</option>
                  <option value={50}>50 / halaman</option>
                  <option value={100}>100 / halaman</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="font-medium px-2 text-on-surface">
                  {currentPage} / {totalPages || 1}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="px-3 py-1 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
