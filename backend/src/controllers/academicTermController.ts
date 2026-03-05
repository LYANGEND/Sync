import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const termSchema = z.object({
  name: z.string().min(2),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().optional(),
});

export const getAcademicTerms = async (req: Request, res: Response) => {
  try {
    const terms = await prisma.academicTerm.findMany({
      orderBy: { startDate: 'desc' },
    });
    res.json(terms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch academic terms' });
  }
};

export const createAcademicTerm = async (req: Request, res: Response) => {
  try {
    const { name, startDate, endDate, isActive } = termSchema.parse(req.body);

    const term = await prisma.academicTerm.create({
      data: {
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

export const updateAcademicTerm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, isActive } = termSchema.parse(req.body);

    const term = await prisma.academicTerm.update({
      where: { id },
      data: {
        name,
        startDate,
        endDate,
        isActive,
      },
    });

    res.json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update academic term' });
  }
};

export const deleteAcademicTerm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.academicTerm.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete academic term' });
  }
};
