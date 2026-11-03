/**
 * SavingsMatrixImportModal.tsx
 * Modal interaktif untuk upload, pratinjau, dan sinkronisasi matriks buku besar simpanan Excel.
 */
import React, { useState, useContext, useRef, useCallback } from 'react';
import FeedbackContext from '../../context/FeedbackContext';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Layers,
  AlertCircle,
  Calendar
} from 'lucide-react';
import {
  parseSavingsMatrixExcel,
  ParseSavingsMatrixResult,
  ParsedMonthlyDeposit
} from '../../utils/savingsMatrixImporter';
import {
  importSavingsMatrixLedger,
  ImportSavingsMatrixProgress,
  ImportSavingsMatrixLedgerResult
} from '../../services/complianceService';

export interface SavingsMatrixImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultType?: 'WAJIB' | 'BELANJA' | 'LEBARAN';
  // Props untuk pengujian / controlled state
  initialType?: 'WAJIB' | 'BELANJA' | 'LEBARAN';
  initialFile?: { name: string; size?: number } | File | null;
  initialParseResult?: ParseSavingsMatrixResult | null;
  initialIsParsing?: boolean;
  initialIsImporting?: boolean;
  initialProgress?: ImportSavingsMatrixProgress | null;
  initialImportResult?: ImportSavingsMatrixLedgerResult | null;
}

export const DEPOSIT_TYPE_OPTIONS: Array<{
  id: 'WAJIB' | 'BELANJA' | 'LEBARAN';
  label: string;
  badge: string;
  desc: string;
}> = [
  {
    id: 'WAJIB',
    label: 'Simpanan Wajib',
    badge: 'SW',
    desc: 'Simpanan pokok bulanan anggota'
  },
  {
    id: 'BELANJA',
    label: 'Simpanan Belanja Bulanan',
    badge: 'SB',
    desc: 'Simpanan belanja ritel toko koperasi'
  },
  {
    id: 'LEBARAN',
    label: 'Simpanan Hari Raya (Lebaran)',
    badge: 'SL',
    desc: 'Simpanan paket hari raya tahunan'
  }
];

export const parseFileWrapper = async (
  file: File
): Promise<ParseSavingsMatrixResult> => {
  return await parseSavingsMatrixExcel(file);
};

export const executeImportWrapper = async (
  type: 'WAJIB' | 'BELANJA' | 'LEBARAN',
  mutations: ParsedMonthlyDeposit[],
  onProgress?: (progress: ImportSavingsMatrixProgress) => void
): Promise<ImportSavingsMatrixLedgerResult> => {
  return await importSavingsMatrixLedger(type, mutations, onProgress);
};

export default function SavingsMatrixImportModal({
  isOpen,
  onClose,
  onSuccess,
  defaultType = 'WAJIB',
  initialType,
  initialFile = null,
  initialParseResult = null,
  initialIsParsing = false,
  initialIsImporting = false,
  initialProgress = null,
  initialImportResult = null
}: SavingsMatrixImportModalProps) {
  const feedback = useContext(FeedbackContext);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedType, setSelectedType] = useState<'WAJIB' | 'BELANJA' | 'LEBARAN'>(
    initialType || defaultType
  );
  const [selectedFile, setSelectedFile] = useState<{ name: string; size?: number } | File | null>(
    initialFile
  );
  const [parseResult, setParseResult] = useState<ParseSavingsMatrixResult | null>(
    initialParseResult
  );
  const [isParsing, setIsParsing] = useState<boolean>(initialIsParsing);
  const [isImporting, setIsImporting] = useState<boolean>(initialIsImporting);
  const [progress, setProgress] = useState<ImportSavingsMatrixProgress | null>(
    initialProgress
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Reset state saat modal ditutup atau ganti tipe jika diperlukan
  const handleReset = () => {
    setSelectedFile(null);
    setParseResult(null);
    setProgress(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcessFile = async (file: File) => {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setErrorMessage('Format berkas tidak didukung. Mohon unggah berkas Excel berekstensi .xlsx');
      setSelectedFile(null);
      setParseResult(null);
      return;
    }

    setSelectedFile(file);
    setErrorMessage(null);
    setIsParsing(true);
    setParseResult(null);

    try {
      const result = await parseFileWrapper(file);
      setParseResult(result);
      if (!result.success && result.errors.length > 0) {
        setErrorMessage(result.errors.join(' | '));
      }
    } catch (err: any) {
      console.error('Error parsing excel file:', err);
      setErrorMessage(err?.message || 'Gagal membaca berkas Excel. Pastikan format tabel sesuai standar.');
      setParseResult(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  }, []);

  const handleStartImport = async () => {
    if (!parseResult || !parseResult.success || parseResult.mutations.length === 0) {
      setErrorMessage('Tidak ada data mutasi yang valid untuk disinkronkan.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    setProgress({ processed: 0, total: parseResult.mutations.length, percent: 0 });

    try {
      const result = await executeImportWrapper(
        selectedType,
        parseResult.mutations,
        (p) => {
          setProgress(p);
        }
      );

      if (result.success) {
        const typeLabel = DEPOSIT_TYPE_OPTIONS.find(t => t.id === selectedType)?.label || selectedType;
        const msg = `Berhasil menyinkronkan ${result.totalTransactions} mutasi ${typeLabel} untuk ${result.totalMembers} anggota ke buku besar.`;
        if (feedback?.showToast) {
          feedback.showToast(msg, 'success');
        }
        onSuccess();
        onClose();
        handleReset();
      } else {
        const errDetails = result.errors && result.errors.length > 0 
          ? result.errors.join(', ') 
          : 'Terjadi kegagalan saat import database.';
        setErrorMessage(errDetails);
      }
    } catch (err: any) {
      console.error('Import process error:', err);
      setErrorMessage(err?.message || 'Terjadi kesalahan sistem saat menyinkronkan ke buku besar.');
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  const canImport = 
    Boolean(parseResult?.success) && 
    (parseResult?.totalMutations ?? 0) > 0 && 
    !isParsing && 
    !isImporting &&
    !errorMessage;

  return (
    <div
      data-testid="savings-matrix-import-modal-overlay"
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in"
    >
      <div
        data-testid="savings-matrix-import-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Impor Matriks Buku Besar Simpanan (.xlsx)
              </h3>
              <p className="text-xs text-slate-500">
                Unggah matriks hasil audit untuk sinkronisasi mutasi bulanan ke buku besar
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (!isImporting) {
                onClose();
                handleReset();
              }
            }}
            disabled={isImporting}
            data-testid="modal-close-button"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Pilihan Jenis Simpanan */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Pilih Jenis Simpanan Target
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" data-testid="deposit-type-selector">
              {DEPOSIT_TYPE_OPTIONS.map((opt) => {
                const isSelected = selectedType === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (!isImporting) setSelectedType(opt.id);
                    }}
                    disabled={isImporting}
                    data-testid={`deposit-type-${opt.id}`}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {opt.badge}
                      </span>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-800 leading-tight">
                      {opt.label}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Area Unggah Berkas Drag-and-Drop */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              Unggah Berkas Excel Matriks (.xlsx)
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => {
                if (!isImporting && !isParsing) {
                  fileInputRef.current?.click();
                }
              }}
              data-testid="file-dropzone"
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 ${
                isDragOver
                  ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                  : selectedFile
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileChange}
                data-testid="file-input"
                className="hidden"
                disabled={isImporting || isParsing}
              />

              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-xs">
                {isParsing ? (
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
                ) : (
                  <UploadCloud className="w-6 h-6" />
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {selectedFile ? selectedFile.name : 'Tarik & letakkan berkas Excel (.xlsx) di sini'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  atau klik untuk memilih file dari perangkat Anda
                </p>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-full mt-1">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Format kolom: NRP, Nama, Saldo Acuan, & Bulan (Jan - Des)</span>
              </div>
            </div>
          </div>

          {/* Status Parsing Loading */}
          {isParsing && (
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>Sedang membaca dan menganalisis struktur kolom lembar kerja Excel...</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div
              data-testid="import-error-banner"
              className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-semibold">Format Berkas Tidak Valid</p>
                <p className="mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* File Parsing Preview Summary */}
          {parseResult && parseResult.success && !isParsing && (
            <div
              data-testid="parse-summary-panel"
              className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Pratinjau Berkas Terverifikasi
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Siap Disinkronkan
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                  <span className="block text-[11px] text-slate-500">Total Anggota</span>
                  <span className="text-sm font-bold text-slate-800" data-testid="summary-total-rows">
                    {parseResult.totalRows} Baris
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                  <span className="block text-[11px] text-slate-500">Mutasi Nominal (&gt; 0)</span>
                  <span className="text-sm font-bold text-emerald-600" data-testid="summary-total-mutations">
                    {parseResult.totalMutations} Transaksi
                  </span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-center">
                  <span className="block text-[11px] text-slate-500">Kolom Bulan Valid</span>
                  <span className="text-sm font-bold text-indigo-600" data-testid="summary-detected-months">
                    {parseResult.detectedMonths.length} Bulan
                  </span>
                </div>
              </div>

              {parseResult.detectedMonths.length > 0 && (
                <div className="pt-1">
                  <span className="text-[11px] font-medium text-slate-500 block mb-1">
                    Bulan Terdeteksi:
                  </span>
                  <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                    {parseResult.detectedMonths.map((m, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded font-mono"
                      >
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Sistem otomatis membersihkan mutasi lama dan saldo migrasi lump-sum untuk jenis ini guna mencegah duplikasi data (double-counting).
                </span>
              </div>
            </div>
          )}

          {/* Progress Bar saat Impor Database */}
          {isImporting && (
            <div data-testid="import-progress-bar" className="space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  Sinkronisasi Buku Besar...
                </span>
                <span className="font-bold text-emerald-600" data-testid="progress-percent">
                  {progress ? `${progress.percent}%` : '0%'}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress?.percent || 0}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500 text-center" data-testid="progress-text">
                {progress
                  ? `Memproses ${progress.processed} dari ${progress.total} mutasi...`
                  : 'Mempersiapkan transaksi...'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
          <button
            type="button"
            onClick={() => {
              if (!isImporting) {
                onClose();
                handleReset();
              }
            }}
            disabled={isImporting}
            data-testid="modal-cancel-btn"
            className="px-4 py-2 rounded-xl text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleStartImport}
            disabled={!canImport}
            data-testid="modal-submit-btn"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Menyinkronkan...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Mulai Impor &amp; Sinkronkan Buku Besar</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
