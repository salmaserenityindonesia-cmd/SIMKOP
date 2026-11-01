## Current Position
- **Phase**: 47 (Implementasi Filter Tahun Dinamis Berdasarkan Tunggakan Simpanan & Saldo Simpanan Lebaran Menggantung)
- **Task**: Planning complete
- **Status**: Ready for execution

## Last Session Summary
Phase 47 planning complete:
- Plan 47.1: Wave 1 - Dynamic Year Range Resolver Service & Unit Testing (`src/services/complianceService.ts`, `src/services/complianceService.test.ts`)
- Plan 47.2: Wave 2 - Bind Dynamic Year Selector in ComplianceMatrix.tsx (`src/pages/admin/ComplianceMatrix.tsx`)
- Plan 47.3: Wave 3 - End-to-End Component Testing, Full Test Suite, Static Verification & Build Check (`src/pages/admin/ComplianceMatrix.test.tsx`)

## Next Steps
1. `/execute 47`

## Blockers
- None.

## Context Dump

### Decisions Made
- **Kondisi Dinamis Tahun Kepatuhan Simpanan**:
  1. Simpanan Pokok belum terpenuhi penuh oleh anggota aktif (dihitung sejak tahun registrasi anggota di tabel `anggota`).
  2. Simpanan Lebaran yang masih memiliki saldo sisa (`totalDeposit - totalWithdrawal > 0`) di mana tahun setoran dimasukkan sebagai kandidat tahun.
  3. Bulan simpanan wajib yang belum terbayar (menunggak) oleh anggota aktif sejak bulan pendaftaran hingga bulan berjalan.
- **Graceful Fallback**: Mengembalikan `[currentYear]` (contoh: `[2026]`) jika seluruh kewajiban masa lampau telah terpenuhi atau terjadi gangguan query/koneksi database.
- **Penyelarasan Kolom Database**: Tabel `anggota` menggunakan `created_at` untuk waktu pendaftaran (bukan `joined_at`). Tipe simpanan dicocokkan berdasarkan `code` ('SP'/'POKOK', 'SW'/'WAJIB', 'SL'/'LEBARAN') dan fallback nama untuk kompatibilitas lintas environment dan pengujian.
