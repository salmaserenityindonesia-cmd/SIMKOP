import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_KOPERASI_PROFILE,
  type KoperasiProfile,
} from '../services/settingsService';
import type {
  RatShuSettings,
  YearEndClosingPreview,
} from '../services/yearEndClosingService';
import {
  MONTH_NAMES_ID,
  type MonthlyClosingRecord,
} from '../services/monthlyClosingService';

export interface ExportYearEndRatBeritaAcaraPdfParams {
  preview: YearEndClosingPreview;
  settings: RatShuSettings;
  monthlyArchives?: MonthlyClosingRecord[];
  closingNotes?: string | null;
  profile?: Partial<KoperasiProfile>;
  autoSave?: boolean;
}

const formatRp = (n: number): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

const formatDateId = (raw?: string | null): string => {
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/**
 * Mencetak dokumen PDF resmi Berita Acara Tutup Buku Akhir Tahun & Pengesahan SHU (RAT),
 * lengkap dengan Lampiran I (12 Arsip Rekap Akhir Bulan) dan Lampiran II (Rincian SHU per Anggota).
 */
export function exportYearEndRatBeritaAcaraPdf({
  preview,
  settings,
  monthlyArchives = [],
  closingNotes,
  profile,
  autoSave = true,
}: ExportYearEndRatBeritaAcaraPdfParams): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const namaKoperasi =
    profile?.nama_koperasi || DEFAULT_KOPERASI_PROFILE.nama_koperasi;
  const alamat = profile?.alamat || DEFAULT_KOPERASI_PROFILE.alamat;
  const telepon = profile?.telepon || DEFAULT_KOPERASI_PROFILE.telepon;

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 14;

  const statusLabel = preview.isClosed
    ? 'CLOSED / TERKUNCI'
    : 'AKTIF / DRAF SIMULASI RAT';
  const payoutLabel =
    settings.payout_method === 'CASH_PAYOUT'
      ? 'Dibayarkan Tunai / Transfer (Kas Keluar)'
      : `Dikreditkan ke Simpanan (${settings.target_deposit_type_code || 'BELANJA'})`;
  const effectiveNotes = (
    closingNotes ??
    preview.closingRecord?.notes ??
    ''
  ).trim();

  // ============================================================================
  // HALAMAN 1 — LEMBAR UTAMA: BERITA ACARA TUTUP BUKU & PENGESAHAN SHU (RAT)
  // ============================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(namaKoperasi.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`${alamat}${telepon ? ` | Telp: ${telepon}` : ''}`, pageWidth / 2, y, {
    align: 'center',
  });
  y += 2.5;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(
    'BERITA ACARA TUTUP BUKU AKHIR TAHUN & PENGESAHAN PEMBAGIAN SHU (RAT)',
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 4.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Tahun Buku: ${preview.fiscalYear} | Status: ${statusLabel}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 4;
  doc.text(
    `Tanggal Tutup Buku: ${preview.closingDate} | Pembukaan Saldo Baru: ${preview.openingNextYearDate}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 4.2;

  if (effectiveNotes) {
    doc.setFontSize(8);
    const notesLines = doc.splitTextToSize(
      `Catatan / No. Keputusan RAT: ${effectiveNotes}`,
      pageWidth - margin * 2
    );
    doc.text(notesLines, pageWidth / 2, y, { align: 'center' });
    y += notesLines.length * 3.6 + 1.5;
  } else {
    y += 1.5;
  }

  // Bagian A — Kebijakan Alokasi & Penyaluran SHU RAT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('A. KEBIJAKAN ALOKASI & PENYALURAN SHU RAT', margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Komponen Alokasi SHU RAT', 'Rasio', 'Nominal / Keterangan']],
    body: [
      [
        '1. Cadangan Modal',
        `${settings.reserve_fund_pct}%`,
        formatRp(preview.reserveFundAmount),
      ],
      [
        '2. Anggota Peminjam (Jasa Usaha / Pinjaman)',
        `${settings.member_borrower_pct}%`,
        formatRp(preview.memberBorrowerPool ?? preview.jasaUsahaPool),
      ],
      [
        '3. Anggota Penyimpan (Jasa Modal Simpanan)',
        `${settings.member_depositor_pct}%`,
        formatRp(preview.memberDepositorPool ?? preview.jasaModalPool),
      ],
      [
        '4. Dana Pengurus',
        `${settings.management_fund_pct}%`,
        formatRp(preview.managementFundAmount ?? 0),
      ],
      [
        '5. Dana Karyawan',
        `${settings.employee_fund_pct}%`,
        formatRp(preview.employeeFundAmount ?? 0),
      ],
      [
        '6. Dana Sosial',
        `${settings.social_fund_pct}%`,
        formatRp(preview.socialFundAmount ?? 0),
      ],
      [
        '7. Dana Pendidikan',
        `${settings.education_fund_pct}%`,
        formatRp(preview.educationFundAmount ?? 0),
      ],
      ['Metode Penyaluran SHU Anggota', '-', payoutLabel],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 30, 54], textColor: 255, fontSize: 8, cellPadding: 1.5 },
    bodyStyles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { halign: 'center', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 72 },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 36) + 5;

  // Bagian B — Posisi Akun Riil Akhir Tahun (Carry Forward)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    `B. POSISI AKUN RIIL AKHIR TAHUN (CARRY FORWARD KE 1 JAN ${preview.fiscalYear + 1})`,
    margin,
    y
  );
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [
      [
        'Pos Akun Riil',
        'Saldo Akhir 31 Des',
        `Saldo Awal 1 Jan ${preview.fiscalYear + 1} (Pasca SHU)`,
      ],
    ],
    body: [
      [
        'Saldo Kas Akhir Brankas',
        formatRp(preview.closingCashBalance),
        formatRp(preview.postShuCashBalance),
      ],
      [
        'Saldo Simpanan Anggota',
        formatRp(preview.closingMemberSavings),
        formatRp(preview.postShuMemberSavings),
      ],
      [
        'Sisa Piutang Pinjaman',
        formatRp(preview.closingLoanReceivable),
        formatRp(preview.closingLoanReceivable),
      ],
      [
        'Sisa Piutang Bon Toko',
        formatRp(preview.closingStoreReceivable),
        formatRp(preview.closingStoreReceivable),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 30, 54], textColor: 255, fontSize: 8, cellPadding: 1.5 },
    bodyStyles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 74 },
      1: { halign: 'right', cellWidth: 50 },
      2: { halign: 'right', fontStyle: 'bold', cellWidth: 58 },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 28) + 5;

  // Bagian C — Ikhtisar Laba Rugi & SHU Tahun Buku
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`C. IKHTISAR LABA RUGI & SHU TAHUN BUKU ${preview.fiscalYear}`, margin, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Komponen Kinerja Usaha', 'Nominal (Rp)']],
    body: [
      ['Omzet Penjualan POS', formatRp(preview.grossSales)],
      ['HPP / Harga Modal Barang', formatRp(preview.cogs)],
      ['Laba Kotor Toko Retail', formatRp(preview.grossProfit)],
      ['Realisasi Margin Pembiayaan Barang', formatRp(preview.goodsFinancingMargin)],
      ['Beban Operasional', formatRp(preview.opex)],
      ['SHU BERSIH TAHUN BUKU', formatRp(preview.netShuAmount)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8, cellPadding: 1.5 },
    bodyStyles: { fontSize: 8, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 122 },
      1: { halign: 'right', cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === 5) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [236, 253, 245];
      }
    },
  });

  // Blok Tanda Tangan Pengesahan
  let sigY = ((doc as any).lastAutoTable?.finalY ?? y + 36) + 8;
  if (sigY + 30 > pageHeight - 14) {
    doc.addPage();
    sigY = 22;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const colW = (pageWidth - margin * 2) / 3;
  const roles = ['Ketua Koperasi', 'Bendahara Koperasi', 'Ketua Pengawas'];
  roles.forEach((roleLabel, idx) => {
    const cx = margin + colW * idx + colW / 2;
    doc.text(roleLabel, cx, sigY, { align: 'center' });
    doc.text('( .............................. )', cx, sigY + 18, { align: 'center' });
  });

  // ============================================================================
  // HALAMAN BARU — LAMPIRAN I: RINGKASAN 12 ARSIP REKAP AKHIR BULAN
  // ============================================================================
  doc.addPage();
  const archiveMap = new Map<number, MonthlyClosingRecord>();
  for (const item of monthlyArchives) {
    archiveMap.set(item.period_month, item);
  }
  const approvedCount = archiveMap.size;

  let y1 = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('LAMPIRAN I — RINGKASAN 12 ARSIP REKAP AKHIR BULAN', margin, y1);
  y1 += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Periode: Januari – Desember ${preview.fiscalYear} | Status Kelengkapan: ${approvedCount} / 12 Bulan Disahkan`,
    margin,
    y1
  );
  y1 += 4;

  const appendix1Rows = MONTH_NAMES_ID.map((monthName, idx) => {
    const monthNum = idx + 1;
    const rec = archiveMap.get(monthNum);
    if (!rec) {
      return [
        String(monthNum),
        monthName,
        'Belum Direkap',
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
      ];
    }
    return [
      String(monthNum),
      monthName,
      'Disahkan',
      `${rec.minutes_number || '-'}\n${formatDateId(rec.meeting_date)}`,
      formatRp(rec.closing_cash_balance),
      formatRp(rec.total_savings_balance),
      formatRp(rec.total_loan_receivable),
      formatRp(rec.monthly_net_shu),
      formatRp(rec.ytd_net_shu),
    ];
  });

  autoTable(doc, {
    startY: y1,
    margin: { left: margin, right: margin },
    head: [
      [
        'NO',
        'BULAN',
        'STATUS',
        'NO. BA & TGL RAPAT',
        'KAS AKHIR',
        'SIMPANAN',
        'PIUTANG PINJAMAN',
        'SHU BULAN INI',
        'SHU YTD',
      ],
    ],
    body: appendix1Rows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 30, 54],
      textColor: 255,
      fontSize: 7.2,
      cellPadding: 1.6,
      halign: 'center',
    },
    bodyStyles: { fontSize: 7.2, cellPadding: 1.6 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 7 },
      1: { cellWidth: 18 },
      2: { halign: 'center', cellWidth: 19 },
      3: { cellWidth: 33 },
      4: { halign: 'right', cellWidth: 21 },
      5: { halign: 'right', cellWidth: 21 },
      6: { halign: 'right', cellWidth: 21 },
      7: { halign: 'right', cellWidth: 21 },
      8: { halign: 'right', cellWidth: 21, fontStyle: 'bold' },
    },
  });

  const y1End = ((doc as any).lastAutoTable?.finalY ?? y1 + 80) + 5;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(
    `Catatan Lampiran I: ${approvedCount} / 12 Bulan Disahkan dalam arsip bulanan Tahun Buku ${preview.fiscalYear}.`,
    margin,
    y1End
  );

  // ============================================================================
  // HALAMAN BARU — LAMPIRAN II: DAFTAR RINCIAN PEMBAGIAN SHU PER ANGGOTA
  // ============================================================================
  doc.addPage();
  let y2 = 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('LAMPIRAN II — DAFTAR RINCIAN PEMBAGIAN SHU PER ANGGOTA', margin, y2);
  y2 += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Tahun Buku ${preview.fiscalYear} | Total Anggota Penerima: ${preview.memberRows.length} Anggota | Metode Penyaluran: ${payoutLabel}`,
    margin,
    y2
  );
  y2 += 4;

  const totalSavings = preview.memberRows.reduce(
    (sum, r) => sum + (Number(r.totalSavingsContribution) || 0),
    0
  );
  const totalTransactions = preview.memberRows.reduce(
    (sum, r) => sum + (Number(r.totalTransactionContribution) || 0),
    0
  );
  const totalJasaModal = preview.memberRows.reduce(
    (sum, r) => sum + (Number(r.jasaModalAmount) || 0),
    0
  );
  const totalJasaUsaha = preview.memberRows.reduce(
    (sum, r) => sum + (Number(r.jasaUsahaAmount) || 0),
    0
  );
  const totalShu =
    preview.memberRows.length > 0 ? preview.totalDistributedToMembers : 0;

  const appendix2Body =
    preview.memberRows.length > 0
      ? preview.memberRows.map((row, idx) => [
          String(idx + 1),
          row.nrp || '-',
          row.nama,
          formatRp(row.totalSavingsContribution),
          formatRp(row.totalTransactionContribution),
          formatRp(row.jasaModalAmount),
          formatRp(row.jasaUsahaAmount),
          formatRp(row.totalShuReceived),
        ])
      : [
          [
            {
              content: 'Tidak ada data rincian pembagian SHU anggota.',
              colSpan: 8,
              styles: { halign: 'center' as const, fontStyle: 'italic' as const },
            },
          ],
        ];

  autoTable(doc, {
    startY: y2,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [
      [
        'NO',
        'NRP',
        'NAMA ANGGOTA',
        'SIMPANAN',
        'TRANSAKSI',
        'JASA MODAL',
        'JASA USAHA',
        'TOTAL SHU',
      ],
    ],
    body: appendix2Body as any,
    foot: [
      [
        '',
        '',
        'TOTAL',
        formatRp(totalSavings),
        formatRp(totalTransactions),
        formatRp(totalJasaModal),
        formatRp(totalJasaUsaha),
        formatRp(totalShu),
      ],
    ],
    showFoot: 'lastPage',
    theme: 'grid',
    headStyles: {
      fillColor: [15, 30, 54],
      textColor: 255,
      fontSize: 7.5,
      cellPadding: 1.6,
    },
    bodyStyles: { fontSize: 7.5, cellPadding: 1.6 },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: 1.6,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 18 },
      2: { cellWidth: 36 },
      3: { halign: 'right', cellWidth: 24 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 24 },
      7: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
    },
  });

  // ============================================================================
  // FOOTER PENOMORAN HALAMAN OTOMATIS (HALAMAN X DARI Y)
  // ============================================================================
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Berita Acara RAT Tahun Buku ${preview.fiscalYear} — ${namaKoperasi}`,
      margin,
      pageHeight - 7
    );
    doc.text(
      `Halaman ${p} dari ${totalPages}`,
      pageWidth - margin,
      pageHeight - 7,
      { align: 'right' }
    );
  }
  doc.setTextColor(0, 0, 0);

  if (autoSave) {
    doc.save(`Berita_Acara_RAT_Tahun_Buku_${preview.fiscalYear}.pdf`);
  }

  return doc;
}
