import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const gradingScaleSchema = z.object({
  grade: z.string().trim().min(1).max(20),
  minScore: z.number().int().min(0).max(100),
  maxScore: z.number().int().min(0).max(100),
  remark: z.string().trim().max(200).optional(),
}).superRefine((scale, ctx) => {
  if (scale.minScore > scale.maxScore) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxScore'],
      message: 'Maximum score must be greater than or equal to minimum score',
    });
  }
});

const findOverlappingScale = (minScore: number, maxScore: number, excludedId?: string) => (
  prisma.gradingScale.findFirst({
    where: {
      ...(excludedId ? { id: { not: excludedId } } : {}),
      minScore: { lte: maxScore },
      maxScore: { gte: minScore },
    },
  })
);

export const getGradingScales = async (req: Request, res: Response) => {
  try {
    const scales = await prisma.gradingScale.findMany({
      orderBy: { minScore: 'desc' },
    });
    res.json(scales);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch grading scales' });
  }
};

export const createGradingScale = async (req: Request, res: Response) => {
  try {
    const data = gradingScaleSchema.parse(req.body);
    
    const existing = await findOverlappingScale(data.minScore, data.maxScore);

    if (existing) {
      return res.status(400).json({ error: 'Score range overlaps with existing grade' });
    }

    const scale = await prisma.gradingScale.create({
      data,
    });
    
    res.status(201).json(scale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create grading scale' });
  }
};

export const updateGradingScale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = gradingScaleSchema.parse(req.body);

    const existing = await findOverlappingScale(data.minScore, data.maxScore, id);
    if (existing) {
      return res.status(400).json({ error: 'Score range overlaps with existing grade' });
    }

    const scale = await prisma.gradingScale.update({
      where: { id },
      data,
    });

    res.json(scale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Grading scale not found' });
    }
    res.status(500).json({ error: 'Failed to update grading scale' });
  }
};

export const deleteGradingScale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.gradingScale.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Grading scale not found' });
    }
    res.status(500).json({ error: 'Failed to delete grading scale' });
  }
};
