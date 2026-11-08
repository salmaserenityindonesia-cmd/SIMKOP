---
phase: 65
plan: 1
wave: 1
gap_closure: false
---

# Plan 65.1: Reusable MemberSearchAutocomplete Component & Member Salary Fetch Service

## Objective
Membangun fondasi komponen antarmuka autocompletion pencarian anggota yang dapat digunakan ulang (`MemberSearchAutocomplete.tsx`), lengkap dengan navigasi keyboard (`ArrowDown`, `ArrowUp`, `Enter`, `Escape`), serta menyusun layanan kueri paged data gaji dan nomor rekening anggota (`fetchMembersSalaryAndAccounts`) di `src/services/salaryImportService.ts` untuk mendukung tabel data di halaman `/admin/import-gaji`.

## Context
- src/components/common/ProductSearchAutocomplete.tsx (referensi pola autocompletion & keyboard navigation)
- src/components/common/ProductSearchAutocomplete.test.tsx (referensi pengujian helper & markup)
- src/services/salaryImportService.ts
- src/services/koperasiService.ts (referensi fungsi paged query `fetchAllAnggotaPaged`)

## Tasks

<task type="auto">
  <name>Build Reusable Keyboard-Navigable MemberSearchAutocomplete Component and Tests</name>
  <files>
    src/components/common/MemberSearchAutocomplete.tsx,
    src/components/common/MemberSearchAutocomplete.test.tsx
  </files>
  <action>
    1. Buat berkas `src/components/common/MemberSearchAutocomplete.tsx`:
       - Definisikan interface `MemberAutocompleteItem`:
         ```typescript
         export interface MemberAutocompleteItem {
           id: string;
           nrp: string;
           nama: string;
           pangkat?: string | null;
           bank_account_number?: string | null;
           take_home_pay?: number | null;
           master_thp?: number | null;
         }
         ```
       - Definisikan props:
         - `members: MemberAutocompleteItem[]`
         - `value: string`
         - `onChange: (value: string) => void`
         - `onSelectMember: (member: MemberAutocompleteItem | null) => void`
         - `placeholder?: string`
         - `disabled?: boolean`
         - `className?: string`
       - Sediakan fungsi murni helper untuk testability dan performa:
         - `filterMembers(members, searchTerm, limit = 15)`: filter case-insensitive terhadap `member.nama` atau `member.nrp`.
         - `calculateNextMemberHighlightedIndex(currentIndex, totalItems, key)`: kalkulasi perpindahan indeks navigasi panah keyboard.
       - Implementasikan event handlers dan state:
         - Input box dengan icon `Search` di sebelah kiri dan tombol `X` reset di kanan saat `value` tidak kosong.
         - Dropdown card absolut dengan Tailwind CSS: `absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto`.
         - Setiap item menampilkan nama anggota (bold/semibold), badge NRP (font mono), dan info pangkat. Item yang disorot memiliki highlight visual `bg-emerald-50 text-emerald-900` atau `bg-slate-100`.
         - Keyboard event listener `onKeyDown`: `ArrowDown`, `ArrowUp`, `Enter`, `Escape`.
         - Klik di luar dropdown (`useRef` + `mousedown` event listener) untuk otomatis menutup dropdown.
    2. Buat berkas pengujian `src/components/common/MemberSearchAutocomplete.test.tsx`:
       - Uji fungsi murni `filterMembers`: pengembalian semua data saat query kosong, pencarian berdasarkan nama, pencarian berdasarkan NRP, limit data maksimal.
       - Uji fungsi `calculateNextMemberHighlightedIndex`: batas atas, batas bawah, pergeseran panah naik/turun.
       - Uji render komponen, interaksi tombol reset, dan navigasi keyboard.
  </action>
  <verify>
    Jalankan Vitest:
    `npx vitest run src/components/common/MemberSearchAutocomplete.test.tsx`
  </verify>
  <done>
    Komponen `MemberSearchAutocomplete` dan suite pengujian lulus 100%.
  </done>
</task>

<task type="auto">
  <name>Implement Paged Member Salary and Account Query Service and Tests</name>
  <files>
    src/services/salaryImportService.ts,
    src/services/salaryImportService.test.ts
  </files>
  <action>
    1. Buka `src/services/salaryImportService.ts`:
       - Tambahkan tipe data:
         ```typescript
         export interface MemberSalaryAccountItem {
           id: string;
           nrp: string;
           nama: string;
           pangkat?: string | null;
           bank_account_number?: string | null;
           take_home_pay?: number | null;
           master_thp?: number | null;
           status?: string | null;
           membership_status?: string | null;
           created_at?: string | null;
           updated_at?: string | null;
         }
         ```
       - Implementasikan fungsi:
         `export async function fetchMembersSalaryAndAccounts(): Promise<MemberSalaryAccountItem[]>`
         - Melakukan paged loop query ke `supabase.from('anggota')` dengan batch 1000 item per iterasi agar tidak terpotong oleh batasan PostgREST.
         - Memilih kolom `id, nrp, nama, pangkat, bank_account_number, take_home_pay, master_thp, status, membership_status, created_at`.
         - Mengurutkan berdasarkan `nama` ascending.
         - Menangani error jaringan atau kondisi tabel belum dibuat dengan graceful fallback.
    2. Buat berkas pengujian `src/services/salaryImportService.test.ts`:
       - Uji fungsi `fetchMembersSalaryAndAccounts` dengan memvalidasi parsing data, penanganan pagination bila data melebihi 1000 item, dan penanganan kondisi error/empty.
  </action>
  <verify>
    Jalankan Vitest:
    `npx vitest run src/services/salaryImportService.test.ts`
  </verify>
  <done>
    Layanan kueri data anggota dan gajinya terimplementasi dengan aman dan teruji.
  </done>
</task>

## Success Criteria
- [ ] Komponen `MemberSearchAutocomplete.tsx` dapat mencari berdasarkan NRP atau Nama dengan navigasi keyboard.
- [ ] Unit testing `MemberSearchAutocomplete.test.tsx` lulus 100%.
- [ ] Fungsi `fetchMembersSalaryAndAccounts` tersedia di `salaryImportService.ts` untuk memuat seluruh anggota tanpa limitasi PostgREST.
- [ ] Unit testing `salaryImportService.test.ts` lulus 100%.
