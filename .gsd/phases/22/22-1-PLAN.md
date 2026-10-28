---
phase: 22
plan: 1
wave: 1
gap_closure: false
---

# Plan 22.1: Migrasi Skema Database pos_settings & Service Layer Konfigurasi Kasir

## Objective
Mempersiapkan fondasi data dan service layer untuk pengaturan transaksi kasir POS, pelacakan waktu tahan transaksi (`expires_at`), serta fungsi RPC PostgreSQL `cleanup_expired_parked_sales()` untuk otomatisasi pengembalian stok barang yang kadaluwarsa ke tabel produk. Menyediakan `posSettingsService.ts` yang tangguh dengan in-memory cache dan fallback ganda (`localStorage` & default) agar aplikasi tidak terdampak galat schema cache PostgREST.

## Context
Load these files for context:
- supabase/migrations/016_create_pos_sales_tables.sql
- src/services/settingsService.ts
- src/services/koperasiService.ts
- src/lib/supabaseClient.ts

## Tasks

<task type="auto">
  <name>Create Supabase Migration for POS Settings, expires_at column, and Auto-Restock RPC</name>
  <files>
    supabase/migrations/018_pos_settings_and_parked_auto_expire.sql
  </files>
  <action>
    Buat file migrasi `supabase/migrations/018_pos_settings_and_parked_auto_expire.sql`:
    1. Tabel `pos_settings`:
       - `id integer PRIMARY KEY DEFAULT 1`
       - `max_hold_duration_minutes integer NOT NULL DEFAULT 120`
       - `allow_negative_stock boolean DEFAULT false`
       - `updated_at timestamp with time zone DEFAULT now()`
       - `CONSTRAINT single_pos_setting CHECK (id = 1)`
    2. RLS & Policy:
       - `ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;`
       - Policy SELECT publik / authenticated.
       - Policy INSERT/UPDATE untuk role `authenticated`.
       - Initial seed `INSERT INTO public.pos_settings (id, max_hold_duration_minutes, allow_negative_stock) VALUES (1, 120, false) ON CONFLICT (id) DO NOTHING;`
    3. Kolom `expires_at` pada tabel `sales`:
       - `ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS expires_at timestamp with time zone;`
       - Pastikan kolom status/sale_status mendukung status `'parked'` dan `'cancelled'`.
    4. Fungsi RPC `cleanup_expired_parked_sales()`:
       - Cari transaksi `sales` berstatus `'parked'` (cek baik `status = 'parked'` maupun `sale_status = 'parked'`) di mana `expires_at < now()`.
       - Loop item di `sale_items`: update `products.stock = products.stock + COALESCE(sale_items.quantity, sale_items.qty, 0) WHERE products.id = sale_items.product_id`.
       - Update `sales.status = 'cancelled'` dan `sales.sale_status = 'cancelled'`.
       - Return `jsonb_build_object('success', true, 'cleaned_count', v_count)`.
  </action>
  <verify>
    Sintaks SQL valid tanpa error syntax, struktur tabel dan RPC terdefinisi lengkap.
  </verify>
  <done>
    Berkas migrasi SQL siap diaplikasikan di database Supabase.
  </done>
</task>

<task type="auto">
  <name>Build Resilient POS Settings Service Layer with Offline Fallback</name>
  <files>
    src/services/posSettingsService.ts
  </files>
  <action>
    Buat modul `src/services/posSettingsService.ts`:
    1. Interface `POSSettings`:
       - `id?: number`
       - `max_hold_duration_minutes: number`
       - `allow_negative_stock: boolean`
       - `updated_at?: string`
    2. Konstanta `DEFAULT_POS_SETTINGS`:
       - `id: 1, max_hold_duration_minutes: 120, allow_negative_stock: false`
    3. In-memory cache & safe `localStorage` helper (`simkop_pos_settings`).
    4. Fungsi `getPosSettings(forceRefresh?: boolean): Promise<POSSettings>`:
       - Query Supabase `pos_settings` id=1.
       - Tangani error graceful (schema cache / table missing) dengan fallback ke localStorage atau default.
    5. Fungsi `updatePosSettings(settings: Partial<POSSettings>): Promise<{ success: boolean; data: POSSettings; isLocalFallback?: boolean; error?: string }>`:
       - Simpan ke `localStorage`.
       - Upsert ke Supabase `pos_settings`.
       - Tangani galat schema cache tanpa melempar crash.
    6. Fungsi `cleanupExpiredParkedSales(): Promise<{ success: boolean; cleanedCount: number; error?: string }>`:
       - Panggil RPC `cleanup_expired_parked_sales`.
       - Sediakan fallback client-side query jika RPC belum terdaftar di schema cache.
  </action>
  <verify>
    File `src/services/posSettingsService.ts` mengekspor `getPosSettings`, `updatePosSettings`, dan `cleanupExpiredParkedSales` serta lulus pengecekan tipe.
  </verify>
  <done>
    Service layer POS settings aktif dan resilient terhadap schema cache database.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Berkas DDL `018_pos_settings_and_parked_auto_expire.sql` tersedia dan sintaksnya valid.
- [ ] `posSettingsService.ts` mengimplementasikan strategi fallback bertingkat (Memory -> Supabase -> LocalStorage -> Default).
- [ ] Fungsi restock otomatis RPC dan client-side fallback siap menangani kedaluwarsa parked transaction.

## Success Criteria
- [ ] All tasks verified passing
- [ ] Must-haves confirmed
- [ ] No type check errors
