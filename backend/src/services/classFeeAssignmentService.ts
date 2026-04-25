import { prisma } from '../utils/prisma';

const applyScholarshipDiscount = (amount: number, percentage?: number | null) => {
  if (!percentage || percentage <= 0) return amount;
  const discountAmount = (amount * percentage) / 100;
  return Math.max(0, Number((amount - discountAmount).toFixed(2)));
};

export const syncStudentClassFees = async (studentId: string) => {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: {
        select: {
          id: true,
          academicTermId: true,
        },
      },
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

  if (!student || student.status !== 'ACTIVE' || !student.class) {
    return { created: 0, skipped: 0, assignmentCount: 0 };
  }

  const assignments = await prisma.classFeeAssignment.findMany({
    where: { classId: student.classId },
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
    .filter(assignment => assignment.feeTemplate.academicTermId === student.class!.academicTermId)
    .filter(assignment => !existingFeeTemplateIds.has(assignment.feeTemplateId))
    .map(assignment => ({
      studentId: student.id,
      feeTemplateId: assignment.feeTemplateId,
      amountDue: applyScholarshipDiscount(Number(assignment.feeTemplate.amount), scholarshipPercentage),
      amountPaid: 0,
      dueDate: assignment.dueDate,
    }));

  if (dataToCreate.length === 0) {
    return { created: 0, skipped: assignments.length, assignmentCount: assignments.length };
  }

  const result = await prisma.studentFeeStructure.createMany({
    data: dataToCreate,
    skipDuplicates: true,
  });

  return {
    created: result.count,
    skipped: assignments.length - result.count,
    assignmentCount: assignments.length,
  };
};

export const syncClassFeesToStudents = async (classId: string) => {
  const [classAssignments, students] = await Promise.all([
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
    prisma.student.findMany({
      where: { classId, status: 'ACTIVE' },
      include: {
        class: {
          select: {
            academicTermId: true,
          },
        },
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
  ]);

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
      .filter(assignment => assignment.feeTemplate.academicTermId === student.class.academicTermId)
      .filter(assignment => !existingFeeTemplateIds.has(assignment.feeTemplateId))
      .map(assignment => ({
        studentId: student.id,
        feeTemplateId: assignment.feeTemplateId,
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

  const result = await prisma.studentFeeStructure.createMany({
    data: dataToCreate,
    skipDuplicates: true,
  });

  return {
    assignmentCount: classAssignments.length,
    studentCount: students.length,
    created: result.count,
  };
};