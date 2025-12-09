import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// Prisma Client should be generated. If you see errors here, try reloading the window.
const prisma = new PrismaClient();

const createAssessmentSchema = z.object({
  title: z.string().min(2),
  type: z.enum(['EXAM', 'TEST', 'QUIZ', 'HOMEWORK', 'PROJECT']),
  description: z.string().optional(),
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  totalMarks: z.number().positive(),
  weight: z.number().min(0).max(100),
  date: z.string().datetime(),
});

const recordResultsSchema = z.object({
  assessmentId: z.string().uuid(),
  results: z.array(z.object({
    studentId: z.string().uuid(),
    score: z.number().min(0),
    remarks: z.string().optional(),
  })),
});

export const createAssessment = async (req: Request, res: Response) => {
  try {
    const data = createAssessmentSchema.parse(req.body);
    
    const { date, ...restData } = data;
    const assessment = await prisma.assessment.create({
      data: {
        ...restData,
        date: new Date(date),
      },
    });
    
    res.status(201).json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create assessment error:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
};

export const getAssessments = async (req: Request, res: Response) => {
  try {
    const { classId, subjectId, termId } = req.query;
    
    const where: any = {};
    if (classId) where.classId = String(classId);
    if (subjectId) where.subjectId = String(subjectId);
    if (termId) where.termId = String(termId);

    const assessments = await prisma.assessment.findMany({
      where,
      include: {
        subject: true,
        class: true,
        _count: {
          select: { results: true }
        }
      },
      orderBy: { date: 'desc' },
    });
    
    res.json(assessments);
  } catch (error) {
    console.error('Get assessments error:', error);
    res.status(500).json({ error: 'Failed to fetch assessments' });
  }
};

export const getAssessmentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const assessment = await prisma.assessment.findUnique({
      where: { id },
      include: {
        subject: true,
        class: true,
        term: true,
      }
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    res.json(assessment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
};


export const deleteAssessment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.assessment.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
};

export const bulkDeleteAssessments = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);
    
    await prisma.assessment.deleteMany({
      where: { id: { in: ids } }
    });
    
    res.json({ message: `Successfully deleted ${ids.length} assessments` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to delete assessments' });
  }
};

export const recordResults = async (req: Request, res: Response) => {
  try {
    const { assessmentId, results } = recordResultsSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Verify assessment exists
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId }
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    // Use transaction to upsert results
    const operations = results.map(result => 
      prisma.assessmentResult.upsert({
        where: {
          assessmentId_studentId: {
            assessmentId,
            studentId: result.studentId
          }
        },
        update: {
          score: result.score,
          remarks: result.remarks,
          gradedByUserId: userId,
        },
        create: {
          assessmentId,
          studentId: result.studentId,
          score: result.score,
          remarks: result.remarks,
          gradedByUserId: userId,
        }
      })
    );

    await prisma.$transaction(operations);

    res.json({ message: 'Results recorded successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Record results error:', error);
    res.status(500).json({ error: 'Failed to record results' });
  }
};

export const getAssessmentResults = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // assessmentId
    
    const results = await prisma.assessmentResult.findMany({
      where: { assessmentId: id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
          }
        }
      },
      orderBy: {
        student: { lastName: 'asc' }
      }
    });
    
    res.json(results);
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
};

export const getStudentResults = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { termId } = req.query;

    const where: any = { studentId };
    if (termId) {
      where.assessment = { termId: String(termId) };
    }

    const results = await prisma.assessmentResult.findMany({
      where,
      include: {
        assessment: {
          include: {
            subject: true
          }
        }
      },
      orderBy: {
        assessment: { date: 'desc' }
      }
    });

    res.json(results);
  } catch (error) {
    console.error('Get student results error:', error);
    res.status(500).json({ error: 'Failed to fetch student results' });
  }
};
