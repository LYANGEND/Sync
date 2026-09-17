import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  SchoolArchiveError,
  createSchoolArchive,
  getDataManagementOverview,
  importSchoolArchive,
  logSchoolArchiveAudit,
  previewSchoolArchive,
} from '../services/schoolDataArchiveService';

function sendArchiveError(res: Response, error: unknown, fallbackMessage: string): Response {
  if (error instanceof SchoolArchiveError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  console.error(fallbackMessage, error);
  return res.status(500).json({ error: fallbackMessage });
}

export const getDataManagementSummary = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Authentication is required.' });
    const overview = await getDataManagementOverview(req.user.userId);
    res.json(overview);
  } catch (error) {
    return sendArchiveError(res, error, 'Failed to load the school data summary.');
  }
};

export const exportSchoolData = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.userId) return res.status(401).json({ error: 'Authentication is required.' });
    const archive = await createSchoolArchive(req.user.userId);

    await logSchoolArchiveAudit({
      actorUserId: req.user.userId,
      action: 'SCHOOL_DATA_EXPORT',
      entityId: archive.manifest.checksum.slice(0, 16),
      details: {
        checksum: archive.manifest.checksum,
        filename: archive.filename,
        schoolName: archive.manifest.school.name,
        totalRecords: archive.manifest.totalRecords,
        modelCount: archive.manifest.modelCount,
        createdAt: archive.manifest.createdAt,
      },
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get('User-Agent') || null,
    });

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Archive-Checksum', archive.manifest.checksum);
    res.setHeader('X-Archive-Record-Count', String(archive.manifest.totalRecords));
    res.setHeader('X-Archive-Model-Count', String(archive.manifest.modelCount));
    res.setHeader('Content-Length', String(archive.buffer.length));
    return res.send(archive.buffer);
  } catch (error) {
    return sendArchiveError(res, error, 'Failed to export school data.');
  }
};

export const previewSchoolDataImport = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Select a Sync school data archive to review.' });
    }

    const actorUserId = (req as AuthRequest).user?.userId;
    if (!actorUserId) return res.status(401).json({ error: 'Authentication is required.' });
    const preview = await previewSchoolArchive(req.file.buffer, actorUserId);
    return res.json(preview);
  } catch (error) {
    return sendArchiveError(res, error, 'Failed to review the school data archive.');
  }
};

export const importSchoolData = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Select a Sync school data archive to import.' });
    }
    if (req.body.confirmation !== 'IMPORT') {
      return res.status(400).json({ error: 'Type IMPORT to confirm this school data merge.' });
    }
    if (typeof req.body.expectedChecksum !== 'string' || req.body.expectedChecksum.length !== 64) {
      return res.status(400).json({ error: 'Review the archive again before importing it.' });
    }
    if (!req.user?.userId) {
      return res.status(401).json({ error: 'Authentication is required.' });
    }

    const result = await importSchoolArchive(req.file.buffer, {
      expectedChecksum: req.body.expectedChecksum,
      actorUserId: req.user.userId,
    });

    await logSchoolArchiveAudit({
      actorUserId: req.user.userId,
      action: 'SCHOOL_DATA_IMPORT',
      entityId: result.checksum.slice(0, 16),
      details: {
        checksum: result.checksum,
        sourceSchoolName: result.sourceSchoolName,
        totalProcessed: result.totalProcessed,
        created: result.created,
        updated: result.updated,
        linked: result.linked,
        disabledUsers: result.disabledUsers,
      },
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get('User-Agent') || null,
    });

    return res.json({
      message: `Imported ${result.totalProcessed.toLocaleString()} records successfully.`,
      ...result,
    });
  } catch (error) {
    return sendArchiveError(res, error, 'Failed to import school data. No partial import was kept.');
  }
};
