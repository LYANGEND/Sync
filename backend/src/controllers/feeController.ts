import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

const feeTemplateSchema = z.object({
  name: z.string().min(2),
  amount: z.number().positive(),
  academicTermId: z.string().uuid(),
  applicableGrade: z.number().int().min(1).max(12), // Assuming grades 1-12
});

const assignFeeSchema = z.object({
  feeTemplateId: z.string().uuid(),
  classId: z.string().uuid(),
});

export const getFeeTemplates = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const templates = await prisma.feeTemplate.findMany({
      where: { schoolId: req.school.id },
      include: {
        academicTerm: true,
      },
      orderBy: {
        academicTerm: {
          startDate: 'desc',
        },
      },
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fee templates' });
  }
};

export const createFeeTemplate = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { name, amount, academicTermId, applicableGrade } = feeTemplateSchema.parse(req.body);

    const template = await prisma.feeTemplate.create({
      data: {
        schoolId: req.school.id,
        name,
        amount,
        academicTermId,
        applicableGrade,
      },
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to create fee template' });
  }
};

export const assignFeeToClass = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { feeTemplateId, classId } = assignFeeSchema.parse(req.body);

    // Verify class belongs to school
    const classExists = await prisma.class.findFirst({
      where: {
        id: classId,
        schoolId: req.school.id
      }
    });

    if (!classExists) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // 1. Get the fee template to know the amount
    const feeTemplate = await prisma.feeTemplate.findUnique({
      where: { id: feeTemplateId },
    });

    if (!feeTemplate || feeTemplate.schoolId !== req.school.id) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    // 2. Get all students in the class with their scholarship info
    const students = await prisma.student.findMany({
      where: { classId: classId, status: 'ACTIVE', schoolId: req.school.id },
      include: { scholarship: true },
    });

    if (students.length === 0) {
      return res.status(404).json({ error: 'No active students found in this class' });
    }

    // 3. Create StudentFeeStructure records for each student
    // We use a transaction to ensure all or nothing
    const result = await prisma.$transaction(
      students.map((student) => {
        let amountDue = Number(feeTemplate.amount);
        
        // Apply scholarship if exists
        if (student.scholarship) {
          const discountPercentage = Number(student.scholarship.percentage);
          const discountAmount = (amountDue * discountPercentage) / 100;
          amountDue = Math.max(0, amountDue - discountAmount);
        }

        return prisma.studentFeeStructure.create({
          data: {
            studentId: student.id,
            feeTemplateId: feeTemplate.id,
            amountDue: amountDue, // Prisma handles number to Decimal conversion
            amountPaid: 0,
          },
        });
      })
    );

    res.status(200).json({
      message: `Successfully assigned fee to ${result.length} students`,
      assignedCount: result.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error assigning fee:', error);
    res.status(500).json({ error: 'Failed to assign fee to class' });
  }
};
