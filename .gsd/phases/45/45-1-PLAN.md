---
phase: 45
plan: 1
wave: 1
depends_on: []
gap_closure: false
---

# Plan 45.1: Comprehensive Member Report Data Fetcher

## Objective
Membangun service layer `src/services/memberService.ts` dengan fungsi `getMembersComprehensiveReport()` yang mengekstraksi dan mengagregasi data seluruh anggota SIMKOP secara komprehensif: data identitas anggota, saldo riil 4 jenis simpanan (Pokok, Wajib, Belanja, Lebaran) dari transaksi simpanan, serta status dan sisa hutang pinjaman aktif dari modul pinjaman, menghasilkan struktur data 14 kolom baku `MemberComprehensiveExportRow`.

## Context
- `src/services/koperasiService.ts`
- `src/services/settlementService.ts`
- `src/services/loanService.ts`
- `src/services/memberExcelService.ts`

## Tasks

<task type="auto">
  <name>Build getMembersComprehensiveReport in memberService</name>
  <files>
    src/services/memberService.ts
  </files>
  <action>
    1. Buat berkas `src/services/memberService.ts`.
    2. Definisikan interface `MemberComprehensiveExportRow`:
       ```typescript
       export interface MemberComprehensiveExportRow {
         nrp: string;
         nama: string;
         pangkat: string;
         bank_account_number: string;
         membership_status: string;
         tgl_awal_anggota: string;
         jumlah_simpanan_pokok: number;
         jumlah_simpanan_wajib: number;
         jumlah_simpanan_belanja: number;
         jumlah_simpanan_lebaran: number;
         jumlah_pinjaman: number;
         tgl_awal_pinjaman: string;
         tenor: number;
         sisa_pinjaman: number;
       }
       ```
    3. Implementasikan fungsi `getMembersComprehensiveReport(memberIds?: string[])`:
       - **Query 1: Anggota**:
         Ambil anggota dari `public.anggota` (jika `memberIds` disediakan, filter `.in('id', memberIds)`):
         `id, nrp, nama, pangkat, bank_account_number, membership_status, created_at, status`. Urutkan berdasarkan `nama ASC` atau `nrp ASC`.
       - **Query 2: Simpanan**:
         Ambil relasi `member_deposits` dan `deposit_transactions`:
         ```typescript
         const { data: depositsData } = await supabase
           .from('member_deposits')
           .select(`
             member_id,
             deposit_types ( name ),
             deposit_transactions ( amount, transaction_type )
           `);
         ```
         Kelompokkan per `member_id` dan hitung saldo bersih (deposit (+) dikurangi withdrawal (-)) untuk masing-masing kategori:
         * Pokok: `typeName.includes('pokok')`
         * Wajib: `typeName.includes('wajib')`
         * Belanja: `typeName.includes('belanja')`
         * Lebaran: `typeName.includes('lebaran') || typeName.includes('hari raya')`
       - **Query 3: Pinjaman Aktif**:
         Ambil pinjaman aktif dari `public.loans`:
         ```typescript
         const { data: loansData } = await supabase
           .from('loans')
           .select(`
             id, member_id, amount, principal_amount, tenor, agreed_tenor_months, disbursed_at, created_at, status,
             loan_schedules ( id, target_amount, paid_amount, status ),
             loan_repayments ( amount_paid )
           `)
           .in('status', ['active', 'approved']);
         ```
         Untuk setiap anggota yang memiliki pinjaman aktif:
         * `jumlah_pinjaman`: ambil `principal_amount` atau `amount`.
         * `tenor`: ambil `agreed_tenor_months` atau `tenor`.
         * `tgl_awal_pinjaman`: format YYYY-MM-DD dari `disbursed_at` atau `created_at`.
         * `sisa_pinjaman`: hitung selisih belum terbayar dari `loan_schedules` (`target_amount - paid_amount` untuk status unpaid/partial) atau dari `amount - sum(loan_repayments.amount_paid)`.
       - Petakan dan kembalikan array `MemberComprehensiveExportRow[]`.
  </action>
  <verify>
    Fungsi `getMembersComprehensiveReport()` mengembalikan daftar data dengan 14 field lengkap, nilai nominal valid (non-negatif), dan format tanggal terstandarisasi.
  </verify>
  <done>
    Service penarikan data komprehensif anggota 14 kolom selesai dibangun dan siap dikonsumsi exporter.
  </done>
</task>

## Success Criteria
- [ ] Interface `MemberComprehensiveExportRow` mengekspos tepat 14 atribut yang kompatibel dengan template migrasi
- [ ] Saldo simpanan terakumulasi akurat per 4 tipe simpanan
- [ ] Data pinjaman aktif dan sisa hutang teragregasi secara tepat
- [ ] Penanganan fallback yang aman ketika anggota belum memiliki simpanan atau pinjaman
