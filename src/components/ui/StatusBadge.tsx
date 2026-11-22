import React from 'react';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';

export type StatusType =
  | 'lunas'
  | 'berjalan'
  | 'jatuh_tempo'
  | 'pending'
  | 'belum'
  | 'approved'
  | 'paid'
  | 'rejected'
  | 'active'
  | 'disbursed'
  | 'completed'
  | 'paid_off'
  | 'draft'
  | 'ditolak';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  let colorClass = '';
  let Icon = null;
  let label: string = status;
  const normalizedStatus = String(status || '').trim().toLowerCase();

  switch (normalizedStatus) {
    case 'lunas':
    case 'paid':
    case 'paid_off':
    case 'completed':
      colorClass = 'bg-[#e5ffef] text-[#00a270] border-[#b0ebd5]'; // matching green from Stitch theme
      Icon = CheckCircle;
      label = 'Lunas';
      break;
    case 'berjalan':
    case 'approved':
    case 'active':
    case 'disbursed':
      colorClass = 'bg-[#e5eeff] text-[#005049] border-[#b0c9e8]'; // matching primary/surface from Stitch theme
      Icon = Clock;
      label = 'Berjalan';
      break;
    case 'jatuh_tempo':
    case 'rejected':
    case 'ditolak':
      colorClass = 'bg-[#ffdad6] text-[#ba1a1a] border-[#ffb4ab]'; // matching error from Stitch theme
      Icon = XCircle;
      label = normalizedStatus === 'jatuh_tempo' ? 'Jatuh Tempo' : 'Ditolak';
      break;
    case 'pending':
    case 'belum':
    case 'draft':
    default:
      colorClass = 'bg-[#fff5d6] text-[#b38500] border-[#ffe699]'; // generic yellow as it's not explicitly in theme
      Icon = AlertCircle;
      label = normalizedStatus === 'belum' ? 'Belum Bayar' : 'Pending';
      break;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass} ${className}`}>
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span className="capitalize">{label}</span>
    </span>
  );
}
