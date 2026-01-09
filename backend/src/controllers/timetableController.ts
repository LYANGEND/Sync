import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createPeriodSchema = z.object({
  classIds: z.array(z.string().uuid()).min(1), // Support multiple classes
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().optional(), // Optional - will use subject's teacher if not provided
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),   // HH:MM
  academicTermId: z.string().uuid(),
});

export const getTimetableByClass = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ message: 'Academic Term ID is required' });
    }

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
    console.error('Get teacher timetable error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const createTimetablePeriod = async (req: Request, res: Response) => {
  try {
    const data = createPeriodSchema.parse(req.body);
    const { classIds, subjectId, dayOfWeek, startTime, endTime, academicTermId } = data;
    let { teacherId } = data;

    // If teacherId not provided, get it from the subject's assigned teacher
    if (!teacherId) {
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
        select: { teacherId: true, name: true }
      });

      if (!subject?.teacherId) {
        return res.status(400).json({
          message: `Subject "${subject?.name || 'Unknown'}" has no assigned teacher. Please assign a teacher to this subject first.`
        });
      }

      teacherId = subject.teacherId;
    }

    // 1. Check for Teacher Conflict
    const teacherConflict = await prisma.timetablePeriod.findFirst({
      where: {
        teacherId,
        dayOfWeek,
        academicTermId,
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } },
            ],
          },
        ],
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
          OR: [
            {
              AND: [
                { startTime: { lte: startTime } },
                { endTime: { gt: startTime } },
              ],
            },
            {
              AND: [
                { startTime: { lt: endTime } },
                { endTime: { gte: endTime } },
              ],
            },
            {
              AND: [
                { startTime: { gte: startTime } },
                { endTime: { lte: endTime } },
              ],
            },
          ],
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
    const period = await prisma.timetablePeriod.create({
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
              }
            }
          }
        }
      },
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
    console.error('Create timetable period error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const deleteTimetablePeriod = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // The join table entries will cascade delete
    await prisma.timetablePeriod.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    console.error('Delete timetable period error:', error);
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
