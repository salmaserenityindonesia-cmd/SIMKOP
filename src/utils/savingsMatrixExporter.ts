/**
 * savingsMatrixExporter.ts
 * Utility ekspor matriks buku besar simpanan (Wajib, Belanja, Lebaran) ke format Excel (.xlsx)
 * Dilengkapi dengan struktur horizontal kronologis, formula Excel dinamis (=SUM, =SELISIH, =IF),
 * conditional formatting warna status validasi, dan auto-download via browser.
 */

import ExcelJS from 'exceljs';
import type ExcelJSType from 'exceljs';
import { supabase } from '../lib/supabaseClient';
import {
  getRateTiers,
  getApplicableRate,
  SavingsRateTier,
  DEFAULT_RATE_TIERS
} from '../services/savingsRateService';
import {
  isMonthBeforeJoin,
  resolveDepositTypeCode,
  matchAutomaticFifo,
  MONTH_NAMES
} from '../services/savingsMatrixService';

export type DepositTypeKey = 'WAJIB' | 'BELANJA' | 'LEBARAN';

export interface ExportSavingsMatrixOptions {
  depositTypeCode: DepositTypeKey;
  startYear?: number;
  startMonth?: number;
  endYear?: number;
  endMonth?: number;
  autoSave?: boolean;
  // Overrides untuk kemudahan pengujian unit & isolasi data
  members?: any[];
  rateTiers?: SavingsRateTier[];
  memberDeposits?: any[];
}

export interface MonthColumnDef {
  year: number;
  month: number;
  label: string; // e.g. 'Mei-21', 'Jun-21'
  key: string;   // e.g. '2021-05'
  colIndex: number; // 1-based index di worksheet
  colLetter: string; // e.g. 'E', 'F', dst.
}

/**
 * Konversi indeks kolom 1-based menjadi huruf kolom Excel (misal 1 -> 'A', 27 -> 'AA')
 */
export function getColumnLetter(colIndex: number): string {
  let temp: number;
  let letter = '';
  let curr = colIndex;
  while (curr > 0) {
    temp = (curr - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    curr = Math.floor((curr - temp - 1) / 26);
  }
  return letter;
}

/**
 * Format tanggal bergabung menjadi format YYYY-MM-DD
 */
export function formatJoinDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return dateStr;
  }
}

/**
 * Menghasilkan daftar kolom bulan horizontal dari rentang bulan awal hingga bulan akhir
 */
export function generateHorizontalMonths(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
  baseColIndex: number = 5 // Kolom E
): MonthColumnDef[] {
  const result: MonthColumnDef[] = [];
  let currCol = baseColIndex;

  for (let y = startYear; y <= endYear; y++) {
    const mStart = (y === startYear) ? startMonth : 1;
    const mEnd = (y === endYear) ? endMonth : 12;

    for (let m = mStart; m <= mEnd; m++) {
      result.push({
        year: y,
        month: m,
        label: `${MONTH_NAMES[m - 1]}-${String(y).slice(-2)}`,
        key: `${y}-${String(m).padStart(2, '0')}`,
        colIndex: currCol,
        colLetter: getColumnLetter(currCol)
      });
      currCol++;
    }
  }

  return result;
}

/**
 * Menghitung saldo acuan deterministik berdasarkan jumlah bulan berhak anggota:
 * Jumlah Bulan Berhak = (TahunCutoff * 12 + BulanCutoff) - (TahunMasuk * 12 + BulanMasuk) + 1
 * Nilai Saldo Acuan Database otomatis persis sama dengan: Jumlah Bulan Berhak * Nominal Tarif Periode
 */
export function calculateDeterministicBaseline(
  joinDate: string | Date | null | undefined,
  cutoffYear: number,
  cutoffMonth: number,
  depositTypeCode: string,
  rateTiers: SavingsRateTier[]
): number {
  if (!joinDate) return 0;
  const d = typeof joinDate === 'string' ? new Date(joinDate) : joinDate;
  if (isNaN(d.getTime())) return 0;

  const joinYear = d.getFullYear();
  const joinMonth = d.getMonth() + 1;

  const cutoffIndex = cutoffYear * 12 + cutoffMonth;
  const joinIndex = joinYear * 12 + joinMonth;

  if (joinIndex > cutoffIndex) return 0;

  let total = 0;
  for (let y = joinYear; y <= cutoffYear; y++) {
    const mStart = (y === joinYear) ? joinMonth : 1;
    const mEnd = (y === cutoffYear) ? cutoffMonth : 12;
    for (let m = mStart; m <= mEnd; m++) {
      total += getApplicableRate(depositTypeCode, y, m, rateTiers);
    }
  }
  return total;
}

/**
 * Menghasilkan Workbook ExcelJS untuk matriks simpanan dengan formula validasi selisih
 */
export async function generateSavingsMatrixWorkbook(
  options: ExportSavingsMatrixOptions
): Promise<ExcelJSType.Workbook> {
  const depositTypeCode = options.depositTypeCode;

  // 1. Ambil data anggota aktif (atau gunakan opsi override)
  let members: any[] = options.members || [];
  if (!options.members) {
    try {
      const selectBuilder: any = supabase
        .from('anggota')
        .select(`
          id,
          nrp,
          nama,
          created_at,
          status,
          membership_status
        `);

      let resp: any;
      if (typeof selectBuilder.order === 'function') {
        resp = await selectBuilder.order('nama', { ascending: true });
      } else {
        resp = await selectBuilder;
      }

      if (resp?.error) {
        throw resp.error;
      }

      const allMembers = resp?.data || [];
      const filtered = allMembers.filter((m: any) => {
        return (
          m.status?.toLowerCase() === 'aktif' ||
          m.membership_status?.toUpperCase() === 'ACTIVE' ||
          !m.status
        );
      });
      members = filtered.length > 0 ? filtered : allMembers;
    } catch (err) {
      console.warn('Gagal memuat anggota untuk ekspor matriks:', err);
      throw err;
    }
  }

  // 2. Ambil master deposit_types
  let targetDepTypeId: string | undefined;
  try {
    const { data: dTypes } = await supabase
      .from('deposit_types')
      .select('id, name, code');

    const dtList = dTypes || [];
    const match = dtList.find((dt: any) => {
      const c = (dt.code || '').toUpperCase();
      const n = (dt.name || '').toLowerCase();
      if (depositTypeCode === 'WAJIB') return c === 'WAJIB' || c === 'SW' || n.includes('wajib');
      if (depositTypeCode === 'BELANJA') return c === 'BELANJA' || c === 'SB' || n.includes('belanja');
      if (depositTypeCode === 'LEBARAN') return c === 'LEBARAN' || c === 'SL' || n.includes('lebaran') || n.includes('hari raya');
      return c === depositTypeCode;
    });
    targetDepTypeId = match?.id;
  } catch (err) {
    console.warn('Gagal memuat deposit_types:', err);
  }

  // 3. Ambil savings_rate_tiers
  let rateTiers: SavingsRateTier[] = options.rateTiers || [];
  if (!options.rateTiers || options.rateTiers.length === 0) {
    try {
      rateTiers = await getRateTiers(depositTypeCode, false);
    } catch (err) {
      console.warn('Gagal getRateTiers:', err);
    }

    if (!rateTiers || rateTiers.length === 0) {
      try {
        const { data: tiers } = await supabase
          .from('savings_rate_tiers')
          .select('*')
          .order('start_year', { ascending: true })
          .order('start_month', { ascending: true });
        if (tiers && tiers.length > 0) {
          rateTiers = tiers as any;
        }
      } catch (err) {
        console.warn('Gagal query savings_rate_tiers:', err);
      }
    }

    if (!rateTiers || rateTiers.length === 0) {
      rateTiers = DEFAULT_RATE_TIERS.filter(t => t.deposit_type_code === depositTypeCode);
      if (rateTiers.length === 0) rateTiers = DEFAULT_RATE_TIERS;
    }
  }

  // 4. Ambil member_deposits & deposit_transactions
  let memberDeposits: any[] = options.memberDeposits || [];
  if (!options.memberDeposits) {
    try {
      const { data: mdData } = await supabase
        .from('member_deposits')
        .select(`
          id,
          member_id,
          deposit_type_id,
          deposit_types ( id, name, code ),
          deposit_transactions (
            id,
            amount,
            for_month,
            for_year,
            transaction_type,
            description,
            created_at
          )
        `);
      memberDeposits = mdData || [];
    } catch (err) {
      console.warn('Gagal memuat member_deposits:', err);
      memberDeposits = [];
    }
  }

  // 5. Tentukan rentang horizontal bulan
  let sYear = options.startYear;
  let sMonth = options.startMonth;
  if (!sYear || !sMonth) {
    let oldestDate: Date | null = null;
    for (const m of members) {
      const raw = m.tgl_awal_anggota || m.created_at;
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          if (!oldestDate || d < oldestDate) {
            oldestDate = d;
          }
        }
      }
    }

    if (oldestDate) {
      sYear = oldestDate.getFullYear();
      sMonth = oldestDate.getMonth() + 1;
      // Batasi fallback minimal ke Mei 2021 jika tanggal tertua setelah Mei 2021
      if (sYear * 12 + sMonth > 2021 * 12 + 5) {
        sYear = 2021;
        sMonth = 5;
      }
    } else {
      sYear = 2021;
      sMonth = 5;
    }
  }

  // Tentukan batas akhir periode ekspor secara deterministik (default: bulan berjalan saat file diekspor)
  const endPeriodDate = new Date();
  const currentYear = endPeriodDate.getFullYear();
  const currentMonth = endPeriodDate.getMonth() + 1;

  const eYear = options.endYear ?? currentYear;
  const eMonth = options.endMonth ?? (options.endYear !== undefined && options.endYear !== currentYear ? 12 : currentMonth);

  // Pastikan rentang awal tidak melebihi rentang akhir
  if (sYear * 12 + sMonth > eYear * 12 + eMonth) {
    sYear = eYear;
    sMonth = eMonth;
  }

  const monthColumns = generateHorizontalMonths(sYear, sMonth, eYear, eMonth, 5);
  const totalMonths = monthColumns.length;
  const lastMonthColLetter = totalMonths > 0 ? monthColumns[totalMonths - 1].colLetter : 'E';

  // Kolom formula agregasi
  const totalColIndex = 5 + totalMonths;
  const selisihColIndex = totalColIndex + 1;
  const statusColIndex = selisihColIndex + 1;

  const totalColLetter = getColumnLetter(totalColIndex);
  const selisihColLetter = getColumnLetter(selisihColIndex);
  const statusColLetter = getColumnLetter(statusColIndex);

  // Buat Workbook ExcelJS
  const wb: ExcelJSType.Workbook = new ExcelJS.Workbook();
  wb.creator = 'SIMKOP Enterprise';
  wb.created = new Date();

  const ws = wb.addWorksheet(`Matriks ${depositTypeCode}`, {
    views: [
      {
        state: 'frozen',
        xSplit: 4, // Bekukan kolom A s/d D
        ySplit: 1, // Bekukan baris 1 (Header)
        showGridLines: true
      }
    ]
  });

  // 6. Header Tabel
  const headers = [
    'NRP',
    'Nama Anggota',
    'Tgl Masuk',
    'Saldo Acuan Database',
    ...monthColumns.map(m => m.label),
    'Total Alokasi',
    'Selisih',
    'Status Validasi'
  ];

  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  headerRow.eachCell((cell, colNum) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' } // Teal 700
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
    };

    // Styling khusus header formula
    if (colNum === totalColIndex) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } };
    } else if (colNum === selisihColIndex) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14B8A6' } };
    } else if (colNum === statusColIndex) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    }
  });

  // 7. Pengisian Baris Data Anggota
  members.forEach((member, idx) => {
    const rowNum = idx + 2; // Baris 2 dst
    const joinDate = member.tgl_awal_anggota || member.created_at;
    const formattedJoin = formatJoinDate(joinDate);

    // Cari member_deposit rekening simpanan ini untuk anggota yang bersangkutan
    const md = memberDeposits.find((d: any) => {
      const depMemberId = d.member_id || d.memberId;
      if (depMemberId && depMemberId !== member.id) return false;
      if (targetDepTypeId && d.deposit_type_id === targetDepTypeId) return true;
      const resCode = resolveDepositTypeCode(d.deposit_types);
      return resCode === depositTypeCode;
    });

    const txs: any[] = Array.isArray(md?.deposit_transactions) ? md.deposit_transactions : [];

    // Tentukan saldo acuan database
    const migrationTx = txs.find((t: any) => {
      const desc = (t.description || '').toLowerCase();
      return desc.includes('migra') || desc.includes('saldo awal') || desc.includes('historical') || desc.includes('one-time');
    });

    let saldoAcuan = 0;
    if (migrationTx) {
      saldoAcuan = Number(migrationTx.amount || 0);
    } else {
      let net = 0;
      for (const t of txs) {
        const amt = Number(t.amount || 0);
        if (t.transaction_type === 'withdrawal') net -= amt;
        else net += amt;
      }
      saldoAcuan = Math.max(0, net);
    }

    // Identifikasi alokasi per bulan
    const monthlyTxMap = new Map<string, number>();
    for (const t of txs) {
      if (t.transaction_type === 'deposit' && t.for_year && t.for_month) {
        const desc = (t.description || '').toLowerCase();
        const isLumpSum = desc.includes('migrasi saldo awal (as-is)') && Number(t.amount || 0) > 200000;
        if (!isLumpSum) {
          const k = `${t.for_year}-${String(t.for_month).padStart(2, '0')}`;
          monthlyTxMap.set(k, (monthlyTxMap.get(k) || 0) + Number(t.amount || 0));
        }
      }
    }

    let matchedMonthKeys = new Set<string>();
    if (monthlyTxMap.size === 0 && saldoAcuan > 0) {
      // Jika belum ada mutasi buku besar bulanan, buat rekomendasi FIFO berdasarkan saldo acuan
      const fifoKeys = matchAutomaticFifo(saldoAcuan, monthColumns, depositTypeCode, rateTiers, joinDate);
      matchedMonthKeys = new Set(fifoKeys);
    }

    // Susun nilai baris
    let calculatedTotalAlokasi = 0;
    const monthValues: Array<number | null> = monthColumns.map(m => {
      if (isMonthBeforeJoin(m.year, m.month, joinDate)) {
        return null;
      }

      if (monthlyTxMap.has(m.key)) {
        const val = monthlyTxMap.get(m.key)!;
        calculatedTotalAlokasi += val;
        return val;
      }

      if (matchedMonthKeys.has(m.key)) {
        const rate = getApplicableRate(depositTypeCode, m.year, m.month, rateTiers);
        calculatedTotalAlokasi += rate;
        return rate;
      }

      return null;
    });

    const calculatedSelisih = calculatedTotalAlokasi - saldoAcuan;
    const calculatedStatus = calculatedSelisih === 0
      ? 'SEIMBANG'
      : (calculatedSelisih < 0 ? 'KURANG' : 'LEBIH');

    // Buat baris baru
    const rowValues = [
      member.nrp || '-',
      member.nama || '-',
      formattedJoin,
      saldoAcuan,
      ...monthValues,
      // Total Alokasi (Formula)
      {
        formula: totalMonths > 0 ? `SUM(E${rowNum}:${lastMonthColLetter}${rowNum})` : '0',
        result: calculatedTotalAlokasi
      },
      // Selisih (Formula)
      {
        formula: `${totalColLetter}${rowNum}-D${rowNum}`,
        result: calculatedSelisih
      },
      // Status Validasi (Formula)
      {
        formula: `IF(${selisihColLetter}${rowNum}=0,"SEIMBANG",IF(${selisihColLetter}${rowNum}<0,"KURANG","LEBIH"))`,
        result: calculatedStatus
      }
    ];

    const row = ws.addRow(rowValues);
    row.height = 20;
    row.font = { name: 'Calibri', size: 9 };

    // Format & Alignment
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };

    // Saldo Acuan Database
    row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(4).numFmt = '#,##0';

    // Kolom Bulan
    for (let c = 5; c <= 4 + totalMonths; c++) {
      const cell = row.getCell(c);
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (cell.value !== null && cell.value !== undefined) {
        cell.numFmt = '#,##0';
      }
    }

    // Kolom Total Alokasi
    const totalCell = row.getCell(totalColIndex);
    totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
    totalCell.numFmt = '#,##0';
    totalCell.font = { name: 'Calibri', size: 9, bold: true };

    // Kolom Selisih
    const selisihCell = row.getCell(selisihColIndex);
    selisihCell.alignment = { horizontal: 'right', vertical: 'middle' };
    selisihCell.numFmt = '#,##0';
    selisihCell.font = { name: 'Calibri', size: 9, bold: true };

    // Kolom Status Validasi
    const statusCell = row.getCell(statusColIndex);
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
    statusCell.font = { name: 'Calibri', size: 9, bold: true };

    // Initial visual styling untuk status validasi
    if (calculatedStatus === 'SEIMBANG') {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD1FAE5' } // Emerald 100
      };
      statusCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF065F46' } };
    } else {
      statusCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEE2E2' } // Rose 100
      };
      statusCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF991B1B' } };
    }

    // Border sel
    row.eachCell(cell => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // 8. Terapkan Conditional Formatting pada Kolom Status Validasi
  const lastRow = members.length > 0 ? members.length + 1 : 2;
  ws.addConditionalFormatting({
    ref: `${statusColLetter}2:${statusColLetter}${lastRow}`,
    rules: [
      {
        priority: 1,
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"SEIMBANG"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFD1FAE5' },
            fgColor: { argb: 'FFD1FAE5' }
          },
          font: {
            color: { argb: 'FF065F46' },
            bold: true
          }
        }
      },
      {
        priority: 2,
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"KURANG"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFFEE2E2' },
            fgColor: { argb: 'FFFEE2E2' }
          },
          font: {
            color: { argb: 'FF991B1B' },
            bold: true
          }
        }
      },
      {
        priority: 3,
        type: 'cellIs',
        operator: 'equal',
        formulae: ['"LEBIH"'],
        style: {
          fill: {
            type: 'pattern',
            pattern: 'solid',
            bgColor: { argb: 'FFFEE2E2' },
            fgColor: { argb: 'FFFEE2E2' }
          },
          font: {
            color: { argb: 'FF991B1B' },
            bold: true
          }
        }
      }
    ]
  });

  // 9. Penyesuaian Lebar Kolom
  const colWidths: { width: number }[] = [
    { width: 14 }, // A: NRP
    { width: 28 }, // B: Nama Anggota
    { width: 14 }, // C: Tgl Masuk
    { width: 22 }, // D: Saldo Acuan Database
    ...monthColumns.map(() => ({ width: 12 })), // E..[N]: Bulan
    { width: 18 }, // Total Alokasi
    { width: 16 }, // Selisih
    { width: 18 }  // Status Validasi
  ];
  ws.columns = colWidths;

  return wb;
}

/**
 * Memicu ekspor matriks simpanan dan unduhan berkas ke format Excel (.xlsx)
 */
export async function exportSavingsMatrixExcel(
  depositTypeCode: DepositTypeKey,
  options?: Partial<ExportSavingsMatrixOptions>
): Promise<ExcelJSType.Workbook> {
  const mergedOptions: ExportSavingsMatrixOptions = {
    depositTypeCode,
    autoSave: true,
    ...options
  };

  const workbook = await generateSavingsMatrixWorkbook(mergedOptions);

  if (mergedOptions.autoSave !== false && typeof document !== 'undefined') {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `periksa_simpanan_${depositTypeCode.toLowerCase()}.xlsx`;
    document.body?.appendChild?.(a);
    a.click();
    document.body?.removeChild?.(a);
    URL.revokeObjectURL(url);
  }

  return workbook;
}
