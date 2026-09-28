import { ParseResult } from '../../services/categoryExcelService';

interface CategoryImportModalProps {
  isOpen: boolean;
  parseResult: ParseResult | null;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}

export default function CategoryImportModal({ isOpen, parseResult, onClose, onConfirm, isSubmitting }: CategoryImportModalProps) {
  if (!isOpen || !parseResult) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-surface rounded-2xl w-full max-w-md overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col">
        <div className="p-6 border-b border-outline-variant/30 flex items-center gap-3 bg-surface-container-lowest">
          <span className="material-symbols-outlined text-primary text-[28px]">upload_file</span>
          <div>
            <h2 className="text-title-lg font-title-lg text-on-surface">Konfirmasi Import</h2>
            <p className="text-label-sm text-on-surface-variant mt-0.5">Ringkasan data dari file Excel</p>
          </div>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          <div className="bg-surface-container-low rounded-lg p-4 flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-outline-variant/30 pb-2">
              <span className="text-body-md text-on-surface-variant">Total Baris Kategori</span>
              <span className="font-title-md font-bold text-on-surface">{parseResult.totalRows}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-body-md text-on-surface-variant">Kategori Baru (Siap Simpan)</span>
              <span className="font-title-md font-bold text-primary">{parseResult.newCategories.length}</span>
            </div>
            <div className="flex justify-between items-center text-error">
              <span className="text-body-md">Kategori Duplikat (Akan Diabaikan)</span>
              <span className="font-title-md font-bold">{parseResult.duplicateCategories.length}</span>
            </div>
          </div>

          {parseResult.duplicateCategories.length > 0 && (
            <div className="bg-error-container/30 border border-error/30 rounded-lg p-3 text-label-sm text-error">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <span className="material-symbols-outlined text-[16px]">info</span>
                Info Duplikasi
              </div>
              Beberapa kategori (seperti: {parseResult.duplicateCategories.slice(0, 3).join(', ')}{parseResult.duplicateCategories.length > 3 ? '...' : ''}) sudah ada di sistem dan tidak akan ditambahkan.
            </div>
          )}

          {parseResult.newCategories.length === 0 && (
            <div className="bg-surface-container border border-outline-variant rounded-lg p-3 text-label-sm text-on-surface-variant text-center">
              Tidak ada kategori baru untuk ditambahkan.
            </div>
          )}
        </div>

        <div className="p-5 border-t border-outline-variant/30 flex items-center justify-end gap-3 bg-surface-container-lowest">
          <button 
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-lg text-primary font-label-lg hover:bg-primary/5 transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button 
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting || parseResult.newCategories.length === 0}
            className="flex items-center gap-2 bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:bg-surface-container-highest disabled:text-outline"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>
                Menyimpan...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                Konfirmasi & Simpan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
