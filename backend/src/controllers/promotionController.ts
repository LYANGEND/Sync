import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { classId, termId } = req.query;

    if (!classId) {
      return res.status(400).json({ message: 'Class ID is required' });
    }

    // 1. Fetch students in the class
    const students = await prisma.student.findMany({
      where: {
        classId: classId as string,
        status: 'ACTIVE',
        schoolId: req.school.id
      },
      include: {
        termResults: {
          where: termId ? { termId: termId as string } : undefined,
        },
      },
    });

    // 2. Calculate averages and determine recommendation
    const candidates = students.map(student => {
      const results = student.termResults;
      let averageScore = 0;
      
      if (results.length > 0) {
        const totalScore = results.reduce((sum, result) => sum + Number(result.totalScore), 0);
        averageScore = totalScore / results.length;
      }

      // Rule: Average < 50% -> Retain
      const recommendedAction = averageScore >= 50 ? 'PROMOTE' : 'RETAIN';
      const reason = averageScore >= 50 ? 'Met academic requirements' : 'Did not meet academic requirements (Avg < 50%)';

      return {
        studentId: student.id,
        studentName: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        averageScore: parseFloat(averageScore.toFixed(2)),
        recommendedAction,
        reason,
      };
    });

    res.json(candidates);
  } catch (error) {
    console.error('Get promotion candidates error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const processPromotions = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { promotions } = processPromotionSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    // Use a transaction to ensure data integrity
    await prisma.$transaction(async (tx) => {
      for (const promo of promotions) {
        const student = await tx.student.findFirst({
          where: { 
            id: promo.studentId,
            schoolId: req.school!.id
          },
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
