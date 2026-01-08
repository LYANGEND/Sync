import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const createPeriodSchema = z.object({
  classId: z.string().uuid(),
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/), // HH:MM
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),   // HH:MM
  academicTermId: z.string().uuid(),
});

export const getTimetableByClass = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { classId } = req.params;
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ message: 'Academic Term ID is required' });
    }

    // Verify class belongs to this tenant
    const classData = await prisma.class.findFirst({
      where: { id: classId, tenantId }
    });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    const periods = await prisma.timetablePeriod.findMany({
      where: {
        tenantId,
        classId,
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
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    res.json(periods);
  } catch (error) {
    handleControllerError(res, error, 'getTimetableByClass');
  }
};

export const getTimetableByTeacher = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { teacherId } = req.params;
    const { termId } = req.query;

    if (!termId) {
      return res.status(400).json({ message: 'Academic Term ID is required' });
    }

    // Verify teacher belongs to this tenant
    const teacher = await prisma.user.findFirst({
      where: { id: teacherId, tenantId }
    });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    const periods = await prisma.timetablePeriod.findMany({
      where: {
        tenantId,
        teacherId,
        academicTermId: termId as string,
      },
      include: {
        class: true,
        subject: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    res.json(periods);
  } catch (error) {
    handleControllerError(res, error, 'getTimetableByTeacher');
  }
};

export const createTimetablePeriod = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = createPeriodSchema.parse(req.body);

    // Verify all references belong to this tenant
    const [classData, subject, teacher, term] = await Promise.all([
      prisma.class.findFirst({ where: { id: data.classId, tenantId } }),
      prisma.subject.findFirst({ where: { id: data.subjectId, tenantId } }),
      prisma.user.findFirst({ where: { id: data.teacherId, tenantId } }),
      prisma.academicTerm.findFirst({ where: { id: data.academicTermId, tenantId } }),
    ]);

    if (!classData) return res.status(404).json({ error: 'Class not found' });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });
    if (!teacher) return res.status(404).json({ error: 'Teacher not found' });
    if (!term) return res.status(404).json({ error: 'Academic term not found' });

    // 1. Check for Teacher Conflict
    const teacherConflict = await prisma.timetablePeriod.findFirst({
      where: {
        tenantId,
        teacherId: data.teacherId,
        dayOfWeek: data.dayOfWeek,
        academicTermId: data.academicTermId,
        OR: [
          {
            AND: [
              { startTime: { lte: data.startTime } },
              { endTime: { gt: data.startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: data.endTime } },
              { endTime: { gte: data.endTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: data.startTime } },
              { endTime: { lte: data.endTime } },
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

    // 2. Check for Class Conflict
    const classConflict = await prisma.timetablePeriod.findFirst({
      where: {
        tenantId,
        classId: data.classId,
        dayOfWeek: data.dayOfWeek,
        academicTermId: data.academicTermId,
        OR: [
          {
            AND: [
              { startTime: { lte: data.startTime } },
              { endTime: { gt: data.startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: data.endTime } },
              { endTime: { gte: data.endTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: data.startTime } },
              { endTime: { lte: data.endTime } },
            ],
          },
        ],
      },
    });

    if (classConflict) {
      return res.status(409).json({
        message: 'Class already has a period in this time slot',
        conflict: classConflict
      });
    }

    const period = await prisma.timetablePeriod.create({
      data: {
        tenantId,
        ...data
      },
      include: {
        subject: true,
        teacher: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    });

    res.status(201).json(period);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    handleControllerError(res, error, 'createTimetablePeriod');
  }
};

export const deleteTimetablePeriod = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify period belongs to this tenant
    const existing = await prisma.timetablePeriod.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Period not found' });
    }

    await prisma.timetablePeriod.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteTimetablePeriod');
  }
};
