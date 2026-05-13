import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import prisma from '../utils/prisma';

/**
 * Middleware to enforce tenant usage limits (maxUsers, maxStudents).
 * Attach to routes that create users or students.
 */
export const enforceUserLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxUsers: true },
    });
    if (!tenant) return next();

    const count = await prisma.user.count({ where: { tenantId } });
    if (count >= tenant.maxUsers) {
      return res.status(403).json({
        error: 'User limit reached',
        message: `Your plan allows a maximum of ${tenant.maxUsers} users. Please upgrade to add more.`,
      });
    }
    next();
  } catch {
    next();
  }
};

export const enforceStudentLimit = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next();

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { maxStudents: true },
    });
    if (!tenant) return next();

    const count = await prisma.student.count({ where: { tenantId } });
    if (count >= tenant.maxStudents) {
      return res.status(403).json({
        error: 'Student limit reached',
        message: `Your plan allows a maximum of ${tenant.maxStudents} students. Please upgrade to add more.`,
      });
    }
    next();
  } catch {
    next();
  }
};
