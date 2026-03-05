import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';

const gradingScaleSchema = z.object({
  grade: z.string().min(1),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  remark: z.string().optional(),
});

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
    
    // Check for overlap
    const existing = await prisma.gradingScale.findFirst({
      where: {
        OR: [
          {
            AND: [
              { minScore: { lte: data.minScore } },
              { maxScore: { gte: data.minScore } }
            ]
          },
          {
            AND: [
              { minScore: { lte: data.maxScore } },
              { maxScore: { gte: data.maxScore } }
            ]
          }
        ]
      }
    });

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

    const scale = await prisma.gradingScale.update({
      where: { id },
      data,
    });

    res.json(scale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
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
    res.status(500).json({ error: 'Failed to delete grading scale' });
  }
};
