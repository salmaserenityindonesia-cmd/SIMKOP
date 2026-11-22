import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_KOPERASI_PROFILE,
  type KoperasiProfile,
} from '../services/settingsService';

export interface PurchaseInvoicePdfItem {
  id?: string;
  productName: string;
  qty: number;
  buyPrice: number;
  subtotal?: number;
}

export interface PurchaseItemCheck {
  qtyMatch: boolean;
  conditionGood: boolean;
  priceMatch: boolean;
  note: string;
}

export interface PurchaseGeneralChecks {
  suratJalanMatch: boolean;
  packagingIntact: boolean;
  expiryChecked: boolean;
  stockPlaced: boolean;
}

export interface PurchaseChecklistData {
  itemChecks: Record<string, PurchaseItemCheck>;
  generalChecks: PurchaseGeneralChecks;
  inspectorNotes: string;
}

export interface PurchaseInvoicePdfData {
  invoiceNumber: string;
  date: string;
  totalAmount?: number;
  notes?: string;
}

export type PurchaseInvoicePdfMode = 'download' | 'print';

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const TERBILANG_UNITS = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

const formatRp = (n: number): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/**
 * Menghasilkan nama berkas PDF faktur pembelian yang aman untuk sistem berkas.
 */
export function sanitizePurchaseInvoiceFilename(invoiceNumber: string): string {
  const clean = String(invoiceNumber || '')
    .trim()
    .replace(/[/\\:*?"<>|\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `Faktur_Pembelian_${clean || 'Faktur'}.pdf`;
}

/**
 * Memformat tanggal YYYY-MM-DD menjadi format Indonesia (mis. 22 November 2026) tanpa pergeseran zona waktu.
 */
export function formatIndonesianInvoiceDate(dateStr: string): string {
  const trimmed = String(dateStr || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) {
    return trimmed || '-';
  }

  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthName = INDONESIAN_MONTHS[monthIndex];

  if (!monthName || Number.isNaN(day) || day < 1 || day > 31) {
    return trimmed;
  }

  return `${day} ${monthName} ${year}`;
}

function terbilangInteger(num: number): string {
  const n = Math.floor(num);
  if (n === 0) return '';
  if (n < 12) return TERBILANG_UNITS[n];
  if (n < 20) return `${terbilangInteger(n - 10)} Belas`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rem = n % 10;
    return `${TERBILANG_UNITS[tens]} Puluh${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }
  if (n < 200) {
    const rem = n - 100;
    return `Seratus${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    return `${TERBILANG_UNITS[hundreds]} Ratus${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }
  if (n < 2000) {
    const rem = n - 1000;
    return `Seribu${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    return `${terbilangInteger(thousands)} Ribu${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }
  if (n < 1_000_000_000) {
    const millions = Math.floor(n / 1_000_000);
    const rem = n % 1_000_000;
    return `${terbilangInteger(millions)} Juta${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }
  if (n < 1_000_000_000_000) {
    const billions = Math.floor(n / 1_000_000_000);
    const rem = n % 1_000_000_000;
    return `${terbilangInteger(billions)} Miliar${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
  }

  const trillions = Math.floor(n / 1_000_000_000_000);
  const rem = n % 1_000_000_000_000;
  return `${terbilangInteger(trillions)} Triliun${rem > 0 ? ` ${terbilangInteger(rem)}` : ''}`;
}

/**
 * Mengonversi nominal angka menjadi kalimat terbilang Rupiah dalam Bahasa Indonesia.
 */
export function terbilangRupiah(amount: number): string {
  const numeric = Math.round(Number(amount) || 0);
  if (numeric === 0) {
    return 'Nol Rupiah';
  }
  if (numeric < 0) {
    return `Minus ${terbilangInteger(Math.abs(numeric))} Rupiah`;
  }
  return `${terbilangInteger(numeric)} Rupiah`;
}

/**
 * Membuat dokumen PDF A4 Faktur Pembelian & Penerimaan Barang satuan beserta kop koperasi,
 * rincian item, checklist kecocokan barang, total nilai, terbilang, dan blok tanda tangan pengesahan.
 */
export function generatePurchaseInvoicePdf(
  invoice: PurchaseInvoicePdfData,
  items: PurchaseInvoicePdfItem[],
  koperasiProfile?: Partial<KoperasiProfile> | null,
  mode: PurchaseInvoicePdfMode = 'download',
  checklistData?: PurchaseChecklistData
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  const namaKoperasi =
    (koperasiProfile?.nama_koperasi || DEFAULT_KOPERASI_PROFILE.nama_koperasi).trim() ||
    'KOPERASI DIGITAL MANDIRI';
  const alamat = (koperasiProfile?.alamat ?? DEFAULT_KOPERASI_PROFILE.alamat).trim();
  const telepon = (koperasiProfile?.telepon ?? DEFAULT_KOPERASI_PROFILE.telepon).trim();

  // 1. Header / Kop Dokumen
  const topY = 16;
  const leftMaxWidth = 105;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 30, 54);
  const nameLines: string[] = doc.splitTextToSize(namaKoperasi.toUpperCase(), leftMaxWidth);
  doc.text(nameLines, margin, topY);

  let leftY = topY + nameLines.length * 5.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);

  if (alamat) {
    const addrLines: string[] = doc.splitTextToSize(alamat, leftMaxWidth);
    doc.text(addrLines, margin, leftY);
    leftY += addrLines.length * 4;
  }
  if (telepon) {
    doc.text(`Telp: ${telepon}`, margin, leftY);
    leftY += 4;
  }

  // Right Block: Judul Dokumen & Badge Metadata Faktur
  const rightX = pageWidth - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 30, 54);
  doc.text('FAKTUR PEMBELIAN', rightX, topY, { align: 'right' });

  doc.setFontSize(8.5);
  doc.setTextColor(4, 120, 87);
  doc.text('& PENERIMAAN BARANG', rightX, topY + 4.5, { align: 'right' });

  const boxWidth = 70;
  const boxX = rightX - boxWidth;
  const boxY = topY + 7;
  const boxHeight = 14.5;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('No. Faktur', boxX + 3, boxY + 5);
  doc.text('Tanggal', boxX + 3, boxY + 10.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(invoice.invoiceNumber || '-', rightX - 3, boxY + 5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(formatIndonesianInvoiceDate(invoice.date), rightX - 3, boxY + 10.8, {
    align: 'right',
  });

  const headerBottomY = Math.max(leftY, boxY + boxHeight) + 4;
  doc.setDrawColor(15, 30, 54);
  doc.setLineWidth(0.6);
  doc.line(margin, headerBottomY, pageWidth - margin, headerBottomY);

  // 2. Tabel Rincian Barang Masuk
  let y = headerBottomY + 5;
  const safeItems = Array.isArray(items) ? items : [];
  let calculatedTotal = 0;
  let totalQty = 0;

  const tableRows = safeItems.map((item, idx) => {
    const qty = Number(item.qty) || 0;
    const buyPrice = Number(item.buyPrice) || 0;
    const subtotal = item.subtotal !== undefined ? Number(item.subtotal) || 0 : qty * buyPrice;
    totalQty += qty;
    calculatedTotal += subtotal;

    const check =
      (item.id ? checklistData?.itemChecks?.[item.id] : undefined) ??
      checklistData?.itemChecks?.[String(idx)];
    const baseProductName = item.productName || 'Produk';
    const productLabel = check?.note?.trim()
      ? `${baseProductName}\nCatatan: ${check.note.trim()}`
      : baseProductName;

    return [
      String(idx + 1),
      productLabel,
      qty.toLocaleString('id-ID'),
      formatRp(buyPrice),
      formatRp(subtotal),
      check?.qtyMatch ? '[v]' : '[  ]',
      check?.conditionGood ? '[v]' : '[  ]',
      check?.priceMatch ? '[v]' : '[  ]',
    ];
  });

  const grandTotal =
    invoice.totalAmount !== undefined ? Number(invoice.totalAmount) || 0 : calculatedTotal;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        'NO',
        'NAMA PRODUK / BARANG',
        'QTY',
        'HARGA BELI',
        'SUBTOTAL',
        'QTY SESUAI',
        'KONDISI BAIK',
        'HARGA SESUAI',
      ],
    ],
    body:
      tableRows.length > 0
        ? tableRows
        : [
            [
              '-',
              'Tidak ada item barang pada faktur ini',
              '0',
              formatRp(0),
              formatRp(0),
              '[  ]',
              '[  ]',
              '[  ]',
            ],
          ],
    foot: [
      [
        '',
        'TOTAL NILAI FAKTUR',
        totalQty.toLocaleString('id-ID'),
        '',
        formatRp(grandTotal),
        '',
        '',
        '',
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: [15, 30, 54],
      textColor: 255,
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 2, right: 1.5, bottom: 2, left: 1.5 },
      valign: 'middle',
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2,
      valign: 'middle',
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 2,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { halign: 'left' },
      2: { halign: 'right', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'center', cellWidth: 17 },
      6: { halign: 'center', cellWidth: 17 },
      7: { halign: 'center', cellWidth: 17 },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 30) + 4.5;

  // 3. Kotak Terbilang & Catatan Opsional
  const terbilangText = `Terbilang: ${terbilangRupiah(grandTotal)}`;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  const terbilangLines: string[] = doc.splitTextToSize(terbilangText, contentWidth - 8);
  const terbilangBoxHeight = Math.max(8.5, terbilangLines.length * 4 + 4);

  if (y + terbilangBoxHeight + 12 > pageHeight - 15) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, terbilangBoxHeight, 1.5, 1.5, 'FD');
  doc.setTextColor(30, 41, 59);
  doc.text(terbilangLines, margin + 4, y + 5.2);

  y += terbilangBoxHeight + 4.5;

  if (invoice.notes && invoice.notes.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const noteLines: string[] = doc.splitTextToSize(`Catatan: ${invoice.notes.trim()}`, contentWidth);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 3.5;
  }

  // 4. Formulir Checklist Verifikasi Penerimaan Barang
  const checklistItems: Array<{ checked: boolean; label: string }> = [
    {
      checked: Boolean(checklistData?.generalChecks?.suratJalanMatch),
      label: 'Kesesuaian surat jalan / nota asli supplier dengan nomor faktur',
    },
    {
      checked: Boolean(checklistData?.generalChecks?.packagingIntact),
      label: 'Kemasan, segel, dan fisik seluruh barang dalam kondisi baik / tidak cacat',
    },
    {
      checked: Boolean(checklistData?.generalChecks?.expiryChecked),
      label: 'Masa kedaluwarsa (expired date) / spesifikasi barang telah diperiksa',
    },
    {
      checked: Boolean(checklistData?.generalChecks?.stockPlaced),
      label: 'Jumlah fisik barang sesuai faktur dan siap/telah masuk ke stok POS',
    },
  ];

  const inspectorNotesRaw = checklistData?.inspectorNotes?.trim() || '';
  const inspectorNotesText = `Catatan Pemeriksa Gudang: ${
    inspectorNotesRaw || '................................................................................'
  }`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const inspectorNoteLines: string[] = doc.splitTextToSize(inspectorNotesText, contentWidth - 8);
  const checklistHeaderHeight = 8;
  const checklistRowHeight = 5.2;
  const checklistBoxHeight =
    checklistHeaderHeight +
    checklistItems.length * checklistRowHeight +
    inspectorNoteLines.length * 3.8 +
    4.5;

  if (y + checklistBoxHeight + 10 > pageHeight - 15) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, checklistBoxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 30, 54);
  doc.text('FORMULIR CHECKLIST KECOCOKAN BARANG & FAKTUR', margin + 4, y + 5.5);

  let checkY = y + 10.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  checklistItems.forEach((item) => {
    const boxX = margin + 4;
    const boxY = checkY - 2.7;

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, 3.2, 3.2, 'FD');

    if (item.checked) {
      doc.setDrawColor(4, 120, 87);
      doc.setLineWidth(0.55);
      doc.line(boxX + 0.7, boxY + 1.7, boxX + 1.4, boxY + 2.5);
      doc.line(boxX + 1.4, boxY + 2.5, boxX + 2.6, boxY + 0.8);
    }

    doc.setTextColor(30, 41, 59);
    doc.text(item.label, boxX + 5.2, checkY);
    checkY += checklistRowHeight;
  });

  doc.setFont('helvetica', inspectorNotesRaw ? 'normal' : 'italic');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(inspectorNoteLines, margin + 4, checkY + 1.5);

  y += checklistBoxHeight + 5;

  // 5. Blok Tanda Tangan & Stempel Arsip
  const signatureBlockHeight = 32;
  if (y + signatureBlockHeight + 12 > pageHeight) {
    doc.addPage();
    y = 24;
  } else {
    y += 3;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  const colWidth = contentWidth / 3;
  const roles = ['Petugas Pemeriksa / Gudang', 'Bendahara Koperasi', 'Supplier / Pengirim'];
  roles.forEach((roleLabel, idx) => {
    const cx = margin + colWidth * idx + colWidth / 2;
    doc.text(roleLabel, cx, y, { align: 'center' });
    doc.text('( ________________________ )', cx, y + 20, { align: 'center' });
  });

  // 5. Footer Timestamp Cetak
  const printTimestamp = new Date().toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Dicetak otomatis oleh SIMKOP pada ${printTimestamp} | Arsip Pembelian Koperasi`,
      margin,
      pageHeight - 10
    );
    doc.text(`Halaman ${p} / ${totalPages}`, pageWidth - margin, pageHeight - 10, {
      align: 'right',
    });
  }

  // 6. Mode Output
  if (mode === 'print') {
    doc.autoPrint();
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      const blobUrl = doc.output('bloburl');
      window.open(String(blobUrl), '_blank', 'noopener,noreferrer');
    }
  } else {
    doc.save(sanitizePurchaseInvoiceFilename(invoice.invoiceNumber));
  }

  return doc;
}
