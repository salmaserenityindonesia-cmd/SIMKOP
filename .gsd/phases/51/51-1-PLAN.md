---
phase: 51
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 51.1: Bulk Auto-Reconcile Engine in savingsMatrixService.ts & Unit Tests

## Objective
Mengimplementasikan modul backend service `src/services/savingsMatrixService.ts` yang menangani rekonsiliasi saldo buku besar simpanan (Wajib, Belanja, Lebaran) untuk seluruh anggota aktif secara massal (batch processing 25-50 anggota per batch) menggunakan algoritma FIFO dan tarif berjenjang dinamis (`savings_rate_tiers`), disertai pelaporan progress via callback interaktif serta unit test komprehensif.

## Context
- `src/services/savingsMatrixService.ts`
- `src/services/savingsMatrixService.test.ts`
- `src/components/compliance/SavingsLedgerMatrixModal.tsx`
- `src/services/savingsRateService.ts`
- `src/lib/supabaseClient.ts`

## Tasks

<task type="auto">
  <name>Implement bulkAutoReconcileAllMembers Service</name>
  <files>
    src/services/savingsMatrixService.ts
  </files>
  <action>
    1. Buat berkas `src/services/savingsMatrixService.ts`.
    2. Definisikan interface:
       ```ts
       export interface BulkReconcileProgress {
         processed: number;
         total: number;
         currentMemberName?: string;
       }

       export interface BulkReconcileResult {
         success: boolean;
         totalMembers: number;
         totalSuccess: number;
         totalFailed: number;
         errors?: Array<{ memberId: string; memberName: string; error: string }>;
       }

       export interface BulkReconcileOptions {
         batchSize?: number;
         startYear?: number;
         endYear?: number;
       }
       ```
    3. Implementasikan fungsi `bulkAutoReconcileAllMembers(depositTypeCode: string, onProgress?: (progress: BulkReconcileProgress) => void, options?: BulkReconcileOptions): Promise<BulkReconcileResult>`:
       - Dukung `depositTypeCode`: `'WAJIB'`, `'BELANJA'`, `'LEBARAN'`, atau `'ALL'` (proses seluruh jenis simpanan).
       - Ambil seluruh data `deposit_types` untuk mapping tipe simpanan yang dipilih.
       - Ambil seluruh anggota aktif dari `public.anggota`: `id, nrp, nama, created_at, tgl_awal_anggota, status, membership_status`.
         Filter: `status !== 'nonaktif' && membership_status !== 'RESIGNED'`.
       - Ambil data tarif berjenjang menggunakan `getRateTiers()`.
       - Bagi anggota aktif ke dalam batch (default 50 anggota per batch).
       - Untuk setiap batch:
         * Ambil rekening simpanan `member_deposits` beserta relasi transaksi `deposit_transactions` untuk seluruh anggota dalam batch menggunakan `.in('member_id', batchIds)`.
         * Untuk setiap anggota dalam batch:
           - Tentukan saldo awal/impor dari mutasi migrasi riil (`description` mengandung 'migra', 'saldo awal', 'historical', 'one-time') atau saldo akumulasi neto.
           - Jika saldo <= 0, lanjutkan ke anggota berikutnya.
           - Tentukan tanggal pendaftaran efektif anggota (`tgl_awal_anggota || created_at`).
           - Generate grid bulan dari tahun pendaftaran hingga tahun berjalan menggunakan `generateMonthGrid`.
           - Hitung bulan yang berhak lunas menggunakan `matchAutomaticFifo(targetBalance, months, typeCode, rateTiers, joinDate)`.
           - Hapus transaksi matriks rutin lama (`transaction_type = 'deposit'`, rentang tahun grid, dan `description` mengandung 'Setoran Matriks' atau 'rekonsiliasi otomatis', hindari menghapus saldo migrasi 'Migrasi Saldo Awal (As-Is)').
           - Siapkan dan simpan transaksi batch baru `deposit_transactions` untuk setiap bulan yang tercover.
         * Panggil callback `onProgress({ processed: currentCount, total: totalMembers, currentMemberName: lastMember.nama })`.
       - Kembalikan `BulkReconcileResult`.
    4. Sediakan penanganan error yang anggun (graceful handling) agar jika satu anggota gagal, batch anggota lainnya tetap berjalan.
  </action>
  <verify>
    Pastikan `savingsMatrixService.ts` mengekspor fungsi `bulkAutoReconcileAllMembers` dengan tipe TypeScript yang valid tanpa syntax error.
  </verify>
  <done>
    Service engine rekonsiliasi simpanan massal siap digunakan dan mendukung batching serta pelaporan progress.
  </done>
</task>

<task type="auto">
  <name>Create Comprehensive Unit Test Suite for savingsMatrixService</name>
  <files>
    src/services/savingsMatrixService.test.ts
  </files>
  <action>
    1. Buat berkas `src/services/savingsMatrixService.test.ts` menggunakan Vitest.
    2. Mock dependensi Supabase (`from`, `select`, `delete`, `insert`, `eq`, `in`, dll.) dan `savingsRateService`.
    3. Tulis pengujian untuk:
       - Rekonsiliasi anggota aktif dengan saldo migrasi sesuai tarif berjenjang (Simpanan Wajib).
       - Pemanggilan callback `onProgress` secara bertahap per batch.
       - Penanganan anggota dengan saldo 0 (tidak membuat mutasi baru).
       - Mode `depositTypeCode: 'ALL'` yang mengeksekusi Wajib, Belanja, dan Lebaran.
       - Penanganan error pada salah satu query Supabase tanpa menghentikan total eksekusi.
    4. Jalankan pengujian menggunakan `npx vitest run src/services/savingsMatrixService.test.ts`.
  </action>
  <verify>
    Jalankan perintah `npx vitest run src/services/savingsMatrixService.test.ts` dan pastikan seluruh test suite lolos 100%.
  </verify>
  <done>
    Unit tests untuk batch auto-reconcile engine berhasil dibuat dan teruji hijau 100%.
  </done>
</task>

## Success Criteria
- [ ] Modul `src/services/savingsMatrixService.ts` mengimplementasikan batch multi-member auto-reconcile dengan pagination batching (50 anggota/batch).
- [ ] Mutasi saldo awal migrasi terlindungi dan tidak terhapus selama proses rekonsiliasi.
- [ ] Callback `onProgress` dipanggil dengan data progres yang akurat.
- [ ] Pengujian unit di `src/services/savingsMatrixService.test.ts` lolos 100%.
