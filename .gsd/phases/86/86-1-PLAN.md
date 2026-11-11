---
phase: 86
plan: 1
wave: 1
gap_closure: false
---

# Plan 86.1: Service Layer Dynamic Deposit Types Fetcher and Query Alignment

## Objective
Membangun fungsi pemuatan data master jenis simpanan dinamis dari Supabase (`getWithdrawableDepositTypes`) di `src/services/withdrawalReportService.ts`, menyelaraskan parameter filter `depositTypeCode` di kueri mutasi buku besar (`getWithdrawalDetailedLedger`) agar mendukung kode simpanan dinamis dan opsi khusus terminasi keanggotaan (`TERMINATION`), serta membersihkan pengecekan statis hardcoded lama.

## Context
Load these files for context:
- src/services/withdrawalReportService.ts
- src/services/withdrawalReportService.test.ts

## Tasks

<task type="auto">
  <name>Build getWithdrawableDepositTypes and Align Filter Query</name>
  <files>src/services/withdrawalReportService.ts, src/services/withdrawalReportService.test.ts</files>
  <action>
    - Buka `src/services/withdrawalReportService.ts`:
      1. Definisikan tipe dan fungsi pemanggilan master `deposit_types`:
         ```typescript
         export interface DepositTypeOption {
           id: string;
           code: string;
           name: string;
           can_be_withdrawn?: boolean;
         }

         export async function getWithdrawableDepositTypes(): Promise<DepositTypeOption[]> {
           const { data, error } = await supabase
             .from('deposit_types')
             .select('id, code, name, can_be_withdrawn')
             .order('name', { ascending: true });

           if (error) {
             console.error('Error fetching deposit types for filter:', error);
             return [];
           }
           return data || [];
         }
         ```
      2. Perbarui kueri `getWithdrawalDetailedLedger`:
         - Sesuaikan filter `transaction_type` pada query Supabase:
           * Jika `filters?.depositTypeCode === 'TERMINATION'`: filter kueri ke `transaction_type = 'termination'`.
           * Jika `filters?.depositTypeCode` berisi kode jenis simpanan reguler: filter ke `transaction_type = 'withdrawal'`.
           * Jika filter `depositTypeCode` kosong, `'all'`, atau tidak ditentukan: izinkan kedua jenis mutasi penarikan dengan `.in('transaction_type', ['withdrawal', 'termination'])` (atau tangani fallback jika error).
         - Perbarui pemfilteran in-memory lanjutan untuk `depositTypeCode`:
           * Jika kosong atau `'all'`, jangan filter relasi jenis simpanan.
           * Jika `target === 'termination'`, filter transaksi yang `deposit_type_code === 'TERMINATION'` atau catatan/deskripsinya memuat terminasi/kliring.
           * Jika memilih kode simpanan dinamis (misal `LEBARAN`, `BELANJA`, `POKOK`, `WAJIB`, dll.): cocokkan dengan `deposit_type_code` (case-insensitive) atau pencocokan nama jenis simpanan resmi dari master.
         - Bersihkan fallback kaku `'sukarela'` dan fallback hardcoded yang usang.
      3. Perbarui unit test di `src/services/withdrawalReportService.test.ts`:
         - Tambahkan test untuk `getWithdrawableDepositTypes()` (sukses dan penanganan error).
         - Tambahkan test untuk penyaringan dengan kode dinamis (misal `'BELANJA'`, `'LEBARAN'`) dan opsi `'TERMINATION'`.
  </action>
  <verify>
    Jalankan test: `npx vitest run src/services/withdrawalReportService.test.ts` dan pastikan seluruh test lulus 100%.
  </verify>
</task>

