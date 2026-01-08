import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const scholarshipSchema = z.object({
  name: z.string().min(2),
  percentage: z.number().min(0).max(100),
  description: z.string().optional(),
});

export const getScholarships = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const scholarships = await prisma.scholarship.findMany({
      where: { tenantId },
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
    handleControllerError(res, error, 'getScholarships');
  }
};

export const createScholarship = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = scholarshipSchema.parse(req.body);

    const scholarship = await prisma.scholarship.create({
      data: {
        tenantId,
        ...data
      },
    });

    res.status(201).json(scholarship);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createScholarship');
  }
};

export const updateScholarship = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const data = scholarshipSchema.parse(req.body);

    // Verify scholarship belongs to this tenant
    const existing = await prisma.scholarship.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Scholarship not found' });
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
    handleControllerError(res, error, 'updateScholarship');
  }
};

export const deleteScholarship = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify scholarship belongs to this tenant
    const existing = await prisma.scholarship.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Scholarship not found' });
    }

    await prisma.scholarship.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteScholarship');
  }
};

export const bulkCreateScholarships = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const scholarshipsData = z.array(scholarshipSchema).parse(req.body);

    // Add tenantId to each scholarship
    const dataWithTenant = scholarshipsData.map(s => ({ ...s, tenantId }));

    const result = await prisma.scholarship.createMany({
      data: dataWithTenant,
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
    handleControllerError(res, error, 'bulkCreateScholarships');
  }
};
