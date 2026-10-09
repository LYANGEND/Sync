import { createHash } from 'node:crypto';

export type BackfillTermStatus = 'DRAFT' | 'ACTIVE' | 'CLOSING' | 'CLOSED';
export type BackfillStudentStatus =
  | 'ACTIVE'
  | 'TRANSFERRED'
  | 'GRADUATED'
  | 'DROPPED_OUT'
  | 'ARCHIVED';
export type BackfillEnrollmentStatus =
  | 'STAGED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'TRANSFERRED'
  | 'WITHDRAWN'
  | 'GRADUATED';
export type BackfillTransitionAction =
  | 'CARRY_FORWARD'
  | 'PROMOTE'
  | 'RETAIN'
  | 'GRADUATE'
  | 'TRANSFER'
  | 'WITHDRAW';
export type BackfillEvidenceSource =
  | 'REPORT'
  | 'RESULT'
  | 'ATTENDANCE';
export type BackfillOwnershipSource = 'ASSESSMENT';
export type BackfillIssueSeverity = 'BLOCKER' | 'WARNING';

export type BackfillIssueCode =
  | 'ACADEMIC_YEAR_DATE_INVALID'
  | 'ACADEMIC_YEAR_DATE_OVERLAP'
  | 'ACADEMIC_YEAR_NAME_COLLISION'
  | 'ACADEMIC_YEAR_TERM_COUNT_INVALID'
  | 'ACTIVE_TERM_COUNT_INVALID'
  | 'CLASS_COHORT_IDENTITY_MISMATCH'
  | 'CLASS_COHORT_NOT_FOUND'
  | 'CLASS_COHORT_YEAR_MISMATCH'
  | 'CLASS_TERM_NOT_FOUND'
  | 'COHORT_NORMALIZED_NAME_COLLISION'
  | 'COHORT_PREDECESSOR_AMBIGUOUS'
  | 'COHORT_PREDECESSOR_CONFLICT'
  | 'COHORT_PREDECESSOR_CYCLE'
  | 'COHORT_PREDECESSOR_NOT_INFERRED'
  | 'COHORT_SCHEMA_KEY_CONFLICT'
  | 'DRAFT_TERM_HAS_OPERATIONAL_EVIDENCE'
  | 'DUPLICATE_CLASS_OFFERING_CANDIDATE'
  | 'ENROLLMENT_CLASS_CONFLICT'
  | 'ENROLLMENT_CLASS_TERM_MISMATCH'
  | 'ENROLLMENT_DUPLICATE'
  | 'ENROLLMENT_SOURCE_INVALID'
  | 'EVIDENCE_CLASS_TERM_MISMATCH'
  | 'EVIDENCE_DATE_OUTSIDE_TERM'
  | 'EVIDENCE_ENTITY_NOT_FOUND'
  | 'SCHOOL_SETTINGS_COUNT_INVALID'
  | 'SCHOOL_SETTINGS_TERM_MISMATCH'
  | 'STUDENT_CURRENT_CLASS_NOT_FOUND'
  | 'STUDENT_CURRENT_CLASS_TERM_MISMATCH'
  | 'STUDENT_STATUS_CURRENT_PLACEMENT_CONFLICT'
  | 'TERM_ACTIVE_FLAG_MISMATCH'
  | 'TERM_CALENDAR_YEAR_INFERENCE_INCOMPLETE'
  | 'TERM_DATE_INVALID'
  | 'TERM_DATE_OVERLAP'
  | 'TERM_DATE_TIE'
  | 'TERM_EXPLICIT_YEAR_INVALID'
  | 'TERM_SEQUENCE_AMBIGUOUS'
  | 'TERM_SEQUENCE_CONFLICT'
  | 'TERM_SEQUENCE_DUPLICATE'
  | 'TERM_SEQUENCE_INVALID'
  | 'TERM_SPANS_CALENDAR_YEARS'
  | 'TERM_VERSION_INVALID'
  | 'TERM_YEAR_AMBIGUOUS'
  | 'TERM_YEAR_UNMATCHED';

export interface BackfillAcademicYearInput {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  termCount: number;
}

export interface BackfillTermInput {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  academicYearId: string | null;
  sequence: number | null;
  status: BackfillTermStatus;
  isActive: boolean;
  version: number;
}

export interface BackfillClassInput {
  id: string;
  name: string;
  gradeLevel: number;
  branchId: string | null;
  academicTermId: string;
  classCohortId: string | null;
}

export interface BackfillClassCohortInput {
  id: string;
  academicYearId: string;
  name: string;
  gradeLevel: number;
  branchId: string | null;
  predecessorCohortId: string | null;
}

export interface BackfillStudentInput {
  id: string;
  admissionNumber: string;
  status: BackfillStudentStatus;
  classId: string;
}

export interface BackfillEnrollmentInput {
  id: string;
  studentId: string;
  academicTermId: string;
  classId: string;
  status: BackfillEnrollmentStatus;
  transitionAction: BackfillTransitionAction | null;
  sourceEnrollmentId: string | null;
  startsAt: string;
  endsAt: string | null;
}

export interface BackfillEnrollmentEvidenceInput {
  source: BackfillEvidenceSource;
  evidenceRef: string;
  studentId: string;
  academicTermId: string;
  classId: string;
  recordCount: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
}

export interface BackfillOwnershipEvidenceInput {
  source: BackfillOwnershipSource;
  evidenceRef: string;
  academicTermId: string;
  classId: string;
  recordCount: number;
}

export interface BackfillMovementInput {
  id: string;
  studentId: string;
  fromClassId: string | null;
  toClassId: string;
  reason: string | null;
  createdAt: string;
}

export interface BackfillSchoolSettingsInput {
  id: string;
  currentTermId: string | null;
}

export interface TermBackfillPlannerInput {
  academicYears: BackfillAcademicYearInput[];
  terms: BackfillTermInput[];
  classes: BackfillClassInput[];
  cohorts: BackfillClassCohortInput[];
  students: BackfillStudentInput[];
  enrollments: BackfillEnrollmentInput[];
  enrollmentEvidence: BackfillEnrollmentEvidenceInput[];
  ownershipEvidence: BackfillOwnershipEvidenceInput[];
  movements: BackfillMovementInput[];
  schoolSettings: BackfillSchoolSettingsInput[];
}

export interface TermBackfillPlannerOptions {
  defaultTermCount?: number;
  inferredYearNamePrefix?: string;
  generatedAt?: string;
}

export interface TermBackfillIssue {
  severity: BackfillIssueSeverity;
  code: BackfillIssueCode;
  entityType: string;
  entityIds: string[];
  message: string;
  details?: Record<string, unknown>;
}

export interface AcademicYearCreateProposal {
  ref: string;
  name: string;
  startDate: string;
  endDate: string;
  termCount: number;
  confidence: 'HIGH';
  evidenceTermIds: string[];
}

export interface AcademicTermUpdateProposal {
  termId: string;
  expectedVersion: number;
  before: {
    academicYearId: string | null;
    sequence: number | null;
  };
  after: {
    academicYearRef: string;
    sequence: number;
  };
  reasonCodes: Array<'UNIQUE_YEAR_DATE_MATCH' | 'CALENDAR_YEAR_GROUP' | 'CHRONOLOGICAL_SEQUENCE'>;
}

export interface ClassCohortCreateProposal {
  ref: string;
  academicYearRef: string;
  name: string;
  normalizedName: string;
  gradeLevel: number;
  branchId: string | null;
  predecessorCohortRef: string | null;
  sourceClassIds: string[];
}

export interface ClassCohortUpdateProposal {
  cohortId: string;
  predecessorCohortRef: string;
  evidenceMovementIds: string[];
}

export interface ClassCohortLinkProposal {
  classId: string;
  cohortRef: string;
}

export interface StudentTermEnrollmentCreateProposal {
  ref: string;
  studentId: string;
  academicTermId: string;
  classId: string;
  status: BackfillEnrollmentStatus;
  transitionAction: BackfillTransitionAction | null;
  sourceEnrollmentRef: string | null;
  startsAt: string;
  endsAt: string | null;
  evidence: Array<{
    source: BackfillEvidenceSource | 'MOVEMENT_FROM' | 'MOVEMENT_TO' | 'CURRENT_PLACEMENT';
    refs: string[];
    recordCount: number;
  }>;
}

export interface StudentTermEnrollmentUpdateProposal {
  enrollmentId: string;
  sourceEnrollmentRef?: string;
  transitionAction?: BackfillTransitionAction;
}

export interface TermBackfillReport {
  schemaVersion: 1;
  mode: 'DRY_RUN';
  generatedAt: string;
  sourceFingerprint: string;
  canApply: boolean;
  summary: {
    source: {
      academicYears: number;
      terms: number;
      classes: number;
      cohorts: number;
      students: number;
      enrollments: number;
      enrollmentEvidence: number;
      ownershipEvidence: number;
      movements: number;
    };
    proposals: {
      academicYearsToCreate: number;
      termsToUpdate: number;
      cohortsToCreate: number;
      cohortsToUpdate: number;
      classesToLink: number;
      enrollmentsToCreate: number;
      enrollmentsToUpdate: number;
    };
    blockers: number;
    warnings: number;
  };
  proposals: {
    academicYearsToCreate: AcademicYearCreateProposal[];
    termsToUpdate: AcademicTermUpdateProposal[];
    cohortsToCreate: ClassCohortCreateProposal[];
    cohortsToUpdate: ClassCohortUpdateProposal[];
    classesToLink: ClassCohortLinkProposal[];
    enrollmentsToCreate: StudentTermEnrollmentCreateProposal[];
    enrollmentsToUpdate: StudentTermEnrollmentUpdateProposal[];
  };
  issues: TermBackfillIssue[];
}

interface ResolvedYear {
  ref: string;
  id: string | null;
  name: string;
  startDate: string;
  endDate: string;
  startMs: number;
  endMs: number;
  termCount: number;
  proposed: boolean;
}

interface CohortDescriptor {
  ref: string;
  id: string | null;
  academicYearRef: string;
  name: string;
  normalizedName: string;
  gradeLevel: number;
  branchId: string | null;
  predecessorCohortRef: string | null;
  proposed: boolean;
}

interface EnrollmentNode {
  ref: string;
  id: string | null;
  studentId: string;
  academicTermId: string;
  classId: string;
  sourceEnrollmentId: string | null;
  transitionAction: BackfillTransitionAction | null;
  proposed: boolean;
}

interface CollectedEvidence {
  source: BackfillEvidenceSource | 'MOVEMENT_FROM' | 'MOVEMENT_TO' | 'CURRENT_PLACEMENT';
  ref: string;
  recordCount: number;
  firstObservedAt?: string;
  lastObservedAt?: string;
}

const compareStrings = (left: string, right: string): number => (
  left < right ? -1 : left > right ? 1 : 0
);

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const normalized = value.map(canonicalize);
    return normalized.sort((left, right) => compareStrings(
      JSON.stringify(left),
      JSON.stringify(right),
    ));
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort(compareStrings)) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) {
        result[key] = canonicalize(child);
      }
    }
    return result;
  }

  return value;
};

const stableHash = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const stableRef = (prefix: string, value: string): string => (
  `${prefix}:${stableHash(value).slice(0, 32)}`
);

const branchKey = (branchId: string | null): string => branchId ?? '<school-wide>';

export const normalizeCohortName = (name: string): string => name
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cohortIdentityKey = (
  academicYearRef: string,
  branchId: string | null,
  gradeLevel: number,
  normalizedName: string,
): string => [academicYearRef, branchKey(branchId), gradeLevel, normalizedName].join('|');

const cohortSchemaKey = (
  academicYearRef: string,
  branchId: string | null,
  name: string,
): string => [academicYearRef, branchKey(branchId), name].join('|');

const enrollmentKey = (studentId: string, academicTermId: string): string => (
  `${studentId}|${academicTermId}`
);

const isValidDateRange = (startMs: number, endMs: number): boolean => (
  Number.isFinite(startMs) && Number.isFinite(endMs) && startMs < endMs
);

const isActiveCompatibilityFlag = (status: BackfillTermStatus): boolean => status === 'ACTIVE';

const inferredEnrollmentStatus = (status: BackfillTermStatus): BackfillEnrollmentStatus => {
  if (status === 'DRAFT') return 'STAGED';
  if (status === 'CLOSED') return 'COMPLETED';
  return 'ACTIVE';
};

const chooseCanonicalName = (names: string[]): string => {
  const counts = new Map<string, number>();
  for (const name of names.map(value => value.trim())) {
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || compareStrings(left[0], right[0]))[0][0];
};

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort(compareStrings);

const validGeneratedAt = (value: string | undefined): string => {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid generatedAt value: ${value}`);
  }
  return date.toISOString();
};

export const planTermBackfill = (
  input: TermBackfillPlannerInput,
  options: TermBackfillPlannerOptions = {},
): TermBackfillReport => {
  const defaultTermCount = options.defaultTermCount ?? 3;
  const inferredYearNamePrefix = options.inferredYearNamePrefix ?? 'Academic Year';

  if (!Number.isInteger(defaultTermCount) || defaultTermCount < 1) {
    throw new Error('defaultTermCount must be a positive integer');
  }

  const issues: TermBackfillIssue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (issue: TermBackfillIssue): void => {
    const normalized: TermBackfillIssue = {
      ...issue,
      entityIds: uniqueSorted(issue.entityIds),
    };
    const key = JSON.stringify(canonicalize(normalized));
    if (!issueKeys.has(key)) {
      issueKeys.add(key);
      issues.push(normalized);
    }
  };

  const academicYearsToCreate: AcademicYearCreateProposal[] = [];
  const termsToUpdate: AcademicTermUpdateProposal[] = [];
  const cohortsToCreate: ClassCohortCreateProposal[] = [];
  const cohortsToUpdate: ClassCohortUpdateProposal[] = [];
  const classesToLink: ClassCohortLinkProposal[] = [];
  const enrollmentsToCreate: StudentTermEnrollmentCreateProposal[] = [];
  const enrollmentsToUpdate: StudentTermEnrollmentUpdateProposal[] = [];

  const sortedYears = [...input.academicYears].sort((left, right) => compareStrings(left.id, right.id));
  const sortedTerms = [...input.terms].sort((left, right) => compareStrings(left.id, right.id));
  const sortedClasses = [...input.classes].sort((left, right) => compareStrings(left.id, right.id));
  const sortedCohorts = [...input.cohorts].sort((left, right) => compareStrings(left.id, right.id));
  const sortedStudents = [...input.students].sort((left, right) => compareStrings(left.id, right.id));
  const sortedEnrollments = [...input.enrollments].sort((left, right) => compareStrings(left.id, right.id));
  const sortedMovements = [...input.movements].sort((left, right) => compareStrings(left.id, right.id));

  const sourceFingerprint = stableHash({
    schemaVersion: 1,
    options: { defaultTermCount, inferredYearNamePrefix },
    input,
  });

  const resolvedYearByRef = new Map<string, ResolvedYear>();
  for (const year of sortedYears) {
    const startMs = new Date(year.startDate).getTime();
    const endMs = new Date(year.endDate).getTime();
    if (!isValidDateRange(startMs, endMs)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ACADEMIC_YEAR_DATE_INVALID',
        entityType: 'AcademicYear',
        entityIds: [year.id],
        message: `Academic year "${year.name}" has an invalid date range.`,
        details: { startDate: year.startDate, endDate: year.endDate },
      });
      continue;
    }
    if (!Number.isInteger(year.termCount) || year.termCount < 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ACADEMIC_YEAR_TERM_COUNT_INVALID',
        entityType: 'AcademicYear',
        entityIds: [year.id],
        message: `Academic year "${year.name}" must have a positive integer term count.`,
        details: { termCount: year.termCount },
      });
      continue;
    }
    resolvedYearByRef.set(year.id, {
      ref: year.id,
      id: year.id,
      name: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      startMs,
      endMs,
      termCount: year.termCount,
      proposed: false,
    });
  }

  const validExistingYears = [...resolvedYearByRef.values()]
    .filter(year => !year.proposed)
    .sort((left, right) => left.startMs - right.startMs || compareStrings(left.ref, right.ref));
  for (let index = 1; index < validExistingYears.length; index += 1) {
    const previous = validExistingYears[index - 1];
    const current = validExistingYears[index];
    if (previous.endMs >= current.startMs) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ACADEMIC_YEAR_DATE_OVERLAP',
        entityType: 'AcademicYear',
        entityIds: [previous.ref, current.ref],
        message: `Academic years "${previous.name}" and "${current.name}" overlap.`,
        details: {
          firstRange: [previous.startDate, previous.endDate],
          secondRange: [current.startDate, current.endDate],
        },
      });
    }
  }

  const termById = new Map(sortedTerms.map(term => [term.id, term]));
  const termDates = new Map<string, { startMs: number; endMs: number }>();
  const termYearRef = new Map<string, string>();
  const yearResolutionReason = new Map<string, 'UNIQUE_YEAR_DATE_MATCH' | 'CALENDAR_YEAR_GROUP'>();
  const unmatchedTerms: BackfillTermInput[] = [];

  for (const term of sortedTerms) {
    const startMs = new Date(term.startDate).getTime();
    const endMs = new Date(term.endDate).getTime();
    if (!isValidDateRange(startMs, endMs)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_DATE_INVALID',
        entityType: 'AcademicTerm',
        entityIds: [term.id],
        message: `Term "${term.name}" has an invalid date range.`,
        details: { startDate: term.startDate, endDate: term.endDate },
      });
      continue;
    }
    termDates.set(term.id, { startMs, endMs });

    if (!Number.isInteger(term.version) || term.version < 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_VERSION_INVALID',
        entityType: 'AcademicTerm',
        entityIds: [term.id],
        message: `Term "${term.name}" has an invalid optimistic-lock version.`,
        details: { version: term.version },
      });
    }

    if (term.isActive !== isActiveCompatibilityFlag(term.status)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_ACTIVE_FLAG_MISMATCH',
        entityType: 'AcademicTerm',
        entityIds: [term.id],
        message: `Term "${term.name}" has lifecycle status ${term.status} but isActive=${term.isActive}.`,
      });
    }

    if (term.academicYearId) {
      const explicitYear = resolvedYearByRef.get(term.academicYearId);
      if (!explicitYear) {
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_EXPLICIT_YEAR_INVALID',
          entityType: 'AcademicTerm',
          entityIds: [term.id, term.academicYearId],
          message: `Term "${term.name}" references a missing or invalid academic year.`,
        });
        continue;
      }
      if (startMs < explicitYear.startMs || endMs > explicitYear.endMs) {
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_EXPLICIT_YEAR_INVALID',
          entityType: 'AcademicTerm',
          entityIds: [term.id, explicitYear.ref],
          message: `Term "${term.name}" falls outside its explicit academic year.`,
          details: {
            termRange: [term.startDate, term.endDate],
            academicYearRange: [explicitYear.startDate, explicitYear.endDate],
          },
        });
        continue;
      }
      termYearRef.set(term.id, explicitYear.ref);
      continue;
    }

    const candidates = validExistingYears.filter(year => (
      startMs >= year.startMs && endMs <= year.endMs
    ));
    if (candidates.length === 1) {
      termYearRef.set(term.id, candidates[0].ref);
      yearResolutionReason.set(term.id, 'UNIQUE_YEAR_DATE_MATCH');
    } else if (candidates.length > 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_YEAR_AMBIGUOUS',
        entityType: 'AcademicTerm',
        entityIds: [term.id, ...candidates.map(year => year.ref)],
        message: `Term "${term.name}" is contained by multiple academic years.`,
        details: { candidateYearIds: candidates.map(year => year.ref).sort(compareStrings) },
      });
    } else {
      unmatchedTerms.push(term);
    }
  }

  const unmatchedByCalendarYear = new Map<number, BackfillTermInput[]>();
  for (const term of unmatchedTerms) {
    const dates = termDates.get(term.id);
    if (!dates) continue;
    const startYear = new Date(term.startDate).getUTCFullYear();
    const endYear = new Date(term.endDate).getUTCFullYear();
    if (startYear !== endYear) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_SPANS_CALENDAR_YEARS',
        entityType: 'AcademicTerm',
        entityIds: [term.id],
        message: `Term "${term.name}" spans calendar years and has no explicit encompassing academic year.`,
        details: { startDate: term.startDate, endDate: term.endDate },
      });
      continue;
    }
    const group = unmatchedByCalendarYear.get(startYear) ?? [];
    group.push(term);
    unmatchedByCalendarYear.set(startYear, group);
  }

  const existingNames = new Map<string, string[]>();
  for (const year of sortedYears) {
    const key = year.name.trim().toLowerCase();
    existingNames.set(key, [...(existingNames.get(key) ?? []), year.id]);
  }

  for (const [calendarYear, terms] of [...unmatchedByCalendarYear.entries()].sort((a, b) => a[0] - b[0])) {
    const termIds = terms.map(term => term.id).sort(compareStrings);
    if (terms.length !== defaultTermCount) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_CALENDAR_YEAR_INFERENCE_INCOMPLETE',
        entityType: 'AcademicTerm',
        entityIds: termIds,
        message: `Calendar year ${calendarYear} has ${terms.length} unmatched term(s); exactly ${defaultTermCount} are required for automatic academic-year creation.`,
        details: { calendarYear, expectedTermCount: defaultTermCount, actualTermCount: terms.length },
      });
      for (const term of terms) {
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_YEAR_UNMATCHED',
          entityType: 'AcademicTerm',
          entityIds: [term.id],
          message: `Term "${term.name}" has no unambiguous academic year.`,
        });
      }
      continue;
    }

    const name = `${inferredYearNamePrefix} ${calendarYear}`;
    const collidingNameIds = existingNames.get(name.trim().toLowerCase()) ?? [];
    if (collidingNameIds.length > 0) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ACADEMIC_YEAR_NAME_COLLISION',
        entityType: 'AcademicYear',
        entityIds: [...collidingNameIds, ...termIds],
        message: `Cannot propose "${name}" because an academic year with that name already exists.`,
      });
      continue;
    }

    const startDate = new Date(Date.UTC(calendarYear, 0, 1)).toISOString();
    const endDate = new Date(Date.UTC(calendarYear + 1, 0, 1) - 1).toISOString();
    const ref = `academic-year:calendar:${calendarYear}`;
    const proposal: AcademicYearCreateProposal = {
      ref,
      name,
      startDate,
      endDate,
      termCount: defaultTermCount,
      confidence: 'HIGH',
      evidenceTermIds: termIds,
    };
    academicYearsToCreate.push(proposal);
    resolvedYearByRef.set(ref, {
      ref,
      id: null,
      name,
      startDate,
      endDate,
      startMs: new Date(startDate).getTime(),
      endMs: new Date(endDate).getTime(),
      termCount: defaultTermCount,
      proposed: true,
    });
    for (const term of terms) {
      termYearRef.set(term.id, ref);
      yearResolutionReason.set(term.id, 'CALENDAR_YEAR_GROUP');
    }
  }

  const activeTerms = sortedTerms.filter(term => term.status === 'ACTIVE');
  if (sortedTerms.length > 0 && activeTerms.length !== 1) {
    addIssue({
      severity: 'BLOCKER',
      code: 'ACTIVE_TERM_COUNT_INVALID',
      entityType: 'AcademicTerm',
      entityIds: activeTerms.map(term => term.id),
      message: `Expected exactly one ACTIVE term but found ${activeTerms.length}.`,
    });
  }
  if (sortedTerms.length > 0 && input.schoolSettings.length !== 1) {
    addIssue({
      severity: 'BLOCKER',
      code: 'SCHOOL_SETTINGS_COUNT_INVALID',
      entityType: 'SchoolSettings',
      entityIds: input.schoolSettings.map(settings => settings.id),
      message: `Expected exactly one school settings row but found ${input.schoolSettings.length}.`,
    });
  } else if (input.schoolSettings.length === 1 && activeTerms.length === 1) {
    if (input.schoolSettings[0].currentTermId !== activeTerms[0].id) {
      addIssue({
        severity: 'BLOCKER',
        code: 'SCHOOL_SETTINGS_TERM_MISMATCH',
        entityType: 'SchoolSettings',
        entityIds: [input.schoolSettings[0].id, activeTerms[0].id],
        message: 'School settings currentTermId does not match the ACTIVE term.',
        details: {
          currentTermId: input.schoolSettings[0].currentTermId,
          activeTermId: activeTerms[0].id,
        },
      });
    }
  }

  const resolvedSequence = new Map<string, number>();
  const termsByYearRef = new Map<string, BackfillTermInput[]>();
  for (const term of sortedTerms) {
    const yearRef = termYearRef.get(term.id);
    if (!yearRef) continue;
    const group = termsByYearRef.get(yearRef) ?? [];
    group.push(term);
    termsByYearRef.set(yearRef, group);
  }

  for (const [yearRef, terms] of [...termsByYearRef.entries()].sort((a, b) => compareStrings(a[0], b[0]))) {
    const year = resolvedYearByRef.get(yearRef);
    if (!year) continue;
    const ordered = [...terms].sort((left, right) => {
      const leftDates = termDates.get(left.id);
      const rightDates = termDates.get(right.id);
      return (leftDates?.startMs ?? 0) - (rightDates?.startMs ?? 0)
        || (leftDates?.endMs ?? 0) - (rightDates?.endMs ?? 0)
        || compareStrings(left.id, right.id);
    });

    let datesAmbiguous = false;
    for (let index = 1; index < ordered.length; index += 1) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      const previousDates = termDates.get(previous.id);
      const currentDates = termDates.get(current.id);
      if (!previousDates || !currentDates) continue;
      if (previousDates.startMs === currentDates.startMs || previousDates.endMs === currentDates.endMs) {
        datesAmbiguous = true;
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_DATE_TIE',
          entityType: 'AcademicTerm',
          entityIds: [previous.id, current.id],
          message: `Terms "${previous.name}" and "${current.name}" have tied boundary dates.`,
        });
      }
      if (previousDates.endMs >= currentDates.startMs) {
        datesAmbiguous = true;
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_DATE_OVERLAP',
          entityType: 'AcademicTerm',
          entityIds: [previous.id, current.id],
          message: `Terms "${previous.name}" and "${current.name}" overlap within academic year "${year.name}".`,
        });
      }
    }

    const explicitSequences = new Map<number, string[]>();
    let explicitInvalid = false;
    for (const term of ordered) {
      if (term.sequence === null) continue;
      if (!Number.isInteger(term.sequence) || term.sequence < 1 || term.sequence > year.termCount) {
        explicitInvalid = true;
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_SEQUENCE_INVALID',
          entityType: 'AcademicTerm',
          entityIds: [term.id],
          message: `Term "${term.name}" has sequence ${term.sequence}, outside 1-${year.termCount}.`,
        });
      } else {
        resolvedSequence.set(term.id, term.sequence);
        explicitSequences.set(term.sequence, [
          ...(explicitSequences.get(term.sequence) ?? []),
          term.id,
        ]);
      }
    }
    for (const [sequence, ids] of explicitSequences) {
      if (ids.length > 1) {
        explicitInvalid = true;
        addIssue({
          severity: 'BLOCKER',
          code: 'TERM_SEQUENCE_DUPLICATE',
          entityType: 'AcademicTerm',
          entityIds: ids,
          message: `Multiple terms claim sequence ${sequence} in academic year "${year.name}".`,
        });
      }
    }

    if (ordered.length > year.termCount) {
      explicitInvalid = true;
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_SEQUENCE_CONFLICT',
        entityType: 'AcademicYear',
        entityIds: [year.ref, ...ordered.map(term => term.id)],
        message: `Academic year "${year.name}" contains ${ordered.length} terms but allows only ${year.termCount}.`,
      });
    }

    if (datesAmbiguous || explicitInvalid) continue;

    const solutions: number[][] = [];
    const visit = (index: number, previousSequence: number, assignment: number[]): void => {
      if (solutions.length > 1) return;
      if (index === ordered.length) {
        solutions.push([...assignment]);
        return;
      }
      const explicit = ordered[index].sequence;
      const candidates = explicit === null
        ? Array.from({ length: year.termCount }, (_, offset) => offset + 1)
        : [explicit];
      for (const candidate of candidates) {
        if (candidate <= previousSequence) continue;
        assignment.push(candidate);
        visit(index + 1, candidate, assignment);
        assignment.pop();
      }
    };
    visit(0, 0, []);

    if (solutions.length === 0) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_SEQUENCE_CONFLICT',
        entityType: 'AcademicYear',
        entityIds: [year.ref, ...ordered.map(term => term.id)],
        message: `Explicit sequences conflict with chronological order in academic year "${year.name}".`,
      });
      continue;
    }
    if (solutions.length > 1 && ordered.some(term => term.sequence === null)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'TERM_SEQUENCE_AMBIGUOUS',
        entityType: 'AcademicYear',
        entityIds: [year.ref, ...ordered.filter(term => term.sequence === null).map(term => term.id)],
        message: `Missing term sequences in academic year "${year.name}" have more than one valid assignment.`,
      });
      continue;
    }

    ordered.forEach((term, index) => resolvedSequence.set(term.id, solutions[0][index]));
  }

  for (const term of sortedTerms) {
    const academicYearRef = termYearRef.get(term.id);
    const sequence = resolvedSequence.get(term.id);
    if (!academicYearRef || sequence === undefined) continue;
    if (term.academicYearId === academicYearRef && term.sequence === sequence) continue;
    if (term.academicYearId !== null && term.academicYearId !== academicYearRef) continue;
    const reasonCodes: AcademicTermUpdateProposal['reasonCodes'] = [];
    const yearReason = yearResolutionReason.get(term.id);
    if (yearReason && term.academicYearId === null) reasonCodes.push(yearReason);
    if (term.sequence === null) reasonCodes.push('CHRONOLOGICAL_SEQUENCE');
    termsToUpdate.push({
      termId: term.id,
      expectedVersion: term.version,
      before: {
        academicYearId: term.academicYearId,
        sequence: term.sequence,
      },
      after: { academicYearRef, sequence },
      reasonCodes,
    });
  }

  const cohortById = new Map(sortedCohorts.map(cohort => [cohort.id, cohort]));
  const cohortDescriptors = new Map<string, CohortDescriptor>();
  const existingCohortsByIdentity = new Map<string, BackfillClassCohortInput[]>();
  const existingCohortsBySchemaKey = new Map<string, BackfillClassCohortInput[]>();
  for (const cohort of sortedCohorts) {
    const normalizedName = normalizeCohortName(cohort.name);
    const descriptor: CohortDescriptor = {
      ref: cohort.id,
      id: cohort.id,
      academicYearRef: cohort.academicYearId,
      name: cohort.name,
      normalizedName,
      gradeLevel: cohort.gradeLevel,
      branchId: cohort.branchId,
      predecessorCohortRef: cohort.predecessorCohortId,
      proposed: false,
    };
    cohortDescriptors.set(cohort.id, descriptor);
    const identity = cohortIdentityKey(
      cohort.academicYearId,
      cohort.branchId,
      cohort.gradeLevel,
      normalizedName,
    );
    existingCohortsByIdentity.set(identity, [
      ...(existingCohortsByIdentity.get(identity) ?? []),
      cohort,
    ]);
    const schemaKey = cohortSchemaKey(cohort.academicYearId, cohort.branchId, cohort.name);
    existingCohortsBySchemaKey.set(schemaKey, [
      ...(existingCohortsBySchemaKey.get(schemaKey) ?? []),
      cohort,
    ]);
  }

  for (const cohorts of existingCohortsByIdentity.values()) {
    if (cohorts.length > 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'COHORT_NORMALIZED_NAME_COLLISION',
        entityType: 'ClassCohort',
        entityIds: cohorts.map(cohort => cohort.id),
        message: 'Multiple class cohorts share the same normalized year, branch, grade, and name identity.',
        details: { names: uniqueSorted(cohorts.map(cohort => cohort.name)) },
      });
    }
  }

  const classById = new Map(sortedClasses.map(classRecord => [classRecord.id, classRecord]));
  const classToCohortRef = new Map<string, string>();
  const unlinkedClassGroups = new Map<string, BackfillClassInput[]>();

  for (const classRecord of sortedClasses) {
    const term = termById.get(classRecord.academicTermId);
    const academicYearRef = term ? termYearRef.get(term.id) : undefined;
    if (!term || !academicYearRef) {
      addIssue({
        severity: 'BLOCKER',
        code: 'CLASS_TERM_NOT_FOUND',
        entityType: 'Class',
        entityIds: [classRecord.id, classRecord.academicTermId],
        message: `Class "${classRecord.name}" does not have a term with a resolved academic year.`,
      });
      continue;
    }

    const normalizedName = normalizeCohortName(classRecord.name);
    if (classRecord.classCohortId) {
      const cohort = cohortById.get(classRecord.classCohortId);
      if (!cohort) {
        addIssue({
          severity: 'BLOCKER',
          code: 'CLASS_COHORT_NOT_FOUND',
          entityType: 'Class',
          entityIds: [classRecord.id, classRecord.classCohortId],
          message: `Class "${classRecord.name}" references a missing cohort.`,
        });
        continue;
      }
      if (cohort.academicYearId !== academicYearRef) {
        addIssue({
          severity: 'BLOCKER',
          code: 'CLASS_COHORT_YEAR_MISMATCH',
          entityType: 'Class',
          entityIds: [classRecord.id, cohort.id],
          message: `Class "${classRecord.name}" and its explicit cohort belong to different academic years.`,
        });
        continue;
      }
      if (
        cohort.gradeLevel !== classRecord.gradeLevel
        || cohort.branchId !== classRecord.branchId
        || normalizeCohortName(cohort.name) !== normalizedName
      ) {
        addIssue({
          severity: 'BLOCKER',
          code: 'CLASS_COHORT_IDENTITY_MISMATCH',
          entityType: 'Class',
          entityIds: [classRecord.id, cohort.id],
          message: `Class "${classRecord.name}" does not match its explicit cohort identity.`,
          details: {
            classIdentity: {
              normalizedName,
              gradeLevel: classRecord.gradeLevel,
              branchId: classRecord.branchId,
            },
            cohortIdentity: {
              normalizedName: normalizeCohortName(cohort.name),
              gradeLevel: cohort.gradeLevel,
              branchId: cohort.branchId,
            },
          },
        });
        continue;
      }
      classToCohortRef.set(classRecord.id, cohort.id);
      continue;
    }

    const identity = cohortIdentityKey(
      academicYearRef,
      classRecord.branchId,
      classRecord.gradeLevel,
      normalizedName,
    );
    const group = unlinkedClassGroups.get(identity) ?? [];
    group.push(classRecord);
    unlinkedClassGroups.set(identity, group);
  }

  for (const [identity, classes] of [...unlinkedClassGroups.entries()].sort((a, b) => compareStrings(a[0], b[0]))) {
    const first = classes[0];
    const term = termById.get(first.academicTermId);
    const academicYearRef = term ? termYearRef.get(term.id) : undefined;
    if (!academicYearRef) continue;
    const normalizedName = normalizeCohortName(first.name);
    const existingMatches = existingCohortsByIdentity.get(identity) ?? [];
    if (existingMatches.length > 1) continue;

    let cohortRef: string;
    if (existingMatches.length === 1) {
      cohortRef = existingMatches[0].id;
    } else {
      const name = chooseCanonicalName(classes.map(classRecord => classRecord.name));
      const schemaConflicts = existingCohortsBySchemaKey.get(
        cohortSchemaKey(academicYearRef, first.branchId, name),
      ) ?? [];
      if (schemaConflicts.length > 0) {
        addIssue({
          severity: 'BLOCKER',
          code: 'COHORT_SCHEMA_KEY_CONFLICT',
          entityType: 'ClassCohort',
          entityIds: [...schemaConflicts.map(cohort => cohort.id), ...classes.map(classRecord => classRecord.id)],
          message: `A cohort named "${name}" already exists for the year and branch with a different grade identity.`,
        });
        continue;
      }
      cohortRef = stableRef('class-cohort', identity);
      const proposal: ClassCohortCreateProposal = {
        ref: cohortRef,
        academicYearRef,
        name,
        normalizedName,
        gradeLevel: first.gradeLevel,
        branchId: first.branchId,
        predecessorCohortRef: null,
        sourceClassIds: classes.map(classRecord => classRecord.id).sort(compareStrings),
      };
      cohortsToCreate.push(proposal);
      cohortDescriptors.set(cohortRef, {
        ref: cohortRef,
        id: null,
        academicYearRef,
        name,
        normalizedName,
        gradeLevel: first.gradeLevel,
        branchId: first.branchId,
        predecessorCohortRef: null,
        proposed: true,
      });
    }

    for (const classRecord of classes) {
      classToCohortRef.set(classRecord.id, cohortRef);
      classesToLink.push({ classId: classRecord.id, cohortRef });
    }
  }

  const offerings = new Map<string, string[]>();
  for (const classRecord of sortedClasses) {
    const cohortRef = classToCohortRef.get(classRecord.id);
    if (!cohortRef) continue;
    const key = `${cohortRef}|${classRecord.academicTermId}`;
    offerings.set(key, [...(offerings.get(key) ?? []), classRecord.id]);
  }
  for (const ids of offerings.values()) {
    if (ids.length > 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'DUPLICATE_CLASS_OFFERING_CANDIDATE',
        entityType: 'Class',
        entityIds: ids,
        message: 'Multiple classes would map to the same cohort offering in one term.',
      });
    }
  }

  const predecessorCandidates = new Map<string, Map<string, string[]>>();
  for (const movement of sortedMovements) {
    if (!movement.fromClassId) continue;
    const fromClass = classById.get(movement.fromClassId);
    const toClass = classById.get(movement.toClassId);
    const sourceRef = fromClass ? classToCohortRef.get(fromClass.id) : undefined;
    const targetRef = toClass ? classToCohortRef.get(toClass.id) : undefined;
    if (!fromClass || !toClass || !sourceRef || !targetRef || sourceRef === targetRef) continue;
    const source = cohortDescriptors.get(sourceRef);
    const target = cohortDescriptors.get(targetRef);
    if (!source || !target || source.academicYearRef === target.academicYearRef) continue;
    const sourceYear = resolvedYearByRef.get(source.academicYearRef);
    const targetYear = resolvedYearByRef.get(target.academicYearRef);
    if (!sourceYear || !targetYear) continue;

    if (
      sourceYear.startMs >= targetYear.startMs
      || target.gradeLevel !== source.gradeLevel + 1
      || source.branchId !== target.branchId
    ) {
      addIssue({
        severity: 'WARNING',
        code: 'COHORT_PREDECESSOR_NOT_INFERRED',
        entityType: 'ClassMovementLog',
        entityIds: [movement.id, sourceRef, targetRef],
        message: 'A cross-year movement was not used for cohort lineage because chronology, grade progression, or branch did not match.',
      });
      continue;
    }

    const sources = predecessorCandidates.get(targetRef) ?? new Map<string, string[]>();
    sources.set(sourceRef, [...(sources.get(sourceRef) ?? []), movement.id]);
    predecessorCandidates.set(targetRef, sources);
  }

  for (const [targetRef, candidates] of predecessorCandidates) {
    const target = cohortDescriptors.get(targetRef);
    if (!target) continue;
    if (candidates.size > 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'COHORT_PREDECESSOR_AMBIGUOUS',
        entityType: 'ClassCohort',
        entityIds: [targetRef, ...candidates.keys()],
        message: `Cohort "${target.name}" has movement evidence for multiple predecessors.`,
        details: {
          candidates: [...candidates.entries()].map(([ref, movementIds]) => ({
            cohortRef: ref,
            movementIds: movementIds.sort(compareStrings),
          })),
        },
      });
      continue;
    }
    const [sourceRef, movementIds] = [...candidates.entries()][0];
    if (target.predecessorCohortRef && target.predecessorCohortRef !== sourceRef) {
      addIssue({
        severity: 'BLOCKER',
        code: 'COHORT_PREDECESSOR_CONFLICT',
        entityType: 'ClassCohort',
        entityIds: [targetRef, target.predecessorCohortRef, sourceRef],
        message: `Cohort "${target.name}" has an explicit predecessor that conflicts with movement evidence.`,
      });
      continue;
    }
    if (target.predecessorCohortRef === sourceRef) continue;
    target.predecessorCohortRef = sourceRef;
    const proposed = cohortsToCreate.find(cohort => cohort.ref === targetRef);
    if (proposed) {
      proposed.predecessorCohortRef = sourceRef;
    } else {
      cohortsToUpdate.push({
        cohortId: targetRef,
        predecessorCohortRef: sourceRef,
        evidenceMovementIds: movementIds.sort(compareStrings),
      });
    }
  }

  for (const cohort of sortedCohorts) {
    if (cohort.predecessorCohortId && !cohortDescriptors.has(cohort.predecessorCohortId)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'COHORT_PREDECESSOR_CONFLICT',
        entityType: 'ClassCohort',
        entityIds: [cohort.id, cohort.predecessorCohortId],
        message: `Cohort "${cohort.name}" references a missing predecessor.`,
      });
    }
  }

  for (const cohort of cohortDescriptors.values()) {
    if (!cohort.predecessorCohortRef) continue;
    const predecessor = cohortDescriptors.get(cohort.predecessorCohortRef);
    if (!predecessor) continue;
    const cohortYear = resolvedYearByRef.get(cohort.academicYearRef);
    const predecessorYear = resolvedYearByRef.get(predecessor.academicYearRef);
    const gradeDelta = cohort.gradeLevel - predecessor.gradeLevel;
    if (
      !cohortYear
      || !predecessorYear
      || predecessorYear.startMs >= cohortYear.startMs
      || predecessor.branchId !== cohort.branchId
      || (gradeDelta !== 0 && gradeDelta !== 1)
    ) {
      addIssue({
        severity: 'BLOCKER',
        code: 'COHORT_PREDECESSOR_CONFLICT',
        entityType: 'ClassCohort',
        entityIds: [cohort.ref, predecessor.ref],
        message: `Cohort "${cohort.name}" has a predecessor that is not chronologically, branch, or grade coherent.`,
        details: {
          cohortYearRef: cohort.academicYearRef,
          predecessorYearRef: predecessor.academicYearRef,
          cohortBranchId: cohort.branchId,
          predecessorBranchId: predecessor.branchId,
          gradeDelta,
        },
      });
    }
  }

  const visitState = new Map<string, 'VISITING' | 'VISITED'>();
  const visitCohort = (ref: string, path: string[]): void => {
    const state = visitState.get(ref);
    if (state === 'VISITED') return;
    if (state === 'VISITING') {
      const cycleStart = path.indexOf(ref);
      addIssue({
        severity: 'BLOCKER',
        code: 'COHORT_PREDECESSOR_CYCLE',
        entityType: 'ClassCohort',
        entityIds: cycleStart >= 0 ? path.slice(cycleStart) : [...path, ref],
        message: 'Class cohort predecessor links contain a cycle.',
      });
      return;
    }
    visitState.set(ref, 'VISITING');
    const predecessor = cohortDescriptors.get(ref)?.predecessorCohortRef;
    if (predecessor && cohortDescriptors.has(predecessor)) {
      visitCohort(predecessor, [...path, ref]);
    }
    visitState.set(ref, 'VISITED');
  };
  for (const ref of [...cohortDescriptors.keys()].sort(compareStrings)) {
    visitCohort(ref, []);
  }

  const studentById = new Map(sortedStudents.map(student => [student.id, student]));
  const evidenceByEnrollment = new Map<string, Map<string, CollectedEvidence>>();
  const collectEvidence = (
    studentId: string,
    academicTermId: string,
    classId: string,
    evidence: CollectedEvidence,
  ): void => {
    const key = enrollmentKey(studentId, academicTermId);
    const byClass = evidenceByEnrollment.get(key) ?? new Map<string, CollectedEvidence>();
    const evidenceKey = `${classId}|${evidence.source}|${evidence.ref}`;
    byClass.set(evidenceKey, { ...evidence, ref: `${classId}|${evidence.ref}` });
    evidenceByEnrollment.set(key, byClass);
  };

  const validateEvidenceOwnership = (
    entityType: string,
    entityId: string,
    academicTermId: string,
    classId: string,
  ): { term: BackfillTermInput; classRecord: BackfillClassInput } | null => {
    const term = termById.get(academicTermId);
    const classRecord = classById.get(classId);
    if (!term || !classRecord) {
      addIssue({
        severity: 'BLOCKER',
        code: 'EVIDENCE_ENTITY_NOT_FOUND',
        entityType,
        entityIds: [entityId, academicTermId, classId],
        message: `${entityType} evidence references a missing term or class.`,
      });
      return null;
    }
    if (classRecord.academicTermId !== academicTermId) {
      addIssue({
        severity: 'BLOCKER',
        code: 'EVIDENCE_CLASS_TERM_MISMATCH',
        entityType,
        entityIds: [entityId, academicTermId, classId],
        message: `${entityType} evidence points to a class owned by a different term.`,
        details: { evidenceTermId: academicTermId, classTermId: classRecord.academicTermId },
      });
      return null;
    }
    return { term, classRecord };
  };

  for (const evidence of [...input.enrollmentEvidence].sort((left, right) => compareStrings(left.evidenceRef, right.evidenceRef))) {
    if (!studentById.has(evidence.studentId)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'EVIDENCE_ENTITY_NOT_FOUND',
        entityType: evidence.source,
        entityIds: [evidence.evidenceRef, evidence.studentId],
        message: `${evidence.source} evidence references a missing student.`,
      });
      continue;
    }
    const owned = validateEvidenceOwnership(
      evidence.source,
      evidence.evidenceRef,
      evidence.academicTermId,
      evidence.classId,
    );
    if (!owned) continue;
    if (owned.term.status === 'DRAFT') {
      addIssue({
        severity: 'BLOCKER',
        code: 'DRAFT_TERM_HAS_OPERATIONAL_EVIDENCE',
        entityType: evidence.source,
        entityIds: [evidence.evidenceRef, owned.term.id],
        message: `${evidence.source} operational evidence exists in DRAFT term "${owned.term.name}".`,
      });
    }
    const dates = termDates.get(owned.term.id);
    for (const observedAt of [evidence.firstObservedAt, evidence.lastObservedAt]) {
      if (!observedAt || !dates) continue;
      const observedMs = new Date(observedAt).getTime();
      if (Number.isFinite(observedMs) && (observedMs < dates.startMs || observedMs > dates.endMs)) {
        addIssue({
          severity: 'WARNING',
          code: 'EVIDENCE_DATE_OUTSIDE_TERM',
          entityType: evidence.source,
          entityIds: [evidence.evidenceRef, owned.term.id],
          message: `${evidence.source} evidence has an observed date outside the term range.`,
          details: { observedAt, termRange: [owned.term.startDate, owned.term.endDate] },
        });
      }
    }
    collectEvidence(evidence.studentId, evidence.academicTermId, evidence.classId, {
      source: evidence.source,
      ref: evidence.evidenceRef,
      recordCount: evidence.recordCount,
      firstObservedAt: evidence.firstObservedAt,
      lastObservedAt: evidence.lastObservedAt,
    });
  }

  for (const evidence of [...input.ownershipEvidence].sort((left, right) => compareStrings(left.evidenceRef, right.evidenceRef))) {
    validateEvidenceOwnership(
      evidence.source,
      evidence.evidenceRef,
      evidence.academicTermId,
      evidence.classId,
    );
  }

  for (const movement of sortedMovements) {
    if (!studentById.has(movement.studentId)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'EVIDENCE_ENTITY_NOT_FOUND',
        entityType: 'ClassMovementLog',
        entityIds: [movement.id, movement.studentId],
        message: 'Class movement references a missing student.',
      });
      continue;
    }
    const endpoints: Array<{
      classId: string | null;
      source: 'MOVEMENT_FROM' | 'MOVEMENT_TO';
    }> = [
      { classId: movement.fromClassId, source: 'MOVEMENT_FROM' },
      { classId: movement.toClassId, source: 'MOVEMENT_TO' },
    ];
    for (const endpoint of endpoints) {
      if (!endpoint.classId) continue;
      const classRecord = classById.get(endpoint.classId);
      if (!classRecord) {
        addIssue({
          severity: 'BLOCKER',
          code: 'EVIDENCE_ENTITY_NOT_FOUND',
          entityType: 'ClassMovementLog',
          entityIds: [movement.id, endpoint.classId],
          message: 'Class movement references a missing class.',
        });
        continue;
      }
      collectEvidence(movement.studentId, classRecord.academicTermId, classRecord.id, {
        source: endpoint.source,
        ref: movement.id,
        recordCount: 1,
        firstObservedAt: movement.createdAt,
        lastObservedAt: movement.createdAt,
      });
    }
  }

  if (activeTerms.length === 1) {
    const activeTerm = activeTerms[0];
    for (const student of sortedStudents) {
      const currentClass = classById.get(student.classId);
      if (!currentClass) {
        addIssue({
          severity: 'BLOCKER',
          code: 'STUDENT_CURRENT_CLASS_NOT_FOUND',
          entityType: 'Student',
          entityIds: [student.id, student.classId],
          message: `Student ${student.admissionNumber} references a missing current class.`,
        });
        continue;
      }
      if (student.status === 'ACTIVE') {
        if (currentClass.academicTermId !== activeTerm.id) {
          addIssue({
            severity: 'BLOCKER',
            code: 'STUDENT_CURRENT_CLASS_TERM_MISMATCH',
            entityType: 'Student',
            entityIds: [student.id, currentClass.id, activeTerm.id],
            message: `Active student ${student.admissionNumber} is not placed in the ACTIVE term.`,
          });
          continue;
        }
        collectEvidence(student.id, activeTerm.id, currentClass.id, {
          source: 'CURRENT_PLACEMENT',
          ref: student.id,
          recordCount: 1,
        });
      } else if (currentClass.academicTermId === activeTerm.id) {
        addIssue({
          severity: 'BLOCKER',
          code: 'STUDENT_STATUS_CURRENT_PLACEMENT_CONFLICT',
          entityType: 'Student',
          entityIds: [student.id, currentClass.id],
          message: `Student ${student.admissionNumber} has status ${student.status} but points to a class in the ACTIVE term.`,
        });
      }
    }
  }

  const enrollmentById = new Map<string, BackfillEnrollmentInput>();
  const existingEnrollmentByKey = new Map<string, BackfillEnrollmentInput>();
  for (const enrollment of sortedEnrollments) {
    enrollmentById.set(enrollment.id, enrollment);
    const key = enrollmentKey(enrollment.studentId, enrollment.academicTermId);
    const duplicate = existingEnrollmentByKey.get(key);
    if (duplicate) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ENROLLMENT_DUPLICATE',
        entityType: 'StudentTermEnrollment',
        entityIds: [duplicate.id, enrollment.id],
        message: 'A student has multiple enrollment rows for the same term.',
      });
      continue;
    }
    existingEnrollmentByKey.set(key, enrollment);
    const classRecord = classById.get(enrollment.classId);
    if (!classRecord || !termById.has(enrollment.academicTermId) || !studentById.has(enrollment.studentId)) {
      addIssue({
        severity: 'BLOCKER',
        code: 'EVIDENCE_ENTITY_NOT_FOUND',
        entityType: 'StudentTermEnrollment',
        entityIds: [enrollment.id, enrollment.studentId, enrollment.academicTermId, enrollment.classId],
        message: 'Enrollment references a missing student, term, or class.',
      });
    } else if (classRecord.academicTermId !== enrollment.academicTermId) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ENROLLMENT_CLASS_TERM_MISMATCH',
        entityType: 'StudentTermEnrollment',
        entityIds: [enrollment.id, enrollment.classId, enrollment.academicTermId],
        message: 'Enrollment class is owned by a different academic term.',
      });
    }
  }

  for (const [key, evidenceMap] of [...evidenceByEnrollment.entries()].sort((a, b) => compareStrings(a[0], b[0]))) {
    const [studentId, academicTermId] = key.split('|');
    const classIds = uniqueSorted([...evidenceMap.values()].map(evidence => evidence.ref.split('|')[0]));
    if (classIds.length > 1) {
      addIssue({
        severity: 'BLOCKER',
        code: 'ENROLLMENT_CLASS_CONFLICT',
        entityType: 'StudentTermEnrollment',
        entityIds: [studentId, academicTermId, ...classIds],
        message: 'Historical evidence assigns one student to multiple classes in the same term.',
        details: {
          evidence: [...evidenceMap.values()].map(evidence => ({
            classId: evidence.ref.split('|')[0],
            source: evidence.source,
            ref: evidence.ref.slice(evidence.ref.indexOf('|') + 1),
            recordCount: evidence.recordCount,
          })),
        },
      });
      continue;
    }
    if (classIds.length === 0) continue;
    const classId = classIds[0];
    const existing = existingEnrollmentByKey.get(key);
    if (existing) {
      if (existing.classId !== classId) {
        addIssue({
          severity: 'BLOCKER',
          code: 'ENROLLMENT_CLASS_CONFLICT',
          entityType: 'StudentTermEnrollment',
          entityIds: [existing.id, existing.classId, classId],
          message: 'Explicit enrollment conflicts with historical class evidence.',
        });
      }
      continue;
    }

    const term = termById.get(academicTermId);
    if (!term) continue;
    const groupedEvidence = new Map<string, CollectedEvidence[]>();
    for (const evidence of evidenceMap.values()) {
      const sourceGroup = groupedEvidence.get(evidence.source) ?? [];
      sourceGroup.push(evidence);
      groupedEvidence.set(evidence.source, sourceGroup);
    }
    const evidence = [...groupedEvidence.entries()]
      .sort((left, right) => compareStrings(left[0], right[0]))
      .map(([source, rows]) => ({
        source: source as StudentTermEnrollmentCreateProposal['evidence'][number]['source'],
        refs: uniqueSorted(rows.map(row => row.ref.slice(row.ref.indexOf('|') + 1))),
        recordCount: rows.reduce((total, row) => total + row.recordCount, 0),
      }));
    enrollmentsToCreate.push({
      ref: `student-term-enrollment:${studentId}:${academicTermId}`,
      studentId,
      academicTermId,
      classId,
      status: inferredEnrollmentStatus(term.status),
      transitionAction: null,
      sourceEnrollmentRef: null,
      startsAt: term.startDate,
      endsAt: term.status === 'CLOSED' ? term.endDate : null,
      evidence,
    });
  }

  const enrollmentNodes: EnrollmentNode[] = [
    ...sortedEnrollments.map(enrollment => ({
      ref: enrollment.id,
      id: enrollment.id,
      studentId: enrollment.studentId,
      academicTermId: enrollment.academicTermId,
      classId: enrollment.classId,
      sourceEnrollmentId: enrollment.sourceEnrollmentId,
      transitionAction: enrollment.transitionAction,
      proposed: false,
    })),
    ...enrollmentsToCreate.map(enrollment => ({
      ref: enrollment.ref,
      id: null,
      studentId: enrollment.studentId,
      academicTermId: enrollment.academicTermId,
      classId: enrollment.classId,
      sourceEnrollmentId: null,
      transitionAction: enrollment.transitionAction,
      proposed: true,
    })),
  ];
  const enrollmentNodeByRef = new Map(enrollmentNodes.map(node => [node.ref, node]));
  const nodesByStudent = new Map<string, EnrollmentNode[]>();
  for (const node of enrollmentNodes) {
    nodesByStudent.set(node.studentId, [...(nodesByStudent.get(node.studentId) ?? []), node]);
  }

  const inferTransition = (previous: EnrollmentNode, current: EnrollmentNode): BackfillTransitionAction | null => {
    const previousClass = classById.get(previous.classId);
    const currentClass = classById.get(current.classId);
    if (!previousClass || !currentClass) return null;
    const previousCohortRef = classToCohortRef.get(previousClass.id);
    const currentCohortRef = classToCohortRef.get(currentClass.id);
    if (previousCohortRef && previousCohortRef === currentCohortRef) return 'CARRY_FORWARD';
    const movement = sortedMovements.find(item => (
      item.studentId === current.studentId
      && item.fromClassId === previous.classId
      && item.toClassId === current.classId
    ));
    if (!movement) return null;
    if (previousClass.branchId !== currentClass.branchId) return 'TRANSFER';
    if (currentClass.gradeLevel === previousClass.gradeLevel + 1) return 'PROMOTE';
    if (currentClass.gradeLevel === previousClass.gradeLevel) {
      if (/transfer/i.test(movement.reason ?? '')) return 'TRANSFER';
      if (/retain|repeat/i.test(movement.reason ?? '')) return 'RETAIN';
    }
    return null;
  };

  for (const nodes of nodesByStudent.values()) {
    const ordered = nodes
      .filter(node => {
        const term = termById.get(node.academicTermId);
        return Boolean(term && termYearRef.has(term.id) && resolvedSequence.has(term.id));
      })
      .sort((left, right) => {
        const leftTerm = termById.get(left.academicTermId)!;
        const rightTerm = termById.get(right.academicTermId)!;
        const leftYear = resolvedYearByRef.get(termYearRef.get(leftTerm.id)!)!;
        const rightYear = resolvedYearByRef.get(termYearRef.get(rightTerm.id)!)!;
        return leftYear.startMs - rightYear.startMs
          || (resolvedSequence.get(leftTerm.id)! - resolvedSequence.get(rightTerm.id)!)
          || compareStrings(left.ref, right.ref);
      });

    for (let index = 0; index < ordered.length; index += 1) {
      const node = ordered[index];
      const previous = index > 0 ? ordered[index - 1] : null;
      if (node.sourceEnrollmentId) {
        const source = enrollmentNodeByRef.get(node.sourceEnrollmentId);
        if (!source || source.studentId !== node.studentId || !previous || source.ref !== previous.ref) {
          addIssue({
            severity: 'BLOCKER',
            code: 'ENROLLMENT_SOURCE_INVALID',
            entityType: 'StudentTermEnrollment',
            entityIds: [node.ref, node.sourceEnrollmentId],
            message: 'Enrollment source does not reference the immediately previous known enrollment for the same student.',
          });
        }
      }
      if (!previous) continue;
      const inferredTransition = inferTransition(previous, node);
      if (node.proposed) {
        const proposal = enrollmentsToCreate.find(enrollment => enrollment.ref === node.ref);
        if (proposal) {
          proposal.sourceEnrollmentRef = previous.ref;
          proposal.transitionAction = inferredTransition;
        }
      } else {
        const update: StudentTermEnrollmentUpdateProposal = { enrollmentId: node.ref };
        if (!node.sourceEnrollmentId) update.sourceEnrollmentRef = previous.ref;
        if (!node.transitionAction && inferredTransition) update.transitionAction = inferredTransition;
        if (update.sourceEnrollmentRef || update.transitionAction) {
          enrollmentsToUpdate.push(update);
        }
      }
    }
  }

  academicYearsToCreate.sort((left, right) => compareStrings(left.ref, right.ref));
  termsToUpdate.sort((left, right) => compareStrings(left.termId, right.termId));
  cohortsToCreate.sort((left, right) => compareStrings(left.ref, right.ref));
  cohortsToUpdate.sort((left, right) => compareStrings(left.cohortId, right.cohortId));
  classesToLink.sort((left, right) => compareStrings(left.classId, right.classId));
  enrollmentsToCreate.sort((left, right) => compareStrings(left.ref, right.ref));
  enrollmentsToUpdate.sort((left, right) => compareStrings(left.enrollmentId, right.enrollmentId));
  issues.sort((left, right) => (
    compareStrings(left.severity, right.severity)
    || compareStrings(left.code, right.code)
    || compareStrings(left.entityType, right.entityType)
    || compareStrings(left.entityIds.join('|'), right.entityIds.join('|'))
  ));

  const blockers = issues.filter(issue => issue.severity === 'BLOCKER').length;
  const warnings = issues.length - blockers;
  const proposals: TermBackfillReport['proposals'] = {
    academicYearsToCreate,
    termsToUpdate,
    cohortsToCreate,
    cohortsToUpdate,
    classesToLink,
    enrollmentsToCreate,
    enrollmentsToUpdate,
  };

  return {
    schemaVersion: 1,
    mode: 'DRY_RUN',
    generatedAt: validGeneratedAt(options.generatedAt),
    sourceFingerprint,
    canApply: blockers === 0,
    summary: {
      source: {
        academicYears: input.academicYears.length,
        terms: input.terms.length,
        classes: input.classes.length,
        cohorts: input.cohorts.length,
        students: input.students.length,
        enrollments: input.enrollments.length,
        enrollmentEvidence: input.enrollmentEvidence.length,
        ownershipEvidence: input.ownershipEvidence.length,
        movements: input.movements.length,
      },
      proposals: {
        academicYearsToCreate: proposals.academicYearsToCreate.length,
        termsToUpdate: proposals.termsToUpdate.length,
        cohortsToCreate: proposals.cohortsToCreate.length,
        cohortsToUpdate: proposals.cohortsToUpdate.length,
        classesToLink: proposals.classesToLink.length,
        enrollmentsToCreate: proposals.enrollmentsToCreate.length,
        enrollmentsToUpdate: proposals.enrollmentsToUpdate.length,
      },
      blockers,
      warnings,
    },
    proposals,
    issues,
  };
};
