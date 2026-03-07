"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiLimiter = exports.authLimiter = exports.generalLimiter = exports.createRateLimiter = void 0;
const rateLimitStore = new Map();
// Clean up expired entries every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
        if (now > entry.resetTime) {
            rateLimitStore.delete(key);
        }
    }
}, 5 * 60 * 1000);
const createRateLimiter = (options) => {
    const { windowMs, maxRequests, message, keyGenerator } = options;
    return (req, res, next) => {
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
exports.createRateLimiter = createRateLimiter;
// Pre-configured rate limiters
exports.generalLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000, // 1000 requests per 15 min per IP
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
exports.authLimiter = (0, exports.createRateLimiter)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 20, // 20 login attempts per 15 min per email+IP
    message: 'Too many login attempts. Please try again after 15 minutes.',
    keyGenerator: (req) => {
        var _a;
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const email = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.email) || 'unknown').toLowerCase();
        return `auth:${email}:${ip}`;
    },
});
// AI limiter: keyed on authenticated userId (falls back to IP)
// More generous than general limiter since AI calls are intentional
const aiLimiter = (req, res, next) => {
    var _a;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || req.ip || 'unknown';
    const key = `ai:${userId}`;
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 30; // 30 AI requests per minute per user
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
exports.aiLimiter = aiLimiter;
