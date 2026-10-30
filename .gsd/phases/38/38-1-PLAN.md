---
phase: 38
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 38.1: Skema Database & Service Layer Ukuran Kertas Thermal (58mm vs 80mm)

## Objective
Menyediakan dukungan skema database PostgreSQL dan service layer untuk menyimpan preferensi ukuran kertas printer thermal kasir (`receipt_paper_size`: `'58mm' | '80mm'`, default `'80mm'`). Menyinkronkan nilai ini secara reaktif antara Supabase `pos_settings` dan `localStorage` serta melindunginya dengan pengujian unit otomatis.

## Context
Load these files for context:
- `supabase/migrations/022_add_member_discount_to_pos_settings.sql` (referensi migrasi pos_settings)
- `src/services/posSettingsService.ts` (type contract, DEFAULT_POS_SETTINGS, getter/setter, fallback)
- `src/services/posSettingsService.test.ts` (unit tests posSettingsService)

## Findings That Shape This Plan
1. **Nomor Urut Migrasi**: File migrasi terakhir adalah `027_create_inventory_mutation_view.sql`. Oleh karena itu migrasi baru WAJIB diberi nomor `028_add_receipt_paper_size_to_pos_settings.sql` (bukan 026 yang sudah terpakai oleh modul retur).
2. **Kesesuaian Tipe & Default**: Tipe ukuran kertas adalah union `'58mm' | '80mm'` dengan default `'80mm'`.
3. **Multi-layer Fallback**: `posSettingsService.ts` memiliki fallback offline ke `localStorage` (key `simkop_pos_settings`). Properti `receipt_paper_size` harus disertakan di `DEFAULT_POS_SETTINGS`, `getStoredLocalSettings()`, `getPosSettings()`, dan `updatePosSettings()`.

## Tasks

<task type="auto">
  <name>Create Migration 028 and Update posSettingsService</name>
  <files>
    supabase/migrations/028_add_receipt_paper_size_to_pos_settings.sql
    src/services/posSettingsService.ts
  </files>
  <action>
    1. Buat file migrasi `supabase/migrations/028_add_receipt_paper_size_to_pos_settings.sql`:
       ```sql
       -- Migration 028: Add receipt_paper_size to pos_settings table
       ALTER TABLE public.pos_settings 
       ADD COLUMN IF NOT EXISTS receipt_paper_size text NOT NULL DEFAULT '80mm' 
       CHECK (receipt_paper_size IN ('58mm', '80mm'));

       COMMENT ON COLUMN public.pos_settings.receipt_paper_size IS 'Ukuran kertas thermal printer kasir (58mm atau 80mm)';
       ```
    2. Perbarui `src/services/posSettingsService.ts`:
       - Pada interface `POSSettings`: tambahkan `receipt_paper_size?: '58mm' | '80mm';`.
       - Pada `DEFAULT_POS_SETTINGS`: tambahkan `receipt_paper_size: '80mm'`.
       - Pada `getStoredLocalSettings()`: lakukan parsing properti `receipt_paper_size`:
         ```ts
         receipt_paper_size: (parsed.receipt_paper_size === '58mm' || parsed.receipt_paper_size === '80mm')
           ? parsed.receipt_paper_size
           : DEFAULT_POS_SETTINGS.receipt_paper_size,
         ```
       - Pada `getPosSettings()`: ekstrak `receipt_paper_size` dari data Supabase dengan fallback ke `DEFAULT_POS_SETTINGS.receipt_paper_size`.
       - Pada `updatePosSettings()`: sertakan `receipt_paper_size` di objek `merged` dan payload upsert database Supabase.
  </action>
  <verify>npx tsc --noEmit; Test-Path supabase/migrations/028_add_receipt_paper_size_to_pos_settings.sql</verify>
  <done>Migrasi SQL dibuat dan fungsi getter/setter `posSettingsService` mendukung `receipt_paper_size` tanpa error kompilasi.</done>
</task>

<task type="auto">
  <name>Add Unit Tests for receipt_paper_size in posSettingsService</name>
  <files>
    src/services/posSettingsService.test.ts
  </files>
  <action>
    1. Buka `src/services/posSettingsService.test.ts`.
    2. Tambahkan pengujian unit untuk:
       - Memastikan `DEFAULT_POS_SETTINGS.receipt_paper_size` adalah `'80mm'`.
       - Menguji `getPosSettings()` mengembalikan `'80mm'` saat fallback ke default.
       - Menguji `getStoredLocalSettings()` dan `getPosSettings()` berhasil membaca nilai `'58mm'` yang tersimpan di `localStorage`.
       - Menguji `updatePosSettings({ receipt_paper_size: '58mm' })` berhasil memperbarui data di `localStorage` dan memanggil Supabase upsert dengan payload `receipt_paper_size: '58mm'`.
  </action>
  <verify>npx vitest run src/services/posSettingsService.test.ts</verify>
  <done>Semua pengujian unit `posSettingsService.test.ts` lulus 100%.</done>
</task>

## Success Criteria
- [ ] File migrasi `028_add_receipt_paper_size_to_pos_settings.sql` valid.
- [ ] `POSSettings` interface dan `DEFAULT_POS_SETTINGS` memuat `receipt_paper_size: '80mm'`.
- [ ] Pengujian unit di `posSettingsService.test.ts` mencakup getter, setter, dan fallback ukuran kertas.
