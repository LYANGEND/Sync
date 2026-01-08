import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, getUserId, handleControllerError } from '../utils/tenantContext';

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

export const createAssessment = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = createAssessmentSchema.parse(req.body);

    // Verify class, subject, and term belong to this tenant
    const [classData, subject, term] = await Promise.all([
      prisma.class.findFirst({ where: { id: data.classId, tenantId } }),
      prisma.subject.findFirst({ where: { id: data.subjectId, tenantId } }),
      prisma.academicTerm.findFirst({ where: { id: data.termId, tenantId } }),
    ]);

    if (!classData) return res.status(404).json({ error: 'Class not found' });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    if (!term) return res.status(404).json({ error: 'Term not found' });

    const { date, ...restData } = data;
    const assessment = await prisma.assessment.create({
      data: {
        tenantId,
        ...restData,
        date: new Date(date),
      },
    });

    res.status(201).json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createAssessment');
  }
};

export const getAssessments = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId, subjectId, termId } = req.query;

    const where: any = { tenantId };
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
    handleControllerError(res, error, 'getAssessments');
  }
};

export const getAssessmentById = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const assessment = await prisma.assessment.findFirst({
      where: { id, tenantId },
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
    handleControllerError(res, error, 'getAssessmentById');
  }
};

export const deleteAssessment = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const existing = await prisma.assessment.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

    await prisma.assessment.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteAssessment');
  }
};

export const bulkDeleteAssessments = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);

    await prisma.assessment.deleteMany({
      where: {
        id: { in: ids },
        tenantId  // Only delete from this tenant
      }
    });

    res.json({ message: `Successfully deleted ${ids.length} assessments` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'bulkDeleteAssessments');
  }
};

export const recordResults = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userId = getUserId(req);
    const { assessmentId, results } = recordResultsSchema.parse(req.body);

    // Verify assessment belongs to this tenant
    const assessment = await prisma.assessment.findFirst({
      where: { id: assessmentId, tenantId }
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
    handleControllerError(res, error, 'recordResults');
  }
};

export const getAssessmentResults = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify assessment belongs to this tenant
    const assessment = await prisma.assessment.findFirst({
      where: { id, tenantId }
    });
    if (!assessment) {
      return res.status(404).json({ error: 'Assessment not found' });
    }

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
    handleControllerError(res, error, 'getAssessmentResults');
  }
};

export const getStudentResults = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { studentId } = req.params;
    const { termId } = req.query;

    // Verify student belongs to this tenant
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

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
    handleControllerError(res, error, 'getStudentResults');
  }
};

export const getGradebook = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId, subjectId, termId } = req.query;

    if (!classId || !subjectId || !termId) {
      return res.status(400).json({ error: 'Class, Subject and Term IDs are required' });
    }

    // 1. Get Assessments for this tenant
    const assessments = await prisma.assessment.findMany({
      where: {
        tenantId,
        classId: String(classId),
        subjectId: String(subjectId),
        termId: String(termId)
      },
      orderBy: { date: 'asc' }
    });

    // 2. Get Students
    const students = await prisma.student.findMany({
      where: { tenantId, classId: String(classId), status: 'ACTIVE' },
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
    handleControllerError(res, error, 'getGradebook');
  }
};
