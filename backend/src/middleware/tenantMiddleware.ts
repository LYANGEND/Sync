import { PrismaClient } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

const prisma = new PrismaClient();

// Extend Express Request type to include school
declare global {
  namespace Express {
    interface Request {
      school?: {
        id: string;
        slug: string;
      };
    }
  }
}

export const tenantMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Get hostname from request
    const hostname = req.hostname; // e.g., "school1.app.com" or "localhost"
    
    // 2. Extract subdomain
    // For development (localhost), we might use a header or a specific subdomain logic
    // For production: school1.app.com -> slug = "school1"
    
    let slug = '';
    
    // Check for header first (useful for testing/dev/mobile apps)
    const tenantHeader = req.headers['x-tenant-slug'];
    
    if (tenantHeader) {
      slug = tenantHeader as string;
    } else if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
      // DEV MODE fallback
      slug = 'default-school';
    } else {
      // PROD MODE: Extract from subdomain
      const parts = hostname.split('.');
      if (parts.length > 2) {
        slug = parts[0];
      } else {
        // Root domain request (e.g. app.com)
        // Don't block here, let the controller handle it if it needs tenant context
        return next();
      }
    }

    // 3. Find School by slug
    const school = await prisma.school.findUnique({
      where: { slug }
    });

    if (!school) {
      // If slug was provided but school not found, we might want to error OR just continue without context
      // For strictness, if a specific slug was requested but failed, we should probably error.
      // BUT, for the "default-school" fallback in dev, if it doesn't exist, we shouldn't crash everything.
      // Let's be permissive: if not found, just continue without req.school
      return next();
    }

    if (!school.isActive) {
      return res.status(403).json({ message: 'School account is inactive' });
    }

    // 4. Attach school to request object
    req.school = {
      id: school.id,
      slug: school.slug
    };

    next();
  } catch (error) {
    console.error('Tenant middleware error:', error);
    res.status(500).json({ message: 'Internal server error during tenant resolution' });
  }
};
