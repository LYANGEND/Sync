import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;    // Custom error message
}

export const createRateLimiter = (options: RateLimitOptions & { keyGenerator?: (req: Request) => string }) => {
  const { windowMs, maxRequests, message, keyGenerator } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = keyGenerator ? keyGenerator(req) : `${req.baseUrl || ''}:${ip}`;
    const now = Date.now();

    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message || 'Too many requests. Please try again later.',
        retryAfter,
      });
    }

    entry.count++;
    next();
  };
};

// Pre-configured rate limiters
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000,         // 1000 requests per 15 min per IP
  message: 'Too many requests from this IP, please try again after 15 minutes',
});

export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 20,           // 20 login attempts per 15 min per email+IP
  message: 'Too many login attempts. Please try again after 15 minutes.',
  keyGenerator: (req: Request) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const email = (req.body?.email || 'unknown').toLowerCase();
    return `auth:${email}:${ip}`;
  },
});

// AI limiter: keyed on authenticated userId (falls back to IP)
// More generous than general limiter since AI calls are intentional
export const aiLimiter = (req: Request, res: Response, next: NextFunction) => {
  const userId = (req as any).user?.userId || req.ip || 'unknown';
  const key = `ai:${userId}`;
  const windowMs = 60 * 1000;  // 1 minute
  const maxRequests = 30;      // 30 AI requests per minute per user
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return next();
  }

  if (entry.count >= maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: 'AI rate limit exceeded. Please wait a moment.',
      retryAfter,
    });
  }

  entry.count++;
  next();
};
