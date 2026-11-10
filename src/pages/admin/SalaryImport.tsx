import React, { useState, useEffect, useMemo } from 'react';
import { downloadSalaryTemplate } from '../../services/salaryTemplateService';
import { 
  parseSalaryReconciliationFile, 
  ReconciliationResult, 
  confirmSalaryReconciliation,
  applySalaryReconciliation,
  fetchMembersSalaryAndAccounts,
  fetchMemberSalaryData as fetchMemberSalaryDataService,
  MemberSalaryAccountItem
} from '../../services/salaryImportService';
import { supabase } from '../../lib/supabaseClient';
import { MemberSearchAutocomplete } from '../../components/common/MemberSearchAutocomplete';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';

export interface SalaryImportProps {
  initialMembers?: MemberSalaryAccountItem[];
}

export function SalaryImport({ initialMembers }: SalaryImportProps = {}) {
  const feedback = useFeedback();
  const showConfirm = feedback?.showConfirm;

  const toast = useMemo(() => ({
    success: (msg: string) => (feedback?.showToast ? feedback.showToast(msg, 'success') : console.log(msg)),
    error: (msg: string) => (feedback?.showToast ? feedback.showToast(msg, 'error') : console.error(msg)),
    warning: (msg: string) => (feedback?.showToast ? feedback.showToast(msg, 'warning') : console.warn(msg)),
    info: (msg: string) => (feedback?.showToast ? feedback.showToast(msg, 'info') : console.info(msg)),
  }), [feedback]);

  const [file, setFile] = useState<File | null>(null);
  const selectedFile = file;
  const setSelectedFile = setFile;

  const [results, setResults] = useState<ReconciliationResult[]>([]);
  const previewRows = results;
  const setPreviewRows = setResults;

  const [isParsing, setIsParsing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [editingRowIdx, setEditingRowIdx] = useState<number | null>(null);
  const [tempAccountNumber, setTempAccountNumber] = useState<string>('');

  // Pagination untuk hasil pengecekan file rekonsiliasi
  const [reconCurrentPage, setReconCurrentPage] = useState(1);
  const [reconItemsPerPage, setReconItemsPerPage] = useState(10);

  // State master data gaji & rekening anggota
  const [memberList, setMemberList] = useState<MemberSalaryAccountItem[]>(initialMembers || []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<MemberSalaryAccountItem | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  /**
   * Fungsi pemanggil data master anggota beserta gaji & rekening yang konsisten
   */
  const fetchMemberSalaryData = async () => {
    setIsLoadingMembers(true);
    try {
      // Query langsung ke Supabase dengan fallback field salary bila perlu
      let data: MemberSalaryAccountItem[] | null = null;
      try {
        let res: any = await supabase
          .from('anggota')
          .select('id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp, salary')
          .order('nama', { ascending: true });

        if (res.error && res.error.message && res.error.message.toLowerCase().includes('salary')) {
          const retry = await supabase
            .from('anggota')
            .select('id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp')
            .order('nama', { ascending: true });
          res = retry;
        }

        if (!res.error && res.data) {
          data = res.data as MemberSalaryAccountItem[];
        }
      } catch {
        // Fallback ke service helper
      }

      if (!data) {
        data = await fetchMembersSalaryAndAccounts();
      }

      setMemberList(data || []);
    } catch (err: any) {
      console.error('Error loading member salary data:', err);
      toast.error('Gagal memuat data anggota');
    } finally {
      setIsLoadingMembers(false);
    }
  };

  useEffect(() => {
    if (!initialMembers) {
      fetchMemberSalaryData();
    }
  }, [initialMembers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, pageSize]);

  const normalizeAccount = (acc: string | null) => (acc || '').replace(/[\s-]/g, '');

  const handleSaveInlineEdit = (idx: number) => {
    const newData = [...results];
    const row = newData[idx];
    
    // Update account number
    row.excel_account_number = tempAccountNumber;
    row.rekening_baru = tempAccountNumber;
    
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
      setReconCurrentPage(1);
    } catch (err: any) {
      setErrorMsg('Gagal memproses file: ' + err.message);
    } finally {
      setIsParsing(false);
    }
  };

  /**
   * Eksekusi simpan konfirmasi pembaruan gaji dan nomor rekening anggota
   */
  const handleSaveConfirm = async () => {
    if (previewRows.length === 0) return;
    setIsConfirming(true);
    setErrorMsg(null);
    try {
      await applySalaryReconciliation(previewRows);
      toast.success('Data gaji dan rekening berhasil diperbarui!');
      setSuccessMsg('Data gaji dan rekening berhasil diperbarui!');
      setPreviewRows([]); // Tutup tabel preview
      setSelectedFile(null);
      await fetchMemberSalaryData(); // Segarkan tabel master di bawah
    } catch (err: any) {
      console.error('Error saving reconciliation:', err);
      toast.error(`Gagal menyimpan konfirmasi: ${err.message}`);
      setErrorMsg('Gagal menyimpan konfirmasi: ' + err.message);
      try {
        await fetchMemberSalaryData();
      } catch {
        // Abaikan kegagalan refresh tabel master
      }
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirm = handleSaveConfirm;

  // Master anggota pagination & search filtering
  const filteredData = memberList.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (m.nama && m.nama.toLowerCase().includes(q)) || (m.nrp && m.nrp.toLowerCase().includes(q));
  });

  const totalItems = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedData = filteredData.slice(startIndex, endIndex);

  // File reconciliation preview pagination
  const totalReconItems = results.length;
  const totalReconPages = Math.ceil(totalReconItems / reconItemsPerPage);
  const paginatedResults = results.slice((reconCurrentPage - 1) * reconItemsPerPage, reconCurrentPage * reconItemsPerPage);

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
                  onClick={async () => {
                    const confirmed = showConfirm ? await showConfirm({
                      title: 'Batal Konfirmasi Impor',
                      message: 'Apakah Anda yakin ingin membatalkan? Data hasil pengecekan yang belum disimpan akan hilang.',
                      confirmText: 'Ya, Batalkan',
                      variant: 'danger',
                    }) : true;
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
                  onClick={handleSaveConfirm}
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
                    const actualIdx = (reconCurrentPage - 1) * reconItemsPerPage + idx;
                    const previewSalary = r.take_home_pay ?? r.thp;
                    return (
                      <tr key={actualIdx} className="hover:bg-surface-container-lowest/50">
                        <td className="px-4 py-3">{r.nrp}</td>
                        <td className="px-4 py-3">{r.nama}</td>
                        <td className="px-4 py-3">
                          {previewSalary !== null && previewSalary !== undefined
                            ? `Rp ${previewSalary.toLocaleString('id-ID')}`
                            : '-'}
                        </td>
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
                              <span>{r.excel_account_number || r.rekening_baru || '-'}</span>
                              {r.status === 'CONFLICT' && (
                                <button 
                                  onClick={() => { setEditingRowIdx(actualIdx); setTempAccountNumber(r.excel_account_number || r.rekening_baru || ''); }} 
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
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 border-t border-outline-variant/30 flex flex-col md:flex-row justify-between items-center gap-4 text-sm bg-surface-container-low/50">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span>
                  Menampilkan {totalReconItems === 0 ? 0 : (reconCurrentPage - 1) * reconItemsPerPage + 1}-
                  {Math.min(reconCurrentPage * reconItemsPerPage, totalReconItems)} dari {totalReconItems} data
                </span>
                <select 
                  value={reconItemsPerPage}
                  onChange={(e) => {
                    setReconItemsPerPage(Number(e.target.value));
                    setReconCurrentPage(1);
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
                  onClick={() => setReconCurrentPage(p => Math.max(1, p - 1))}
                  disabled={reconCurrentPage === 1}
                  className="px-3 py-1 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="font-medium px-2 text-on-surface">
                  {reconCurrentPage} / {totalReconPages || 1}
                </span>
                <button 
                  onClick={() => setReconCurrentPage(p => Math.min(totalReconPages, p + 1))}
                  disabled={reconCurrentPage === totalReconPages || totalReconPages === 0}
                  className="px-3 py-1 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Daftar Data Gaji & Rekening Anggota Master Table */}
        <div className="p-6 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 space-y-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-title-md font-title-md text-on-surface">
                Daftar Data Gaji &amp; Rekening Anggota
              </h2>
              <p className="text-body-sm text-on-surface-variant">
                Master data nominal Take Home Pay (THP) dan nomor rekening bank aktif untuk seluruh anggota.
              </p>
            </div>
            <div className="w-full md:w-80">
              <MemberSearchAutocomplete
                members={memberList}
                value={searchQuery}
                onChange={(val) => {
                  setSearchQuery(val);
                  if (!val) setSelectedMember(null);
                }}
                onSelectMember={(item) => {
                  setSelectedMember(item);
                  if (item) {
                    setSearchQuery(item.nama);
                  }
                }}
                placeholder="Cari nama atau NRP anggota..."
              />
            </div>
          </div>

          {isLoadingMembers ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-on-surface-variant">
              <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-body-sm">Memuat data gaji dan rekening anggota...</p>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant border border-dashed border-outline-variant/40 rounded-xl">
              <p className="font-medium text-body-md">Tidak ada data anggota yang ditemukan.</p>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedMember(null);
                  }}
                  className="mt-2 text-sm text-primary hover:underline font-medium cursor-pointer"
                >
                  Reset kata kunci pencarian
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant/30">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-container-low text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3 font-medium">NRP</th>
                    <th className="px-4 py-3 font-medium">Nama Anggota</th>
                    <th className="px-4 py-3 font-medium">Pangkat</th>
                    <th className="px-4 py-3 font-medium">No. Rekening Bank</th>
                    <th className="px-4 py-3 font-medium">Gaji / THP (Rp)</th>
                    <th className="px-4 py-3 font-medium">Status Rekening</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {paginatedData.map((m) => {
                    const row = m;
                    const hasAccount = Boolean(row.bank_account_number && row.bank_account_number.trim() !== '');
                    const salaryVal = row.take_home_pay ?? row.master_thp ?? row.salary ?? 0;

                    return (
                      <tr key={row.id || row.nrp} className="hover:bg-surface-container-lowest/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-on-surface">{row.nrp}</td>
                        <td className="px-4 py-3 font-medium text-on-surface">{row.nama}</td>
                        <td className="px-4 py-3 text-on-surface-variant">{row.pangkat || '-'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-on-surface">
                          {row.bank_account_number || '-'}
                        </td>
                        <td className="px-4 py-3 font-medium text-on-surface">
                          {salaryVal > 0
                            ? `Rp ${salaryVal.toLocaleString('id-ID')}`
                            : '-'}
                        </td>
                        <td className="px-4 py-3">
                          {hasAccount ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              Lengkap
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              Belum Ada Rekening
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Master Member Table Pagination */}
          {totalItems > 0 && (
            <div className="p-4 border-t border-outline-variant/30 flex flex-col md:flex-row justify-between items-center gap-4 text-sm bg-surface-container-low/50 rounded-b-xl">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span>
                  Menampilkan {startIndex + 1}-{endIndex} dari {totalItems} data
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="ml-2 border border-outline-variant rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-primary bg-surface-container-lowest text-xs"
                >
                  <option value={10}>10 / halaman</option>
                  <option value={25}>25 / halaman</option>
                  <option value={50}>50 / halaman</option>
                  <option value={100}>100 / halaman</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  Prev
                </button>
                <span className="font-medium px-2 text-on-surface text-xs">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-surface-container-lowest border border-outline-variant hover:bg-surface-container-low rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

export const ImportGajiRekening = SalaryImport;
export default SalaryImport;
