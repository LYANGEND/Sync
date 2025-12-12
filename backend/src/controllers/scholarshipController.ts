import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const scholarshipSchema = z.object({
  name: z.string().min(2),
  percentage: z.number().min(0).max(100),
  description: z.string().optional(),
});

export const getScholarships = async (req: Request, res: Response) => {
  try {
    const scholarships = await prisma.scholarship.findMany({
      include: {
        _count: {
          select: { students: true }
        }
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(scholarships);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch scholarships' });
  }
};

export const createScholarship = async (req: Request, res: Response) => {
  try {
    const data = scholarshipSchema.parse(req.body);
    
    const scholarship = await prisma.scholarship.create({
      data,
    });
    
    res.status(201).json(scholarship);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create scholarship' });
  }
};

export const updateScholarship = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = scholarshipSchema.parse(req.body);

    const scholarship = await prisma.scholarship.update({
      where: { id },
      data,
    });

    res.json(scholarship);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update scholarship' });
  }
};

export const deleteScholarship = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.scholarship.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scholarship' });
  }
};

export const bulkCreateScholarships = async (req: Request, res: Response) => {
  try {
    const scholarshipsData = z.array(scholarshipSchema).parse(req.body);

    const result = await prisma.scholarship.createMany({
      data: scholarshipsData,
      skipDuplicates: true,
    });

    res.status(201).json({
      message: `Successfully imported ${result.count} scholarships`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bulk create scholarships error:', error);
    res.status(500).json({ error: 'Failed to import scholarships' });
  }
};
