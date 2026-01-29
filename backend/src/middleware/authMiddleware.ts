import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    branchId?: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

export const authorizeRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

/**
 * Middleware to authorize branch-scoped access
 * - SUPER_ADMIN can access all branches
 * - BRANCH_MANAGER can only access their assigned branch
 * - Other roles check their branchId against the requested branch
 */
export const authorizeBranchAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  const user = req.user;
  const requestedBranchId = req.params.id || req.params.branchId;

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // SUPER_ADMIN can access all branches
  if (user.role === 'SUPER_ADMIN') {
    return next();
  }

  // BRANCH_MANAGER can only access their assigned branch
  if (user.role === 'BRANCH_MANAGER') {
    if (!user.branchId) {
      return res.status(403).json({ error: 'No branch assigned to this manager' });
    }
    if (user.branchId !== requestedBranchId) {
      return res.status(403).json({ error: 'Access denied: You can only access your assigned branch' });
    }
    return next();
  }

  // For other roles with branch assignment (BURSAR, etc.)
  if (user.branchId && user.branchId !== requestedBranchId) {
    return res.status(403).json({ error: 'Access denied: Branch mismatch' });
  }

  next();
};

/**
 * Helper to get branch filter for queries based on user role
 */
export const getBranchFilter = (user: AuthRequest['user']) => {
  if (!user) return {};

  if (user.role === 'SUPER_ADMIN') {
    return {}; // No filter, can see all
  }

  if (user.branchId) {
    return { branchId: user.branchId };
  }

  return {};
};
