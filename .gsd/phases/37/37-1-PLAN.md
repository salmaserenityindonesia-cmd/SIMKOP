---
phase: 37
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 37.1: Implementasi Kontrol Pagination (10/25/50/100 Baris) pada Tabel Retur Pembelian

## Objective
Mengintegrasikan kontrol pagination dinamis pada tabel riwayat retur pembelian di `src/pages/admin/ManajemenReturPembelian.tsx`. Menambahkan kontrol pilihan batas baris (10, 25, 50, dan 100 baris per halaman), informasi rentang baris aktif ("Menampilkan X-Y dari Z retur"), tombol navigasi (Prev, Current/Total Page, Next), serta auto-reset ke halaman 1 saat filter/pencarian berubah, konsisten dengan antarmuka `ManajemenPembelian.tsx`.

## Context
Load these files for context:
- `src/pages/admin/ManajemenReturPembelian.tsx` (state L50-55, filtering L128-148, search reset L390-405, pagination footer L575-612)
- `src/pages/admin/ManajemenPembelian.tsx` (reference implementation L49-51, L323-324, L614-656)

## Findings That Shape This Plan
1. **Existing Pagination Limitations**: `ManajemenReturPembelian.tsx` sebelumnya memiliki `const [itemsPerPage] = useState(10)` tanpa setter, dan footer pagination dibungkus kondisi `filteredReturns.length > itemsPerPage` sehingga ketika data <= 10 item, footer tidak muncul sama sekali dan pengguna tidak dapat memilih pageSize lain.
2. **Auto-reset State**: `setCurrentPage(1)` sudah dipanggil pada `setSearchTerm`, `setStatusFilter`, dan `setTypeFilter`. Namun pada tombol reset pencarian (ikon `X` pada baris 400), `setCurrentPage(1)` belum dipanggil.
3. **Desain Selaras SIMKOP**: Mengadopsi struktur flex footer dari `ManajemenPembelian.tsx` dengan pemilih ukuran halaman dropdown (10, 25, 50, 100), label rentang `totalItems === 0 ? 0 : startIndex + 1` sampai `endIndex` dari `totalItems`, dan tombol Prev/Next dengan styling yang responsif.

## Tasks

<task type="auto">
  <name>Implement Pagination State & Slicing Logic in ManajemenReturPembelian</name>
  <files>
    src/pages/admin/ManajemenReturPembelian.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ManajemenReturPembelian.tsx`.
    2. Ubah state pagination:
       - Ganti `const [itemsPerPage] = useState(10);` menjadi:
         ```tsx
         const [pageSize, setPageSize] = useState<number>(10);
         ```
    3. Perbarui kalkulasi pembagian halaman:
       ```tsx
       const totalItems = filteredReturns.length;
       const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
       const startIndex = (currentPage - 1) * pageSize;
       const endIndex = Math.min(startIndex + pageSize, totalItems);
       const paginatedReturns = filteredReturns.slice(startIndex, endIndex);
       ```
    4. Pastikan `setCurrentPage(1)` dipanggil ketika:
       - `searchTerm` berubah melalui input teks (sudah ada)
       - `searchTerm` di-clear melalui tombol `X` (tambahkan `setCurrentPage(1)` pada `onClick` tombol `X`)
       - `statusFilter` berubah (sudah ada)
       - `typeFilter` berubah (sudah ada)
       - `pageSize` diubah oleh pengguna
    5. Pastikan `paginatedReturns` dirender pada `<tbody>` tabel riwayat retur.
  </action>
  <verify>npx tsc --noEmit; Select-String -Path src/pages/admin/ManajemenReturPembelian.tsx -Pattern "pageSize","setPageSize","paginatedReturns"</verify>
  <done>State pagination dinamis dan kalkulasi slicing terintegrasi tanpa error tipe.</done>
</task>

<task type="auto">
  <name>Build Responsive Pagination Footer UI Matching SIMKOP Pattern</name>
  <files>
    src/pages/admin/ManajemenReturPembelian.tsx
  </files>
  <action>
    1. Ganti blok pagination lama (L575-612) dengan footer baru yang selalu tampil di bawah tabel (selama tidak dalam kondisi loading kosong):
       ```tsx
       {/* Pagination Controls */}
       <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm p-4 border-t border-outline-variant/30 bg-surface">
         {/* Info & Rows Per Page Selector */}
         <div className="flex items-center gap-2 text-on-surface-variant text-xs sm:text-sm">
           <span>
             Menampilkan{' '}
             <strong className="font-semibold text-on-surface">
               {totalItems === 0 ? 0 : startIndex + 1}-{endIndex}
             </strong>{' '}
             dari <strong className="font-semibold text-on-surface">{totalItems}</strong> faktur retur
           </span>
           <div className="flex items-center gap-1 ml-2">
             <select
               value={pageSize}
               onChange={(e) => {
                 setPageSize(Number(e.target.value));
                 setCurrentPage(1);
               }}
               className="px-2 py-1 bg-surface-container-lowest border border-outline rounded-lg text-xs font-medium text-on-surface focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none cursor-pointer"
             >
               <option value={10}>10 / halaman</option>
               <option value={25}>25 / halaman</option>
               <option value={50}>50 / halaman</option>
               <option value={100}>100 / halaman</option>
             </select>
           </div>
         </div>

         {/* Navigation Buttons */}
         <div className="flex items-center gap-1.5">
           <button
             onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
             disabled={currentPage === 1}
             className="px-3 py-1.5 text-xs font-medium bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg border border-outline-variant/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
           >
             Sebelumnya
           </button>
           
           <span className="text-xs font-semibold px-2 text-on-surface">
             {currentPage} / {totalPages}
           </span>

           <button
             onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
             disabled={currentPage >= totalPages || totalPages === 0}
             className="px-3 py-1.5 text-xs font-medium bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg border border-outline-variant/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
           >
             Selanjutnya
           </button>
         </div>
       </div>
       ```
    2. Pastikan tombol "Sebelumnya" disabled ketika `currentPage === 1`, dan tombol "Selanjutnya" disabled ketika `currentPage >= totalPages`.
    3. Pastikan penanganan responsif rapi pada mobile (`flex-col sm:flex-row`).
  </action>
  <verify>npx tsc --noEmit; Select-String -Path src/pages/admin/ManajemenReturPembelian.tsx -Pattern "setPageSize","10 / halaman","100 / halaman"</verify>
  <done>Footer pagination dirender dengan benar, dropdown ukuran halaman berfungsi, dan navigasi tombol berpindah halaman dengan tepat.</done>
</task>

## Success Criteria
- [ ] Dropdown ukuran baris (10, 25, 50, 100 per halaman) tersedia dan dapat diubah.
- [ ] Informasi rentang baris ("Menampilkan X-Y dari Z faktur retur") akurat sesuai halaman dan ukuran aktif.
- [ ] Tombol Sebelumnya/Selanjutnya menavigasi halaman dengan benar dan ter-disable pada batas awal/akhir.
- [ ] Pencarian dan filter kategori mereset halaman ke 1.
- [ ] Tidak ada regresi pada fungsionalitas modal detail, edit, maupun klaim retur.
