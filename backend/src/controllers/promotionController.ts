import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import aiService from '../services/aiService';

// --- Schemas ---

const processPromotionSchema = z.object({
  promotions: z.array(z.object({
    studentId: z.string().uuid(),
    targetClassId: z.string().uuid(),
    reason: z.string().optional(),
  })),
});

// --- Controllers ---

export const getPromotionCandidates = async (req: Request, res: Response) => {
  try {
    const { classId, termId } = req.query;

    if (!classId) {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    // 1. Fetch students in the class with comprehensive data
    const students = await prisma.student.findMany({
      where: {
        classId: classId as string,
        status: 'ACTIVE',
      },
      include: {
        termResults: {
          where: termId ? { termId: termId as string } : undefined,
          include: { subject: true },
        },
        attendance: true,
        feeStructures: true,
      },
    });

    // Get active term for attendance date range
    const term = termId 
      ? await prisma.academicTerm.findUnique({ where: { id: termId as string } })
      : await prisma.academicTerm.findFirst({ where: { isActive: true } });

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
    console.error('Get promotion candidates error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const processPromotions = async (req: Request, res: Response) => {
  try {
    const { promotions } = processPromotionSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    // Use a transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      for (const promo of promotions) {
        const student = await tx.student.findUnique({
          where: { id: promo.studentId },
          select: { classId: true }
        });

        if (!student) continue;

        // 1. Log the movement
        await tx.classMovementLog.create({
          data: {
            studentId: promo.studentId,
            fromClassId: student.classId,
            toClassId: promo.targetClassId,
            reason: promo.reason || 'End of Year Promotion',
            changedByUserId: userId,
          },
        });

        // 2. Update the student's class
        await tx.student.update({
          where: { id: promo.studentId },
          data: { classId: promo.targetClassId },
        });
      }
    });

    res.json({ message: 'Promotions processed successfully', count: promotions.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Process promotions error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
