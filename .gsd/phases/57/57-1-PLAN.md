---
phase: 57
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 57.1: Restore Ascending Grid Order & Implement Auto-Scroll to Current Month Column

## Objective
Mengembalikan penyusunan kolom bulan pada modal buku besar simpanan (`SavingsLedgerMatrixModal.tsx`) menjadi kronologis (Ascending), menambahkan referensi React (`useRef`) dan fungsi auto-scroll horizontal cerdas ke kolom bulan saat ini (Current Month) saat modal dibuka atau tab berganti, serta menambahkan penanda visual highlight ("Bulan Ini").

## Context
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`
- `.gsd/phases/57/RESEARCH.md`

## Tasks

<task type="auto">
  <name>Restore Ascending Grid Order and Add Auto-Scroll to Current Month Column</name>
  <files>
    src/components/compliance/SavingsLedgerMatrixModal.tsx
    src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </files>
  <action>
    1. Buka `src/components/compliance/SavingsLedgerMatrixModal.tsx`:
       - Tentukan penanda waktu bulan berjalan:
         ```typescript
         const today = new Date();
         const currentYear = today.getFullYear();
         const currentMonth = today.getMonth() + 1; // 1-12
         ```
       - Kembalikan mapping kolom grid pada header `<thead>` dan baris `<tbody>` ke `allGridMonths` (urutan kronologis Ascending dari tahun bergabung tertua hingga tahun terkini).
       - Buat reference React untuk kontainer scroll tabel dan kolom bulan berjalan:
         ```typescript
         const scrollContainerRef = useRef<HTMLDivElement | null>(null);
         const currentMonthColRef = useRef<HTMLTableHeaderCellElement | null>(null);
         ```
       - Pasang `ref={scrollContainerRef}` pada kontainer tabel `<div className="overflow-x-auto">`.
       - Pada pemetaan kolom header `<th>`:
         - Tentukan `const isCurrentMonth = m.year === currentYear && m.month === currentMonth;`.
         - Pasang `ref={isCurrentMonth ? currentMonthColRef : null}`.
         - Berikan penanda visual jika `isCurrentMonth`: ring emerald halus, background hijau lembut, dan badge "Bulan Ini".
         - Tambahkan `data-testid={isCurrentMonth ? 'current-month-col' : undefined}`.
       - Tambahkan `useEffect` auto-scroll:
         ```typescript
         useEffect(() => {
           if (!loading) {
             const timer = setTimeout(() => {
               if (currentMonthColRef.current) {
                 currentMonthColRef.current.scrollIntoView({
                   behavior: 'smooth',
                   block: 'nearest',
                   inline: 'center'
                 });
               }
             }, 150);
             return () => clearTimeout(timer);
           }
         }, [loading, activeTab]);
         ```
    2. Buka `src/components/compliance/SavingsLedgerMatrixModal.test.tsx`:
       - Sesuaikan pengujian urutan kolom bulan agar memastikan susunan kronologis (Jan-24 muncul sebelum Nov-26, dan Nov-26 muncul sebelum Des-26).
       - Verifikasi bahwa kolom bulan berjalan memiliki elemen badge "Bulan Ini" atau `data-testid="current-month-col"`.
       - Jalankan unit test dengan vitest.
  </action>
  <verify>
    npx vitest run src/components/compliance/SavingsLedgerMatrixModal.test.tsx
  </verify>
  <done>
    Urutan kolom kembali kronologis alami, kolom bulan berjalan ter-highlight dengan jelas dan siap menerima trigger auto-scroll. Seluruh pengujian komponen lulus 100%.
  </done>
</task>

## Success Criteria
- [ ] Grid bulan modal buku besar simpanan tersusun secara kronologis (Ascending: Jan awal s/d Des terkini).
- [ ] Kontainer tabel dan kolom bulan berjalan memiliki ref yang terhubung.
- [ ] Efek auto-scroll aktif saat data selesai dimuat atau ketika tab jenis simpanan berganti.
- [ ] Kolom bulan berjalan memiliki penanda visual tegas ("Bulan Ini" badge & highlight ring).
- [ ] Unit tests di `SavingsLedgerMatrixModal.test.tsx` lulus 100%.

