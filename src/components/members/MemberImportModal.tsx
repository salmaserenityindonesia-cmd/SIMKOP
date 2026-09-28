import React from 'react';
import { MemberParseResult } from '../../services/memberExcelService';

interface MemberImportModalProps {
  isOpen: boolean;
  parseResult: MemberParseResult | null;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export default function MemberImportModal({ isOpen, parseResult, onClose, onConfirm, isSubmitting }: MemberImportModalProps) {
  if (!isOpen || !parseResult) return null;

  const totalRows = parseResult.newMembers.length + parseResult.updatedMembers.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col">
        <div className="p-6 border-b border-outline-variant/30">
          <h2 className="text-title-lg font-title-lg text-on-surface">Pratinjau Import Anggota</h2>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <p className="text-body-md text-on-surface-variant">
            File Excel berhasil dibaca. Berikut adalah ringkasan data yang akan diimpor:
          </p>

          <div className="grid grid-cols-1 gap-3">
            <div className="bg-surface-container-lowest p-4 rounded-xl border border-outline-variant flex justify-between items-center">
              <span className="text-label-md text-on-surface-variant">Total Baris Valid</span>
              <span className="text-title-md text-on-surface font-bold">{totalRows}</span>
            </div>
            <div className="bg-success/10 p-4 rounded-xl border border-success/20 flex justify-between items-center">
              <span className="text-label-md text-success-dark">Anggota Baru (Insert)</span>
              <span className="text-title-md text-success font-bold">{parseResult.newMembers.length}</span>
            </div>
            <div className="bg-tertiary/10 p-4 rounded-xl border border-tertiary/20 flex justify-between items-center">
              <span className="text-label-md text-tertiary-dark">Anggota Lama (Update)</span>
              <span className="text-title-md text-tertiary font-bold">{parseResult.updatedMembers.length}</span>
            </div>
          </div>

          {parseResult.errors.length > 0 && (
            <div className="mt-2 bg-error/10 border border-error/20 p-4 rounded-xl">
              <p className="text-label-md text-error font-bold mb-2">Peringatan / Error:</p>
              <ul className="list-disc pl-5 text-body-sm text-error/80 space-y-1 max-h-32 overflow-y-auto">
                {parseResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-outline-variant/30 bg-surface-container-lowest">
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg text-primary font-label-lg hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button 
            onClick={onConfirm}
            disabled={isSubmitting || totalRows === 0}
            className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[20px]">sync</span>
                Menyimpan...
              </>
            ) : (
              'Konfirmasi & Simpan'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
