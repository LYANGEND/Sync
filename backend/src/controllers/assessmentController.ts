import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  AcademicScopeError,
  ensureAcademicClassAccess,
  ensureStudentRecordAccess,
  ensureStudentsBelongToClass,
} from '../utils/academicScope';
import { isDateWithinRangeByDay } from '../utils/academicValidation';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  getClassEnrollmentsForTerm,
  StudentPlacementError,
} from '../services/studentPlacementService';

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

const assessmentResultsSchema = z.object({
  assessmentId: z.string().uuid(),
  results: z.array(z.object({
    studentId: z.string().uuid(),
    score: z.number().min(0),
    remarks: z.string().optional(),
  })).min(1),
}).superRefine((payload, ctx) => {
  const studentIds = payload.results.map((result) => result.studentId);
  if (new Set(studentIds).size !== studentIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['results'],
      message: 'Each student can only appear once per assessment',
    });
  }
});

const recordResultsSchema = assessmentResultsSchema;

const bulkRecordResultsSchema = z.object({
  updates: z.array(assessmentResultsSchema).min(1),
}).superRefine((payload, ctx) => {
  const assessmentIds = payload.updates.map((update) => update.assessmentId);
  if (new Set(assessmentIds).size !== assessmentIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['updates'],
      message: 'Each assessment can only appear once per save',
    });
  }
});

type AssessmentResultsUpdate = z.infer<typeof assessmentResultsSchema>;

const buildResultWrites = async (
  req: AuthRequest,
  userId: string,
  updates: AssessmentResultsUpdate[],
) => {
  const assessmentIds = updates.map((update) => update.assessmentId);
  const assessments = await prisma.assessment.findMany({
    where: { id: { in: assessmentIds } },
    select: { id: true, classId: true, subjectId: true, termId: true, totalMarks: true },
  });

  if (assessments.length !== assessmentIds.length) {
    throw new AcademicScopeError(404, 'One or more assessments were not found');
  }

  const assessmentMap = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const termIds = new Set(assessments.map((assessment) => assessment.termId));
  if (termIds.size !== 1) {
    throw new AcademicScopeError(400, 'Assessment results can only be saved for one academic term at a time');
  }

  for (const update of updates) {
    const assessment = assessmentMap.get(update.assessmentId)!;
    await ensureAcademicClassAccess(req, assessment.classId, {
      subjectId: assessment.subjectId,
      academicTermId: assessment.termId,
    });
    await ensureStudentsBelongToClass(
      assessment.classId,
      assessment.termId,
      update.results.map((result) => result.studentId),
    );

    const invalidScore = update.results.find((result) => result.score > Number(assessment.totalMarks));
    if (invalidScore) {
      throw new AcademicScopeError(
        400,
        `A score exceeds the maximum marks for assessment ${assessment.id}`,
      );
    }
  }

  return {
    academicTermId: [...termIds][0],
    assessmentIds,
    writes: updates.flatMap((update) => update.results.map((result) => ({
      assessmentId: update.assessmentId,
      studentId: result.studentId,
      score: result.score,
      remarks: result.remarks,
      gradedByUserId: userId,
    }))),
  };
};

export const createAssessment = async (req: Request, res: Response) => {
  try {
    const data = createAssessmentSchema.parse(req.body);
    const classInfo = await ensureAcademicClassAccess(req as AuthRequest, data.classId, { subjectId: data.subjectId });

    if (classInfo.academicTermId !== data.termId) {
      return res.status(400).json({ error: 'Selected class does not belong to the selected academic term' });
    }

    if (!isDateWithinRangeByDay(data.date, classInfo.academicTerm.startDate, classInfo.academicTerm.endDate)) {
      return res.status(400).json({ error: 'Assessment date must fall within the selected academic term' });
    }

    const { date, ...restData } = data;
    const assessment = await runTermWriteTransaction(data.termId, 'ACADEMIC_ACTIVITY', tx => (
      tx.assessment.create({
        data: {
          ...restData,
          date: new Date(date),
        },
      })
    ));

    res.status(201).json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
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

    if (data.termId && data.termId !== existing.termId) {
      return res.status(400).json({ error: 'An assessment cannot be moved to another academic term' });
    }

    const targetClassId = data.classId || existing.classId;
    const targetSubjectId = data.subjectId || existing.subjectId;
    const targetTermId = data.termId || existing.termId;
    const targetDate = data.date || existing.date;
    const classInfo = await ensureAcademicClassAccess(req as AuthRequest, targetClassId, { subjectId: targetSubjectId });

    if (classInfo.academicTermId !== targetTermId) {
      return res.status(400).json({ error: 'Selected class does not belong to the selected academic term' });
    }

    if (!isDateWithinRangeByDay(targetDate, classInfo.academicTerm.startDate, classInfo.academicTerm.endDate)) {
      return res.status(400).json({ error: 'Assessment date must fall within the selected academic term' });
    }

    const updateData: any = { ...data };
    if (data.date) updateData.date = new Date(data.date);

    const assessment = await runTermWriteTransaction(existing.termId, 'ACADEMIC_ACTIVITY', tx => (
      tx.assessment.update({
        where: { id },
        data: updateData,
        include: { subject: true, class: true },
      })
    ));

    res.json(assessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
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
    await runTermWriteTransaction(assessment.termId, 'ACADEMIC_ACTIVITY', tx => (
      tx.assessment.delete({ where: { id } })
    ));
    res.status(204).send();
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to delete assessment' });
  }
};

export const bulkDeleteAssessments = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string().uuid()) }).parse(req.body);

    const assessments = await prisma.assessment.findMany({
      where: { id: { in: ids } },
      select: { id: true, classId: true, subjectId: true, termId: true },
    });

    if (assessments.length !== new Set(ids).size) {
      return res.status(404).json({ error: 'One or more assessments were not found' });
    }

    for (const assessment of assessments) {
      await ensureAcademicClassAccess(req as AuthRequest, assessment.classId, { subjectId: assessment.subjectId });
    }

    const termIds = new Set(assessments.map((assessment) => assessment.termId));
    if (termIds.size !== 1) {
      return res.status(400).json({ error: 'Assessments can only be deleted from one academic term at a time' });
    }

    await runTermWriteTransaction([...termIds][0], 'ACADEMIC_ACTIVITY', tx => (
      tx.assessment.deleteMany({ where: { id: { in: ids } } })
    ));

    res.json({ message: `Successfully deleted ${ids.length} assessments` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
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

    const prepared = await buildResultWrites(
      req as AuthRequest,
      userId,
      [{ assessmentId, results }],
    );

    await runTermWriteTransaction(prepared.academicTermId, 'FINALIZATION', async tx => {
      const assessmentCount = await tx.assessment.count({
        where: { id: { in: prepared.assessmentIds }, termId: prepared.academicTermId },
      });
      if (assessmentCount !== prepared.assessmentIds.length) {
        throw new AcademicScopeError(409, 'Assessment term ownership changed while results were being saved');
      }
      await Promise.all(prepared.writes.map((write) => tx.assessmentResult.upsert({
        where: {
          assessmentId_studentId: {
            assessmentId: write.assessmentId,
            studentId: write.studentId,
          },
        },
        update: {
          score: write.score,
          remarks: write.remarks,
          gradedByUserId: write.gradedByUserId,
        },
        create: write,
      })));
    });

    res.json({ message: 'Results recorded successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Record results error:', error);
    res.status(500).json({ error: 'Failed to record results' });
  }
};

export const bulkRecordResults = async (req: Request, res: Response) => {
  try {
    const { updates } = bulkRecordResultsSchema.parse(req.body);
    const userId = (req as AuthRequest).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const prepared = await buildResultWrites(req as AuthRequest, userId, updates);
    await runTermWriteTransaction(prepared.academicTermId, 'FINALIZATION', async tx => {
      const assessmentCount = await tx.assessment.count({
        where: { id: { in: prepared.assessmentIds }, termId: prepared.academicTermId },
      });
      if (assessmentCount !== prepared.assessmentIds.length) {
        throw new AcademicScopeError(409, 'Assessment term ownership changed while results were being saved');
      }
      await Promise.all(prepared.writes.map((write) => tx.assessmentResult.upsert({
        where: {
          assessmentId_studentId: {
            assessmentId: write.assessmentId,
            studentId: write.studentId,
          },
        },
        update: {
          score: write.score,
          remarks: write.remarks,
          gradedByUserId: write.gradedByUserId,
        },
        create: write,
      })));
    });

    res.json({
      message: 'Results recorded successfully',
      assessmentCount: updates.length,
      resultCount: prepared.writes.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Bulk record results error:', error);
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
    const termId = z.string().uuid().parse(req.query.termId);
    await ensureStudentRecordAccess(req as AuthRequest, studentId, { academicTermId: termId });

    const where: any = { studentId, assessment: { termId } };

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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Term ID is required' });
    }
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

    await ensureAcademicClassAccess(req as AuthRequest, String(classId), {
      subjectId: String(subjectId),
      academicTermId: String(termId),
    });

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
    const enrollments = await getClassEnrollmentsForTerm(String(classId), String(termId), {
      statuses: ['ACTIVE'],
    });
    const students = enrollments.map(({ student }) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
    }));

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
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    console.error('Get gradebook error:', error);
    res.status(500).json({ error: 'Failed to fetch gradebook data' });
  }
};
