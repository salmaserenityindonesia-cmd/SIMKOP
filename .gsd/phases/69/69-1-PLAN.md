---
phase: 69
plan: 1
wave: 1
gap_closure: false
---

# Plan 69.1: Sidebar Scroll Position Persistence & Contextual Auto-Focus

## Objective
Mencegah kontainer sidebar navigasi kiri (`AdminLayout.tsx` & `Sidebar.tsx`) melompat kembali ke posisi paling atas saat pengguna mengklik menu di bagian bawah (seperti Manajemen Anggota, Buku Besar Belanja, atau Laporan Keuangan). Mengimplementasikan retensi posisi scroll berbasis `sessionStorage` (`simkop_sidebar_scroll_top`) dan auto-scroll kontekstual (`scrollIntoView`) pada item menu yang aktif saat rute halaman berpindah.

## Context
Load these files for context:
- `src/components/layout/AdminLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/AdminSidebar.tsx`
- `src/components/layout/Sidebar.test.tsx`

## Tasks

<task type="auto">
  <name>Implement Scroll Position Persistence in AdminLayout and Sidebar</name>
  <files>
    src/components/layout/AdminLayout.tsx
    src/components/layout/Sidebar.tsx
  </files>
  <action>
    1. Buka `src/components/layout/AdminLayout.tsx`:
       - Tambahkan `useRef<HTMLDivElement | null>(null)` untuk kontainer scroll sidebar (`navContainerRef`).
       - Tambahkan handler `handleNavScroll` pada kontainer scrollable (`div.space-y-6.flex-1.overflow-y-auto`):
         ```typescript
         const handleNavScroll = (e: React.UIEvent<HTMLDivElement>) => {
           const target = e.currentTarget;
           sessionStorage.setItem('simkop_sidebar_scroll_top', String(target.scrollTop));
         };
         ```
       - Tambahkan `useLayoutEffect` yang mendengarkan perubahan `location.pathname`:
         * Ambil `sessionStorage.getItem('simkop_sidebar_scroll_top')`.
         * Jika ada, pulihkan posisi scroll: `container.scrollTop = Number(savedScrollTop)`.
         * Sebagai fallback / penegasan keterlihatan, temukan item menu yang aktif (`[aria-current="page"]` atau elemen dengan border aktif `border-secondary-fixed`) dan jalankan `activeItem.scrollIntoView({ block: 'nearest', behavior: 'instant' })`.
       - Pasang `ref={navContainerRef}` dan `onScroll={handleNavScroll}` pada elemen kontainer scrollable sidebar di `AdminLayout.tsx`.
    2. Buka `src/components/layout/Sidebar.tsx`:
       - Tambahkan handler `handleItemClick` pada `NavLink`:
         Saat pengguna mengklik salah satu menu, simpan posisi `scrollTop` kontainer terdekat (`e.currentTarget.closest('.overflow-y-auto')`) ke `sessionStorage` sebelum perpindahan rute terjadi.
       - Tambahkan `useLayoutEffect` berbasis `useLocation` di dalam `Sidebar.tsx` untuk memastikan posisi scroll tetap terpulihkan atau memfokuskan item aktif bahkan jika `Sidebar` digunakan dalam konteks mandiri.
  </action>
  <verify>
    Jalankan pemeriksaan tipe TypeScript:
    npx tsc --noEmit
  </verify>
  <done>
    Kontainer sidebar menyimpan posisi scroll ke sessionStorage saat scrolling/klik dan memulihkannya secara instan saat rute berubah.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests for Sidebar Scroll Persistence and Verify Build</name>
  <files>
    src/components/layout/Sidebar.test.tsx
  </files>
  <action>
    1. Perbarui `src/components/layout/Sidebar.test.tsx`:
       - Tambahkan pengujian unit untuk verifikasi interaksi `sessionStorage`:
         * Memastikan `sessionStorage.setItem` dipanggil dengan key `'simkop_sidebar_scroll_top'` saat item menu diklik.
         * Memastikan scroll position dipulihkan dari `sessionStorage` saat komponen me-mount dengan rute tertentu.
         * Memastikan fallback `scrollIntoView` dipanggil pada elemen aktif jika `savedScrollTop` bernilai null.
    2. Jalankan validasi pengujian dan build produksi:
       - `npx vitest run src/components/layout/Sidebar.test.tsx`
       - `npm run build`
  </action>
  <verify>
    Jalankan unit test dan production build:
    npx vitest run src/components/layout/Sidebar.test.tsx
    npm run build
  </verify>
  <done>
    Unit tests untuk retensi scroll sidebar lulus 100% dan build produksi sukses tanpa error tipe TypeScript.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Posisi scroll sidebar navigasi disimpan ke `sessionStorage` dengan key `'simkop_sidebar_scroll_top'`.
- [ ] Saat perpindahan menu rute terjadi, `scrollTop` kontainer dipulihkan atau item aktif terfokus via `scrollIntoView`.
- [ ] Seluruh unit test lulus dan `npm run build` berhasil dengan exit code 0.

## Success Criteria
- [ ] Semua task diverifikasi lulus.
- [ ] Tidak ada loncatan scroll (reset ke posisi 0) saat pengguna berpindah menu dari kelompok navigasi bagian bawah.
