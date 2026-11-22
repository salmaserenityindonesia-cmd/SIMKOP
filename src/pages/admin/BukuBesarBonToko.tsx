import React, { useState, useEffect, useMemo, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import {
  CreditCard,
  Receipt,
  FileSpreadsheet,
  Printer,
  RotateCw,
  Search,
  Filter,
  ShoppingCart,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Eye,
  Loader2,
  Calendar,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  CheckCircle2,
  Clock,
  Layers,
  List,
  Link2
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatTanggalLahirWithAge } from '../../utils/dateUtils';
import { useFeedback } from '../../context/FeedbackContext';
import {
  getStoreCreditSummary,
  getStoreCreditLedger,
  exportStoreCreditToExcel,
  getActiveStoreCreditPlans,
  syncUnrecordedStoreCreditPaymentsToCashFlow,
  extractParentInvoiceFromNotes,
  extractInstallmentPeriodNumber,
  StoreCreditSummary,
  StoreCreditLedgerItem,
  StoreCreditFilter,
  StoreCreditPlanWithSchedules
} from '../../services/storeCreditLedgerService';
import { getSaleDetailByInvoice, SaleDetail } from '../../services/shoppingSavingsLedgerService';
import { supabase } from '../../lib/supabaseClient';
import StoreCreditScheduleModal from '../../components/pos/StoreCreditScheduleModal';

interface MemberOption {
  id: string;
  nama: string;
  nrp: string;
}

interface LedgerInvoiceGroup {
  groupKey: string;
  parentSale: StoreCreditLedgerItem | null;
  parentInvoiceNo: string;
  member_id: string;
  member_name: string;
  member_nrp: string;
  member_tanggal_lahir?: string | null;
  children: StoreCreditLedgerItem[];
  totalDebit: number;
  totalPaid: number;
  remainingDebt: number;
  status: 'PAID' | 'PARTIAL' | 'UNPAID';
  progressLabel: string;
}

const getInitialMonthRange = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return {
    startDate: formatYMD(firstDay),
    endDate: formatYMD(lastDay)
  };
};

export default function BukuBesarBonToko() {
  const { showToast } = useFeedback();

  // Summary State
  const [summary, setSummary] = useState<StoreCreditSummary>({
    totalCreditSales: 0,
    totalPaid: 0,
    outstandingDebt: 0,
    activeDebtorCount: 0,
    totalTransactions: 0
  });

  // Master Data & Filter States
  const defaultMonthRange = getInitialMonthRange();
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'PAID'>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Ledger Items & Loading States
  const [ledgerItems, setLedgerItems] = useState<StoreCreditLedgerItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Modal Detail Struk POS State
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<SaleDetail | null>(null);
  const [isLoadingSaleDetail, setIsLoadingSaleDetail] = useState<boolean>(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);

  // Tab & Store Credit Installments State
  const [activeTab, setActiveTab] = useState<'ledger' | 'installments'>('ledger');
  const [activePlans, setActivePlans] = useState<StoreCreditPlanWithSchedules[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState<boolean>(false);
  const [selectedPlanForSchedule, setSelectedPlanForSchedule] = useState<StoreCreditPlanWithSchedules | null>(null);

  // Parent-Child View Mode & Collapse State
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Ref untuk Cetak
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Load members on mount & sync unrecorded store credit payments to cash_flow
  useEffect(() => {
    fetchMembers();
    syncUnrecordedStoreCreditPaymentsToCashFlow().catch(() => {});
  }, []);

  // Fetch ledger data whenever filters change
  useEffect(() => {
    loadLedgerData();
  }, [selectedMemberId, statusFilter, startDate, endDate]);

  const fetchMembers = async () => {
    try {
      const { data, error } = await supabase
        .from('anggota')
        .select('id, nama, nrp')
        .order('nama', { ascending: true });

      if (error) {
        console.warn('Gagal memuat daftar anggota:', error.message);
        return;
      }

      setMembers(
        (data || []).map((m: any) => ({
          id: m.id,
          nama: m.nama || 'Tanpa Nama',
          nrp: m.nrp || '-'
        }))
      );
    } catch (err: any) {
      console.warn('Exception fetchMembers:', err?.message || err);
    }
  };

  const loadLedgerData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Global Summary
      const summaryData = await getStoreCreditSummary();
      setSummary(summaryData);

      // 2. Fetch Active Store Credit Installment Plans
      try {
        const plansData = await getActiveStoreCreditPlans();
        setActivePlans(plansData || []);
      } catch (pErr) {
        console.warn('Gagal memuat rencana angsuran bon aktif:', pErr);
      }

      // 3. Fetch Filtered Ledger
      const filterPayload: StoreCreditFilter = {
        memberId: selectedMemberId !== 'all' ? selectedMemberId : undefined,
        statusFilter: statusFilter,
        startDate: startDate ? startDate : undefined,
        endDate: endDate ? endDate : undefined,
        searchQuery: searchQuery
      };

      const result = await getStoreCreditLedger(filterPayload);
      setLedgerItems(result.items);
      setCurrentPage(1);
    } catch (err: any) {
      console.error('Gagal memuat buku besar bon toko:', err);
      showToast('Gagal memuat buku besar bon toko', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Lookup active installment plan by member_id for quick access from ledger rows
  const activePlanByMemberId = useMemo(() => {
    const map = new Map<string, StoreCreditPlanWithSchedules>();
    activePlans.forEach(plan => {
      if (plan.member_id && !map.has(plan.member_id)) {
        map.set(plan.member_id, plan);
      }
    });
    return map;
  }, [activePlans]);

  // In-memory fallback enrichment so legacy payment rows without `Ref: INV-...`
  // still resolve their parent POS invoice via sale_id, active plan, or member's sales
  const enrichedItems = useMemo(() => {
    const saleRefBySaleId = new Map<string, string>();
    const memberSalesMap = new Map<string, StoreCreditLedgerItem[]>();

    ledgerItems.forEach(item => {
      if (item.source_type === 'sale') {
        if (item.sale_id) {
          saleRefBySaleId.set(item.sale_id, item.reference_no);
        }
        if (item.member_id) {
          const list = memberSalesMap.get(item.member_id) || [];
          list.push(item);
          memberSalesMap.set(item.member_id, list);
        }
      }
    });

    return ledgerItems.map(item => {
      const derivedPeriod =
        item.period_number ?? extractInstallmentPeriodNumber(item.reference_no, item.notes);

      if (item.source_type === 'sale') {
        return {
          ...item,
          parent_invoice_no: item.parent_invoice_no || item.reference_no,
          period_number: derivedPeriod
        };
      }

      let parentInvoice =
        item.parent_invoice_no ||
        extractParentInvoiceFromNotes(item.notes) ||
        (item.sale_id ? saleRefBySaleId.get(item.sale_id) : undefined);

      if (!parentInvoice && item.member_id) {
        const plan = activePlanByMemberId.get(item.member_id);
        if (plan?.latest_sale_id && saleRefBySaleId.has(plan.latest_sale_id)) {
          parentInvoice = saleRefBySaleId.get(plan.latest_sale_id);
        }
      }

      if (!parentInvoice && item.member_id) {
        const memberSales = memberSalesMap.get(item.member_id) || [];
        if (memberSales.length === 1) {
          parentInvoice = memberSales[0].reference_no;
        } else if (memberSales.length > 1) {
          const payTime = new Date(item.date).getTime();
          const priorSales = memberSales.filter(s => new Date(s.date).getTime() <= payTime);
          parentInvoice =
            priorSales.length > 0
              ? priorSales[priorSales.length - 1].reference_no
              : memberSales[memberSales.length - 1].reference_no;
        }
      }

      return {
        ...item,
        parent_invoice_no: parentInvoice,
        period_number: derivedPeriod
      };
    });
  }, [ledgerItems, activePlanByMemberId]);

  // Client-side text search filtering
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return enrichedItems;
    const q = searchQuery.toLowerCase().trim();
    return enrichedItems.filter(item => {
      return (
        item.member_name.toLowerCase().includes(q) ||
        item.member_nrp.toLowerCase().includes(q) ||
        item.reference_no.toLowerCase().includes(q) ||
        (item.parent_invoice_no && item.parent_invoice_no.toLowerCase().includes(q)) ||
        (item.notes && item.notes.toLowerCase().includes(q)) ||
        (item.cashier_name && item.cashier_name.toLowerCase().includes(q))
      );
    });
  }, [enrichedItems, searchQuery]);

  // Filtered active plans for installment tab
  const filteredPlans = useMemo(() => {
    if (!searchQuery.trim()) return activePlans;
    const q = searchQuery.toLowerCase().trim();
    return activePlans.filter(p => {
      const name = p.anggota?.nama?.toLowerCase() || '';
      const nrp = p.anggota?.nrp?.toLowerCase() || '';
      return name.includes(q) || nrp.includes(q);
    });
  }, [activePlans, searchQuery]);

  // Parent-Child Grouping by Parent Invoice
  const groupedLedger = useMemo<LedgerInvoiceGroup[]>(() => {
    const groupMap = new Map<string, LedgerInvoiceGroup>();
    const orderedGroups: LedgerInvoiceGroup[] = [];

    // 1. Register every parent sale as a group header
    filteredItems.forEach(item => {
      if (item.source_type === 'sale') {
        const key = groupMap.has(item.reference_no)
          ? `${item.reference_no}-${item.id}`
          : item.reference_no;
        const group: LedgerInvoiceGroup = {
          groupKey: key,
          parentSale: item,
          parentInvoiceNo: item.reference_no,
          member_id: item.member_id,
          member_name: item.member_name,
          member_nrp: item.member_nrp,
          member_tanggal_lahir: item.member_tanggal_lahir,
          children: [],
          totalDebit: item.debit,
          totalPaid: 0,
          remainingDebt: item.debit,
          status: item.status,
          progressLabel: ''
        };
        groupMap.set(key, group);
        orderedGroups.push(group);
      }
    });

    // 2. Attach payment rows to matching parent invoice group (or fallback group)
    filteredItems.forEach(item => {
      if (item.source_type === 'payment') {
        const refInvoice = item.parent_invoice_no;
        let targetGroup = refInvoice ? groupMap.get(refInvoice) : undefined;

        if (!targetGroup) {
          const fallbackKey = refInvoice
            ? `orphan-inv-${refInvoice}`
            : `orphan-member-${item.member_id || 'unknown'}`;
          targetGroup = groupMap.get(fallbackKey);

          if (!targetGroup) {
            targetGroup = {
              groupKey: fallbackKey,
              parentSale: null,
              parentInvoiceNo: refInvoice || 'Pelunasan Historis',
              member_id: item.member_id,
              member_name: item.member_name,
              member_nrp: item.member_nrp,
              member_tanggal_lahir: item.member_tanggal_lahir,
              children: [],
              totalDebit: 0,
              totalPaid: 0,
              remainingDebt: 0,
              status: 'PAID',
              progressLabel: ''
            };
            groupMap.set(fallbackKey, targetGroup);
            orderedGroups.push(targetGroup);
          }
        }

        targetGroup.children.push(item);
      }
    });

    // 3. Sort children chronologically by period & date, then compute group totals & progress
    orderedGroups.forEach(group => {
      group.children.sort((a, b) => {
        const pa = a.period_number ?? 9999;
        const pb = b.period_number ?? 9999;
        if (pa !== pb) return pa - pb;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      group.totalPaid = group.children.reduce((sum, c) => sum + c.credit, 0);

      if (group.parentSale) {
        group.remainingDebt = Math.max(0, group.totalDebit - group.totalPaid);
        if (group.remainingDebt <= 0 && group.totalDebit > 0) {
          group.status = 'PAID';
        } else if (group.totalPaid > 0) {
          group.status = 'PARTIAL';
        } else {
          group.status = 'UNPAID';
        }
      } else {
        const lastChild = group.children[group.children.length - 1];
        group.remainingDebt = lastChild ? lastChild.running_debt : 0;
        group.status = group.remainingDebt === 0 ? 'PAID' : 'PARTIAL';
      }

      const memberPlan = activePlanByMemberId.get(group.member_id);
      if (group.children.length > 0) {
        if (group.remainingDebt === 0) {
          group.progressLabel = `${group.children.length}/${group.children.length} Periode Lunas`;
        } else if (memberPlan && memberPlan.schedules && memberPlan.schedules.length > 0) {
          const paidCount = memberPlan.schedules.filter(
            s => s.status === 'paid' || (s.paid_amount || 0) >= s.target_amount
          ).length;
          const totalCount = memberPlan.schedules.length || memberPlan.tenor_months;
          group.progressLabel =
            paidCount > 0 ? `${paidCount}/${totalCount} Periode` : `${group.children.length} Cicilan`;
        } else {
          group.progressLabel = `${group.children.length} Cicilan`;
        }
      } else if (group.parentSale) {
        if (group.status === 'PAID') {
          group.progressLabel = 'Lunas';
        } else if (memberPlan && memberPlan.schedules && memberPlan.schedules.length > 0) {
          const paidCount = memberPlan.schedules.filter(
            s => s.status === 'paid' || (s.paid_amount || 0) >= s.target_amount
          ).length;
          const totalCount = memberPlan.schedules.length || memberPlan.tenor_months;
          group.progressLabel = `${paidCount}/${totalCount} Periode`;
        } else {
          group.progressLabel = 'Belum Ada Cicilan';
        }
      }
    });

    return orderedGroups;
  }, [filteredItems, activePlanByMemberId]);

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const handleFilterByInvoice = (invoiceNo: string) => {
    setSearchQuery(invoiceNo);
    setCurrentPage(1);
  };

  // Pagination calculation
  const activeTotalCount = viewMode === 'grouped' ? groupedLedger.length : filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(activeTotalCount / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);
  const paginatedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return groupedLedger.slice(start, start + pageSize);
  }, [groupedLedger, currentPage, pageSize]);

  // Aggregate totals for visible filtered items
  const aggregatedTotals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    filteredItems.forEach(item => {
      totalDebit += item.debit;
      totalCredit += item.credit;
    });
    return {
      totalDebit,
      totalCredit,
      netOutstanding: Math.max(0, totalDebit - totalCredit)
    };
  }, [filteredItems]);

  // Handle Export Excel
  const handleExportExcel = async () => {
    if (filteredItems.length === 0) {
      showToast('Tidak ada data mutasi piutang untuk diekspor', 'warning');
      return;
    }

    setIsExporting(true);
    try {
      const selectedMember = members.find(m => m.id === selectedMemberId);
      const memberName = selectedMember
        ? `${selectedMember.nama} (${selectedMember.nrp})`
        : 'Semua Anggota';

      let statusLabel = 'Semua Status';
      if (statusFilter === 'UNPAID') statusLabel = 'Belum Lunas / Sebagian';
      if (statusFilter === 'PAID') statusLabel = 'Hanya Lunas';

      await exportStoreCreditToExcel(filteredItems, {
        memberName,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        statusLabel
      });

      showToast('Buku besar bon toko berhasil diekspor ke Excel', 'success');
    } catch (err: any) {
      console.error('Gagal ekspor Excel:', err);
      showToast('Terjadi kesalahan saat mengekspor ke Excel', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Print
  const handlePrint = () => {
    window.print();
  };

  // Handle click on POS Receipt
  const handleOpenReceipt = async (invoiceNo: string) => {
    setIsReceiptModalOpen(true);
    setIsLoadingSaleDetail(true);
    setSelectedSaleDetail(null);
    try {
      const detail = await getSaleDetailByInvoice(invoiceNo);
      if (detail) {
        setSelectedSaleDetail(detail);
      } else {
        showToast('Data rincian struk tidak ditemukan', 'warning');
      }
    } catch (err: any) {
      console.error('Error fetching sale detail:', err);
      showToast('Gagal memuat rincian struk POS', 'error');
    } finally {
      setIsLoadingSaleDetail(false);
    }
  };

  // Open Store Credit Schedule Modal for a member's active plan
  const handleOpenScheduleForPlan = (plan: StoreCreditPlanWithSchedules) => {
    setSelectedPlanForSchedule(plan);
    setIsScheduleModalOpen(true);
  };

  // Quick Date Helpers
  const handleSetToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    setStartDate(today);
    setEndDate(today);
  };

  const handleSetThisMonth = () => {
    const range = getInitialMonthRange();
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  const handleShowAll = () => {
    setSelectedMemberId('all');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  const handleResetFilters = () => {
    setSelectedMemberId('all');
    setStatusFilter('ALL');
    setStartDate('');
    setEndDate('');
    setSearchQuery('');
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto print:p-0 print:m-0">
        {/* ========================================================
            HEADER HALAMAN
        ======================================================== */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-200 pb-5 print:hidden">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-800 rounded-xl shadow-sm">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  Buku Besar Bon Toko (Piutang Kasir)
                </h1>
                <p className="text-sm text-gray-500">
                  Monitoring belanja bon retail anggota, riwayat pelunasan, dan rekapitulasi siap potong gaji dinas
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('installments')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg shadow-sm transition-colors"
            >
              <Calendar className="w-4 h-4 text-emerald-600" />
              <span>Jadwal Angsuran (Potong Gaji)</span>
            </button>

            <button
              onClick={loadLedgerData}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
              title="Muat ulang data"
            >
              <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Segarkan</span>
            </button>

            <button
              onClick={handlePrint}
              disabled={isLoading || filteredItems.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              <Printer className="w-4 h-4 text-gray-600" />
              <span>Cetak Rekening Bon</span>
            </button>

            <button
              onClick={handleExportExcel}
              disabled={isExporting || isLoading || filteredItems.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4" />
              )}
              <span>Ekspor Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* ========================================================
            PRINT ONLY HEADER (Hanya muncul saat cetak kertas)
        ======================================================== */}
        <div className="hidden print:block mb-6 border-b-2 border-gray-800 pb-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold uppercase tracking-wider text-black">
              Koperasi Pegawai Republik Indonesia (KPRI)
            </h2>
            <h3 className="text-lg font-semibold text-gray-800">
              BUKU BESAR PEMBANTU PIUTANG BON TOKO (STORE CREDIT)
            </h3>
            <p className="text-xs text-gray-600">
              Dicetak pada: {new Date().toLocaleString('id-ID')} | Filter Anggota: {selectedMemberId !== 'all' ? members.find(m => m.id === selectedMemberId)?.nama : 'Semua Anggota'}
            </p>
          </div>
        </div>

        {/* ========================================================
            TOP KPI CARDS (Metrik Ringkasan Piutang Bon)
        ======================================================== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
          {/* Card 1: Total Sisa Piutang Tertunggak */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Sisa Piutang Bon Belum Lunas
              </span>
              <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
                <TrendingDown className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-rose-700">
                {formatCurrency(summary.outstandingDebt)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Total piutang bon yang siap dipotong gaji
              </p>
            </div>
          </div>

          {/* Card 2: Realisasi Pelunasan Masuk */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Realisasi Pelunasan Masuk
              </span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-emerald-700">
                {formatCurrency(summary.totalPaid)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Akumulasi cicilan & pelunasan diterima
              </p>
            </div>
          </div>

          {/* Card 3: Total Belanja Bon Kumulatif */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Total Belanja Bon Kumulatif
              </span>
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <ShoppingCart className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-gray-900">
                {formatCurrency(summary.totalCreditSales)}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Akumulasi seluruh belanja bon POS kasir
              </p>
            </div>
          </div>

          {/* Card 4: Anggota Berutang Aktif */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Anggota Berutang Aktif
              </span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Users className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-indigo-900">
                {summary.activeDebtorCount} <span className="text-sm font-normal text-gray-500">Anggota</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {summary.totalTransactions} transaksi bon & pelunasan
              </p>
            </div>
          </div>
        </div>

        {/* ========================================================
            TAB SELECTOR: Mutasi Bon vs Jadwal Angsuran
        ======================================================== */}
        <div className="flex border-b border-gray-200 gap-6 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'ledger'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Mutasi Buku Besar Bon</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('installments')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'installments'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Jadwal Angsuran Bon Toko (Potong Gaji)</span>
            {activePlans.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                {activePlans.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'ledger' ? (
          <>
            {/* ========================================================
                FILTER & SEARCH BAR
            ======================================================== */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 space-y-4 print:hidden">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Filter className="w-4 h-4 text-rose-600" />
            <span>Filter Mutasi Piutang Bon Toko</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Filter 1: Pilih Anggota */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Pilih Anggota
              </label>
              <select
                value={selectedMemberId}
                onChange={e => setSelectedMemberId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="all">Semua Anggota</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.nama} ({m.nrp})
                  </option>
                ))}
              </select>
            </div>

            {/* Filter 2: Status Pelunasan */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Status Tagihan
              </label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              >
                <option value="ALL">Semua Status Tagihan</option>
                <option value="UNPAID">Belum Lunas / Tertunggak</option>
                <option value="PAID">Hanya Tagihan Lunas</option>
              </select>
            </div>

            {/* Filter 3: Tanggal Mulai */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tanggal Mulai
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>

            {/* Filter 4: Tanggal Selesai */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Tanggal Selesai
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
            </div>
          </div>

          {/* Quick Date Presets & Text Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Rentang Cepat:</span>
              <button
                type="button"
                onClick={handleSetToday}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Hari Ini
              </button>
              <button
                type="button"
                onClick={handleSetThisMonth}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Bulan Ini
              </button>
              <button
                type="button"
                onClick={handleShowAll}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Semua Riwayat
              </button>
              {(selectedMemberId !== 'all' || statusFilter !== 'ALL' || startDate || endDate || searchQuery) && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-2.5 py-1 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors ml-1"
                >
                  Reset Filter
                </button>
              )}
            </div>

            {/* Search Box */}
            <div className="relative sm:w-80">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama, NRP, no. struk, bukti bayar..."
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================
            TABEL BUKU BESAR MUTASI PIUTANG
        ======================================================== */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" ref={printAreaRef}>
          {/* Table Header Info */}
          <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Mutasi Piutang Bon Retail Toko
              </h2>
              <p className="text-xs text-gray-500">
                {viewMode === 'grouped'
                  ? `Menampilkan ${groupedLedger.length} nota induk (${filteredItems.length} mutasi bon & pelunasan)`
                  : `Menampilkan ${filteredItems.length} transaksi bon & pelunasan`}
                {selectedMemberId !== 'all' && (
                  <span className="font-medium text-rose-700 ml-1">
                    (Anggota: {members.find(m => m.id === selectedMemberId)?.nama})
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3">
              {/* View Mode Switcher: Kelompokkan per Nota vs Semua Baris Datar */}
              <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 shadow-sm print:hidden">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('grouped');
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    viewMode === 'grouped'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Kelompokkan per Nota</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('flat');
                    setCurrentPage(1);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    viewMode === 'flat'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>Semua Baris Datar</span>
                </button>
              </div>

              {/* Subtotal ringkasan baris terfilter */}
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="text-gray-600">
                  Tambah Utang (+): <strong className="text-rose-700">{formatCurrency(aggregatedTotals.totalDebit)}</strong>
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-600">
                  Pelunasan (-): <strong className="text-emerald-700">{formatCurrency(aggregatedTotals.totalCredit)}</strong>
                </span>
                <span className="text-gray-300">|</span>
                <span className="text-gray-600">
                  Sisa Piutang: <strong className="text-rose-900 font-bold">{formatCurrency(aggregatedTotals.netOutstanding)}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Table Body */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 border-collapse">
              <thead className="bg-gray-100/75 text-gray-700 font-semibold text-xs uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th scope="col" className="px-4 py-3 text-center w-12">No</th>
                  <th scope="col" className="px-4 py-3 whitespace-nowrap">Tanggal & Jam</th>
                  <th scope="col" className="px-4 py-3">Anggota</th>
                  <th scope="col" className="px-4 py-3 text-center">Jenis Mutasi</th>
                  <th scope="col" className="px-4 py-3">No. Bukti / Struk</th>
                  <th scope="col" className="px-4 py-3">Kasir / Petugas</th>
                  <th scope="col" className="px-4 py-3 text-right">Tambah Utang (+)</th>
                  <th scope="col" className="px-4 py-3 text-right">Pelunasan (-)</th>
                  <th scope="col" className="px-4 py-3 text-right">Sisa Utang Anggota</th>
                  <th scope="col" className="px-4 py-3 text-center">Status</th>
                  <th scope="col" className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                        <span className="text-sm font-medium">Memuat mutasi buku besar bon toko...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                        <div className="p-3 bg-gray-100 rounded-full text-gray-400">
                          <AlertCircle className="w-8 h-8" />
                        </div>
                        <span className="text-base font-semibold text-gray-800">
                          Tidak Ada Transaksi Bon Ditemukan
                        </span>
                        <p className="text-xs text-gray-500">
                          Tidak ada mutasi belanja bon toko yang sesuai dengan filter atau pencarian Anda.
                        </p>
                        <button
                          onClick={handleShowAll}
                          className="mt-2 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                        >
                          Tampilkan Semua Riwayat
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : viewMode === 'grouped' ? (
                  paginatedGroups.map((group, gIdx) => {
                    const groupNumber = (currentPage - 1) * pageSize + gIdx + 1;
                    const isCollapsed = Boolean(collapsedGroups[group.groupKey]);
                    const memberPlan = activePlanByMemberId.get(group.member_id);
                    const parent = group.parentSale;
                    const hasChildren = group.children.length > 0;

                    return (
                      <React.Fragment key={group.groupKey}>
                        {/* PARENT ROW (Nota Induk / Header Kelompok) */}
                        <tr className="bg-slate-50/90 hover:bg-rose-50/40 border-t-2 border-gray-200 transition-colors text-xs sm:text-sm">
                          {/* No + Expand/Collapse */}
                          <td className="px-3 py-3.5 text-center text-gray-700 font-semibold whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(group.groupKey)}
                              className="inline-flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-gray-200/80 text-gray-700 transition-colors"
                              title={isCollapsed ? 'Bentangkan riwayat pelunasan' : 'Ciutkan riwayat pelunasan'}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-rose-600" />
                              )}
                              <span>{groupNumber}</span>
                            </button>
                          </td>

                          {/* Tanggal & Jam Induk */}
                          <td className="px-4 py-3.5 whitespace-nowrap text-gray-900">
                            {parent ? (
                              <>
                                <div className="font-semibold">
                                  {new Date(parent.date).toLocaleDateString('id-ID', {
                                    day: '2-digit',
                                    month: 'short',
                                    year: 'numeric'
                                  })}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(parent.date).toLocaleTimeString('id-ID', {
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })} WIB
                                </div>
                              </>
                            ) : (
                              <span className="text-xs text-gray-400 italic">Periode Sebelumnya</span>
                            )}
                          </td>

                          {/* Anggota & Badge Progres */}
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-gray-900">{group.member_name}</div>
                            <div className="text-xs text-gray-500">
                              NRP: {group.member_nrp}{' '}
                              {group.member_tanggal_lahir
                                ? `| Tgl Lahir: ${formatTanggalLahirWithAge(group.member_tanggal_lahir)}`
                                : ''}
                            </div>
                            {group.progressLabel && (
                              <div className="mt-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                    group.status === 'PAID'
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                      : group.status === 'PARTIAL'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                                >
                                  {group.progressLabel}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* Jenis Mutasi Induk */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {parent ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <ShoppingCart className="w-3 h-3 text-rose-600" />
                                Belanja Bon POS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                <Layers className="w-3 h-3 text-slate-600" />
                                Kelompok Pelunasan
                              </span>
                            )}
                          </td>

                          {/* No. Bukti / Struk Induk */}
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              {parent ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReceipt(parent.reference_no)}
                                  className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-900 border border-rose-200 transition-colors text-xs font-semibold cursor-pointer"
                                  title="Klik untuk melihat rincian barang belanjaan"
                                >
                                  <Receipt className="w-3.5 h-3.5 text-rose-600 group-hover:scale-110 transition-transform" />
                                  <span className="underline decoration-rose-300 underline-offset-2">
                                    {parent.reference_no}
                                  </span>
                                  <Eye className="w-3 h-3 text-rose-500 opacity-60 group-hover:opacity-100" />
                                </button>
                              ) : group.parentInvoiceNo.startsWith('INV-') ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReceipt(group.parentInvoiceNo)}
                                  className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-100 text-slate-800 hover:bg-slate-200 border border-slate-300 transition-colors text-xs font-semibold cursor-pointer"
                                >
                                  <Receipt className="w-3.5 h-3.5 text-slate-600" />
                                  <span>{group.parentInvoiceNo}</span>
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-slate-700">
                                  {group.parentInvoiceNo}
                                </span>
                              )}
                              {hasChildren && (
                                <span className="text-[11px] text-gray-500 font-medium">
                                  {group.children.length} Pelunasan Terkait
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Kasir / Petugas Induk */}
                          <td className="px-4 py-3.5 whitespace-nowrap text-gray-700 font-medium">
                            {parent?.cashier_name || '-'}
                          </td>

                          {/* Tambah Utang Induk (+) */}
                          <td className="px-4 py-3.5 text-right font-bold text-rose-700 whitespace-nowrap">
                            {group.totalDebit > 0 ? `+${formatCurrency(group.totalDebit)}` : '-'}
                          </td>

                          {/* Total Pelunasan Kelompok (-) */}
                          <td className="px-4 py-3.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                            {group.totalPaid > 0 ? (
                              <div className="flex flex-col items-end">
                                <span>-{formatCurrency(group.totalPaid)}</span>
                                <span className="text-[10px] font-normal text-emerald-600">
                                  Total Terbayar
                                </span>
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>

                          {/* Sisa Utang Anggota & Sisa Tagihan Nota */}
                          <td className="px-4 py-3.5 text-right font-bold text-gray-900 whitespace-nowrap bg-gray-100/60">
                            <div>{formatCurrency(parent ? parent.running_debt : group.remainingDebt)}</div>
                            {parent && (
                              <div className="text-[10px] font-medium text-gray-500">
                                Sisa Nota: {formatCurrency(group.remainingDebt)}
                              </div>
                            )}
                          </td>

                          {/* Status Kelompok */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            {group.status === 'PAID' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                                LUNAS
                              </span>
                            ) : group.status === 'PARTIAL' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                <Clock className="w-3 h-3 text-amber-600" />
                                SEBAGIAN
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                BELUM LUNAS
                              </span>
                            )}
                          </td>

                          {/* Aksi */}
                          <td className="px-4 py-3.5 text-center whitespace-nowrap print:hidden">
                            {group.status !== 'PAID' && group.remainingDebt > 0 && memberPlan ? (
                              <button
                                type="button"
                                onClick={() => handleOpenScheduleForPlan(memberPlan)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                title="Buka Buku Bantu Angsuran Bon Toko anggota ini"
                              >
                                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Buku Bantu →</span>
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400 font-medium">-</span>
                            )}
                          </td>
                        </tr>

                        {/* CHILD PAYMENT ROWS */}
                        {!isCollapsed &&
                          group.children.map(child => {
                            const childParentInv = child.parent_invoice_no;
                            return (
                              <tr
                                key={child.id}
                                className="bg-white hover:bg-emerald-50/30 transition-colors text-xs sm:text-sm"
                              >
                                {/* Tree Connector */}
                                <td className="px-3 py-3 text-center text-gray-400 font-mono font-bold select-none">
                                  └─
                                </td>

                                {/* Tanggal & Jam Pelunasan */}
                                <td className="px-4 py-3 whitespace-nowrap text-gray-800">
                                  <div className="font-medium">
                                    {new Date(child.date).toLocaleDateString('id-ID', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(child.date).toLocaleTimeString('id-ID', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })} WIB
                                  </div>
                                </td>

                                {/* Identitas Angsuran */}
                                <td className="px-4 py-3">
                                  <div className="pl-3 border-l-2 border-emerald-300">
                                    <div className="font-medium text-gray-800">
                                      {child.period_number
                                        ? `Angsuran Periode Ke-${child.period_number}`
                                        : 'Pelunasan Bon'}
                                    </div>
                                    <div className="text-[11px] text-gray-500">
                                      {child.member_name}
                                    </div>
                                  </div>
                                </td>

                                {/* Jenis Mutasi Anak */}
                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Pelunasan Bon
                                  </span>
                                </td>

                                {/* No. Kwitansi & Badge Ref: INV-... */}
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex flex-col items-start gap-1">
                                    <span className="text-xs font-semibold text-gray-800 font-mono">
                                      {child.reference_no}
                                    </span>
                                    {childParentInv && (
                                      <button
                                        type="button"
                                        onClick={() => handleFilterByInvoice(childParentInv)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-[11px] font-semibold transition-colors cursor-pointer"
                                        title={`Filter hanya nota ${childParentInv}`}
                                      >
                                        <Link2 className="w-3 h-3 text-indigo-600" />
                                        <span>Ref: {childParentInv}</span>
                                      </button>
                                    )}
                                    {child.notes && (
                                      <span
                                        className="text-[11px] text-gray-500 truncate max-w-[210px]"
                                        title={child.notes}
                                      >
                                        {child.notes}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Petugas */}
                                <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                                  {child.cashier_name || 'Kasir Toko'}
                                </td>

                                {/* Tambah Utang (+) */}
                                <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap">
                                  -
                                </td>

                                {/* Pelunasan (-) */}
                                <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">
                                  {child.credit > 0 ? `-${formatCurrency(child.credit)}` : '-'}
                                </td>

                                {/* Sisa Utang Anggota Berjalan */}
                                <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap bg-gray-50/50">
                                  {formatCurrency(child.running_debt)}
                                </td>

                                {/* Status */}
                                <td className="px-4 py-3 text-center whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                                    LUNAS
                                  </span>
                                </td>

                                {/* Aksi */}
                                <td className="px-4 py-3 text-center whitespace-nowrap print:hidden">
                                  <span className="text-xs text-gray-400 font-medium">-</span>
                                </td>
                              </tr>
                            );
                          })}
                      </React.Fragment>
                    );
                  })
                ) : (
                  paginatedItems.map((item, idx) => {
                    const rowNumber = (currentPage - 1) * pageSize + idx + 1;
                    const isSale = item.source_type === 'sale';
                    const memberPlan = activePlanByMemberId.get(item.member_id);

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50/75 transition-colors text-xs sm:text-sm"
                      >
                        {/* No */}
                        <td className="px-4 py-3.5 text-center text-gray-500 font-medium">
                          {rowNumber}
                        </td>

                        {/* Tanggal & Jam */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-900">
                          <div className="font-medium">
                            {new Date(item.date).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(item.date).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })} WIB
                          </div>
                        </td>

                        {/* Anggota (NRP & Nama) */}
                        <td className="px-4 py-3.5">
                          <div className="font-semibold text-gray-900">
                            {item.member_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            NRP: {item.member_nrp} {item.member_tanggal_lahir ? `| Tgl Lahir: ${formatTanggalLahirWithAge(item.member_tanggal_lahir)}` : ''}
                          </div>
                        </td>

                        {/* Jenis Mutasi Badge */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {isSale ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <ShoppingCart className="w-3 h-3 text-rose-600" />
                              Belanja Bon POS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Pelunasan Bon
                            </span>
                          )}
                        </td>

                        {/* No. Bukti / Struk Kasir */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isSale ? (
                            <button
                              type="button"
                              onClick={() => handleOpenReceipt(item.reference_no)}
                              className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-rose-50 text-rose-800 hover:bg-rose-100 hover:text-rose-900 border border-rose-200 transition-colors text-xs font-medium cursor-pointer"
                              title="Klik untuk melihat rincian barang belanjaan"
                            >
                              <Receipt className="w-3.5 h-3.5 text-rose-600 group-hover:scale-110 transition-transform" />
                              <span className="underline decoration-rose-300 underline-offset-2">
                                {item.reference_no}
                              </span>
                              <Eye className="w-3 h-3 text-rose-500 opacity-60 group-hover:opacity-100" />
                            </button>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <span className="text-xs font-medium text-gray-800 font-mono">
                                {item.reference_no}
                              </span>
                              {item.parent_invoice_no && (
                                <button
                                  type="button"
                                  onClick={() => handleFilterByInvoice(item.parent_invoice_no!)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-[11px] font-semibold transition-colors cursor-pointer"
                                  title={`Filter hanya nota ${item.parent_invoice_no}`}
                                >
                                  <Link2 className="w-3 h-3 text-indigo-600" />
                                  <span>Ref: {item.parent_invoice_no}</span>
                                </button>
                              )}
                              <span className="text-[11px] text-gray-500 truncate max-w-[180px]" title={item.notes}>
                                {item.notes}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Kasir / Petugas */}
                        <td className="px-4 py-3.5 whitespace-nowrap text-gray-700">
                          {item.cashier_name || 'Kasir Toko'}
                        </td>

                        {/* Tambah Utang (Debet) */}
                        <td className="px-4 py-3.5 text-right font-semibold text-rose-700 whitespace-nowrap">
                          {item.debit > 0 ? `+${formatCurrency(item.debit)}` : '-'}
                        </td>

                        {/* Pelunasan (Kredit) */}
                        <td className="px-4 py-3.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                          {item.credit > 0 ? `-${formatCurrency(item.credit)}` : '-'}
                        </td>

                        {/* Sisa Saldo Utang Anggota */}
                        <td className="px-4 py-3.5 text-right font-bold text-gray-900 whitespace-nowrap bg-gray-50/50">
                          {formatCurrency(item.running_debt)}
                        </td>

                        {/* Status Tagihan */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {item.status === 'PAID' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700 border border-green-200">
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              LUNAS
                            </span>
                          ) : item.status === 'PARTIAL' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              SEBAGIAN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              BELUM LUNAS
                            </span>
                          )}
                        </td>

                        {/* Aksi: Arahkan ke Buku Bantu Angsuran */}
                        <td className="px-4 py-3.5 text-center whitespace-nowrap print:hidden">
                          {item.status !== 'PAID' && item.running_debt > 0 && memberPlan ? (
                            <button
                              type="button"
                              onClick={() => handleOpenScheduleForPlan(memberPlan)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                              title="Buka Buku Bantu Angsuran Bon Toko anggota ini"
                            >
                              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Buku Bantu →</span>
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400 font-medium">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {/* Table Footer: Total Akuntansi */}
              {filteredItems.length > 0 && !isLoading && (
                <tfoot className="bg-gray-100 font-semibold text-gray-900 border-t-2 border-gray-300">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right uppercase text-xs tracking-wider">
                      Total Periode Ini:
                    </td>
                    <td className="px-4 py-3 text-right text-rose-700 text-sm">
                      {formatCurrency(aggregatedTotals.totalDebit)}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-700 text-sm">
                      {formatCurrency(aggregatedTotals.totalCredit)}
                    </td>
                    <td className="px-4 py-3 text-right text-rose-900 text-sm font-bold bg-rose-50/50">
                      {formatCurrency(aggregatedTotals.netOutstanding)}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                  <tr className="bg-rose-50/40 text-xs text-gray-600 border-t border-gray-200">
                    <td colSpan={11} className="px-4 py-2 text-right">
                      <span className="text-gray-500 mr-2">Rekapitulasi Piutang:</span>
                      <span>Total Tambah Bon: <strong className="text-rose-700">{formatCurrency(aggregatedTotals.totalDebit)}</strong></span>
                      <span className="mx-2 text-gray-300">|</span>
                      <span>Total Pelunasan Masuk: <strong className="text-emerald-700">{formatCurrency(aggregatedTotals.totalCredit)}</strong></span>
                      <span className="mx-2 text-gray-300">|</span>
                      <span>Sisa Piutang Mengendap: <strong className="text-rose-900">{formatCurrency(aggregatedTotals.netOutstanding)}</strong></span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination Controls */}
          {activeTotalCount > 0 && (
            <div className="px-5 py-3.5 border-t border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 print:hidden">
              <div className="flex items-center gap-2">
                <span>Tampilkan</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded px-2 py-1 bg-white text-gray-900 focus:ring-1 focus:ring-rose-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>
                  {viewMode === 'grouped'
                    ? `nota per halaman (Total ${groupedLedger.length} nota, ${filteredItems.length} transaksi)`
                    : `baris per halaman (Total ${filteredItems.length} transaksi)`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span>
                  Halaman {currentPage} dari {totalPages}
                </span>
                <div className="inline-flex rounded-md shadow-sm">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 border border-gray-300 rounded-l-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 border-t border-b border-r border-gray-300 rounded-r-md bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
          </>
        ) : (
          /* ========================================================
             TABEL JADWAL ANGSURAN BON TOKO (POTONG GAJI)
          ======================================================== */
          <div className="space-y-4">
            {/* Search Bar for Installments */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>Rencana Angsuran Aktif &amp; Kartu Penagihan</span>
              </div>
              <div className="relative sm:w-80">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama atau NRP anggota..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Table Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Daftar Anggota dengan Angsuran Bon Toko Aktif
                  </h2>
                  <p className="text-xs text-gray-500">
                    Menampilkan {filteredPlans.length} anggota dengan rencana pemotongan gaji / pelunasan bertahap
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-100/75 text-gray-700 border-b border-gray-200">
                      <th className="py-3 px-4 font-semibold text-center w-12">No</th>
                      <th className="py-3 px-4 font-semibold">Anggota</th>
                      <th className="py-3 px-4 font-semibold text-right">Total Akumulasi Bon</th>
                      <th className="py-3 px-4 font-semibold text-center">Tenor Aktif</th>
                      <th className="py-3 px-4 font-semibold text-right">Potong Gaji / Bln</th>
                      <th className="py-3 px-4 font-semibold text-center">Progres Angsuran</th>
                      <th className="py-3 px-4 font-semibold text-right">Sisa Tagihan</th>
                      <th className="py-3 px-4 font-semibold text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150">
                    {filteredPlans.map((plan, idx) => {
                      const schedules = plan.schedules || [];
                      const paidCount = schedules.filter(
                        s => s.status === 'paid' || (s.paid_amount || 0) >= s.target_amount
                      ).length;
                      const totalCount = schedules.length || plan.tenor_months;
                      const remainingDebt = schedules.length > 0
                        ? schedules.reduce(
                            (acc, s) => acc + Math.max(0, s.target_amount - (s.paid_amount || 0)),
                            0
                          )
                        : plan.total_consolidated_debt;

                      return (
                        <tr key={plan.id} className="hover:bg-gray-50/75 transition-colors">
                          <td className="py-3 px-4 text-center text-gray-500">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-gray-900">{plan.anggota?.nama || 'Anggota'}</div>
                            <div className="text-[11px] text-gray-500">
                              NRP: {plan.anggota?.nrp || '-'}
                              {plan.anggota?.tanggal_lahir && ` • Tgl Lahir: ${formatTanggalLahirWithAge(plan.anggota.tanggal_lahir)}`}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-800">
                            {formatCurrency(plan.total_consolidated_debt)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                              {plan.tenor_months} Bln
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-700">
                            {formatCurrency(plan.monthly_installment)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center gap-1 font-semibold text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-800">
                              {paidCount} / {totalCount} Periode
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-rose-700">
                            {formatCurrency(remainingDebt)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenScheduleForPlan(plan)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>Buku Bantu Angsuran</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredPlans.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-12 text-center text-gray-500">
                          <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm font-medium">Tidak ada rencana angsuran bon toko aktif.</p>
                          <p className="text-xs text-gray-400 mt-1">
                            Semua tagihan lunas atau belum ada transaksi bon berkala yang dibuat di kasir POS.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL RINCIAN STRUK KASIR POS
        ======================================================== */}
        {isReceiptModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-200">
              <div className="px-6 py-4 bg-rose-800 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-rose-700/60 rounded-lg">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Rincian Struk Pembelian Bon</h3>
                    <p className="text-xs text-rose-200">Bukti Transaksi Belanja Bon Toko</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsReceiptModalOpen(false)}
                  className="text-rose-200 hover:text-white p-1 rounded-lg hover:bg-rose-700/50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
                {isLoadingSaleDetail ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-500">
                    <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
                    <span className="text-sm font-medium">Memuat data struk kasir...</span>
                  </div>
                ) : !selectedSaleDetail ? (
                  <div className="py-8 text-center text-gray-500">
                    <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                    <p className="text-sm">Rincian struk kasir tidak ditemukan di database.</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-gray-500">No. Struk Kasir:</span>
                        <span className="font-bold text-gray-900">{selectedSaleDetail.sale_number}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Waktu Transaksi:</span>
                        <span className="text-gray-900">
                          {new Date(selectedSaleDetail.created_at).toLocaleString('id-ID')}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pembeli (Anggota):</span>
                        <span className="font-semibold text-rose-800">
                          {selectedSaleDetail.member_name} ({selectedSaleDetail.member_nrp || '-'})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Petugas Kasir:</span>
                        <span className="text-gray-900">{selectedSaleDetail.cashier_name}</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                        Daftar Barang Belanjaan
                      </h4>
                      <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-gray-100 text-gray-700 font-semibold border-b border-gray-200">
                            <tr>
                              <th className="px-3 py-2">Nama Barang</th>
                              <th className="px-2 py-2 text-center w-14">Qty</th>
                              <th className="px-3 py-2 text-right">Harga</th>
                              <th className="px-3 py-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedSaleDetail.items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium text-gray-900">
                                  {item.product_name}
                                </td>
                                <td className="px-2 py-2 text-center text-gray-600">
                                  {item.quantity}
                                </td>
                                <td className="px-3 py-2 text-right text-gray-600">
                                  {formatCurrency(item.unit_price)}
                                </td>
                                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                  {formatCurrency(item.subtotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="bg-rose-50/60 p-4 rounded-xl border border-rose-200/60 space-y-2 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>Total Belanja:</span>
                        <span className="font-semibold">{formatCurrency(selectedSaleDetail.total_amount)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-rose-800 text-sm pt-2 border-t border-rose-200">
                        <span>Dibayar dengan Bon Toko:</span>
                        <span>{formatCurrency(selectedSaleDetail.paid_credit)}</span>
                      </div>
                      {selectedSaleDetail.paid_cash > 0 && (
                        <div className="flex justify-between text-emerald-700 font-medium">
                          <span>Dibayar Tunai Kasir:</span>
                          <span>{formatCurrency(selectedSaleDetail.paid_cash)}</span>
                        </div>
                      )}
                      {selectedSaleDetail.paid_deposit > 0 && (
                        <div className="flex justify-between text-blue-700 font-medium">
                          <span>Potong Simpanan Belanja:</span>
                          <span>{formatCurrency(selectedSaleDetail.paid_deposit)}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODAL BUKU BANTU ANGSURAN BON TOKO (StoreCreditScheduleModal)
        ======================================================== */}
        <StoreCreditScheduleModal
          isOpen={isScheduleModalOpen}
          plan={selectedPlanForSchedule}
          onClose={() => {
            setIsScheduleModalOpen(false);
            setSelectedPlanForSchedule(null);
          }}
          onSuccess={async () => {
            await loadLedgerData();
            try {
              const updatedPlans = await getActiveStoreCreditPlans();
              setActivePlans(updatedPlans || []);
              if (selectedPlanForSchedule) {
                const refreshed = (updatedPlans || []).find(p => p.id === selectedPlanForSchedule.id);
                setSelectedPlanForSchedule(refreshed || null);
              }
            } catch (pErr) {
              console.warn('Gagal refresh rencana angsuran aktif:', pErr);
            }
          }}
        />
      </div>
    </AdminLayout>
  );
}

