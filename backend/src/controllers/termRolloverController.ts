import { Request, Response } from 'express';
import { TermRolloverType } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  acknowledgeTermRolloverWarnings, approveTermRollover, backupTermRollover,
  preflightTermRollover, TermRolloverReadinessError, verifyTermRolloverBackup,
} from '../services/termRolloverReadinessService';
import {
  createTermRollover,
  getTermRollover,
  listTermRollovers,
  planTermRollover,
  prepareTermRollover,
  ROLLOVER_COPY_CATEGORIES,
  TermRolloverError,
  updateTermRolloverConfiguration,
  validateTermRolloverPreparation,
} from '../services/termRolloverPreparationService';
import {
  getTermRolloverEnrollmentPlan,
  saveYearEndTransitionDecisions,
  stageTermRolloverEnrollments,
  TermRolloverEnrollmentError,
  validateTermRolloverEnrollments,
} from '../services/termRolloverEnrollmentService';

const rolloverIdSchema = z.string().uuid();
const copyCategorySchema = z.enum(ROLLOVER_COPY_CATEGORIES);
const yearEndMappingSchema = z.object({
  sourceCohortId: z.string().uuid(),
  targetName: z.string().trim().min(1).max(100).optional(),
  targetGradeLevel: z.number().int().min(0).max(12).optional(),
  skip: z.boolean().optional(),
});
const configurationSchema = z.object({
  copyCategories: z.array(copyCategorySchema).max(ROLLOVER_COPY_CATEGORIES.length).optional(),
  yearEndMappings: z.array(yearEndMappingSchema).max(100).optional(),
});
const createRolloverSchema = z.object({
  sourceTermId: z.string().uuid(),
  targetTermId: z.string().uuid(),
  transitionType: z.nativeEnum(TermRolloverType),
  idempotencyKey: z.string().trim().min(8).max(200),
  configuration: configurationSchema.optional(),
});
const updateConfigurationSchema = configurationSchema.extend({
  expectedVersion: z.number().int().positive().optional(),
});
const prepareSchema = z.object({
  expectedInputHash: z.string().regex(/^[a-f0-9]{64}$/i, 'A valid dry-run input hash is required'),
});
const enrollmentPlanHashSchema = z.object({
  expectedInputHash: z.string().regex(/^[a-f0-9]{64}$/i, 'A valid enrollment-plan hash is required'),
});
const yearEndDecisionSchema = z.object({
  studentId: z.string().uuid(),
  action: z.enum(['PROMOTE', 'RETAIN', 'GRADUATE', 'TRANSFER', 'WITHDRAW']),
  targetClassId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});
const saveYearEndDecisionsSchema = enrollmentPlanHashSchema.extend({
  decisions: z.array(yearEndDecisionSchema).max(5000),
});

const actorUserId = (req: AuthRequest): string | null => req.user?.userId ?? null;

const sendError = (res: Response, error: unknown) => {
  if (error instanceof TermRolloverReadinessError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.errors,
    });
  }
  if (error instanceof TermRolloverError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  if (error instanceof TermRolloverEnrollmentError) {
    return res.status(error.statusCode).json({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  console.error('Term rollover preparation error:', error);
  return res.status(500).json({ error: 'Term rollover preparation operation failed' });
};

export const createRollover = async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const input = createRolloverSchema.parse(req.body);
    const result = await createTermRollover({ ...input, actorUserId: actor });
    return res.status(result.reused ? 200 : 201).json(result);
  } catch (error) {
    return sendError(res, error);
  }
};

export const listRollovers = async (_req: Request, res: Response) => {
  try {
    return res.json(await listTermRollovers());
  } catch (error) {
    return sendError(res, error);
  }
};

export const getRollover = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    return res.json(await getTermRollover(rolloverId));
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateRolloverConfiguration = async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    const { expectedVersion, ...configuration } = updateConfigurationSchema.parse(req.body);
    await updateTermRolloverConfiguration(rolloverId, configuration, actor, expectedVersion);
    return res.json(await getTermRollover(rolloverId));
  } catch (error) {
    return sendError(res, error);
  }
};

export const dryRunRollover = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    return res.json(await planTermRollover(rolloverId));
  } catch (error) {
    return sendError(res, error);
  }
};

export const prepareRollover = async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    const { expectedInputHash } = prepareSchema.parse(req.body);
    return res.json(await prepareTermRollover(rolloverId, expectedInputHash, actor));
  } catch (error) {
    return sendError(res, error);
  }
};

export const validateRollover = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    return res.json(await validateTermRolloverPreparation(rolloverId));
  } catch (error) {
    return sendError(res, error);
  }
};

export const getRolloverEnrollmentPlan = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    return res.json(await getTermRolloverEnrollmentPlan(rolloverId));
  } catch (error) {
    return sendError(res, error);
  }
};

export const saveRolloverEnrollmentDecisions = async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    const { decisions, expectedInputHash } = saveYearEndDecisionsSchema.parse(req.body);
    return res.json(await saveYearEndTransitionDecisions(
      rolloverId,
      decisions,
      expectedInputHash,
      actor,
    ));
  } catch (error) {
    return sendError(res, error);
  }
};

export const stageRolloverEnrollments = async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    const { expectedInputHash } = enrollmentPlanHashSchema.parse(req.body);
    return res.json(await stageTermRolloverEnrollments(rolloverId, expectedInputHash, actor));
  } catch (error) {
    return sendError(res, error);
  }
};

export const validateRolloverEnrollments = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    return res.json(await validateTermRolloverEnrollments(rolloverId));
  } catch (error) {
    return sendError(res, error);
  }
};

export const listRolloverTasks = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    const rollover = await getTermRollover(rolloverId);
    return res.json(rollover.tasks);
  } catch (error) {
    return sendError(res, error);
  }
};

export const listRolloverEvents = async (req: Request, res: Response) => {
  try {
    const rolloverId = rolloverIdSchema.parse(req.params.id);
    const rollover = await getTermRollover(rolloverId);
    return res.json(rollover.events);
  } catch (error) {
    return sendError(res, error);
  }
};

const readinessFingerprintSchema = z.object({
  expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const warningAcknowledgementsSchema = readinessFingerprintSchema.extend({
  acknowledgements: z.array(z.object({
    warningId: z.string().regex(/^[a-f0-9]{64}$/),
    reason: z.string().trim().min(1).max(500),
  }).strict()).max(10000),
});

export const preflightRollover = async (req: Request, res: Response) => {
  try {
    return res.json(await preflightTermRollover(rolloverIdSchema.parse(req.params.id), actorUserId(req as AuthRequest)));
  } catch (error) { return sendError(res, error); }
};

export const acknowledgeRolloverWarnings = async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const input = warningAcknowledgementsSchema.parse(req.body);
    return res.json(await acknowledgeTermRolloverWarnings(rolloverIdSchema.parse(req.params.id), input.expectedFingerprint, input.acknowledgements, actor));
  } catch (error) { return sendError(res, error); }
};

const readinessEvidenceHandler = (operation: typeof backupTermRollover) => async (req: Request, res: Response) => {
  try {
    const actor = actorUserId(req as AuthRequest);
    if (!actor) return res.status(401).json({ error: 'Authentication is required' });
    const input = readinessFingerprintSchema.parse(req.body);
    return res.json(await operation(rolloverIdSchema.parse(req.params.id), input.expectedFingerprint, actor));
  } catch (error) { return sendError(res, error); }
};
export const createRolloverBackup = readinessEvidenceHandler(backupTermRollover);
export const verifyRolloverBackup = readinessEvidenceHandler(verifyTermRolloverBackup);
export const approveRollover = readinessEvidenceHandler(approveTermRollover);
