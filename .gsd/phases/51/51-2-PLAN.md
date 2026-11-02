---
phase: 51
plan: 2
wave: 2
depends_on:
  - 51.1
gap_closure: false
---

# Plan 51.2: Toolbar Button & Progress Modal in ComplianceMatrix.tsx & Component Tests

## Objective
Menambahkan tombol aksi global "Cocokkan Otomatis Semua Anggota" pada toolbar atas halaman Matriks Kepatuhan Simpanan (`src/pages/admin/ComplianceMatrix.tsx`) lengkap dengan modal dialog konfirmasi pilihan jenis simpanan, visualisasi progress bar saat pemrosesan batch berjalan, ringkasan hasil rekonsiliasi, pembaruan otomatis matriks data, serta pengujian komponen di `ComplianceMatrix.test.tsx`.

## Context
- `src/pages/admin/ComplianceMatrix.tsx`
- `src/pages/admin/ComplianceMatrix.test.tsx`
- `src/services/savingsMatrixService.ts`
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`

## Tasks

<task type="auto">
  <name>Add Bulk Reconcile Button and Progress Dialog in ComplianceMatrix.tsx</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`.
    2. Impor `bulkAutoReconcileAllMembers` dan interface `BulkReconcileProgress` dari `../../services/savingsMatrixService`.
    3. Impor ikon pendukung dari `lucide-react`: `RefreshCw, CheckCircle2, AlertCircle, Loader2, Sparkles, Layers`.
    4. Tambahkan state reaktif:
       ```ts
       const [showConfirmBulkModal, setShowConfirmBulkModal] = useState(false);
       const [isBulkReconciling, setIsBulkReconciling] = useState(false);
       const [bulkTargetType, setBulkTargetType] = useState<'WAJIB' | 'BELANJA' | 'LEBARAN' | 'ALL'>('ALL');
       const [bulkProgress, setBulkProgress] = useState<{ processed: number; total: number; currentMemberName?: string }>({ processed: 0, total: 0 });
       const [bulkResult, setBulkResult] = useState<{ totalSuccess: number; totalFailed: number } | null>(null);
       ```
    5. Pada toolbar header (di samping tombol "Export Rekap Excel" dan "Kirim Pengingat"):
       - Sisipkan tombol:
         ```tsx
         <button
           onClick={() => {
             setBulkResult(null);
             setShowConfirmBulkModal(true);
           }}
           disabled={isBulkReconciling}
           title="Cocokkan otomatis saldo simpanan seluruh anggota ke buku besar bulanan"
           className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
         >
           <RefreshCw className={`w-4 h-4 ${isBulkReconciling ? 'animate-spin' : ''}`} />
           <span>Cocokkan Otomatis Semua Anggota</span>
         </button>
         ```
    6. Render Modal Dialog Konfirmasi & Progress Bar:
       - **Saat Belum Berjalan & Belum Selesai (Konfirmasi)**:
         * Tampilkan judul: "Cocokkan Otomatis Simpanan Seluruh Anggota".
         * Informasi: Memberitahukan bahwa sistem akan memetakan saldo simpanan riil/migrasi seluruh anggota aktif ke kotak-kotak bulan buku besar sesuai tarif berjenjang yang berlaku secara FIFO.
         * Pilihan Tipe Simpanan via radio / tab / select (`Semua Jenis Simpanan`, `Simpanan Wajib`, `Simpanan Belanja Bulanan`, `Simpanan Hari Raya/Lebaran`).
         * Tombol Batal & Tombol "Mulai Pencocokan Otomatis".
       - **Saat Berjalan (`isBulkReconciling === true`)**:
         * Tampilkan progress bar animatif persentase: `(bulkProgress.processed / (bulkProgress.total || 1)) * 100%`.
         * Label status: `Memproses ${bulkProgress.processed} dari ${bulkProgress.total} anggota...`.
         * Nama anggota yang sedang diproses.
         * Tombol tutup/batal dikunci (`disabled`) untuk menjaga integritas data.
       - **Saat Selesai (`bulkResult !== null`)**:
         * Tampilkan ikon sukses hijau (`CheckCircle2`).
         * Rincian: `${bulkResult.totalSuccess} anggota berhasil direkonsiliasi`.
         * Tombol "Selesai & Muat Ulang Matriks".
         * Panggil `fetchComplianceMatrixData(year, setLoading, setData, setTargets, setTotalSetoran)` saat modal ditutup agar perubahan langsung tercermin pada tabel matriks di layar.
  </action>
  <verify>
    Periksa tidak ada TypeScript compilation errors pada `src/pages/admin/ComplianceMatrix.tsx`.
  </verify>
  <done>
    Tombol toolbar dan modal dialog rekonsiliasi simpanan massal telah terpasang rapi dan fungsional.
  </done>
</task>

<task type="auto">
  <name>Update ComplianceMatrix Test Suite for Bulk Reconcile Flow</name>
  <files>
    src/pages/admin/ComplianceMatrix.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.test.tsx`.
    2. Mock modul `../../services/savingsMatrixService`:
       ```ts
       vi.mock('../../services/savingsMatrixService', () => ({
         bulkAutoReconcileAllMembers: vi.fn().mockImplementation(async (type, onProgress) => {
           onProgress?.({ processed: 5, total: 10, currentMemberName: 'Budi' });
           onProgress?.({ processed: 10, total: 10, currentMemberName: 'Siti' });
           return { success: true, totalMembers: 10, totalSuccess: 10, totalFailed: 0 };
         }),
       }));
       ```
    3. Tambahkan skenario test:
       - Memastikan tombol "Cocokkan Otomatis Semua Anggota" ter-render di markup halaman.
       - Memastikan dialog konfirmasi muncul dengan opsi jenis simpanan yang benar.
       - Memastikan pemanggilan `bulkAutoReconcileAllMembers` mengeksekusi callback progress dan memperbarui data matriks.
    4. Jalankan `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx`.
  </action>
  <verify>
    Jalankan perintah `npx vitest run src/pages/admin/ComplianceMatrix.test.tsx` dan pastikan seluruh test lolos tanpa kegagalan.
  </verify>
  <done>
    Unit tests untuk interaksi tombol rekonsiliasi massal dan progress bar telah teruji dan lolos 100%.
  </done>
</task>

## Success Criteria
- [ ] Tombol "Cocokkan Otomatis Semua Anggota" terpasang di toolbar atas `ComplianceMatrix.tsx`.
- [ ] Modal dialog konfirmasi menyediakan opsi filter tipe simpanan dan rincian alur kerja.
- [ ] Modal progress bar menampilkan persentase dan nama anggota secara interaktif.
- [ ] Data matriks diperbarui secara otomatis setelah rekonsiliasi tuntas.
- [ ] Seluruh unit test pada `ComplianceMatrix.test.tsx` lolos 100%.
