---
phase: 47
plan: 2
wave: 2
depends_on: ["47-1"]
gap_closure: false
---

# Plan 47.2: Bind Dynamic Year Selector in ComplianceMatrix.tsx

## Objective
Mengintegrasikan fungsi `getSavingsComplianceAvailableYears()` ke dalam halaman Matriks Tracking Pembayaran Simpanan Tahunan (`src/pages/admin/ComplianceMatrix.tsx`) sehingga dropdown opsi tahun me-render tahun dinamis secara otomatis berdasarkan ketersediaan kewajiban simpanan yang belum terselesaikan di database, serta secara otomatis menyelaraskan state tahun terpilih.

## Context
- `src/services/complianceService.ts`
- `src/pages/admin/ComplianceMatrix.tsx`

## Tasks

<task type="auto">
  <name>Integrate Dynamic Year Dropdown in ComplianceMatrix Component</name>
  <files>
    src/pages/admin/ComplianceMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/ComplianceMatrix.tsx`.
    2. Import `getSavingsComplianceAvailableYears` dari `../../services/complianceService`.
    3. Tambahkan state `availableYears`:
       ```typescript
       const [availableYears, setAvailableYears] = useState<number[]>([new Date().getFullYear()]);
       ```
    4. Buat efek `useEffect` saat mount komponen untuk mengambil daftar tahun yang tersedia:
       ```typescript
       useEffect(() => {
         const loadAvailableYears = async () => {
           try {
             const years = await getSavingsComplianceAvailableYears();
             if (years && years.length > 0) {
               setAvailableYears(years);
               setYear(prev => {
                 const currentNum = parseInt(prev);
                 return years.includes(currentNum) ? prev : years[0].toString();
               });
             }
           } catch (err) {
             console.error('Error fetching savings compliance available years:', err);
           }
         };
         loadAvailableYears();
       }, []);
       ```
    5. Perbarui elemen `<select>` dropdown filter tahun dari yang semula terkunci statis (`2026`, `2025`):
       ```tsx
       <select 
         value={year}
         onChange={(e) => setYear(e.target.value)}
         className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-slate-800"
       >
         {availableYears.map((yr) => (
           <option key={yr} value={yr.toString()}>
             Tahun {yr}
           </option>
         ))}
       </select>
       ```
    6. Pastikan pergantian nilai `year` memicu reload data matriks simpanan bulanan (`getComplianceMatrixData(parseInt(year))`) serta rekap total setoran per tahun secara real-time.
  </action>
  <verify>
    Dropdown filter tahun pada halaman `ComplianceMatrix.tsx` menampilkan opsi dari state `availableYears` secara dinamis dan memperbarui data tabel saat opsi diubah.
  </verify>
  <done>
    Dropdown filter tahun pada Matriks Kepatuhan Simpanan terhubung penuh dan dinamis.
  </done>
</task>

## Success Criteria
- [ ] Dropdown pemilih tahun di `ComplianceMatrix.tsx` menampilkan seluruh opsi tahun dari `availableYears`
- [ ] State tahun otomatis disesuaikan ke tahun aktif atau opsi tahun teratas yang valid saat data tahun dimuat
- [ ] Mengubah tahun pada dropdown berhasil memicu pengambilan data matriks dan total setoran untuk tahun yang bersangkutan
