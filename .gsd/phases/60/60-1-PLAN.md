---
phase: 60
plan: 1
wave: 1
gap_closure: false
---

# Plan 60.1: Align Monthly Cell Data Contract in loanMatrixService.ts

## Objective
Memperkaya tipe data dan struktur kembalian sel bulanan pinjaman pada `src/services/loanMatrixService.ts` agar menyertakan `year`, `dueDate`, dan type alias `MonthLoanCell` yang kompatibel dengan status angsuran pinjaman (lunas, parsial, menunggak, proyeksi, di luar periode), serta memvalidasi kesesuaian unit testing pada layer service.

## Context
Load these files for context:
- .gsd/SPEC.md
- src/services/loanMatrixService.ts
- src/services/loanMatrixService.test.ts

## Tasks

<task type="auto">
  <name>Enrich LoanMatrixMonth and Export MonthLoanCell Interface</name>
  <files>
    src/services/loanMatrixService.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.ts`.
    2. Perluas antarmuka `LoanMatrixMonth` untuk mendukung properti opsional/wajib tambahan:
       - `year?: number;`
       - `dueDate?: string;`
       - Perluas tipe `status` agar kompatibel dengan uppercase dan lowercase jika diperlukan:
         `'PAID' | 'PARTIAL' | 'UNPAID' | 'PROJECTED' | 'FINISHED' | 'NONE' | 'paid' | 'partial' | 'unpaid' | 'projection' | 'not_applicable'`
    3. Ekspor alias type `MonthLoanCell`:
       ```typescript
       export type MonthLoanCell = LoanMatrixMonth;
       ```
    4. Pada fungsi `getLoanMatrix`, saat mengisi `membersMap[member.id].months[month]`, sertakan:
       - `year: scheduleYear`
       - `dueDate: sched.due_date`
    5. Pastikan inisialisasi default 12 bulan (Jan - Des) tetap mencakup properti default yang konsisten:
       - `month: i`
       - `year: year`
       - `status: 'NONE'`
       - `targetAmount: 0`
       - `paidAmount: 0`
    
    AVOID: Mengubah nama field yang sudah digunakan komponen lain seperti `targetAmount`, `paidAmount`, dan `status`.
    USE: Backward-compatible extension sehingga tidak mematahkan kode pemanggil yang ada.
  </action>
  <verify>
    npx tsc --noEmit
  </verify>
  <done>
    Tipe data MonthLoanCell dan LoanMatrixMonth tervalidasi lengkap dengan field month, year, dueDate, targetAmount, paidAmount, dan status.
  </done>
</task>

<task type="auto">
  <name>Add Unit Tests for MonthLoanCell Data Contract in loanMatrixService.test.ts</name>
  <files>
    src/services/loanMatrixService.test.ts
  </files>
  <action>
    1. Buka `src/services/loanMatrixService.test.ts`.
    2. Tambahkan test suite baru untuk menguji `MonthLoanCell` contract dan struktur data:
       - Verifikasi bahwa objek sel bulan memiliki properti `targetAmount`, `paidAmount`, `status`, dan `month`.
       - Pastikan fungsi resolver tahun dan kalkulasi service tetap lulus 100%.
    3. Jalankan pengujian vitest.
  </action>
  <verify>
    npx vitest run src/services/loanMatrixService.test.ts
  </verify>
  <done>
    Semua pengujian unit test di loanMatrixService.test.ts lulus tanpa error.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Interface `MonthLoanCell` dan `LoanMatrixMonth` diekspor dari `loanMatrixService.ts`.
- [ ] Data sel bulan pada `getLoanMatrix` menyertakan `year` dan `dueDate`.
- [ ] Pengujian di `loanMatrixService.test.ts` berjalan dan lulus.

## Success Criteria
- [ ] Semua task lolos verifikasi.
- [ ] Tidak ada regresi tipe TypeScript.

