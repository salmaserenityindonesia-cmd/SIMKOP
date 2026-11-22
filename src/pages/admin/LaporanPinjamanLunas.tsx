import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import FeedbackContext from '../../context/FeedbackContext';
import {
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  Eye,
  Award,
  Users,
  Banknote,
  FileCheck2,
  X,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BookOpen,
  ExternalLink,
} from 'lucide-react';
import LoanSubsidiaryLedgerModal from '../../components/loans/LoanSubsidiaryLedgerModal';
import { formatTanggalLahir, formatTanggalLahirWithAge } from '../../utils/dateUtils';
import {
  getPaidOffLoansReport,
  getLoanTypesForFilter,
  exportPaidOffLoansExcel,
  exportPaidOffLoansPdf,
  exportPaidOffLoanCertificatePdf,
  formatReportDate,
  type PaidOffLoansSummary,
  type PaidOffLoanReportRow,
  type LoanTypeOption,
} from '../../services/paidOffLoansReportService';
import { getKoperasiProfile, type KoperasiProfile } from '../../services/settingsService';
import { formatCurrency } from '../../utils/formatCurrency';

export interface LaporanPinjamanLunasProps {
  initialData?: PaidOffLoansSummary | null;
  initialLoanTypes?: LoanTypeOption[];
  initialSelectedRow?: PaidOffLoanReportRow | null;
  initialSelectedLedgerRow?: PaidOffLoanReportRow | null;
}

export default function LaporanPinjamanLunas({
  initialData,
  initialLoanTypes,
  initialSelectedRow = null,
  initialSelectedLedgerRow = null,
}: LaporanPinjamanLunasProps = {}) {
  const feedback = useContext(FeedbackContext);

  const [data, setData] = useState<PaidOffLoansSummary | null>(initialData ?? null);
  const [loanTypes, setLoanTypes] = useState<LoanTypeOption[]>(initialLoanTypes ?? []);
  const [koperasiProfile, setKoperasiProfile] = useState<KoperasiProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(initialData === undefined);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLoanType, setSelectedLoanType] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Detail / Surat Keterangan Lunas Modal
  const [selectedRow, setSelectedRow] = useState<PaidOffLoanReportRow | null>(initialSelectedRow);
  // Buku Pembantu Piutang & Mutasi Angsuran Modal
  const [selectedLedgerLoan, setSelectedLedgerLoan] = useState<PaidOffLoanReportRow | null>(
    initialSelectedLedgerRow
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, typesRes, profileRes] = await Promise.all([
        getPaidOffLoansReport(),
        getLoanTypesForFilter(),
        getKoperasiProfile().catch(() => null),
      ]);
      setData(reportRes);
      if (typesRes.length > 0) {
        setLoanTypes(typesRes);
      }
      if (profileRes) {
        setKoperasiProfile(profileRes);
      }
    } catch (err: any) {
      console.error('Gagal memuat laporan pinjaman lunas:', err);
      feedback?.showToast?.(
        'Gagal memuat data pinjaman lunas: ' + (err?.message || 'Kesalahan sistem'),
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    if (initialData !== undefined) {
      if (!initialLoanTypes) {
        getLoanTypesForFilter().then((types) => {
          if (types.length > 0) setLoanTypes(types);
        });
      }
      getKoperasiProfile()
        .then((prof) => {
          if (prof) setKoperasiProfile(prof);
        })
        .catch(() => {});
      return;
    }
    loadData();
  }, [initialData, initialLoanTypes, loadData]);

  // Gabungkan pilihan jenis pinjaman dari tabel master loan_types dan baris laporan aktual
  const loanTypeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; id?: string }>();

    loanTypes.forEach((lt) => {
      const name = (lt.name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { value: name, label: name, id: lt.id });
      }
    });

    (data?.rows || []).forEach((row) => {
      const name = (row.loanTypeName || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { value: name, label: name, id: row.loanTypeId });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'id'));
  }, [loanTypes, data]);

  // Daftar tahun lunas dinamis + tahun berjalan
  const availableYears = useMemo(() => {
    const yearSet = new Set<number>([new Date().getFullYear()]);
    (data?.rows || []).forEach((row) => {
      if (row.paidOffYear && !isNaN(row.paidOffYear)) {
        yearSet.add(row.paidOffYear);
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [data]);

  // Terapkan filter pencarian, jenis pinjaman, dan tahun lunas
  const filteredRows = useMemo(() => {
    const rows = data?.rows || [];
    const q = searchQuery.trim().toLowerCase();

    return rows.filter((row) => {
      if (q) {
        const matchSearch =
          row.memberName.toLowerCase().includes(q) ||
          row.nrp.toLowerCase().includes(q) ||
          row.loanNumber.toLowerCase().includes(q) ||
          row.loanTypeName.toLowerCase().includes(q) ||
          formatTanggalLahir(row.tanggal_lahir).toLowerCase().includes(q);
        if (!matchSearch) return false;
      }

      if (selectedLoanType !== 'ALL') {
        const target = selectedLoanType.toLowerCase();
        const matchType =
          row.loanTypeName.toLowerCase() === target ||
          (row.loanTypeId && row.loanTypeId === selectedLoanType);
        if (!matchType) return false;
      }

      if (selectedYear !== 'ALL') {
        const yearNum = Number(selectedYear);
        if (row.paidOffYear !== yearNum) return false;
      }

      return true;
    });
  }, [data, searchQuery, selectedLoanType, selectedYear]);

  // Reset halaman ke 1 saat filter berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedLoanType, selectedYear]);

  // Metrik KPI berdasarkan data terfilter
  const kpiMetrics = useMemo(() => {
    const totalContracts = filteredRows.length;
    const uniqueMembers = new Set(
      filteredRows.map((r) => r.memberId || r.nrp).filter(Boolean)
    ).size;
    const totalPrincipal = filteredRows.reduce((sum, r) => sum + r.principalAmount, 0);

    return {
      totalContracts,
      uniqueMembers,
      totalPrincipal,
    };
  }, [filteredRows]);

  // Paginasi
  const totalFiltered = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / itemsPerPage));
  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredRows, currentPage, itemsPerPage]);

  const handleExportExcel = async () => {
    if (filteredRows.length === 0) return;
    setIsExportingExcel(true);
    try {
      await exportPaidOffLoansExcel(filteredRows, koperasiProfile, true);
      feedback?.showToast?.('Laporan Pinjaman Lunas berhasil diekspor ke Excel.', 'success');
    } catch (err: any) {
      console.error('Gagal ekspor Excel pinjaman lunas:', err);
      feedback?.showToast?.(
        'Gagal mengekspor Excel: ' + (err?.message || 'Kesalahan sistem'),
        'error'
      );
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = () => {
    if (filteredRows.length === 0) return;
    setIsExportingPdf(true);
    try {
      exportPaidOffLoansPdf(filteredRows, koperasiProfile, true);
      feedback?.showToast?.('Laporan Pinjaman Lunas berhasil dicetak ke PDF.', 'success');
    } catch (err: any) {
      console.error('Gagal ekspor PDF pinjaman lunas:', err);
      feedback?.showToast?.(
        'Gagal mencetak PDF: ' + (err?.message || 'Kesalahan sistem'),
        'error'
      );
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handlePrintCertificate = (row: PaidOffLoanReportRow) => {
    try {
      exportPaidOffLoanCertificatePdf(row, koperasiProfile, true);
      feedback?.showToast?.(
        `Surat Keterangan Lunas untuk ${row.memberName} berhasil diunduh.`,
        'success'
      );
    } catch (err: any) {
      console.error('Gagal mencetak surat keterangan lunas:', err);
      feedback?.showToast?.(
        'Gagal mencetak bukti keterangan lunas: ' + (err?.message || 'Kesalahan sistem'),
        'error'
      );
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header Halaman */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
              <span>SIMKOP</span>
              <span className="text-slate-400">/</span>
              <span>Simpan Pinjam</span>
              <span className="text-slate-400">/</span>
              <span className="text-emerald-700 font-semibold">Laporan Pinjaman Lunas</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
              Laporan Anggota Pinjaman Lunas
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Daftar riwayat anggota yang telah menyelesaikan seluruh kewajiban angsuran pinjaman beserta jenis pinjamannya.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={loading || isExportingExcel || filteredRows.length === 0}
              data-testid="export-paid-loans-excel-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingExcel ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Export Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={loading || isExportingPdf || filteredRows.length === 0}
              data-testid="export-paid-loans-pdf-btn"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>Cetak PDF</span>
            </button>
          </div>
        </div>

        {/* Kartu Ringkasan KPI (3 Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-emerald-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Berkas Lunas
              </span>
              <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800" data-testid="kpi-total-loans">
              {kpiMetrics.totalContracts}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Kontrak pinjaman telah selesai 100%
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-sky-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Jumlah Anggota Lunas
              </span>
              <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-800" data-testid="kpi-unique-members">
              {kpiMetrics.uniqueMembers}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Anggota unik yang telah melunasi pinjaman
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-amber-100 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Plafon Terselesaikan
              </span>
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Banknote className="w-5 h-5" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-700" data-testid="kpi-total-principal">
              {formatCurrency(kpiMetrics.totalPrincipal)}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              Akumulasi plafon pokok pinjaman yang lunas
            </p>
          </div>
        </div>

        {/* Bilah Filter & Pencarian */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-stretch lg:items-center">
          <div className="flex flex-wrap items-center gap-3 flex-1">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Cari Nama Anggota, NRP, atau No. Pinjaman..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="search-paid-loans-input"
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={selectedLoanType}
                onChange={(e) => setSelectedLoanType(e.target.value)}
                data-testid="filter-loan-type-select"
                aria-label="Filter Jenis Pinjaman"
                className="border border-slate-300 rounded-lg py-2 px-3 text-sm bg-white text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="ALL">Semua Jenis Pinjaman</option>
                {loanTypeFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-slate-500 shrink-0" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                data-testid="filter-paid-year-select"
                aria-label="Filter Tahun Lunas"
                className="border border-slate-300 rounded-lg py-2 px-3 text-sm bg-white text-slate-700 font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="ALL">Semua Tahun</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={String(yr)}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Muat Ulang</span>
          </button>
        </div>

        {/* Tabel Utama Daftar Pinjaman Lunas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5 text-center w-12">No</th>
                  <th className="px-4 py-3.5 min-w-[200px]">NRP &amp; Nama Anggota</th>
                  <th className="px-4 py-3.5 min-w-[155px]">No. Pinjaman</th>
                  <th className="px-4 py-3.5 min-w-[165px]">Nama Pinjaman</th>
                  <th className="px-4 py-3.5 text-right min-w-[140px]">Plafon Pokok</th>
                  <th className="px-4 py-3.5 text-center min-w-[90px]">Tenor</th>
                  <th className="px-4 py-3.5 min-w-[175px]">Tgl Mulai &amp; Tgl Lunas</th>
                  <th className="px-4 py-3.5 text-center min-w-[130px]">Status</th>
                  <th className="px-4 py-3.5 text-center w-20">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                        <span>Memuat daftar anggota pinjaman lunas...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Award className="w-9 h-9 text-slate-300" />
                        <p className="font-semibold text-slate-700">
                          Belum ada data pinjaman lunas yang cocok
                        </p>
                        <p className="text-xs text-slate-400">
                          Coba ubah filter jenis pinjaman, tahun lunas, atau kata kunci pencarian.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row, idx) => {
                    const rowNo = (currentPage - 1) * itemsPerPage + idx + 1;
                    return (
                      <tr
                        key={row.id || row.loanId}
                        className="hover:bg-slate-50/80 transition-colors"
                        data-testid={`paid-loan-row-${row.loanId}`}
                      >
                        <td className="px-4 py-3 text-center text-slate-500 font-medium">
                          {rowNo}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-800">{row.memberName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            NRP: <span className="font-mono font-medium">{row.nrp}</span>
                            {row.tanggal_lahir ? ` • Tgl Lahir: ${formatTanggalLahirWithAge(row.tanggal_lahir)}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedLedgerLoan(row)}
                            data-testid={`open-ledger-${row.loanId}`}
                            title="Klik untuk membuka Buku Pembantu Piutang & Rincian Angsuran"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 font-mono text-xs font-semibold transition-colors cursor-pointer group"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>{row.loanNumber}</span>
                            <ExternalLink className="w-3 h-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {row.loanTypeName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800 whitespace-nowrap">
                          {formatCurrency(row.principalAmount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {row.tenor} Bln
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <div className="text-slate-500">
                            Mulai:{' '}
                            <span className="font-medium text-slate-700">
                              {formatReportDate(row.disbursedAt)}
                            </span>
                          </div>
                          <div className="text-emerald-700 font-semibold mt-0.5">
                            Lunas: {formatReportDate(row.paidOffDate)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>✓ Lunas Penuh</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedRow(row)}
                            data-testid={`view-paid-loan-${row.loanId}`}
                            title="Lihat Rincian Jadwal & Bukti Lunas"
                            className="inline-flex p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginasi */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-slate-500">
            <span>
              Menampilkan {totalFiltered === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, totalFiltered)} dari {totalFiltered} berkas pinjaman lunas
            </span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              aria-label="Jumlah baris per halaman"
              className="ml-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <option value={10}>10 / halaman</option>
              <option value={25}>25 / halaman</option>
              <option value={50}>50 / halaman</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>
            <span className="text-xs font-bold px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalFiltered === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Detail / Surat Keterangan Lunas */}
        {selectedRow && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
            data-testid="paid-loan-detail-modal"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
              {/* Header Modal */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-800">
                        Detail &amp; Surat Keterangan Lunas Pinjaman
                      </h2>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        ✓ Lunas Penuh
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedRow.loanNumber} • {selectedRow.loanTypeName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  aria-label="Tutup modal detail"
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body Modal */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Ringkasan Identitas & Kontrak */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nama Anggota:</span>
                      <span className="font-bold text-slate-800">{selectedRow.memberName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">NRP:</span>
                      <span className="font-mono font-semibold text-slate-800">{selectedRow.nrp}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tanggal Lahir:</span>
                      <span className="font-semibold text-slate-700">{formatTanggalLahirWithAge(selectedRow.tanggal_lahir)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Nama Pinjaman:</span>
                      <span className="font-bold text-indigo-700">{selectedRow.loanTypeName}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-500">No. Pinjaman:</span>
                      <span className="font-mono font-semibold text-slate-800">{selectedRow.loanNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Plafon Pokok:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {formatCurrency(selectedRow.principalAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tenor &amp; Total Terbayar:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {selectedRow.tenor} Bln ({formatCurrency(selectedRow.totalPaid)})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tanggal Mulai / Pelunasan:</span>
                      <span className="font-semibold text-slate-800">
                        {formatReportDate(selectedRow.disbursedAt)} s/d {formatReportDate(selectedRow.paidOffDate)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tabel Riwayat Angsuran ke-1 s/d selesai */}
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-2.5">
                    Riwayat Angsuran (Periode 1 s/d {selectedRow.tenor})
                  </h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-72">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-100 text-slate-700 uppercase sticky top-0">
                          <tr>
                            <th className="px-3 py-2.5 text-center">Periode</th>
                            <th className="px-3 py-2.5">Jatuh Tempo</th>
                            <th className="px-3 py-2.5 text-right">Target Angsuran</th>
                            <th className="px-3 py-2.5 text-right">Terbayar</th>
                            <th className="px-3 py-2.5">No. Kwitansi / Metode</th>
                            <th className="px-3 py-2.5 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedRow.schedules.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-slate-500 italic">
                                Riwayat rincian jadwal tidak tersedia; status pinjaman tercatat Lunas Penuh.
                              </td>
                            </tr>
                          ) : (
                            selectedRow.schedules.map((sched) => (
                              <tr key={sched.id} className="hover:bg-slate-50">
                                <td className="px-3 py-2 text-center font-semibold text-slate-700">
                                  Ke-{sched.periodNumber}
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                  {formatReportDate(sched.dueDate)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-slate-700">
                                  {formatCurrency(sched.targetAmount)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-700">
                                  {formatCurrency(sched.paidAmount)}
                                </td>
                                <td className="px-3 py-2 text-slate-600">
                                  <div className="font-mono text-[11px]">
                                    {sched.receiptNumber || '-'}
                                  </div>
                                  {sched.paymentMethod && (
                                    <div className="text-[10px] text-slate-400 uppercase">
                                      {sched.paymentMethod}
                                      {sched.paymentDate ? ` • ${formatReportDate(sched.paymentDate)}` : ''}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                    Lunas
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Modal */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => handlePrintCertificate(selectedRow)}
                  data-testid="print-certificate-btn"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Bukti Keterangan Lunas (PDF)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRow(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Buku Pembantu Piutang & Mutasi Angsuran */}
        <LoanSubsidiaryLedgerModal
          loanRecord={selectedLedgerLoan}
          onClose={() => setSelectedLedgerLoan(null)}
        />
      </div>
    </AdminLayout>
  );
}
