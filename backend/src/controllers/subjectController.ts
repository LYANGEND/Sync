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
    const subjects = await prisma.subject.findMany({
      orderBy: { name: 'asc' },
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects' });
  }
};

export const createSubject = async (req: Request, res: Response) => {
  try {
    const { name, code } = subjectSchema.parse(req.body);

    const existingSubject = await prisma.subject.findUnique({
      where: { code },
    });

    if (existingSubject) {
      return res.status(400).json({ error: 'Subject with this code already exists' });
    }

    const subject = await prisma.subject.create({
      data: { name, code },
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
    const { id } = req.params;
    const { name, code } = subjectSchema.parse(req.body);

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
    const { id } = req.params;
    await prisma.subject.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete subject' });
  }
};

export const bulkCreateSubjects = async (req: Request, res: Response) => {
  try {
    const subjectsData = z.array(subjectSchema).parse(req.body);

    const result = await prisma.subject.createMany({
      data: subjectsData,
      skipDuplicates: true,
    });

    res.status(201).json({
      message: `Successfully imported ${result.count} subjects`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bulk create subjects error:', error);
    res.status(500).json({ error: 'Failed to import subjects' });
  }
};
