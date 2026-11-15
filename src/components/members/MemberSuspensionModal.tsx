import React, { useState, useEffect } from 'react';
import {
  X,
  PauseCircle,
  PlayCircle,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import { Anggota } from '../../services/koperasiService';
import { updateMemberSuspensionStatus } from '../../services/memberService';

export interface MemberSuspensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Anggota | null;
  onSuccess: (newStatus: 'ACTIVE' | 'SUSPENDED', member: Anggota) => void | Promise<void>;
}

export default function MemberSuspensionModal({
  isOpen,
  onClose,
  member,
  onSuccess,
}: MemberSuspensionModalProps) {
  const currentStatus: 'ACTIVE' | 'SUSPENDED' =
    member?.membership_status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
  const defaultTargetStatus: 'ACTIVE' | 'SUSPENDED' =
    currentStatus === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';

  const [targetStatus, setTargetStatus] = useState<'ACTIVE' | 'SUSPENDED'>(defaultTargetStatus);
  const [reason, setReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && member) {
      const nextCurrent: 'ACTIVE' | 'SUSPENDED' =
        member.membership_status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE';
      setTargetStatus(nextCurrent === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED');
      setReason('');
      setConfirmPhrase('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, member?.id, member?.membership_status]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !member) return null;

  const requiredPhrase = targetStatus === 'SUSPENDED' ? 'BEKUKAN' : 'AKTIFKAN';
  const isStatusChanged = targetStatus !== currentStatus;
  const isReasonValid = reason.trim().length >= 3;
  const isPhraseMatched = confirmPhrase.trim().toUpperCase() === requiredPhrase;
  const canSubmit = isStatusChanged && isReasonValid && isPhraseMatched && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await updateMemberSuspensionStatus({
        memberId: member.id,
        memberName: member.nama,
        memberNrp: member.nrp,
        oldStatus: currentStatus,
        newStatus: targetStatus,
        reason: reason.trim(),
      });
      await onSuccess(targetStatus, member);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal memperbarui status keanggotaan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-suspension-modal-title"
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl border ${
                targetStatus === 'SUSPENDED'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-400/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
              }`}
            >
              {targetStatus === 'SUSPENDED' ? (
                <PauseCircle className="w-5 h-5" />
              ) : (
                <PlayCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 id="member-suspension-modal-title" className="text-base font-bold tracking-tight">
                Status Keaktifan Anggota
              </h3>
              <p className="text-xs text-slate-300">
                Pembekuan sementara atau aktivasi kembali kewajiban &amp; akses anggota
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Tutup modal"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Bagian 1 — Kartu Identitas Anggota (Read-Only) */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Identitas Anggota (Read-Only)
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  currentStatus === 'SUSPENDED'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                {currentStatus === 'SUSPENDED' ? (
                  <>
                    <PauseCircle className="w-3.5 h-3.5" />
                    Nonaktif Sementara
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Aktif
                  </>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="col-span-2">
                <span className="text-slate-500 block">Nama Lengkap</span>
                <span className="font-semibold text-sm text-slate-900">{member.nama}</span>
              </div>
              <div>
                <span className="text-slate-500 block">NRP</span>
                <span className="font-mono font-semibold text-slate-800">{member.nrp}</span>
              </div>
              <div>
                <span className="text-slate-500 block">No. Referensi</span>
                <span className="font-mono font-semibold text-slate-800">
                  {member.nomor_referensi || '-'}
                </span>
              </div>
            </div>

            {currentStatus === 'SUSPENDED' && member.suspension_reason && (
              <div className="pt-2 border-t border-slate-200/80 text-[11px] text-amber-900">
                <span className="font-semibold">Alasan pembekuan sebelumnya:</span>{' '}
                {member.suspension_reason}
              </div>
            )}
          </div>

          {/* Bagian 2 — Hanya 2 Input yang Dapat Diubah */}
          <div className="space-y-1.5">
            <label
              htmlFor="member-suspension-status-select"
              className="block text-sm font-semibold text-slate-800"
            >
              Status Keanggotaan <span className="text-rose-600">*</span>
            </label>
            <select
              id="member-suspension-status-select"
              value={targetStatus}
              disabled={isSubmitting}
              onChange={(e) => {
                setTargetStatus(e.target.value as 'ACTIVE' | 'SUSPENDED');
                setConfirmPhrase('');
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
            >
              <option value="ACTIVE">Aktif (Tagihan &amp; Transaksi Berjalan Normal)</option>
              <option value="SUSPENDED">
                Nonaktif Sementara (Bekukan Tagihan Simpanan &amp; Angsuran)
              </option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="member-suspension-reason"
              className="block text-sm font-semibold text-slate-800"
            >
              Alasan / Dasar Keputusan <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="member-suspension-reason"
              rows={3}
              value={reason}
              disabled={isSubmitting}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Instruksi Pimpinan / Surat Tugas Khusus No. ..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
            {reason.trim().length > 0 && reason.trim().length < 3 && (
              <p className="text-xs text-rose-600">Alasan minimal 3 karakter.</p>
            )}
          </div>

          {/* Bagian 3 — Kotak Peringatan Dampak & Konfirmasi Ketik Teks */}
          {targetStatus === 'SUSPENDED' ? (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Dampak Pembekuan Sementara:</strong> Penagihan simpanan rutin, jadwal
                angsuran pinjaman, akses transaksi kredit kasir POS, dan pengajuan pinjaman baru
                akan dibekukan sementara tanpa mengubah NRP maupun saldo historis anggota.
              </p>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Dampak Aktivasi Kembali:</strong> Penagihan simpanan rutin, jadwal
                angsuran pinjaman berjalan, serta akses transaksi kasir POS akan diaktifkan kembali
                secara normal.
              </p>
            </div>
          )}

          {!isStatusChanged ? (
            <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-slate-500 shrink-0" />
              <span>Pilih status yang berbeda dari status saat ini untuk melanjutkan.</span>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 space-y-2">
              <p className="text-xs text-slate-700">
                Perubahan status keanggotaan berdampak langsung pada pembukuan &amp; penagihan.
                Ketik kata{' '}
                <strong className="font-mono font-bold text-rose-700 bg-white px-1.5 py-0.5 rounded border border-rose-200">
                  {requiredPhrase}
                </strong>{' '}
                di bawah ini untuk mengonfirmasi:
              </p>
              <input
                id="member-suspension-confirm-input"
                type="text"
                autoComplete="off"
                disabled={isSubmitting}
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder={`Ketik ${requiredPhrase} di sini`}
                className="w-full px-3 py-2 rounded-lg border border-rose-300 bg-white font-mono text-center uppercase tracking-widest text-sm font-bold text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                targetStatus === 'SUSPENDED'
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Menyimpan...
                </>
              ) : targetStatus === 'SUSPENDED' ? (
                'Simpan Pembekuan Sementara'
              ) : (
                'Simpan Aktivasi Anggota'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
