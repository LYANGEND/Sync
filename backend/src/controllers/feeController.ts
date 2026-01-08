import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const feeTemplateSchema = z.object({
  name: z.string().min(2),
  amount: z.number().positive(),
  academicTermId: z.string().uuid(),
  applicableGrade: z.number().int().min(0).max(12),
});

const assignFeeSchema = z.object({
  feeTemplateId: z.string().uuid(),
  classId: z.string().uuid(),
});

export const getFeeTemplates = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const templates = await prisma.feeTemplate.findMany({
      where: { tenantId },
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
    handleControllerError(res, error, 'getFeeTemplates');
  }
};

export const createFeeTemplate = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, amount, academicTermId, applicableGrade } = feeTemplateSchema.parse(req.body);

    // Verify term belongs to this tenant
    const term = await prisma.academicTerm.findFirst({
      where: { id: academicTermId, tenantId }
    });
    if (!term) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    const template = await prisma.feeTemplate.create({
      data: {
        tenantId,
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
    handleControllerError(res, error, 'createFeeTemplate');
  }
};

export const assignFeeToClass = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { feeTemplateId, classId } = assignFeeSchema.parse(req.body);
    const dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;

    // 1. Get the fee template
    const feeTemplate = await prisma.feeTemplate.findFirst({
      where: { id: feeTemplateId, tenantId },
      include: { academicTerm: true },
    });

    if (!feeTemplate) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    // 2. Verify class belongs to this tenant
    const classData = await prisma.class.findFirst({
      where: { id: classId, tenantId }
    });
    if (!classData) {
      return res.status(404).json({ error: 'Class not found' });
    }

    // 3. Get all students in the class with their scholarship info
    const students = await prisma.student.findMany({
      where: { tenantId, classId, status: 'ACTIVE' },
      include: {
        scholarship: true,
        feeStructures: {
          where: { feeTemplateId }
        }
      },
    });

    if (students.length === 0) {
      return res.status(404).json({ error: 'No active students found in this class' });
    }

    // 4. Filter out students who already have this fee assigned
    const studentsToAssign = students.filter(student => student.feeStructures.length === 0);

    if (studentsToAssign.length === 0) {
      return res.status(400).json({
        error: 'All students in this class already have this fee assigned',
        alreadyAssigned: students.length
      });
    }

    // 5. Create StudentFeeStructure records
    const createdRecords = [];
    const errors = [];

    for (const student of studentsToAssign) {
      try {
        let amountDue = Number(feeTemplate.amount);

        // Apply scholarship if exists
        if (student.scholarship) {
          const discountPercentage = Number(student.scholarship.percentage);
          const discountAmount = (amountDue * discountPercentage) / 100;
          amountDue = Math.max(0, amountDue - discountAmount);
        }

        const record = await prisma.studentFeeStructure.create({
          data: {
            studentId: student.id,
            feeTemplateId: feeTemplate.id,
            amountDue: amountDue,
            amountPaid: 0,
            dueDate: dueDate,
          },
        });

        createdRecords.push(record);
      } catch (error) {
        errors.push({
          studentId: student.id,
          studentName: `${student.firstName} ${student.lastName}`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    res.status(200).json({
      message: `Successfully assigned fee to ${createdRecords.length} students`,
      feeTemplate: {
        name: feeTemplate.name,
        amount: feeTemplate.amount,
        term: feeTemplate.academicTerm.name
      },
      assigned: createdRecords.length,
      alreadyAssigned: students.length - studentsToAssign.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'assignFeeToClass');
  }
};

export const getFeeTemplateById = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    const template = await prisma.feeTemplate.findFirst({
      where: { id, tenantId },
      include: {
        academicTerm: true,
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    res.json(template);
  } catch (error) {
    handleControllerError(res, error, 'getFeeTemplateById');
  }
};

export const updateFeeTemplate = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const data = feeTemplateSchema.partial().parse(req.body);

    // Verify template belongs to this tenant
    const existing = await prisma.feeTemplate.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    const template = await prisma.feeTemplate.update({
      where: { id },
      data,
    });

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'updateFeeTemplate');
  }
};

export const deleteFeeTemplate = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify template belongs to this tenant
    const existing = await prisma.feeTemplate.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Fee template not found' });
    }

    // Check if it's in use
    const usageCount = await prisma.studentFeeStructure.count({
      where: { feeTemplateId: id }
    });

    if (usageCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete fee template as it has already been assigned to students.'
      });
    }

    await prisma.feeTemplate.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteFeeTemplate');
  }
};

const bulkFeeTemplateSchema = z.object({
  name: z.string().min(2),
  amount: z.number().positive(),
  academicTermId: z.string().uuid().optional(),
  applicableGrade: z.number().int().min(-2).max(12),
});

export const bulkCreateFeeTemplates = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const templatesData = z.array(bulkFeeTemplateSchema).parse(req.body);

    // Get current academic term for this tenant
    const currentTerm = await prisma.academicTerm.findFirst({
      where: { tenantId, isActive: true },
      orderBy: { startDate: 'desc' }
    });

    if (!currentTerm) {
      return res.status(400).json({ error: 'No active academic term found' });
    }

    const dataToCreate = templatesData.map(t => ({
      tenantId,
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
    handleControllerError(res, error, 'bulkCreateFeeTemplates');
  }
};

export const getStudentStatement = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { studentId } = req.params;

    // 1. Get Tenant Info (replaces SchoolSettings)
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    // 2. Get Student Info
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: {
        class: true,
      }
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // SECURITY: Access Control
    const user = req.user;
    if (user?.role === 'PARENT' && student.parentId !== user.userId) {
      return res.status(403).json({ error: 'Unauthorized: This student does not belong to your account.' });
    }

    if (!['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER', 'PARENT'].includes(user?.role || '')) {
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

    // 4. Get Payments (Credits)
    const payments = await prisma.payment.findMany({
      where: { tenantId, studentId },
      orderBy: { paymentDate: 'asc' }
    });

    // 5. Combine and Sort
    const transactions = [
      ...fees.map(f => ({
        id: f.id,
        date: f.createdAt,
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
        term: '-',
        amount: Number(p.amount),
        ref: p.referenceNumber || '-'
      }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      school: {
        name: tenant?.name || 'School Name',
        address: tenant?.address || '',
        email: tenant?.email || '',
        logoUrl: tenant?.logoUrl || ''
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
    handleControllerError(res, error, 'getStudentStatement');
  }
};
