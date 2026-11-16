import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Calendar,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  History,
  Save,
  Info,
} from 'lucide-react';
import {
  MemberLebaranRate,
  SavingsRateResolver,
  getMemberLebaranRates,
  upsertMemberLebaranRate,
  deleteMemberLebaranRate,
  loadSavingsRateConfig,
  resolveMemberLebaranRateInfo,
} from '../../services/savingsRateService';
import { getLastCompletedLebaranCycle } from '../../services/bulkWithdrawalService';
import { formatCurrency } from '../../utils/formatCurrency';

export const MONTH_OPTIONS = [
  { value: 1, label: 'Januari' },
  { value: 2, label: 'Februari' },
  { value: 3, label: 'Maret' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mei' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'Agustus' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Desember' },
];

export const QUICK_LEBARAN_PRESETS = [100000, 200000, 300000, 400000, 500000];

export function getIndonesianMonthLabel(month?: number | null): string {
  const found = MONTH_OPTIONS.find((m) => m.value === Number(month));
  return found ? found.label : String(month || '-');
}

export function computeNextCycleStartPeriod(
  cutOffOrDisbursementDate?: string | null,
  fallbackDate: Date = new Date()
): { year: number; month: number; defaultLabel: string } {
  if (cutOffOrDisbursementDate) {
    const match = String(cutOffOrDisbursementDate).trim().match(/^(\d{4})-(\d{1,2})/);
    if (match) {
      const cy = parseInt(match[1], 10);
      const cm = parseInt(match[2], 10);
      if (!isNaN(cy) && !isNaN(cm) && cm >= 1 && cm <= 12) {
        const nextMonth = cm >= 12 ? 1 : cm + 1;
        const nextYear = cm >= 12 ? cy + 1 : cy;
        return {
          year: nextYear,
          month: nextMonth,
          defaultLabel: `Awal Siklus Lebaran ${nextYear}`,
        };
      }
    }
    const parsed = new Date(cutOffOrDisbursementDate);
    if (!isNaN(parsed.getTime())) {
      const cy = parsed.getFullYear();
      const cm = parsed.getMonth() + 1;
      const nextMonth = cm >= 12 ? 1 : cm + 1;
      const nextYear = cm >= 12 ? cy + 1 : cy;
      return {
        year: nextYear,
        month: nextMonth,
        defaultLabel: `Awal Siklus Lebaran ${nextYear}`,
      };
    }
  }

  const fbYear = fallbackDate.getFullYear();
  const fbMonth = fallbackDate.getMonth() + 1;
  return {
    year: fbYear,
    month: fbMonth,
    defaultLabel: `Awal Siklus Lebaran ${fbYear}`,
  };
}

export interface MemberLebaranRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: {
    id: string;
    nama: string;
    nrp?: string;
    pangkat?: string | null;
  } | null;
  onSuccess?: () => void;
  initialPersonalRates?: MemberLebaranRate[];
  initialGlobalRate?: number;
  initialEffectiveYear?: number;
  initialEffectiveMonth?: number;
}

export default function MemberLebaranRateModal({
  isOpen,
  onClose,
  member,
  onSuccess,
  initialPersonalRates,
  initialGlobalRate,
  initialEffectiveYear,
  initialEffectiveMonth,
}: MemberLebaranRateModalProps) {
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [loading, setLoading] = useState<boolean>(initialPersonalRates === undefined);
  const [saving, setSaving] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [personalRates, setPersonalRates] = useState<MemberLebaranRate[]>(initialPersonalRates || []);
  const [rateConfig, setRateConfig] = useState<SavingsRateResolver | null>(null);
  const [lastCycleInfo, setLastCycleInfo] = useState<{ cycleName?: string; cutOffDate?: string | null } | null>(null);

  const [effectiveYear, setEffectiveYear] = useState<number>(initialEffectiveYear ?? currentYear);
  const [effectiveMonth, setEffectiveMonth] = useState<number>(initialEffectiveMonth ?? currentMonth);
  const [monthlyRateInput, setMonthlyRateInput] = useState<string>('');
  const [cycleLabel, setCycleLabel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialPersonalRates) {
      setPersonalRates(initialPersonalRates);
    }
  }, [initialPersonalRates]);

  useEffect(() => {
    if (!isOpen || !member?.id) return;

    let isMounted = true;

    async function initialize() {
      setLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      try {
        const [rates, config, lastCycle] = await Promise.all([
          getMemberLebaranRates(member!.id, true).catch(() => [] as MemberLebaranRate[]),
          loadSavingsRateConfig().catch(() => null),
          getLastCompletedLebaranCycle().catch(() => null),
        ]);

        if (!isMounted) return;

        setPersonalRates(rates);
        setRateConfig(config);

        const rawCutOff = lastCycle?.cut_off_date || lastCycle?.disbursement_date || null;
        if (lastCycle) {
          setLastCycleInfo({
            cycleName: lastCycle.cycle_name,
            cutOffDate: rawCutOff,
          });
        } else {
          setLastCycleInfo(null);
        }

        const defaultStart = computeNextCycleStartPeriod(rawCutOff, new Date());
        if (initialEffectiveYear === undefined) {
          setEffectiveYear(defaultStart.year);
        }
        if (initialEffectiveMonth === undefined) {
          setEffectiveMonth(defaultStart.month);
        }
        setCycleLabel((prev) => prev || defaultStart.defaultLabel);

        const activeInfo = resolveMemberLebaranRateInfo(member!.id, currentYear, currentMonth, {
          globalTiers: config?.tiers,
          depositTypes: config?.depositTypes,
          memberLebaranRates: rates,
        });
        if (activeInfo.rate > 0) {
          setMonthlyRateInput((prev) => prev || String(activeInfo.rate));
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMsg(err?.message || 'Gagal memuat ketentuan Simpanan Lebaran anggota.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    initialize();

    return () => {
      isMounted = false;
    };
  }, [isOpen, member?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, saving, onClose]);

  const activeRateInfo = useMemo(() => {
    if (!member?.id) {
      return {
        rate: initialGlobalRate ?? 0,
        isPersonal: false,
        matchedPersonal: null,
        globalRate: initialGlobalRate ?? 0,
      };
    }

    const info = resolveMemberLebaranRateInfo(member.id, currentYear, currentMonth, {
      globalTiers: rateConfig?.tiers,
      depositTypes: rateConfig?.depositTypes,
      memberLebaranRates: personalRates,
    });

    if (initialGlobalRate !== undefined && info.globalRate === 0) {
      return {
        ...info,
        globalRate: initialGlobalRate,
        rate: info.isPersonal ? info.rate : initialGlobalRate,
      };
    }
    return info;
  }, [member?.id, currentYear, currentMonth, rateConfig, personalRates, initialGlobalRate]);

  const sortedHistoryDesc = useMemo(() => {
    return [...personalRates].sort((a, b) => {
      const idxA = Number(a.effective_year) * 12 + Number(a.effective_month);
      const idxB = Number(b.effective_year) * 12 + Number(b.effective_month);
      return idxB - idxA;
    });
  }, [personalRates]);

  if (!isOpen || !member) return null;

  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear - 2 + i);
  if (!yearOptions.includes(effectiveYear)) {
    yearOptions.push(effectiveYear);
    yearOptions.sort((a, b) => a - b);
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parsedRate = Number(String(monthlyRateInput).replace(/[^0-9]/g, ''));
    if (isNaN(parsedRate) || parsedRate <= 0) {
      setErrorMsg('Masukkan nominal Simpanan Lebaran per bulan yang valid (> Rp 0).');
      return;
    }

    setSaving(true);
    try {
      await upsertMemberLebaranRate({
        memberId: member.id,
        effectiveYear: Number(effectiveYear),
        effectiveMonth: Number(effectiveMonth),
        monthlyRate: parsedRate,
        cycleLabel: cycleLabel.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      const refreshed = await getMemberLebaranRates(member.id, true);
      setPersonalRates(refreshed);
      setNotes('');
      setSuccessMsg(
        `Ketentuan Simpanan Lebaran pribadi sebesar ${formatCurrency(parsedRate)}/bln mulai ${getIndonesianMonthLabel(
          effectiveMonth
        )} ${effectiveYear} berhasil disimpan (carry-forward aktif).`
      );
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan ketentuan Simpanan Lebaran pribadi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: MemberLebaranRate) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setDeletingId(item.id);
    try {
      await deleteMemberLebaranRate(item.id);
      const refreshed = await getMemberLebaranRates(member.id, true);
      setPersonalRates(refreshed);
      setSuccessMsg(
        `Ketentuan mulai ${getIndonesianMonthLabel(item.effective_month)} ${item.effective_year} berhasil dihapus.`
      );
      onSuccess?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menghapus ketentuan Simpanan Lebaran.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => !saving && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-lebaran-rate-modal-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-400/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="member-lebaran-rate-modal-title" className="text-base sm:text-lg font-bold tracking-tight">
                Pengaturan Simpanan Lebaran Pribadi
              </h2>
              <p className="text-xs text-slate-300 mt-0.5 flex items-center gap-2">
                {member.nrp && <span className="font-mono text-amber-300">NRP: {member.nrp}</span>}
                {member.nrp && <span>•</span>}
                <span className="font-semibold text-white">{member.nama}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/70">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
              <p className="text-sm text-slate-500 font-medium">
                Memuat konfigurasi tarif Simpanan Lebaran anggota...
              </p>
            </div>
          ) : (
            <>
              {/* Kartu Status Tarif Aktif Saat Ini */}
              <div
                data-testid="active-lebaran-rate-card"
                className={`rounded-xl border p-4 shadow-xs ${
                  activeRateInfo.isPersonal
                    ? 'bg-purple-50/80 border-purple-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                      Tarif Simpanan Lebaran Berlaku Saat Ini ({getIndonesianMonthLabel(currentMonth)} {currentYear})
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-extrabold text-slate-900">
                        {formatCurrency(activeRateInfo.rate)}
                      </span>
                      <span className="text-xs font-medium text-slate-500">/ bulan</span>
                    </div>
                  </div>

                  {activeRateInfo.isPersonal && activeRateInfo.matchedPersonal ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                      <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      Ketentuan Pribadi Anggota (Berlaku sejak{' '}
                      {getIndonesianMonthLabel(activeRateInfo.matchedPersonal.effective_month)}{' '}
                      {activeRateInfo.matchedPersonal.effective_year})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
                      <Info className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      Mengikuti Tarif Global Pengaturan ({formatCurrency(activeRateInfo.globalRate)})
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                  Jika anggota menetapkan besaran Simpanan Lebaran pribadi mulai awal siklus, nominal tersebut{' '}
                  <strong>otomatis terbawa (carry-forward)</strong> ke siklus-siklus berikutnya hingga anggota mengajukan perubahan baru.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* Form Penetapan Besaran Simpanan Lebaran Baru */}
              <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      Tetapkan Besaran Simpanan Lebaran Pribadi
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {lastCycleInfo?.cutOffDate
                        ? `Default otomatis mengacu pada bulan setelah pencairan terakhir (${lastCycleInfo.cycleName || lastCycleInfo.cutOffDate})`
                        : 'Berlaku mulai bulan dan tahun yang dipilih serta terbawa otomatis (carry-forward)'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mulai Berlaku (Bulan) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={effectiveMonth}
                      onChange={(e) => setEffectiveMonth(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    >
                      {MONTH_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Mulai Berlaku (Tahun) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={effectiveYear}
                      onChange={(e) => setEffectiveYear(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nominal Iuran Lebaran per Bulan (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    required
                    value={monthlyRateInput}
                    onChange={(e) => setMonthlyRateInput(e.target.value)}
                    placeholder="Contoh: 350000"
                    className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {QUICK_LEBARAN_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMonthlyRateInput(String(preset))}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer ${
                          Number(monthlyRateInput) === preset
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-purple-50 hover:border-purple-200'
                        }`}
                      >
                        {formatCurrency(preset)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Keterangan / Siklus Lebaran
                    </label>
                    <input
                      type="text"
                      value={cycleLabel}
                      onChange={(e) => setCycleLabel(e.target.value)}
                      placeholder="Contoh: Awal Siklus Lebaran 1448H / 2027"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Catatan Tambahan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Misal: Permintaan anggota untuk rencana mudik"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Simpan Ketentuan Lebaran
                  </button>
                </div>
              </form>

              {/* Tabel Riwayat Ketentuan Simpanan Lebaran Pribadi */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Riwayat Ketentuan Simpanan Lebaran Pribadi
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    {sortedHistoryDesc.length} entri
                  </span>
                </div>

                {sortedHistoryDesc.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Belum ada ketentuan Simpanan Lebaran pribadi. Saat ini mengikuti tarif global pada menu Pengaturan ({formatCurrency(activeRateInfo.globalRate)}/bln).
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                          <th className="py-2.5 px-4 font-semibold">Mulai Berlaku</th>
                          <th className="py-2.5 px-4 font-semibold text-right">Nominal / Bulan</th>
                          <th className="py-2.5 px-4 font-semibold">Siklus &amp; Catatan</th>
                          <th className="py-2.5 px-4 font-semibold text-center w-20">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedHistoryDesc.map((item) => {
                          const isActive =
                            activeRateInfo.matchedPersonal && activeRateInfo.matchedPersonal.id === item.id;
                          return (
                            <tr key={item.id} className={isActive ? 'bg-purple-50/40' : 'hover:bg-slate-50'}>
                              <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                                  <span>
                                    {getIndonesianMonthLabel(item.effective_month)} {item.effective_year}
                                  </span>
                                  {isActive && (
                                    <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                                      Aktif
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                                {formatCurrency(item.monthly_rate)}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600">
                                <div className="font-medium text-slate-700">{item.cycle_label || '-'}</div>
                                {item.notes && <div className="text-[11px] text-slate-500">{item.notes}</div>}
                              </td>
                              <td className="py-2.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDelete(item)}
                                  disabled={deletingId === item.id}
                                  title="Hapus ketentuan ini"
                                  className="inline-flex items-center justify-center p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {deletingId === item.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
