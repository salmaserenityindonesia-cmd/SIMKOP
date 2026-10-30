import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import {
  getPosSettings,
  updatePosSettings,
  cleanupExpiredParkedSales,
  isPosSettingsMigratedInSupabase,
  POSSettings,
  DEFAULT_POS_SETTINGS
} from '../../services/posSettingsService';
import {
  SlidersHorizontal,
  Clock,
  PackageCheck,
  Save,
  RotateCcw,
  Sparkles,
  Database,
  AlertTriangle,
  RefreshCw,
  Keyboard,
  ShieldAlert,
  Info,
  Percent,
  Printer
} from 'lucide-react';

export default function PengaturanKasir() {
  const { showToast } = useFeedback();

  const [form, setForm] = useState<POSSettings>(DEFAULT_POS_SETTINGS);
  const [initialData, setInitialData] = useState<POSSettings>(DEFAULT_POS_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isLocalOnly, setIsLocalOnly] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const isMigrated = await isPosSettingsMigratedInSupabase();
      setIsLocalOnly(!isMigrated);

      const data = await getPosSettings(true);
      const normalizedData: POSSettings = {
        ...data,
        receipt_paper_size: data.receipt_paper_size || '80mm'
      };
      setForm(normalizedData);
      setInitialData(normalizedData);
    } catch (err: any) {
      showToast('Gagal memuat pengaturan kasir', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDurationPreset = (minutes: number) => {
    setForm(prev => ({ ...prev, max_hold_duration_minutes: minutes }));
  };

  const handleDiscountPreset = (pct: number) => {
    setForm(prev => ({ ...prev, member_discount_percentage: pct }));
  };

  const handleReset = () => {
    setForm({
      ...initialData,
      receipt_paper_size: initialData.receipt_paper_size || '80mm'
    });
    showToast('Form dikembalikan ke data tersimpan', 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (form.max_hold_duration_minutes < 5) {
      showToast('Batas waktu penahanan minimal adalah 5 menit', 'warning');
      return;
    }
    if (form.max_hold_duration_minutes > 10080) { // 7 hari
      showToast('Batas waktu penahanan maksimal adalah 7 hari (10080 menit)', 'warning');
      return;
    }
    if (
      form.member_discount_percentage === undefined ||
      form.member_discount_percentage === null ||
      isNaN(form.member_discount_percentage) ||
      form.member_discount_percentage < 0 ||
      form.member_discount_percentage > 100
    ) {
      showToast('Persentase diskon harus berada di antara 0% dan 100%', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updatePosSettings(form);
      if (res.success && res.data) {
        setForm(res.data);
        setInitialData(res.data);

        if (res.isLocalFallback) {
          setIsLocalOnly(true);
          showToast('Pengaturan tersimpan di penyimpanan lokal browser. Database belum termigrasi.', 'warning');
        } else {
          setIsLocalOnly(false);
          showToast('Pengaturan transaksi kasir POS berhasil diperbarui!', 'success');
        }
      } else {
        showToast(res.error || 'Gagal menyimpan pengaturan kasir', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem saat menyimpan', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualCleanup = async () => {
    setIsCleaning(true);
    try {
      const res = await cleanupExpiredParkedSales();
      if (res.success) {
        if (res.cleanedCount > 0) {
          showToast(`Berhasil membersihkan ${res.cleanedCount} transaksi kadaluwarsa & stok dikembalikan!`, 'success');
        } else {
          showToast('Tidak ada transaksi ditahan yang kadaluwarsa.', 'info');
        }
      } else {
        showToast(res.error || 'Gagal menjalankan pembersihan otomatis', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal memproses pembersihan stok', 'error');
    } finally {
      setIsCleaning(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-outline-variant/30">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-primary/10 text-primary">
                <SlidersHorizontal className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-on-surface tracking-tight">
                  Pengaturan Transaksi Kasir (POS)
                </h1>
                <p className="text-xs sm:text-sm text-on-surface-variant">
                  Konfigurasi durasi penahanan transaksi belanja, pemulihan stok otomatis, dan parameter operasional POS.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualCleanup}
              disabled={isCleaning}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary border border-outline-variant/40 flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
              title="Bersihkan transaksi kadaluwarsa dan kembalikan stok sekarang"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin' : ''}`} />
              <span>{isCleaning ? 'Membersihkan...' : 'Bersihkan Kadaluwarsa'}</span>
            </button>

            <button
              type="button"
              onClick={loadSettings}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/30 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Muat ulang pengaturan"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Database Migration Alert Banner */}
        {isLocalOnly && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3 shadow-sm animate-in fade-in duration-300">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm space-y-1">
              <div className="font-semibold flex items-center gap-2">
                <span>Mode Penyimpanan Lokal Aktif (Tabel `pos_settings` Belum Terdeteksi di Database)</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                Pengaturan kasir saat ini disimpan di browser lokal (localStorage). Agar pengaturan tersinkronisasi lintas perangkat dan fungsi auto-expire database berjalan otomatis, jalankan berkas migrasi SQL berikut di Supabase SQL Editor:
              </p>
              <code className="inline-block mt-1 px-2.5 py-1 rounded bg-amber-500/20 text-amber-950 dark:text-amber-100 font-mono text-[11px] font-medium border border-amber-500/30">
                supabase/migrations/018_pos_settings_and_parked_auto_expire.sql
              </code>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <h2 className="text-sm font-bold text-on-surface">Parameter Transaksi, Diskon & Inventori</h2>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  Hotkeys & Rules
                </span>
              </div>

              <div className="p-6 space-y-6">
                {/* Hold Duration Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    <span>Batas Waktu Tahan Transaksi (Menit)</span>
                    <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="max_hold_duration_minutes"
                      min={5}
                      max={10080}
                      step={5}
                      value={form.max_hold_duration_minutes || ''}
                      onChange={e => setForm(prev => ({ ...prev, max_hold_duration_minutes: parseInt(e.target.value) || 0 }))}
                      disabled={isLoading || isSaving}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-16"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs text-on-surface-variant font-medium">
                      menit
                    </div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    Waktu maksimal belanjaan dapat ditahan (parked) sebelum secara otomatis dibatalkan dan stok dikembalikan ke etalase.
                  </p>

                  {/* Preset Pills */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      { label: '15 Menit', val: 15 },
                      { label: '30 Menit', val: 30 },
                      { label: '1 Jam', val: 60 },
                      { label: '2 Jam (Default)', val: 120 },
                      { label: '4 Jam', val: 240 },
                      { label: '1 Hari', val: 1440 },
                    ].map(preset => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => handleDurationPreset(preset.val)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          form.max_hold_duration_minutes === preset.val
                            ? 'bg-primary text-surface-container-lowest border-primary shadow-sm'
                            : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-outline-variant/20" />

                {/* Member Discount Percentage Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                    <Percent className="w-3.5 h-3.5 text-primary" />
                    <span>Persentase Diskon Khusus Anggota (%)</span>
                    <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="member_discount_percentage"
                      min={0}
                      max={100}
                      step={0.1}
                      value={form.member_discount_percentage ?? ''}
                      onChange={e => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        setForm(prev => ({ ...prev, member_discount_percentage: isNaN(val) ? 0 : val }));
                      }}
                      disabled={isLoading || isSaving}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all pr-12"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-xs text-on-surface-variant font-medium">
                      %
                    </div>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    Diskon otomatis yang diterapkan pada subtotal belanja kasir POS jika pembeli teridentifikasi sebagai anggota koperasi.
                  </p>

                  {/* Preset Pills */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      { label: '0% (Nonaktif)', val: 0 },
                      { label: '2.5%', val: 2.5 },
                      { label: '5% (Standar)', val: 5 },
                      { label: '7.5%', val: 7.5 },
                      { label: '10%', val: 10 },
                    ].map(preset => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => handleDiscountPreset(preset.val)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          form.member_discount_percentage === preset.val
                            ? 'bg-primary text-surface-container-lowest border-primary shadow-sm'
                            : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <hr className="border-outline-variant/20" />

                {/* Thermal Printer Paper Size Switcher */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                      <Printer className="w-3.5 h-3.5 text-primary" />
                      <span>Format Ukuran Kertas Printer Thermal Kasir</span>
                      <span className="text-error">*</span>
                    </label>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {(form.receipt_paper_size || '80mm') === '58mm' ? '58 mm (Kompak)' : '80 mm (Standar)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">
                    Pilih standar lebar kertas printer kasir POS untuk menyesuaikan layout struk, kepadatan font, dan pemotongan baris produk secara presisi.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Option 58mm */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => !isLoading && !isSaving && setForm(prev => ({ ...prev, receipt_paper_size: '58mm' }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          !isLoading && !isSaving && setForm(prev => ({ ...prev, receipt_paper_size: '58mm' }));
                        }
                      }}
                      className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        (form.receipt_paper_size || '80mm') === '58mm'
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container hover:border-outline-variant/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Printer className={`w-4 h-4 ${(form.receipt_paper_size || '80mm') === '58mm' ? 'text-primary' : 'text-on-surface-variant'}`} />
                          <span className="text-xs font-bold text-on-surface">Kertas 58 mm</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          (form.receipt_paper_size || '80mm') === '58mm'
                            ? 'bg-primary text-surface-container-lowest'
                            : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          Kompak / Mini
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed mb-2">
                        Printer thermal portable/Bluetooth atau mini USB (~32 karakter per baris). Format hemat kertas dengan nama produk dan harga bersusun rapi.
                      </p>
                      <div className="mt-auto pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[10px] text-on-surface-variant">
                        <span>Kapasitas: ~32 Karakter</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          (form.receipt_paper_size || '80mm') === '58mm'
                            ? 'border-primary bg-primary'
                            : 'border-outline-variant'
                        }`}>
                          {(form.receipt_paper_size || '80mm') === '58mm' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Option 80mm */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => !isLoading && !isSaving && setForm(prev => ({ ...prev, receipt_paper_size: '80mm' }))}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          !isLoading && !isSaving && setForm(prev => ({ ...prev, receipt_paper_size: '80mm' }));
                        }
                      }}
                      className={`relative flex flex-col p-4 rounded-xl border-2 cursor-pointer transition-all ${
                        (form.receipt_paper_size || '80mm') === '80mm'
                          ? 'border-primary bg-primary/5 shadow-xs'
                          : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container hover:border-outline-variant/60'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Printer className={`w-4 h-4 ${(form.receipt_paper_size || '80mm') === '80mm' ? 'text-primary' : 'text-on-surface-variant'}`} />
                          <span className="text-xs font-bold text-on-surface">Kertas 80 mm</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          (form.receipt_paper_size || '80mm') === '80mm'
                            ? 'bg-primary text-surface-container-lowest'
                            : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          Standar Desktop
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant leading-relaxed mb-2">
                        Printer thermal kasir desktop standar (~48 karakter per baris). Tampilan lega, tata letak kuantitas dan harga sejajar komprehensif.
                      </p>
                      <div className="mt-auto pt-2 border-t border-outline-variant/20 flex items-center justify-between text-[10px] text-on-surface-variant">
                        <span>Kapasitas: ~48 Karakter</span>
                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                          (form.receipt_paper_size || '80mm') === '80mm'
                            ? 'border-primary bg-primary'
                            : 'border-outline-variant'
                        }`}>
                          {(form.receipt_paper_size || '80mm') === '80mm' && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <hr className="border-outline-variant/20" />

                {/* Negative Stock Toggle */}
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-surface-container-low/50 border border-outline-variant/25">
                  <div className="space-y-1">
                    <div className="text-xs sm:text-sm font-bold text-on-surface flex items-center gap-1.5">
                      <PackageCheck className="w-4 h-4 text-secondary" />
                      <span>Izinkan Penjualan Saat Stok 0 / Minus</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Bila diaktifkan, kasir tetap dapat memproses checkout meskipun stok fisik di sistem tercatat 0 (berguna bila barang sudah datang tapi faktur restock belum diinput).
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      checked={form.allow_negative_stock}
                      onChange={e => setForm(prev => ({ ...prev, allow_negative_stock: e.target.checked }))}
                      disabled={isLoading || isSaving}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>

              {/* Form Action Footer */}
              <div className="px-6 py-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isLoading || isSaving}
                  className="px-4 py-2 text-xs font-semibold rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Batal / Reset</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading || isSaving}
                  className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-surface-container-lowest flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar / Info Panels */}
          <div className="space-y-6">
            {/* Keyboard Shortcuts Reference */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-on-surface">
                <Keyboard className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Cheat-Sheet Hotkey POS</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low/60">
                  <span className="text-on-surface-variant">F2 / Ctrl+K</span>
                  <span className="font-semibold text-on-surface">Cari Barcode Produk</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low/60">
                  <span className="text-on-surface-variant">F4</span>
                  <span className="font-semibold text-on-surface">Ubah Kuantitas (Qty)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/10 border border-secondary/20">
                  <span className="font-bold text-secondary">F8</span>
                  <span className="font-bold text-secondary">Tahan Transaksi (Parked)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low/60">
                  <span className="text-on-surface-variant">F9 / Space</span>
                  <span className="font-semibold text-on-surface">Buka Pembayaran</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container-low/60">
                  <span className="text-on-surface-variant">Esc</span>
                  <span className="text-error font-medium">Batal / Reset Transaksi</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-900 dark:text-blue-200 flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Catatan F8:</strong> Menggantikan shortcut F12 lama yang berbenturan dengan Developer Tools browser Google Chrome & Edge.
                </p>
              </div>
            </div>

            {/* Inventory Guarantee Rules */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-on-surface">
                <ShieldAlert className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Integritas Stok & Restock</h3>
              </div>
              <ul className="text-xs text-on-surface-variant space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Reservasi Stok:</strong> Saat kasir menahan belanjaan, jumlah stok produk langsung dikurangi sementara agar tidak terbeli oleh kasir lain.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Auto-Restock:</strong> Jika transaksi tidak dilanjutkan hingga melewati batas waktu, sistem otomatis membatalkan transaksi dan mengembalikan stok ke katalog.</span>
                </li>
              </ul>
            </div>

            {/* Member Discount Rules */}
            <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm p-5 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-outline-variant/20 text-on-surface">
                <Percent className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider">Diskon Belanja Anggota</h3>
              </div>
              <ul className="text-xs text-on-surface-variant space-y-2 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Kalkulasi Otomatis:</strong> Potongan langsung diterapkan pada subtotal saat kasir memilih data anggota koperasi.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong>Kustomisasi Struk:</strong> Baris diskon akan otomatis disembunyikan jika persentase bernilai 0% atau transaksi adalah Non-Anggota.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

