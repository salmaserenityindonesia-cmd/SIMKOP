---
phase: 76
plan: 1
wave: 1
gap_closure: false
---

# Plan 76.1: Active Loan Types Service & Dynamic Tenor State Generation

## Objective
Menyediakan fungsionalitas pengambilan daftar jenis pinjaman aktif dari database (`public.loan_types`) pada `src/services/loanService.ts`, mendukung `loanTypeId` eksplisit pada fungsi `applyLoan`, serta mengimplementasikan kalkulasi opsi tenor dinamis berbasis batas `max_duration_months` jenis pinjaman terpilih pada komponen `src/pages/admin/PengajuanPinjaman.tsx`.

## Context
Load these files for context:
- `src/services/loanService.ts`
- `src/services/koperasiService.ts`
- `src/pages/admin/PengajuanPinjaman.tsx`

## Tasks

<task type="auto">
  <name>Extend loanService to Fetch Active Loan Types and Accept loanTypeId</name>
  <files>
    src/services/loanService.ts
  </files>
  <action>
    1. Di `src/services/loanService.ts`:
       - Import tipe `LoanType` dari `./koperasiService` (jika belum diimport).
       - Buat fungsi yang diekspor `getActiveLoanTypes()`:
         ```typescript
         export async function getActiveLoanTypes(): Promise<LoanType[]> {
           const { data, error } = await supabase
             .from('loan_types')
             .select('id, code, name, max_duration_months, is_active')
             .eq('is_active', true)
             .order('code', { ascending: true });
           if (error) throw error;
           return (data || []) as LoanType[];
         }
         ```
       - Tambahkan method `getActiveLoanTypes: getActiveLoanTypes` ke dalam objek `loanService`.
       - Perbarui method `applyLoan(memberId: string, purpose: string, amount: number, tenor: number, loanTypeId?: string)`:
         - Jika parameter `loanTypeId` diberikan, gunakan nilai tersebut.
         - Jika tidak diberikan (backward compatibility), pertahankan query fallback mengambil tipe pinjaman aktif pertama.
         - Masukkan `loan_type_id: targetLoanTypeId` pada payload `supabase.from('loans').insert(...)`.
  </action>
  <verify>
    Jalankan pemeriksaan tipe pada `src/services/loanService.ts` memastikan tidak ada error TypeScript pada deklarasi `getActiveLoanTypes` dan `applyLoan`.
  </verify>
  <done>
    `getActiveLoanTypes` tersedia dan `applyLoan` menerima parameter `loanTypeId` secara fleksibel dan aman.
  </done>
</task>

<task type="auto">
  <name>Implement Dynamic Tenor Calculation and Loan Type State in PengajuanPinjaman</name>
  <files>
    src/pages/admin/PengajuanPinjaman.tsx
  </files>
  <action>
    1. Di `src/pages/admin/PengajuanPinjaman.tsx`:
       - Import `getActiveLoanTypes` dari `../../services/loanService` serta tipe `LoanType` dari `../../services/koperasiService`.
       - Perbarui interface `PengajuanPinjamanProps`:
         - Tambahkan `initialLoanTypes?: LoanType[]`
         - Tambahkan `initialSelectedLoanTypeId?: string`
       - Tambahkan state:
         ```typescript
         const [loanTypes, setLoanTypes] = useState<LoanType[]>(initialLoanTypes || []);
         const [selectedLoanTypeId, setSelectedLoanTypeId] = useState<string>(initialSelectedLoanTypeId || '');
         ```
       - Pada `useEffect` mount awal, panggil `getActiveLoanTypes()` jika `initialLoanTypes` belum didefinisikan.
       - Tambahkan logika kalkulasi opsi tenor dinamis:
         ```typescript
         const selectedLoanType = loanTypes.find(lt => String(lt.id) === String(selectedLoanTypeId));
         const maxTenor = selectedLoanType ? selectedLoanType.max_duration_months : 12;
         const baseTenors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 30, 36];
         const availableTenors = selectedLoanType ? baseTenors.filter(t => t <= maxTenor) : [];
         ```
       - Buat handler `handleLoanTypeChange(newTypeId: string)`:
         - Set `selectedLoanTypeId(newTypeId)`.
         - Cari jenis pinjaman baru. Jika tenor yang sedang dipilih saat ini lebih besar dari `max_duration_months` produk baru, reset `setTenor('')`.
       - Perbarui `SimulationPanelProps` dan komponen `SimulationPanel` agar menerima `maxTenor?: number` dan menyaring rekomendasi tenor kelayakan agar tidak merekomendasikan tenor yang melampaui `maxTenor`.
  </action>
  <verify>
    Komponen mengompilasi dengan benar, state `availableTenors` terhitung sesuai `max_duration_months` produk terpilih.
  </verify>
  <done>
    State jenis pinjaman dan kalkulasi batas tenor dinamis terpasang pada layer state `PengajuanPinjaman.tsx`.
  </done>
</task>

## Success Criteria
- [ ] `getActiveLoanTypes` mengambil tipe pinjaman aktif dari tabel `loan_types`.
- [ ] `applyLoan` menerima argumen `loanTypeId`.
- [ ] `availableTenors` dihitung dinamis menyaring opsi tenor agar tidak melebihi `max_duration_months`.
- [ ] Tenor otomatis direset jika tenor sebelumnya melebihi batas maksimal jenis pinjaman yang baru dipilih.

