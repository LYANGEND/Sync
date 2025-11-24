import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const termSchema = z.object({
  name: z.string().min(2),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().optional(),
});

export const getAcademicTerms = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    
    const whereClause: any = {};
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const terms = await prisma.academicTerm.findMany({
      where: whereClause,
      orderBy: { startDate: 'desc' },
      include: { school: { select: { name: true } } }
    });
    res.json(terms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch academic terms' });
  }
};

export const createAcademicTerm = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing. Select a school first.' });
    }
    const { name, startDate, endDate, isActive } = termSchema.parse(req.body);

    const term = await prisma.academicTerm.create({
      data: {
        schoolId: req.school.id,
        name,
        startDate,
        endDate,
        isActive: isActive || false,
      },
    });

    res.status(201).json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create academic term' });
  }
};
