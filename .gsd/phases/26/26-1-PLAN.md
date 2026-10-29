---
phase: 26
plan: 1
wave: 1
gap_closure: false
---

# Plan 26.1: Wave 1 - Database Migration & POS Settings Service Layer

## Objective
Menyediakan kolom konfigurasi `member_discount_percentage` pada tabel `pos_settings` Supabase serta memperbarui service layer `posSettingsService.ts` untuk mendukung pembacaan dan penyimpanan nilai persentase diskon dinamis dengan fallback offline / localStorage.

## Context
Load these files for context:
- supabase/migrations/018_pos_settings_and_parked_auto_expire.sql
- src/services/posSettingsService.ts

## Tasks

<task type="auto">
  <name>Create Migration 022 for member_discount_percentage in pos_settings</name>
  <files>
    supabase/migrations/022_add_member_discount_to_pos_settings.sql
  </files>
  <action>
    Buat file migrasi SQL baru `supabase/migrations/022_add_member_discount_to_pos_settings.sql`:
    ```sql
    -- Migration 022: Add member_discount_percentage to pos_settings table
    ALTER TABLE public.pos_settings 
    ADD COLUMN IF NOT EXISTS member_discount_percentage numeric NOT NULL DEFAULT 5.00 
    CHECK (member_discount_percentage >= 0 AND member_discount_percentage <= 100);

    COMMENT ON COLUMN public.pos_settings.member_discount_percentage IS 'Persentase diskon belanja otomatis untuk anggota koperasi (0 - 100%)';
    ```
  </action>
  <verify>
    File migrasi ada di direktori `supabase/migrations/022_add_member_discount_to_pos_settings.sql` dengan sintaks SQL valid.
  </verify>
  <done>
    Skema database mendefinisikan kolom `member_discount_percentage` dengan default 5.00 dan constraint CHECK 0-100.
  </done>
</task>

<task type="auto">
  <name>Update POSSettings Interface and Service in posSettingsService.ts</name>
  <files>
    src/services/posSettingsService.ts
  </files>
  <action>
    Perbarui `src/services/posSettingsService.ts`:
    1. Pada interface `POSSettings`:
       - Tambahkan properti `member_discount_percentage: number;`
    2. Pada objek `DEFAULT_POS_SETTINGS`:
       - Tambahkan nilai default `member_discount_percentage: 5.0`
    3. Pada fungsi `getPosSettings(forceRefresh)`:
       - Ekstrak `data.member_discount_percentage`:
         ```ts
         member_discount_percentage: typeof data.member_discount_percentage !== 'undefined' && data.member_discount_percentage !== null
           ? Number(data.member_discount_percentage)
           : DEFAULT_POS_SETTINGS.member_discount_percentage,
         ```
       - Pastikan pembacaan fallback `getStoredLocalSettings()` memetakan default `5.0` jika field belum tersimpan.
    4. Pada fungsi `updatePosSettings(settings)`:
       - Sertakan `member_discount_percentage: merged.member_discount_percentage` pada upsert query Supabase dan `saveStoredLocalSettings(merged)`.
  </action>
  <verify>
    TypeScript kompilasi tanpa error di `posSettingsService.ts` dan fungsi mengembalikan field `member_discount_percentage`.
  </verify>
  <done>
    Service `posSettingsService` mampu membaca dan menyimpan persentase diskon anggota secara reaktif ke DB dan localStorage.
  </done>
</task>

## Success Criteria
- [ ] Berkas migrasi `supabase/migrations/022_add_member_discount_to_pos_settings.sql` tersedia.
- [ ] Interface `POSSettings` memiliki field `member_discount_percentage: number`.
- [ ] `DEFAULT_POS_SETTINGS` memiliki default 5.0%.
- [ ] `getPosSettings` dan `updatePosSettings` memproses `member_discount_percentage` secara utuh.
