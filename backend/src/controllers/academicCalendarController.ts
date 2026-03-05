import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const eventSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  eventType: z.enum([
    'HOLIDAY', 'EXAM_PERIOD', 'PARENT_MEETING', 'SPORTS_DAY',
    'CULTURAL_EVENT', 'DEADLINE', 'STAFF_DEVELOPMENT', 'SCHOOL_CLOSURE', 'OTHER'
  ]),
  startDate: z.string(),
  endDate: z.string(),
  isAllDay: z.boolean().optional(),
  color: z.string().optional(),
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
    const data = eventSchema.partial().parse(req.body);

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
