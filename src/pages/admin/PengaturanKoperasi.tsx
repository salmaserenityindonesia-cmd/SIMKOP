import React, { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { useFeedback } from '../../context/FeedbackContext';
import {
  getKoperasiProfile,
  updateKoperasiProfile,
  isTableMigratedInSupabase,
  KoperasiProfile,
  DEFAULT_KOPERASI_PROFILE
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
  Image as ImageIcon
} from 'lucide-react';

export default function PengaturanKoperasi() {
  const { showToast } = useFeedback();

  const [form, setForm] = useState<KoperasiProfile>(DEFAULT_KOPERASI_PROFILE);
  const [initialData, setInitialData] = useState<KoperasiProfile>(DEFAULT_KOPERASI_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocalOnly, setIsLocalOnly] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProfile();
  }, []);

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
        )}
      </div>
    </AdminLayout>
  );
}
