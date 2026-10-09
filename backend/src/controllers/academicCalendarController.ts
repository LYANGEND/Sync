import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { hasValidDateRange } from '../utils/academicValidation';

const eventFields = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  eventType: z.enum([
    'HOLIDAY', 'EXAM_PERIOD', 'PARENT_MEETING', 'SPORTS_DAY',
    'CULTURAL_EVENT', 'DEADLINE', 'STAFF_DEVELOPMENT', 'SCHOOL_CLOSURE', 'OTHER'
  ]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isAllDay: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Color must be a six-digit hex value').optional().or(z.literal('')),
});

const eventSchema = eventFields.superRefine((event, ctx) => {
  if (!hasValidDateRange(event.startDate, event.endDate, true)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'End date must be on or after start date',
    });
  }
});

export const getEvents = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, eventType } = req.query;

    const where: any = {};
    if (startDate && endDate) {
      where.OR = [
        {
          startDate: { gte: new Date(startDate as string), lte: new Date(endDate as string) }
        },
        {
          endDate: { gte: new Date(startDate as string), lte: new Date(endDate as string) }
        },
        {
          AND: [
            { startDate: { lte: new Date(startDate as string) } },
            { endDate: { gte: new Date(endDate as string) } }
          ]
        }
      ];
    }
    if (eventType) where.eventType = eventType;

    const events = await prisma.academicEvent.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
};

export const createEvent = async (req: Request, res: Response) => {
  try {
    const data = eventSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    const event = await prisma.academicEvent.create({
      data: {
        ...data,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        isAllDay: data.isAllDay ?? true,
        createdBy: userId,
      },
    });

    res.status(201).json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
};

export const updateEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = eventFields.partial().parse(req.body);
    const existing = await prisma.academicEvent.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Academic event not found' });

    const nextStartDate = data.startDate || existing.startDate;
    const nextEndDate = data.endDate || existing.endDate;
    if (!hasValidDateRange(nextStartDate, nextEndDate, true)) {
      return res.status(400).json({ error: 'End date must be on or after start date' });
    }

    const updateData: any = { ...data };
    if (data.startDate) updateData.startDate = new Date(data.startDate);
    if (data.endDate) updateData.endDate = new Date(data.endDate);

    const event = await prisma.academicEvent.update({
      where: { id },
      data: updateData,
    });

    res.json(event);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.academicEvent.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
};
