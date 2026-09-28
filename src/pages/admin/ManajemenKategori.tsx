import React, { useEffect, useState, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { ProductCategory, getProductCategories, addProductCategory, updateProductCategory, deleteProductCategory } from '../../services/koperasiService';
import CategoryImportModal from '../../components/categories/CategoryImportModal';
import { exportCategoryTemplate, parseCategoryUpload, batchInsertCategories, ParseResult } from '../../services/categoryExcelService';

export default function ManajemenKategori() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [name, setName] = useState('');

  // Import states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const data = await getProductCategories();
      setCategories(data);
    } catch (error: any) {
      console.error('Failed to fetch categories:', error.message);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingCategory(null);
    setName('');
    setIsModalOpen(true);
  };

  const openEditModal = (cat: ProductCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      if (editingCategory) {
        await updateProductCategory(editingCategory.id, name);
      } else {
        await addProductCategory(name);
      }
      setIsModalOpen(false);
      fetchCategories();
    } catch (error: any) {
      alert(error.message || 'Gagal menyimpan kategori');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus kategori ini? Pastikan tidak ada produk yang terikat dengan kategori ini.')) {
      try {
        await deleteProductCategory(id);
        fetchCategories();
      } catch (error: any) {
        alert(error.message || 'Gagal menghapus kategori');
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await parseCategoryUpload(file);
      setParseResult(result);
      setIsImportModalOpen(true);
    } catch (error: any) {
      alert(error.message || 'Gagal memproses file Excel');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportConfirm = async () => {
    if (!parseResult) return;
    
    setIsImporting(true);
    try {
      await batchInsertCategories(parseResult.newCategories);
      setIsImportModalOpen(false);
      fetchCategories();
      alert('Berhasil mengimpor kategori baru!');
    } catch (error: any) {
      alert(error.message || 'Gagal mengimpor kategori');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-display-sm font-display-sm text-primary">Manajemen Kategori</h1>
            <p className="text-body-lg text-on-surface-variant mt-2">Kelola master kategori untuk produk</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 sm:mt-0">
            <button 
              onClick={exportCategoryTemplate}
              className="flex items-center gap-2 bg-surface-container-lowest border border-outline text-primary px-4 py-2 rounded-lg font-label-lg shadow-sm hover:bg-surface-container-low transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              Unduh Template
            </button>
            <input 
              type="file" 
              accept=".xlsx" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-secondary text-on-secondary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-secondary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">upload_file</span>
              Import Excel
            </button>
            <button 
              onClick={openAddModal}
              className="flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              Tambah Kategori
            </button>
          </div>
        </div>

        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant overflow-hidden max-w-4xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest border-b border-outline-variant text-label-md text-on-surface-variant">
                  <th className="p-4 font-label-md w-16 text-center">No</th>
                  <th className="p-4 font-label-md">Nama Kategori</th>
                  <th className="p-4 font-label-md text-center w-32">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-on-surface-variant">Memuat data kategori...</td>
                  </tr>
                ) : categories.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-on-surface-variant">Belum ada kategori yang terdaftar.</td>
                  </tr>
                ) : (
                  categories.map((cat, index) => (
                    <tr key={cat.id} className="border-b border-outline-variant/50 hover:bg-surface-container-lowest/50 transition-colors">
                      <td className="p-4 text-body-md text-on-surface text-center">{index + 1}</td>
                      <td className="p-4 text-title-sm font-medium text-on-surface">{cat.name}</td>
                      <td className="p-4 flex items-center justify-center gap-2">
                        <button 
                          onClick={() => openEditModal(cat)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                          title="Edit Kategori"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDelete(cat.id)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-error hover:bg-error/10 transition-colors"
                          title="Hapus Kategori"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-2xl w-full max-w-sm overflow-hidden shadow-lg border border-outline-variant/30 flex flex-col">
            <div className="p-6 border-b border-outline-variant/30">
              <h2 className="text-title-lg font-title-lg text-on-surface">
                {editingCategory ? 'Edit Kategori' : 'Tambah Kategori'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col p-6 gap-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-label-md text-on-surface-variant">Nama Kategori</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="px-4 py-2 bg-surface-container-lowest border border-outline rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  placeholder="Mis. Sembako, Minuman..."
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-primary font-label-lg hover:bg-primary/5 transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label-lg shadow hover:bg-primary/90 transition-colors"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <CategoryImportModal 
        isOpen={isImportModalOpen}
        parseResult={parseResult}
        onClose={() => setIsImportModalOpen(false)}
        onConfirm={handleImportConfirm}
        isSubmitting={isImporting}
      />
    </AdminLayout>
  );
}
