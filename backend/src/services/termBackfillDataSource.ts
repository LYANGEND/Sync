import { Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import {
  BackfillAcademicYearInput,
  BackfillClassCohortInput,
  BackfillClassInput,
  BackfillEnrollmentEvidenceInput,
  BackfillEnrollmentInput,
  BackfillMovementInput,
  BackfillOwnershipEvidenceInput,
  BackfillSchoolSettingsInput,
  BackfillStudentInput,
  BackfillTermInput,
  TermBackfillPlannerInput,
  TermBackfillReport,
} from './termBackfillPlanner';

export interface LoadedTermBackfillData {
  input: TermBackfillPlannerInput;
  snapshotFingerprint: string;
}

export interface TermBackfillApplyResult {
  mode: 'APPLY';
  sourceFingerprint: string;
  counts: TermBackfillReport['summary']['proposals'];
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = canonicalize(child);
    }
    return result;
  }
  return value;
};

const fingerprint = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(canonicalize(value)))
  .digest('hex');

const iso = (value: Date): string => value.toISOString();
const isoOrUndefined = (value: Date | null): string | undefined => value?.toISOString();
const isoOrNull = (value: Date | null): string | null => value?.toISOString() ?? null;

export const loadTermBackfillData = async (
  client: PrismaClient | Prisma.TransactionClient,
): Promise<LoadedTermBackfillData> => {
  const [
    academicYears,
    terms,
    classes,
    cohorts,
    students,
    enrollments,
    movements,
    schoolSettings,
    reports,
    results,
    attendances,
    assessments,
  ] = await Promise.all([
    client.academicYear.findMany({ orderBy: { id: 'asc' } }),
    client.academicTerm.findMany({ orderBy: { id: 'asc' } }),
    client.class.findMany({ orderBy: { id: 'asc' } }),
    client.classCohort.findMany({ orderBy: { id: 'asc' } }),
    client.student.findMany({ orderBy: { id: 'asc' } }),
    client.studentTermEnrollment.findMany({ orderBy: { id: 'asc' } }),
    client.classMovementLog.findMany({ orderBy: { id: 'asc' } }),
    client.schoolSettings.findMany({ orderBy: { id: 'asc' } }),
    client.studentTermReport.groupBy({
      by: ['studentId', 'termId', 'classId'],
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { updatedAt: true },
      orderBy: [{ studentId: 'asc' }, { termId: 'asc' }, { classId: 'asc' }],
    }),
    client.termResult.groupBy({
      by: ['studentId', 'termId', 'classId'],
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { updatedAt: true },
      orderBy: [{ studentId: 'asc' }, { termId: 'asc' }, { classId: 'asc' }],
    }),
    client.attendance.groupBy({
      by: ['studentId', 'academicTermId', 'classId'],
      _count: { _all: true },
      _min: { date: true },
      _max: { date: true },
      orderBy: [{ studentId: 'asc' }, { academicTermId: 'asc' }, { classId: 'asc' }],
    }),
    client.assessment.groupBy({
      by: ['termId', 'classId'],
      _count: { _all: true },
      orderBy: [{ termId: 'asc' }, { classId: 'asc' }],
    }),
  ]);

  const academicYearInput: BackfillAcademicYearInput[] = academicYears.map(year => ({
    id: year.id,
    name: year.name,
    startDate: iso(year.startDate),
    endDate: iso(year.endDate),
    termCount: year.termCount,
  }));
  const termInput: BackfillTermInput[] = terms.map(term => ({
    id: term.id,
    name: term.name,
    startDate: iso(term.startDate),
    endDate: iso(term.endDate),
    academicYearId: term.academicYearId,
    sequence: term.sequence,
    status: term.status,
    isActive: term.isActive,
    version: term.version,
  }));
  const classInput: BackfillClassInput[] = classes.map(classRecord => ({
    id: classRecord.id,
    name: classRecord.name,
    gradeLevel: classRecord.gradeLevel,
    branchId: classRecord.branchId,
    academicTermId: classRecord.academicTermId,
    classCohortId: classRecord.classCohortId,
  }));
  const cohortInput: BackfillClassCohortInput[] = cohorts.map(cohort => ({
    id: cohort.id,
    academicYearId: cohort.academicYearId,
    name: cohort.name,
    gradeLevel: cohort.gradeLevel,
    branchId: cohort.branchId,
    predecessorCohortId: cohort.predecessorCohortId,
  }));
  const studentInput: BackfillStudentInput[] = students.map(student => ({
    id: student.id,
    admissionNumber: student.admissionNumber,
    status: student.status,
    classId: student.classId,
  }));
  const enrollmentInput: BackfillEnrollmentInput[] = enrollments.map(enrollment => ({
    id: enrollment.id,
    studentId: enrollment.studentId,
    academicTermId: enrollment.academicTermId,
    classId: enrollment.classId,
    status: enrollment.status,
    transitionAction: enrollment.transitionAction,
    sourceEnrollmentId: enrollment.sourceEnrollmentId,
    startsAt: iso(enrollment.startsAt),
    endsAt: isoOrNull(enrollment.endsAt),
  }));
  const enrollmentEvidence: BackfillEnrollmentEvidenceInput[] = [
    ...reports.map(report => ({
      source: 'REPORT' as const,
      evidenceRef: `report:${report.studentId}:${report.termId}:${report.classId}`,
      studentId: report.studentId,
      academicTermId: report.termId,
      classId: report.classId,
      recordCount: report._count._all,
      firstObservedAt: isoOrUndefined(report._min.createdAt),
      lastObservedAt: isoOrUndefined(report._max.updatedAt),
    })),
    ...results.map(result => ({
      source: 'RESULT' as const,
      evidenceRef: `result:${result.studentId}:${result.termId}:${result.classId}`,
      studentId: result.studentId,
      academicTermId: result.termId,
      classId: result.classId,
      recordCount: result._count._all,
      firstObservedAt: isoOrUndefined(result._min.createdAt),
      lastObservedAt: isoOrUndefined(result._max.updatedAt),
    })),
    ...attendances.map(attendance => ({
      source: 'ATTENDANCE' as const,
      evidenceRef: `attendance:${attendance.studentId}:${attendance.academicTermId}:${attendance.classId}`,
      studentId: attendance.studentId,
      academicTermId: attendance.academicTermId,
      classId: attendance.classId,
      recordCount: attendance._count._all,
      firstObservedAt: isoOrUndefined(attendance._min.date),
      lastObservedAt: isoOrUndefined(attendance._max.date),
    })),
  ];
  const ownershipEvidence: BackfillOwnershipEvidenceInput[] = assessments.map(assessment => ({
    source: 'ASSESSMENT',
    evidenceRef: `assessment:${assessment.termId}:${assessment.classId}`,
    academicTermId: assessment.termId,
    classId: assessment.classId,
    recordCount: assessment._count._all,
  }));
  const movementInput: BackfillMovementInput[] = movements.map(movement => ({
    id: movement.id,
    studentId: movement.studentId,
    fromClassId: movement.fromClassId,
    toClassId: movement.toClassId,
    reason: movement.reason,
    createdAt: iso(movement.createdAt),
  }));
  const settingsInput: BackfillSchoolSettingsInput[] = schoolSettings.map(settings => ({
    id: settings.id,
    currentTermId: settings.currentTermId,
  }));

  const input: TermBackfillPlannerInput = {
    academicYears: academicYearInput,
    terms: termInput,
    classes: classInput,
    cohorts: cohortInput,
    students: studentInput,
    enrollments: enrollmentInput,
    enrollmentEvidence,
    ownershipEvidence,
    movements: movementInput,
    schoolSettings: settingsInput,
  };

  return { input, snapshotFingerprint: fingerprint(input) };
};

const resolveRequiredReference = (
  ref: string,
  created: Map<string, string>,
  existingIds: ReadonlySet<string>,
  entityType: string,
): string => {
  const createdId = created.get(ref);
  if (createdId) return createdId;
  if (existingIds.has(ref)) return ref;
  throw new Error(`Unable to resolve ${entityType} reference ${ref}.`);
};

const assertValidReportEnvelope = (report: TermBackfillReport): void => {
  const actualBlockers = report.issues.filter(issue => issue.severity === 'BLOCKER').length;
  const actualWarnings = report.issues.length - actualBlockers;
  if (
    actualBlockers !== report.summary.blockers
    || actualWarnings !== report.summary.warnings
    || report.canApply !== (actualBlockers === 0)
  ) {
    throw new Error('Backfill report summary does not match its issue list.');
  }

  for (const [key, proposals] of Object.entries(report.proposals)) {
    const expected = report.summary.proposals[key as keyof typeof report.summary.proposals];
    if (proposals.length !== expected) {
      throw new Error(`Backfill report proposal count mismatch for ${key}.`);
    }
  }
};

export const applyTermBackfillReport = async (
  prisma: PrismaClient,
  report: TermBackfillReport,
  expectedSnapshotFingerprint: string,
): Promise<TermBackfillApplyResult> => {
  assertValidReportEnvelope(report);
  if (!report.canApply || report.summary.blockers > 0) {
    throw new Error('Backfill report contains blockers and cannot be applied.');
  }

  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sync:term-backfill'))`;
    const current = await loadTermBackfillData(tx);
    if (current.snapshotFingerprint !== expectedSnapshotFingerprint) {
      throw new Error('Backfill source data changed after planning; generate a new dry-run report.');
    }
    const existingYearIds = new Set(current.input.academicYears.map(year => year.id));
    const existingCohortIds = new Set(current.input.cohorts.map(cohort => cohort.id));
    const existingEnrollmentIds = new Set(current.input.enrollments.map(enrollment => enrollment.id));

    const createdYears = new Map<string, string>();
    for (const proposal of report.proposals.academicYearsToCreate) {
      if (createdYears.has(proposal.ref) || existingYearIds.has(proposal.ref)) {
        throw new Error(`Duplicate academic year proposal reference ${proposal.ref}.`);
      }
      const created = await tx.academicYear.create({
        data: {
          name: proposal.name,
          startDate: new Date(proposal.startDate),
          endDate: new Date(proposal.endDate),
          termCount: proposal.termCount,
        },
      });
      createdYears.set(proposal.ref, created.id);
    }

    for (const proposal of report.proposals.termsToUpdate) {
      const academicYearId = resolveRequiredReference(
        proposal.after.academicYearRef,
        createdYears,
        existingYearIds,
        'academic year',
      );
      const result = await tx.academicTerm.updateMany({
        where: { id: proposal.termId, version: proposal.expectedVersion },
        data: {
          academicYearId,
          sequence: proposal.after.sequence,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) {
        throw new Error(`Term ${proposal.termId} changed after planning.`);
      }
    }

    const createdCohorts = new Map<string, string>();
    const pendingPredecessors: Array<{ cohortId: string; predecessorRef: string }> = [];
    for (const proposal of report.proposals.cohortsToCreate) {
      if (createdCohorts.has(proposal.ref) || existingCohortIds.has(proposal.ref)) {
        throw new Error(`Duplicate class cohort proposal reference ${proposal.ref}.`);
      }
      const academicYearId = resolveRequiredReference(
        proposal.academicYearRef,
        createdYears,
        existingYearIds,
        'academic year',
      );
      const created = await tx.classCohort.create({
        data: {
          academicYearId,
          name: proposal.name,
          gradeLevel: proposal.gradeLevel,
          branchId: proposal.branchId,
        },
      });
      createdCohorts.set(proposal.ref, created.id);
      if (proposal.predecessorCohortRef) {
        pendingPredecessors.push({
          cohortId: created.id,
          predecessorRef: proposal.predecessorCohortRef,
        });
      }
    }

    for (const proposal of report.proposals.cohortsToUpdate) {
      pendingPredecessors.push({
        cohortId: proposal.cohortId,
        predecessorRef: proposal.predecessorCohortRef,
      });
    }
    for (const pending of pendingPredecessors) {
      const predecessorCohortId = resolveRequiredReference(
        pending.predecessorRef,
        createdCohorts,
        existingCohortIds,
        'predecessor cohort',
      );
      const result = await tx.classCohort.updateMany({
        where: { id: pending.cohortId, predecessorCohortId: null },
        data: { predecessorCohortId },
      });
      if (result.count !== 1) {
        throw new Error(`Cohort ${pending.cohortId} changed after planning.`);
      }
    }

    for (const proposal of report.proposals.classesToLink) {
      const classCohortId = resolveRequiredReference(
        proposal.cohortRef,
        createdCohorts,
        existingCohortIds,
        'class cohort',
      );
      const result = await tx.class.updateMany({
        where: { id: proposal.classId, classCohortId: null },
        data: { classCohortId },
      });
      if (result.count !== 1) {
        throw new Error(`Class ${proposal.classId} changed after planning.`);
      }
    }

    const createdEnrollments = new Map<string, string>();
    const pendingEnrollmentLinks: Array<{
      enrollmentId: string;
      sourceEnrollmentRef: string | null;
      transitionAction: TermBackfillReport['proposals']['enrollmentsToCreate'][number]['transitionAction'];
    }> = [];
    for (const proposal of report.proposals.enrollmentsToCreate) {
      if (createdEnrollments.has(proposal.ref) || existingEnrollmentIds.has(proposal.ref)) {
        throw new Error(`Duplicate enrollment proposal reference ${proposal.ref}.`);
      }
      const created = await tx.studentTermEnrollment.create({
        data: {
          studentId: proposal.studentId,
          academicTermId: proposal.academicTermId,
          classId: proposal.classId,
          status: proposal.status,
          startsAt: new Date(proposal.startsAt),
          endsAt: proposal.endsAt ? new Date(proposal.endsAt) : null,
          notes: `Deterministic term backfill (${report.sourceFingerprint})`,
        },
      });
      createdEnrollments.set(proposal.ref, created.id);
      pendingEnrollmentLinks.push({
        enrollmentId: created.id,
        sourceEnrollmentRef: proposal.sourceEnrollmentRef,
        transitionAction: proposal.transitionAction,
      });
    }

    for (const proposal of report.proposals.enrollmentsToUpdate) {
      pendingEnrollmentLinks.push({
        enrollmentId: proposal.enrollmentId,
        sourceEnrollmentRef: proposal.sourceEnrollmentRef ?? null,
        transitionAction: proposal.transitionAction ?? null,
      });
    }
    for (const pending of pendingEnrollmentLinks) {
      const sourceEnrollmentId = pending.sourceEnrollmentRef
        ? resolveRequiredReference(
          pending.sourceEnrollmentRef,
          createdEnrollments,
          existingEnrollmentIds,
          'source enrollment',
        )
        : null;
      if (!sourceEnrollmentId && !pending.transitionAction) continue;
      const result = await tx.studentTermEnrollment.updateMany({
        where: {
          id: pending.enrollmentId,
          ...(sourceEnrollmentId ? { sourceEnrollmentId: null } : {}),
          ...(pending.transitionAction ? { transitionAction: null } : {}),
        },
        data: {
          ...(sourceEnrollmentId ? { sourceEnrollmentId } : {}),
          ...(pending.transitionAction ? { transitionAction: pending.transitionAction } : {}),
        },
      });
      if (result.count !== 1) {
        throw new Error(`Enrollment ${pending.enrollmentId} changed after planning.`);
      }
    }

    return {
      mode: 'APPLY' as const,
      sourceFingerprint: report.sourceFingerprint,
      counts: report.summary.proposals,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 120_000,
  });
};
