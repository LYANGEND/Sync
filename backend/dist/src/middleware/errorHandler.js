"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = exports.errorHandler = void 0;
// Global error handler middleware
const errorHandler = (err, req, res, next) => {
    var _a;
    console.error('Unhandled error:', {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString(),
    });
    // Prisma errors
    if (err.code === 'P2002') {
        return res.status(409).json({
            error: 'A record with this data already exists.',
            field: (_a = err.meta) === null || _a === void 0 ? void 0 : _a.target,
        });
    }
    if (err.code === 'P2025') {
        return res.status(404).json({
            error: 'Record not found.',
        });
    }
    if (err.code === 'P2003') {
        return res.status(400).json({
            error: 'Related record not found. Please check your references.',
        });
    }
    // Zod validation errors
    if (err.name === 'ZodError') {
        return res.status(400).json({
            error: 'Validation failed',
            details: err.errors,
        });
    }
    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
    }
    // Multer errors (file upload)
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large' });
    }
    // Default error
    const statusCode = err.statusCode || err.status || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message || 'Internal server error';
    res.status(statusCode).json({ error: message });
};
exports.errorHandler = errorHandler;
// 404 handler for unknown routes
const notFoundHandler = (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        path: req.originalUrl,
        method: req.method,
    });
};
exports.notFoundHandler = notFoundHandler;
