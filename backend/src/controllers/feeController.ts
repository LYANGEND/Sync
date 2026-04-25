import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { syncClassFeesToStudents } from '../services/classFeeAssignmentService';

const feeTemplateSchema = z.object({
  name: z.string().min(2),
  amount: z.number().positive(),
  academicTermId: z.string().uuid(),
  categoryId: z.string().uuid(),
  applicableGrade: z.number().int().min(0).max(12), // 0: Nursery, 1-12: Grades
});

const assignFeeSchema = z.object({
  feeTemplateId: z.string().uuid(),
  classId: z.string().uuid(),
});

export const getFeeTemplates = async (req: Request, res: Response) => {
  try {
    const templates = await prisma.feeTemplate.findMany({
      include: {
        academicTerm: true,
        category: true,
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
    const { name, amount, academicTermId, categoryId, applicableGrade } = feeTemplateSchema.parse(req.body);

    const template = await prisma.feeTemplate.create({
      data: {
        name,
        amount,
        academicTermId,
        categoryId,
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
    const { feeTemplateId, classId } = assignFeeSchema.parse(req.body);
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

    const [feeTemplate, classRecord] = await Promise.all([
      prisma.feeTemplate.findUnique({
      where: { id: feeTemplateId },
      include: { academicTerm: true, category: true },
      }),
      prisma.class.findUnique({
        where: { id: classId },
        select: { id: true, name: true, academicTermId: true },
      }),
    ]);

    if (!feeTemplate) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    if (!classRecord) {
      return res.status(404).json({ error: 'Class not found' });
    }

    if (!feeTemplate.categoryId || !feeTemplate.category) {
      return res.status(400).json({
        error: 'Fee template must belong to a fee category before it can be assigned to a class',
      });
    }

    if (classRecord.academicTermId !== feeTemplate.academicTermId) {
      return res.status(400).json({
        error: 'Fee template term does not match the selected class term',
      });
    }

    const conflictingAssignment = await prisma.classFeeAssignment.findFirst({
      where: {
        classId,
        academicTermId: feeTemplate.academicTermId,
        categoryId: feeTemplate.categoryId,
        feeTemplateId: { not: feeTemplateId },
      },
      include: {
        feeTemplate: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (conflictingAssignment) {
      return res.status(400).json({
        error: `Only one fee category can be assigned to a class per term. ${classRecord.name} already has ${conflictingAssignment.feeTemplate.name} assigned for the ${feeTemplate.category.name} category in ${feeTemplate.academicTerm.name}.`,
        existingAssignment: {
          feeTemplateId: conflictingAssignment.feeTemplate.id,
          feeTemplateName: conflictingAssignment.feeTemplate.name,
          categoryId: feeTemplate.categoryId,
          categoryName: feeTemplate.category.name,
          academicTermId: feeTemplate.academicTermId,
          academicTermName: feeTemplate.academicTerm.name,
        },
      });
    }

    await prisma.classFeeAssignment.upsert({
      where: {
        classId_feeTemplateId: {
          classId,
          feeTemplateId,
        },
      },
      update: {
        dueDate,
        academicTermId: feeTemplate.academicTermId,
        categoryId: feeTemplate.categoryId,
      },
      create: {
        classId,
        feeTemplateId,
        academicTermId: feeTemplate.academicTermId,
        categoryId: feeTemplate.categoryId,
        dueDate,
      },
    });

    const syncResult = await syncClassFeesToStudents(classId);

    res.status(200).json({
      message: `Fee assignment saved for class ${classRecord.name}`,
      feeTemplate: {
        name: feeTemplate.name,
        amount: feeTemplate.amount,
        term: feeTemplate.academicTerm.name,
        category: feeTemplate.category.name,
      },
      assigned: syncResult.created,
      alreadyAssigned: Math.max(0, syncResult.studentCount - syncResult.created),
      failed: 0,
      autoAssignmentEnabled: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Error assigning fee:', error);
    res.status(500).json({ error: 'Failed to assign fee to class' });
  }
};

export const getFeeTemplateById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = await prisma.feeTemplate.findUnique({
      where: { id },
      include: {
        academicTerm: true,
        category: true,
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    res.json(template);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fee template' });
  }
};

export const updateFeeTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = feeTemplateSchema.partial().parse(req.body);

    const template = await prisma.feeTemplate.update({
      where: { id },
      data,
      include: {
        academicTerm: true,
        category: true,
      },
    });

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to update fee template' });
  }
};

export const deleteFeeTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [usageCount, classAssignmentCount] = await Promise.all([
      prisma.studentFeeStructure.count({
        where: { feeTemplateId: id }
      }),
      prisma.classFeeAssignment.count({
        where: { feeTemplateId: id }
      }),
    ]);

    if (usageCount > 0 || classAssignmentCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete fee template as it has already been assigned to students. Consider archiving or modifying it instead.'
      });
    }

    await prisma.feeTemplate.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete fee template' });
  }
};

const bulkFeeTemplateSchema = z.object({
  name: z.string().min(2),
  amount: z.number().positive(),
  academicTermId: z.string().uuid().optional(),
  applicableGrade: z.number().int().min(-2).max(12),
});

export const bulkCreateFeeTemplates = async (req: Request, res: Response) => {
  try {
    const templatesData = z.array(bulkFeeTemplateSchema).parse(req.body);

    // Get current academic term if not provided
    const currentTerm = await prisma.academicTerm.findFirst({
      where: { isActive: true },
      orderBy: { startDate: 'desc' }
    });

    if (!currentTerm) {
      return res.status(400).json({ error: 'No active academic term found' });
    }

    const dataToCreate = templatesData.map(t => ({
      name: t.name,
      amount: t.amount,
      academicTermId: t.academicTermId || currentTerm.id,
      applicableGrade: t.applicableGrade,
    }));

    const result = await prisma.feeTemplate.createMany({
      data: dataToCreate,
      skipDuplicates: true,
    });

    res.status(201).json({
      message: `Successfully imported ${result.count} fee templates`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Bulk create fee templates error:', error);
    res.status(500).json({ error: 'Failed to import fee templates' });
  }
};

export const getStudentStatement = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    // 1. Get School Info
    const settings = await prisma.schoolSettings.findFirst();

    // 2. Get Student Info
    // 2. Get Student Info
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: true,
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // SECURITY: Access Control
    const user = (req as any).user;
    if (user.role === 'PARENT' && student.parentId !== user.userId) {
      return res.status(403).json({ error: 'Unauthorized: This student does not belong to your account.' });
    }

    // Restrict other roles if necessary (e.g. STUDENT shouldn't see this)
    if (!['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'PARENT'].includes(user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // 3. Get Fees (Debits)
    const fees = await prisma.studentFeeStructure.findMany({
      where: { studentId },
      include: {
        feeTemplate: {
          include: { academicTerm: true }
        }
      }
    });

    // 4. Get Payments (Credits) - Only COMPLETED payments
    const payments = await prisma.payment.findMany({
      where: {
        studentId,
        status: 'COMPLETED'
      },
      orderBy: { paymentDate: 'asc' }
    });

    // 5. Combine and Sort
    const transactions = [
      ...fees.map(f => ({
        id: f.id,
        date: f.createdAt, // Or dueDate if preferred
        type: 'DEBIT',
        description: f.feeTemplate.name,
        term: f.feeTemplate.academicTerm.name,
        amount: Number(f.amountDue),
        ref: '-'
      })),
      ...payments.map(p => ({
        id: p.id,
        date: p.paymentDate,
        type: 'CREDIT',
        description: `Payment (${p.method.replace('_', ' ')})`,
        term: '-', // Could infer term based on date
        amount: Number(p.amount),
        ref: p.transactionId || '-'
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      school: {
        name: settings?.schoolName || 'School Name',
        address: settings?.schoolAddress || '',
        email: settings?.schoolEmail || '',
        logoUrl: settings?.logoUrl || ''
      },
      student: {
        name: `${student.firstName} ${student.lastName}`,
        admissionNumber: student.admissionNumber,
        className: student.class.name,
        guardian: student.guardianName
      },
      transactions
    });

  } catch (error) {
    console.error('Get student statement error:', error);
    res.status(500).json({ error: 'Failed to generate statement' });
  }
};
