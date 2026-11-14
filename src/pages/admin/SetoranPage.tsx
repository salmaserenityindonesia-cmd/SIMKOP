import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Building2,
  Calendar,
  CheckCircle2,
  CheckSquare,
  CreditCard,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Square,
  UserCheck,
  Wallet,
} from 'lucide-react';
import AdminLayout from '../../components/layout/AdminLayout';
import SetoranReceiptModal from '../../components/setoran/SetoranReceiptModal';
import { useFeedback } from '../../context/FeedbackContext';
import { supabase } from '../../lib/supabaseClient';
import { Anggota, getAnggota } from '../../services/koperasiService';
import {
  calculateMemberCumulativeBills,
  FULL_MONTH_NAMES,
  MemberBillingItem,
  MemberBillingSummary,
  processMemberPayment,
  ReceiptPayload,
  SetoranPaymentMethod,
} from '../../services/setoranService';
import { formatCurrency } from '../../utils/formatCurrency';

interface FifoPreviewEntry {
  label: string;
  allocated: number;
  isArrears: boolean;
}

function computeFifoPreview(item: MemberBillingItem, payAmount: number): FifoPreviewEntry[] {
  if (payAmount <= 0) return [];
  const sorted = [...item.unpaidMonths].sort((a, b) => a.periodIndex - b.periodIndex);
  let remaining = payAmount;
  const result: FifoPreviewEntry[] = [];

  for (const m of sorted) {
    if (remaining <= 0) break;
    const alloc = Math.min(remaining, m.remaining);
    if (alloc > 0) {
      result.push({
        label: m.label,
        allocated: alloc,
        isArrears: m.isArrears,
      });
      remaining -= alloc;
    }
  }
  return result;
}

export const SetoranPage: React.FC = () => {
  const { showToast } = useFeedback();

  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const [members, setMembers] = useState<Anggota[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMember, setSelectedMember] = useState<Anggota | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const memberDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        memberDropdownRef.current &&
        !memberDropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const [billingSummary, setBillingSummary] = useState<MemberBillingSummary | null>(null);
  const [loadingBills, setLoadingBills] = useState<boolean>(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({});
  const [payAmounts, setPayAmounts] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<SetoranPaymentMethod>('tunai');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [cashierInfo, setCashierInfo] = useState<{ id: string | null; name: string }>({
    id: null,
    name: 'Admin SIMKOP',
  });

  const [activeReceipt, setActiveReceipt] = useState<ReceiptPayload | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptPayload | null>(null);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(2023, currentYear - 2);
    const endYear = currentYear + 2;
    const years: number[] = [];
    for (let y = startYear; y <= endYear; y += 1) {
      years.push(y);
    }
    return years;
  }, []);

  // Load current operator profile & members list on mount
  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        setLoadingMembers(true);
        const [anggotaList, authRes] = await Promise.all([
          getAnggota(),
          supabase.auth.getUser(),
        ]);

        if (!active) return;
        setMembers(anggotaList || []);

        const user = authRes?.data?.user;
        if (user) {
          const { data: profile } = await supabase
            .from('pengelola')
            .select('nama')
            .eq('id', user.id)
            .maybeSingle();

          if (active) {
            setCashierInfo({
              id: user.id,
              name:
                profile?.nama ||
                user.user_metadata?.nama ||
                user.email ||
                'Admin SIMKOP',
            });
          }
        }
      } catch (err: any) {
        if (active) {
          showToast(
            `Gagal memuat daftar anggota: ${err?.message || 'Unknown error'}`,
            'error'
          );
        }
      } finally {
        if (active) setLoadingMembers(false);
      }
    };

    init();
    return () => {
      active = false;
    };
  }, [showToast]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members.slice(0, 30);
    return members
      .filter((m) => {
        const nama = (m.nama || '').toLowerCase();
        const nrp = (m.nrp || '').toLowerCase();
        const pangkat = (m.pangkat || '').toLowerCase();
        return nama.includes(q) || nrp.includes(q) || pangkat.includes(q);
      })
      .slice(0, 30);
  }, [members, searchQuery]);

  const loadMemberBills = useCallback(
    async (member: Anggota, year: number, month: number) => {
      setLoadingBills(true);
      setBillingError(null);
      try {
        const summary = await calculateMemberCumulativeBills(member, year, month);
        setBillingSummary(summary);

        const nextChecked: Record<string, boolean> = {};
        const nextAmounts: Record<string, number> = {};
        for (const item of summary.items) {
          nextChecked[item.id] = item.totalDue > 0;
          nextAmounts[item.id] = item.totalDue;
        }
        setCheckedIds(nextChecked);
        setPayAmounts(nextAmounts);
      } catch (err: any) {
        const message = err?.message || 'Gagal menghitung tagihan anggota.';
        setBillingError(message);
        showToast(message, 'error');
      } finally {
        setLoadingBills(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (selectedMember) {
      loadMemberBills(selectedMember, selectedYear, selectedMonth);
    } else {
      setBillingSummary(null);
      setCheckedIds({});
      setPayAmounts({});
    }
  }, [selectedMember, selectedYear, selectedMonth, loadMemberBills]);

  const handleSelectMember = (member: Anggota) => {
    setSelectedMember(member);
    setSearchQuery(`${member.nama} (${member.nrp})`);
    setIsDropdownOpen(false);
  };

  const handleToggleItem = (item: MemberBillingItem) => {
    setCheckedIds((prev) => {
      const nextVal = !prev[item.id];
      if (nextVal && (!payAmounts[item.id] || payAmounts[item.id] <= 0)) {
        setPayAmounts((curr) => ({ ...curr, [item.id]: item.totalDue }));
      }
      return { ...prev, [item.id]: nextVal };
    });
  };

  const handleAmountChange = (item: MemberBillingItem, rawValue: string) => {
    const digitsOnly = rawValue.replace(/[^0-9]/g, '');
    const parsed = digitsOnly ? parseInt(digitsOnly, 10) : 0;
    const clamped = Math.min(Math.max(0, parsed), item.totalDue);
    setPayAmounts((prev) => ({ ...prev, [item.id]: clamped }));
  };

  const handleSelectAll = (checked: boolean) => {
    if (!billingSummary) return;
    const nextChecked: Record<string, boolean> = {};
    const nextAmounts: Record<string, number> = { ...payAmounts };
    for (const item of billingSummary.items) {
      nextChecked[item.id] = checked;
      if (checked && (!nextAmounts[item.id] || nextAmounts[item.id] <= 0)) {
        nextAmounts[item.id] = item.totalDue;
      }
    }
    setCheckedIds(nextChecked);
    setPayAmounts(nextAmounts);
  };

  const selectedPayableEntries = useMemo(() => {
    if (!billingSummary) return [];
    return billingSummary.items
      .filter((item) => checkedIds[item.id])
      .map((item) => ({
        item,
        payAmount: Math.max(0, Number(payAmounts[item.id] ?? 0)),
      }))
      .filter((entry) => entry.payAmount > 0);
  }, [billingSummary, checkedIds, payAmounts]);

  const totalSelectedPay = useMemo(() => {
    return selectedPayableEntries.reduce((sum, entry) => sum + entry.payAmount, 0);
  }, [selectedPayableEntries]);

  const handleProcessPayment = async () => {
    if (!selectedMember) {
      showToast('Pilih anggota terlebih dahulu.', 'error');
      return;
    }
    if (selectedPayableEntries.length === 0 || totalSelectedPay <= 0) {
      showToast('Pilih minimal satu tagihan dengan nominal lebih dari Rp 0.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const receipt = await processMemberPayment({
        member: {
          id: selectedMember.id,
          nama: selectedMember.nama,
          nrp: selectedMember.nrp,
          pangkat: selectedMember.pangkat,
        },
        items: selectedPayableEntries,
        paymentMethod,
        cashierId: cashierInfo.id,
        cashierName: cashierInfo.name,
        selectedYear,
        selectedMonth,
      });

      setLastReceipt(receipt);
      setActiveReceipt(receipt);
      showToast(
        `Pembayaran ${formatCurrency(receipt.totalPaid)} (${receipt.paymentMethodLabel}) berhasil dicatat!`,
        'success'
      );

      await loadMemberBills(selectedMember, selectedYear, selectedMonth);
    } catch (err: any) {
      showToast(
        `Gagal memproses pembayaran: ${err?.message || 'Terjadi kesalahan'}`,
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPeriodLabel = `${FULL_MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Pusat Pembayaran Anggota
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Hitung tagihan tunggakan pasca cut-off hingga bulan terpilih dengan alokasi otomatis{' '}
                <span className="font-semibold text-slate-700">FIFO</span> &amp; cetak kwitansi resmi.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {lastReceipt ? (
              <button
                type="button"
                onClick={() => setActiveReceipt(lastReceipt)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4 text-emerald-600" />
                Lihat Kwitansi Terakhir ({lastReceipt.receiptNo})
              </button>
            ) : null}
          </div>
        </div>

        {/* Member Search + Period Filter Bar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            {/* Searchable Member Selector */}
            <div ref={memberDropdownRef} className="lg:col-span-7 relative">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Cari &amp; Pilih Anggota (Nama / NRP)
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setIsDropdownOpen(true);
                    if (selectedMember && e.target.value === '') {
                      setSelectedMember(null);
                    }
                  }}
                  placeholder={
                    loadingMembers
                      ? 'Memuat daftar anggota...'
                      : 'Ketik nama atau NRP anggota...'
                  }
                  className="w-full pl-10 pr-24 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedMember(null);
                      setIsDropdownOpen(true);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-100 cursor-pointer"
                  >
                    Ganti
                  </button>
                ) : null}
              </div>

              {isDropdownOpen && !loadingMembers ? (
                <div className="absolute z-30 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100">
                  {filteredMembers.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500">
                      Tidak ada anggota yang cocok dengan &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    filteredMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectMember(m)}
                        className={`w-full text-left px-4 py-2.5 hover:bg-emerald-50 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                          selectedMember?.id === m.id ? 'bg-emerald-50/80' : ''
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-900">
                            {m.nama}
                          </div>
                          <div className="text-xs text-slate-500">
                            NRP: <span className="font-mono">{m.nrp}</span>
                            {m.pangkat ? ` • ${m.pangkat}` : ''}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-emerald-700 shrink-0">
                          Pilih
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            {/* Target Billing Month */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Sampai Bulan
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                >
                  {FULL_MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Billing Year */}
            <div className="lg:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Tahun
              </label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Trigger */}
            <div className="lg:col-span-1">
              <button
                type="button"
                disabled={!selectedMember || loadingBills}
                onClick={() =>
                  selectedMember &&
                  loadMemberBills(selectedMember, selectedYear, selectedMonth)
                }
                title="Muat ulang tagihan"
                className="w-full inline-flex items-center justify-center py-2.5 px-3 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 ${loadingBills ? 'animate-spin' : ''}`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Empty Selection State */}
        {!selectedMember ? (
          <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center">
            <UserCheck className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <h2 className="text-base font-bold text-slate-800">
              Pilih Anggota Terlebih Dahulu
            </h2>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              Gunakan kolom pencarian di atas untuk memilih anggota. Sistem akan otomatis
              mengagregasi tunggakan pasca cut-off sampai periode{' '}
              <span className="font-semibold text-slate-700">{selectedPeriodLabel}</span>.
            </p>
          </div>
        ) : loadingBills ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">
              Menghitung tagihan kumulatif pasca cut-off untuk {selectedMember.nama}...
            </p>
          </div>
        ) : billingError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-rose-900">Gagal Memuat Tagihan</h3>
              <p className="text-sm text-rose-700 mt-1">{billingError}</p>
            </div>
          </div>
        ) : billingSummary ? (
          <>
            {/* Member & Cumulative Summary KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Anggota Terpilih
                </span>
                <div className="text-base font-extrabold text-slate-900 mt-1 truncate">
                  {billingSummary.member.nama}
                </div>
                <div className="text-xs text-slate-500 font-mono mt-0.5">
                  NRP: {billingSummary.member.nrp}
                  {billingSummary.member.pangkat ? ` • ${billingSummary.member.pangkat}` : ''}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Total Tagihan s/d {selectedPeriodLabel}
                </span>
                <div className="text-xl font-extrabold text-slate-900 font-mono mt-1">
                  {formatCurrency(billingSummary.totalTagihan)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {billingSummary.items.length} pos kewajiban aktif
                </div>
              </div>

              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                  Tunggakan Lampau
                </span>
                <div className="text-xl font-extrabold text-amber-800 font-mono mt-1">
                  {formatCurrency(billingSummary.totalTunggakan)}
                </div>
                <div className="text-[11px] text-amber-700/90 mt-0.5">
                  {billingSummary.savingsCutoffDate
                    ? `Pasca cut-off: ${billingSummary.savingsCutoffDate}`
                    : 'Periode sebelum bulan terpilih'}
                </div>
              </div>

              <div className="bg-sky-50/70 border border-sky-200 rounded-2xl p-4 shadow-xs">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-700">
                  Kewajiban Bulan Ini
                </span>
                <div className="text-xl font-extrabold text-sky-900 font-mono mt-1">
                  {formatCurrency(billingSummary.totalBulanIni)}
                </div>
                <div className="text-[11px] text-sky-700 mt-0.5">
                  Periode {selectedPeriodLabel}
                </div>
              </div>
            </div>

            {/* Main Checkout Split: Left Item Breakdown, Right Payment Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Bill Cards */}
              <div className="lg:col-span-8 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600">
                    Rincian Tagihan Simpanan &amp; Pinjaman
                  </h2>
                  {billingSummary.items.length > 0 ? (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleSelectAll(true)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
                      >
                        Pilih Semua
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectAll(false)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-500 cursor-pointer"
                      >
                        Kosongkan
                      </button>
                    </div>
                  ) : null}
                </div>

                {billingSummary.items.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                    <h3 className="text-base font-bold text-emerald-900">
                      Semua Kewajiban Lunas!
                    </h3>
                    <p className="text-sm text-emerald-700 mt-1">
                      Tidak ada tunggakan atau tagihan belum lunas untuk{' '}
                      <span className="font-semibold">{billingSummary.member.nama}</span> s/d{' '}
                      <span className="font-semibold">{selectedPeriodLabel}</span>.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {billingSummary.items.map((item) => {
                      const isChecked = Boolean(checkedIds[item.id]);
                      const currentPay = Number(payAmounts[item.id] ?? 0);
                      const fifoPreview =
                        isChecked && currentPay > 0 && currentPay < item.totalDue
                          ? computeFifoPreview(item, currentPay)
                          : [];

                      return (
                        <div
                          key={item.id}
                          className={`bg-white rounded-2xl border transition-all p-4 sm:p-5 ${
                            isChecked
                              ? 'border-emerald-500 ring-2 ring-emerald-500/10 shadow-xs'
                              : 'border-slate-200 opacity-85'
                          }`}
                        >
                          {/* Card Top Row */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <button
                              type="button"
                              onClick={() => handleToggleItem(item)}
                              className="flex items-start gap-3 text-left cursor-pointer"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                              )}
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-base font-bold text-slate-900">
                                    {item.name}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${
                                      item.category === 'loan'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                        : item.category === 'pokok'
                                        ? 'bg-violet-50 text-violet-700 border border-violet-200'
                                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                                    }`}
                                  >
                                    {item.category === 'loan'
                                      ? 'Pinjaman'
                                      : item.category === 'pokok'
                                      ? 'Simpanan Pokok'
                                      : 'Simpanan Rutin'}
                                  </span>
                                </div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                  {item.arrearsAmount > 0 ? (
                                    <span className="text-amber-700 font-semibold">
                                      Tunggakan: {formatCurrency(item.arrearsAmount)}
                                    </span>
                                  ) : null}
                                  {item.arrearsAmount > 0 && item.currentMonthAmount > 0
                                    ? ' • '
                                    : null}
                                  {item.currentMonthAmount > 0 ? (
                                    <span className="text-sky-700 font-semibold">
                                      Bulan Ini: {formatCurrency(item.currentMonthAmount)}
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </button>

                            <div className="text-left sm:text-right pl-8 sm:pl-0">
                              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                                Total Sisa Tagihan
                              </div>
                              <div className="text-lg font-extrabold font-mono text-slate-900">
                                {formatCurrency(item.totalDue)}
                              </div>
                            </div>
                          </div>

                          {/* Monthly Breakdown Badges */}
                          <div className="mt-3.5 pl-0 sm:pl-8 flex flex-wrap gap-2">
                            {item.unpaidMonths.map((m) => (
                              <span
                                key={`${item.id}-${m.periodIndex}-${m.scheduleId || m.label}`}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                                  m.statusLabel === 'Kewajiban Pokok'
                                    ? 'bg-violet-50 text-violet-800 border-violet-200'
                                    : m.isArrears
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-sky-50 text-sky-800 border-sky-200'
                                }`}
                              >
                                <span>
                                  {m.label} ({m.statusLabel}):
                                </span>
                                <span className="font-mono font-bold">
                                  {formatCurrency(m.remaining)}
                                </span>
                                {m.paidAmount > 0 ? (
                                  <span className="text-[10px] opacity-80">
                                    (Cicil)
                                  </span>
                                ) : null}
                              </span>
                            ))}
                          </div>

                          {/* Editable Pay Amount Input (Shown when Checked) */}
                          {isChecked ? (
                            <div className="mt-4 pt-3.5 border-t border-slate-100 pl-0 sm:pl-8 space-y-2.5">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <label
                                  htmlFor={`pay-input-${item.id}`}
                                  className="text-xs font-bold text-slate-700"
                                >
                                  Nominal Dibayar (Rp)
                                </label>

                                <div className="flex flex-wrap items-center gap-2">
                                  {item.unpaidMonths.length > 1 ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPayAmounts((prev) => ({
                                          ...prev,
                                          [item.id]: item.unpaidMonths[0].remaining,
                                        }))
                                      }
                                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                                    >
                                      1 Bulan Tertua ({formatCurrency(item.unpaidMonths[0].remaining)})
                                    </button>
                                  ) : null}

                                  {currentPay !== item.totalDue ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPayAmounts((prev) => ({
                                          ...prev,
                                          [item.id]: item.totalDue,
                                        }))
                                      }
                                      className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[11px] font-semibold text-emerald-700 cursor-pointer"
                                    >
                                      Bayar Penuh
                                    </button>
                                  ) : null}

                                  <div className="relative w-48">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                      Rp
                                    </span>
                                    <input
                                      id={`pay-input-${item.id}`}
                                      type="text"
                                      inputMode="numeric"
                                      value={currentPay ? currentPay.toLocaleString('id-ID') : '0'}
                                      onChange={(e) => handleAmountChange(item, e.target.value)}
                                      className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-300 text-right font-mono text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Partial FIFO Preview */}
                              {fifoPreview.length > 0 ? (
                                <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl px-3 py-2 text-xs text-amber-900">
                                  <span className="font-bold">Alokasi FIFO Otomatis: </span>
                                  {fifoPreview
                                    .map(
                                      (entry) =>
                                        `${entry.label} (${formatCurrency(entry.allocated)})`
                                    )
                                    .join(' + ')}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Settled Obligations Reference */}
                {billingSummary.settledItems.length > 0 ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-slate-700">
                      Sudah lunas s/d {selectedPeriodLabel}:
                    </span>
                    <span>
                      {billingSummary.settledItems.map((s) => s.name).join(', ')}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Right Column: Checkout Summary & Payment Method Selector */}
              <div className="lg:col-span-4 lg:sticky lg:top-6">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-5">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                    <CreditCard className="w-5 h-5 text-emerald-600" />
                    <h2 className="text-base font-extrabold text-slate-900">
                      Ringkasan Pembayaran
                    </h2>
                  </div>

                  {/* Selected Lines Summary */}
                  <div className="space-y-2 text-xs">
                    {selectedPayableEntries.length === 0 ? (
                      <p className="text-slate-400 italic py-2">
                        Belum ada tagihan yang dicentang untuk dibayar.
                      </p>
                    ) : (
                      selectedPayableEntries.map(({ item, payAmount }) => (
                        <div
                          key={`sum-${item.id}`}
                          className="flex items-center justify-between gap-2 text-slate-700"
                        >
                          <span className="truncate font-medium">{item.name}</span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">
                            {formatCurrency(payAmount)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-200 flex items-baseline justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Total Pembayaran
                    </span>
                    <span className="text-2xl font-extrabold font-mono text-emerald-700">
                      {formatCurrency(totalSelectedPay)}
                    </span>
                  </div>

                  {/* Explicit Payment Method Selector: Tunai vs Transfer Bank */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                      Metode Pembayaran
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('tunai')}
                        aria-pressed={paymentMethod === 'tunai'}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
                          paymentMethod === 'tunai'
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Banknote className="w-4 h-4 shrink-0" />
                        <span>Tunai</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMethod('transfer_bank')}
                        aria-pressed={paymentMethod === 'transfer_bank'}
                        className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all cursor-pointer ${
                          paymentMethod === 'transfer_bank'
                            ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span>Transfer Bank</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Dicatat ke riwayat setoran &amp; kwitansi sebagai{' '}
                      <span className="font-bold text-slate-700">
                        {paymentMethod === 'transfer_bank' ? 'Transfer Bank' : 'Tunai'}
                      </span>
                      .
                    </p>
                  </div>

                  {/* Submit Action */}
                  <button
                    type="button"
                    disabled={submitting || totalSelectedPay <= 0}
                    onClick={handleProcessPayment}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Memproses Pembayaran...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Proses Pembayaran
                      </>
                    )}
                  </button>

                  <p className="text-[11px] text-center text-slate-400">
                    Petugas kasir: <span className="font-semibold text-slate-600">{cashierInfo.name}</span>
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Printable & Downloadable Receipt Modal */}
      <SetoranReceiptModal
        receipt={activeReceipt}
        isOpen={Boolean(activeReceipt)}
        onClose={() => setActiveReceipt(null)}
      />
    </AdminLayout>
  );
};

export const TerimaSetoran = SetoranPage;
export default SetoranPage;
