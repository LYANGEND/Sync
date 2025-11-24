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
      where: {
        schoolId: req.school?.id
      },
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
    
    if (!req.school?.id) {
      return res.status(400).json({ error: 'School context missing' });
    }

    const student = await prisma.student.create({
      data: {
        ...data,
        schoolId: req.school.id,
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

export const getStudentById = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;
    
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const student = await prisma.student.findFirst({
      where: whereClause,
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
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;
    const { reason, ...data } = updateStudentSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    // Verify student belongs to school (if context exists)
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const currentStudent = await prisma.student.findFirst({
      where: whereClause,
      select: { classId: true, schoolId: true }
    });

    if (!currentStudent) {
        return res.status(404).json({ error: 'Student not found' });
    }

    // If class is changing, we need to log it
    if (data.classId && currentStudent.classId !== data.classId) {
        // Verify target class belongs to the SAME school as the student
        const targetClass = await prisma.class.findFirst({
            where: {
                id: data.classId,
                schoolId: currentStudent.schoolId // Use student's schoolId, not req.school.id (in case of global admin)
            }
        });
        if (!targetClass) {
            return res.status(400).json({ error: 'Target class not found in the student\'s school' });
        }

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
    const userRole = (req as any).user?.role;
    if (userRole !== 'SYSTEM_OWNER' && !req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { id } = req.params;

    // Verify student belongs to school
    const whereClause: any = { id };
    if (req.school) {
        whereClause.schoolId = req.school.id;
    }

    const student = await prisma.student.findFirst({
        where: whereClause
    });
  
    if (!student) {
        return res.status(404).json({ error: 'Student not found' });
    }

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
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const userId = (req as any).user?.userId;
    
    const students = await prisma.student.findMany({
      where: {
        parentId: userId,
        schoolId: req.school.id
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
