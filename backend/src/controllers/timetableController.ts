import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { AcademicScopeError, ensureAcademicClassAccess } from '../utils/academicScope';
import { hasDuplicateValues, hasValidTimeRange } from '../utils/academicValidation';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';

const timeSchema = z.string()
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
  .transform((value) => {
    const [hours, minutes] = value.split(':');
    return `${hours.padStart(2, '0')}:${minutes}`;
  });

const createPeriodSchema = z.object({
  classIds: z.array(z.string().uuid()).min(1), // Support multiple classes
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().optional(), // Optional - will look up from TeacherSubject allocation
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  startTime: timeSchema,
  endTime: timeSchema,
  academicTermId: z.string().uuid(),
}).superRefine((period, ctx) => {
  if (!hasValidTimeRange(period.startTime, period.endTime)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endTime'],
      message: 'End time must be after start time',
    });
  }
  if (hasDuplicateValues(period.classIds)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['classIds'],
      message: 'Each class can only be selected once',
    });
  }
});

const ensureTeacherTimetableAccess = async (req: AuthRequest, teacherId: string) => {
  const user = req.user;
  if (!user) throw new AcademicScopeError(401, 'Unauthorized');
  if (user.role === 'SUPER_ADMIN') return;
  if (user.role === 'TEACHER') {
    if (user.userId !== teacherId) {
      throw new AcademicScopeError(403, 'Teachers can only view their own timetable');
    }
    return;
  }

  const teacher = await prisma.user.findUnique({
    where: { id: teacherId },
    select: { branchId: true },
  });
  if (!teacher) throw new AcademicScopeError(404, 'Teacher not found');
  if (user.branchId && teacher.branchId && user.branchId !== teacher.branchId) {
    throw new AcademicScopeError(403, 'You do not have access to this teacher');
  }
};

const overlappingPeriodWhere = (startTime: string, endTime: string) => ({
  startTime: { lt: endTime },
  endTime: { gt: startTime },
});

const findUnallocatedClassIds = async (
  teacherId: string,
  subjectId: string,
  classIds: string[],
  client: Prisma.TransactionClient | typeof prisma = prisma,
) => {
  const teacherAllocations = await client.teacherSubject.findMany({
    where: {
      teacherId,
      subjectId,
      classId: { in: classIds },
    },
    select: { classId: true },
  });
  const allocatedClassIds = new Set(teacherAllocations.map((allocation) => allocation.classId));
  return classIds.filter((classId) => !allocatedClassIds.has(classId));
};

export const getTimetableByClass = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ message: 'Academic Term ID is required' });
    }

    await ensureAcademicClassAccess(req as AuthRequest, classId);

    // Find periods that include this class
    const periods = await prisma.timetablePeriod.findMany({
      where: {
        academicTermId: termId as string,
        classes: {
          some: {
            classId: classId
          }
        }
      },
      include: {
        subject: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
        classes: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                gradeLevel: true,
              }
            }
          }
        }
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Transform to include class names for display
    const transformedPeriods = periods.map(period => ({
      ...period,
      classNames: period.classes.map(c => c.class.name),
      isCombined: period.classes.length > 1,
    }));

    res.json(transformedPeriods);
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Get class timetable error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getTimetableByTeacher = async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ message: 'Academic Term ID is required' });
    }

    await ensureTeacherTimetableAccess(req as AuthRequest, teacherId);

    const periods = await prisma.timetablePeriod.findMany({
      where: {
        teacherId,
        academicTermId: termId as string,
      },
      include: {
        subject: true,
        classes: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                gradeLevel: true,
              }
            }
          }
        }
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    // Transform to include class names for display
    const transformedPeriods = periods.map(period => ({
      ...period,
      classNames: period.classes.map(c => c.class.name),
      isCombined: period.classes.length > 1,
    }));

    res.json(transformedPeriods);
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Get teacher timetable error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTimetablePeriod = async (req: Request, res: Response) => {
  try {
    const data = createPeriodSchema.parse(req.body);
    const { classIds, subjectId, dayOfWeek, startTime, endTime, academicTermId } = data;
    let { teacherId } = data;

    const selectedClassNames = new Map<string, string>();
    for (const classId of classIds) {
      const classInfo = await ensureAcademicClassAccess(req as AuthRequest, classId, { subjectId });
      selectedClassNames.set(classId, classInfo.name);
      if (classInfo.academicTermId !== academicTermId) {
        return res.status(400).json({ message: `${classInfo.name} does not belong to the selected academic term` });
      }
    }

    // If teacherId not provided, look up from TeacherSubject allocation for this class
    if (!teacherId) {
      const allocation = await prisma.teacherSubject.findFirst({
        where: { subjectId, classId: classIds[0] },
        include: { subject: { select: { name: true } } }
      });

      if (!allocation) {
        const subject = await prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } });
        return res.status(400).json({
          message: `No teacher allocated for "${subject?.name || 'Unknown'}" in this class. Please use Subject Allocation first.`
        });
      }

      teacherId = allocation.teacherId;
    }

    const user = (req as AuthRequest).user;
    if (user?.role === 'TEACHER' && teacherId !== user.userId) {
      return res.status(403).json({ message: 'Teachers can only schedule their own periods' });
    }

    const unallocatedClassIds = await findUnallocatedClassIds(teacherId, subjectId, classIds);
    if (unallocatedClassIds.length > 0) {
      return res.status(400).json({
        message: 'The selected teacher must be assigned to this subject in every selected class',
        unallocatedClasses: unallocatedClassIds.map((classId) => ({
          id: classId,
          name: selectedClassNames.get(classId),
        })),
      });
    }

    // 1. Check for Teacher Conflict
    const teacherConflict = await prisma.timetablePeriod.findFirst({
      where: {
        teacherId,
        dayOfWeek,
        academicTermId,
        ...overlappingPeriodWhere(startTime, endTime),
      },
    });

    if (teacherConflict) {
      return res.status(409).json({
        message: 'Teacher is already booked for this time slot',
        conflict: teacherConflict
      });
    }

    // 2. Check for Class Conflicts (any of the selected classes)
    for (const classId of classIds) {
      const classConflict = await prisma.timetablePeriod.findFirst({
        where: {
          dayOfWeek,
          academicTermId,
          classes: {
            some: {
              classId
            }
          },
          ...overlappingPeriodWhere(startTime, endTime),
        },
        include: {
          classes: {
            include: {
              class: true
            }
          }
        }
      });

      if (classConflict) {
        const conflictingClassName = classConflict.classes.find(c => c.classId === classId)?.class.name || 'A class';
        return res.status(409).json({
          message: `${conflictingClassName} already has a period in this time slot`,
          conflict: classConflict
        });
      }
    }

    // 3. Create the period with linked classes
    const period = await runTermWriteTransaction(academicTermId, 'SETUP', async tx => {
      const currentUnallocatedClassIds = await findUnallocatedClassIds(
        teacherId,
        subjectId,
        classIds,
        tx,
      );
      if (currentUnallocatedClassIds.length > 0) {
        throw new AcademicScopeError(
          409,
          'The teacher allocation changed while scheduling. Refresh and try again',
        );
      }

      const currentTeacherConflict = await tx.timetablePeriod.findFirst({
        where: {
          teacherId,
          dayOfWeek,
          academicTermId,
          ...overlappingPeriodWhere(startTime, endTime),
        },
      });
      if (currentTeacherConflict) {
        throw new AcademicScopeError(409, 'Teacher is already booked for this time slot');
      }

      const currentClassConflict = await tx.timetablePeriod.findFirst({
        where: {
          dayOfWeek,
          academicTermId,
          classes: { some: { classId: { in: classIds } } },
          ...overlappingPeriodWhere(startTime, endTime),
        },
      });
      if (currentClassConflict) {
        throw new AcademicScopeError(409, 'A selected class already has a period in this time slot');
      }

      return tx.timetablePeriod.create({
        data: {
          subjectId,
          teacherId,
          dayOfWeek,
          startTime,
          endTime,
          academicTermId,
          classes: {
            create: classIds.map(classId => ({
              classId
            }))
          },
        },
        include: {
          subject: true,
          teacher: {
            select: {
              id: true,
              fullName: true,
            },
          },
          classes: {
            include: {
              class: {
                select: {
                  id: true,
                  name: true,
                }
              }
            }
          }
        },
      });
    });

    const result = {
      ...period,
      classNames: period.classes.map(c => c.class.name),
      isCombined: period.classes.length > 1,
    };

    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Create timetable period error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteTimetablePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.timetablePeriod.findUnique({
      where: { id },
      include: { classes: { select: { classId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Timetable period not found' });

    const user = (req as AuthRequest).user;
    if (user?.role === 'TEACHER' && existing.teacherId !== user.userId) {
      return res.status(403).json({ message: 'Teachers can only delete their own periods' });
    }

    for (const classItem of existing.classes) {
      await ensureAcademicClassAccess(req as AuthRequest, classItem.classId, { subjectId: existing.subjectId });
    }

    // The join table entries will cascade delete
    await runTermWriteTransaction(existing.academicTermId, 'SETUP', tx => (
      tx.timetablePeriod.delete({ where: { id } })
    ));
    res.status(204).send();
  } catch (error) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Delete timetable period error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateTimetablePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = z.object({
      subjectId: z.string().uuid().optional(),
      teacherId: z.string().uuid().optional(),
      dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
      startTime: timeSchema.optional(),
      endTime: timeSchema.optional(),
    }).parse(req.body);

    const existing = await prisma.timetablePeriod.findUnique({
      where: { id },
      include: { classes: { select: { classId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Timetable period not found' });

    const subjectId = data.subjectId || existing.subjectId;
    const teacherId = data.teacherId || existing.teacherId;
    const dayOfWeek = data.dayOfWeek || existing.dayOfWeek;
    const startTime = data.startTime || existing.startTime;
    const endTime = data.endTime || existing.endTime;

    if (!hasValidTimeRange(startTime, endTime)) {
      return res.status(400).json({ message: 'End time must be after start time' });
    }

    const selectedClassNames = new Map<string, string>();
    for (const classItem of existing.classes) {
      const classInfo = await ensureAcademicClassAccess(req as AuthRequest, classItem.classId, { subjectId });
      selectedClassNames.set(classItem.classId, classInfo.name);
    }

    const user = (req as AuthRequest).user;
    if (user?.role === 'TEACHER' && teacherId !== user.userId) {
      return res.status(403).json({ message: 'Teachers can only schedule their own periods' });
    }

    const classIds = existing.classes.map((item) => item.classId);
    const unallocatedClassIds = await findUnallocatedClassIds(teacherId, subjectId, classIds);
    if (unallocatedClassIds.length > 0) {
      return res.status(400).json({
        message: 'The selected teacher must be assigned to this subject in every selected class',
        unallocatedClasses: unallocatedClassIds.map((classId) => ({
          id: classId,
          name: selectedClassNames.get(classId),
        })),
      });
    }

    const teacherConflict = await prisma.timetablePeriod.findFirst({
      where: {
        id: { not: id },
        teacherId,
        dayOfWeek,
        academicTermId: existing.academicTermId,
        ...overlappingPeriodWhere(startTime, endTime),
      },
    });
    if (teacherConflict) {
      return res.status(409).json({ message: 'Teacher is already booked for this time slot' });
    }

    const classConflict = await prisma.timetablePeriod.findFirst({
      where: {
        id: { not: id },
        dayOfWeek,
        academicTermId: existing.academicTermId,
        classes: { some: { classId: { in: existing.classes.map((item) => item.classId) } } },
        ...overlappingPeriodWhere(startTime, endTime),
      },
    });
    if (classConflict) {
      return res.status(409).json({ message: 'A selected class already has a period in this time slot' });
    }

    const period = await runTermWriteTransaction(existing.academicTermId, 'SETUP', async tx => {
      const currentUnallocatedClassIds = await findUnallocatedClassIds(
        teacherId,
        subjectId,
        classIds,
        tx,
      );
      if (currentUnallocatedClassIds.length > 0) {
        throw new AcademicScopeError(
          409,
          'The teacher allocation changed while scheduling. Refresh and try again',
        );
      }

      const currentTeacherConflict = await tx.timetablePeriod.findFirst({
        where: {
          id: { not: id },
          teacherId,
          dayOfWeek,
          academicTermId: existing.academicTermId,
          ...overlappingPeriodWhere(startTime, endTime),
        },
      });
      if (currentTeacherConflict) {
        throw new AcademicScopeError(409, 'Teacher is already booked for this time slot');
      }

      const currentClassConflict = await tx.timetablePeriod.findFirst({
        where: {
          id: { not: id },
          dayOfWeek,
          academicTermId: existing.academicTermId,
          classes: { some: { classId: { in: classIds } } },
          ...overlappingPeriodWhere(startTime, endTime),
        },
      });
      if (currentClassConflict) {
        throw new AcademicScopeError(409, 'A selected class already has a period in this time slot');
      }

      return tx.timetablePeriod.update({
        where: { id },
        data,
        include: {
          subject: true,
          teacher: { select: { id: true, fullName: true } },
          classes: {
            include: {
              class: { select: { id: true, name: true, gradeLevel: true } }
            }
          }
        },
      });
    });

    const result = {
      ...period,
      classNames: period.classes.map(c => c.class.name),
      isCombined: period.classes.length > 1,
    };

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Update timetable period error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get all periods for a term (for admin view)
export const getAllPeriods = async (req: Request, res: Response) => {
  try {
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ message: 'Academic Term ID is required' });
    }

    const periods = await prisma.timetablePeriod.findMany({
      where: {
        academicTermId: termId as string,
      },
      include: {
        subject: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
        classes: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
                gradeLevel: true,
              }
            }
          }
        }
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    const transformedPeriods = periods.map(period => ({
      ...period,
      classNames: period.classes.map(c => c.class.name),
      isCombined: period.classes.length > 1,
    }));

    res.json(transformedPeriods);
  } catch (error) {
    console.error('Get all periods error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
