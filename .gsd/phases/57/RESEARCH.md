# Phase 57 Research: Implementasi Auto-Scroll Horisontal ke Bulan Ini pada Modal Buku Besar Matriks Simpanan

## 1. Executive Summary & Problem Context
Pengguna menginginkan agar urutan kolom matriks simpanan tetap mempertahankan alur kronologis alami (Ascending: dari tahun/bulan bergabung di sisi kiri ke tahun/bulan terkini di sisi kanan).
Namun, untuk mengatasi masalah scroll manual yang jauh pada anggota lama (seperti anggota sejak 2022/2024), modal harus secara otomatis menggulir (*auto-scroll*) tabel horizontal agar kolom bulan berjalan (saat ini November 2026 / bulan aktif) langsung berada di tengah (*center view*) begitu modal dimuat atau ketika tab simpanan berganti (Wajib, Belanja, Lebaran).

Selain itu, kolom bulan berjalan perlu diberikan penanda visual yang tegas (seperti highlight border ring, background subtle emerald, atau badge "Bulan Ini") sehingga admin dapat langsung memfokuskan pandangan pada periode aktif tanpa kebingungan.

---

## 2. Technical Analysis & Codebase Exploration

### A. Komponen Modal: `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- Grid bulan saat ini dihasilkan dari:
  ```typescript
  const { startYear, endYear, allGridMonths } = useMemo(...)
  ```
  yang secara default terurut kronologis (Ascending: `startYear` ke `endYear`, bulan 1 ke 12).
- Perubahan urutan rendering:
  Kembalikan pemetaan tabel `<thead>` dan `<tbody>` ke urutan kronologis asli `allGridMonths` (Ascending), sehingga urutan bulan bergerak maju dari masa lalu ke masa depan (Jan-22, Feb-22 ... Nov-26, Des-26).
- Implementasi Auto-Scroll:
  - Penanda waktu:
    ```typescript
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12
    ```
  - Refs:
    ```typescript
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const currentMonthColRef = useRef<HTMLTableHeaderCellElement | null>(null);
    ```
  - Kontainer tabel:
    `<div ref={scrollContainerRef} className="overflow-x-auto">`
  - Elemen header kolom bulan berjalan:
    ```tsx
    const isCurrentMonth = m.year === currentYear && m.month === currentMonth;
    <th
      key={m.key}
      ref={isCurrentMonth ? currentMonthColRef : null}
      data-testid={isCurrentMonth ? 'current-month-col' : undefined}
      className={`py-2.5 px-2 border-r border-slate-200 min-w-[76px] whitespace-nowrap transition-colors ${
        isCurrentMonth ? 'bg-emerald-50/80 ring-2 ring-inset ring-emerald-500 font-extrabold text-emerald-950' : ''
      }`}
    >
      <div>{m.label}</div>
      {isCurrentMonth && (
        <span className="inline-block mt-0.5 px-1 py-0.2 text-[9px] font-bold rounded bg-emerald-600 text-white uppercase tracking-wider">
          Bulan Ini
        </span>
      )}
    </th>
    ```
  - Trigger `useEffect`:
    Dijalankan saat `loading` selesai (`!loading`) atau saat `activeTab` berganti. Menggunakan `scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })` dengan jeda aman `setTimeout` (150ms) agar elemen DOM telah ter-mount sempurna setelah transisi rendering.

### B. Unit Testing: `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`
- Sesuaikan unit test pengurutan kolom agar memverifikasi susunan kronologis (Jan-24 muncul sebelum Nov-26, dan Nov-26 sebelum Des-26).
- Tambahkan pengujian yang memverifikasi kehadiran atribut/penanda kolom bulan berjalan (`data-testid="current-month-col"`, badge teks "Bulan Ini", atau class ring emerald).

---

## 3. Plan Decomposition
1. **Plan 57.1**: Kembalikan urutan kolom grid menjadi kronologis (Ascending), pasang refs, styling highlight bulan berjalan, dan trigger auto-scroll pada `SavingsLedgerMatrixModal.tsx`. Perbarui assertions test di `SavingsLedgerMatrixModal.test.tsx`.
2. **Plan 57.2**: Verifikasi statis menyeluruh: TypeScript typecheck (`tsc --noEmit`), full Vitest suite 100%, dan Vite production build (`npm run build`).

