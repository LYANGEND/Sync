import { prisma } from '../utils/prisma';
import { runTermWriteTransaction } from './termLifecycleService';

const applyScholarshipDiscount = (amount: number, percentage?: number | null) => {
  if (!percentage || percentage <= 0) return amount;
  const discountAmount = (amount * percentage) / 100;
  return Math.max(0, Number((amount - discountAmount).toFixed(2)));
};

export const syncStudentClassFees = async (studentId: string) => {
  const [student, placement] = await Promise.all([
    prisma.student.findUnique({
      where: { id: studentId },
      include: {
        scholarship: {
          select: {
            percentage: true,
          },
        },
        feeStructures: {
          select: {
            feeTemplateId: true,
          },
        },
      },
    }),
    prisma.studentTermEnrollment.findFirst({
      where: {
        studentId,
        status: 'ACTIVE',
        academicTerm: { status: 'ACTIVE' },
      },
      include: { class: { select: { id: true, academicTermId: true } } },
    }),
  ]);

  if (!student || student.status !== 'ACTIVE' || !placement) {
    return { created: 0, skipped: 0, assignmentCount: 0 };
  }

  const assignments = await prisma.classFeeAssignment.findMany({
    where: { classId: placement.classId },
    include: {
      feeTemplate: {
        select: {
          id: true,
          amount: true,
          academicTermId: true,
        },
      },
    },
  });

  const existingFeeTemplateIds = new Set(student.feeStructures.map(fee => fee.feeTemplateId));
  const scholarshipPercentage = student.scholarship ? Number(student.scholarship.percentage) : 0;

  const dataToCreate = assignments
    .filter(assignment => assignment.feeTemplate.academicTermId === placement.academicTermId)
    .filter(assignment => !existingFeeTemplateIds.has(assignment.feeTemplateId))
    .map(assignment => ({
      studentId: student.id,
      feeTemplateId: assignment.feeTemplateId,
      academicTermId: assignment.feeTemplate.academicTermId,
      amountDue: applyScholarshipDiscount(Number(assignment.feeTemplate.amount), scholarshipPercentage),
      amountPaid: 0,
      dueDate: assignment.dueDate,
    }));

  if (dataToCreate.length === 0) {
    return { created: 0, skipped: assignments.length, assignmentCount: assignments.length };
  }

  const result = await runTermWriteTransaction(
    placement.academicTermId,
    'FINANCIAL_OBLIGATION',
    tx => tx.studentFeeStructure.createMany({
      data: dataToCreate,
      skipDuplicates: true,
    }),
  );

  return {
    created: result.count,
    skipped: assignments.length - result.count,
    assignmentCount: assignments.length,
  };
};

export const syncClassFeesToStudents = async (classId: string) => {
  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    select: { academicTermId: true },
  });
  if (!classRecord) {
    return { assignmentCount: 0, studentCount: 0, created: 0 };
  }

  const [classAssignments, enrollments] = await Promise.all([
    prisma.classFeeAssignment.findMany({
      where: { classId },
      include: {
        feeTemplate: {
          select: {
            id: true,
            amount: true,
            academicTermId: true,
          },
        },
      },
    }),
    prisma.studentTermEnrollment.findMany({
      where: { classId, academicTermId: classRecord.academicTermId, status: 'ACTIVE' },
      select: { studentId: true },
    }),
  ]);
  const students = await prisma.student.findMany({
    where: { id: { in: enrollments.map(enrollment => enrollment.studentId) }, status: 'ACTIVE' },
    include: {
      scholarship: {
        select: {
          percentage: true,
        },
      },
      feeStructures: {
        select: {
          feeTemplateId: true,
        },
      },
    },
  });

  if (classAssignments.length === 0 || students.length === 0) {
    return {
      assignmentCount: classAssignments.length,
      studentCount: students.length,
      created: 0,
    };
  }

  const dataToCreate = students.flatMap(student => {
    const existingFeeTemplateIds = new Set(student.feeStructures.map(fee => fee.feeTemplateId));
    const scholarshipPercentage = student.scholarship ? Number(student.scholarship.percentage) : 0;

    return classAssignments
      .filter(assignment => assignment.feeTemplate.academicTermId === classRecord.academicTermId)
      .filter(assignment => !existingFeeTemplateIds.has(assignment.feeTemplateId))
      .map(assignment => ({
        studentId: student.id,
        feeTemplateId: assignment.feeTemplateId,
        academicTermId: assignment.feeTemplate.academicTermId,
        amountDue: applyScholarshipDiscount(Number(assignment.feeTemplate.amount), scholarshipPercentage),
        amountPaid: 0,
        dueDate: assignment.dueDate,
      }));
  });

  if (dataToCreate.length === 0) {
    return {
      assignmentCount: classAssignments.length,
      studentCount: students.length,
      created: 0,
    };
  }

  const result = await runTermWriteTransaction(
    classRecord.academicTermId,
    'FINANCIAL_OBLIGATION',
    tx => tx.studentFeeStructure.createMany({
      data: dataToCreate,
      skipDuplicates: true,
    }),
  );

  return {
    assignmentCount: classAssignments.length,
    studentCount: students.length,
    created: result.count,
  };
};