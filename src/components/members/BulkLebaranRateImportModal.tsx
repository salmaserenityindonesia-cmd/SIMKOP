import React, { useRef, useState } from 'react';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  Sparkles,
} from 'lucide-react';
import {
  exportMemberLebaranRateTemplate,
  parseMemberLebaranRateExcel,
  bulkUpsertMemberLebaranRatesChunked,
  fetchAllActiveMembersPaged,
  ParsedMemberLebaranRateRow,
  InvalidMemberLebaranRateRow,
} from '../../services/savingsRateService';
import { formatCurrency } from '../../utils/formatCurrency';
import { useFeedback } from '../../context/FeedbackContext';

export interface BulkLebaranRateImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userId?: string | null;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export default function BulkLebaranRateImportModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
}: BulkLebaranRateImportModalProps) {
  const { showToast } = useFeedback();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [validRows, setValidRows] = useState<ParsedMemberLebaranRateRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<InvalidMemberLebaranRateRow[]>([]);
  const [notFoundNrps, setNotFoundNrps] = useState<string[]>([]);

  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<{
    updatedCount: number;
    notFoundNrps: string[];
  } | null>(null);

  if (!isOpen) return null;

  const resetUploadState = () => {
    setFileName('');
    setParseError(null);
    setTotalRows(0);
    setSkippedCount(0);
    setValidRows([]);
    setInvalidRows([]);
    setNotFoundNrps([]);
    setProgress(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (isImporting) return;
    resetUploadState();
    onClose();
  };

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      const meta = await exportMemberLebaranRateTemplate();
      showToast(
        `Template ${meta.filename} (${meta.totalMembers.toLocaleString('id-ID')} anggota aktif) berhasil diunduh.`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal mengekspor template tarif Lebaran:', err);
      showToast(err?.message || 'Gagal membuat template Excel tarif Lebaran.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParseError(null);
    setImportResult(null);
    setProgress(null);
    setIsParsing(true);

    try {
      const [parsed, activeMembers] = await Promise.all([
        parseMemberLebaranRateExcel(file),
        fetchAllActiveMembersPaged(),
      ]);

      const activeNrpSet = new Set(
        activeMembers.map((m) => String(m.nrp || '').trim()).filter(Boolean)
      );
      const memberNameByNrp = new Map(
        activeMembers.map((m) => [String(m.nrp || '').trim(), m.nama])
      );

      const matchedRows: ParsedMemberLebaranRateRow[] = [];
      const missingNrps: string[] = [];

      for (const row of parsed.validRows) {
        const nrpKey = String(row.nrp || '').trim();
        if (activeNrpSet.has(nrpKey)) {
          matchedRows.push({
            ...row,
            nama: row.nama || memberNameByNrp.get(nrpKey) || '-',
          });
        } else {
          missingNrps.push(nrpKey);
        }
      }

      setTotalRows(parsed.totalRows);
      setSkippedCount(parsed.skippedCount);
      setValidRows(matchedRows);
      setInvalidRows(parsed.invalidRows);
      setNotFoundNrps(missingNrps);
    } catch (err: any) {
      console.error('Gagal membaca file Excel tarif Lebaran:', err);
      setParseError(err?.message || 'Gagal membaca file Excel. Pastikan format sesuai template.');
      setValidRows([]);
      setInvalidRows([]);
      setNotFoundNrps([]);
    } finally {
      setIsParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (validRows.length === 0 || isImporting) return;

    setIsImporting(true);
    setProgress({ processed: 0, total: validRows.length });

    try {
      const result = await bulkUpsertMemberLebaranRatesChunked(
        validRows,
        userId,
        (processed, total) => {
          setProgress({ processed, total });
        }
      );

      setImportResult(result);
      showToast(
        `Berhasil memperbarui komitmen Simpanan Lebaran untuk ${result.updatedCount.toLocaleString('id-ID')} anggota.`,
        'success'
      );
      onSuccess?.();
    } catch (err: any) {
      console.error('Gagal mengimpor tarif Lebaran massal:', err);
      showToast(err?.message || 'Gagal menyimpan tarif Simpanan Lebaran massal.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.processed / progress.total) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Impor &amp; Ekspor Massal Tarif Simpanan Lebaran
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mendukung 1.000+ anggota dengan paginasi otomatis &amp; penyimpanan bertahap (100 baris/batch).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Langkah 1: Unduh Template */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-bold">
                    1
                  </span>
                  <span>Unduh Template Excel Pre-Populated</span>
                </div>
                <p className="text-xs text-indigo-800/90 leading-relaxed">
                  Template berisi seluruh anggota aktif dengan 9 kolom baku (
                  <code className="px-1 py-0.5 bg-white/80 rounded border border-indigo-200 font-mono text-[11px]">
                    nomor_referensi, nrp, nama, tanggal_lahir, tarif_saat_ini, tarif_lebaran_baru, mulai_bulan, mulai_tahun, keterangan_siklus
                  </code>
                  ). Isi kolom{' '}
                  <code className="px-1.5 py-0.5 bg-white/80 rounded border border-indigo-200 font-mono text-[11px]">
                    tarif_lebaran_baru
                  </code>{' '}
                  hanya pada anggota yang mengajukan besaran baru; biarkan kosong bagi anggota yang tetap memakai ketentuan terakhir/global.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={isDownloading || isImporting}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyiapkan Template...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Unduh Template Tarif Lebaran (.xlsx)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Langkah 2: Unggah & Pratinjau */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold">
                  2
                </span>
                <span>Unggah &amp; Pratinjau File Excel (.xlsx / .xls)</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  disabled={isImporting || isParsing}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting || isParsing}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Membaca Excel...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>{fileName ? 'Ganti File Excel' : 'Pilih File Excel'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {fileName && !parseError && (
              <div className="text-xs text-slate-600 flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>
                  Berkas terpilih: <strong className="text-slate-800">{fileName}</strong>
                </span>
              </div>
            )}

            {parseError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Ringkasan Validasi */}
            {fileName && !parseError && !isParsing && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-medium">Total Baris Terbaca</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">
                      {totalRows.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-[11px] text-emerald-700 font-medium">Siap Diperbarui</div>
                    <div className="text-lg font-bold text-emerald-800 mt-0.5">
                      {validRows.length.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-[11px] text-amber-700 font-medium">Dilewati (Kosong/0)</div>
                    <div className="text-lg font-bold text-amber-800 mt-0.5">
                      {skippedCount.toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="text-[11px] text-rose-700 font-medium">NRP Tidak Ditemukan / Error</div>
                    <div className="text-lg font-bold text-rose-800 mt-0.5">
                      {(notFoundNrps.length + invalidRows.length).toLocaleString('id-ID')}
                    </div>
                  </div>
                </div>

                {(notFoundNrps.length > 0 || invalidRows.length > 0) && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Catatan Validasi Baris</span>
                    </div>
                    {notFoundNrps.length > 0 && (
                      <p>
                        {notFoundNrps.length} NRP tidak ditemukan pada daftar anggota aktif:{' '}
                        <span className="font-mono">
                          {notFoundNrps.slice(0, 10).join(', ')}
                          {notFoundNrps.length > 10 ? ` (+${notFoundNrps.length - 10} lainnya)` : ''}
                        </span>
                      </p>
                    )}
                    {invalidRows.length > 0 && (
                      <p>
                        {invalidRows.length} baris tidak valid:{' '}
                        {invalidRows
                          .slice(0, 5)
                          .map((r) => `Baris ${r.rowNumber} (${r.nrp}): ${r.reason}`)
                          .join('; ')}
                        {invalidRows.length > 5 ? ` (+${invalidRows.length - 5} lainnya)` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Tabel Pratinjau */}
                {validRows.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-60 overflow-y-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0">
                          <tr>
                            <th className="py-2.5 px-3 border-b border-slate-200">No. Referensi</th>
                            <th className="py-2.5 px-3 border-b border-slate-200">NRP</th>
                            <th className="py-2.5 px-3 border-b border-slate-200">Nama</th>
                            <th className="py-2.5 px-3 border-b border-slate-200">Tgl Lahir</th>
                            <th className="py-2.5 px-3 border-b border-slate-200 text-right">Tarif Saat Ini</th>
                            <th className="py-2.5 px-3 border-b border-slate-200 text-right">Tarif Lebaran Baru</th>
                            <th className="py-2.5 px-3 border-b border-slate-200 text-center">Mulai Berlaku</th>
                            <th className="py-2.5 px-3 border-b border-slate-200">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {validRows.slice(0, 100).map((row) => (
                            <tr key={`${row.nrp}-${row.rowNumber}`} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono text-slate-600">
                                {row.nomor_referensi || '-'}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-700">{row.nrp}</td>
                              <td className="py-2 px-3 font-medium text-slate-900">{row.nama}</td>
                              <td className="py-2 px-3 font-mono text-slate-600">
                                {row.tanggal_lahir || '-'}
                              </td>
                              <td className="py-2 px-3 text-right text-slate-500">
                                {formatCurrency(row.tarif_saat_ini)}
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-emerald-700">
                                {formatCurrency(row.tarif_lebaran_baru)}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-700">
                                {MONTH_SHORT[row.mulai_bulan - 1] || row.mulai_bulan} {row.mulai_tahun}
                              </td>
                              <td className="py-2 px-3 text-slate-500 truncate max-w-[180px]">
                                {row.keterangan_siklus || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {validRows.length > 100 && (
                      <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 text-center">
                        Menampilkan 100 dari {validRows.length.toLocaleString('id-ID')} baris valid. Seluruh{' '}
                        {validRows.length.toLocaleString('id-ID')} baris akan diproses saat disimpan.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 text-center">
                    Tidak ada baris dengan nominal <code className="font-mono">tarif_lebaran_baru</code> &gt; 0 yang siap diperbarui.
                  </div>
                )}
              </>
            )}
          </div>

          {/* Langkah 3: Progress Bar & Laporan Sukses */}
          {(isImporting || progress) && !importResult && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-indigo-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>
                    Memproses {progress?.processed.toLocaleString('id-ID') || 0} /{' '}
                    {progress?.total.toLocaleString('id-ID') || validRows.length.toLocaleString('id-ID')} anggota...
                  </span>
                </span>
                <span>{progressPct}%</span>
              </div>
              <div className="w-full h-2.5 bg-indigo-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {importResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900 space-y-1">
                <div className="font-bold text-sm">Impor Massal Tarif Simpanan Lebaran Selesai</div>
                <p>
                  Sebanyak <strong>{importResult.updatedCount.toLocaleString('id-ID')} anggota</strong> telah diperbarui
                  komitmen Simpanan Lebaran-nya dan langsung berlaku di Setoran, Simpanan, Matriks Kepatuhan, serta Batch Update.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {importResult ? 'Tutup' : 'Batal'}
          </button>
          {!importResult && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={isImporting || isParsing || validRows.length === 0}
              className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan Bertahap...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Simpan &amp; Terapkan Tarif Massal ({validRows.length.toLocaleString('id-ID')})
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
