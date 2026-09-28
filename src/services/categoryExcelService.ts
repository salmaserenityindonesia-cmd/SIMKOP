import ExcelJS from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import { getProductCategories } from './koperasiService';

/**
 * 1. Generate and download template
 */
export async function exportCategoryTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Template Kategori');

  sheet.columns = [
    { header: 'nama_kategori', key: 'nama_kategori', width: 40 }
  ];

  // Placeholder data
  sheet.addRow({ nama_kategori: 'Makanan Ringan' });
  sheet.addRow({ nama_kategori: 'Minuman' });
  sheet.addRow({ nama_kategori: 'Alat Tulis Kantor' });

  // Format header
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  
  // Trigger download in browser
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'template_kategori_produk.xlsx';
  a.click();
  window.URL.revokeObjectURL(url);
}

export interface ParseResult {
  newCategories: string[];
  duplicateCategories: string[];
  totalRows: number;
}

/**
 * 2. Parse Excel file and check duplicates
 * (Stateless upload - processes entirely in memory)
 */
export async function parseCategoryUpload(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  // Note: Since this is in browser, we don't have disk storage, thus it's inherently stateless.
  // There is no temporary file on the server to delete (no fs.promises.unlink needed).

  const sheet = workbook.getWorksheet(1);
  if (!sheet) {
    throw new Error("File Excel tidak memiliki worksheet yang valid.");
  }

  const rawCategories = new Set<string>();
  
  // Find column index for 'nama_kategori' (case-insensitive)
  let nameColIdx = -1;
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value && String(cell.value).toLowerCase().trim() === 'nama_kategori') {
      nameColIdx = colNumber;
    }
  });

  if (nameColIdx === -1) {
    throw new Error("Header 'nama_kategori' tidak ditemukan di baris pertama.");
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) { // Skip header
      const cellValue = row.getCell(nameColIdx).value;
      if (cellValue) {
        const val = String(cellValue).trim();
        if (val) rawCategories.add(val);
      }
    }
  });

  const categoriesFromExcel = Array.from(rawCategories);
  const totalRows = categoriesFromExcel.length;

  // Fetch existing to check duplicates
  const existingRecords = await getProductCategories();
  const existingNames = new Set(existingRecords.map(c => c.name.toLowerCase()));

  const newCategories: string[] = [];
  const duplicateCategories: string[] = [];

  for (const cat of categoriesFromExcel) {
    if (existingNames.has(cat.toLowerCase())) {
      duplicateCategories.push(cat);
    } else {
      newCategories.push(cat);
    }
  }

  return {
    newCategories,
    duplicateCategories,
    totalRows
  };
}

/**
 * 3. Batch insert new categories using Supabase
 */
export async function batchInsertCategories(categories: string[]) {
  if (categories.length === 0) return;

  const payload = categories.map(name => ({ name }));

  const { error } = await supabase
    .from('product_categories')
    .insert(payload);

  if (error) {
    throw new Error(`Gagal menyimpan kategori batch: ${error.message}`);
  }
}
