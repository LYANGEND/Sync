import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const termSchema = z.object({
  name: z.string().min(2),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean().optional(),
});

export const getAcademicTerms = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const terms = await prisma.academicTerm.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });
    res.json(terms);
  } catch (error) {
    handleControllerError(res, error, 'getAcademicTerms');
  }
};

export const createAcademicTerm = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, startDate, endDate, isActive } = termSchema.parse(req.body);

    const term = await prisma.academicTerm.create({
      data: {
        tenantId,
        name,
        startDate,
        endDate,
        isActive: isActive || false,
      },
    });

    res.status(201).json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createAcademicTerm');
  }
};

export const getCurrentTerm = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    // First try to get the active term
    let term = await prisma.academicTerm.findFirst({
      where: { tenantId, isActive: true },
    });

    // If no active term, get the most recent
    if (!term) {
      term = await prisma.academicTerm.findFirst({
        where: { tenantId },
        orderBy: { startDate: 'desc' },
      });
    }

    if (!term) {
      return res.status(404).json({ error: 'No academic term found' });
    }

    res.json(term);
  } catch (error) {
    handleControllerError(res, error, 'getCurrentTerm');
  }
};

export const updateAcademicTerm = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const data = termSchema.parse(req.body);

    // Verify term belongs to this tenant
    const existing = await prisma.academicTerm.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    const term = await prisma.academicTerm.update({
      where: { id },
      data: {
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive,
      },
    });

    res.json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'updateAcademicTerm');
  }
};

export const setActiveTerm = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify term belongs to this tenant
    const existing = await prisma.academicTerm.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Academic term not found' });
    }

    // Deactivate all other terms and activate this one
    await prisma.$transaction([
      prisma.academicTerm.updateMany({
        where: { tenantId },
        data: { isActive: false },
      }),
      prisma.academicTerm.update({
        where: { id },
        data: { isActive: true },
      }),
      // Also update the tenant's currentTermId
      prisma.tenant.update({
        where: { id: tenantId },
        data: { currentTermId: id },
      }),
    ]);

    res.json({ message: 'Term activated successfully' });
  } catch (error) {
    handleControllerError(res, error, 'setActiveTerm');
  }
};
