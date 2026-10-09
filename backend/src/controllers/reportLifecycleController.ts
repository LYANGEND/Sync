import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  AcademicScopeError,
  ensureAcademicClassAccess,
  ensureStudentRecordAccess,
} from '../utils/academicScope';
import { prisma } from '../utils/prisma';
import { TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  finalizeClassReports,
  finalizeStudentReport,
  getClassReportReadiness,
  getReportVersions,
  getReportVersionSnapshot,
  getStudentReportReadiness,
  publishClassReports,
  publishStudentReport,
  ReportLifecycleError,
} from '../services/reportFinalizationService';
import {
  applyReportAmendment,
  approveReportAmendment,
  createReportAmendment,
  listReportAmendments,
  rejectReportAmendment,
} from '../services/reportAmendmentService';

const studentTermSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
});

const classTermSchema = z.object({
  classId: z.string().uuid(),
  termId: z.string().uuid(),
});

const amendmentSchema = z.object({
  termId: z.string().uuid(),
  reason: z.string().trim().min(10).max(2000),
  items: z.array(z.object({
    entityType: z.enum(['TERM_RESULT', 'STUDENT_TERM_REPORT']),
    entityId: z.string().uuid(),
    fieldName: z.string().trim().min(1).max(100),
    afterValue: z.union([z.string(), z.number(), z.null()]),
  })).min(1).max(50),
});

const requireActor = (req: AuthRequest) => {
  if (!req.user?.userId) {
    throw new ReportLifecycleError('UNAUTHORIZED', 'Unauthorized', 401);
  }
  return req.user.userId;
};

const sendError = (res: Response, error: unknown) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: error.errors });
  }
  if (error instanceof AcademicScopeError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error instanceof ReportLifecycleError) {
    return res.status(error.status).json({
      error: error.message,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  }
  if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
  console.error('Report lifecycle error:', error);
  return res.status(500).json({ error: 'Report lifecycle operation failed' });
};

export const getStudentReadiness = async (req: Request, res: Response) => {
  try {
    const input = studentTermSchema.parse(req.query);
    await ensureStudentRecordAccess(req as AuthRequest, input.studentId, {
      academicTermId: input.termId,
    });
    res.json(await getStudentReportReadiness(input.studentId, input.termId));
  } catch (error) {
    sendError(res, error);
  }
};

export const getClassReadiness = async (req: Request, res: Response) => {
  try {
    const input = classTermSchema.parse(req.query);
    await ensureAcademicClassAccess(req as AuthRequest, input.classId, {
      academicTermId: input.termId,
    });
    res.json(await getClassReportReadiness(input.classId, input.termId));
  } catch (error) {
    sendError(res, error);
  }
};

export const finalizeReport = async (req: Request, res: Response) => {
  try {
    const input = studentTermSchema.parse(req.body);
    await ensureStudentRecordAccess(req as AuthRequest, input.studentId, {
      academicTermId: input.termId,
    });
    const result = await finalizeStudentReport(
      input.studentId,
      input.termId,
      requireActor(req as AuthRequest),
    );
    res.json({
      reportId: result.report.id,
      status: result.report.status,
      currentVersion: result.report.currentVersion,
      changed: result.changed,
    });
  } catch (error) {
    sendError(res, error);
  }
};

export const publishReport = async (req: Request, res: Response) => {
  try {
    const input = studentTermSchema.parse(req.body);
    await ensureStudentRecordAccess(req as AuthRequest, input.studentId, {
      academicTermId: input.termId,
    });
    const result = await publishStudentReport(
      input.studentId,
      input.termId,
      requireActor(req as AuthRequest),
    );
    res.json({
      reportId: result.report.id,
      status: result.report.status,
      currentVersion: result.report.currentVersion,
      changed: result.changed,
    });
  } catch (error) {
    sendError(res, error);
  }
};

export const finalizeReportsBulk = async (req: Request, res: Response) => {
  try {
    const input = classTermSchema.parse(req.body);
    await ensureAcademicClassAccess(req as AuthRequest, input.classId, {
      academicTermId: input.termId,
    });
    res.json(await finalizeClassReports(
      input.classId,
      input.termId,
      requireActor(req as AuthRequest),
    ));
  } catch (error) {
    sendError(res, error);
  }
};

export const publishReportsBulk = async (req: Request, res: Response) => {
  try {
    const input = classTermSchema.parse(req.body);
    await ensureAcademicClassAccess(req as AuthRequest, input.classId, {
      academicTermId: input.termId,
    });
    res.json(await publishClassReports(
      input.classId,
      input.termId,
      requireActor(req as AuthRequest),
    ));
  } catch (error) {
    sendError(res, error);
  }
};

const ensureReportAccess = async (req: AuthRequest, reportId: string) => {
  const report = await prisma.studentTermReport.findUnique({
    where: { id: reportId },
    select: { studentId: true, termId: true },
  });
  if (!report) throw new ReportLifecycleError('REPORT_NOT_FOUND', 'Report not found', 404);
  await ensureStudentRecordAccess(req, report.studentId, { academicTermId: report.termId });
  return report;
};

export const listVersions = async (req: Request, res: Response) => {
  try {
    await ensureReportAccess(req as AuthRequest, req.params.reportId);
    res.json(await getReportVersions(req.params.reportId));
  } catch (error) {
    sendError(res, error);
  }
};

export const getVersion = async (req: Request, res: Response) => {
  try {
    await ensureReportAccess(req as AuthRequest, req.params.reportId);
    const version = z.coerce.number().int().positive().parse(req.params.version);
    const snapshot = await getReportVersionSnapshot(req.params.reportId, version);
    if (!snapshot) return res.status(404).json({ error: 'Report version not found' });
    res.json(snapshot);
  } catch (error) {
    sendError(res, error);
  }
};

const ensureAmendmentItemAccess = async (
  req: AuthRequest,
  item: z.infer<typeof amendmentSchema>['items'][number],
) => {
  if (item.entityType === 'TERM_RESULT') {
    const result = await prisma.termResult.findUnique({
      where: { id: item.entityId },
      select: { classId: true, termId: true },
    });
    if (!result) throw new ReportLifecycleError('AMENDMENT_TARGET_NOT_FOUND', 'Term result not found', 404);
    await ensureAcademicClassAccess(req, result.classId, { academicTermId: result.termId });
    return;
  }
  const report = await prisma.studentTermReport.findUnique({
    where: { id: item.entityId },
    select: { classId: true, termId: true },
  });
  if (!report) throw new ReportLifecycleError('AMENDMENT_TARGET_NOT_FOUND', 'Student report not found', 404);
  await ensureAcademicClassAccess(req, report.classId, { academicTermId: report.termId });
};

export const requestAmendment = async (req: Request, res: Response) => {
  try {
    const input = amendmentSchema.parse(req.body);
    for (const item of input.items) {
      await ensureAmendmentItemAccess(req as AuthRequest, item);
    }
    const amendment = await createReportAmendment(
      input.termId,
      input.reason,
      requireActor(req as AuthRequest),
      input.items,
    );
    res.status(201).json(amendment);
  } catch (error) {
    sendError(res, error);
  }
};

export const listAmendments = async (req: Request, res: Response) => {
  try {
    const termId = z.string().uuid().parse(req.query.termId);
    res.json(await listReportAmendments(termId));
  } catch (error) {
    sendError(res, error);
  }
};

export const approveAmendment = async (req: Request, res: Response) => {
  try {
    res.json(await approveReportAmendment(
      z.string().uuid().parse(req.params.id),
      requireActor(req as AuthRequest),
    ));
  } catch (error) {
    sendError(res, error);
  }
};

export const rejectAmendment = async (req: Request, res: Response) => {
  try {
    res.json(await rejectReportAmendment(
      z.string().uuid().parse(req.params.id),
      requireActor(req as AuthRequest),
    ));
  } catch (error) {
    sendError(res, error);
  }
};

export const applyAmendment = async (req: Request, res: Response) => {
  try {
    res.json(await applyReportAmendment(
      z.string().uuid().parse(req.params.id),
      requireActor(req as AuthRequest),
    ));
  } catch (error) {
    sendError(res, error);
  }
};
