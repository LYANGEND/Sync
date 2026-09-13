import { promises as fs } from 'fs';
import { NextFunction, Request, Response, Router } from 'express';
import {
  createTenantFileReference,
  resolveLegacyTenantFilePath,
  resolveTenantFilePath,
  verifyTenantFileSignature,
} from '../services/tenantFileService';

const router = Router();

router.get('/:tenantId/:category/:filename', async (req: Request, res: Response, next: NextFunction) => {
  let reference;
  try {
    reference = createTenantFileReference(
      req.params.tenantId,
      req.params.category,
      req.params.filename,
    );
  } catch {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  const verification = verifyTenantFileSignature(
    reference,
    req.query.expires,
    req.query.signature,
  );
  if (!verification.valid) {
    const status = verification.reason === 'missing' ? 401 : 403;
    return res.status(status).json({
      error: verification.reason === 'expired'
        ? 'File access link has expired'
        : 'Valid signed file access is required',
    });
  }

  let filePath = resolveTenantFilePath(reference);
  try {
    let file;
    try {
      file = await fs.stat(filePath);
    } catch (error: any) {
      if (error?.code !== 'ENOENT') throw error;
      filePath = resolveLegacyTenantFilePath(reference);
      file = await fs.stat(filePath);
    }
    if (!file.isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    return next(error);
  }

  const remainingSeconds = Math.max(0, verification.expiresAt - Math.floor(Date.now() / 1000));
  res.set({
    'Cache-Control': `private, max-age=${remainingSeconds}`,
    'Content-Disposition': `inline; filename="${reference.filename}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  return res.sendFile(filePath, error => {
    if (error && !res.headersSent) next(error);
  });
});

export default router;
