# Phase 86 Plan 1 Summary: Service Layer Dynamic Deposit Types Fetcher and Query Alignment

## Objective
Membangun fungsi pemuatan data master jenis simpanan dinamis dari Supabase (`getWithdrawableDepositTypes`) di `src/services/withdrawalReportService.ts`, menyelaraskan parameter filter `depositTypeCode` di kueri mutasi buku besar (`getWithdrawalDetailedLedger`) agar mendukung kode simpanan dinamis dan opsi khusus terminasi keanggotaan (`TERMINATION`), serta membersihkan pengecekan statis hardcoded lama.

## Key Changes
1. **Dynamic Deposit Types Fetcher (`src/services/withdrawalReportService.ts`)**:
   - Menambahkan tipe `DepositTypeOption` (`id`, `code`, `name`, `can_be_withdrawn`).
   - Mengimplementasikan `getWithdrawableDepositTypes()` untuk mengambil master jenis simpanan dari tabel `deposit_types` diurutkan alfabetis berdasarkan `name` secara ascending.

2. **Query Alignment for Transaction Types**:
   - Menyesuaikan penanganan filter Supabase `depositTypeCode`:
     - Jika bernilai `'TERMINATION'`, kueri database menargetkan `transaction_type = 'termination'`.
     - Jika bernilai kode simpanan dinamis reguler, kueri database menargetkan `transaction_type = 'withdrawal'`.
     - Jika kosong atau `'all'`, kueri database menyertakan kedua mutasi melalui `.in('transaction_type', ['withdrawal', 'termination'])`.
     - Logika yang sama diterapkan secara identik pada fallback kueri mandiri `deposit_transactions`.

3. **In-Memory Dynamic Filtering & Fallback Cleanup**:
   - Pemfilteran in-memory untuk `depositTypeCode` kini mendukung:
     - `'termination'`: mencocokkan `deposit_type_code === 'TERMINATION'`, `transaction_type === 'termination'`, atau catatan/deskripsi transaksi yang memuat kliring/terminasi/pengunduran.
     - Kode dinamis (misal: `BELANJA`, `LEBARAN`, `POKOK`, `WAJIB`, custom code): mencocokkan kode jenis simpanan (case-insensitive), nama simpanan, atau UUID `deposit_type_id`.
   - Mengeliminasi fallback kaku hardcoded `'SUKARELA'` pada pemetaan transaksi tanpa relasi master yang usang, menggantikannya dengan penandaan akurat (`LAINNYA` / `Simpanan Lainnya`).

4. **Unit Test Coverage (`src/services/withdrawalReportService.test.ts`)**:
   - Menambahkan test suite untuk `getWithdrawableDepositTypes()` (pengambilan sukses dan penanganan kegagalan koneksi).
   - Menambahkan test kueri dan pemfilteran mutasi kliring keanggotaan (`TERMINATION`).
   - Menambahkan test pemfilteran kode simpanan dinamis (`PENDIDIKAN`, `dt-pendidikan`, `LEBARAN`, `BELANJA`).
   - Seluruh 22 pengujian lulus 100%.

## Verification Results
- **Vitest Unit Test Suite**:
  ```bash
  npx vitest run src/services/withdrawalReportService.test.ts
  # ✓ src/services/withdrawalReportService.test.ts (22 tests) - 100% passed
  ```
- **TypeScript Static Verification**:
  ```bash
  npx tsc --noEmit
  # 0 errors, clean check
  ```

## Commits
- `b05f63f1`: feat(phase-86): build getWithdrawableDepositTypes and align filter query
