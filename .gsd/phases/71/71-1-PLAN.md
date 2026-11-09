---
phase: 71
plan: 1
wave: 1
gap_closure: false
---

# Plan 71.1: Support 'POKOK' in savingsRateService.ts & PengaturanKoperasi.tsx

## Objective
Menambahkan dukungan jenis simpanan "Simpanan Pokok" (`POKOK`) ke dalam service konfigurasi tarif simpanan bertingkat (`savingsRateService.ts`) serta memperbarui form modal dan tabel daftar tarif bertingkat di halaman Pengaturan Koperasi (`src/pages/admin/PengaturanKoperasi.tsx`).

## Context
Load these files for context:
- `src/services/savingsRateService.ts`
- `src/pages/admin/PengaturanKoperasi.tsx`
- `src/pages/admin/PengaturanKoperasi.test.tsx`

## Tasks

<task type="auto">
  <name>Expand SavingsRateTier Code Type, Seedings, and Service Helpers</name>
  <files>
    src/services/savingsRateService.ts
  </files>
  <action>
    1. Buka `src/services/savingsRateService.ts`:
       - Perbarui interface dan definisi tipe jenis simpanan:
         ```typescript
         export type DepositTypeCode = 'POKOK' | 'WAJIB' | 'BELANJA' | 'LEBARAN';
         ```
       - Tambahkan pemetaan label jenis simpanan:
         ```typescript
         export const DEPOSIT_TYPE_LABELS: Record<string, string> = {
           POKOK: 'Simpanan Pokok',
           WAJIB: 'Simpanan Wajib',
           BELANJA: 'Simpanan Belanja',
           LEBARAN: 'Simpanan Hari Raya (Lebaran)',
         };
         ```
       - Tambahkan entri awal seed untuk Simpanan Pokok ke dalam `DEFAULT_RATE_TIERS`:
         ```typescript
         {
           id: 'seed-pokok-tier-1',
           deposit_type_code: 'POKOK',
           start_year: 2024,
           start_month: 1,
           end_year: null,
           end_month: null,
           monthly_rate: 100000,
           notes: 'Tarif Simpanan Pokok Standar (Rp 100.000)',
           created_at: '2024-01-01T00:00:00.000Z',
           updated_at: '2024-01-01T00:00:00.000Z'
         }
         ```
       - Pada fungsi `getApplicableRate`:
         * Tambahkan fallback hardcoded jika data tier kosong:
           ```typescript
           if (code === 'POKOK' || code === 'SP') {
             return 100000;
           }
           ```
       - Pada fungsi `getActiveSavingsRateTiers`:
         * Sertakan kode `'POKOK'` dalam kumpulan `codes`:
           `const codes = new Set<string>(['POKOK', 'WAJIB', 'BELANJA', 'LEBARAN']);`
         * Tambahkan mapping alias kode database `'SP'` -> `'POKOK'`:
           ```typescript
           if (result['POKOK'] !== undefined && result['SP'] === undefined) {
             result['SP'] = result['POKOK'];
           }
           ```
  </action>
  <verify>
    Jalankan typecheck:
    npx tsc --noEmit
  </verify>
  <done>
    `savingsRateService.ts` mendukung 'POKOK' pada tipe data, seeding awal, evaluasi periode tarif, dan resolusi rate aktif dengan alias 'SP'.
  </done>
</task>

<task type="auto">
  <name>Update Modal Form, Table Display & Unit Tests in PengaturanKoperasi</name>
  <files>
    src/pages/admin/PengaturanKoperasi.tsx
    src/pages/admin/PengaturanKoperasi.test.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/PengaturanKoperasi.tsx`:
       - Pada fungsi `getDepositTypeBadge`:
         Tambahkan kasus untuk `'POKOK'`:
         ```typescript
         case 'POKOK':
           return {
             label: 'Simpanan Pokok',
             className: 'bg-blue-50 text-blue-700 border-blue-200'
           };
         ```
       - Pada modal "Tambah Kenaikan Tarif Simpanan":
         * Tambahkan opsi `<option value="POKOK">Simpanan Pokok</option>` pada dropdown Jenis Simpanan:
           ```tsx
           <option value="POKOK">Simpanan Pokok</option>
           <option value="WAJIB">Simpanan Wajib</option>
           <option value="BELANJA">Simpanan Belanja</option>
           <option value="LEBARAN">Simpanan Hari Raya (Lebaran)</option>
           ```
         * Buat label dan placeholder nominal dinamis:
           Jika `newTierForm.deposit_type_code === 'POKOK'`:
           Label: **"Nominal Simpanan Pokok Baru (Rp) *"**, placeholder: `"Contoh: 100000"`.
           Jika bukan:
           Label: **"Nominal Iuran Bulanan Baru (Rp) *"**, placeholder: `"Contoh: 200000"`.
       - Pada tabel riwayat tarif:
         * Pada kolom "Nominal Bulanan" (`tier.monthly_rate`), jika `tier.deposit_type_code === 'POKOK'`, tampilkan teks keterangan kecil di bawah nominal:
           `<span className="text-[10px] text-slate-400 font-normal block">(Sekali Bayar / Awal)</span>`.
    2. Buka `src/pages/admin/PengaturanKoperasi.test.tsx`:
       - Perbarui `mockTiers` untuk menguji tier Simpanan Pokok.
       - Tambahkan unit test untuk memastikan badge 'POKOK' ter-render dengan benar.
       - Pastikan dropdown modal memuat opsi Simpanan Pokok.
  </action>
  <verify>
    Jalankan pengujian unit PengaturanKoperasi:
    npx vitest run src/pages/admin/PengaturanKoperasi.test.tsx
  </verify>
  <done>
    Modal penambahan tarif dan tabel riwayat di `/admin/pengaturan` secara penuh mendukung Simpanan Pokok lengkap dengan badge visual dan unit test yang lolos.
  </done>
</task>

## Must-Haves
After all tasks complete, verify:
- [ ] Opsi "Simpanan Pokok" tersedia di modal Tambah Kenaikan Tarif Simpanan.
- [ ] Label input nominal berganti dinamis sesuai jenis simpanan yang dipilih.
- [ ] Badge "Simpanan Pokok" dan catatan "(Sekali Bayar / Awal)" muncul di tabel tarif.
- [ ] Unit tests PengaturanKoperasi lulus tanpa error.

## Success Criteria
- [ ] Pengurus dapat menambahkan tarif baru untuk Simpanan Pokok di `/admin/pengaturan`.
- [ ] `savingsRateService` mengelola tarif 'POKOK' dengan proteksi anti-overlap yang sama dengan jenis simpanan lainnya.
