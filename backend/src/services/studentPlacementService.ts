import { Prisma, StudentTermEnrollmentStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';

export type PlacementClient = Prisma.TransactionClient | typeof prisma;

export const PLACEMENT_ROSTER_STATUSES: StudentTermEnrollmentStatus[] = [
  'STAGED',
  'ACTIVE',
  'COMPLETED',
  'TRANSFERRED',
  'WITHDRAWN',
  'GRADUATED',
];

export class StudentPlacementError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = 'StudentPlacementError';
    this.code = code;
    this.status = status;
  }
}

const requireClassForTerm = async (
  client: PlacementClient,
  classId: string,
  academicTermId: string,
) => {
  const classRecord = await client.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      branchId: true,
      academicTermId: true,
      academicTerm: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (!classRecord) {
    throw new StudentPlacementError('CLASS_NOT_FOUND', 'Class not found', 404);
  }
  if (classRecord.academicTermId !== academicTermId) {
    throw new StudentPlacementError(
      'CLASS_TERM_MISMATCH',
      'Selected class does not belong to the requested academic term',
      400,
    );
  }

  return classRecord;
};

export const getStudentPlacementForTerm = async (
  studentId: string,
  academicTermId: string,
  client: PlacementClient = prisma,
) => {
  const enrollment = await client.studentTermEnrollment.findUnique({
    where: {
      studentId_academicTermId: {
        studentId,
        academicTermId,
      },
    },
    include: {
      class: {
        include: {
          teacher: { select: { id: true, fullName: true } },
          subjects: true,
          branch: true,
        },
      },
      academicTerm: true,
    },
  });

  if (enrollment && enrollment.class.academicTermId !== academicTermId) {
    throw new StudentPlacementError(
      'ENROLLMENT_CLASS_TERM_MISMATCH',
      'Student enrollment references a class from another academic term',
    );
  }

  return enrollment;
};

export const getClassEnrollmentsForTerm = async (
  classId: string,
  academicTermId: string,
  options: {
    statuses?: StudentTermEnrollmentStatus[];
    client?: PlacementClient;
  } = {},
) => {
  const client = options.client ?? prisma;
  await requireClassForTerm(client, classId, academicTermId);

  return client.studentTermEnrollment.findMany({
    where: {
      classId,
      academicTermId,
      status: { in: options.statuses ?? PLACEMENT_ROSTER_STATUSES },
    },
    include: {
      student: {
        include: {
          branch: true,
        },
      },
      class: true,
    },
    orderBy: [
      { student: { lastName: 'asc' } },
      { student: { firstName: 'asc' } },
    ],
  });
};

export const assertStudentsEnrolledInClass = async (
  classId: string,
  academicTermId: string,
  studentIds: string[],
  options: {
    statuses?: StudentTermEnrollmentStatus[];
    client?: PlacementClient;
  } = {},
) => {
  const uniqueStudentIds = [...new Set(studentIds)];
  const client = options.client ?? prisma;
  await requireClassForTerm(client, classId, academicTermId);

  if (uniqueStudentIds.length === 0) return;

  const count = await client.studentTermEnrollment.count({
    where: {
      studentId: { in: uniqueStudentIds },
      academicTermId,
      classId,
      status: { in: options.statuses ?? ['ACTIVE'] },
    },
  });

  if (count !== uniqueStudentIds.length) {
    throw new StudentPlacementError(
      'STUDENT_TERM_CLASS_MISMATCH',
      'One or more students are not enrolled in the selected class for this academic term',
      400,
    );
  }
};

export interface UpsertStudentPlacementInput {
  studentId: string;
  academicTermId: string;
  classId: string;
  status?: StudentTermEnrollmentStatus;
  startsAt?: Date;
  endsAt?: Date | null;
  sourceEnrollmentId?: string | null;
  transitionAction?: Prisma.StudentTermEnrollmentUncheckedCreateInput['transitionAction'];
  notes?: string | null;
  changedByUserId?: string | null;
  movementReason?: string;
}

export const upsertStudentPlacement = async (
  client: Prisma.TransactionClient,
  input: UpsertStudentPlacementInput,
) => {
  const classRecord = await requireClassForTerm(client, input.classId, input.academicTermId);
  const student = await client.student.findUnique({
    where: { id: input.studentId },
    select: { id: true, classId: true, branchId: true, status: true },
  });
  if (!student) {
    throw new StudentPlacementError('STUDENT_NOT_FOUND', 'Student not found', 404);
  }
  if (classRecord.branchId && student.branchId && classRecord.branchId !== student.branchId) {
    throw new StudentPlacementError(
      'STUDENT_CLASS_BRANCH_MISMATCH',
      'Student and class must belong to the same branch',
      400,
    );
  }

  if (input.sourceEnrollmentId) {
    const source = await client.studentTermEnrollment.findUnique({
      where: { id: input.sourceEnrollmentId },
      select: { studentId: true, academicTermId: true },
    });
    if (!source || source.studentId !== input.studentId) {
      throw new StudentPlacementError(
        'ENROLLMENT_LINEAGE_MISMATCH',
        'Source enrollment must belong to the same student',
        400,
      );
    }
    if (source.academicTermId === input.academicTermId) {
      throw new StudentPlacementError(
        'ENROLLMENT_LINEAGE_TERM_MISMATCH',
        'Source enrollment must belong to an earlier academic term',
        400,
      );
    }
  }

  const status = input.status ?? (
    classRecord.academicTerm.status === 'ACTIVE' ? 'ACTIVE' : 'STAGED'
  );
  const existing = await client.studentTermEnrollment.findUnique({
    where: {
      studentId_academicTermId: {
        studentId: input.studentId,
        academicTermId: input.academicTermId,
      },
    },
    select: { id: true, classId: true },
  });

  const enrollment = await client.studentTermEnrollment.upsert({
    where: {
      studentId_academicTermId: {
        studentId: input.studentId,
        academicTermId: input.academicTermId,
      },
    },
    update: {
      classId: input.classId,
      status,
      endsAt: input.endsAt,
      sourceEnrollmentId: input.sourceEnrollmentId,
      transitionAction: input.transitionAction,
      notes: input.notes,
    },
    create: {
      studentId: input.studentId,
      academicTermId: input.academicTermId,
      classId: input.classId,
      status,
      startsAt: input.startsAt ?? classRecord.academicTerm.startDate,
      endsAt: input.endsAt,
      sourceEnrollmentId: input.sourceEnrollmentId,
      transitionAction: input.transitionAction,
      notes: input.notes,
      createdByUserId: input.changedByUserId,
    },
  });

  const previousClassId = existing?.classId
    ?? (classRecord.academicTerm.status === 'ACTIVE' ? student.classId : null);
  if (previousClassId && previousClassId !== input.classId) {
    await client.classMovementLog.create({
      data: {
        studentId: input.studentId,
        fromClassId: previousClassId,
        toClassId: input.classId,
        reason: input.movementReason ?? 'Term placement update',
        changedByUserId: input.changedByUserId,
      },
    });
  }

  const compatibilityPointerUpdated = classRecord.academicTerm.status === 'ACTIVE'
    && status === 'ACTIVE';
  if (compatibilityPointerUpdated && student.classId !== input.classId) {
    await client.student.update({
      where: { id: input.studentId },
      data: { classId: input.classId },
    });
  }

  return { enrollment, compatibilityPointerUpdated };
};
