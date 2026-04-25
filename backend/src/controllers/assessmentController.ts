import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { AcademicScopeError, ensureAcademicClassAccess, ensureStudentsBelongToClass } from '../utils/academicScope';

// Prisma Client should be generated. If you see errors here, try reloading the window.
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
    await ensureAcademicClassAccess(req as AuthRequest, data.classId, { subjectId: data.subjectId });

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
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Create assessment error:', error);
    res.status(500).json({ error: 'Failed to create assessment' });
  }
};

export const getAssessments = async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const user = authReq.user;
    const { classId, subjectId, termId } = req.query;

    const where: any = {};
    if (classId) where.classId = String(classId);
    if (subjectId) where.subjectId = String(subjectId);
    if (termId) where.termId = String(termId);

    if (user?.role === 'TEACHER') {
      const teacherClasses = await prisma.class.findMany({
        where: { teacherId: user.userId },
        select: { id: true },
      });
      const teacherSubjects = await prisma.teacherSubject.findMany({
        where: { teacherId: user.userId },
        select: { classId: true, subjectId: true },
      });

      const allowedClassIds = [...new Set([
        ...teacherClasses.map((item) => item.id),
        ...teacherSubjects.map((item) => item.classId),
      ])];

      if (allowedClassIds.length === 0) {
        return res.json([]);
      }

      if (classId && !allowedClassIds.includes(String(classId))) {
        return res.status(403).json({ error: 'You are not assigned to this class' });
      }

      where.classId = classId
        ? String(classId)
        : { in: allowedClassIds };

      if (subjectId) {
        const allowed = teacherSubjects.some((item) => item.classId === String(classId) && item.subjectId === String(subjectId))
          || teacherClasses.some((item) => item.id === String(classId));

        if (classId && !allowed) {
          return res.status(403).json({ error: 'You are not assigned to this class subject' });
        }
      }
    }

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

    await ensureAcademicClassAccess(req as AuthRequest, assessment.classId, { subjectId: assessment.subjectId });

    res.json(assessment);
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch assessment' });
  }
};

export const updateAssessment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = createAssessmentSchema.partial().parse(req.body);

    const existing = await prisma.assessment.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    const targetClassId = data.classId || existing.classId;
    const targetSubjectId = data.subjectId || existing.subjectId;
    await ensureAcademicClassAccess(req as AuthRequest, targetClassId, { subjectId: targetSubjectId });

    const updateData: any = { ...data };
    if (data.date) updateData.date = new Date(data.date);

    const assessment = await prisma.assessment.update({
      where: { id },
      data: updateData,
      include: { subject: true, class: true },
    });

    res.json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Update assessment error:', error);
    res.status(500).json({ error: 'Failed to update assessment' });
  }
};


export const deleteAssessment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const assessment = await prisma.assessment.findUnique({ where: { id } });
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }
    await ensureAcademicClassAccess(req as AuthRequest, assessment.classId, { subjectId: assessment.subjectId });
    await prisma.assessment.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
};

export const bulkDeleteAssessments = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);

    const assessments = await prisma.assessment.findMany({
      where: { id: { in: ids } },
      select: { id: true, classId: true, subjectId: true },
    });

    for (const assessment of assessments) {
      await ensureAcademicClassAccess(req as AuthRequest, assessment.classId, { subjectId: assessment.subjectId });
    }

    await prisma.assessment.deleteMany({
      where: { id: { in: ids } }
    });

    res.json({ message: `Successfully deleted ${ids.length} assessments` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
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

    await ensureAcademicClassAccess(req as AuthRequest, assessment.classId, { subjectId: assessment.subjectId });
    await ensureStudentsBelongToClass(assessment.classId, results.map((result) => result.studentId));

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
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Record results error:', error);
    res.status(500).json({ error: 'Failed to record results' });
  }
};

export const getAssessmentResults = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // assessmentId

    const assessment = await prisma.assessment.findUnique({
      where: { id },
      select: { classId: true, subjectId: true },
    });

    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    await ensureAcademicClassAccess(req as AuthRequest, assessment.classId, { subjectId: assessment.subjectId });

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
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Get results error:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
};

export const getStudentResults = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { termId } = req.query;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { classId: true },
    });

    if (!student?.classId) {
      return res.status(404).json({ error: 'Student not found in a class' });
    }

    await ensureAcademicClassAccess(req as AuthRequest, student.classId);

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
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Get student results error:', error);
    res.status(500).json({ error: 'Failed to fetch student results' });
  }
};

export const getGradebook = async (req: Request, res: Response) => {
  try {
    const { classId, subjectId, termId } = req.query;

    if (!classId || !subjectId || !termId) {
      return res.status(400).json({ error: 'Class, Subject and Term IDs are required' });
    }

    await ensureAcademicClassAccess(req as AuthRequest, String(classId), { subjectId: String(subjectId) });

    // 1. Get Assessments
    const assessments = await prisma.assessment.findMany({
      where: {
        classId: String(classId),
        subjectId: String(subjectId),
        termId: String(termId)
      },
      orderBy: { date: 'asc' }
    });

    // 2. Get Students (using specific ID/String casting to be safe)
    const students = await prisma.student.findMany({
      where: { classId: String(classId) },
      orderBy: { lastName: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true
      }
    });

    // 3. Get All Results for these assessments
    const assessmentIds = assessments.map(a => a.id);
    const results = await prisma.assessmentResult.findMany({
      where: { assessmentId: { in: assessmentIds } }
    });

    res.json({ assessments, students, results });
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Get gradebook error:', error);
    res.status(500).json({ error: 'Failed to fetch gradebook data' });
  }
};
