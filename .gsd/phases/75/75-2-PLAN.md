---
phase: 75
plan: 2
wave: 2
gap_closure: false
---

# Plan 75.2: Standardize Frontend Receipt Generator Utility

## Objective
Membangun modul utilitas penomoran kwitansi standar dan terpusat di `src/utils/receiptGenerator.ts` dengan format terstruktur `KW-PINJ/{loanNumber}/B{periodNumber}/{YYYYMMDD}-{RAND3}`. Utilitas ini membersihkan karakter non-alfanumerik/tanda minus dari nomor pinjaman, memformat tanggal saat ini dalam 8 digit (`YYYYMMDD`), serta menyematkan akhiran 3 karakter alfanumerik acak (*entropy token*) guna menjamin keunikan nomor kwitansi bahkan saat terjadi pelunasan beberapa kali pada hari/periode yang sama. Dilengkapi dengan unit test komprehensif di `src/utils/receiptGenerator.test.ts`.

## Context
Load these files for context:
- `src/utils/receiptPdfGenerator.ts`
- `src/utils/formatCurrency.ts`

## Tasks

<task type="auto">
  <name>Implement generateLoanReceiptNumber Utility Function</name>
  <files>
    src/utils/receiptGenerator.ts
  </files>
  <action>
    1. Buat file baru `src/utils/receiptGenerator.ts`:
       - Buat fungsi `generateLoanReceiptNumber`:
         ```typescript
         /**
          * Menghasilkan nomor kwitansi pembayaran cicilan yang terstruktur dan unik anti-bentrok.
          * Format: KW-PINJ/{loanNumber}/B{periodNumber}/{YYYYMMDD}-{RAND3}
          * Contoh: KW-PINJ/PINJ-MIGRASI-98119961/B42/20261110-A9Z
          *
          * @param loanNumber - Nomor identifikasi pinjaman (contoh: PINJ-MIGRASI-001)
          * @param periodNumber - Angka periode/tenor angsuran (contoh: 1, 42)
          * @param customDate - Opsional tanggal spesifik (default: new Date())
          * @returns String nomor kwitansi standar
          */
         export function generateLoanReceiptNumber(
           loanNumber: string | null | undefined,
           periodNumber: number | string,
           customDate?: Date
         ): string {
           const cleanNumber = String(loanNumber || 'PINJ')
             .trim()
             .replace(/[^a-zA-Z0-9-]/g, '') || 'PINJ';

           const safePeriod = Math.max(1, Math.round(Number(periodNumber) || 1));

           const targetDate = customDate instanceof Date && !isNaN(customDate.getTime())
             ? customDate
             : new Date();

           const yyyy = targetDate.getFullYear();
           const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
           const dd = String(targetDate.getDate()).padStart(2, '0');
           const dateStr = `${yyyy}${mm}${dd}`;

           // 3 karakter acak alphanumeric (uppercase) untuk mencegah tabrakan/collision
           const randSuffix = Math.random().toString(36).substring(2, 5).toUpperCase().padEnd(3, 'X');

           return `KW-PINJ/${cleanNumber}/B${safePeriod}/${dateStr}-${randSuffix}`;
         }
         ```
  </action>
  <verify>
    Fungsi diekspor dengan benar tanpa kesalahan sintaks TypeScript.
  </verify>
  <done>
    `src/utils/receiptGenerator.ts` mengimplementasikan fungsi `generateLoanReceiptNumber` sesuai spesifikasi format anti-bentrok.
  </done>
</task>

<task type="auto">
  <name>Create Unit Tests for generateLoanReceiptNumber</name>
  <files>
    src/utils/receiptGenerator.test.ts
  </files>
  <action>
    1. Buat file `src/utils/receiptGenerator.test.ts`:
       - Uji format dasar: `KW-PINJ/PINJ-MIGRASI-98119961/B42/YYYYMMDD-XXX`.
       - Uji sanitasi input: karakter simbolik aneh pada nomor pinjaman dibersihkan, nomor kosong fallback ke `PINJ`.
       - Uji penanganan period: period angka desimal/string dikonversi ke integer aman.
       - Uji keunikan (anti-collision): panggil fungsi 100 kali berturut-turut pada periode yang sama dan buktikan seluruh token yang dihasilkan unik (Set size === 100).
       - Uji tanggal kustom: berikan tanggal tetap (misal: 2026-11-10) dan verifikasi bagian tanggal bernilai `20261110`.
  </action>
  <verify>
    npx vitest run src/utils/receiptGenerator.test.ts
  </verify>
  <done>
    Semua pengujian unit di `src/utils/receiptGenerator.test.ts` lulus 100%.
  </done>
</task>

## Success Criteria
- [ ] Modul `src/utils/receiptGenerator.ts` terdefinisi dan bersih dari TypeScript errors.
- [ ] Pengujian unit di `src/utils/receiptGenerator.test.ts` membuktikan format deterministik dan keunikan anti-bentrok.
