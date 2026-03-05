import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from './authMiddleware';

interface AuditOptions {
  action: string;
  entityType: string;
  getEntityId?: (req: Request) => string | undefined;
  getOldValue?: (req: Request) => any;
  getNewValue?: (req: Request) => any;
}

/**
 * Middleware factory for audit logging
 * Logs user actions with before/after state for accountability
 */
export const auditLog = (options: AuditOptions) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Store original json method to capture response
    const originalJson = res.json.bind(res);

    res.json = (body: any) => {
      // Only log successful operations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const logEntry = {
          userId: req.user?.userId || null,
          action: options.action,
          entityType: options.entityType,
          entityId: options.getEntityId?.(req) || req.params?.id || body?.id || null,
          oldValue: options.getOldValue?.(req) || null,
          newValue: options.getNewValue?.(req) || (options.action !== 'DELETE' ? sanitizeBody(req.body) : null),
          ipAddress: req.ip || req.socket.remoteAddress || null,
          userAgent: req.get('User-Agent') || null,
        };

        // Fire and forget - don't block response
        (prisma as any).auditLog.create({ data: logEntry as any }).catch((err: Error) => {
          console.error('Audit log error:', err.message);
        });
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Simple audit logger - call directly in controllers
 */
export const logAuditEvent = async (data: {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
}) => {
  try {
    await (prisma as any).auditLog.create({
      data: {
        userId: data.userId || null,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId || null,
        oldValue: data.oldValue || null,
        newValue: data.newValue || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
      } as any,
    });
  } catch (err: any) {
    console.error('Audit log error:', err.message);
  }
};

// Remove sensitive fields from logged data
function sanitizeBody(body: any): any {
  if (!body) return null;
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'passwordHash', 'token', 'apiKey', 'smtpPassword', 'smsApiSecret', 'aiApiKey'];
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }
  return sanitized;
}

/**
 * Get audit logs with filtering
 */
export const getAuditLogs = async (req: AuthRequest, res: Response) => {
  try {
    const { entityType, entityId, userId, action, startDate, endDate, page = '1', limit = '50' } = req.query;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [logs, total] = await Promise.all([
      (prisma as any).auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      (prisma as any).auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};
