---
phase: 86
plan: 2
wave: 2
gap_closure: false
---

# Plan 86.2: Bind Dynamic Combo Box in Laporan Penarikan Page

## Objective
Menggantikan elemen dropdown filter jenis simpanan statis (hardcoded) pada halaman Laporan Pengawasan & Pencairan Simpanan (`src/pages/admin/LaporanPenarikanSimpanan.tsx`) dengan opsi dinamis yang bersumber dari `getWithdrawableDepositTypes()` di database Supabase, menghapus opsi usang "Simpanan Sukarela", serta menambahkan opsi khusus "Pokok & Wajib (Kliring Keanggotaan)" ber-value `TERMINATION`.

## Context
Load these files for context:
- src/services/withdrawalReportService.ts
- src/pages/admin/LaporanPenarikanSimpanan.tsx
- src/pages/admin/LaporanPenarikanSimpanan.test.tsx

## Tasks

<task type="auto">
  <name>Replace Hardcoded Select with Dynamic Supabase Data</name>
  <files>src/pages/admin/LaporanPenarikanSimpanan.tsx, src/pages/admin/LaporanPenarikanSimpanan.test.tsx</files>
  <action>
    - Buka `src/pages/admin/LaporanPenarikanSimpanan.tsx`:
      1. Import `getWithdrawableDepositTypes` dan `DepositTypeOption` dari `../../services/withdrawalReportService`.
      2. Tambahkan state untuk menampung opsi jenis simpanan dinamis dan status loading jenis simpanan:
         ```typescript
         const [depositTypeOptions, setDepositTypeOptions] = useState<DepositTypeOption[]>([]);
         const [isLoadingTypes, setIsLoadingTypes] = useState<boolean>(true);
         ```
      3. Ambil data master jenis simpanan saat komponen di-mount:
         ```typescript
         useEffect(() => {
           let isMounted = true;
           getWithdrawableDepositTypes().then((types) => {
             if (isMounted) {
               setDepositTypeOptions(types);
               setIsLoadingTypes(false);
             }
           });
           return () => { isMounted = false; };
         }, []);
         ```
      4. Render elemen `<select>` filter jenis simpanan secara dinamis:
         - Sediakan opsi default: `<option value="all">Semua Jenis Simpanan</option>`
         - Map `depositTypeOptions`: `<option key={t.id} value={t.code}>{t.name}</option>`
         - Tambahkan opsi khusus terminasi: `<option value="TERMINATION">Pokok & Wajib (Kliring Keanggotaan)</option>`
         - Pastikan opsi hardcoded `<option value="sukarela_lainnya">Simpanan Sukarela</option>` dihapus total.
         - Perbarui penanganan label pada export Excel / export info agar membaca nama dinamis dari `depositTypeOptions` jika tersedia.
      5. Perbarui unit test di `src/pages/admin/LaporanPenarikanSimpanan.test.tsx`:
         - Pastikan mock `getWithdrawableDepositTypes` disediakan di test suite.
         - Verifikasi bahwa dropdown jenis simpanan merender opsi dinamis (misal Simpanan Belanja Bulanan, Simpanan Hari Raya) dan opsi kliring terminasi, tanpa adanya opsi "Simpanan Sukarela".
  </action>
  <verify>
    Jalankan test: `npx vitest run src/pages/admin/LaporanPenarikanSimpanan.test.tsx` dan pastikan seluruh test lulus 100%.
  </verify>
</task>

