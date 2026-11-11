# Plan 82.1: Persistence Layer & Database Migration for Dynamic Minimum THP Setting

## Objective
Membangun lapisan persistensi parameter ambang batas minimum sisa THP (Take Home Pay) dan catatan keputusan RAT:
1. Menyusun migrasi database `supabase/migrations/045_add_min_remaining_thp_to_koperasi_profile.sql` untuk menambahkan kolom `min_remaining_thp` (default: 1500000) dan `min_thp_rat_notes` pada tabel `public.koperasi_profile`.
2. Menambahkan antarmuka `LoanSettings` dan memperbarui `KoperasiProfile` di `src/services/settingsService.ts`.
3. Mengimplementasikan `getLoanSettings()` dan `updateLoanSettings()` dengan strategi multi-tier:
   - Supabase `koperasi_profile` query/upsert
   - LocalStorage fallback (`KOPERASI_PROFILE_STORAGE_KEY`)
   - Default fallback: `minRemainingThp = 1500000`
4. Menghubungkan fungsi bantuan di `src/services/loanService.ts` untuk memfasilitasi pembacaan acuan nilai ambang batas dinamis.
5. Menyusun unit test di `src/services/settingsService.test.ts` untuk memvalidasi `getLoanSettings()` dan `updateLoanSettings()`.

## Tasks
<task type="auto">
  <name>Create Supabase Migration for Minimum THP</name>
  <files>supabase/migrations/045_add_min_remaining_thp_to_koperasi_profile.sql</files>
  <action>
    Buat berkas migrasi idempotent yang menambahkan kolom:
    - `min_remaining_thp numeric NOT NULL DEFAULT 1500000`
    - `min_thp_rat_notes text DEFAULT 'Keputusan RAT Batas Minimum Sisa THP Rp 1.500.000'`
    ke tabel `public.koperasi_profile` serta mengupdate row default id = 1.
  </action>
  <verify>Berkas migrasi SQL valid secara sintaksis PostgreSQL dan idempotent (IF NOT EXISTS).</verify>
  <done>Kolom database siap mendukung persistensi ambang batas THP.</done>
</task>

<task type="auto">
  <name>Implement Dynamic Loan Settings in settingsService and loanService</name>
  <files>src/services/settingsService.ts, src/services/loanService.ts, src/services/settingsService.test.ts</files>
  <action>
    - Di `src/services/settingsService.ts`:
      1. Tambahkan properti ke `KoperasiProfile`:
         `min_remaining_thp?: number; min_thp_rat_notes?: string;`
      2. Definisikan tipe `LoanSettings`:
         `export interface LoanSettings { minRemainingThp: number; ratNotes?: string; }`
      3. Implementasikan `getLoanSettings(forceRefresh?: boolean): Promise<LoanSettings>`:
         Mengambil profil koperasi, mengekstrak `min_remaining_thp` (fallback ke 1.500.000 jika kosong/nol/negatif) dan `min_thp_rat_notes`.
      4. Implementasikan `updateLoanSettings(payload: LoanSettings): Promise<UpdateKoperasiProfileResult>`:
         Menyimpan ke Supabase `koperasi_profile` dan menyinkronkan ke localStorage.
    - Di `src/services/loanService.ts`:
      Ekspor helper `getLoanSettings` atau re-export untuk kemudahan pemanggilan dari modul pinjaman.
    - Buat/update `src/services/settingsService.test.ts` untuk menguji pembacaan, default fallback, dan persistensi `LoanSettings`.
  </action>
  <verify>`npx vitest run src/services/settingsService.test.ts` lulus 100%.</verify>
  <done>Layanan pembacaan dan penyimpanan parameter batas minimum THP siap dan teruji.</done>
</task>

