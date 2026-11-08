import React from 'react';
import LoanScheduleModal, { LoanScheduleModalProps } from '../loans/LoanScheduleModal';

export interface Props {
  loanId: string;
  memberNrp: string;
  memberName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function LoanLedgerModal(props: Props) {
  return <LoanScheduleModal {...props} />;
}

export { LoanScheduleModal };
export type { LoanScheduleModalProps };
