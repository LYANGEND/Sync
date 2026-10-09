import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import aiService from '../services/aiService';
import { AuthRequest } from '../middleware/authMiddleware';
import { AcademicScopeError, ensureAcademicClassAccess } from '../utils/academicScope';
import {
  runTermWriteTransaction,
  TermLifecycleError,
} from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  getClassEnrollmentsForTerm,
  StudentPlacementError,
  upsertStudentPlacement,
} from '../services/studentPlacementService';

// --- Schemas ---

const processPromotionSchema = z.object({
  academicTermId: z.string().uuid(),
  promotions: z.array(z.object({
    studentId: z.string().uuid(),
    targetClassId: z.string().uuid(),
    reason: z.string().optional(),
  })).min(1),
}).superRefine((payload, ctx) => {
  const studentIds = payload.promotions.map((promotion) => promotion.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['promotions'],
      message: 'Each student can only appear once in a promotion batch',
    });
  }
});

// --- Controllers ---

export const getPromotionCandidates = async (req: Request, res: Response) => {
  try {
    const { classId, termId } = req.query;

    if (!classId || !termId) {
      return res.status(400).json({ message: 'Class ID and term ID are required' });
    }

    await ensureAcademicClassAccess(req as AuthRequest, classId as string, {
      academicTermId: termId as string,
    });

    // 1. Fetch students in the class with comprehensive data
    const enrollments = await getClassEnrollmentsForTerm(classId as string, termId as string, {
      statuses: ['ACTIVE'],
    });
    const students = await prisma.student.findMany({
      where: {
        id: { in: enrollments.map(enrollment => enrollment.studentId) },
        status: 'ACTIVE',
      },
      include: {
        termResults: {
          where: { termId: termId as string },
          include: { subject: true },
        },
        attendance: { where: { academicTermId: termId as string } },
        feeStructures: { where: { academicTermId: termId as string } },
      },
    });

    // Get active term for attendance date range
    const term = await prisma.academicTerm.findUnique({ where: { id: termId as string } });

    // 2. Calculate multi-factor scores and determine recommendation
    const candidates = students.map(student => {
      const results = student.termResults;
      let averageScore = 0;
      
      if (results.length > 0) {
        const totalScore = results.reduce((sum, result) => sum + Number(result.totalScore), 0);
        averageScore = totalScore / results.length;
      }

      // Subject-specific analysis
      const failingSubjects = results
        .filter(r => Number(r.totalScore) < 50)
        .map(r => r.subject?.name || 'Unknown');
      
      const strongSubjects = results
        .filter(r => Number(r.totalScore) >= 70)
        .map(r => r.subject?.name || 'Unknown');

      // Attendance factor
      const termAttendance = term 
        ? student.attendance.filter(a => 
            a.date >= term.startDate && a.date <= (term.endDate < new Date() ? term.endDate : new Date())
          )
        : student.attendance;
      
      const totalAttendanceDays = termAttendance.length;
      const absentDays = termAttendance.filter(a => a.status === 'ABSENT').length;
      const attendanceRate = totalAttendanceDays > 0 
        ? Math.round(((totalAttendanceDays - absentDays) / totalAttendanceDays) * 100) 
        : 0;

      // Financial factor
      const totalFees = student.feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
      const totalPaid = student.feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
      const feePaymentRate = totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 100;

      // Multi-factor promotion decision
      // Configurable pass mark (default 50%)
      const passMark = 50;
      const isBorderline = averageScore >= (passMark - 5) && averageScore < passMark;
      const meetsAcademic = averageScore >= passMark;
      const hasGoodAttendance = attendanceRate >= 75;
      
      let recommendedAction: string;
      let reason: string;
      let confidence: 'HIGH' | 'MEDIUM' | 'LOW';

      if (meetsAcademic && hasGoodAttendance) {
        recommendedAction = 'PROMOTE';
        reason = `Met academic requirements (${averageScore.toFixed(1)}%) with ${attendanceRate}% attendance`;
        confidence = 'HIGH';
      } else if (meetsAcademic && !hasGoodAttendance) {
        recommendedAction = 'PROMOTE';
        reason = `Met academic requirements (${averageScore.toFixed(1)}%) but attendance is low (${attendanceRate}%). Monitor in next term.`;
        confidence = 'MEDIUM';
      } else if (isBorderline) {
        recommendedAction = 'REVIEW';
        reason = `Borderline performance (${averageScore.toFixed(1)}%). ${failingSubjects.length} failing subject(s): ${failingSubjects.join(', ')}. Teacher review recommended.`;
        confidence = 'LOW';
      } else {
        recommendedAction = 'RETAIN';
        reason = `Below academic requirements (${averageScore.toFixed(1)}% < ${passMark}%). Failing: ${failingSubjects.join(', ')}`;
        confidence = averageScore < (passMark - 15) ? 'HIGH' : 'MEDIUM';
      }

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        averageScore: parseFloat(averageScore.toFixed(2)),
        recommendedAction,
        reason,
        confidence,
        details: {
          failingSubjects,
          strongSubjects,
          attendanceRate,
          feePaymentRate,
          totalSubjects: results.length,
          isBorderline,
        },
      };
    });

    // Sort: REVIEW first, then RETAIN, then PROMOTE
    const actionOrder: Record<string, number> = { REVIEW: 0, RETAIN: 1, PROMOTE: 2 };
    candidates.sort((a, b) => (actionOrder[a.recommendedAction] ?? 3) - (actionOrder[b.recommendedAction] ?? 3));

    res.json(candidates);
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Get promotion candidates error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const processPromotions = async (req: Request, res: Response) => {
  try {
    const { promotions, academicTermId } = processPromotionSchema.parse(req.body);
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const sourceEnrollments = await prisma.studentTermEnrollment.findMany({
      where: {
        academicTermId,
        studentId: { in: promotions.map((promo) => promo.studentId) },
        status: 'ACTIVE',
      },
      include: { student: true, class: true },
    });
    const sourceEnrollmentMap = new Map(sourceEnrollments.map(enrollment => [enrollment.studentId, enrollment]));

    const targetClassIds = [...new Set(promotions.map((promo) => promo.targetClassId))];
    const targetClasses = await prisma.class.findMany({ where: { id: { in: targetClassIds } } });
    const targetClassMap = new Map(targetClasses.map((classItem) => [classItem.id, classItem]));
    if (sourceEnrollments.length !== promotions.length) {
      return res.status(404).json({ message: 'Active student placement not found for promotion batch' });
    }

    for (const promo of promotions) {
      const sourceEnrollment = sourceEnrollmentMap.get(promo.studentId);
      if (!sourceEnrollment) {
        return res.status(404).json({ message: 'Active student placement not found for promotion batch' });
      }

      await ensureAcademicClassAccess(req as AuthRequest, sourceEnrollment.classId, { academicTermId });

      const targetClass = targetClassMap.get(promo.targetClassId);
      if (!targetClass) {
        return res.status(404).json({ message: 'Target class not found' });
      }

      if (targetClass.academicTermId !== academicTermId) {
        return res.status(409).json({
          code: 'ROLLOVER_DECISION_REQUIRED',
          message: 'Cross-term promotions must be staged through the term rollover workflow',
        });
      }

      if (sourceEnrollment.class.branchId && targetClass.branchId && sourceEnrollment.class.branchId !== targetClass.branchId) {
        return res.status(400).json({ message: 'Promotions must stay within the same branch' });
      }

      const currentGrade = sourceEnrollment.class.gradeLevel;
      const targetGrade = targetClass.gradeLevel;
      const validGradeMove = targetGrade === currentGrade || targetGrade === currentGrade + 1;

      if (!validGradeMove) {
        return res.status(400).json({
          message: `Invalid promotion target for ${sourceEnrollment.student.firstName} ${sourceEnrollment.student.lastName}. Students can only remain in the same grade or move to the next grade.`,
        });
      }
    }

    await runTermWriteTransaction(academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      for (const promo of promotions) {
        const sourceEnrollment = sourceEnrollmentMap.get(promo.studentId)!;

        const currentTarget = await tx.class.findFirst({
          where: { id: promo.targetClassId, academicTermId },
          select: { id: true },
        });
        if (!currentTarget) {
          throw new AcademicScopeError(409, 'Target class changed while promotions were processing');
        }

        const enrollment = await tx.studentTermEnrollment.findUnique({
          where: {
            studentId_academicTermId: {
              studentId: promo.studentId,
              academicTermId,
            },
          },
          select: { id: true, classId: true, status: true },
        });
        if (!enrollment || enrollment.id !== sourceEnrollment.id
          || enrollment.classId !== sourceEnrollment.classId
          || enrollment.status !== 'ACTIVE') {
          throw new AcademicScopeError(409, `Student ${promo.studentId} placement changed while promotions were processing`);
        }

        await upsertStudentPlacement(tx, {
          studentId: promo.studentId,
          academicTermId,
          classId: promo.targetClassId,
          status: 'ACTIVE',
          changedByUserId: userId,
          movementReason: promo.reason || 'Same-term class progression',
        });
      }
    });

    res.json({ message: 'Promotions processed successfully', count: promotions.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, message: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Process promotions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
