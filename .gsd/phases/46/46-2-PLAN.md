---
phase: 46
plan: 2
wave: 2
depends_on: ["46-1"]
gap_closure: false
---

# Plan 46.2: Bind Dynamic Year Selector in LoanMatrix.tsx

## Objective
Menghubungkan fungsi `getLoanMatrixAvailableYears()` ke komponen halaman Matriks Pinjaman (`src/pages/admin/LoanMatrix.tsx`) sehingga dropdown pemilih tahun me-render opsi tahun dinamis berdasarkan data pinjaman aktif di database, dengan penyesuaian state `year` otomatis.

## Context
- `src/services/loanMatrixService.ts`
- `src/pages/admin/LoanMatrix.tsx`

## Tasks

<task type="auto">
  <name>Integrate getLoanMatrixAvailableYears into LoanMatrix Component</name>
  <files>
    src/pages/admin/LoanMatrix.tsx
  </files>
  <action>
    1. Buka `src/pages/admin/LoanMatrix.tsx`.
    2. Import `getLoanMatrixAvailableYears` dari `../../services/loanMatrixService`.
    3. Tambahkan state `availableYears`:
       ```typescript
       const [availableYears, setAvailableYears] = useState<number[]>([currentYear]);
       ```
    4. Buat efek `useEffect` saat mount komponen untuk memuat daftar tahun:
       ```typescript
       useEffect(() => {
         const loadAvailableYears = async () => {
           try {
             const years = await getLoanMatrixAvailableYears();
             if (years.length > 0) {
               setAvailableYears(years);
               setYear(prev => (years.includes(prev) ? prev : years[0]));
             }
           } catch (err) {
             console.error('Error fetching available years:', err);
           }
         };
         loadAvailableYears();
       }, []);
       ```
    5. Ganti opsi filter tahun statis `[currentYear - 1, currentYear, currentYear + 1]` pada elemen `<select>` dropdown dengan iterasi dari `availableYears`:
       ```tsx
       <div className="flex items-center gap-2">
         <span className="text-sm text-slate-600">Tahun:</span>
         <select 
           value={year}
           onChange={e => setYear(Number(e.target.value))}
           className="border border-slate-300 rounded-lg py-2 px-3 font-semibold focus:ring-2 focus:ring-emerald-500"
         >
           {availableYears.map(y => (
             <option key={y} value={y}>{y}</option>
           ))}
         </select>
       </div>
       ```
    6. Pastikan pergantian `year` tetap memicu `fetchData()` untuk memuat data tabel matriks dan indikator ringkasan sesuai tahun yang dipilih.
  </action>
  <verify>
    Dropdown filter tahun pada halaman `LoanMatrix.tsx` menampilkan nilai dinamis dari `availableYears` dan memicu `fetchData` dengan nilai tahun terpilih.
  </verify>
  <done>
    Dropdown pemilih tahun pada Matriks Pinjaman dinamis dan terhubung penuh ke service.
  </done>
</task>

## Success Criteria
- [ ] State `availableYears` terinisialisasi dan diisi melalui `getLoanMatrixAvailableYears()` saat mount
- [ ] Dropdown `<select>` me-render seluruh tahun dari `availableYears`
- [ ] State `year` secara otomatis menyesuaikan jika nilai tahun saat ini di luar rentang `availableYears`
- [ ] Pengubahan tahun pada dropdown memicu pembaruan data matriks secara reaktif

