---
phase: 88
plan: 2
wave: 2
gap_closure: false
---

# Plan 88.2: Support POKOK Code in Batch Import and Review Parser

## Objective
Menyelaraskan alur parser, preview, dan eksekusi impor file Excel pada `src/services/batchUpdateService.ts` dan `src/pages/admin/BatchUpdater.tsx` agar mutasi bertipe `POKOK` diterima secara valid, ditampilkan secara informatif pada tabel Review & Konfirmasi, serta dialokasikan dan dicatat dengan benar ke rekening simpanan pokok anggota terkait di `deposit_transactions`.

## Context
- `src/services/batchUpdateService.ts`
- `src/pages/admin/BatchUpdater.tsx`
- Skema Tabel Supabase:
  - `public.member_deposits`
  - `public.deposit_types`
  - `public.deposit_transactions`

## Tasks

<task type="auto">
  <name>Handle POKOK in Parser and Batch Execution Service</name>
  <files>
    src/services/batchUpdateService.ts
  </files>
  <action>
    1. Buka `src/services/batchUpdateService.ts`.
    2. Pada fungsi `parseBatchUpdateFile`:
       - Izinkan kode simpanan `POKOK` selain `WAJIB`, `LEBARAN`, dan `BELANJA`.
       - Ketika memeriksa `member_deposits` untuk `POKOK`:
         * Jika anggota belum memiliki entri `member_deposits` bertipe `POKOK`, tandai status tetap `READY` (atau sertakan metadata yang memungkinkan pembuatan otomatis rekening simpanan pokok saat eksekusi) agar tidak gagal sebagai `MISMATCH` yang memblokir impor.
    3. Pada fungsi `executeBatchUpdate`:
       - Pisahkan penanganan simpanan bulanan (`WAJIB`, `LEBARAN`, `BELANJA`) dengan `POKOK`:
         * Untuk simpanan bulanan: Hapus mutasi lama pada bulan/tahun tersebut lalu masukkan mutasi baru (perilaku idempotensi bulanan).
         * Untuk `POKOK`:
           - Pastikan `member_deposit_id` untuk `POKOK` tersedia (buat jika belum ada pada tabel `member_deposits`).
           - Masukkan mutasi setoran ke `deposit_transactions`:
             * `member_deposit_id`: ID rekening simpanan pokok anggota
             * `transaction_type`: 'deposit'
             * `amount`: row.nominal_baru
             * `for_month`: month
             * `for_year`: year
             * `description`: `Setoran Simpanan Pokok via Update Massal Bulanan`
    4. Pastikan fungsi eksekusi mengembalikan ringkasan keberhasilan yang akurat.
  </action>
  <verify>
    Pastikan fungsi parsing mengenali baris dengan `kode_simpanan = 'POKOK'` sebagai baris valid bertatus `READY` dan eksekusi menyisipkan mutasi ke `deposit_transactions`.
  </verify>
  <done>
    Parser dan proses eksekusi impor batch update simpanan mendukung pencatatan Simpanan Pokok secara aman dan akurat.
  </done>
</task>

<task type="auto">
  <name>Enhance Review UI in BatchUpdater.tsx for POKOK Rows</name>
  <files>
    src/pages/admin/BatchUpdater.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/BatchUpdater.tsx`.
    2. Pada tabel "Review & Konfirmasi" sebelum submit:
       - Tampilkan badge khusus atau styling yang membedakan jenis tagihan `POKOK` (misal badge berwarna indigo atau slate bertuliskan "Simpanan Pokok") agar admin langsung mengenali bahwa baris tersebut merupakan pelunasan simpanan pokok awal anggota.
       - Pastikan total nominal terhitung akurat menyertakan seluruh baris yang valid termasuk baris `POKOK`.
  </action>
  <verify>
    Tinjau rendering komponen `BatchUpdater.tsx` dan pastikan baris `POKOK` tertampil dengan visual yang rapi dan total perhitungan nominal sesuai.
  </verify>
  <done>
    Tampilan pratinjau tabel konfirmasi di BatchUpdater.tsx menyajikan visual baris Simpanan Pokok dengan jelas dan informatif.
  </done>
</task>

## Success Criteria
- [ ] Baris Excel dengan `Kode Simpanan = 'POKOK'` diparsing sebagai baris valid (`status: READY`).
- [ ] Akun `member_deposits` bertipe `POKOK` dibuat secara otomatis jika anggota belum memilikinya saat eksekusi.
- [ ] Transaksi setoran pokok tercatat di `deposit_transactions` dengan deskripsi informatif.
- [ ] Tabel Review & Konfirmasi di `BatchUpdater.tsx` menampilkan badge khusus untuk baris POKOK.
