---
phase: 31
plan: 1
wave: 1
gap_closure: false
---

# Plan 31.1: Wave 1 - Build Keyboard-Accessible Product Autocomplete Component

## Objective
Membangun komponen reusable `ProductSearchAutocomplete.tsx` di `src/components/common/ProductSearchAutocomplete.tsx` yang menggantikan dropdown `<select>` statis dengan antarmuka pencarian produk interaktif berbasis autokomplit. Komponen ini mendukung pencarian instan berdasarkan SKU/Barcode dan nama produk, navigasi keyboard lengkap (ArrowDown, ArrowUp, Enter, Escape), penutupan otomatis saat klik di luar dropdown, tampilan status stok dan harga beli, serta pengujian unit terisolasi dengan Vitest.

## Context
Load these files for context:
- src/services/koperasiService.ts
- src/components/common/FeedbackModal.tsx
- src/components/common/ToastContainer.tsx

## Tasks

<task type="auto">
  <name>Create Keyboard-Accessible Product Autocomplete Component</name>
  <files>
    src/components/common/ProductSearchAutocomplete.tsx
    src/components/common/ProductSearchAutocomplete.test.tsx
  </files>
  <action>
    1. Buat komponen `src/components/common/ProductSearchAutocomplete.tsx`:
       - Definisi tipe item dan props:
         ```typescript
         export interface ProductAutocompleteItem {
           id: string;
           sku: string;
           name: string;
           buy_price?: number;
           stock?: number;
           unit?: string;
         }

         export interface ProductSearchAutocompleteProps {
           products: ProductAutocompleteItem[];
           selectedProductId: string;
           onSelect: (product: ProductAutocompleteItem) => void;
           placeholder?: string;
           autoFocus?: boolean;
           disabled?: boolean;
         }
         ```
       - State internal:
         * `searchTerm`: string query pencarian produk (diinisialisasi dengan nama produk terpilih jika ada).
         * `isOpen`: boolean untuk visibilitas dropdown hasil pencarian.
         * `highlightedIndex`: number untuk tracking index item yang sedang disorot via keyboard (default -1 atau 0).
       - Logika filter pencarian:
         * Filter daftar `products` secara case-insensitive terhadap `product.name` OR `product.sku`.
         * Batasi tampilan hasil maksimal 15-20 item teratas untuk menjaga responsivitas rendering.
       - Navigasi & Kontrol Keyboard (`onKeyDown` handler pada input):
         * `ArrowDown`: Geser sorotan ke bawah (`Math.min(highlightedIndex + 1, filtered.length - 1)`), buka dropdown jika tertutup.
         * `ArrowUp`: Geser sorotan ke atas (`Math.max(highlightedIndex - 1, 0)`).
         * `Enter`: Jika item sedang disorot (`highlightedIndex >= 0`), cegah form submit (`e.preventDefault()`), panggil `onSelect(filtered[highlightedIndex])`, perbarui `searchTerm`, dan tutup dropdown.
         * `Escape`: Tutup dropdown hasil pencarian.
       - UI / UX Styling (Tailwind CSS):
         * Input text pencarian berbalut container relatif dengan ikon kaca pembesar (`Search` dari `lucide-react`) di sisi kiri.
         * Tombol clear `X` jika ada teks query pencarian untuk reset cepat.
         * Floating dropdown menu (`absolute z-50 mt-1 w-full bg-surface border border-outline-variant/50 rounded-xl shadow-xl max-h-60 overflow-y-auto`).
         * Item baris:
           - Baris atas: **Nama Produk** (`font-medium text-on-surface`).
           - Baris bawah: Badge SKU/Barcode (`bg-surface-container text-on-surface-variant font-mono text-xs px-1.5 py-0.5 rounded`) serta info harga beli satuan dan sisa stok.
           - Highlight aktif: background aktif (`bg-primary/10 text-primary` atau `bg-surface-container-high`).
         * Pesan kosong: "Produk tidak ditemukan untuk kata kunci '[query]'" jika hasil filter 0.
         * Ref dan event listener `mousedown` / `touchstart` di luar komponen untuk menutup dropdown saat pengguna mengklik area luar.
    2. Buat pengujian unit di `src/components/common/ProductSearchAutocomplete.test.tsx`:
       - Uji perenderan komponen dasar dengan placeholder dan produk awal.
       - Uji pemfilteran teks pencarian berdasarkan nama dan SKU.
       - Uji navigasi keyboard (ArrowDown, ArrowUp, Enter, Escape).
       - Jalankan `npx vitest run src/components/common/ProductSearchAutocomplete.test.tsx`.
  </action>
  <verify>
    npx vitest run src/components/common/ProductSearchAutocomplete.test.tsx
  </verify>
  <done>
    Komponen ProductSearchAutocomplete berhasil dibuat, mendukung kontrol keyboard dan filter SKU/nama produk, serta lulus pengujian unit.
  </done>
</task>

## Success Criteria
- [ ] Berkas `src/components/common/ProductSearchAutocomplete.tsx` terbuat dengan tipe lengkap.
- [ ] Input pencarian mendukung filtering real-time berdasarkan `name` maupun `sku`.
- [ ] Dropdown dapat dinavigasi dengan tombol panah (ArrowUp, ArrowDown), Enter untuk memilih, dan Escape untuk menutup.
- [ ] Pengujian unit di `src/components/common/ProductSearchAutocomplete.test.tsx` lulus 100%.

