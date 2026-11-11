import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import {
  getKoperasiProfile,
  updateKoperasiProfile,
  isTableMigratedInSupabase,
  KoperasiProfile,
  DEFAULT_KOPERASI_PROFILE,
  getLoanSettings,
  updateLoanSettings,
  DEFAULT_MIN_REMAINING_THP,
  DEFAULT_RAT_NOTES
} from '../../services/settingsService';
import { uploadLogoToCloudinary } from '../../services/cloudinaryService';
import {
  Store,
  MapPin,
  Phone,
  Monitor,
  FileText,
  Save,
  RotateCcw,
  Sparkles,
  ReceiptText,
  Database,
  AlertTriangle,
  Upload,
  Trash2,
  Image as ImageIcon,
  Layers,
  Plus,
  X,
  Calendar,
  ShieldCheck
} from 'lucide-react';
import {
  getRateTiers,
  addRateTier,
  deleteRateTier,
  SavingsRateTier
} from '../../services/savingsRateService';

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const formatRupiah = (val: number): string => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(val);
};

export const formatPeriod = (tier: SavingsRateTier): string => {
  const startStr = `${MONTH_NAMES[tier.start_month - 1] || tier.start_month} ${tier.start_year}`;
  if (!tier.end_year || !tier.end_month) {
    return `${startStr} - Seterusnya`;
  }
  const endStr = `${MONTH_NAMES[tier.end_month - 1] || tier.end_month} ${tier.end_year}`;
  return `${startStr} - ${endStr}`;
};

export const getDepositTypeBadge = (code: string) => {
  switch ((code || '').toUpperCase()) {
    case 'POKOK':
    case 'SP':
      return {
        label: 'Simpanan Pokok',
        className: 'bg-blue-50 text-blue-700 border-blue-200'
      };
    case 'WAJIB':
      return {
        label: 'Simpanan Wajib',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
      };
    case 'BELANJA':
      return {
        label: 'Simpanan Belanja',
        className: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    case 'LEBARAN':
      return {
        label: 'Simpanan Lebaran',
        className: 'bg-purple-50 text-purple-700 border-purple-200'
      };
    default:
      return {
        label: code,
        className: 'bg-slate-50 text-slate-700 border-slate-200'
      };
  }
};

export const isTierActive = (tier: SavingsRateTier): boolean => {
  const now = new Date();
  const currentIdx = now.getFullYear() * 12 + (now.getMonth() + 1);
  const startIdx = tier.start_year * 12 + tier.start_month;
  const endIdx = tier.end_year && tier.end_month ? tier.end_year * 12 + tier.end_month : Infinity;
  return currentIdx >= startIdx && currentIdx <= endIdx;
};

export interface PengaturanKoperasiProps {
  initialLoading?: boolean;
  initialRateTiers?: SavingsRateTier[];
  initialAddModalOpen?: boolean;
  initialTierCode?: string;
  initialMinRemainingThp?: number;
  initialMinThpRatNotes?: string;
}

export default function PengaturanKoperasi({
  initialLoading = false,
  initialRateTiers,
  initialAddModalOpen = false,
  initialTierCode,
  initialMinRemainingThp,
  initialMinThpRatNotes
}: PengaturanKoperasiProps = {}) {
  const { showToast } = useFeedback();

  const [form, setForm] = useState<KoperasiProfile>(DEFAULT_KOPERASI_PROFILE);
  const [initialData, setInitialData] = useState<KoperasiProfile>(DEFAULT_KOPERASI_PROFILE);
  const [isLoading, setIsLoading] = useState(initialLoading);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocalOnly, setIsLocalOnly] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loan Eligibility Policy (RAT) State
  const [minRemainingThp, setMinRemainingThp] = useState<number>(
    initialMinRemainingThp ?? DEFAULT_MIN_REMAINING_THP
  );
  const [minThpRatNotes, setMinThpRatNotes] = useState<string>(
    initialMinThpRatNotes ?? DEFAULT_RAT_NOTES
  );
  const [isSavingLoanSettings, setIsSavingLoanSettings] = useState<boolean>(false);

  // Savings Rate Tiers State
  const [rateTiers, setRateTiers] = useState<SavingsRateTier[]>(initialRateTiers || []);
  const [isLoadingTiers, setIsLoadingTiers] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(initialAddModalOpen);
  const [isSubmittingTier, setIsSubmittingTier] = useState(false);
  const [newTierForm, setNewTierForm] = useState({
    deposit_type_code: initialTierCode || 'WAJIB',
    start_year: new Date().getFullYear(),
    start_month: new Date().getMonth() + 1,
    is_forever: true,
    end_year: new Date().getFullYear() + 1,
    end_month: 12,
    monthly_rate: '',
    notes: ''
  });

  useEffect(() => {
    loadProfile();
    loadRateTiers();
    loadLoanSettings();
  }, []);

  const loadLoanSettings = async () => {
    try {
      const data = await getLoanSettings(true);
      if (data) {
        setMinRemainingThp(data.minRemainingThp);
        setMinThpRatNotes(data.ratNotes);
      }
    } catch (err: any) {
      console.error('Failed to load loan settings:', err);
    }
  };

  const handleSaveLoanSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(minRemainingThp);
    if (isNaN(val) || val <= 0) {
      showToast('Batas minimum sisa THP harus lebih besar dari Rp 0', 'warning');
      return;
    }

    setIsSavingLoanSettings(true);
    try {
      const res = await updateLoanSettings({
        minRemainingThp: val,
        ratNotes: minThpRatNotes.trim()
      });

      if (res.success && res.data) {
        if (res.data.min_remaining_thp) {
          setMinRemainingThp(res.data.min_remaining_thp);
        }
        if (res.data.min_thp_rat_notes !== undefined) {
          setMinThpRatNotes(res.data.min_thp_rat_notes);
        }
        showToast('Kebijakan kelayakan pinjaman berhasil diperbarui!', 'success');
      } else {
        showToast(res.error || 'Gagal menyimpan kebijakan kelayakan pinjaman', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem saat menyimpan kebijakan', 'error');
    } finally {
      setIsSavingLoanSettings(false);
    }
  };

  const loadRateTiers = async () => {
    setIsLoadingTiers(true);
    try {
      const data = await getRateTiers(undefined, true);
      setRateTiers(data);
    } catch (err: any) {
      console.error('Failed to load rate tiers:', err);
    } finally {
      setIsLoadingTiers(false);
    }
  };

  const handleAddTierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Number(newTierForm.monthly_rate);
    if (!rate || rate <= 0) {
      showToast('Nominal tarif iuran harus lebih besar dari 0', 'warning');
      return;
    }
    if (!newTierForm.is_forever) {
      const startIdx = Number(newTierForm.start_year) * 12 + Number(newTierForm.start_month);
      const endIdx = Number(newTierForm.end_year) * 12 + Number(newTierForm.end_month);
      if (endIdx < startIdx) {
        showToast('Periode akhir tidak boleh lebih awal dari periode mulai', 'warning');
        return;
      }
    }

    setIsSubmittingTier(true);
    try {
      await addRateTier({
        deposit_type_code: newTierForm.deposit_type_code,
        start_year: Number(newTierForm.start_year),
        start_month: Number(newTierForm.start_month),
        end_year: newTierForm.is_forever ? null : Number(newTierForm.end_year),
        end_month: newTierForm.is_forever ? null : Number(newTierForm.end_month),
        monthly_rate: rate,
        notes: newTierForm.notes.trim() || undefined
      });
      showToast('Tarif simpanan baru berhasil ditambahkan!', 'success');
      setIsAddModalOpen(false);
      setNewTierForm({
        deposit_type_code: 'WAJIB',
        start_year: new Date().getFullYear(),
        start_month: new Date().getMonth() + 1,
        is_forever: true,
        end_year: new Date().getFullYear() + 1,
        end_month: 12,
        monthly_rate: '',
        notes: ''
      });
      await loadRateTiers();
    } catch (err: any) {
      showToast(err.message || 'Gagal menambahkan tarif simpanan baru', 'error');
    } finally {
      setIsSubmittingTier(false);
    }
  };

  const handleDeleteTier = async (tier: SavingsRateTier) => {
    const badge = getDepositTypeBadge(tier.deposit_type_code);
    const confirmMsg = `Hapus pengaturan tarif ${badge.label} (${formatRupiah(tier.monthly_rate)}) periode ${formatPeriod(tier)}?`;
    if (!window.confirm(confirmMsg)) {
      return;
    }
    try {
      await deleteRateTier(tier.id);
      setRateTiers(prev => prev.filter(t => t.id !== tier.id));
      showToast('Tarif berhasil dihapus', 'success');
      await loadRateTiers();
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus tarif simpanan', 'error');
    }
  };

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const isMigrated = await isTableMigratedInSupabase();
      setIsLocalOnly(!isMigrated);

      const data = await getKoperasiProfile(true);
      setForm(data);
      setInitialData(data);
    } catch (err: any) {
      showToast('Gagal memuat profil koperasi', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleReset = () => {
    setForm(initialData);
    showToast('Form dikembalikan ke data tersimpan', 'info');
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    try {
      const uploadedUrl = await uploadLogoToCloudinary(file);
      const updatedForm: KoperasiProfile = { ...form, logo_url: uploadedUrl };
      setForm(updatedForm);

      const res = await updateKoperasiProfile(updatedForm);
      if (res.success && res.data) {
        setInitialData(res.data);
        showToast('Logo koperasi berhasil diunggah dan disimpan!', 'success');
      } else {
        showToast(res.error || 'Gagal menyimpan logo ke database profil', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal mengunggah logo', 'error');
    } finally {
      setIsUploadingLogo(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async () => {
    if (!form.logo_url) return;

    setIsUploadingLogo(true);
    try {
      const updatedForm: KoperasiProfile = { ...form, logo_url: null };
      setForm(updatedForm);

      const res = await updateKoperasiProfile(updatedForm);
      if (res.success && res.data) {
        setInitialData(res.data);
        showToast('Logo koperasi berhasil dihapus', 'info');
      } else {
        showToast(res.error || 'Gagal menghapus logo dari profil', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menghapus logo', 'error');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nama_koperasi.trim()) {
      showToast('Nama koperasi tidak boleh kosong', 'warning');
      return;
    }
    if (!form.alamat.trim()) {
      showToast('Alamat koperasi tidak boleh kosong', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateKoperasiProfile(form);
      if (res.success && res.data) {
        setForm(res.data);
        setInitialData(res.data);

        if (res.isLocalFallback) {
          setIsLocalOnly(true);
          showToast('Profil tersimpan di penyimpanan lokal browser. Database belum termigrasi.', 'warning');
        } else {
          setIsLocalOnly(false);
          showToast('Profil koperasi & header struk berhasil diperbarui ke database!', 'success');
        }
      } else {
        showToast(res.error || 'Gagal menyimpan profil koperasi', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Page Title & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2.5">
              <Store className="w-7 h-7 text-indigo-600" />
              Pengaturan Profil Koperasi & Header Struk
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Atur identitas resmi koperasi yang akan dicetak pada seluruh struk kasir POS (Thermal, PDF, dan WhatsApp).
            </p>
          </div>
        </div>

        {/* Database Migration Notice Banner */}
        {isLocalOnly && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3.5 text-amber-900 shadow-xs transition-all">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-700 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="text-sm space-y-1">
              <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Mode Penyimpanan Lokal Aktif (Tabel Database Belum Dibuat)
              </div>
              <p className="text-amber-800 text-xs leading-relaxed">
                Tabel <code className="bg-amber-200/60 px-1 py-0.5 rounded text-[11px] font-mono font-semibold">public.koperasi_profile</code> belum ditemukan di skema Supabase aktif.
                Perubahan yang Anda simpan tetap berfungsi normal melalui penyimpanan lokal browser (localStorage) pada perangkat ini.
              </p>
              <p className="text-amber-700 text-xs">
                Untuk menyinkronkan profil ke database cloud Supabase, jalankan migrasi SQL:{' '}
                <code className="bg-amber-200/80 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold text-amber-950">
                  supabase/migrations/017_create_koperasi_profile.sql
                </code>
              </p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="bg-white p-12 rounded-xl shadow-xs border border-slate-200 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-3" />
            <p className="text-sm text-slate-500">Memuat profil koperasi...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Logo & Form Identitas */}
            <div className="lg:col-span-7 space-y-6">
              {/* Logo Card */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5 text-indigo-600" />
                    <h2 className="font-semibold text-slate-800">Logo Resmi Koperasi</h2>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 font-medium rounded-full border border-indigo-100">
                    Branding
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                    {/* Box Preview Logo */}
                    <div className="shrink-0">
                      {form.logo_url ? (
                        <div className="relative group">
                          <img
                            src={form.logo_url}
                            alt="Logo Koperasi"
                            className="w-24 h-24 object-contain rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
                          />
                        </div>
                      ) : (
                        <div className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center p-2 text-center text-slate-400">
                          <ImageIcon className="w-8 h-8 mb-1 stroke-1" />
                          <span className="text-[10px] font-medium leading-tight">Belum ada logo</span>
                        </div>
                      )}
                    </div>

                    {/* Info & Action Controls */}
                    <div className="flex-1 space-y-3 text-center sm:text-left">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-800">Identitas Visual & Branding</h3>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                          Format: PNG, JPG, WEBP, atau SVG (Maksimal 2MB). Logo resmi ini otomatis ditampilkan di portal login dan struk belanja kasir.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-1">
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleLogoFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={handleTriggerUpload}
                          disabled={isUploadingLogo}
                          className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          {isUploadingLogo ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Mengunggah Logo...</span>
                            </>
                          ) : (
                            <>
                              <Upload className="w-3.5 h-3.5" />
                              <span>Unggah Logo Baru</span>
                            </>
                          )}
                        </button>

                        {form.logo_url && (
                          <button
                            type="button"
                            onClick={handleRemoveLogo}
                            disabled={isUploadingLogo}
                            className="px-3 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 disabled:opacity-50 rounded-lg transition-colors border border-rose-200/60 flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus Logo</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Identitas Koperasi */}
              <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-indigo-600" />
                    <h2 className="font-semibold text-slate-800">Form Identitas Koperasi</h2>
                  </div>
                  <span className="text-xs px-2.5 py-1 bg-indigo-50 text-indigo-700 font-medium rounded-full border border-indigo-100">
                    Konfigurasi POS
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* Nama Koperasi */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-slate-400" />
                    Nama Resmi Koperasi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="nama_koperasi"
                    value={form.nama_koperasi}
                    onChange={handleChange}
                    required
                    placeholder="Contoh: KOPERASI PRIMKOPPOL"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all font-medium text-slate-800"
                  />
                  <p className="text-xs text-slate-400 mt-1">Ditampilkan tebal pada baris teratas struk transaksi.</p>
                </div>

                {/* Alamat Lengkap */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    Alamat Lengkap Kantor / Toko <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    name="alamat"
                    rows={3}
                    value={form.alamat}
                    onChange={handleChange}
                    required
                    placeholder="Contoh: Jl. Jaksa Agung Suprapto No. 10, Ngawi"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                  />
                  <p className="text-xs text-slate-400 mt-1">Alamat dapat terdiri dari beberapa baris tanpa membuat teks menumpuk.</p>
                </div>

                {/* Telepon & Terminal Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Phone className="w-4 h-4 text-slate-400" />
                      Nomor Telepon / WhatsApp
                    </label>
                    <input
                      type="text"
                      name="telepon"
                      value={form.telepon}
                      onChange={handleChange}
                      placeholder="Contoh: (0354)7654321 atau 08123456789"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Monitor className="w-4 h-4 text-slate-400" />
                      Nama / ID Terminal POS
                    </label>
                    <input
                      type="text"
                      name="terminal_name"
                      value={form.terminal_name}
                      onChange={handleChange}
                      placeholder="Contoh: POS Terminal #01"
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                    />
                  </div>
                </div>

                {/* Catatan Footer Struk */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-400" />
                    Catatan Kaki Struk (Footer Notes)
                  </label>
                  <textarea
                    name="footer_notes"
                    rows={2}
                    value={form.footer_notes}
                    onChange={handleChange}
                    placeholder="Contoh: Barang yang sudah dibeli tidak dapat ditukar/dikembalikan"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all text-slate-800"
                  />
                  <p className="text-xs text-slate-400 mt-1">Dicetak di bagian bawah struk tepat sebelum ucapan terima kasih.</p>
                </div>

                {/* Submit Actions */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </button>
                </div>
              </form>
            </div>
            </div>

            {/* Live Preview Column */}
            <div className="lg:col-span-5 space-y-3 sticky top-6">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                <ReceiptText className="w-4 h-4 text-slate-400" />
                Live Preview Mini Struk Thermal (80mm)
              </div>

              {/* Thermal Receipt Paper Card */}
              <div className="bg-white p-5 rounded-2xl border-2 border-dashed border-slate-300 shadow-md font-mono text-[11px] text-slate-800 max-w-sm mx-auto">
                {/* Header */}
                <div className="text-center pb-3 border-b border-dashed border-slate-300 space-y-1">
                  {form.logo_url && (
                    <div className="flex justify-center mb-1.5">
                      <img
                        src={form.logo_url}
                        alt="Logo Koperasi"
                        className="w-10 h-10 object-contain"
                      />
                    </div>
                  )}
                  <div className="font-bold text-[13px] leading-tight text-slate-900 break-words">
                    {form.nama_koperasi || 'NAMA KOPERASI'}
                  </div>
                  <div className="text-[10px] text-slate-600 leading-normal break-words whitespace-pre-line">
                    {form.alamat || 'Alamat Koperasi Belum Diatur'}
                  </div>
                  {(form.telepon || form.terminal_name) && (
                    <div className="text-[9.5px] text-slate-500 pt-0.5 flex flex-wrap items-center justify-center gap-x-2">
                      {form.telepon && <span>Telp: {form.telepon}</span>}
                      {form.telepon && form.terminal_name && <span>|</span>}
                      {form.terminal_name && <span>{form.terminal_name}</span>}
                    </div>
                  )}
                </div>

                {/* Metadata */}
                <div className="py-2.5 border-b border-dashed border-slate-300 text-[10px] text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>No. Trx :</span>
                    <span className="font-bold text-slate-900">INV-PREVIEW-01</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Waktu   :</span>
                    <span>{new Date().toLocaleDateString('id-ID')} 12:30</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kasir   :</span>
                    <span>Kasir Utama</span>
                  </div>
                </div>

                {/* Items */}
                <div className="py-2.5 border-b border-dashed border-slate-300 space-y-1.5 text-[10.5px]">
                  <div>
                    <div className="font-bold text-slate-900">Minyak Goreng 2L</div>
                    <div className="flex justify-between text-slate-500 text-[9.5px]">
                      <span>1 pch x Rp 34.000</span>
                      <span className="font-semibold text-slate-800">Rp 34.000</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Beras Rojolele 5kg</div>
                    <div className="flex justify-between text-slate-500 text-[9.5px]">
                      <span>1 sak x Rp 75.000</span>
                      <span className="font-semibold text-slate-800">Rp 75.000</span>
                    </div>
                  </div>
                </div>

                {/* Total */}
                <div className="py-2.5 space-y-1 text-[10.5px]">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span>Rp 109.000</span>
                  </div>
                  <div className="flex justify-between font-bold text-[12px] pt-1 border-t border-slate-200 text-slate-900">
                    <span>TOTAL:</span>
                    <span>Rp 109.000</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-dashed border-slate-300 text-center space-y-1 text-[9.5px] text-slate-500">
                  {form.footer_notes && (
                    <div className="text-slate-600 italic break-words whitespace-pre-line mb-1">
                      {form.footer_notes}
                    </div>
                  )}
                  <div>Terima kasih atas kunjungan Anda</div>
                  <div className="text-[8.5px] text-slate-400">Simpan struk ini sebagai bukti pembayaran</div>
                </div>
              </div>
            </div>
          </div>

          {/* Rate Tiers Configuration Card */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-800 text-base">Konfigurasi Tarif Iuran Simpanan Bertingkat</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Atur penyesuaian nominal iuran bulanan simpanan anggota per rentang periode (misal: penyesuaian tarif Simpanan Wajib pasca RAT).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Tambah Kenaikan Tarif</span>
              </button>
            </div>

            <div className="p-6">
              {/* Anti-overlap banner hint */}
              <div className="mb-4 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-slate-700">Proteksi Anti-Overlap Otomatis:</span> Saat Anda menambahkan tarif baru yang berlaku seterusnya, sistem otomatis menutup periode tarif lama sebelumnya tepat satu bulan sebelum periode tarif baru dimulai.
                </div>
              </div>

              {isLoadingTiers ? (
                <div className="py-8 text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mb-2" />
                  <p className="text-xs text-slate-500">Memuat konfigurasi tarif...</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Jenis Simpanan</th>
                        <th className="py-3 px-4">Rentang Periode</th>
                        <th className="py-3 px-4">Nominal Bulanan</th>
                        <th className="py-3 px-4">Catatan / No. SK</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rateTiers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            Belum ada data tarif simpanan bertingkat.
                          </td>
                        </tr>
                      ) : (
                        rateTiers.map(tier => {
                          const badge = getDepositTypeBadge(tier.deposit_type_code);
                          const active = isTierActive(tier);
                          return (
                            <tr key={tier.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold border ${badge.className}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-medium text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                  <span>{formatPeriod(tier)}</span>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 font-bold text-slate-900">
                                {formatRupiah(tier.monthly_rate)}
                                {(tier.deposit_type_code === 'POKOK' || tier.deposit_type_code === 'SP') && (
                                  <span className="text-[10px] text-slate-400 font-normal block">(Sekali Bayar / Awal)</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                                {tier.notes || '-'}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {active ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    Aktif
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                    Riwayat
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTier(tier)}
                                  title="Hapus tarif ini"
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Kebijakan Kelayakan Pinjaman (Keputusan RAT) */}
          <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-800 text-base">Kebijakan Kelayakan Pinjaman (Keputusan RAT)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Atur ambang batas minimum sisa gaji (Take Home Pay) per bulan bagi anggota yang mengajukan pinjaman sesuai ketetapan RAT.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveLoanSettings} className="p-6 space-y-5">
              <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3.5 text-xs text-emerald-800 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-emerald-900">Validasi Otomatis Kelayakan:</span> Setiap pengajuan pinjaman baru akan divalidasi secara real-time. Jika sisa gaji anggota (THP dikurangi total angsuran) berada di bawah ambang batas ini, sistem akan menolak pengajuan pinjaman demi menjaga kesehatan finansial anggota.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Batas Minimum Sisa THP */}
                <div>
                  <label htmlFor="minRemainingThp" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Batas Minimum Sisa THP (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-xs font-semibold text-slate-400 pointer-events-none">
                      Rp
                    </span>
                    <input
                      id="minRemainingThp"
                      name="minRemainingThp"
                      type="number"
                      min="1"
                      step="50000"
                      required
                      value={minRemainingThp || ''}
                      onChange={(e) => setMinRemainingThp(Number(e.target.value))}
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all font-semibold text-slate-800"
                      placeholder="1500000"
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Preview Nominal:</span>
                    <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {formatRupiah(minRemainingThp || 0)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Default standar koperasi adalah Rp 1.500.000 (dapat disesuaikan berdasarkan hasil keputusan RAT).
                  </p>
                </div>

                {/* Catatan Keputusan / Ketetapan RAT */}
                <div>
                  <label htmlFor="minThpRatNotes" className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Catatan Keputusan / Nomor SK RAT
                  </label>
                  <div className="relative">
                    <input
                      id="minThpRatNotes"
                      name="minThpRatNotes"
                      type="text"
                      value={minThpRatNotes}
                      onChange={(e) => setMinThpRatNotes(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all text-slate-800"
                      placeholder="Contoh: Keputusan RAT Tahun Buku 2025 No. 04/RAT/2026"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Keterangan nomor ketetapan atau berita acara RAT sebagai referensi audit kepatuhan.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={isSavingLoanSettings}
                  className="px-5 py-2.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSavingLoanSettings ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Menyimpan Kebijakan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Simpan Kebijakan Kelayakan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Modal Dialog Form Tambah Kenaikan Tarif Simpanan */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Tambah Kenaikan Tarif Simpanan</h3>
                  <p className="text-xs text-slate-500">Konfigurasi nominal iuran berjenjang untuk periode waktu tertentu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleAddTierSubmit} className="p-6 space-y-4 text-sm">
              {/* Jenis Simpanan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Jenis Simpanan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={newTierForm.deposit_type_code}
                  onChange={e => setNewTierForm({ ...newTierForm, deposit_type_code: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium text-slate-800"
                >
                  <option value="POKOK">Simpanan Pokok</option>
                  <option value="WAJIB">Simpanan Wajib</option>
                  <option value="BELANJA">Simpanan Belanja</option>
                  <option value="LEBARAN">Simpanan Hari Raya (Lebaran)</option>
                </select>
              </div>

              {/* Periode Mulai */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Periode Mulai Berlaku <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Bulan Mulai</label>
                    <select
                      value={newTierForm.start_month}
                      onChange={e => setNewTierForm({ ...newTierForm, start_month: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800"
                    >
                      {MONTH_NAMES.map((name, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Tahun Mulai</label>
                    <input
                      type="number"
                      min="2000"
                      max="2100"
                      value={newTierForm.start_year}
                      onChange={e => setNewTierForm({ ...newTierForm, start_year: Number(e.target.value) })}
                      required
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800 font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Berlaku Seterusnya Checkbox */}
              <div className="pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTierForm.is_forever}
                    onChange={e => setNewTierForm({ ...newTierForm, is_forever: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">Berlaku Seterusnya (Open-Ended)</span>
                </label>
                <p className="text-[11px] text-slate-400 ml-6.5 mt-0.5">
                  Tarif aktif terus digunakan hingga ada penyesuaian tarif berikutnya di masa depan.
                </p>
              </div>

              {/* Periode Akhir (Hanya jika is_forever == false) */}
              {!newTierForm.is_forever && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Periode Akhir Berlaku <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Bulan Akhir</label>
                      <select
                        value={newTierForm.end_month}
                        onChange={e => setNewTierForm({ ...newTierForm, end_month: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800"
                      >
                        {MONTH_NAMES.map((name, idx) => (
                          <option key={idx + 1} value={idx + 1}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Tahun Akhir</label>
                      <input
                        type="number"
                        min="2000"
                        max="2100"
                        value={newTierForm.end_year}
                        onChange={e => setNewTierForm({ ...newTierForm, end_year: Number(e.target.value) })}
                        required
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800 font-medium"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Nominal Iuran Baru */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {newTierForm.deposit_type_code === 'POKOK'
                    ? 'Nominal Simpanan Pokok Baru (Rp) '
                    : 'Nominal Iuran Bulanan Baru (Rp) '}
                  <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-xs font-semibold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={newTierForm.monthly_rate}
                    onChange={e => setNewTierForm({ ...newTierForm, monthly_rate: e.target.value })}
                    required
                    placeholder={newTierForm.deposit_type_code === 'POKOK' ? 'Contoh: 100000' : 'Contoh: 200000'}
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800 font-semibold"
                  />
                </div>
              </div>

              {/* Catatan / Dasar Keputusan */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Catatan / Dasar Keputusan (Opsional)
                </label>
                <input
                  type="text"
                  value={newTierForm.notes}
                  onChange={e => setNewTierForm({ ...newTierForm, notes: e.target.value })}
                  placeholder="Contoh: Kenaikan tarif berdasarkan RAT Tahun Buku 2024"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 text-slate-800"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={isSubmittingTier}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTier}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmittingTier ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Simpan Tarif</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  </AdminLayout>
  );
}

export { PengaturanKoperasi };

