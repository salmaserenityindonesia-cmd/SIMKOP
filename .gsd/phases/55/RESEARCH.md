# Phase 55 Research: Rapikan Layout Kas Riil Anggota pada Matriks Simpanan (No-Wrap & Tabular Nums)

## 1. Executive Summary & Problem Context
Pada kolom "Informasi Anggota" di halaman Matriks Tracking Pembayaran Simpanan Tahunan (`src/pages/admin/ComplianceMatrix.tsx`), ringkasan kartu posisi "Kas Riil Anggota" mengalami line-wrapping (teks "Rp" dan angka nominal terlipat ke baris bawah, contohnya "Rp" dan "3.250.000" terpisah di baris berbeda).

### Root Causes
1. **Ketiadaan Constraint Lebar Kolom `<td>`:** Header kolom `<th>` memiliki kelas `w-[280px]`, namun sel baris tabel `<td>` tidak memiliki lebar eksplisit (`min-w-[260px]` / `w-64 shrink-0`), menyebabkan layout engine browser mempersempit sel anggota ketika viewport atau resolusi layar menyempit.
2. **Ketiadaan `whitespace-nowrap`:** Nilai nominal uang dan label per jenis simpanan tidak diapit oleh kelas `whitespace-nowrap`, sehingga browser secara otomatis memecah teks pada karakter spasi (antara simbol mata uang "Rp" dan angka nominal).
3. **Perataan Digit Non-Tabular:** Angka tidak memiliki utilitas `tabular-nums`, yang mengakibatkan lebar karakter angka proporsional bervariasi dan menyulitkan perataan vertikal yang simetris antar baris jenis simpanan (Wajib, Belanja, Lebaran).

## 2. Solusi Desain & Teknis
1. **Lebar Kolom Konsisten:**
   - Menetapkan kelas `min-w-[260px] w-64 md:w-[280px] shrink-0` pada `<th>` header dan `<td>` cell kolom "Informasi Anggota".
2. **Pencegahan Pemotongan & Wrapping:**
   - Menggunakan `whitespace-nowrap` pada kontainer kartu kas riil serta pada setiap elemen span nominal mata uang.
3. **Tipografi & Estetika Visual:**
   - Menambahkan utilitas `tabular-nums` untuk perataan angka monospace monospaced digits.
   - Menggunakan header badge `Kas Riil` dengan aksen emerald lembut (`bg-emerald-50/70 border-emerald-200/60 text-emerald-900`) untuk membedakan total kas bersih dengan rincian per sub-kategori simpanan.
4. **Sinkronisasi Unit Test:**
   - Memperbarui asserting text di `src/pages/admin/ComplianceMatrix.test.tsx` agar menyelaraskan teks label kartu (`Kas Riil`) dan memastikan 35/35 test cases lulus 100%.

## 3. Scope of Changes
- `src/pages/admin/ComplianceMatrix.tsx`: Penyesuaian kelas CSS kolom informasi anggota dan markup kartu kas riil.
- `src/pages/admin/ComplianceMatrix.test.tsx`: Penyesuaian assertions test untuk label baru kartu kas riil.
- Pengujian sistemik via `npx tsc --noEmit`, `npx vitest run`, dan `npm run build`.
