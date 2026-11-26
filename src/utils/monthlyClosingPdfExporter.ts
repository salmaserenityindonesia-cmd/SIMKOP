import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  DEFAULT_KOPERASI_PROFILE,
  type KoperasiProfile,
} from '../services/settingsService';
import {
  getMonthNameId,
  type MonthlyClosingRecord,
  type MonthlyClosingSnapshot,
} from '../services/monthlyClosingService';

export interface ExportMonthlyClosingPdfParams {
  snapshot: MonthlyClosingSnapshot;
  record?: MonthlyClosingRecord | null;
  profile?: Partial<KoperasiProfile>;
  minutesNumber?: string;
  meetingDate?: string;
  attendees?: string;
  evaluationNotes?: string;
  autoSave?: boolean;
}

const formatRp = (n: number): string =>
  'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

/**
 * Mencetak dokumen PDF resmi Berita Acara Rekapitulasi Keuangan & Evaluasi Bulanan Pengurus.
 */
export function exportMonthlyClosingPdf({
  snapshot,
  record,
  profile,
  minutesNumber,
  meetingDate,
  attendees,
  evaluationNotes,
  autoSave = true,
}: ExportMonthlyClosingPdfParams): jsPDF {
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
  let y = 15;

  // 1. Kop Surat Koperasi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(namaKoperasi.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${alamat}${telepon ? ` | Telp: ${telepon}` : ''}`, pageWidth / 2, y, {
    align: 'center',
  });
  y += 3;

  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;

  // 2. Judul Berita Acara
  const monthName = getMonthNameId(snapshot.periodMonth);
  const isArchived = Boolean(record);
  const effectiveMinutesNo = minutesNumber ?? record?.minutes_number ?? '-';
  const effectiveMeetingDate = meetingDate ?? record?.meeting_date ?? '-';
  const effectiveAttendees = attendees ?? record?.attendees ?? '-';
  const effectiveNotes =
    evaluationNotes ??
    record?.evaluation_notes ??
    'Tidak ada catatan tambahan rapat evaluasi bulanan.';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(
    'BERITA ACARA REKAPITULASI KEUANGAN & EVALUASI BULANAN PENGURUS',
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Periode: ${monthName} ${snapshot.fiscalYear} | Cut-Off: ${snapshot.cutoffDate} | Status: ${
      isArchived ? 'DISAHKAN (SOFT ARCHIVE)' : 'DRAFT PRATINJAU'
    }`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 4.5;

  doc.text(
    `Nomor BA: ${effectiveMinutesNo || '-'} | Tanggal Rapat: ${effectiveMeetingDate || '-'}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );
  y += 4.5;

  const attendeesLines = doc.splitTextToSize(
    `Pengurus / Pengawas Hadir: ${effectiveAttendees || '-'}`,
    pageWidth - margin * 2
  );
  doc.text(attendeesLines, margin, y);
  y += attendeesLines.length * 4 + 3;

  // 3. Tabel I: Posisi Kas & Neraca Akhir Bulan
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `I. POSISI KAS & NERACA AKHIR BULAN (${monthName.toUpperCase()} ${snapshot.fiscalYear})`,
    margin,
    y
  );
  y += 2.5;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Pos Keuangan & Neraca', 'Keterangan', 'Nominal (Rp)']],
    body: [
      ['Saldo Kas Awal Bulan', 'Saldo bawaan awal periode', formatRp(snapshot.openingCashBalance)],
      ['Total Kas Masuk Bulan Ini', 'Mutasi kas masuk periode terpilih', formatRp(snapshot.monthlyCashIn)],
      ['Total Kas Keluar Bulan Ini', 'Mutasi kas keluar periode terpilih', formatRp(snapshot.monthlyCashOut)],
      [
        'Saldo Kas Akhir Brankas',
        'Otomatis menjadi saldo awal bulan berikutnya',
        formatRp(snapshot.closingCashBalance),
      ],
      [
        'Kewajiban Simpanan Anggota (Total)',
        'Akumulasi saldo bersih anggota aktif s/d akhir bulan',
        formatRp(snapshot.totalSavingsBalance),
      ],
      ['  • Simpanan Pokok', 'Rincian simpanan pokok', formatRp(snapshot.savingsPokok)],
      ['  • Simpanan Wajib', 'Rincian simpanan wajib', formatRp(snapshot.savingsWajib)],
      ['  • Simpanan Belanja', 'Rincian simpanan belanja', formatRp(snapshot.savingsBelanja)],
      ['  • Simpanan Lebaran', 'Rincian simpanan lebaran', formatRp(snapshot.savingsLebaran)],
      [
        'Sisa Piutang Pinjaman Aktif',
        `${snapshot.activeLoanCount} berkas pinjaman aktif`,
        formatRp(snapshot.totalLoanReceivable),
      ],
      [
        'Sisa Piutang Bon Toko',
        'Tagihan kredit toko belum terbayar',
        formatRp(snapshot.totalStoreCreditReceivable),
      ],
      [
        'Valuasi Persediaan Barang Gudang',
        'Nilai stok aktif berdasarkan harga modal (HPP)',
        formatRp(snapshot.inventoryValuation),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 30, 54], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      2: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 60) + 7;

  // 4. Tabel II: Kinerja Usaha Bulan Ini vs Akumulasi Tahun Berjalan (YTD)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(
    `II. KINERJA USAHA & SHU SEMENTARA (${monthName.toUpperCase()} vs AKUMULASI JAN–${monthName.toUpperCase()} ${snapshot.fiscalYear})`,
    margin,
    y
  );
  y += 2.5;

  const perfBody: string[][] = [
    ['Omzet Penjualan Retail (POS)', formatRp(snapshot.monthlyRevenue), formatRp(snapshot.ytdRevenue)],
    ['HPP / Harga Modal Barang Terjual', formatRp(snapshot.monthlyCogs), formatRp(snapshot.ytdCogs)],
    ['Laba Kotor Toko Retail', formatRp(snapshot.monthlyGrossProfit), formatRp(snapshot.ytdGrossProfit)],
    [
      'Realisasi Margin Pembiayaan Barang',
      formatRp(snapshot.monthlyFinancingMargin),
      formatRp(snapshot.ytdFinancingMargin),
    ],
  ];

  if (snapshot.monthlyOpnameImpact !== 0 || snapshot.ytdOpnameImpact !== 0) {
    perfBody.push([
      'Koreksi Stock Opname (Surplus/Susut)',
      formatRp(snapshot.monthlyOpnameImpact),
      formatRp(snapshot.ytdOpnameImpact),
    ]);
  }

  perfBody.push(
    ['Beban Operasional Koperasi', formatRp(snapshot.monthlyOpex), formatRp(snapshot.ytdOpex)],
    [
      'SHU / LABA BERSIH SEMENTARA (Belum Dibagi)',
      formatRp(snapshot.monthlyNetShu),
      formatRp(snapshot.ytdNetShu),
    ]
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Komponen Kinerja Usaha', `Bulan ${monthName}`, `Akumulasi YTD (Jan–${monthName})`]],
    body: perfBody,
    theme: 'grid',
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8 },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = ((doc as any).lastAutoTable?.finalY ?? y + 40) + 6;

  // 5. Bagian III: Notulensi & Keputusan Rapat
  if (y + 38 > pageHeight) {
    doc.addPage();
    y = 18;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('III. CATATAN EVALUASI & KEPUTUSAN RAPAT PENGURUS', margin, y);
  y += 4;

  const noteLines = doc.splitTextToSize(effectiveNotes, pageWidth - margin * 2 - 6);
  const boxHeight = Math.max(18, noteLines.length * 4.5 + 6);
  if (y + boxHeight + 35 > pageHeight) {
    doc.addPage();
    y = 18;
  }

  doc.setDrawColor(203, 213, 225);
  doc.rect(margin, y, pageWidth - margin * 2, boxHeight);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(noteLines, margin + 3, y + 5);
  y += boxHeight + 4;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(
    'Catatan: Rekap ini bersifat Soft Archive. SHU tetap terakumulasi tanpa pembagian & tanpa reset saldo hingga RAT akhir tahun.',
    margin,
    y
  );
  y += 10;

  // 6. Blok Tanda Tangan
  if (y + 30 > pageHeight) {
    doc.addPage();
    y = 24;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const colW = (pageWidth - margin * 2) / 3;
  const roles = ['Ketua Koperasi', 'Bendahara', 'Ketua Pengawas'];
  roles.forEach((roleLabel, idx) => {
    const cx = margin + colW * idx + colW / 2;
    doc.text(roleLabel, cx, y, { align: 'center' });
    doc.text('( .............................. )', cx, y + 20, { align: 'center' });
  });

  if (autoSave) {
    const mm = String(snapshot.periodMonth).padStart(2, '0');
    doc.save(`Berita-Acara-Rekap-Bulanan-${snapshot.fiscalYear}-${mm}.pdf`);
  }

  return doc;
}
