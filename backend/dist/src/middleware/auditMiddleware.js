"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditLogs = exports.logAuditEvent = exports.auditLog = void 0;
const prisma_1 = require("../utils/prisma");
/**
 * Middleware factory for audit logging
 * Logs user actions with before/after state for accountability
 */
const auditLog = (options) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        // Store original json method to capture response
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            var _a, _b, _c, _d, _e;
            // Only log successful operations
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const logEntry = {
                    userId: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || null,
                    action: options.action,
                    entityType: options.entityType,
                    entityId: ((_b = options.getEntityId) === null || _b === void 0 ? void 0 : _b.call(options, req)) || ((_c = req.params) === null || _c === void 0 ? void 0 : _c.id) || (body === null || body === void 0 ? void 0 : body.id) || null,
                    oldValue: ((_d = options.getOldValue) === null || _d === void 0 ? void 0 : _d.call(options, req)) || null,
                    newValue: ((_e = options.getNewValue) === null || _e === void 0 ? void 0 : _e.call(options, req)) || (options.action !== 'DELETE' ? sanitizeBody(req.body) : null),
                    ipAddress: req.ip || req.socket.remoteAddress || null,
                    userAgent: req.get('User-Agent') || null,
                };
                // Fire and forget - don't block response
                prisma_1.prisma.auditLog.create({ data: logEntry }).catch((err) => {
                    console.error('Audit log error:', err.message);
                });
            }
            return originalJson(body);
        };
        next();
    });
};
exports.auditLog = auditLog;
/**
 * Simple audit logger - call directly in controllers
 */
const logAuditEvent = (data) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield prisma_1.prisma.auditLog.create({
            data: {
                userId: data.userId || null,
                action: data.action,
                entityType: data.entityType,
                entityId: data.entityId || null,
                oldValue: data.oldValue || null,
                newValue: data.newValue || null,
                ipAddress: data.ipAddress || null,
                userAgent: data.userAgent || null,
            },
        });
    }
    catch (err) {
        console.error('Audit log error:', err.message);
    }
});
exports.logAuditEvent = logAuditEvent;
// Remove sensitive fields from logged data
function sanitizeBody(body) {
    if (!body)
        return null;
    const sanitized = Object.assign({}, body);
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
const getAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { entityType, entityId, userId, action, startDate, endDate, page = '1', limit = '50' } = req.query;
        const where = {};
        if (entityType)
            where.entityType = entityType;
        if (entityId)
            where.entityId = entityId;
        if (userId)
            where.userId = userId;
        if (action)
            where.action = action;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [logs, total] = yield Promise.all([
            prisma_1.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parseInt(limit),
            }),
            prisma_1.prisma.auditLog.count({ where }),
        ]);
        res.json({
            logs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
            },
        });
    }
    catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ error: 'Failed to fetch audit logs' });
    }
});
exports.getAuditLogs = getAuditLogs;
