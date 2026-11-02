# Phase 52 Research: Refactor Tampilan Sel Matriks Kepatuhan Simpanan Menjadi 3 Sub-Baris (Wajib, Belanja, Lebaran)

## Executive Summary
Pada halaman Matriks Tracking Pembayaran Simpanan Tahunan (`src/pages/admin/ComplianceMatrix.tsx`), indikator status bulanan saat ini hanya berupa 1 ikon centang hijau (`CheckCircle2`) atau badge angka tunggakan merah yang menyembunyikan rincian di dalam tooltip hover. Kondisi ini menyulitkan admin/pengurus koperasi saat melakukan monitoring cepat, karena tidak dapat membedakan secara instan simpanan mana yang menunggak (apakah Wajib, Belanja, atau Lebaran) tanpa harus mengarahkan kursor satu per satu ke setiap sel.

Phase 52 merefaktor struktur data dan antarmuka sel bulanan matriks (Jan - Des) menjadi tampilan matriks ringkas 3 sub-baris per sel:
1. **Wajib**: nominal setoran atau target iuran dengan indikator warna emerald/hijau (lunas) atau merah/rose (tunggakan).
2. **Belanja**: nominal setoran atau target iuran dengan indikator warna teal (lunas) atau merah/rose (tunggakan).
3. **Lebaran**: nominal setoran atau target iuran dengan indikator warna emerald/hijau (lunas) atau merah/rose (tunggakan).
4. **Not Applicable / Sebelum Bergabung / Future**: strip abu-abu (`-`).

## Technical Architecture & State Analysis

### 1. Data Contract in `complianceService.ts`
Struktur data bulanan saat ini:
```typescript
export interface ComplianceMonthData {
  w: number;
  b: number;
  l: number;
  bal_w: number;
  bal_b: number;
  bal_l: number;
}
```

Untuk mendukung kebutuhan tampilan granular 3 baris tanpa merusak backward-compatibility dengan kode dan pengujian yang ada, kontrak data diperluas:
```typescript
export interface SavingsSubItem {
  status: 'paid' | 'unpaid' | 'not_applicable';
  amount: number;
}

export interface MonthSavingsCell {
  month: number;
  wajib: SavingsSubItem;
  belanja: SavingsSubItem;
  lebaran: SavingsSubItem;
}

export interface ComplianceMonthData {
  w: number;
  b: number;
  l: number;
  bal_w: number;
  bal_b: number;
  bal_l: number;
  wajib: SavingsSubItem;
  belanja: SavingsSubItem;
  lebaran: SavingsSubItem;
}
```

Dalam fungsi `getComplianceMatrixData(year)`:
- Jika bulan aktif dan anggota berhak:
  - `wajib`: `status = p.w > 0 ? 'paid' : 'unpaid'`, `amount = p.w > 0 ? p.w : targetWajib`.
  - `belanja`: `status = p.b > 0 ? 'paid' : 'unpaid'`, `amount = p.b > 0 ? p.b : targetBelanja`.
  - `lebaran`: `status = p.l > 0 ? 'paid' : 'unpaid'`, `amount = p.l > 0 ? p.l : targetLebaran`.
- Jika belum terdaftar / di luar keanggotaan:
  - `status = 'not_applicable'`, `amount = 0`.

### 2. UI/UX in `ComplianceMatrix.tsx`
- **Lebar Kolom**:
  Saat ini kolom bulan memiliki `min-w-[60px]`. Dengan teks 3 baris label ("WAJIB", "BELANJA", "LEBARAN") dan nominal formatted (misal `200.000`), lebar kolom disesuaikan menjadi `min-w-[95px]` hingga `min-w-[105px]`.
- **Interaksi**:
  Seluruh area sel bulan dapat diklik (`cursor-pointer hover:bg-slate-100/70`) untuk membuka `SavingsLedgerMatrixModal`, memberikan alur kerja cepat bagi admin.
- **Backward Compatibility Fallback**:
  Di `renderCell`, jika properti `monthData.wajib` belum terisi (misalnya pada data mock pengujian unit lama), fungsi secara otomatis melakukan fallback deriving dari properti `w`, `b`, `l` dan `targets`.
- **Legend / Petunjuk Status**:
  Footer legend diperbarui untuk merefleksikan arti penanda warna hijau/teal (lunas), merah (tunggakan/belum terbayar), dan strip abu-abu.

## Testing & Verification Strategy
- **Unit Tests (`complianceService.test.ts`)**:
  Memvalidasi bahwa `getComplianceMatrixData` mengembalikan objek `wajib`, `belanja`, `lebaran` dengan status `'paid'` / `'unpaid'` dan nilai nominal yang tepat.
- **Component Tests (`ComplianceMatrix.test.tsx`)**:
  Memvalidasi bahwa sel bulan merender 3 label sub-baris (`WAJIB`, `BELANJA`, `LEBARAN`) dengan nominal serta styling kelas warna status yang tepat.
- **Build & Quality Check**:
  Typecheck TypeScript (`tsc --noEmit`), test runner Vitest (`npx vitest run`), dan bundler production Vite (`npm run build`).

