import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const subjectSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
});

export const getSubjects = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    
    const whereClause: any = {};
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const subjects = await prisma.subject.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      include: { school: { select: { name: true } } }
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
};

export const createSubject = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing. Select a school first.' });
    }
    const { name, code } = subjectSchema.parse(req.body);

    const existingSubject = await prisma.subject.findUnique({
      where: {
        code_schoolId: {
          code,
          schoolId: req.school.id
        }
      },
    });

    if (existingSubject) {
      return res.status(400).json({ error: 'Subject with this code already exists' });
    }

    const subject = await prisma.subject.create({
      data: {
        name,
        code,
        schoolId: req.school.id
      },
    });

    res.status(201).json(subject);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create subject' });
  }
};

export const updateSubject = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;
    const { name, code } = subjectSchema.parse(req.body);

    // Verify ownership
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const existing = await prisma.subject.findFirst({
      where: whereClause
    });

    if (!existing) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    const subject = await prisma.subject.update({
      where: { id },
      data: { name, code },
    });

    res.json(subject);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update subject' });
  }
};

export const deleteSubject = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;

    // Verify ownership
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const existing = await prisma.subject.findFirst({
      where: whereClause
    });

    if (!existing) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    await prisma.subject.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
};
