import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { getProductCategories, getProduk, addProductCategory } from './koperasiService';

/**
 * 1. Generate and download template for Products
 */
export async function exportProductTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template Produk');

  sheet.columns = [
    { header: 'sku', key: 'sku', width: 20 },
    { header: 'nama_produk', key: 'nama_produk', width: 40 },
    { header: 'kategori', key: 'kategori', width: 25 },
    { header: 'satuan', key: 'satuan', width: 15 },
    { header: 'harga_beli', key: 'harga_beli', width: 20 },
    { header: 'harga_jual', key: 'harga_jual', width: 20 },
    { header: 'stok_awal', key: 'stok_awal', width: 15 },
    { header: 'min_stok_alert', key: 'min_stok_alert', width: 15 }
  ];

  // Placeholder data
  sheet.addRow({ 
    sku: '1234567890123', 
    nama_produk: 'Minyak Cengkeh 50ml', 
    kategori: 'Herbal', 
    satuan: 'botol', 
    harga_beli: 15000, 
    harga_jual: 20000, 
    stok_awal: 50, 
    min_stok_alert: 5 
  });
  sheet.addRow({ 
    sku: '0987654321098', 
    nama_produk: 'Minyak Seree 100ml', 
    kategori: 'Herbal', 
    satuan: 'botol', 
    harga_beli: 25000, 
    harga_jual: 35000, 
    stok_awal: 20, 
    min_stok_alert: 5 
  });

  // Force SKU column to be interpreted as Text/String in Excel
  sheet.getColumn('sku').numFmt = '@';

  // Format header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  
  // Trigger download
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_katalog_produk.xlsx';
  a.click();
  window.URL.revokeObjectURL(url);
}

export interface ParsedProduct {
  sku: string;
  name: string;
  categoryName: string | null;
  unit: string;
  buy_price: number;
  sell_price: number;
  stock: number;
  min_stock_alert: number;
  is_active: boolean;
}

export interface ProductParseResult {
  newProducts: ParsedProduct[];
  updatedProducts: ParsedProduct[];
  newCategoriesToCreate: string[];
  totalRows: number;
}

/**
 * 2. Parse Excel file and check for new/update products and new categories
 */
export async function parseProductUpload(file: File): Promise<ProductParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheet = workbook.getWorksheet(1);
  if (!sheet) {
    throw new Error("File Excel tidak memiliki worksheet yang valid.");
  }

  // Find column indices (case-insensitive)
  const colIdx: Record<string, number> = {};
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value) {
      const headerName = String(cell.value).toLowerCase().trim();
      colIdx[headerName] = colNumber;
    }
  });

  const reqCols = ['sku', 'nama_produk', 'harga_jual'];
  for (const c of reqCols) {
    if (!colIdx[c]) throw new Error(`Kolom wajib '${c}' tidak ditemukan.`);
  }

  const rawProductsMap = new Map<string, ParsedProduct>();
  const incomingCategoryNames = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) { // Skip header
      // Read cell values carefully to handle formulas or rich text
      const getVal = (col: string): any => {
        const idx = colIdx[col];
        if (!idx) return null;
        const cell = row.getCell(idx);
        let val = cell.value;
        if (val && typeof val === 'object' && 'result' in val) {
          val = (val as any).result; // handle formula result
        }
        return val;
      };

      const rawSku = getVal('sku');
      const rawName = getVal('nama_produk');
      if (!rawSku || !rawName) return; // Skip if mandatory missing

      const sku = String(rawSku).trim();
      const name = String(rawName).trim();
      if (!sku || !name) return;

      const categoryName = getVal('kategori') ? String(getVal('kategori')).trim() : null;
      if (categoryName) incomingCategoryNames.add(categoryName);

      rawProductsMap.set(sku, {
        sku,
        name,
        categoryName,
        unit: getVal('satuan') ? String(getVal('satuan')).trim() : 'pcs',
        buy_price: Number(getVal('harga_beli')) || 0,
        sell_price: Number(getVal('harga_jual')) || 0,
        stock: Number(getVal('stok_awal')) || 0,
        min_stock_alert: Number(getVal('min_stok_alert')) || 5,
        is_active: true
      });
    }
  });

  const rawProducts = Array.from(rawProductsMap.values());

  // Fetch existing products and categories
  const [existingProducts, existingCategories] = await Promise.all([
    getProduk(),
    getProductCategories()
  ]);

  const existingSkus = new Set(existingProducts.map(p => p.sku));
  const existingCatNames = new Set(existingCategories.map(c => c.name.toLowerCase()));

  const newProducts: ParsedProduct[] = [];
  const updatedProducts: ParsedProduct[] = [];
  const newCategoriesToCreate: string[] = [];

  // Determine new vs update products
  for (const p of rawProducts) {
    if (existingSkus.has(p.sku)) {
      updatedProducts.push(p);
    } else {
      newProducts.push(p);
    }
  }

  // Determine new categories to create
  for (const cat of Array.from(incomingCategoryNames)) {
    if (!existingCatNames.has(cat.toLowerCase())) {
      newCategoriesToCreate.push(cat);
    }
  }

  return {
    newProducts,
    updatedProducts,
    newCategoriesToCreate,
    totalRows: rawProducts.length
  };
}

/**
 * 3. Batch upsert products
 */
export async function batchUpsertProducts(parseResult: ProductParseResult) {
  const { newProducts, updatedProducts, newCategoriesToCreate } = parseResult;
  const allProducts = [...newProducts, ...updatedProducts];
  if (allProducts.length === 0) return;

  // 1. Create new categories if any
  for (const catName of newCategoriesToCreate) {
    try {
      await addProductCategory(catName);
    } catch (e) {
      // Ignore if exists, maybe created concurrently
      console.warn("Category creation might have failed or existed:", e);
    }
  }

  // 2. Fetch fresh categories mapping to get UUIDs
  const freshCategories = await getProductCategories();
  const catMap = new Map<string, string>();
  freshCategories.forEach(c => {
    catMap.set(c.name.toLowerCase(), c.id);
  });

  // 3. Prepare payload for upsert
  const payload = allProducts.map(p => {
    let category_id = null;
    if (p.categoryName) {
      const lowerCat = p.categoryName.toLowerCase();
      if (catMap.has(lowerCat)) {
        category_id = catMap.get(lowerCat);
      }
    }
    return {
      sku: p.sku,
      name: p.name,
      category_id,
      unit: p.unit,
      buy_price: p.buy_price,
      sell_price: p.sell_price,
      stock: p.stock,
      min_stock_alert: p.min_stock_alert,
      is_active: p.is_active
    };
  });

  // 4. Batch upsert to Supabase
  // Ensure the table has unique constraint on sku
  const { error } = await supabase
    .from('products')
    .upsert(payload, { onConflict: 'sku' });

  if (error) {
    throw new Error(`Gagal menyimpan produk batch: ${error.message}`);
  }
}
