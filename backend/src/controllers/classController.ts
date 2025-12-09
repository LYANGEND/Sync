import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const classSchema = z.object({
  name: z.string().min(2),
  gradeLevel: z.number().int().min(0).max(12),
  teacherId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  subjectIds: z.array(z.string().uuid()).optional(),
});

export const getClasses = async (req: Request, res: Response) => {
  try {
    const classes = await prisma.class.findMany({
      include: {
        teacher: {
          select: { fullName: true },
        },
        subjects: true,
        _count: {
          select: { students: true },
        },
      },
      orderBy: [
        { gradeLevel: 'asc' },
        { name: 'asc' },
      ],
    });
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch classes' });
  }
};

export const createClass = async (req: Request, res: Response) => {
  try {
    const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);

    const newClass = await prisma.class.create({
      data: {
        name,
        gradeLevel,
        teacherId,
        academicTermId,
        subjects: subjectIds ? {
          connect: subjectIds.map(id => ({ id })),
        } : undefined,
      },
      include: {
        subjects: true,
      },
    });

    res.status(201).json(newClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create class' });
  }
};

export const updateClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, gradeLevel, teacherId, academicTermId, subjectIds } = classSchema.parse(req.body);

    const updatedClass = await prisma.class.update({
      where: { id },
      data: {
        name,
        gradeLevel,
        teacherId,
        academicTermId,
        subjects: subjectIds ? {
          set: subjectIds.map(id => ({ id })),
        } : undefined,
      },
      include: {
        subjects: true,
      },
    });

    res.json(updatedClass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update class' });
  }
};

export const deleteClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.class.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete class' });
  }
};

export const getClassStudents = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const students = await prisma.student.findMany({
      where: { classId: id },
      orderBy: { lastName: 'asc' },
    });
    res.json(students);
  } catch (error) {
    console.error('Error fetching class students:', error);
    res.status(500).json({ error: 'Failed to fetch class students' });
  }
};

export const addStudentsToClass = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { studentIds } = z.object({ studentIds: z.array(z.string().uuid()) }).parse(req.body);
    const userId = (req as any).user?.userId;

    const classExists = await prisma.class.findUnique({ where: { id } });
    if (!classExists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    await prisma.student.updateMany({
      where: {
        id: { in: studentIds },
      },
      data: {
        classId: id,
      },
    });

    res.json({ message: 'Students added to class successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to add students to class' });
  }
};
