import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { syncStudentClassFees } from '../services/classFeeAssignmentService';
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

const academicTermQuerySchema = z.object({
  academicTermId: z.string().uuid(),
});

const classSchema = z.object({
  name: z.string().min(2),
  gradeLevel: z.number().int().min(0).max(12),
  teacherId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  subjectIds: z.array(z.string().uuid()).optional(),
});

export const getClasses = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { academicTermId } = academicTermQuerySchema.parse(req.query);

    const whereClause: any = { academicTermId };

    if (user.role !== 'SUPER_ADMIN' && user.branchId) {
      whereClause.branchId = user.branchId;
    } else if (user.role === 'SUPER_ADMIN' && typeof req.query.branchId === 'string') {
      whereClause.branchId = req.query.branchId;
    }

    if (user.role === 'TEACHER') {
      whereClause.OR = [
        { teacherId: user.userId },
        { teacherAssignments: { some: { teacherId: user.userId } } },
      ];
    } else if (user.role === 'STUDENT') {
      whereClause.termEnrollments = {
        some: { academicTermId, student: { userId: user.userId, status: 'ACTIVE' } },
      };
    } else if (user.role === 'PARENT') {
      whereClause.termEnrollments = {
        some: { academicTermId, student: { parentId: user.userId, status: 'ACTIVE' } },
      };
    }

    const classes = await prisma.class.findMany({
      where: whereClause,
      include: {
        teacher: {
          select: { fullName: true },
        },
        subjects: true,
        teacherAssignments: user.role === 'TEACHER'
          ? { where: { teacherId: user.userId }, select: { subjectId: true } }
          : false,
        _count: {
          select: { termEnrollments: true },
        },
      },
      orderBy: [
        { gradeLevel: 'asc' },
        { name: 'asc' },
      ],
    });
    res.json(classes.map(({ teacherAssignments, ...classRecord }) => {
      // Subject teachers only see the subjects they are allocated in classes they do not own.
      const allowedSubjectIds = user.role === 'TEACHER' && classRecord.teacherId !== user.userId
        ? new Set((teacherAssignments ?? []).map((assignment) => assignment.subjectId))
        : null;
      return {
        ...classRecord,
        subjects: allowedSubjectIds
          ? classRecord.subjects.filter((subject) => allowedSubjectIds.has(subject.id))
          : classRecord.subjects,
        _count: { students: classRecord._count.termEnrollments },
      };
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
};

export const getClassById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { academicTermId } = academicTermQuerySchema.parse(req.query);
    await ensureAcademicClassAccess(req as AuthRequest, id, { academicTermId });

    const [classData, enrollments] = await Promise.all([
      prisma.class.findUnique({
        where: { id },
        include: {
          teacher: {
            select: { fullName: true },
          },
          subjects: true,
        },
      }),
      getClassEnrollmentsForTerm(id, academicTermId),
    ]);

    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const students = enrollments.map(enrollment => ({
      ...enrollment.student,
      classId: enrollment.classId,
      placementStatus: enrollment.status,
    }));
    res.json({ ...classData, students, _count: { students: students.length } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    console.error('Error fetching class:', error);
    res.status(500).json({ error: 'Failed to fetch class' });
  }
};

export const createClass = async (req: Request, res: Response) => {
  try {
    const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);

    const newClass = await runTermWriteTransaction(academicTermId, 'SETUP', tx => (
      tx.class.create({
        data: {
          name,
          gradeLevel,
          teacherId,
          academicTermId,
          subjects: subjectIds ? {
            connect: subjectIds.map(id => ({ id })),
          } : undefined,
          branchId: (req as any).user?.branchId,
        },
        include: {
          subjects: true,
        },
      })
    ));

    res.status(201).json(newClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to create class' });
  }
};

export const updateClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);

    const existing = await prisma.class.findUnique({
      where: { id },
      select: { academicTermId: true },
    });
    if (!existing) return res.status(404).json({ error: 'Class not found' });
    if (academicTermId !== existing.academicTermId) {
      return res.status(400).json({ error: 'A class offering cannot be moved to another academic term' });
    }

    const updatedClass = await runTermWriteTransaction(existing.academicTermId, 'SETUP', tx => (
      tx.class.update({
        where: { id },
        data: {
          name,
          gradeLevel,
          teacherId,
          subjects: subjectIds ? {
            set: subjectIds.map(id => ({ id })),
          } : undefined,
        },
        include: {
          subjects: true,
        },
      })
    ));

    res.json(updatedClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to update class' });
  }
};

export const deleteClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const classRecord = await prisma.class.findUnique({
      where: { id },
      select: { academicTermId: true },
    });
    if (!classRecord) return res.status(404).json({ error: 'Class not found' });
    await runTermWriteTransaction(classRecord.academicTermId, 'SETUP', tx => (
      tx.class.delete({ where: { id } })
    ));
    res.status(204).send();
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to delete class' });
  }
};

export const getClassStudents = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { academicTermId } = academicTermQuerySchema.parse(req.query);
    await ensureAcademicClassAccess(req as AuthRequest, id, { academicTermId });

    const enrollments = await getClassEnrollmentsForTerm(id, academicTermId);
    const students = enrollments.map(enrollment => ({
      ...enrollment.student,
      classId: enrollment.classId,
      placementStatus: enrollment.status,
      placementStartsAt: enrollment.startsAt,
      placementEndsAt: enrollment.endsAt,
    }));
    res.json(students);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Academic term ID is required' });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    console.error('Error fetching class students:', error);
    res.status(500).json({ error: 'Failed to fetch class students' });
  }
};

export const addStudentsToClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { studentIds, academicTermId } = z.object({
      studentIds: z.array(z.string().uuid()).min(1),
      academicTermId: z.string().uuid(),
    }).superRefine((payload, ctx) => {
      if (new Set(payload.studentIds).size !== payload.studentIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['studentIds'],
          message: 'Student IDs must be unique',
        });
      }
    }).parse(req.body);

    const targetClass = await ensureAcademicClassAccess(req as AuthRequest, id, { academicTermId });
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, branchId: true },
    });

    if (students.length !== studentIds.length) {
      return res.status(404).json({ error: 'One or more students were not found' });
    }

    const crossBranchStudent = students.find((student) => (
      targetClass.branchId && student.branchId && student.branchId !== targetClass.branchId
    ));
    if (crossBranchStudent) {
      return res.status(400).json({ error: 'Students can only be assigned to a class in the same branch' });
    }

    const placementResults = await runTermWriteTransaction(
      targetClass.academicTermId,
      targetClass.academicTerm.status === 'DRAFT' ? 'SETUP' : 'ACADEMIC_ACTIVITY',
      tx => Promise.all(studentIds.map(studentId => upsertStudentPlacement(tx, {
        studentId,
        academicTermId,
        classId: id,
        changedByUserId: (req as AuthRequest).user?.userId,
        movementReason: 'Administrative class assignment',
      }))),
    );

    await Promise.all(
      placementResults
        .filter(result => result.compatibilityPointerUpdated)
        .map(result => syncStudentClassFees(result.enrollment.studentId)),
    );

    res.json({ message: 'Students added to class successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: 'Failed to add students to class' });
  }
};

const bulkClassSchema = z.object({
  name: z.string().min(2),
  gradeLevel: z.number().int().min(-2).max(12),
  teacherId: z.string().uuid().optional(),
  academicTermId: z.string().uuid(),
});

export const bulkCreateClasses = async (req: Request, res: Response) => {
  try {
    const classesData = z.array(bulkClassSchema).parse(req.body);

    // Get default teacher
    const defaultTeacher = await prisma.user.findFirst({
      where: { role: { in: ['TEACHER', 'SUPER_ADMIN'] } }
    });

    if (!defaultTeacher) {
      return res.status(400).json({ error: 'No teacher found' });
    }

    const dataToCreate = classesData.map(c => ({
      name: c.name,
      gradeLevel: c.gradeLevel,
      teacherId: c.teacherId || defaultTeacher.id,
      academicTermId: c.academicTermId,
      branchId: (req as any).user?.branchId, // Assign to creator's branch
    }));

    const termIds = new Set(dataToCreate.map(classRecord => classRecord.academicTermId));
    if (termIds.size !== 1) {
      return res.status(400).json({ error: 'Classes can only be imported for one academic term at a time' });
    }

    const result = await runTermWriteTransaction([...termIds][0], 'SETUP', tx => (
      tx.class.createMany({
        data: dataToCreate,
        skipDuplicates: true,
      })
    ));

    res.status(201).json({
      message: `Successfully imported ${result.count} classes`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Bulk create classes error:', error);
    res.status(500).json({ error: 'Failed to import classes' });
  }
};
