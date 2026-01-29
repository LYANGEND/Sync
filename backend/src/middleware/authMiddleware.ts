import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    tenantId: string;  // Added for multi-tenancy
    role: string;
    branchId?: string;
  };
}

export const authenticateToken: RequestHandler = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    (req as AuthRequest).user = user;
    next();
  });
};

export const authorizeRole = (roles: string[]): RequestHandler => {
  return (req, res, next) => {
    const authReq = req as AuthRequest;
    if (!authReq.user || !roles.includes(authReq.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};

/**
 * Verify that the authenticated user belongs to the tenant in the request
 * This provides an extra layer of security beyond the tenant middleware
 */
export const verifyTenantAccess: RequestHandler = (req, res, next) => {
  const authReq = req as AuthRequest;
  const tenantId = req.headers['x-tenant-id'] as string || req.query.tenant as string;

  if (authReq.user && tenantId && authReq.user.tenantId !== tenantId) {
    res.status(403).json({
      error: 'Cross-tenant access denied',
      message: 'You do not have access to this school\'s data'
    });
    return;
  }

  next();
};
