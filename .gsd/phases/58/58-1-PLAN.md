---
phase: 58
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 58.1: Database Schema Expansion & Service Layer Support for Evidence Documentation

## Objective
Menyiapkan fondasi database (`deposit_transactions` & trigger `audit_logs`) dan memperluas service layer (`savingsMatrixService.ts`) agar mendukung penyimpanan metadata bukti setoran (nomor kwitansi/referensi, metode pembayaran, catatan penyesuaian, `created_by`) serta pencatatan audit log saat centang dibatalkan dan fungsi penarik kronologi riwayat audit per sel bulan.

## Context
- `supabase/migrations/034_add_audit_and_reference_to_deposit_transactions.sql`
- `src/services/savingsMatrixService.ts`
- `src/services/savingsMatrixService.test.ts`
- `.gsd/phases/58/RESEARCH.md`

## Tasks

<task type="auto">
  <name>Create Database Migration for Deposit Transactions Evidence & Audit Trigger</name>
  <files>
    supabase/migrations/034_add_audit_and_reference_to_deposit_transactions.sql
  </files>
  <action>
    Buat berkas migrasi `supabase/migrations/034_add_audit_and_reference_to_deposit_transactions.sql`:
    ```sql
    -- 1. Tambahkan kolom dokumentasi pada deposit_transactions
    ALTER TABLE public.deposit_transactions 
    ADD COLUMN IF NOT EXISTS reference_no TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'tunai',
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 2. Buat index untuk pencarian cepat nomor bukti referensi
    CREATE INDEX IF NOT EXISTS idx_deposit_tx_reference_no ON public.deposit_transactions(reference_no);
    CREATE INDEX IF NOT EXISTS idx_deposit_tx_for_period ON public.deposit_transactions(member_deposit_id, for_year, for_month);

    -- 3. Trigger otomatis pencatatan pembatalan/penghapusan centang ke audit_logs
    CREATE OR REPLACE FUNCTION public.log_deposit_transaction_changes()
    RETURNS TRIGGER AS $$
    BEGIN
      IF (TG_OP = 'DELETE') THEN
        INSERT INTO public.audit_logs (
          table_name,
          action,
          record_id,
          entity_name,
          entity_id,
          old_data,
          performed_by,
          notes,
          created_at
        ) VALUES (
          'deposit_transactions',
          'DELETE',
          OLD.id::text,
          'deposit_transactions',
          OLD.member_deposit_id,
          row_to_json(OLD)::jsonb,
          auth.uid(),
          COALESCE(OLD.description, 'Penghapusan / Batal Centang Simpanan'),
          TIMEZONE('utc'::text, NOW())
        );
        RETURN OLD;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    DROP TRIGGER IF EXISTS trg_audit_deposit_tx_delete ON public.deposit_transactions;
    CREATE TRIGGER trg_audit_deposit_tx_delete
    AFTER DELETE ON public.deposit_transactions
    FOR EACH ROW EXECUTE FUNCTION public.log_deposit_transaction_changes();
    ```
  </action>
  <verify>
    Periksa berkas migrasi SQL secara sintaksis dan pastikan seluruh kolom serta trigger terdefinisi dengan aman (idempotent).
  </verify>
  <done>
    Berkas migrasi skema bukti transaksi dan trigger audit log selesai dibuat.
  </done>
</task>

<task type="auto">
  <name>Enhance Savings Matrix Service with Evidence Payload and Audit Retrieval</name>
  <files>
    src/services/savingsMatrixService.ts
    src/services/savingsMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/savingsMatrixService.ts`:
       - Tambahkan interface:
         ```typescript
         export interface CheckMonthPayload {
           memberDepositId: string;
           month: number;
           year: number;
           amount: number;
           referenceNo?: string;
           paymentMethod?: string;
           notes?: string;
           description?: string;
         }

         export interface MonthAuditHistoryItem {
           id: string;
           action: 'CREATE' | 'UPDATE' | 'DELETE';
           amount?: number;
           forMonth: number;
           forYear: number;
           referenceNo?: string;
           paymentMethod?: string;
           notes?: string;
           performerName?: string;
           performerId?: string;
           createdAt: string;
         }
         ```
       - Implementasikan fungsi `saveMonthDepositWithEvidence(payload: CheckMonthPayload)`:
         - Mengambil user id pengelola yang sedang login via `supabase.auth.getUser()`.
         - Menghapus mutasi yang ada pada periode tersebut jika ada (atau upsert).
         - Menyisipkan record baru dengan `reference_no`, `payment_method`, `notes`, `created_by`.
       - Implementasikan fungsi `cancelMonthDepositWithReason(memberDepositId: string, year: number, month: number, reason: string)`:
         - Mengambil data transaksi yang akan dihapus.
         - Mencatat audit log eksplisit ke `audit_logs` (dengan `action: 'DELETE'`, `notes: reason`, dll) atau memperbarui deskripsi transaksi sebelum menghapus sehingga trigger database juga menangkap alasan tersebut.
         - Menghapus transaksi pada periode tersebut dari `deposit_transactions`.
       - Implementasikan fungsi `getMonthAuditHistory(memberDepositId: string, year: number, month: number): Promise<MonthAuditHistoryItem[]>`:
         - Mengambil transaksi aktif saat ini di `deposit_transactions` untuk `member_deposit_id`, `for_year`, `for_month`.
         - Mengambil riwayat penghapusan di `audit_logs` untuk `table_name = 'deposit_transactions'` yang cocok dengan `entity_id` / `old_data->>'member_deposit_id'` dan periode bulan/tahun.
         - Menggabungkan dan mengurutkan secara kronologis (dari terbaru ke terlama).
    2. Tambahkan unit tests di `src/services/savingsMatrixService.test.ts` untuk menguji fungsionalitas `saveMonthDepositWithEvidence`, `cancelMonthDepositWithReason`, dan `getMonthAuditHistory`.
  </action>
  <verify>
    npx vitest run src/services/savingsMatrixService.test.ts
  </verify>
  <done>
    Service layer siap melayani mutasi centang berbukti serta penelusuran riwayat audit per periode.
  </done>
</task>

## Success Criteria
- [ ] Berkas migrasi `034_add_audit_and_reference_to_deposit_transactions.sql` dibuat dengan trigger audit.
- [ ] Interface `CheckMonthPayload` dan `MonthAuditHistoryItem` diekspor di `savingsMatrixService.ts`.
- [ ] Fungsi `saveMonthDepositWithEvidence`, `cancelMonthDepositWithReason`, dan `getMonthAuditHistory` terimplementasi dan lulus unit test.

