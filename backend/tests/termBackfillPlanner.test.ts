import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BackfillTermInput,
  planTermBackfill,
  TermBackfillPlannerInput,
} from '../src/services/termBackfillPlanner';

const generatedAt = '2035-01-01T00:00:00.000Z';
const date = (value: string): string => `${value}T00:00:00.000Z`;

const term = (
  id: string,
  name: string,
  startDate: string,
  endDate: string,
  status: BackfillTermInput['status'],
  academicYearId: string | null = null,
  sequence: number | null = null,
): BackfillTermInput => ({
  id,
  name,
  startDate: date(startDate),
  endDate: date(endDate),
  academicYearId,
  sequence,
  status,
  isActive: status === 'ACTIVE',
  version: 1,
});

const emptyInput = (): TermBackfillPlannerInput => ({
  academicYears: [],
  terms: [],
  classes: [],
  cohorts: [],
  students: [],
  enrollments: [],
  enrollmentEvidence: [],
  ownershipEvidence: [],
  movements: [],
  schoolSettings: [],
});

const singleYearInput = (): TermBackfillPlannerInput => ({
  academicYears: [{
    id: 'year-2024',
    name: '2024 Academic Year',
    startDate: date('2024-01-01'),
    endDate: date('2024-12-31'),
    termCount: 3,
  }],
  terms: [
    term('term-1', 'Term 1', '2024-01-08', '2024-03-28', 'CLOSED'),
    term('term-2', 'Term 2', '2024-04-15', '2024-06-28', 'CLOSED'),
    term('term-3', 'Term 3', '2024-07-15', '2024-09-27', 'ACTIVE'),
  ],
  classes: [
    { id: 'class-1', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-1', classCohortId: null },
    { id: 'class-2', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-2', classCohortId: null },
    { id: 'class-3', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-3', classCohortId: null },
  ],
  cohorts: [],
  students: [{
    id: 'student-1',
    admissionNumber: 'ADM-001',
    status: 'ACTIVE',
    classId: 'class-3',
  }],
  enrollments: [],
  enrollmentEvidence: [
    {
      source: 'REPORT',
      evidenceRef: 'report-1',
      studentId: 'student-1',
      academicTermId: 'term-1',
      classId: 'class-1',
      recordCount: 1,
    },
    {
      source: 'RESULT',
      evidenceRef: 'result-2',
      studentId: 'student-1',
      academicTermId: 'term-2',
      classId: 'class-2',
      recordCount: 8,
    },
  ],
  ownershipEvidence: [],
  movements: [],
  schoolSettings: [{ id: 'settings-1', currentTermId: 'term-3' }],
});

const explicitAppliedInput = (): TermBackfillPlannerInput => ({
  academicYears: [{
    id: 'year-2024',
    name: '2024 Academic Year',
    startDate: date('2024-01-01'),
    endDate: date('2024-12-31'),
    termCount: 3,
  }],
  terms: [
    term('term-1', 'Term 1', '2024-01-08', '2024-03-28', 'CLOSED', 'year-2024', 1),
    term('term-2', 'Term 2', '2024-04-15', '2024-06-28', 'CLOSED', 'year-2024', 2),
    term('term-3', 'Term 3', '2024-07-15', '2024-09-27', 'ACTIVE', 'year-2024', 3),
  ],
  classes: [
    { id: 'class-1', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-1', classCohortId: 'cohort-1' },
    { id: 'class-2', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-2', classCohortId: 'cohort-1' },
    { id: 'class-3', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-3', classCohortId: 'cohort-1' },
  ],
  cohorts: [{
    id: 'cohort-1',
    academicYearId: 'year-2024',
    name: 'Form 1A',
    gradeLevel: 1,
    branchId: null,
    predecessorCohortId: null,
  }],
  students: [{
    id: 'student-1',
    admissionNumber: 'ADM-001',
    status: 'ACTIVE',
    classId: 'class-3',
  }],
  enrollments: [
    {
      id: 'enrollment-1',
      studentId: 'student-1',
      academicTermId: 'term-1',
      classId: 'class-1',
      status: 'COMPLETED',
      transitionAction: null,
      sourceEnrollmentId: null,
      startsAt: date('2024-01-08'),
      endsAt: date('2024-03-28'),
    },
    {
      id: 'enrollment-2',
      studentId: 'student-1',
      academicTermId: 'term-2',
      classId: 'class-2',
      status: 'COMPLETED',
      transitionAction: 'CARRY_FORWARD',
      sourceEnrollmentId: 'enrollment-1',
      startsAt: date('2024-04-15'),
      endsAt: date('2024-06-28'),
    },
    {
      id: 'enrollment-3',
      studentId: 'student-1',
      academicTermId: 'term-3',
      classId: 'class-3',
      status: 'ACTIVE',
      transitionAction: 'CARRY_FORWARD',
      sourceEnrollmentId: 'enrollment-2',
      startsAt: date('2024-07-15'),
      endsAt: null,
    },
  ],
  enrollmentEvidence: [
    {
      source: 'REPORT',
      evidenceRef: 'report-1',
      studentId: 'student-1',
      academicTermId: 'term-1',
      classId: 'class-1',
      recordCount: 1,
    },
    {
      source: 'RESULT',
      evidenceRef: 'result-2',
      studentId: 'student-1',
      academicTermId: 'term-2',
      classId: 'class-2',
      recordCount: 8,
    },
  ],
  ownershipEvidence: [],
  movements: [],
  schoolSettings: [{ id: 'settings-1', currentTermId: 'term-3' }],
});

test('plans a single unambiguous year, cohort, and enrollment history without guessing', () => {
  const report = planTermBackfill(singleYearInput(), { generatedAt });

  assert.equal(report.canApply, true);
  assert.equal(report.summary.blockers, 0);
  assert.deepEqual(report.summary.proposals, {
    academicYearsToCreate: 0,
    termsToUpdate: 3,
    cohortsToCreate: 1,
    cohortsToUpdate: 0,
    classesToLink: 3,
    enrollmentsToCreate: 3,
    enrollmentsToUpdate: 0,
  });
  assert.deepEqual(
    report.proposals.termsToUpdate.map(proposal => [
      proposal.termId,
      proposal.after.academicYearRef,
      proposal.after.sequence,
    ]),
    [
      ['term-1', 'year-2024', 1],
      ['term-2', 'year-2024', 2],
      ['term-3', 'year-2024', 3],
    ],
  );

  const enrollmentByTerm = new Map(
    report.proposals.enrollmentsToCreate.map(enrollment => [enrollment.academicTermId, enrollment]),
  );
  assert.equal(enrollmentByTerm.get('term-1')?.sourceEnrollmentRef, null);
  assert.equal(
    enrollmentByTerm.get('term-2')?.sourceEnrollmentRef,
    'student-term-enrollment:student-1:term-1',
  );
  assert.equal(enrollmentByTerm.get('term-2')?.transitionAction, 'CARRY_FORWARD');
  assert.equal(
    enrollmentByTerm.get('term-3')?.sourceEnrollmentRef,
    'student-term-enrollment:student-1:term-2',
  );
  assert.equal(enrollmentByTerm.get('term-3')?.status, 'ACTIVE');
});

test('creates only complete calendar-year groups and infers cross-year cohort lineage from movement evidence', () => {
  const input = emptyInput();
  input.terms = [
    term('2024-t1', 'Term 1', '2024-01-08', '2024-03-28', 'CLOSED'),
    term('2024-t2', 'Term 2', '2024-04-15', '2024-06-28', 'CLOSED'),
    term('2024-t3', 'Term 3', '2024-07-15', '2024-09-27', 'CLOSED'),
    term('2025-t1', 'Term 1', '2025-01-06', '2025-03-28', 'CLOSED'),
    term('2025-t2', 'Term 2', '2025-04-14', '2025-06-27', 'CLOSED'),
    term('2025-t3', 'Term 3', '2025-07-14', '2025-09-26', 'ACTIVE'),
  ];
  input.classes = input.terms.map(termRecord => {
    const is2024 = termRecord.id.startsWith('2024');
    return {
      id: `class-${termRecord.id}`,
      name: is2024 ? 'Form 1A' : 'Form 2A',
      gradeLevel: is2024 ? 1 : 2,
      branchId: null,
      academicTermId: termRecord.id,
      classCohortId: null,
    };
  });
  input.students = [{
    id: 'student-1',
    admissionNumber: 'ADM-001',
    status: 'ACTIVE',
    classId: 'class-2025-t3',
  }];
  input.enrollmentEvidence = input.terms.slice(0, -1).map(termRecord => ({
    source: 'REPORT',
    evidenceRef: `report-${termRecord.id}`,
    studentId: 'student-1',
    academicTermId: termRecord.id,
    classId: `class-${termRecord.id}`,
    recordCount: 1,
  }));
  input.movements = [{
    id: 'movement-year-end',
    studentId: 'student-1',
    fromClassId: 'class-2024-t3',
    toClassId: 'class-2025-t1',
    reason: 'End of Year Promotion',
    createdAt: date('2025-01-06'),
  }];
  input.schoolSettings = [{ id: 'settings-1', currentTermId: '2025-t3' }];

  const report = planTermBackfill(input, { generatedAt });

  assert.equal(report.canApply, true);
  assert.equal(report.summary.blockers, 0);
  assert.equal(report.proposals.academicYearsToCreate.length, 2);
  assert.deepEqual(
    report.proposals.academicYearsToCreate.map(year => year.ref),
    ['academic-year:calendar:2024', 'academic-year:calendar:2025'],
  );
  assert.equal(report.proposals.cohortsToCreate.length, 2);
  const source = report.proposals.cohortsToCreate.find(cohort => cohort.name === 'Form 1A');
  const target = report.proposals.cohortsToCreate.find(cohort => cohort.name === 'Form 2A');
  assert.ok(source);
  assert.ok(target);
  assert.equal(target.predecessorCohortRef, source.ref);
  const first2025Enrollment = report.proposals.enrollmentsToCreate.find(
    enrollment => enrollment.academicTermId === '2025-t1',
  );
  assert.equal(first2025Enrollment?.transitionAction, 'PROMOTE');
});

test('preserves valid explicit mappings and produces an empty idempotent rerun plan', () => {
  const input = explicitAppliedInput();
  const first = planTermBackfill(input, { generatedAt });
  const reordered: TermBackfillPlannerInput = {
    ...input,
    terms: [...input.terms].reverse(),
    classes: [...input.classes].reverse(),
    enrollments: [...input.enrollments].reverse(),
    enrollmentEvidence: [...input.enrollmentEvidence].reverse(),
  };
  const second = planTermBackfill(reordered, { generatedAt });

  assert.equal(first.canApply, true);
  assert.equal(first.summary.blockers, 0);
  assert.equal(
    Object.values(first.summary.proposals).reduce((total, count) => total + count, 0),
    0,
  );
  assert.equal(second.sourceFingerprint, first.sourceFingerprint);
  assert.deepEqual(second.proposals, first.proposals);
  assert.deepEqual(second.issues, first.issues);
});

test('blocks overlapping academic years and tied term dates rather than choosing a closest fit', () => {
  const input = emptyInput();
  input.academicYears = [
    {
      id: 'year-calendar',
      name: 'Calendar 2024',
      startDate: date('2024-01-01'),
      endDate: date('2024-12-31'),
      termCount: 3,
    },
    {
      id: 'year-split',
      name: '2024-2025',
      startDate: date('2024-09-01'),
      endDate: date('2025-08-31'),
      termCount: 3,
    },
  ];
  input.terms = [
    term('term-a', 'Term A', '2024-10-01', '2024-12-15', 'ACTIVE'),
    term('term-b', 'Term B', '2025-01-06', '2025-03-28', 'DRAFT', 'year-split'),
    term('term-c', 'Term C', '2025-01-06', '2025-06-27', 'DRAFT', 'year-split'),
  ];
  input.schoolSettings = [{ id: 'settings-1', currentTermId: 'term-a' }];

  const report = planTermBackfill(input, { generatedAt });
  const codes = new Set(report.issues.map(issue => issue.code));

  assert.equal(report.canApply, false);
  assert.ok(codes.has('ACADEMIC_YEAR_DATE_OVERLAP'));
  assert.ok(codes.has('TERM_YEAR_AMBIGUOUS'));
  assert.ok(codes.has('TERM_DATE_TIE'));
  assert.ok(codes.has('TERM_DATE_OVERLAP'));
});

test('blocks normalized cohort-name collisions', () => {
  const input = explicitAppliedInput();
  input.classes = [];
  input.students = [];
  input.enrollments = [];
  input.enrollmentEvidence = [];
  input.cohorts = [
    {
      id: 'cohort-a',
      academicYearId: 'year-2024',
      name: 'Form 1-A',
      gradeLevel: 1,
      branchId: null,
      predecessorCohortId: null,
    },
    {
      id: 'cohort-b',
      academicYearId: 'year-2024',
      name: ' form 1 a ',
      gradeLevel: 1,
      branchId: null,
      predecessorCohortId: null,
    },
  ];

  const report = planTermBackfill(input, { generatedAt });

  assert.equal(report.canApply, false);
  assert.ok(report.issues.some(issue => issue.code === 'COHORT_NORMALIZED_NAME_COLLISION'));
});

test('blocks contradictory report, result, and attendance placement evidence', () => {
  const input = explicitAppliedInput();
  input.classes = [
    { id: 'class-a', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-1', classCohortId: null },
    { id: 'class-b', name: 'Form 1B', gradeLevel: 1, branchId: null, academicTermId: 'term-1', classCohortId: null },
    { id: 'class-active', name: 'Form 1A', gradeLevel: 1, branchId: null, academicTermId: 'term-3', classCohortId: null },
  ];
  input.cohorts = [];
  input.students = [{
    id: 'student-1',
    admissionNumber: 'ADM-001',
    status: 'ACTIVE',
    classId: 'class-active',
  }];
  input.enrollments = [];
  input.enrollmentEvidence = [
    {
      source: 'REPORT',
      evidenceRef: 'report-conflict',
      studentId: 'student-1',
      academicTermId: 'term-1',
      classId: 'class-a',
      recordCount: 1,
    },
    {
      source: 'RESULT',
      evidenceRef: 'result-conflict',
      studentId: 'student-1',
      academicTermId: 'term-1',
      classId: 'class-b',
      recordCount: 5,
    },
    {
      source: 'ATTENDANCE',
      evidenceRef: 'attendance-conflict',
      studentId: 'student-1',
      academicTermId: 'term-1',
      classId: 'class-a',
      recordCount: 30,
    },
  ];

  const report = planTermBackfill(input, { generatedAt });
  const conflict = report.issues.find(issue => issue.code === 'ENROLLMENT_CLASS_CONFLICT');

  assert.equal(report.canApply, false);
  assert.ok(conflict);
  assert.deepEqual(conflict.entityIds, ['class-a', 'class-b', 'student-1', 'term-1']);
  assert.equal(
    report.proposals.enrollmentsToCreate.some(enrollment => enrollment.academicTermId === 'term-1'),
    false,
  );
});

test('blocks cyclic cohort predecessor lineage', () => {
  const input = explicitAppliedInput();
  input.cohorts = [
    {
      id: 'cohort-1',
      academicYearId: 'year-2024',
      name: 'Form 1A',
      gradeLevel: 1,
      branchId: null,
      predecessorCohortId: 'cohort-2',
    },
    {
      id: 'cohort-2',
      academicYearId: 'year-2024',
      name: 'Form 2A',
      gradeLevel: 2,
      branchId: null,
      predecessorCohortId: 'cohort-1',
    },
  ];

  const report = planTermBackfill(input, { generatedAt });

  assert.equal(report.canApply, false);
  assert.ok(report.issues.some(issue => issue.code === 'COHORT_PREDECESSOR_CYCLE'));
  assert.ok(report.issues.some(issue => issue.code === 'COHORT_PREDECESSOR_CONFLICT'));
});

test('blocks enrollment lineage that references a missing source enrollment', () => {
  const input = explicitAppliedInput();
  const second = input.enrollments.find(enrollment => enrollment.id === 'enrollment-2');
  assert.ok(second);
  second.sourceEnrollmentId = 'missing-enrollment';

  const report = planTermBackfill(input, { generatedAt });

  assert.equal(report.canApply, false);
  const issue = report.issues.find(item => item.code === 'ENROLLMENT_SOURCE_INVALID');
  assert.ok(issue);
  assert.deepEqual(issue.entityIds, ['enrollment-2', 'missing-enrollment']);
});
