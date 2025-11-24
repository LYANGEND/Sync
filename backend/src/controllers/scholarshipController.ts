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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const scholarships = await prisma.scholarship.findMany({
      where: { schoolId: req.school.id },
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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const data = scholarshipSchema.parse(req.body);
    
    const scholarship = await prisma.scholarship.create({
      data: {
        ...data,
        schoolId: req.school.id,
      },
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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;
    const data = scholarshipSchema.parse(req.body);

    // Verify ownership
    const existing = await prisma.scholarship.findFirst({
      where: { id, schoolId: req.school.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Scholarship not found' });
    }

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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.scholarship.findFirst({
      where: { id, schoolId: req.school.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Scholarship not found' });
    }

    await prisma.scholarship.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete scholarship' });
  }
};
