# Summary Plan 23.1: Relokasi Menu Laporan Retail & Stok ke Kelompok Toko Retail & Inventori

## Completed Work
- Memindahkan item menu `{ label: 'Laporan Retail & Stok', icon: TrendingUp, href: '/admin/laporan-retail' }` dari grup `LAPORAN & ANALITIK` ke grup `TOKO RETAIL & INVENTORI` di [src/components/layout/Sidebar.tsx](file:///c:/SIMKOP/src/components/layout/Sidebar.tsx).
- Menempatkan item tersebut tepat di urutan terakhir grup `TOKO RETAIL & INVENTORI` setelah "Pengaturan Kasir".
- Mempertahankan ikon `TrendingUp`, teks label, dan rute link `/admin/laporan-retail`.
- Grup `LAPORAN & ANALITIK` kini secara spesifik menampung "Laporan Keuangan".

## Verification
- `npx tsc --noEmit` sukses (exit code 0).

