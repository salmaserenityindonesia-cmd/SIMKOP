import { useState, useEffect, useRef } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnggota, fetchAllAnggotaPaged, updateAnggota, Anggota, LoanType } from '../../services/koperasiService';
import { Search, Loader2, Plus, Edit2, Eye, X, Download, Upload, RotateCcw, Wallet, Banknote, FileSpreadsheet, CheckCircle2, AlertTriangle, Users, PauseCircle, PlayCircle, Sparkles, Sliders, ChevronDown } from 'lucide-react';
import {
  getMembersComprehensiveReport,
  getMembersTemplateExportData,
  createMember,
  resetAllMembersData,
  RESET_MEMBERS_CONFIRMATION_PHRASE,
  syncInitialSavingsBalances,
} from '../../services/memberService';
import { getActiveLoanTypes, syncInitialLoanBalances } from '../../services/loanService';
import {
  exportDataAnggotaExcel,
  exportDataAkhirSimpananExcel,
  exportDataAkhirPinjamanExcel,
  exportDataKomitmenTarifLebaranExcel,
  exportDataAkhirGajiAngsuranLainExcel,
  exportMembersToPdf,
} from '../../services/memberExporter';
import { getKoperasiProfile } from '../../services/settingsService';
import MemberMigrationModal from '../../components/members/MemberMigrationModal';
import MemberMigrationDetailModal from '../../components/members/MemberMigrationDetailModal';
import MemberSuspensionModal from '../../components/members/MemberSuspensionModal';
import MemberLebaranRateModal from '../../components/members/MemberLebaranRateModal';
import BulkLebaranRateImportModal from '../../components/members/BulkLebaranRateImportModal';
import DangerConfirmModal from '../../components/common/DangerConfirmModal';
import { parseMemberUpload, executeMigration, MemberParseResult } from '../../services/memberExcelService';
import { downloadInitialSavingsTemplate, parseInitialSavingsExcel, InitialSavingsRow } from '../../utils/initialSavingsParser';
import { downloadInitialLoansTemplate, parseInitialLoansExcel, InitialLoanRow } from '../../utils/initialLoansParser';
import { useFeedback } from '../../context/FeedbackContext';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatTanggalLahir, formatTanggalLahirWithAge, hitungUsia } from '../../utils/dateUtils';
import { getActiveSavingsRateTiers, getRateTiers } from '../../services/savingsRateService';
import {
  TierRate,
  SanitizedMigrationMemberRow,
  downloadMemberImportTemplate,
  parseMemberImportExcel,
} from '../../utils/memberMigrationParser';

export type MemberExcelExportType =
  | 'all'
  | 'anggota'
  | 'simpanan'
  | 'pinjaman'
  | 'tarif_lebaran'
  | 'gaji_angsuran';

const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function triggerMemberExportExcel(
  memberIds: string[],
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void,
  setIsExporting?: (loading: boolean) => void,
  exportType: MemberExcelExportType = 'all'
) {
  setIsExporting?.(true);
  try {
    const bundle = await getMembersTemplateExportData(memberIds);
    const rawMembers = bundle.members ?? bundle.anggota;

    if (exportType === 'anggota') {
      await exportDataAnggotaExcel(bundle.anggota);
      showToast('File 1: Data Anggota (.xlsx) berhasil diunduh.', 'success');
    } else if (exportType === 'simpanan') {
      await exportDataAkhirSimpananExcel(bundle.simpanan);
      showToast('File 2: Data Akhir Simpanan (.xlsx) berhasil diunduh.', 'success');
    } else if (exportType === 'pinjaman') {
      await exportDataAkhirPinjamanExcel(bundle.pinjaman);
      showToast('File 3: Data Akhir Pinjaman (.xlsx) berhasil diunduh.', 'success');
    } else if (exportType === 'tarif_lebaran') {
      await exportDataKomitmenTarifLebaranExcel(rawMembers);
      showToast('File 4: Data Komitmen Tarif Simpanan Lebaran (.xlsx) berhasil diunduh.', 'success');
    } else if (exportType === 'gaji_angsuran') {
      await exportDataAkhirGajiAngsuranLainExcel(rawMembers);
      showToast('File 5: Data Akhir Gaji & Angsuran Lain-lain (.xlsx) berhasil diunduh.', 'success');
    } else {
      await exportDataAnggotaExcel(bundle.anggota);
      await sleepMs(350);
      await exportDataAkhirSimpananExcel(bundle.simpanan);
      await sleepMs(350);
      await exportDataAkhirPinjamanExcel(bundle.pinjaman);
      await sleepMs(350);
      await exportDataKomitmenTarifLebaranExcel(rawMembers);
      await sleepMs(350);
      await exportDataAkhirGajiAngsuranLainExcel(rawMembers);
      showToast(
        '5 berkas Excel (Data Anggota, Simpanan, Pinjaman, Tarif Lebaran, Gaji & Angsuran Lain-lain) berhasil diunduh.',
        'success'
      );
    }
  } catch (err: any) {
    console.error('Export Excel error:', err);
    showToast(err?.message || 'Gagal mengekspor laporan Excel', 'error');
  } finally {
    setIsExporting?.(false);
  }
}

export async function triggerMemberExportPdf(
  memberIds: string[],
  showToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void,
  setIsExporting?: (loading: boolean) => void
) {
  setIsExporting?.(true);
  try {
    const comprehensiveData = await getMembersComprehensiveReport(memberIds);
    const profile = await getKoperasiProfile();
    await exportMembersToPdf(comprehensiveData, profile);
    showToast('Laporan PDF Landscape 14 kolom berhasil diunduh.', 'success');
  } catch (err: any) {
    console.error('Export PDF error:', err);
    showToast(err?.message || 'Gagal mengekspor laporan PDF', 'error');
  } finally {
    setIsExporting?.(false);
  }
}

export async function triggerResetAllMembers(
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void,
  setIsResetting?: (val: boolean) => void,
  onSuccess?: () => Promise<void> | void,
  confirmationPhrase: string = RESET_MEMBERS_CONFIRMATION_PHRASE
) {
  setIsResetting?.(true);
  try {
    const res = await resetAllMembersData(confirmationPhrase);
    showToast(
      res.message || 'Seluruh data anggota dan mutasi terkait berhasil dikosongkan.',
      'success'
    );
    if (onSuccess) {
      await onSuccess();
    }
    return res;
  } catch (err: any) {
    console.error('Reset members error:', err);
    showToast(err?.message || 'Gagal mengosongkan data anggota', 'error');
    throw err;
  } finally {
    setIsResetting?.(false);
  }
}

export interface ManajemenAnggotaProps {
  initialShowModal?: boolean;
  initialEditingAnggota?: Anggota | null;
  initialResetModalOpen?: boolean;
  initialMemberImportModalOpen?: boolean;
  initialSavingsModalOpen?: boolean;
  initialLoansModalOpen?: boolean;
  initialActivePokokRate?: number;
  initialSuspensionMember?: Anggota | null;
  initialLebaranRateMember?: Anggota | null;
}

export default function ManajemenAnggota({
  initialShowModal = false,
  initialEditingAnggota = null,
  initialResetModalOpen = false,
  initialMemberImportModalOpen = false,
  initialSavingsModalOpen = false,
  initialLoansModalOpen = false,
  initialActivePokokRate,
  initialSuspensionMember = null,
  initialLebaranRateMember = null,
}: ManajemenAnggotaProps = {}) {
  const { showToast } = useFeedback();
  const [anggotaList, setAnggotaList] = useState<Anggota[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activePokokRate, setActivePokokRate] = useState<number | null>(initialActivePokokRate ?? null);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    if (!isExportMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExportMenuOpen]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Modal State
  const [showModal, setShowModal] = useState(initialShowModal);
  const [editingAnggota, setEditingAnggota] = useState<Anggota | null>(initialEditingAnggota ?? null);
  const [formData, setFormData] = useState({
    nomor_referensi: '',
    nrp: '',
    nama: '',
    tanggal_lahir: '',
    status: 'aktif',
    membership_status: 'ACTIVE' as NonNullable<Anggota['membership_status']>,
    suspension_reason: '',
    master_thp: 0,
    bank_account_number: '',
    tgl_awal_anggota: new Date().toISOString().slice(0, 10),
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parseResult, setParseResult] = useState<MemberParseResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [wajibRateTiers, setWajibRateTiers] = useState<TierRate[]>([]);

  // Import Data Induk Anggota Modal State
  const memberImportInputRef = useRef<HTMLInputElement>(null);
  const [isMemberImportModalOpen, setIsMemberImportModalOpen] = useState(initialMemberImportModalOpen);
  const [memberImportRows, setMemberImportRows] = useState<SanitizedMigrationMemberRow[]>([]);
  const [memberImportFileName, setMemberImportFileName] = useState<string>('');
  const [memberImportError, setMemberImportError] = useState<string | null>(null);
  const [isDownloadingMemberTemplate, setIsDownloadingMemberTemplate] = useState<boolean>(false);

  // Reset Data State
  const [isResetModalOpen, setIsResetModalOpen] = useState(initialResetModalOpen);
  const [isResetting, setIsResetting] = useState(false);

  // Bulk Lebaran Rate Import Modal State
  const [isBulkLebaranModalOpen, setIsBulkLebaranModalOpen] = useState(false);

  // Saldo Awal Simpanan State
  const initialSavingsInputRef = useRef<HTMLInputElement>(null);
  const [isInitialSavingsModalOpen, setIsInitialSavingsModalOpen] = useState(initialSavingsModalOpen);
  const [initialSavingsRows, setInitialSavingsRows] = useState<InitialSavingsRow[]>([]);
  const [initialSavingsFileName, setInitialSavingsFileName] = useState<string>('');
  const [initialSavingsError, setInitialSavingsError] = useState<string | null>(null);
  const [initialSavingsDate, setInitialSavingsDate] = useState<string>(initialSavingsModalOpen ? '2026-03-01' : '');
  const [isInitialSavingsConfirmed, setIsInitialSavingsConfirmed] = useState<boolean>(false);
  const [isSavingInitialSavings, setIsSavingInitialSavings] = useState<boolean>(false);
  const [savingsImportProgress, setSavingsImportProgress] = useState<{
    current: number;
    total: number;
    memberName?: string;
  } | null>(null);
  const [isDownloadingSavingsTemplate, setIsDownloadingSavingsTemplate] = useState<boolean>(false);

  // Saldo Awal Pinjaman State
  const initialLoansInputRef = useRef<HTMLInputElement>(null);
  const [isInitialLoansModalOpen, setIsInitialLoansModalOpen] = useState(initialLoansModalOpen);
  const [initialLoansRows, setInitialLoansRows] = useState<InitialLoanRow[]>([]);
  const [initialLoansFileName, setInitialLoansFileName] = useState<string>('');
  const [initialLoansError, setInitialLoansError] = useState<string | null>(null);
  const [isInitialLoansConfirmed, setIsInitialLoansConfirmed] = useState<boolean>(false);
  const [isSavingInitialLoans, setIsSavingInitialLoans] = useState<boolean>(false);
  const [isDownloadingLoansTemplate, setIsDownloadingLoansTemplate] = useState<boolean>(false);
  const [activeLoanTypes, setActiveLoanTypes] = useState<LoanType[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [data, rates, loanTypes] = await Promise.all([
        fetchAllAnggotaPaged(),
        initialActivePokokRate !== undefined ? Promise.resolve(null) : getActiveSavingsRateTiers().catch(() => null),
        getActiveLoanTypes().catch(() => []),
      ]);
      setAnggotaList(data);
      if (rates && (rates['POKOK'] || rates['SP'])) {
        setActivePokokRate(rates['POKOK'] || rates['SP']);
      }
      if (Array.isArray(loanTypes) && loanTypes.length > 0) {
        setActiveLoanTypes(loanTypes);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }

  const fetchMembers = loadData;

  const handleOpenAddModal = () => {
    setEditingAnggota(null);
    setFormData({
      nomor_referensi: '',
      nrp: '',
      nama: '',
      tanggal_lahir: '',
      status: 'aktif',
      membership_status: 'ACTIVE',
      suspension_reason: '',
      master_thp: 0,
      bank_account_number: '',
      tgl_awal_anggota: new Date().toISOString().slice(0, 10),
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (anggota: Anggota) => {
    setEditingAnggota(anggota);
    const resolvedMasterThp =
      Number(anggota.master_thp) > 0
        ? Number(anggota.master_thp)
        : Number(anggota.take_home_pay) > 0
        ? Number(anggota.take_home_pay)
        : Number(anggota.master_thp) || 0;
    setFormData({
      nomor_referensi: anggota.nomor_referensi || '',
      nrp: anggota.nrp || '',
      nama: anggota.nama,
      tanggal_lahir: anggota.tanggal_lahir ? String(anggota.tanggal_lahir).slice(0, 10) : '',
      status: anggota.status || 'aktif',
      membership_status: anggota.membership_status || (anggota.status === 'nonaktif' ? 'RESIGNED' : 'ACTIVE'),
      suspension_reason: anggota.suspension_reason || '',
      master_thp: resolvedMasterThp,
      bank_account_number: anggota.bank_account_number || '',
      tgl_awal_anggota: anggota.created_at ? anggota.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
    });
    setShowModal(true);
  };

  // Status Keaktifan / Pembekuan Sementara Modal State
  const [selectedMemberForStatus, setSelectedMemberForStatus] = useState<Anggota | null>(
    initialSuspensionMember ?? null
  );

  const handleOpenSuspensionModal = (anggota: Anggota) => {
    setSelectedMemberForStatus(anggota);
  };

  // Detail Migrasi Awal Modal State
  const [selectedMigrationMember, setSelectedMigrationMember] = useState<Anggota | null>(null);
  const [isMigrationDetailOpen, setIsMigrationDetailOpen] = useState(false);

  // Pengaturan Simpanan Lebaran Pribadi Modal State
  const [selectedMemberForLebaranRate, setSelectedMemberForLebaranRate] = useState<Anggota | null>(
    initialLebaranRateMember ?? null
  );

  const handleOpenMigrationDetail = (anggota: Anggota) => {
    setSelectedMigrationMember(anggota);
    setIsMigrationDetailOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const normalizedMasterThp = Number(formData.master_thp) || 0;
      if (editingAnggota) {
        const updatePayload: Partial<Omit<Anggota, 'id' | 'created_at'>> = {
          nomor_referensi: formData.nomor_referensi?.trim() || null,
          nrp: formData.nrp,
          nama: formData.nama,
          tanggal_lahir: formData.tanggal_lahir || null,
          master_thp: normalizedMasterThp,
          take_home_pay: normalizedMasterThp,
          bank_account_number: formData.bank_account_number,
        };
        await updateAnggota(editingAnggota.id, updatePayload);
        showToast('Data anggota berhasil diperbarui.', 'success');
      } else {
        await createMember({
          nomor_referensi: formData.nomor_referensi?.trim() || null,
          nrp: formData.nrp,
          nama: formData.nama,
          tanggal_lahir: formData.tanggal_lahir || null,
          master_thp: normalizedMasterThp,
          take_home_pay: normalizedMasterThp,
          bank_account_number: formData.bank_account_number,
          tgl_awal_anggota: formData.tgl_awal_anggota,
        });
        showToast('Anggota baru berhasil ditambahkan.', 'success');
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan anggota', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredList = anggotaList.filter(a => 
    a.nama.toLowerCase().includes(search.toLowerCase()) || 
    (a.nrp && a.nrp.toLowerCase().includes(search.toLowerCase())) ||
    (a.nomor_referensi && a.nomor_referensi.toLowerCase().includes(search.toLowerCase()))
  );

  const totalPages = Math.ceil(filteredList.length / itemsPerPage);
  const paginatedList = filteredList.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'ACTIVE': return 'Aktif';
      case 'SUSPENDED': return 'Nonaktif Sementara';
      case 'PENDING_RESIGNED': return 'Menunggu Resign';
      case 'READY_TO_RESIGN': return 'Siap Resign';
      case 'RESIGNED': return 'Resign';
      case 'BLOCKED': return 'Diblokir';
      default: return 'Aktif';
    }
  };

  const handleExportExcel = async (exportType: MemberExcelExportType = 'all') => {
    setIsExportMenuOpen(false);
    await triggerMemberExportExcel(
      filteredList.map(a => a.id),
      showToast,
      setIsExportingExcel,
      exportType
    );
  };

  const handleExportPDF = async () => {
    await triggerMemberExportPdf(
      filteredList.map(a => a.id),
      showToast,
      setIsExportingPdf
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Muat konfigurasi tarif bertingkat Simpanan Wajib
      try {
        const rawTiers = await getRateTiers('WAJIB');
        const mapped: TierRate[] = (rawTiers || []).map(t => ({
          startYear: t.start_year,
          startMonth: t.start_month,
          endYear: t.end_year,
          endMonth: t.end_month,
          monthlyAmount: t.monthly_rate,
        }));
        setWajibRateTiers(mapped);
      } catch (rateErr) {
        console.warn('Gagal memuat tarif bertingkat simpanan wajib:', rateErr);
      }

      const result = await parseMemberUpload(file);
      setParseResult(result);
      setIsImportModalOpen(true);
    } catch (error: any) {
      showToast(error.message || 'Gagal memproses file Excel', 'error');
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportConfirm = async () => {
    if (!parseResult) return;
    
    setIsImporting(true);
    setImportProgress({ current: 0, total: parseResult.rows.length });
    try {
      await executeMigration(parseResult, (current, total) => {
        setImportProgress({ current, total });
      });
      setIsImportModalOpen(false);
      await fetchMembers();
      const totalAnggota = parseResult.rows.length;
      const totalPinjaman = parseResult.rows.filter(r => r.jumlah_pinjaman > 0).length;
      const message = totalPinjaman > 0
        ? `Berhasil mengimpor ${totalAnggota} anggota dan menyinkronkan ${totalPinjaman} data pinjaman migrasi!`
        : `Berhasil mengimpor ${totalAnggota} anggota!`;
      showToast(message, 'success');
    } catch (error: any) {
      showToast(error.message || 'Gagal mengimpor anggota', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleConfirmReset = async () => {
    try {
      await triggerResetAllMembers(
        showToast,
        setIsResetting,
        async () => {
          setAnggotaList([]);
          setCurrentPage(1);
          setIsResetModalOpen(false);
          await fetchMembers();
        },
        RESET_MEMBERS_CONFIRMATION_PHRASE
      );
    } catch {
      // Error is handled with toast inside triggerResetAllMembers
    }
  };

  const handleCloseMemberImportModal = () => {
    if (isImporting) return;
    setIsMemberImportModalOpen(false);
    setMemberImportRows([]);
    setMemberImportFileName('');
    setMemberImportError(null);
    if (memberImportInputRef.current) {
      memberImportInputRef.current.value = '';
    }
  };

  const handleDownloadMemberImportTemplate = async () => {
    setIsDownloadingMemberTemplate(true);
    try {
      await downloadMemberImportTemplate();
      showToast('Template Data Anggota berhasil diunduh.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh template data anggota', 'error');
    } finally {
      setIsDownloadingMemberTemplate(false);
    }
  };

  const handleMemberImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseMemberImportExcel(file);
      setMemberImportRows(parsed);
      setMemberImportFileName(file.name);
      setMemberImportError(null);
      showToast(`Berhasil membaca ${parsed.length} baris data anggota dari ${file.name}.`, 'info');
    } catch (err: any) {
      const message = err?.message || 'Gagal memproses file Excel data anggota';
      setMemberImportRows([]);
      setMemberImportFileName('');
      setMemberImportError(message);
      showToast(message, 'error');
    } finally {
      if (memberImportInputRef.current) {
        memberImportInputRef.current.value = '';
      }
    }
  };

  const handleSaveMemberImport = async () => {
    if (memberImportRows.length === 0 || memberImportError) return;

    setIsImporting(true);
    setImportProgress({ current: 0, total: memberImportRows.length });
    try {
      const result: MemberParseResult = {
        rows: memberImportRows.map((row) => ({
          nomor_referensi: row.nomor_referensi || null,
          nrp: row.nrp,
          nama: row.nama,
          tanggal_lahir: row.tanggal_lahir,
          bank_account_number: row.bank_account_number,
          membership_status: row.membership_status,
          tgl_awal_anggota: row.tgl_awal_anggota,
          jumlah_simpanan_pokok: 0,
          jumlah_simpanan_wajib: 0,
          jumlah_simpanan_belanja: 0,
          jumlah_simpanan_lebaran: 0,
          jumlah_pinjaman: 0,
          tgl_awal_pinjaman: null,
          tenor: 0,
          sisa_pinjaman: 0,
          n_bulan_simpanan: 1,
          wajib_per_bulan: 0,
          belanja_per_bulan: 0,
          lebaran_per_bulan: 0,
          n_bulan_pinjaman: 1,
          sudah_diangsur: 0,
          angsuran_lampau_per_bulan: 0,
        })),
        errors: [],
      };

      await executeMigration(result, (current, total) => {
        setImportProgress({ current, total });
      });

      const importedCount = memberImportRows.length;
      setIsMemberImportModalOpen(false);
      setMemberImportRows([]);
      setMemberImportFileName('');
      setMemberImportError(null);
      await fetchMembers();
      showToast(`Berhasil mengimpor ${importedCount} data induk anggota!`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengimpor data anggota', 'error');
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleCloseInitialSavingsModal = () => {
    if (isSavingInitialSavings) return;
    setIsInitialSavingsModalOpen(false);
    setInitialSavingsRows([]);
    setInitialSavingsFileName('');
    setInitialSavingsError(null);
    setInitialSavingsDate('');
    setIsInitialSavingsConfirmed(false);
    setSavingsImportProgress(null);
    if (initialSavingsInputRef.current) {
      initialSavingsInputRef.current.value = '';
    }
  };

  const handleDownloadInitialSavingsTemplate = async () => {
    setIsDownloadingSavingsTemplate(true);
    try {
      await downloadInitialSavingsTemplate(anggotaList);
      showToast('Template Saldo Awal Simpanan berhasil diunduh.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh template saldo awal simpanan', 'error');
    } finally {
      setIsDownloadingSavingsTemplate(false);
    }
  };

  const handleInitialSavingsFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let membersToUse = anggotaList;
      if (membersToUse.length === 0) {
        membersToUse = await fetchAllAnggotaPaged().catch(() => []);
        if (membersToUse.length > 0) setAnggotaList(membersToUse);
      }
      const parsed = await parseInitialSavingsExcel(file, membersToUse);
      setInitialSavingsRows(parsed);
      setInitialSavingsFileName(file.name);
      setInitialSavingsError(null);
      const invalidCount = parsed.filter((r) => r.isValid === false).length;
      if (invalidCount > 0) {
        showToast(
          `Terbaca ${parsed.length} baris dari ${file.name}, namun terdapat ${invalidCount} baris dengan NRP/Nama yang belum terdaftar atau tidak cocok!`,
          'warning'
        );
      } else {
        showToast(`Berhasil membaca ${parsed.length} baris saldo awal dari ${file.name}.`, 'info');
      }
    } catch (err: any) {
      const message = err?.message || 'Gagal memproses file Excel saldo awal simpanan';
      setInitialSavingsRows([]);
      setInitialSavingsFileName('');
      setInitialSavingsError(message);
      showToast(message, 'error');
    } finally {
      if (initialSavingsInputRef.current) {
        initialSavingsInputRef.current.value = '';
      }
    }
  };

  const handleSaveInitialSavings = async () => {
    if (
      initialSavingsRows.length === 0 ||
      initialSavingsRows.some((r) => r.isValid === false) ||
      !initialSavingsDate ||
      !isInitialSavingsConfirmed
    ) {
      return;
    }

    setIsSavingInitialSavings(true);
    setSavingsImportProgress({ current: 0, total: initialSavingsRows.length });
    try {
      const result = await syncInitialSavingsBalances(
        initialSavingsRows,
        initialSavingsDate,
        (current, total, memberName) => {
          setSavingsImportProgress({ current, total, memberName });
        }
      );
      const formattedDate = new Date(`${result.effectiveDate}T00:00:00`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      const skipNote =
        result.skippedNrps.length > 0
          ? ` (${result.skippedNrps.length} NRP tidak ditemukan dilewati)`
          : '';
      showToast(
        `Saldo awal simpanan ${result.updatedCount} anggota berhasil disimpan dan dinyatakan aktif sejak ${formattedDate}${skipNote}.`,
        'success'
      );
      setIsInitialSavingsModalOpen(false);
      setInitialSavingsRows([]);
      setInitialSavingsFileName('');
      setInitialSavingsError(null);
      setInitialSavingsDate('');
      setIsInitialSavingsConfirmed(false);
      await fetchMembers();
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan saldo awal simpanan', 'error');
    } finally {
      setIsSavingInitialSavings(false);
      setSavingsImportProgress(null);
    }
  };

  const handleOpenInitialLoansModal = async () => {
    setIsInitialLoansModalOpen(true);
    if (activeLoanTypes.length === 0) {
      try {
        const types = await getActiveLoanTypes();
        if (Array.isArray(types)) {
          setActiveLoanTypes(types);
        }
      } catch (err) {
        console.warn('Gagal memuat jenis pinjaman aktif:', err);
      }
    }
  };

  const handleCloseInitialLoansModal = () => {
    if (isSavingInitialLoans) return;
    setIsInitialLoansModalOpen(false);
    setInitialLoansRows([]);
    setInitialLoansFileName('');
    setInitialLoansError(null);
    setIsInitialLoansConfirmed(false);
    if (initialLoansInputRef.current) {
      initialLoansInputRef.current.value = '';
    }
  };

  const handleDownloadInitialLoansTemplate = async () => {
    setIsDownloadingLoansTemplate(true);
    try {
      let loanTypesToUse = activeLoanTypes;
      if (loanTypesToUse.length === 0) {
        loanTypesToUse = await getActiveLoanTypes().catch(() => []);
        if (loanTypesToUse.length > 0) setActiveLoanTypes(loanTypesToUse);
      }
      await downloadInitialLoansTemplate(anggotaList, loanTypesToUse);
      showToast('Template Saldo Awal Pinjaman berhasil diunduh.', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Gagal mengunduh template saldo awal pinjaman', 'error');
    } finally {
      setIsDownloadingLoansTemplate(false);
    }
  };

  const handleInitialLoansFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      let loanTypesToUse = activeLoanTypes;
      if (loanTypesToUse.length === 0) {
        loanTypesToUse = await getActiveLoanTypes().catch(() => []);
        if (loanTypesToUse.length > 0) setActiveLoanTypes(loanTypesToUse);
      }
      let membersToUse = anggotaList;
      if (membersToUse.length === 0) {
        membersToUse = await fetchAllAnggotaPaged().catch(() => []);
        if (membersToUse.length > 0) setAnggotaList(membersToUse);
      }
      const parsed = await parseInitialLoansExcel(file, loanTypesToUse, membersToUse);
      setInitialLoansRows(parsed);
      setInitialLoansFileName(file.name);
      setInitialLoansError(null);
      const invalidCount = parsed.filter((r) => !r.isValid).length;
      if (invalidCount > 0) {
        showToast(
          `Terbaca ${parsed.length} baris pinjaman dari ${file.name}, namun terdapat ${invalidCount} baris yang gagal validasi NRP/Nama anggota atau jenis pinjaman.`,
          'warning'
        );
      } else {
        showToast(`Berhasil membaca ${parsed.length} baris saldo awal pinjaman dari ${file.name}.`, 'info');
      }
    } catch (err: any) {
      const message = err?.message || 'Gagal memproses file Excel saldo awal pinjaman';
      setInitialLoansRows([]);
      setInitialLoansFileName('');
      setInitialLoansError(message);
      showToast(message, 'error');
    } finally {
      if (initialLoansInputRef.current) {
        initialLoansInputRef.current.value = '';
      }
    }
  };

  const handleSaveInitialLoans = async () => {
    if (
      initialLoansRows.length === 0 ||
      initialLoansRows.some((r) => !r.isValid) ||
      !isInitialLoansConfirmed
    ) {
      return;
    }

    setIsSavingInitialLoans(true);
    try {
      const result = await syncInitialLoanBalances(initialLoansRows);
      const skipNote =
        result.skippedCount > 0
          ? ` (${result.skippedCount} baris dilewati)`
          : '';
      showToast(
        `Saldo awal pinjaman (${result.insertedCount} data) berhasil disimpan dan jadwal angsuran telah diaktifkan${skipNote}.`,
        'success'
      );
      setIsInitialLoansModalOpen(false);
      setInitialLoansRows([]);
      setInitialLoansFileName('');
      setInitialLoansError(null);
      setIsInitialLoansConfirmed(false);
      await fetchMembers();
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan saldo awal pinjaman', 'error');
    } finally {
      setIsSavingInitialLoans(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Manajemen Anggota</h1>
        <p className="text-[var(--color-text-secondary)]">Kelola data induk anggota koperasi</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200/80 space-y-3 bg-gray-50">
          {/* Baris 1: Pencarian di Kiri & Tombol Tambah Anggota di Kanan */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari anggota (No. Ref / Nama / NRP)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 pl-9 pr-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4 text-white shrink-0" />
              <span>Tambah Anggota</span>
            </button>
          </div>

          {/* Baris 2: Deretan Tombol Impor, Ekspor, dan Reset dengan Tinggi & Ukuran Seragam */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
            {/* Kelompok Kiri: Fitur Impor & Tarif Massal */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMemberImportModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-xs"
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span>Impor Anggota (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!initialSavingsDate) setInitialSavingsDate('2026-03-01');
                  setSavingsImportProgress(null);
                  setIsInitialSavingsModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Impor Saldo Simpanan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsBulkLebaranModalOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span>Atur Tarif Lebaran</span>
              </button>

              <button
                type="button"
                onClick={handleOpenInitialLoansModal}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                <span>Impor Saldo Pinjaman</span>
              </button>
            </div>

            {/* Kelompok Kanan: Ekspor Laporan & Reset */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative" ref={exportMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsExportMenuOpen((prev) => !prev)}
                  disabled={isExportingExcel}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isExportingExcel ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Download className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>Ekspor Excel</span>
                  <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                </button>

                {isExportMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-72 rounded-xl bg-white border border-slate-200 shadow-lg py-1.5 z-30">
                    <button
                      type="button"
                      onClick={() => handleExportExcel('all')}
                      className="w-full text-left px-3.5 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>Unduh Semua (5 File Excel)</span>
                    </button>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => handleExportExcel('anggota')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      1. Data Anggota (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportExcel('simpanan')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      2. Data Akhir Simpanan (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportExcel('pinjaman')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      3. Data Akhir Pinjaman (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportExcel('tarif_lebaran')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      4. Data Komitmen Tarif Simpanan Lebaran (.xlsx)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportExcel('gaji_angsuran')}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      5. Data Akhir Gaji &amp; Angsuran Lain-lain (.xlsx)
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportPDF}
                disabled={isExportingPdf}
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExportingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : (
                  <Download className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>Ekspor PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                title="Kosongkan seluruh data anggota, simpanan, dan pinjaman"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Reset Data</span>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-gray-600 text-sm">
                <th className="py-3 px-4 font-medium border-b border-gray-200">No. Referensi</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">NRP</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nama</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Tanggal Lahir</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Nomor Rekening</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Status</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200">Terdaftar</th>
                <th className="py-3 px-4 font-medium border-b border-gray-200 text-center w-28">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-500">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-[var(--color-primary)]" />
                    <p>Memuat data...</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : filteredList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    Tidak ada data anggota.
                  </td>
                </tr>
              ) : (
                paginatedList.map((anggota) => (
                  <tr key={anggota.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 font-mono text-xs text-slate-700">
                      {anggota.nomor_referensi || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">{anggota.nrp}</td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.nama}</td>
                    <td className="py-3 px-4 text-sm text-gray-700 whitespace-nowrap">
                      {anggota.tanggal_lahir && formatTanggalLahir(anggota.tanggal_lahir) !== '-' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span>{formatTanggalLahir(anggota.tanggal_lahir)}</span>
                          {hitungUsia(anggota.tanggal_lahir) !== null && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">
                              {hitungUsia(anggota.tanggal_lahir)} Thn
                            </span>
                          )}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700 font-medium">
                      {anggota.bank_account_number || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <span
                        title={anggota.membership_status === 'SUSPENDED' ? (anggota.suspension_reason || 'Tagihan dibekukan sementara') : undefined}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          anggota.membership_status === 'ACTIVE' || !anggota.membership_status ? 'bg-green-100 text-green-800' :
                          anggota.membership_status === 'SUSPENDED' ? 'bg-amber-100 text-amber-800 border border-amber-300' :
                          anggota.membership_status === 'PENDING_RESIGNED' ? 'bg-orange-100 text-orange-800' :
                          anggota.membership_status === 'READY_TO_RESIGN' ? 'bg-blue-100 text-blue-800' :
                          anggota.membership_status === 'RESIGNED' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}
                      >
                        {anggota.membership_status === 'SUSPENDED' && <PauseCircle className="w-3.5 h-3.5" />}
                        {getStatusText(anggota.membership_status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-700">{anggota.created_at ? new Date(anggota.created_at).toLocaleDateString('id-ID') : '-'}</td>
                    <td className="py-3 px-4 text-sm text-center">
                      <div className="flex justify-center items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenMigrationDetail(anggota)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Lihat Detail Data Migrasi Awal"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {!['RESIGNED', 'BLOCKED'].includes(
                          String(anggota.membership_status || '').toUpperCase()
                        ) && (
                          <button
                            type="button"
                            onClick={() => handleOpenSuspensionModal(anggota)}
                            disabled={isSubmitting}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                              anggota.membership_status === 'SUSPENDED'
                                ? 'text-emerald-600 hover:bg-emerald-50'
                                : 'text-amber-600 hover:bg-amber-50'
                            }`}
                            title={
                              anggota.membership_status === 'SUSPENDED'
                                ? 'Aktifkan Kembali Anggota'
                                : 'Bekukan Sementara (Nonaktif Sementara)'
                            }
                            aria-label={
                              anggota.membership_status === 'SUSPENDED'
                                ? 'Aktifkan Kembali Anggota'
                                : 'Bekukan Sementara'
                            }
                          >
                            {anggota.membership_status === 'SUSPENDED' ? (
                              <PlayCircle className="w-4 h-4" />
                            ) : (
                              <PauseCircle className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(anggota)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Data Anggota"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 text-gray-600">
            <span>
              Menampilkan {filteredList.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}-
              {Math.min(currentPage * itemsPerPage, filteredList.length)} dari {filteredList.length} anggota
            </span>
            <select 
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="ml-2 bg-transparent border-none font-medium text-gray-900 outline-none cursor-pointer focus:ring-0"
            >
              <option value={10}>10 / halaman</option>
              <option value={25}>25 / halaman</option>
              <option value={50}>50 / halaman</option>
              <option value={100}>100 / halaman</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Prev
            </button>
            <span className="text-sm font-medium px-2 text-gray-700">
              {currentPage} / {totalPages || 1}
            </span>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-lg text-gray-900">
                {editingAnggota ? 'Edit Anggota' : 'Tambah Anggota Baru'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-4 overflow-y-auto">
              <div className="space-y-4">
                {!editingAnggota && (
                  <div className="p-3 bg-blue-50/80 rounded-lg border border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                    <span className="material-symbols-outlined text-[18px] text-blue-600 shrink-0 mt-0.5">info</span>
                    <div>
                      <p className="font-semibold text-blue-900">Inisialisasi Simpanan Anggota</p>
                      <p className="text-blue-700 mt-0.5">
                        Rekening Simpanan Pokok ({activePokokRate ? formatCurrency(activePokokRate) : 'Rp 100.000'}) dan Simpanan Wajib akan otomatis dihubungkan sesuai tarif aktif koperasi.
                      </p>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nomor Referensi (Opsional)
                  </label>
                  <input
                    type="text"
                    value={formData.nomor_referensi}
                    onChange={(e) => setFormData({...formData, nomor_referensi: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] font-mono text-sm"
                    placeholder="Contoh: REF-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    NRP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nrp}
                    onChange={(e) => setFormData({...formData, nrp: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan NRP anggota"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nama Lengkap <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.nama}
                    onChange={(e) => setFormData({...formData, nama: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Masukkan nama lengkap"
                  />
                </div>
                
                <div>
                  <label htmlFor="anggota-tanggal-lahir" className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Lahir
                  </label>
                  <input
                    id="anggota-tanggal-lahir"
                    type="date"
                    max={new Date().toISOString().split('T')[0]}
                    value={formData.tanggal_lahir}
                    onChange={(e) => setFormData({...formData, tanggal_lahir: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nomor Rekening Bank (Opsional)
                  </label>
                  <input
                    type="text"
                    value={formData.bank_account_number}
                    onChange={(e) => setFormData({...formData, bank_account_number: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: 115738953714"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gaji Pokok (Master THP) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.master_thp}
                    onChange={(e) => setFormData({...formData, master_thp: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Contoh: 5000000"
                  />
                  <p className="text-xs text-gray-500 mt-1">Gaji pokok akan digunakan untuk memvalidasi kelayakan limit pemotongan saat pengajuan pinjaman.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tanggal Bergabung <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.tgl_awal_anggota}
                    onChange={(e) => setFormData({...formData, tgl_awal_anggota: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>

                {editingAnggota && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-slate-700">
                      Status Keanggotaan
                    </label>
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-slate-500">Status Saat Ini:</span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            editingAnggota?.membership_status === 'SUSPENDED'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : editingAnggota?.membership_status === 'RESIGNED'
                              ? 'bg-slate-200 text-slate-700'
                              : editingAnggota?.membership_status === 'BLOCKED'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {editingAnggota?.membership_status === 'SUSPENDED'
                            ? 'Nonaktif Sementara (Beku)'
                            : editingAnggota?.membership_status === 'RESIGNED'
                            ? 'Keluar / Resigned'
                            : editingAnggota?.membership_status === 'BLOCKED'
                            ? 'Diblokir'
                            : 'Aktif'}
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-slate-600">
                        Status keanggotaan tidak dapat diubah dari form edit biodata ini. Gunakan tombol ikon{' '}
                        <strong>Bekukan / Aktifkan Sementara</strong> di kolom Aksi untuk penangguhan sementara, atau menu{' '}
                        <strong>Kliring &amp; Clearance Anggota</strong> untuk penghentian permanen.
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/70 flex flex-col gap-2 mt-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-purple-900">
                          Tarif Simpanan Lebaran Pribadi
                        </span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-purple-700">
                        Atur nominal khusus Simpanan Hari Raya (Lebaran) anggota ini mulai awal siklus Lebaran.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberForLebaranRate(editingAnggota)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors cursor-pointer self-start"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Atur Besaran Simpanan Lebaran Pribadi
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 active:bg-slate-950 transition-colors text-sm font-medium flex items-center cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Menyimpan...
                    </>
                  ) : (
                    'Simpan'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <MemberMigrationModal 
        isOpen={isImportModalOpen}
        parseResult={parseResult}
        wajibRateTiers={wajibRateTiers}
        onClose={() => {
          if (!isImporting) {
            setIsImportModalOpen(false);
          }
        }}
        onConfirm={handleImportConfirm}
        isImporting={isImporting}
        importProgress={importProgress}
      />

      <MemberMigrationDetailModal
        isOpen={isMigrationDetailOpen}
        member={selectedMigrationMember}
        onClose={() => setIsMigrationDetailOpen(false)}
        onOpenLebaranRateModal={(m) => setSelectedMemberForLebaranRate(m)}
      />

      <MemberLebaranRateModal
        isOpen={Boolean(selectedMemberForLebaranRate)}
        member={selectedMemberForLebaranRate}
        onClose={() => setSelectedMemberForLebaranRate(null)}
        onSuccess={fetchMembers}
      />

      <BulkLebaranRateImportModal
        isOpen={isBulkLebaranModalOpen}
        onClose={() => setIsBulkLebaranModalOpen(false)}
        onSuccess={fetchMembers}
      />

      <MemberSuspensionModal
        isOpen={Boolean(selectedMemberForStatus)}
        member={selectedMemberForStatus}
        onClose={() => setSelectedMemberForStatus(null)}
        onSuccess={async (newStatus, updatedMember) => {
          await fetchMembers();
          showToast(
            newStatus === 'SUSPENDED'
              ? `Keanggotaan ${updatedMember.nama} berhasil dibekukan sementara.`
              : `Keanggotaan ${updatedMember.nama} berhasil diaktifkan kembali.`,
            'success'
          );
        }}
      />

      <DangerConfirmModal
        isOpen={isResetModalOpen}
        title="Reset Seluruh Data Anggota"
        message="PERINGATAN: Tindakan ini akan mengosongkan tabel anggota beserta seluruh tabel anak terkait (rekening simpanan, mutasi simpanan, pinjaman, jadwal angsuran, transaksi penjualan terkait, distribusi SHU, serta entri arus kas terkait) secara permanen melalui TRUNCATE CASCADE dan mereset sequence ID kembali ke 1."
        confirmationKeyword={RESET_MEMBERS_CONFIRMATION_PHRASE}
        confirmButtonLabel="Ya, Kosongkan Sekarang"
        isLoading={isResetting}
        onConfirm={handleConfirmReset}
        onClose={() => {
          if (!isResetting) {
            setIsResetModalOpen(false);
          }
        }}
      />

      {isMemberImportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-indigo-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-400/30">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Import Data Induk Anggota</h3>
                  <p className="text-xs text-slate-300">
                    Tambah anggota baru atau perbarui data profil (NRP, Nama, Tanggal Lahir, Rekening, Status, Tgl Awal) tanpa mengubah saldo simpanan &amp; pinjaman
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseMemberImportModal}
                disabled={isImporting}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/60">
              {/* Langkah 1 — Unduh Template Data Anggota */}
              <div className="bg-white rounded-xl border border-indigo-200/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full mb-1">
                    Langkah 1
                  </span>
                  <h4 className="text-sm font-bold text-slate-800">Unduh Template Data Anggota</h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Khusus untuk data profil master anggota (7 kolom:{' '}
                    <code className="bg-slate-100 px-1 rounded">nomor_referensi</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">nrp</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">nama</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">tanggal_lahir</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">bank_account_number</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">membership_status</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">tgl_awal_anggota</code>) tanpa mengubah saldo simpanan maupun pinjaman. Untuk saldo awal simpanan atau pinjaman, gunakan tombol menu masing-masing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadMemberImportTemplate}
                  disabled={isDownloadingMemberTemplate || isImporting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-indigo-600 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 text-sm font-semibold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isDownloadingMemberTemplate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Unduh Template Data Anggota (.xlsx)
                </button>
              </div>

              {/* Langkah 2 — Pilih File Excel */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full mb-1">
                    Langkah 2
                  </span>
                  <h4 className="text-sm font-bold text-slate-800">Pilih File Excel (.xlsx / .xls)</h4>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/30">
                  <input
                    ref={memberImportInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleMemberImportFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => memberImportInputRef.current?.click()}
                    disabled={isImporting}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-sm font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Pilih File Excel (.xlsx / .xls)
                  </button>
                  <div className="text-xs text-slate-600">
                    {memberImportFileName ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-indigo-700">
                        <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                        {memberImportFileName} ({memberImportRows.length} baris anggota terbaca)
                      </span>
                    ) : (
                      <span>Belum ada file dipilih. Silakan pilih file Excel Data Induk Anggota (7 kolom).</span>
                    )}
                  </div>
                </div>

                {memberImportError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3.5 flex items-start gap-2.5 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <p className="font-bold text-red-800">File Tidak Sesuai / Header Ditolak</p>
                      <p className="mt-0.5">{memberImportError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Langkah 3 — Pratinjau Data Anggota */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full mb-1">
                      Langkah 3
                    </span>
                    <h4 className="text-sm font-bold text-slate-800">
                      Pratinjau Data Anggota ({memberImportRows.length} Anggota)
                    </h4>
                  </div>
                  <span className="px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 text-xs font-semibold">
                    Saldo Awal: Rp 0 (Default Anggota Baru)
                  </span>
                </div>

                {memberImportRows.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                    Pratinjau data anggota akan tampil di sini setelah file Excel valid diunggah.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-64">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">No. Referensi</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">NRP</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Nama</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Tanggal Lahir</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Nomor Rekening</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Status</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Tgl Awal Anggota</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Catatan Saldo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {memberImportRows.slice(0, 100).map((row, idx) => (
                          <tr key={`${row.nrp}-${idx}`} className="hover:bg-indigo-50/40">
                            <td className="px-3 py-2 font-mono text-slate-700">{row.nomor_referensi || '-'}</td>
                            <td className="px-3 py-2 font-mono text-slate-800">{row.nrp}</td>
                            <td className="px-3 py-2 font-medium text-slate-800">{row.nama}</td>
                            <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{formatTanggalLahirWithAge(row.tanggal_lahir)}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{row.bank_account_number || '-'}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-semibold">
                                {row.membership_status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{row.tgl_awal_anggota || '-'}</td>
                            <td className="px-3 py-2 text-slate-500">Saldo Awal: Rp 0 (Default Anggota Baru)</td>
                          </tr>
                        ))}
                        {memberImportRows.length > 100 && (
                          <tr>
                            <td colSpan={8} className="px-3 py-2 text-center text-slate-500 bg-slate-50">
                              ... dan {memberImportRows.length - 100} baris lainnya
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {isImporting && importProgress && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                    <div className="flex justify-between items-center text-xs font-semibold text-indigo-900 mb-1.5">
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        Menyimpan data anggota: {importProgress.current} / {importProgress.total}...
                      </span>
                      <span>
                        {importProgress.total > 0
                          ? Math.round((importProgress.current / importProgress.total) * 100)
                          : 0}%
                      </span>
                    </div>
                    <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${
                            importProgress.total > 0
                              ? Math.min(100, Math.round((importProgress.current / importProgress.total) * 100))
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseMemberImportModal}
                disabled={isImporting}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveMemberImport}
                disabled={isImporting || memberImportRows.length === 0 || Boolean(memberImportError)}
                className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Simpan &amp; Impor Data Anggota
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {isInitialSavingsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/30">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Upload Saldo Awal Simpanan</h3>
                  <p className="text-xs text-slate-300">
                    Pokok, Wajib, Belanja, dan Lebaran dengan tanggal cut-off aktif &amp; verifikasi admin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseInitialSavingsModal}
                disabled={isSavingInitialSavings}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
              {/* Langkah 1 — Unduh Template */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full mb-1">
                    Langkah 1
                  </span>
                  <h4 className="text-sm font-bold text-slate-800">Unduh Template Saldo Awal Simpanan</h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Template berisi 7 kolom (<code className="bg-slate-100 px-1 rounded">nomor_referensi</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">nrp</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">nama</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">jumlah_simpanan_pokok</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">jumlah_simpanan_wajib</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">jumlah_simpanan_belanja</code>,{' '}
                    <code className="bg-slate-100 px-1 rounded">jumlah_simpanan_lebaran</code>) terisi daftar anggota aktif.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadInitialSavingsTemplate}
                  disabled={isDownloadingSavingsTemplate || isSavingInitialSavings}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-emerald-600 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 text-sm font-semibold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isDownloadingSavingsTemplate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Unduh Template Saldo Awal (.xlsx)
                </button>
              </div>

              {/* Langkah 2 — Pilih File Excel & Tanggal Aktif Saldo Awal */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full mb-1">
                    Langkah 2
                  </span>
                  <h4 className="text-sm font-bold text-slate-800">Pilih File Excel &amp; Tanggal Aktif Saldo Awal</h4>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50">
                  <input
                    ref={initialSavingsInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleInitialSavingsFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => initialSavingsInputRef.current?.click()}
                    disabled={isSavingInitialSavings}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-sm font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Pilih File Excel (.xlsx / .xls)
                  </button>
                  <div className="text-xs text-slate-600">
                    {initialSavingsFileName ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        {initialSavingsFileName} ({initialSavingsRows.length} baris anggota terbaca)
                      </span>
                    ) : (
                      <span>Belum ada file dipilih. Silakan pilih file Excel yang sudah diisi nominal saldo awal.</span>
                    )}
                  </div>
                </div>

                {initialSavingsError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3.5 flex items-start gap-2.5 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <p className="font-bold text-red-800">File Tidak Sesuai / Header Ditolak</p>
                      <p className="mt-0.5">{initialSavingsError}</p>
                    </div>
                  </div>
                )}

                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2">
                  <label className="block text-sm font-bold text-slate-800">
                    Tanggal Saldo Awal Dinyatakan Aktif <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={initialSavingsDate}
                    onChange={(e) => setInitialSavingsDate(e.target.value)}
                    className="w-full sm:w-64 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <p className="text-xs text-slate-600">
                    Saldo awal simpanan akan dibukukan efektif mulai tanggal ini sebagai dasar perhitungan simpanan selanjutnya.
                  </p>
                </div>
              </div>

              {/* Langkah 3 — Tabel Pratinjau Data */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full mb-1">
                      Langkah 3
                    </span>
                    <h4 className="text-sm font-bold text-slate-800">
                      Pratinjau Data Saldo Awal ({initialSavingsRows.length} Anggota)
                    </h4>
                  </div>
                  {initialSavingsRows.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        Pokok: {formatCurrency(initialSavingsRows.reduce((s, r) => s + r.jumlah_simpanan_pokok, 0))}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-semibold">
                        Wajib: {formatCurrency(initialSavingsRows.reduce((s, r) => s + r.jumlah_simpanan_wajib, 0))}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-purple-50 text-purple-800 border border-purple-200 font-semibold">
                        Belanja: {formatCurrency(initialSavingsRows.reduce((s, r) => s + r.jumlah_simpanan_belanja, 0))}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                        Lebaran: {formatCurrency(initialSavingsRows.reduce((s, r) => s + r.jumlah_simpanan_lebaran, 0))}
                      </span>
                    </div>
                  )}
                </div>

                {initialSavingsRows.some((r) => r.isValid === false) && (
                  <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-800 space-y-1.5">
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>⚠️ Ditemukan {initialSavingsRows.filter((r) => r.isValid === false).length} Data Anggota Belum Terdaftar / Nama Tidak Cocok</span>
                    </div>
                    <p className="text-xs leading-relaxed">
                      Setiap penerima saldo awal wajib memiliki <strong>NRP dan Nama yang sama persis</strong> dengan data induk anggota di sistem. Silakan daftarkan/perbarui data anggota tersebut terlebih dahulu melalui menu <strong>"Import Data Anggota"</strong> atau <strong>"+ Tambah Anggota"</strong> sebelum mengunggah saldo awalnya.
                    </p>
                  </div>
                )}

                {initialSavingsRows.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
                    Pratinjau data akan tampil di sini setelah file Excel diunggah.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-60">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">No. Referensi</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">NRP</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Nama</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Pokok</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Wajib</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Belanja</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Lebaran</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200 text-right">Total</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-slate-200">Status Validasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {initialSavingsRows.slice(0, 100).map((row, idx) => {
                          const total =
                            row.jumlah_simpanan_pokok +
                            row.jumlah_simpanan_wajib +
                            row.jumlah_simpanan_belanja +
                            row.jumlah_simpanan_lebaran;
                          const isRowValid = row.isValid !== false;
                          const statusBadgeLabel = row.errorMessage?.includes('belum terdaftar')
                            ? '✗ NRP Belum Terdaftar'
                            : row.errorMessage?.includes('Nama tidak cocok')
                            ? '✗ Nama Tidak Sesuai'
                            : '✗ Data Tidak Valid';
                          return (
                            <tr key={`${row.nrp}-${idx}`} className={isRowValid ? 'hover:bg-slate-50' : 'bg-red-50/70'}>
                              <td className="px-3 py-2 font-mono text-slate-700">{row.nomor_referensi || '-'}</td>
                              <td className="px-3 py-2 font-mono text-slate-800">{row.nrp}</td>
                              <td className="px-3 py-2 font-medium text-slate-800">{row.nama}</td>
                              <td className="px-3 py-2 text-right text-emerald-700 font-medium">
                                {formatCurrency(row.jumlah_simpanan_pokok)}
                              </td>
                              <td className="px-3 py-2 text-right text-blue-700 font-medium">
                                {formatCurrency(row.jumlah_simpanan_wajib)}
                              </td>
                              <td className="px-3 py-2 text-right text-purple-700 font-medium">
                                {formatCurrency(row.jumlah_simpanan_belanja)}
                              </td>
                              <td className="px-3 py-2 text-right text-amber-700 font-medium">
                                {formatCurrency(row.jumlah_simpanan_lebaran)}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-slate-900">
                                {formatCurrency(total)}
                              </td>
                              <td className="px-3 py-2">
                                {isRowValid ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                                    ✓ Cocok
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold">
                                      {statusBadgeLabel}
                                    </span>
                                    {row.errorMessage && (
                                      <p className="text-[10px] text-red-700 leading-snug">{row.errorMessage}</p>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {initialSavingsRows.length > 100 && (
                          <tr>
                            <td colSpan={9} className="px-3 py-2 text-center text-slate-500 bg-slate-50">
                              ... dan {initialSavingsRows.length - 100} baris lainnya
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Langkah 4 — Keterangan & Kotak Pernyataan Verifikasi Wajib */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Pengunggahan ini menggunakan prinsip <strong>Clean Overwrite</strong> pada transaksi saldo awal/migrasi sebelumnya agar saldo tidak terhitung ganda jika dilakukan unggah ulang.
                  </span>
                </div>

                <label className="flex items-start gap-3 p-4 rounded-xl border border-blue-200 bg-blue-50/70 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isInitialSavingsConfirmed}
                    onChange={(e) => setIsInitialSavingsConfirmed(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-xs leading-relaxed text-slate-700">
                    <strong>Pernyataan Verifikasi Saldo Awal:</strong> Saya menyatakan bahwa data Excel yang diunggah ini telah diperiksa dan dianggap <strong>sudah benar</strong>, akan ditetapkan menjadi <strong>saldo awal Simpanan Pokok, Wajib, Belanja, dan Lebaran</strong> untuk pembukuan mulai selanjutnya, serta mulai aktif berlaku sebagai saldo awal sejak tanggal{' '}
                    <strong className="text-blue-800 underline">
                      {initialSavingsDate
                        ? new Date(`${initialSavingsDate}T00:00:00`).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : '[Pilih Tanggal di Atas]'}
                    </strong>.
                  </span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white border-t border-slate-200">
              {isSavingInitialSavings && savingsImportProgress && (
                <div className="mb-3 rounded-xl border border-indigo-200/80 bg-indigo-50/70 px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold text-indigo-700">
                    <div className="flex items-center gap-2 truncate">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-indigo-600" />
                      <span className="truncate">
                        Menyimpan saldo awal simpanan: {savingsImportProgress.current} / {savingsImportProgress.total}
                        {savingsImportProgress.memberName ? ` (${savingsImportProgress.memberName})` : ''}...
                      </span>
                    </div>
                    <span className="shrink-0 font-bold tabular-nums">
                      {savingsImportProgress.total > 0
                        ? Math.min(100, Math.round((savingsImportProgress.current / savingsImportProgress.total) * 100))
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-200 ease-out"
                      style={{
                        width: `${
                          savingsImportProgress.total > 0
                            ? Math.min(100, Math.round((savingsImportProgress.current / savingsImportProgress.total) * 100))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseInitialSavingsModal}
                  disabled={isSavingInitialSavings}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveInitialSavings}
                  disabled={
                    isSavingInitialSavings ||
                    initialSavingsRows.length === 0 ||
                    initialSavingsRows.some((r) => r.isValid === false) ||
                    !initialSavingsDate ||
                    !isInitialSavingsConfirmed
                  }
                  className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingInitialSavings ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Simpan &amp; Aktifkan Saldo Awal
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInitialLoansModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-amber-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">Upload Saldo Awal Pinjaman</h3>
                  <p className="text-xs text-slate-300">
                    Migrasi saldo pinjaman aktif sesuai jenis pinjaman Master Produk beserta jadwal angsuran &amp; verifikasi admin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseInitialLoansModal}
                disabled={isSavingInitialLoans}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-amber-50/20">
              {/* Langkah 1 — Unduh Template */}
              <div className="bg-white rounded-xl border border-amber-200/80 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mb-1">
                    Langkah 1
                  </span>
                  <h4 className="text-sm font-bold text-slate-800">Unduh Template Saldo Awal Pinjaman</h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Template berisi 9 kolom (<code className="bg-amber-50 px-1 rounded">nomor_referensi</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">nrp</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">nama</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">jenis_pinjaman</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">jumlah_pinjaman</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">tgl_awal_pinjaman</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">nilai_angsuran</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">tenor</code>,{' '}
                    <code className="bg-amber-50 px-1 rounded">total_terangsur</code>) beserta sheet referensi jenis pinjaman aktif Master Produk.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadInitialLoansTemplate}
                  disabled={isDownloadingLoansTemplate || isSavingInitialLoans}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500 text-amber-700 bg-amber-50 hover:bg-amber-100 text-sm font-semibold transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isDownloadingLoansTemplate ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Unduh Template Saldo Awal Pinjaman (.xlsx)
                </button>
              </div>

              {/* Langkah 2 — Pilih File Excel Saldo Awal Pinjaman */}
              <div className="bg-white rounded-xl border border-orange-200/80 p-4 space-y-4">
                <div>
                  <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-orange-800 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full mb-1">
                    Langkah 2
                  </span>
                  <h4 className="text-sm font-bold text-slate-800">Pilih File Excel Saldo Awal Pinjaman</h4>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 rounded-xl border border-dashed border-amber-300 bg-amber-50/40">
                  <input
                    ref={initialLoansInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleInitialLoansFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => initialLoansInputRef.current?.click()}
                    disabled={isSavingInitialLoans}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-700 text-sm font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    Pilih File Excel (.xlsx / .xls)
                  </button>
                  <div className="text-xs text-slate-600">
                    {initialLoansFileName ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-800">
                        <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                        {initialLoansFileName} ({initialLoansRows.length} baris pinjaman terbaca)
                      </span>
                    ) : (
                      <span>Belum ada file dipilih. Silakan pilih file Excel saldo awal pinjaman yang sudah diisi.</span>
                    )}
                  </div>
                </div>

                {initialLoansError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3.5 flex items-start gap-2.5 text-xs">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <p className="font-bold text-red-800">File Tidak Sesuai / Header Ditolak</p>
                      <p className="mt-0.5">{initialLoansError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Langkah 3 — Tabel Pratinjau Data Pinjaman */}
              <div className="bg-white rounded-xl border border-amber-200/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="inline-block text-[11px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full mb-1">
                      Langkah 3
                    </span>
                    <h4 className="text-sm font-bold text-slate-800">
                      Pratinjau Data Saldo Awal Pinjaman ({initialLoansRows.length} Pinjaman)
                    </h4>
                  </div>
                  {initialLoansRows.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-semibold">
                        Total Pinjaman: {formatCurrency(initialLoansRows.reduce((s, r) => s + r.jumlah_pinjaman, 0))}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                        Total Terangsur: {formatCurrency(initialLoansRows.reduce((s, r) => s + r.total_terangsur, 0))}
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-orange-50 text-orange-900 border border-orange-200 font-semibold">
                        Sisa Pinjaman: {formatCurrency(initialLoansRows.reduce((s, r) => s + r.sisa_pinjaman, 0))}
                      </span>
                    </div>
                  )}
                </div>

                {initialLoansRows.some((r) => !r.isValid) && (
                  <div className="p-4 rounded-xl border border-red-300 bg-red-50 text-red-800 space-y-1.5">
                    <div className="font-bold text-sm flex items-center gap-2">
                      <span>⚠️ Ditemukan {initialLoansRows.filter((r) => !r.isValid).length} Data Anggota Belum Terdaftar / Nama Tidak Cocok</span>
                    </div>
                    <p className="text-xs leading-relaxed">
                      Setiap penerima saldo awal wajib memiliki <strong>NRP dan Nama yang sama persis</strong> dengan data induk anggota di sistem. Silakan daftarkan/perbarui data anggota tersebut terlebih dahulu melalui menu <strong>"Import Data Anggota"</strong> atau <strong>"+ Tambah Anggota"</strong> sebelum mengunggah saldo awalnya.
                    </p>
                  </div>
                )}

                {initialLoansRows.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-amber-200 rounded-lg bg-amber-50/30">
                    Pratinjau data pinjaman akan tampil di sini setelah file Excel diunggah.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-64">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-amber-50 text-slate-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200">No. Referensi</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200">NRP</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200">Nama</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200">Jenis Pinjaman</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200 text-right">Jumlah Pinjaman</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200">Tgl Awal Pinjaman</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200 text-right">Nilai Angsuran</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200 text-center">Tenor</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200 text-right">Total Terangsur</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200 text-right">Sisa Pinjaman</th>
                          <th className="px-3 py-2.5 font-semibold border-b border-amber-200">Status Validasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {initialLoansRows.slice(0, 100).map((row, idx) => {
                          const loanStatusBadgeLabel = row.errorMessage?.includes('belum terdaftar')
                            ? '✗ NRP Belum Terdaftar'
                            : row.errorMessage?.includes('Nama tidak cocok')
                            ? '✗ Nama Tidak Sesuai'
                            : '✗ Jenis Pinjaman Tidak Sesuai';
                          return (
                            <tr key={`${row.nrp}-${row.jenis_pinjaman}-${idx}`} className={row.isValid ? 'hover:bg-amber-50/40' : 'bg-red-50/70'}>
                              <td className="px-3 py-2 font-mono text-slate-700">{row.nomor_referensi || '-'}</td>
                              <td className="px-3 py-2 font-mono text-slate-800">{row.nrp}</td>
                              <td className="px-3 py-2 font-medium text-slate-800">{row.nama}</td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-slate-800">{row.loan_type_name}</div>
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-slate-800">
                                {formatCurrency(row.jumlah_pinjaman)}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{row.tgl_awal_pinjaman || '-'}</td>
                              <td className="px-3 py-2 text-right text-slate-700">
                                {formatCurrency(row.nilai_angsuran)}
                              </td>
                              <td className="px-3 py-2 text-center font-medium text-slate-700">
                                {row.tenor} bln
                              </td>
                              <td className="px-3 py-2 text-right text-emerald-700 font-medium">
                                {formatCurrency(row.total_terangsur)}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-amber-800">
                                {formatCurrency(row.sisa_pinjaman)}
                              </td>
                              <td className="px-3 py-2">
                                {row.isValid ? (
                                  <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-semibold">
                                    ✓ Cocok
                                  </span>
                                ) : (
                                  <div className="space-y-1">
                                    <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 text-[11px] font-semibold">
                                      {loanStatusBadgeLabel}
                                    </span>
                                    {row.errorMessage && (
                                      <p className="text-[10px] text-red-700 leading-snug">{row.errorMessage}</p>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {initialLoansRows.length > 100 && (
                          <tr>
                            <td colSpan={11} className="px-3 py-2 text-center text-slate-500 bg-slate-50">
                              ... dan {initialLoansRows.length - 100} baris lainnya
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Langkah 4 — Kotak Pernyataan & Konfirmasi Wajib */}
              <div className="bg-white rounded-xl border border-amber-200/80 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-orange-900 bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>
                    Pengunggahan ini menggunakan prinsip <strong>Clean Overwrite</strong> pada pinjaman saldo awal sebelumnya untuk anggota &amp; jenis pinjaman yang sama agar kewajiban pinjaman tidak ganda.
                  </span>
                </div>

                <label className="flex items-start gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isInitialLoansConfirmed}
                    onChange={(e) => setIsInitialLoansConfirmed(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs leading-relaxed text-slate-800">
                    <strong>Pernyataan Konfirmasi Saldo Awal Pinjaman:</strong> Saya sepenuhnya mengerti dan menyatakan bahwa data pinjaman yang diunggah ini telah diperiksa dan dianggap <strong>sudah benar</strong>, akan ditetapkan menjadi <strong>saldo awal pinjaman serta jadwal angsuran berjalan</strong> mulai dari bulan berikutnya setelah tanggal awal pinjaman sampai dinyatakan lunas nanti.
                  </span>
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white border-t border-amber-200 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseInitialLoansModal}
                disabled={isSavingInitialLoans}
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveInitialLoans}
                disabled={
                  isSavingInitialLoans ||
                  initialLoansRows.length === 0 ||
                  initialLoansRows.some((r) => !r.isValid) ||
                  !isInitialLoansConfirmed
                }
                className="inline-flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingInitialLoans ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Simpan &amp; Aktifkan Saldo Awal Pinjaman
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
