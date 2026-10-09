import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { hasValidDateRange } from '../utils/academicValidation';
import {
  beginClosingTerm,
  createTerm,
  deleteDraftTerm,
  getActiveTerm,
  TermLifecycleError,
  updateTerm,
} from '../services/termLifecycleService';

// The active term is chosen only through school settings (currentTermId); create/update never activate.
const termSchema = z.object({
  name: z.string().trim().min(2).max(100),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  version: z.number().int().positive().optional(),
}).superRefine((term, ctx) => {
  if (!hasValidDateRange(term.startDate, term.endDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'End date must be after start date',
    });
  }
});

const transitionSchema = z.object({
  version: z.number().int().positive().optional(),
});

const sendLifecycleError = (res: Response, error: TermLifecycleError) => (
  res.status(error.statusCode).json({ error: error.message, code: error.code })
);

export const getAcademicTerms = async (req: Request, res: Response) => {
  try {
    const terms = await prisma.academicTerm.findMany({
      orderBy: { startDate: 'desc' },
    });
    res.json(terms);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch academic terms' });
  }
};

export const getCurrentAcademicTerm = async (req: Request, res: Response) => {
  try {
    const term = await getActiveTerm();
    res.json(term);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch the current academic term' });
  }
};

export const createAcademicTerm = async (req: Request, res: Response) => {
  try {
    const { name, startDate, endDate } = termSchema.parse(req.body);
    const term = await createTerm({
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    res.status(201).json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) {
      return sendLifecycleError(res, error);
    }
    res.status(500).json({ error: 'Failed to create academic term' });
  }
};

export const updateAcademicTerm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, version } = termSchema.parse(req.body);
    const term = await updateTerm(id, {
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      expectedVersion: version,
    });

    res.json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) {
      return sendLifecycleError(res, error);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Academic term not found' });
    }
    res.status(500).json({ error: 'Failed to update academic term' });
  }
};

export const deleteAcademicTerm = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await deleteDraftTerm(id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof TermLifecycleError) {
      return sendLifecycleError(res, error);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return res.status(404).json({ error: 'Academic term not found' });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(409).json({ error: 'This term is in use and cannot be deleted' });
    }
    res.status(500).json({ error: 'Failed to delete academic term' });
  }
};

export const startAcademicTermClosing = async (req: Request, res: Response) => {
  try {
    const { version } = transitionSchema.parse(req.body ?? {});
    const term = await beginClosingTerm(req.params.id, version);
    res.json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (error instanceof TermLifecycleError) {
      return sendLifecycleError(res, error);
    }
    res.status(500).json({ error: 'Failed to start academic term closing' });
  }
};
