import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const gradingScaleSchema = z.object({
  grade: z.string().min(1),
  minScore: z.number().min(0).max(100),
  maxScore: z.number().min(0).max(100),
  remark: z.string().optional(),
});

export const getGradingScales = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const scales = await prisma.gradingScale.findMany({
      where: { tenantId },
      orderBy: { minScore: 'desc' },
    });
    res.json(scales);
  } catch (error) {
    handleControllerError(res, error, 'getGradingScales');
  }
};

export const createGradingScale = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const data = gradingScaleSchema.parse(req.body);

    // Check for overlap within this tenant
    const existing = await prisma.gradingScale.findFirst({
      where: {
        tenantId,
        OR: [
          {
            AND: [
              { minScore: { lte: data.minScore } },
              { maxScore: { gte: data.minScore } }
            ]
          },
          {
            AND: [
              { minScore: { lte: data.maxScore } },
              { maxScore: { gte: data.maxScore } }
            ]
          }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Score range overlaps with existing grade' });
    }

    const scale = await prisma.gradingScale.create({
      data: {
        tenantId,
        ...data
      },
    });

    res.status(201).json(scale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createGradingScale');
  }
};

export const updateGradingScale = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const data = gradingScaleSchema.parse(req.body);

    // Verify scale belongs to this tenant
    const existing = await prisma.gradingScale.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Grading scale not found' });
    }

    const scale = await prisma.gradingScale.update({
      where: { id },
      data,
    });

    res.json(scale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'updateGradingScale');
  }
};

export const deleteGradingScale = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify scale belongs to this tenant
    const existing = await prisma.gradingScale.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Grading scale not found' });
    }

    await prisma.gradingScale.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteGradingScale');
  }
};

export const bulkCreateGradingScales = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const scalesData = z.array(gradingScaleSchema).parse(req.body);

    // Add tenantId to each scale
    const dataWithTenant = scalesData.map(s => ({ ...s, tenantId }));

    // Clear existing scales for this tenant first
    await prisma.gradingScale.deleteMany({
      where: { tenantId }
    });

    const result = await prisma.gradingScale.createMany({
      data: dataWithTenant,
    });

    res.status(201).json({
      message: `Successfully created ${result.count} grading scales`,
      count: result.count,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'bulkCreateGradingScales');
  }
};
