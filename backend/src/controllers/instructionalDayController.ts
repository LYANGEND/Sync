import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { isDateWithinRangeByDay } from '../utils/academicValidation';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';

const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD'),
  isInstructional: z.boolean(),
  label: z.string().trim().max(120).nullable().optional(),
});

const replaceCalendarSchema = z.object({
  days: z.array(daySchema).max(370),
}).superRefine((payload, ctx) => {
  const dates = payload.days.map(day => day.date);
  if (new Set(dates).size !== dates.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['days'],
      message: 'Each calendar date can only appear once',
    });
  }
});

const toUtcDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

export const getInstructionalDays = async (req: Request, res: Response) => {
  try {
    const term = await prisma.academicTerm.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!term) return res.status(404).json({ error: 'Academic term not found' });

    const days = await prisma.termInstructionalDay.findMany({
      where: { academicTermId: term.id },
      orderBy: { date: 'asc' },
    });
    res.json(days);
  } catch (error) {
    console.error('Get instructional days error:', error);
    res.status(500).json({ error: 'Failed to fetch the instructional calendar' });
  }
};

export const replaceInstructionalDays = async (req: Request, res: Response) => {
  try {
    const { days } = replaceCalendarSchema.parse(req.body);
    const normalizedDays = days.map(day => ({
      ...day,
      date: toUtcDate(day.date),
      label: day.label || null,
    }));

    const result = await runTermWriteTransaction(req.params.id, 'SETUP', async tx => {
      const term = await tx.academicTerm.findUnique({
        where: { id: req.params.id },
        select: { id: true, startDate: true, endDate: true },
      });
      if (!term) return null;

      const outsideTerm = normalizedDays.find(day => (
        !isDateWithinRangeByDay(day.date, term.startDate, term.endDate)
      ));
      if (outsideTerm) {
        throw new InstructionalCalendarError(
          'DAY_OUTSIDE_TERM',
          `${dayKey(outsideTerm.date)} falls outside the academic term`,
          400,
        );
      }

      const lockedReports = await tx.studentTermReport.count({
        where: { termId: term.id, status: { in: ['FINALIZED', 'PUBLISHED'] } },
      });
      if (lockedReports > 0) {
        throw new InstructionalCalendarError(
          'CALENDAR_LOCKED',
          'The instructional calendar is locked because reports have been finalized',
        );
      }

      const attendanceDates = await tx.attendance.findMany({
        where: { academicTermId: term.id },
        select: { date: true },
        distinct: ['date'],
      });
      const requestedInstructionalDates = new Set(
        normalizedDays.filter(day => day.isInstructional).map(day => dayKey(day.date)),
      );
      const orphanedAttendanceDate = attendanceDates
        .map(record => dayKey(record.date))
        .find(date => !requestedInstructionalDates.has(date));
      if (orphanedAttendanceDate) {
        throw new InstructionalCalendarError(
          'ATTENDANCE_DAY_REQUIRED',
          `${orphanedAttendanceDate} must remain instructional because attendance exists`,
        );
      }

      for (const day of normalizedDays) {
        await tx.termInstructionalDay.upsert({
          where: {
            academicTermId_date: {
              academicTermId: term.id,
              date: day.date,
            },
          },
          update: {
            isInstructional: day.isInstructional,
            label: day.label,
          },
          create: {
            academicTermId: term.id,
            date: day.date,
            isInstructional: day.isInstructional,
            label: day.label,
          },
        });
      }

      await tx.termInstructionalDay.deleteMany({
        where: {
          academicTermId: term.id,
          ...(normalizedDays.length > 0
            ? { date: { notIn: normalizedDays.map(day => day.date) } }
            : {}),
        },
      });

      return tx.termInstructionalDay.findMany({
        where: { academicTermId: term.id },
        orderBy: { date: 'asc' },
      });
    });

    if (!result) return res.status(404).json({ error: 'Academic term not found' });
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof InstructionalCalendarError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'The instructional calendar changed concurrently' });
    }
    console.error('Replace instructional days error:', error);
    res.status(500).json({ error: 'Failed to update the instructional calendar' });
  }
};

class InstructionalCalendarError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'InstructionalCalendarError';
  }
}
