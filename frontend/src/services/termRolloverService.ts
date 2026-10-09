import api from '../utils/api';

export type AcademicTermStatus = 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
export type TermRolloverType = 'WITHIN_YEAR' | 'YEAR_END';
export type StudentTransitionAction =
  | 'CARRY_FORWARD'
  | 'PROMOTE'
  | 'RETAIN'
  | 'GRADUATE'
  | 'TRANSFER'
  | 'WITHDRAW';
export type TermRolloverStatus =
  | 'DRAFT'
  | 'PREPARING'
  | 'PREPARED'
  | 'READY'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
export type RolloverCopyCategory =
  | 'SUBJECT_LINKS'
  | 'TEACHER_ASSIGNMENTS'
  | 'FEE_TEMPLATES'
  | 'CLASS_FEE_ASSIGNMENTS'
  | 'TIMETABLE'
  | 'LESSON_PLANS';
export type RolloverPlanCategory = 'CLASS_COHORTS' | 'CLASS_OFFERINGS' | RolloverCopyCategory;

export const ROLLOVER_COPY_CATEGORIES: Array<{
  id: RolloverCopyCategory;
  label: string;
  description: string;
}> = [
  { id: 'SUBJECT_LINKS', label: 'Subject links', description: 'Connect the same subjects to prepared classes.' },
  { id: 'TEACHER_ASSIGNMENTS', label: 'Teacher assignments', description: 'Carry forward subject-teacher setup.' },
  { id: 'FEE_TEMPLATES', label: 'Fee templates', description: 'Copy editable fee templates, not pupil debt.' },
  { id: 'CLASS_FEE_ASSIGNMENTS', label: 'Class fee assignments', description: 'Attach copied templates to prepared classes.' },
  { id: 'TIMETABLE', label: 'Timetable', description: 'Copy timetable periods and class joins.' },
  { id: 'LESSON_PLANS', label: 'Lesson plans', description: 'Copy editable teaching plans with shifted dates.' },
];

export interface AcademicTermOption {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  academicYearId: string | null;
  sequence: number | null;
  status: AcademicTermStatus;
  isActive: boolean;
  version: number;
}

export interface AcademicYearSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  termCount: number;
}

export interface RolloverTerm extends AcademicTermOption {
  academicYear: AcademicYearSummary | null;
}

export interface YearEndCohortMapping {
  sourceCohortId: string;
  targetName?: string;
  targetGradeLevel?: number;
  skip?: boolean;
}

export interface TermRolloverConfiguration {
  copyCategories: RolloverCopyCategory[];
  yearEndMappings: YearEndCohortMapping[];
  preparation?: {
    sourceHash: string;
    preparedHash: string;
    preparedAt: string;
    preparedByUserId: string;
    taskCount: number;
  };
  enrollmentStaging?: EnrollmentStagingMetadata;
}

export interface TermRolloverTask {
  id: string;
  category: RolloverPlanCategory;
  operationKey: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  sourceEntityId: string | null;
  targetEntityId: string | null;
  attemptCount: number;
  resultData: unknown;
  errorData: unknown;
  completedAt: string | null;
}

export interface TermRolloverEvent {
  id: string;
  sequence: number;
  type: string;
  payload: unknown;
  actorUserId: string | null;
  createdAt: string;
}

export interface TermRolloverSummary {
  id: string;
  sourceTermId: string;
  targetTermId: string;
  transitionType: TermRolloverType;
  status: TermRolloverStatus;
  idempotencyKey: string;
  inputHash: string | null;
  configuration: TermRolloverConfiguration | null;
  failureCode: string | null;
  failureMessage: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  sourceTerm: RolloverTerm;
  targetTerm: RolloverTerm;
  _count?: { tasks: number; events: number };
}

export interface TermRolloverDetail extends TermRolloverSummary {
  tasks: TermRolloverTask[];
  events: TermRolloverEvent[];
}

export interface RolloverIssue {
  code: string;
  severity: 'BLOCKER' | 'WARNING';
  message: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export interface RolloverPlanCount {
  planned: number;
  create: number;
  reuse: number;
  skip: number;
}

export interface YearEndMappingPlan {
  sourceCohortId: string;
  sourceName: string;
  sourceGradeLevel: number;
  branchId: string | null;
  configured: boolean;
  skip: boolean;
  targetName: string;
  targetGradeLevel: number;
}

export interface TargetOperationalActivity {
  total: number;
  counts: Record<string, number>;
}

export interface TermRolloverPlan {
  rolloverId: string;
  transitionType: TermRolloverType;
  sourceTerm: Pick<RolloverTerm, 'id' | 'name' | 'status' | 'academicYearId' | 'sequence'>;
  targetTerm: Pick<RolloverTerm, 'id' | 'name' | 'status' | 'academicYearId' | 'sequence'>;
  configuration: TermRolloverConfiguration;
  inputHash: string;
  sourceHash: string;
  targetBaselineHash: string;
  counts: Record<RolloverPlanCategory, RolloverPlanCount>;
  issues: RolloverIssue[];
  yearEndMappings: YearEndMappingPlan[];
  operationalActivity: TargetOperationalActivity;
  canPrepare: boolean;
}

export interface TermRolloverValidation {
  rolloverId: string;
  prepared: boolean;
  sourceChanged: boolean;
  manualChangesDetected: boolean;
  preparedHash: string | null;
  currentPreparedHash: string;
  operationalActivity: TargetOperationalActivity;
  issues: RolloverIssue[];
  valid: boolean;
}

export interface CreateTermRolloverInput {
  sourceTermId: string;
  targetTermId: string;
  transitionType: TermRolloverType;
  idempotencyKey: string;
  configuration: Pick<TermRolloverConfiguration, 'copyCategories' | 'yearEndMappings'>;
}

export interface EnrollmentStagingMetadata {
  sourceHash: string;
  decisionHash: string;
  targetHash: string;
  reviewedInputHash: string;
  outcomeHash: string;
  stagedAt: string;
  stagedByUserId: string;
  eligibleCount: number;
  enrollmentCount: number;
  terminalCount: number;
}

export interface RolloverEnrollmentIssue extends RolloverIssue {
  studentId?: string;
  sourceEnrollmentId?: string;
}

export interface RolloverTargetClassOption {
  id: string;
  name: string;
  gradeLevel: number;
  branchId: string | null;
  classCohortId: string | null;
  actions: Array<'CARRY_FORWARD' | 'PROMOTE' | 'RETAIN'>;
}

export type RolloverEnrollmentOutcomeState =
  | 'DECISION_REQUIRED'
  | 'READY_TO_STAGE'
  | 'STAGED'
  | 'TERMINAL'
  | 'BLOCKED';

export interface RolloverEnrollmentOutcome {
  studentId: string;
  sourceEnrollmentId: string;
  admissionNumber: string;
  studentName: string;
  sourceClass: {
    id: string;
    name: string;
    gradeLevel: number;
    branchId: string | null;
    classCohortId: string | null;
  };
  decision: {
    id: string;
    action: StudentTransitionAction;
    targetClassId: string | null;
    reason: string | null;
    decidedByUserId: string | null;
    updatedAt: string;
  } | null;
  action: StudentTransitionAction | null;
  targetClassId: string | null;
  mappedTargetClassId: string | null;
  targetOptions: RolloverTargetClassOption[];
  targetEnrollmentId: string | null;
  state: RolloverEnrollmentOutcomeState;
}

export interface TermRolloverEnrollmentSummary {
  eligibleCount: number;
  excludedCount: number;
  decisionCount: number;
  missingDecisionCount: number;
  stagedEnrollmentCount: number;
  terminalOutcomeCount: number;
  completeOutcomeCount: number;
}

export interface TermRolloverEnrollmentPlan {
  rolloverId: string;
  transitionType: TermRolloverType;
  rolloverStatus: TermRolloverStatus;
  sourceTerm: { id: string; name: string; status: AcademicTermStatus };
  targetTerm: { id: string; name: string; status: AcademicTermStatus };
  sourceHash: string;
  decisionHash: string;
  targetHash: string;
  inputHash: string;
  currentOutcomeHash: string;
  targetClasses: RolloverTargetClassOption[];
  outcomes: RolloverEnrollmentOutcome[];
  summary: TermRolloverEnrollmentSummary;
  preparationValid: boolean;
  staging: EnrollmentStagingMetadata | null;
  staged: boolean;
  issues: RolloverEnrollmentIssue[];
  canStage: boolean;
}

export interface YearEndTransitionDecisionInput {
  studentId: string;
  action: Exclude<StudentTransitionAction, 'CARRY_FORWARD'>;
  targetClassId?: string | null;
  reason?: string | null;
}

export interface TermRolloverEnrollmentValidation {
  rolloverId: string;
  staged: boolean;
  sourceChanged: boolean;
  decisionsChanged: boolean;
  targetMappingsChanged: boolean;
  outcomesChanged: boolean;
  summary: TermRolloverEnrollmentSummary;
  staging: EnrollmentStagingMetadata | null;
  issues: RolloverEnrollmentIssue[];
  valid: boolean;
}

/** Safe readiness metadata only. Restore artifacts remain in protected server storage. */
export interface RolloverReadinessIssue {
  id: string;
  code: string;
  severity: 'BLOCKER' | 'WARNING';
  message: string;
  affectedRecords: Array<{ entityType: string; entityId: string }>;
  remediationLink: string;
}

export interface RolloverReadinessDTO {
  rolloverId: string;
  fingerprint: string;
  warningHash: string;
  summary: { blockerCount: number; warningCount: number };
  issues: RolloverReadinessIssue[];
  evidence: {
    current: boolean;
    warningsAcknowledged: boolean;
    backupVerified: boolean;
    approved: boolean;
    backupReference?: string;
    backupChecksum?: string;
    backupVerifiedAt?: string;
  };
  canApprove: boolean;
}

export interface RolloverWarningAcknowledgement {
  warningId: string;
  reason: string;
}

export const getRolloverErrorMessage = (error: unknown): string => {
  const response = (error as {
    response?: { data?: { error?: string | Array<{ message?: string }> } };
    message?: string;
  }).response;
  const apiError = response?.data?.error;
  if (typeof apiError === 'string') return apiError;
  if (Array.isArray(apiError)) return apiError.map(item => item.message).filter(Boolean).join('. ');
  return (error as { message?: string }).message || 'The term preparation request failed.';
};

export const termRolloverService = {
  getTerms: async () => (await api.get<AcademicTermOption[]>('/academic-terms')).data,
  list: async () => (await api.get<TermRolloverSummary[]>('/term-rollovers')).data,
  get: async (id: string) => (await api.get<TermRolloverDetail>(`/term-rollovers/${id}`)).data,
  create: async (input: CreateTermRolloverInput) => (
    await api.post<{ rollover: TermRolloverSummary; reused: boolean }>('/term-rollovers', input)
  ).data,
  updateConfiguration: async (
    id: string,
    input: Pick<TermRolloverConfiguration, 'copyCategories' | 'yearEndMappings'> & { expectedVersion?: number },
  ) => (await api.patch<TermRolloverDetail>(`/term-rollovers/${id}/configuration`, input)).data,
  dryRun: async (id: string) => (
    await api.post<TermRolloverPlan>(`/term-rollovers/${id}/dry-run`)
  ).data,
  prepare: async (id: string, expectedInputHash: string) => (
    await api.post<{
      rollover: TermRolloverDetail;
      counts: Record<RolloverPlanCategory, RolloverPlanCount>;
      manualChangesDetected: boolean;
      reused: boolean;
    }>(`/term-rollovers/${id}/prepare`, { expectedInputHash })
  ).data,
  validate: async (id: string) => (
    await api.get<TermRolloverValidation>(`/term-rollovers/${id}/validation`)
  ).data,
  getEnrollmentPlan: async (id: string) => (
    await api.get<TermRolloverEnrollmentPlan>(`/term-rollovers/${id}/enrollment-plan`)
  ).data,
  saveEnrollmentDecisions: async (
    id: string,
    expectedInputHash: string,
    decisions: YearEndTransitionDecisionInput[],
  ) => (await api.put<{ plan: TermRolloverEnrollmentPlan; reused: boolean }>(
    `/term-rollovers/${id}/enrollment-decisions`,
    { expectedInputHash, decisions },
  )).data,
  stageEnrollments: async (id: string, expectedInputHash: string) => (
    await api.post<{ plan: TermRolloverEnrollmentPlan; reused: boolean }>(
      `/term-rollovers/${id}/stage-enrollments`,
      { expectedInputHash },
    )
  ).data,
  validateEnrollments: async (id: string) => (
    await api.get<TermRolloverEnrollmentValidation>(
      `/term-rollovers/${id}/enrollment-validation`,
    )
  ).data,
  preflight: async (id: string) => (
    await api.post<RolloverReadinessDTO>(`/term-rollovers/${id}/preflight`)
  ).data,
  acknowledgeWarnings: async (
    id: string, expectedFingerprint: string, acknowledgements: RolloverWarningAcknowledgement[],
  ) => (await api.put<RolloverReadinessDTO>(`/term-rollovers/${id}/warning-acknowledgements`, {
    expectedFingerprint, acknowledgements,
  })).data,
  createBackup: async (id: string, expectedFingerprint: string) => (
    await api.post<RolloverReadinessDTO>(`/term-rollovers/${id}/backup`, { expectedFingerprint })
  ).data,
  verifyBackup: async (id: string, expectedFingerprint: string) => (
    await api.post<RolloverReadinessDTO>(`/term-rollovers/${id}/verify-backup`, { expectedFingerprint })
  ).data,
  approveReadiness: async (id: string, expectedFingerprint: string) => (
    await api.post<RolloverReadinessDTO>(`/term-rollovers/${id}/approve`, { expectedFingerprint })
  ).data,
};
