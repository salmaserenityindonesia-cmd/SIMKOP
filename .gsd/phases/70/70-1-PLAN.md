---
phase: 70
plan: 1
wave: 1
gap_closure: false
---

# Plan 70.1: Dynamic Rate Resolver for Master Deposit Types & Display Effective Tier Amount

## Objective
Memperbarui resolusi nilai jenis simpanan pada layer service dan tampilan halaman Master Produk Simpan Pinjam (`/admin/master-simpan-pinjam` di `src/pages/admin/ManajemenProdukSimpanPinjam.tsx`). Nilai kolom "Default Jumlah" diambil secara dinamis dari konfigurasi tarif bertingkat aktif (`savings_rate_tiers` / `savingsRateService`), dengan tetap mempertahankan struktur data dasar dan atribut master produk (`Kode`, `Nama`, `Frekuensi`, `Bisa Ditarik?`).

## Context
Load these files for context:
- `src/services/savingsRateService.ts`
- `src/services/koperasiService.ts`
- `src/pages/admin/ManajemenProdukSimpanPinjam.tsx`

## Tasks

<task type="auto">
  <name>Bind Active Tiered Rates into Deposit Types Query</name>
  <files>
    src/services/savingsRateService.ts
    src/services/koperasiService.ts
  </files>
  <action>
    1. Buka `src/services/savingsRateService.ts`:
       - Buat dan ekspor helper `getActiveSavingsRateTiers()`:
         * Mengambil seluruh tier tarif aktif untuk tahun dan bulan berjalan (`currentYear`, `currentMonth`).
         * Menggunakan fungsi `getApplicableRate` atau mengevaluasi rentang `[start_year * 12 + start_month, end_year * 12 + end_month]` terhadap periode saat ini.
         * Mengembalikan mapping objek dictionary `Record<string, number>` (contoh: `{ WAJIB: 210000, BELANJA: 50000, LEBARAN: 300000 }`).
    2. Buka `src/services/koperasiService.ts`:
       - Perbarui interface `DepositType` untuk menambahkan properti opsional:
         ```typescript
         export interface DepositType {
           id: string;
           code: string;
           name: string;
           frequency_type: 'one_time' | 'monthly' | 'yearly' | string;
           default_amount: number;
           can_be_withdrawn: boolean;
           is_active: boolean;
           effective_amount?: number;
         }
         ```
       - Pada fungsi `getDepositTypes()`:
         * Panggil data dari tabel `deposit_types` dan sinkronisasikan bersama `getActiveSavingsRateTiers()`.
         * Map setiap item `DepositType` sehingga memiliki properti `effective_amount`:
           jika ada tarif aktif di `activeRates[code.toUpperCase()]` dan nilainya > 0, gunakan nilai tersebut; jika tidak, gunakan `default_amount`.
         * Pastikan fungsi aman dari kegagalan jaringan dengan fallback ke `dt.default_amount` jika pengambilan tier gagal.
  </action>
  <verify>
    Jalankan pemeriksaan tipe TypeScript:
    npx tsc --noEmit
  </verify>
  <done>
    `getDepositTypes()` mengembalikan daftar produk simpanan yang diperkaya dengan `effective_amount` dinamis dari tarif bertingkat aktif.
  </done>
</task>

<task type="auto">
  <name>Display Effective Tier Amount & Indicator in Master Table</name>
  <files>
    src/pages/admin/ManajemenProdukSimpanPinjam.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ManajemenProdukSimpanPinjam.tsx`:
       - Pada tabel "Daftar Jenis Simpanan", perbarui perenderan kolom **Default Jumlah**:
         * Tentukan nilai yang ditampilkan: `const displayAmount = type.effective_amount ?? type.default_amount ?? 0;`.
         * Cek apakah nilai tersebut bersumber dari sinkronisasi tarif bertingkat:
           `const isTierSynced = Boolean(type.effective_amount && type.effective_amount !== type.default_amount);`.
         * Tampilkan nominal dengan format mata uang (`formatCurrency(displayAmount)`).
         * Jika `isTierSynced` bernilai true, tampilkan badge/indikator visual di bawah nominal:
           `<span className="text-[10px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">* Sinkron Tarif Bertingkat</span>`.
       - Pastikan kolom lain (Kode, Nama, Frekuensi, Bisa Ditarik?, Status, Aksi) tetap utuh dan modal edit simpanan tetap berfungsi normal.
  </action>
  <verify>
    Jalankan validasi build Vite:
    npm run build
  </verify>
  <done>
    Kolom Default Jumlah di `/admin/master-simpan-pinjam` menampilkan nilai tarif bertingkat aktif secara transparan dengan penanda visual.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] `getDepositTypes` menyertakan `effective_amount` yang terhubung dengan `savings_rate_tiers`.
- [ ] Tabel master simpan pinjam menampilkan nilai efektif dan label "* Sinkron Tarif Bertingkat" jika berbeda dari `default_amount`.
- [ ] Typecheck (`npx tsc --noEmit`) dan build produksi (`npm run build`) sukses tanpa error.

## Success Criteria
- [ ] Nilai Simpanan Wajib, Belanja, dan Lebaran menampilkan tarif aktif yang dikonfigurasi di Pengaturan Koperasi.
- [ ] Atribut master produk simpan pinjam lainnya tetap terjaga integritasnya.

