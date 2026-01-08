import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

const subjectSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
});

export const getSubjects = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);

    const subjects = await prisma.subject.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    res.json(subjects);
  } catch (error) {
    handleControllerError(res, error, 'getSubjects');
  }
};

export const createSubject = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { name, code } = subjectSchema.parse(req.body);

    // Check if subject code exists in THIS tenant
    const existingSubject = await prisma.subject.findFirst({
      where: { tenantId, code },
    });

    if (existingSubject) {
      return res.status(400).json({ error: 'Subject with this code already exists' });
    }

    const subject = await prisma.subject.create({
      data: { tenantId, name, code },
    });

    res.status(201).json(subject);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'createSubject');
  }
};

export const updateSubject = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { name, code } = subjectSchema.parse(req.body);

    // Verify subject belongs to this tenant
    const existing = await prisma.subject.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Check if new code conflicts with another subject
    if (code !== existing.code) {
      const codeConflict = await prisma.subject.findFirst({
        where: { tenantId, code, id: { not: id } }
      });
      if (codeConflict) {
        return res.status(400).json({ error: 'Subject with this code already exists' });
      }
    }

    const subject = await prisma.subject.update({
      where: { id },
      data: { name, code },
    });

    res.json(subject);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    handleControllerError(res, error, 'updateSubject');
  }
};

export const deleteSubject = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;

    // Verify subject belongs to this tenant
    const existing = await prisma.subject.findFirst({
      where: { id, tenantId }
    });
    if (!existing) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    await prisma.subject.delete({
      where: { id },
    });
    res.status(204).send();
  } catch (error) {
    handleControllerError(res, error, 'deleteSubject');
  }
};

export const bulkCreateSubjects = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const subjectsData = z.array(subjectSchema).parse(req.body);

    // Add tenantId to each subject
    const dataWithTenant = subjectsData.map(s => ({ ...s, tenantId }));

    const result = await prisma.subject.createMany({
      data: dataWithTenant,
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
    handleControllerError(res, error, 'bulkCreateSubjects');
  }
};
