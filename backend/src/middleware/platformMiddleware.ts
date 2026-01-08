import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

export interface PlatformAuthRequest extends Request {
    platformUser?: {
        userId: string;
        email: string;
        role: string;
        isPlatformUser: boolean;
    };
}

/**
 * Authenticate platform admin users
 */
export const authenticatePlatformUser: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
        if (err) {
            res.status(403).json({ error: 'Invalid or expired token' });
            return;
        }

        // Check if this is a platform user
        if (!decoded.isPlatformUser) {
            res.status(403).json({ error: 'Platform access denied' });
            return;
        }

        (req as PlatformAuthRequest).platformUser = decoded;
        next();
    });
};

/**
 * Authorize specific platform roles
 */
export const authorizePlatformRole = (roles: string[]): RequestHandler => {
    return (req: Request, res: Response, next: NextFunction) => {
        const platformReq = req as PlatformAuthRequest;

        if (!platformReq.platformUser || !roles.includes(platformReq.platformUser.role)) {
            res.status(403).json({ error: 'Insufficient platform permissions' });
            return;
        }

        next();
    };
};
