import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const createStudentSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  admissionNumber: z.string(),
  dateOfBirth: z.string().transform((str) => new Date(str)),
  gender: z.enum(['MALE', 'FEMALE']),
  guardianName: z.string(),
  guardianPhone: z.string(),
  address: z.string().optional(),
  classId: z.string().uuid(),
  scholarshipId: z.string().uuid().optional().nullable(),
});

const updateStudentSchema = createStudentSchema.partial().extend({
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'DROPPED_OUT']).optional(),
  reason: z.string().optional(), // For audit trail
});

export const getStudents = async (req: Request, res: Response) => {
  try {
    const students = await prisma.student.findMany({
      include: {
        class: true,
      },
      orderBy: {
        lastName: 'asc',
      },
    });
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
};

export const createStudent = async (req: Request, res: Response) => {
  try {
    const data = createStudentSchema.parse(req.body);
    
    const student = await prisma.student.create({
      data: {
        ...data,
        status: 'ACTIVE',
      },
    });
    
    res.status(201).json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create student' });
  }
};

export const bulkCreateStudents = async (req: Request, res: Response) => {
  try {
    const studentsData = z.array(createStudentSchema).parse(req.body);
    
    // We use a transaction to ensure all or nothing, though createMany is also atomic for the batch
    // However, createMany doesn't return the created records in all databases/prisma versions easily if we need them back
    // But usually for bulk import, just knowing count is enough.
    
    const result = await prisma.student.createMany({
      data: studentsData.map(s => ({
        ...s,
        status: 'ACTIVE'
      })),
      skipDuplicates: true, // Optional: skip if admission number exists? 
      // Note: skipDuplicates is not supported on all databases with Prisma (e.g. SQL Server), but works on Postgres/MySQL
    });
    
    res.status(201).json({ message: `Successfully imported ${result.count} students`, count: result.count });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bulk create error:', error);
    res.status(500).json({ error: 'Failed to import students' });
  }
};

export const bulkDeleteStudents = async (req: Request, res: Response) => {
  try {
    const { ids } = z.object({ ids: z.array(z.string()) }).parse(req.body);
    
    const result = await prisma.student.deleteMany({
      where: {
        id: {
          in: ids
        }
      }
    });
    
    res.json({ message: `Successfully deleted ${result.count} students`, count: result.count });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ error: 'Failed to delete students' });
  }
};

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        class: true,
        scholarship: true,
        payments: {
          orderBy: { paymentDate: 'desc' }
        },
        attendance: {
          take: 5,
          orderBy: { date: 'desc' }
        },
        feeStructures: {
          include: {
            feeTemplate: true
          }
        }
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student' });
  }
};

export const updateStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason, ...data } = updateStudentSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    // If class is changing, we need to log it
    if (data.classId) {
      const currentStudent = await prisma.student.findUnique({
        where: { id },
        select: { classId: true }
      });

      if (currentStudent && currentStudent.classId !== data.classId) {
        await prisma.classMovementLog.create({
          data: {
            studentId: id,
            fromClassId: currentStudent.classId,
            toClassId: data.classId,
            reason: reason || 'Class update',
            changedByUserId: userId
          }
        });
      }
    }

    const student = await prisma.student.update({
      where: { id },
      data,
    });

    res.json(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update student' });
  }
};

export const deleteStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.student.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete student' });
  }
};

export const getMyChildren = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    
    const students = await prisma.student.findMany({
      where: {
        parentId: userId
      },
      include: {
        class: true,
        attendance: {
          take: 5,
          orderBy: { date: 'desc' }
        },
        payments: {
          take: 5,
          orderBy: { paymentDate: 'desc' }
        }
      }
    });
    
    res.json(students);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch children' });
  }
};
