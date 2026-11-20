import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ArrowUpRight,
  BookOpen,
  Download,
  FileText,
  Plus,
  Printer,
  Search,
  User,
  Wallet,
  X,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import VoluntaryWithdrawalModal from '../../components/members/VoluntaryWithdrawalModal';
import { useFeedback } from '../../context/FeedbackContext';
import { formatCurrency } from '../../utils/formatCurrency';
import {
  AdditionalDepositProduct,
  getMemberProductStatement,
  getMembersWithAdditionalSavingsSummary,
  MemberAdditionalSavingsSummary,
  MemberProductStatement,
  recordVoluntaryDeposit,
  StatementEntry,
} from '../../services/voluntarySavingsService';
import { getTraceBackDepositRows } from '../../services/cashFlowAuditService';
import { supabase } from '../../lib/supabaseClient';

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function RekeningKoranSimpanan() {
  const { showToast } = useFeedback();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<AdditionalDepositProduct[]>([]);
  const [members, setMembers] = useState<MemberAdditionalSavingsSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => (searchParams.get('search') || '').trim());
  const [refFilter, setRefFilter] = useState(() => (searchParams.get('ref') || '').trim());
  const [resolvedTraceReceipt, setResolvedTraceReceipt] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    searchParams.get('memberId')
  );
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const [statementLoading, setStatementLoading] = useState(false);
  const [statement, setStatement] = useState<MemberProductStatement | null>(null);

  // Modal state for recording voluntary deposit
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [referenceNo, setReferenceNo] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadSummary = async (preserveSelection = true) => {
    setLoading(true);
    try {
      const res = await getMembersWithAdditionalSavingsSummary();
      setProducts(res.products);
      setMembers(res.members);

      const paramMemberId = searchParams.get('memberId');
      const paramSearch = (searchParams.get('search') || '').trim().toLowerCase();
      let nextMemberId = preserveSelection ? selectedMemberId || paramMemberId : paramMemberId;
      if (!nextMemberId && paramSearch) {
        const matched = res.members.find(
          (m) =>
            m.nrp.toLowerCase() === paramSearch ||
            m.nrp.toLowerCase().includes(paramSearch) ||
            m.nama.toLowerCase().includes(paramSearch)
        );
        if (matched) {
          nextMemberId = matched.memberId;
        }
      }
      if (!nextMemberId || !res.members.some((m) => m.memberId === nextMemberId)) {
        nextMemberId = res.members[0]?.memberId || null;
      }
      setSelectedMemberId(nextMemberId);

      if (res.products.length > 0) {
        setSelectedProductId((prev) =>
          prev && res.products.some((p) => p.id === prev) ? prev : res.products[0].id
        );
      } else {
        setSelectedProductId(null);
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat data rekening koran simpanan', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.nama.toLowerCase().includes(q) ||
        m.nrp.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const totalMembers = filteredMembers.length;
  const totalPages = Math.max(1, Math.ceil(totalMembers / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalMembers);
  const paginatedMembers = filteredMembers.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const queryMemberId = searchParams.get('memberId');
  useEffect(() => {
    if (!queryMemberId || members.length === 0) return;
    const targetIndex = members.findIndex((m) => m.memberId === queryMemberId);
    if (targetIndex >= 0) {
      setCurrentPage(Math.floor(targetIndex / pageSize) + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, queryMemberId]);

  const selectedMember = useMemo(
    () => members.find((m) => m.memberId === selectedMemberId) || null,
    [members, selectedMemberId]
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const currentProductBalance = useMemo(() => {
    if (statement) return statement.currentBalance;
    if (selectedMember && selectedProduct) {
      return selectedMember.productBalances[selectedProduct.id] || 0;
    }
    return 0;
  }, [statement, selectedMember, selectedProduct]);

  useEffect(() => {
    const trimmed = refFilter.trim();
    if (!trimmed || !trimmed.toUpperCase().startsWith('CF-')) {
      setResolvedTraceReceipt(null);
      return;
    }
    let cancelled = false;
    getTraceBackDepositRows(trimmed, searchQuery || null)
      .then((res) => {
        if (!cancelled) {
          setResolvedTraceReceipt(res.resolvedReceiptCode || null);
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedTraceReceipt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refFilter, searchQuery]);

  const filteredStatementEntries = useMemo(() => {
    const entries = statement?.entries || [];
    const q = refFilter.trim().toLowerCase();
    if (!q) return entries;
    const alt = resolvedTraceReceipt ? resolvedTraceReceipt.toLowerCase() : '';
    return entries.filter((entry) => {
      const refStr = String(entry.referenceNo || '').toLowerCase();
      const descStr = String(entry.description || '').toLowerCase();
      return (
        refStr.includes(q) ||
        descStr.includes(q) ||
        (alt ? refStr.includes(alt) || descStr.includes(alt) : false)
      );
    });
  }, [statement?.entries, refFilter, resolvedTraceReceipt]);

  const fetchStatement = async (memberId: string, productId: string) => {
    setStatementLoading(true);
    try {
      const data = await getMemberProductStatement(memberId, productId);
      setStatement(data);
    } catch (err: any) {
      showToast(err.message || 'Gagal memuat mutasi rekening koran', 'error');
      setStatement(null);
    } finally {
      setStatementLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMemberId && selectedProductId) {
      fetchStatement(selectedMemberId, selectedProductId);
    } else {
      setStatement(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, selectedProductId]);

  const handleSelectMember = (memberId: string) => {
    setSelectedMemberId(memberId);
    setSearchParams({ memberId });
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  };

  const handleOpenDepositModal = () => {
    setDepositAmount('');
    setPaymentMethod('Tunai');
    setReferenceNo('');
    setNotes('');
    setIsDepositModalOpen(true);
  };

  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !selectedProduct) return;

    const numericAmount = Number(depositAmount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      showToast('Nominal setoran harus lebih besar dari 0.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      await recordVoluntaryDeposit({
        memberId: selectedMember.memberId,
        depositTypeId: selectedProduct.id,
        amount: numericAmount,
        paymentMethod,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || undefined,
        userId: userData?.user?.id,
      });

      showToast(
        `Setoran ${selectedProduct.name} sebesar ${formatCurrency(numericAmount)} berhasil dicatat.`,
        'success'
      );
      setIsDepositModalOpen(false);
      await loadSummary(true);
      await fetchStatement(selectedMember.memberId, selectedProduct.id);
    } catch (err: any) {
      showToast(err.message || 'Gagal mencatat setoran mandiri', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    if (!selectedMember || !selectedProduct || !statement) return;

    const rows = statement.entries.map((entry, idx) => ({
      No: idx + 1,
      Tanggal: formatDateTime(entry.date),
      'No. Bukti': entry.referenceNo,
      Keterangan: entry.description,
      'Kredit (Setor)': entry.credit,
      'Debet (Tarik)': entry.debit,
      'Saldo Berjalan': entry.runningBalance,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekening Koran');
    const fileName = `Rekening_Koran_${selectedMember.nrp}_${selectedProduct.code}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportPdf = () => {
    if (!selectedMember || !selectedProduct || !statement) return;

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('REKENING KORAN SIMPANAN TAMBAHAN', 14, 16);
    doc.setFontSize(10);
    doc.text(`Anggota : ${selectedMember.nama} (${selectedMember.nrp})`, 14, 24);
    doc.text(`Produk  : ${selectedProduct.name} (${selectedProduct.code})`, 14, 30);
    doc.text(`Saldo Akhir : ${formatCurrency(statement.currentBalance)}`, 14, 36);

    autoTable(doc, {
      startY: 42,
      head: [['Tanggal', 'No. Bukti', 'Keterangan', 'Kredit (Setor)', 'Debet (Tarik)', 'Saldo Berjalan']],
      body: statement.entries.map((e) => [
        formatDateTime(e.date),
        e.referenceNo,
        e.description,
        e.credit > 0 ? formatCurrency(e.credit) : '-',
        e.debit > 0 ? formatCurrency(e.debit) : '-',
        formatCurrency(e.runningBalance),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    doc.save(`Rekening_Koran_${selectedMember.nrp}_${selectedProduct.code}.pdf`);
  };

  const handlePrintRowReceipt = (entry: StatementEntry) => {
    if (!selectedMember || !selectedProduct) return;

    const isWithdrawal = entry.debit > 0 || entry.transactionType === 'withdrawal';
    const nominal = isWithdrawal ? entry.debit : entry.credit;
    const txTitle = isWithdrawal
      ? 'KWITANSI PENCAIRAN SIMPANAN'
      : 'KWITANSI SETORAN SIMPANAN';
    const formattedDate = new Date(entry.date).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const escapeHtml = (val: string) =>
      String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const printWindow = window.open('', '', 'height=650,width=820');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>${txTitle} - ${escapeHtml(entry.referenceNo)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 24px; color: #0f172a; }
    .box { max-width: 640px; margin: 0 auto; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 24px; }
    .header { text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 14px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 16px; letter-spacing: 0.5px; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #475569; }
    .title { text-align: center; font-size: 14px; font-weight: 700; margin-bottom: 16px; color: ${isWithdrawal ? '#be123c' : '#047857'}; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 6px 4px; vertical-align: top; }
    td.label { width: 170px; color: #475569; font-weight: 600; }
    .amount-box { margin-top: 16px; padding: 12px 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
    .amount-val { font-size: 18px; font-weight: 800; color: ${isWithdrawal ? '#be123c' : '#047857'}; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
    @media print { body { margin: 0; } .box { border: none; } }
  </style>
</head>
<body>
  <div class="box">
    <div class="header">
      <h1>KOPERASI SIMKOP</h1>
      <p>Bukti Transaksi Simpanan Tambahan Anggota</p>
    </div>
    <div class="title">${txTitle}</div>
    <table>
      <tr><td class="label">No. Bukti / Referensi</td><td>: <strong>${escapeHtml(entry.referenceNo)}</strong></td></tr>
      <tr><td class="label">Tanggal Transaksi</td><td>: ${escapeHtml(formattedDate)}</td></tr>
      <tr><td class="label">Nama Anggota</td><td>: ${escapeHtml(selectedMember.nama)}</td></tr>
      <tr><td class="label">NRP</td><td>: ${escapeHtml(selectedMember.nrp)}</td></tr>
      <tr><td class="label">Produk Simpanan</td><td>: ${escapeHtml(selectedProduct.name)} (${escapeHtml(selectedProduct.code)})</td></tr>
      <tr><td class="label">Metode</td><td>: ${escapeHtml(entry.paymentMethod || '-')}</td></tr>
      <tr><td class="label">Keterangan</td><td>: ${escapeHtml(entry.description || '-')}</td></tr>
      <tr><td class="label">Saldo Setelah Transaksi</td><td>: <strong>${escapeHtml(formatCurrency(entry.runningBalance))}</strong></td></tr>
    </table>
    <div class="amount-box">
      <span>${isWithdrawal ? 'TOTAL PENCAIRAN' : 'TOTAL SETORAN'}</span>
      <span class="amount-val">${escapeHtml(formatCurrency(nominal))}</span>
    </div>
    <div class="footer">
      <span>Dicetak pada: ${escapeHtml(new Date().toLocaleString('id-ID'))}</span>
      <span>Petugas / Admin Koperasi</span>
    </div>
  </div>
</body>
</html>`);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
      return;
    }

    // Fallback PDF download if popup blocked
    const doc = new jsPDF();
    doc.setFontSize(13);
    doc.text(txTitle, 14, 18);
    doc.setFontSize(10);
    doc.text(`No. Bukti   : ${entry.referenceNo}`, 14, 28);
    doc.text(`Tanggal     : ${formattedDate}`, 14, 35);
    doc.text(`Anggota     : ${selectedMember.nama} (${selectedMember.nrp})`, 14, 42);
    doc.text(`Produk      : ${selectedProduct.name} (${selectedProduct.code})`, 14, 49);
    doc.text(`Metode      : ${entry.paymentMethod || '-'}`, 14, 56);
    doc.text(`Keterangan  : ${entry.description || '-'}`, 14, 63);
    doc.text(`Nominal     : ${formatCurrency(nominal)}`, 14, 72);
    doc.text(`Saldo Akhir : ${formatCurrency(entry.runningBalance)}`, 14, 79);
    doc.save(`Kwitansi_${entry.referenceNo}.pdf`);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <BookOpen className="w-6 h-6 text-emerald-600" />
              Rekening Koran Simpanan Tambahan
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Mutasi rekening koran produk simpanan Ditambah Mandiri (Voluntary) &amp; Sekali di Awal non-Pokok per anggota.
            </p>
          </div>
        </div>

        {/* Master-Detail Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT PANEL: Daftar Anggota */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col max-h-[75vh]">
            <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/70">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-600" />
                  Daftar Anggota ({filteredMembers.length})
                </h2>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama atau NRP..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
              {loading ? (
                <div className="p-8 text-center text-sm text-slate-500">Memuat daftar anggota...</div>
              ) : filteredMembers.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">Tidak ada anggota ditemukan.</div>
              ) : (
                paginatedMembers.map((member) => {
                  const isSelected = member.memberId === selectedMemberId;
                  return (
                    <button
                      key={member.memberId}
                      type="button"
                      onClick={() => handleSelectMember(member.memberId)}
                      className={`w-full text-left px-4 py-3 transition-colors flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-emerald-50/90 border-l-4 border-l-emerald-600'
                          : 'hover:bg-slate-50 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 truncate">
                          {member.nama}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          NRP: {member.nrp}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                          Total Tambahan
                        </div>
                        <div className="text-xs font-bold text-emerald-700 tabular-nums">
                          {formatCurrency(member.totalAdditionalBalance)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/70 flex flex-col gap-2.5 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>
                  Menampilkan{' '}
                  <strong className="font-semibold text-slate-800">
                    {totalMembers > 0 ? startIndex + 1 : 0}-{endIndex}
                  </strong>{' '}
                  dari <strong className="font-semibold text-slate-800">{totalMembers}</strong>
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value={10}>10 / hal</option>
                  <option value={25}>25 / hal</option>
                  <option value={50}>50 / hal</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="font-semibold text-slate-800">
                  Halaman {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: Kartu Produk & Tabel Rekening Koran */}
          <div className="lg:col-span-8 space-y-5">
            {!selectedMember ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
                Pilih anggota di panel kiri untuk melihat daftar simpanan tambahan dan rekening korannya.
              </div>
            ) : (
              <>
                {/* Member Banner + Product Cards */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{selectedMember.nama}</h2>
                      <p className="text-xs text-slate-500 font-mono">NRP: {selectedMember.nrp}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Total Saldo Simpanan Tambahan</span>
                      <span className="text-base font-bold text-emerald-700 tabular-nums">
                        {formatCurrency(selectedMember.totalAdditionalBalance)}
                      </span>
                    </div>
                  </div>

                  {products.length === 0 ? (
                    <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                      Belum ada produk simpanan bertipe <strong>Ditambah Mandiri (Voluntary)</strong> atau{' '}
                      <strong>One_time</strong> non-Pokok yang aktif di Master Produk Koperasi.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {products.map((prod) => {
                        const bal = selectedMember.productBalances[prod.id] || 0;
                        const active = prod.id === selectedProductId;
                        return (
                          <button
                            key={prod.id}
                            type="button"
                            onClick={() => setSelectedProductId(prod.id)}
                            className={`text-left p-4 rounded-xl border transition-all ${
                              active
                                ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-500/20'
                                : 'bg-slate-50/60 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs font-mono text-slate-500">{prod.code}</div>
                                <div className="text-sm font-bold text-slate-900 mt-0.5">{prod.name}</div>
                              </div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {prod.frequency_label}
                              </span>
                            </div>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-xs text-slate-500">Saldo Saat Ini</span>
                              <span className="text-sm font-bold text-emerald-700 tabular-nums">
                                {formatCurrency(bal)}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Rekening Koran Table */}
                {selectedProduct && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-emerald-600" />
                          Rekening Koran: {selectedProduct.name}
                        </h3>
                        {statement && (
                          <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-slate-600">
                            <span>
                              Kredit Masuk:{' '}
                              <strong className="text-emerald-700 tabular-nums">
                                {formatCurrency(statement.totalCredit)}
                              </strong>
                            </span>
                            <span>
                              Debet Keluar:{' '}
                              <strong className="text-rose-600 tabular-nums">
                                {formatCurrency(statement.totalDebit)}
                              </strong>
                            </span>
                            <span>
                              Saldo Akhir:{' '}
                              <strong className="text-slate-900 tabular-nums">
                                {formatCurrency(statement.currentBalance)}
                              </strong>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsWithdrawModalOpen(true)}
                          disabled={
                            currentProductBalance <= 0 ||
                            selectedProduct.can_be_withdrawn === false
                          }
                          title={
                            selectedProduct.can_be_withdrawn === false
                              ? 'Produk simpanan ini tidak dapat ditarik'
                              : currentProductBalance <= 0
                              ? 'Saldo produk Rp 0'
                              : 'Cairkan atau tarik saldo simpanan ini'
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          <span>Cairkan / Tarik Dana</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleOpenDepositModal}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          Tambah Setoran Mandiri
                        </button>
                        <button
                          type="button"
                          onClick={handleExportExcel}
                          disabled={!statement || statement.entries.length === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Excel
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPdf}
                          disabled={!statement || statement.entries.length === 0}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold disabled:opacity-50"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Cetak PDF
                        </button>
                      </div>
                    </div>

                    {/* Filter Kode Trace-Back Mutasi */}
                    <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="relative flex-1 min-w-[220px] max-w-md">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={refFilter}
                          onChange={(e) => setRefFilter(e.target.value)}
                          placeholder="Filter kode bukti / trace-back (KW-SETOR-... / CF-...)..."
                          className="w-full pl-8 pr-8 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                        />
                        {refFilter && (
                          <button
                            type="button"
                            onClick={() => setRefFilter('')}
                            title="Reset filter kode bukti"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {refFilter && (
                        <div className="text-xs text-slate-600">
                          Filter aktif: <code className="font-mono font-semibold text-emerald-700">{refFilter}</code>{' '}
                          ({filteredStatementEntries.length} mutasi cocok)
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider border-b border-slate-200">
                            <th className="py-3 px-4">Tanggal</th>
                            <th className="py-3 px-4">No. Bukti</th>
                            <th className="py-3 px-4">Keterangan</th>
                            <th className="py-3 px-4 text-right">Kredit (Setor)</th>
                            <th className="py-3 px-4 text-right">Debet (Tarik)</th>
                            <th className="py-3 px-4 text-right">Saldo Berjalan</th>
                            <th className="py-3 px-4 text-center">Kwitansi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {statementLoading ? (
                            <tr>
                              <td colSpan={7} className="py-10 text-center text-slate-500">
                                Memuat mutasi rekening koran...
                              </td>
                            </tr>
                          ) : !statement || filteredStatementEntries.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-10 text-center text-slate-500">
                                {refFilter
                                  ? `Tidak ada mutasi yang cocok dengan kode bukti "${refFilter}".`
                                  : 'Belum ada mutasi transaksi untuk produk simpanan ini.'}
                              </td>
                            </tr>
                          ) : (
                            filteredStatementEntries.map((entry) => (
                              <tr key={entry.id} className="hover:bg-slate-50/70">
                                <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                                  {formatDateTime(entry.date)}
                                </td>
                                <td className="py-3 px-4 text-xs font-mono text-slate-700 whitespace-nowrap">
                                  {entry.referenceNo}
                                </td>
                                <td className="py-3 px-4 text-xs text-slate-700">
                                  {entry.description}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-xs text-emerald-700 font-semibold tabular-nums whitespace-nowrap">
                                  {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-xs text-rose-600 font-semibold tabular-nums whitespace-nowrap">
                                  {entry.debit > 0 ? `- ${formatCurrency(entry.debit)}` : '-'}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-xs text-slate-900 font-bold tabular-nums whitespace-nowrap">
                                  {formatCurrency(entry.runningBalance)}
                                </td>
                                <td className="py-3 px-4 text-center whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => handlePrintRowReceipt(entry)}
                                    title="Cetak Kwitansi Transaksi"
                                    className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                                  >
                                    <Printer className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Tambah Setoran Mandiri */}
      {isDepositModalOpen && selectedMember && selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Catat Setoran Mandiri</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedMember.nama} ({selectedMember.nrp}) — {selectedProduct.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitDeposit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal Setoran (Rp) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Contoh: 100000"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Metode Pembayaran
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                >
                  <option value="Tunai">Tunai</option>
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="Potong Gaji">Potong Gaji</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  No. Bukti / Referensi (Opsional)
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Otomatis KW-MANDIRI-... jika dikosongkan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan (Opsional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Catatan setoran sukarela / mandiri"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan Setoran'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: Cairkan / Tarik Simpanan Tambahan */}
      {selectedMember && selectedProduct && (
        <VoluntaryWithdrawalModal
          isOpen={isWithdrawModalOpen}
          onClose={() => setIsWithdrawModalOpen(false)}
          onSuccess={async () => {
            await loadSummary(true);
            await fetchStatement(selectedMember.memberId, selectedProduct.id);
          }}
          member={selectedMember}
          product={selectedProduct}
          availableBalance={currentProductBalance}
        />
      )}
    </AdminLayout>
  );
}
