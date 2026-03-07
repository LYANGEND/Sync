"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBranchFilter = exports.authorizeBranchAccess = exports.authorizeRole = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};
exports.authenticateToken = authenticateToken;
const authorizeRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};
exports.authorizeRole = authorizeRole;
/**
 * Middleware to authorize branch-scoped access
 * - SUPER_ADMIN can access all branches
 * - BRANCH_MANAGER can only access their assigned branch
 * - Other roles check their branchId against the requested branch
 */
const authorizeBranchAccess = (req, res, next) => {
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
exports.authorizeBranchAccess = authorizeBranchAccess;
/**
 * Helper to get branch filter for queries based on user role
 */
const getBranchFilter = (user) => {
    if (!user)
        return {};
    if (user.role === 'SUPER_ADMIN') {
        return {}; // No filter, can see all
    }
    if (user.branchId) {
        return { branchId: user.branchId };
    }
    return {};
};
exports.getBranchFilter = getBranchFilter;
