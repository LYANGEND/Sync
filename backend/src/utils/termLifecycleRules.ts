import { AcademicTermStatus } from '@prisma/client';

export type TermWriteCategory =
  | 'SETUP'
  | 'ACADEMIC_ACTIVITY'
  | 'FINALIZATION'
  | 'FINANCIAL_OBLIGATION'
  | 'FINANCIAL_RECEIPT'
  | 'FINANCIAL_ADJUSTMENT'
  | 'HISTORICAL_AMENDMENT';

const ALLOWED_TRANSITIONS: Record<AcademicTermStatus, ReadonlySet<AcademicTermStatus>> = {
  DRAFT: new Set([AcademicTermStatus.ACTIVE]),
  ACTIVE: new Set([AcademicTermStatus.CLOSING]),
  CLOSING: new Set([AcademicTermStatus.ACTIVE, AcademicTermStatus.CLOSED]),
  CLOSED: new Set(),
};

const ALLOWED_WRITES: Record<AcademicTermStatus, ReadonlySet<TermWriteCategory>> = {
  DRAFT: new Set(['SETUP']),
  ACTIVE: new Set([
    'SETUP',
    'ACADEMIC_ACTIVITY',
    'FINALIZATION',
    'FINANCIAL_OBLIGATION',
    'FINANCIAL_RECEIPT',
    'FINANCIAL_ADJUSTMENT',
  ]),
  CLOSING: new Set(['FINALIZATION', 'FINANCIAL_RECEIPT', 'FINANCIAL_ADJUSTMENT']),
  // Settlement corrections remain valid after academic close. The service layer
  // limits this category to auditable refund, void, and credit-note workflows;
  // it does not reopen academic activity or create new obligations.
  CLOSED: new Set(['FINANCIAL_RECEIPT', 'FINANCIAL_ADJUSTMENT', 'HISTORICAL_AMENDMENT']),
};

export const canTransitionTerm = (
  from: AcademicTermStatus,
  to: AcademicTermStatus,
): boolean => from === to || ALLOWED_TRANSITIONS[from].has(to);

export const canWriteToTerm = (
  status: AcademicTermStatus,
  category: TermWriteCategory,
  hasApprovedAmendment = false,
): boolean => {
  if (category === 'HISTORICAL_AMENDMENT') {
    return status === AcademicTermStatus.CLOSED && hasApprovedAmendment;
  }

  return ALLOWED_WRITES[status].has(category);
};

export const lifecycleStatusForActiveFlag = (isActive: boolean): AcademicTermStatus => (
  isActive ? AcademicTermStatus.ACTIVE : AcademicTermStatus.DRAFT
);

export const activeFlagForLifecycleStatus = (status: AcademicTermStatus): boolean => (
  status === AcademicTermStatus.ACTIVE
);
