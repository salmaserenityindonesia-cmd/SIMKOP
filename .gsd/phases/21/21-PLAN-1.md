---
phase: 21
plan: 1
wave: 1
gap_closure: false
---

# Plan 21.1: Selesaikan Error Schema Cache koperasi_profile & Migrasi Tabel Profil Koperasi

## Objective
Menyelesaikan kendala galat PostgREST "Could not find the table 'public.koperasi_profile' in the schema cache" pada `/admin/pengaturan`. Menyediakan file migrasi DDL SQL untuk Supabase dengan skema profil default Primkoppol Ngawi, dan membangun service layer yang tangguh dengan graceful offline/localStorage fallback di `settingsService.ts` serta feedback visual banner di `PengaturanKoperasi.tsx`.

## Context
Load these files for context:
- supabase/migrations/017_create_koperasi_profile.sql
- src/services/settingsService.ts
- src/services/settingsService.test.ts
- src/pages/admin/PengaturanKoperasi.tsx

## Tasks

<task type="auto">
  <name>Generate DDL Migration for koperasi_profile</name>
  <files>supabase/migrations/017_create_koperasi_profile.sql</files>
  <action>
    - Buat berkas migrasi `supabase/migrations/017_create_koperasi_profile.sql` dengan skema:
      ```sql
      CREATE TABLE IF NOT EXISTS public.koperasi_profile (
        id integer PRIMARY KEY DEFAULT 1,
        nama_koperasi text NOT NULL DEFAULT 'KOPERASI PRIMKOPPOL',
        alamat text NOT NULL DEFAULT 'Jl. Jaksa Agung Suprapto No. 10, Ngawi',
        telepon text DEFAULT '(0354)7654321',
        terminal_name text DEFAULT 'POS Terminal #01',
        footer_notes text DEFAULT 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
        updated_at timestamp with time zone NOT NULL DEFAULT now(),
        CONSTRAINT single_row_check CHECK (id = 1)
      );

      -- Enable RLS
      ALTER TABLE public.koperasi_profile ENABLE ROW LEVEL SECURITY;

      -- Policies
      DROP POLICY IF EXISTS "Allow public read on koperasi_profile" ON public.koperasi_profile;
      CREATE POLICY "Allow public read on koperasi_profile"
        ON public.koperasi_profile FOR SELECT USING (true);

      DROP POLICY IF EXISTS "Allow authenticated insert/update on koperasi_profile" ON public.koperasi_profile;
      CREATE POLICY "Allow authenticated insert/update on koperasi_profile"
        ON public.koperasi_profile FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');

      -- Seed data awal
      INSERT INTO public.koperasi_profile (id, nama_koperasi, alamat, telepon, terminal_name, footer_notes)
      VALUES (1, 'KOPERASI PRIMKOPPOL', 'Jl. Jaksa Agung Suprapto No. 10, Ngawi', '(0354)7654321', 'POS Terminal #01', 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan')
      ON CONFLICT (id) DO NOTHING;
      ```
  </action>
  <verify>Berkas SQL terbuat rapi dan sintaks PostgreSQL valid.</verify>
  <done>DDL migration siap dijalankan di Supabase SQL Editor atau CLI.</done>
</task>

<task type="auto">
  <name>Implement Graceful Fallback in settingsService.ts & Feedback in PengaturanKoperasi.tsx</name>
  <files>
    src/services/settingsService.ts
    src/services/settingsService.test.ts
    src/pages/admin/PengaturanKoperasi.tsx
  </files>
  <action>
    - Perbarui fungsi `getKoperasiProfile()`:
      1. Coba fetch dari Supabase `supabase.from('koperasi_profile').select('*').eq('id', 1).maybeSingle()`.
      2. Jika query gagal / tabel tidak ditemukan (PGRST205 / 42P01), ambil data fallback dari `localStorage.getItem('simkop_koperasi_profile')`.
      3. Jika di localStorage juga kosong, kembalikan konfigurasi default.
    - Perbarui fungsi `updateKoperasiProfile(data)`:
      1. Selalu simpan salinan data ke `localStorage.setItem('simkop_koperasi_profile', JSON.stringify(data))` sebagai backup seketika.
      2. Lakukan `upsert` ke Supabase `supabase.from('koperasi_profile').upsert({ id: 1, ...data, updated_at: new Date().toISOString() })`.
      3. Jika Supabase mengembalikan error "Could not find the table ... in the schema cache", jangan lempar uncaught exception; kembalikan status `isLocalFallback: true` dan simpan perubahan secara lokal.
    - Perbarui `src/pages/admin/PengaturanKoperasi.tsx`:
      Tampilkan notifikasi toast dan banner informasi jika tabel Supabase belum termigrasi, menginstruksikan pengguna untuk menjalankan file SQL migrasi di Supabase SQL Editor.
  </action>
  <verify>Pemanggilan updateKoperasiProfile tidak lagi crash ketika tabel Supabase belum ada di cache.</verify>
  <done>Settings service bersifat resilient dan tidak menghentikan alur kerja kasir/admin.</done>
</task>

<task type="auto">
  <name>Build & Unit Test Verification</name>
  <files>src/</files>
  <action>
    - Jalankan verifikasi statis dan tipe: `npm run build`.
    - Jalankan unit tests: `npx vitest run`.
  </action>
  <verify>Build Vite selesai dengan exit code 0 dan semua unit test lulus 100%.</verify>
  <done>Kode siap dijalankan di lingkungan development maupun production.</done>
</task>

