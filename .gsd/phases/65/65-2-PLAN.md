---
phase: 65
plan: 2
wave: 2
gap_closure: false
depends_on:
  - 65-1-PLAN.md
---

# Plan 65.2: Salary & Account Data Table, Autocomplete Search Toolbar, and Pagination Controls on /admin/import-gaji

## Objective
Mengintegrasikan tabel master data gaji dan rekening anggota pada halaman Import Gaji (`src/pages/admin/SalaryImport.tsx` pada rute `/admin/import-gaji`). Halaman akan dilengkapi dengan bilah toolbar autocompletion `MemberSearchAutocomplete`, filter pencarian real-time, kontrol pagination responsif (10/25/50/100 baris per halaman), penyegaran otomatis setelah konfirmasi rekonsiliasi impor file, serta verifikasi build produksi.

## Context
- .gsd/phases/65/65-1-PLAN.md
- src/pages/admin/SalaryImport.tsx
- src/components/common/MemberSearchAutocomplete.tsx
- src/services/salaryImportService.ts

## Tasks

<task type="auto">
  <name>Render Data Table, Autocomplete Toolbar, and Pagination in SalaryImport Page</name>
  <files>
    src/pages/admin/SalaryImport.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/SalaryImport.tsx`:
       - Import `MemberSearchAutocomplete` dan `fetchMembersSalaryAndAccounts` beserta tipenya.
       - Tambahkan state:
         ```typescript
         const [memberList, setMemberList] = useState<MemberSalaryAccountItem[]>([]);
         const [searchQuery, setSearchQuery] = useState('');
         const [selectedMember, setSelectedMember] = useState<MemberSalaryAccountItem | null>(null);
         const [currentPage, setCurrentPage] = useState(1);
         const [pageSize, setPageSize] = useState(10);
         const [isLoadingMembers, setIsLoadingMembers] = useState(false);
         ```
       - Tambahkan fungsi pemuatan data `loadMembersData`:
         - Panggil `fetchMembersSalaryAndAccounts()`, perbarui `memberList`, dan tangani status loading.
         - Jalankan pada saat inisialisasi halaman (`useEffect`).
         - Jalankan ulang otomatis di dalam `handleConfirm` setelah `confirmSalaryReconciliation` sukses agar data di tabel langsung tersinkronisasi tanpa reload halaman.
       - Pasang logika pemfilteran dan pemotongan halaman:
         ```typescript
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
         ```
       - Tambahkan `useEffect` untuk mereset `currentPage` ke 1 bila `searchQuery` atau `pageSize` berubah.
       - Tepat di bawah kartu formulir "Unggah File Rekonsiliasi", tambahkan kontainer tabel data gaji & rekening anggota:
         - Header toolbar: Judul "Daftar Data Gaji & Rekening Anggota", deskripsi, dan Search Box autocompletion `MemberSearchAutocomplete` dengan lebar responsif.
         - Tabel responsif (NRP, Nama Anggota, Pangkat, No. Rekening Bank, Gaji / THP (Rp), dan Status Rekening).
         - Status rekening menampilkan badge: `Lengkap` (emerald) jika rekening ada, atau `Belum Ada Rekening` (amber) jika kosong.
         - Footer tabel: Indikator rentang item yang tampil ("Menampilkan X-Y dari Z data"), pemilih ukuran halaman dropdown (10, 25, 50, 100 / halaman), serta tombol navigasi halaman `Prev`, `Current/Total`, dan `Next`.
  </action>
  <verify>
    Jalankan pemeriksaan lint & pengujian Vitest halaman:
    `npx vitest run src/components/common/MemberSearchAutocomplete.test.tsx src/services/salaryImportService.test.ts`
  </verify>
  <done>
    Tabel data gaji dan rekening terintegrasi rapi dengan search autocomplete dan kontrol pagination di `/admin/import-gaji`.
  </done>
</task>

<task type="auto">
  <name>Comprehensive Vitest Suite, Static Typecheck, and Production Build Verification</name>
  <files>
    src/
  </files>
  <action>
    1. Jalankan pemeriksaan tipe statis TypeScript untuk memastikan tidak ada kesalahan tipe pada `SalaryImport.tsx`, `MemberSearchAutocomplete.tsx`, dan `salaryImportService.ts`:
       `npx tsc --noEmit`
    2. Jalankan seluruh suite pengujian Vitest untuk memastikan tidak ada regresi pada halaman maupun layanan lain:
       `npm test` atau `npx vitest run`
    3. Jalankan build bundler produksi Vite:
       `npm run build`
  </action>
  <verify>
    `npx tsc --noEmit` selesai dengan 0 error.
    `npx vitest run` seluruh test suite lulus 100%.
    `npm run build` selesai dengan exit code 0 tanpa komplain bundler.
  </verify>
  <done>
    Seluruh verifikasi kode bersih dan siap dijalankan di lingkungan produksi.
  </done>
</task>

## Success Criteria
- [ ] Tabel data gaji dan rekening anggota tampil di bawah area unggah file pada rute `/admin/import-gaji`.
- [ ] Autocomplete search box memungkinkan pencarian instan nama atau NRP dan reset pencarian.
- [ ] Kontrol pagination mendukung opsi 10, 25, 50, dan 100 baris dengan navigasi Prev/Next yang presisi.
- [ ] Master data otomatis ter-refetch setelah proses konfirmasi rekonsiliasi impor selesai.
- [ ] Typecheck `tsc --noEmit` menghasilkan 0 error dan `npm run build` sukses 100%.
