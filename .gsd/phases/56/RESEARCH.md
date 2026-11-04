# Phase 56 Research: Ubah Urutan Grid Matriks Buku Besar Simpanan Menjadi Bulan Terbaru (Descending)

## 1. Executive Summary & Problem Context
Pada modal "Buku Besar Matriks Simpanan (Checkbox Grid)" di halaman `/admin/compliance-matrix` (`src/components/compliance/SavingsLedgerMatrixModal.tsx`), kolom bulan saat ini dirender secara urut kronologis maju (Ascending: misal Jan-22, Feb-22, ..., Nov-26) dari awal tahun bergabung anggota.

### Problem
- Pengguna harus menggulir (*horizontal scroll*) jauh ke kanan pada tabel matriks hanya untuk melihat atau mengedit status setoran bulan berjalan (misal Nov-26) atau bulan-bulan terkini.
- Pengalaman pengguna (*UX*) kurang efisien untuk rutinitas pembukuan bulanan kasir/admin, di mana 90%+ aktivitas verifikasi dan checklist terjadi pada bulan terbaru.

### Solution
- Mengubah penyusunan dan visual rendering kolom grid bulan menjadi urutan menurun (Descending / Reverse Timeline), sehingga kolom bulan terbaru/berjalan langsung berada di posisi paling kiri depan di seluruh tab simpanan (Simpanan Wajib, Simpanan Belanja, dan Simpanan Lebaran).
- Tetap menjaga algoritma dan kalkulasi internal (misal: alokasi saldo FIFO, penentuan bulan sebelum bergabung, dan aksi cepat "Centang Semua s/d Bulan Ini") agar tetap bekerja akurat dan tidak terpengaruh oleh urutan tampilan visual.

---

## 2. Technical Analysis & Codebase Exploration

### A. Komponen Modal: `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- Saat ini `allGridMonths` dihasilkan dari:
  ```typescript
  const { startYear, endYear, allGridMonths } = useMemo(() => {
    let sYear = 2024;
    if (resolvedJoinDate) {
      const d = new Date(resolvedJoinDate);
      if (!isNaN(d.getTime())) {
        sYear = Math.min(2024, d.getFullYear());
      }
    }
    const currentYear = new Date().getFullYear();
    const eYear = Math.max(2026, currentYear);
    const months = generateMonthGrid(sYear, eYear);
    return { startYear: sYear, endYear: eYear, allGridMonths: months };
  }, [resolvedJoinDate]);
  ```
- Di bagian rendering tabel (`<thead>` dan `<tbody>`):
  - Baris header menggunakan `allGridMonths.map(...)`
  - Baris checkbox `Setoran Rutin` menggunakan `allGridMonths.map(...)`
- Solusi:
  Buat `displayMonths` berbasis `allGridMonths` dengan sorting descending:
  ```typescript
  const displayMonths = useMemo(() => {
    return [...allGridMonths].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [allGridMonths]);
  ```
  Gunakan `displayMonths` khusus untuk rendering kolom `<th>` dan sel `<td>`.

### B. Service: `src/services/savingsMatrixService.ts`
- Fungsi `generateMonthGrid(startYear: number, endYear: number, order: 'asc' | 'desc' = 'asc')` dapat diperluas dengan parameter opsional `order` (default `'asc'`) untuk menjaga backward compatibility dengan pengujian dan pemanggil yang ada.
- Fungsi alokasi FIFO (`calculateFifoAllocation`):
  - Telah mengimplementasikan `sortedMonths = [...months].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));` sehingga aman dan selalu berjalan secara kronologis (start to end) dari bulan tertua ke terbaru tanpa terpengaruh urutan input array.
- Aksi "Centang Semua s/d Bulan Ini" (`handleCheckAllUpToNow`):
  - Melakukan iterasi dan filter independen berdasarkan `isMonthBeforeJoin` dan `isMonthAfterNow`. Urutan penambahan ke `Set` tidak mempengaruhi penandaan checkbox.

### C. Unit Test & Regresi
- `src/components/compliance/SavingsLedgerMatrixModal.test.tsx` (18 unit test saat ini passing 100%).
- `src/services/savingsMatrixService.test.ts` (passing 100%).
- Verifikasi bahwa modal me-render kolom bulan terbaru terlebih dahulu (misal Des-26, Nov-26) di sisi kiri setelah header `Tahun & Item`.

---

## 3. Plan Decomposition
1. **Plan 56.1**: Implementasikan reverse timeline ordering (`displayMonths`) pada `SavingsLedgerMatrixModal.tsx`, dukung parameter `order` opsional di `savingsMatrixService.ts`, dan tambahkan unit test pengurutan kolom descending pada `SavingsLedgerMatrixModal.test.tsx`.
2. **Plan 56.2**: Verifikasi menyeluruh: TypeScript typecheck (`tsc --noEmit`), Vitest suite 100%, dan Vite production build (`npm run build`).

