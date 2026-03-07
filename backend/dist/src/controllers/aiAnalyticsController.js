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
exports.getAdoptionMetrics = exports.getFeatureBreakdown = exports.getUsageSummary = void 0;
const prisma_1 = require("../utils/prisma");
// ==========================================
// AI USAGE ANALYTICS
// ==========================================
/**
 * GET /api/v1/ai-analytics/usage/summary
 * Get overall AI usage summary — adoption, cost, popular features
 */
const getUsageSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const days = parseInt(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);
        const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
            ? { branchId: user.branchId } : {};
        // Total interactions
        const [totalInteractions, successfulCalls, failedCalls] = yield Promise.all([
            prisma_1.prisma.aIUsageLog.count({ where: Object.assign({ createdAt: { gte: since } }, branchFilter) }),
            prisma_1.prisma.aIUsageLog.count({ where: Object.assign({ createdAt: { gte: since }, success: true }, branchFilter) }),
            prisma_1.prisma.aIUsageLog.count({ where: Object.assign({ createdAt: { gte: since }, success: false }, branchFilter) }),
        ]);
        // Total tokens used
        const tokenAgg = yield prisma_1.prisma.aIUsageLog.aggregate({
            where: Object.assign({ createdAt: { gte: since } }, branchFilter),
            _sum: { tokensUsed: true },
            _avg: { tokensUsed: true, responseTimeMs: true },
        });
        // By feature
        const byFeature = yield prisma_1.prisma.aIUsageLog.groupBy({
            by: ['feature'],
            where: Object.assign({ createdAt: { gte: since } }, branchFilter),
            _count: true,
            _sum: { tokensUsed: true },
        });
        // By action
        const byAction = yield prisma_1.prisma.aIUsageLog.groupBy({
            by: ['action'],
            where: Object.assign({ createdAt: { gte: since } }, branchFilter),
            _count: true,
        });
        // Unique users
        const uniqueUsers = yield prisma_1.prisma.aIUsageLog.findMany({
            where: Object.assign({ createdAt: { gte: since } }, branchFilter),
            select: { userId: true },
            distinct: ['userId'],
        });
        // Daily usage trend (last N days)
        const dailyUsage = yield prisma_1.prisma.$queryRawUnsafe(`SELECT DATE("createdAt") as day, COUNT(*) as count 
       FROM "ai_usage_logs" 
       WHERE "createdAt" >= $1 
       GROUP BY DATE("createdAt") 
       ORDER BY day ASC`, since);
        // Top users
        const topUsers = yield prisma_1.prisma.aIUsageLog.groupBy({
            by: ['userId'],
            where: Object.assign({ createdAt: { gte: since } }, branchFilter),
            _count: true,
            _sum: { tokensUsed: true },
            orderBy: { _count: { feature: 'desc' } },
            take: 10,
        });
        // Get user details for top users
        const userIds = topUsers.map(u => u.userId);
        const users = yield prisma_1.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true, role: true },
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        // Estimate cost (rough: $0.002 per 1K tokens for GPT-4o-mini)
        const totalTokens = tokenAgg._sum.tokensUsed || 0;
        const estimatedCostUSD = (totalTokens / 1000) * 0.002;
        res.json({
            period: { days, since: since.toISOString() },
            overview: {
                totalInteractions,
                successfulCalls,
                failedCalls,
                successRate: totalInteractions > 0 ? Math.round((successfulCalls / totalInteractions) * 100) : 0,
                uniqueUsers: uniqueUsers.length,
                totalTokens,
                avgTokensPerCall: Math.round(tokenAgg._avg.tokensUsed || 0),
                avgResponseTimeMs: Math.round(tokenAgg._avg.responseTimeMs || 0),
                estimatedCostUSD: Math.round(estimatedCostUSD * 100) / 100,
            },
            byFeature: byFeature.map(f => ({
                feature: f.feature,
                count: f._count,
                tokens: f._sum.tokensUsed || 0,
            })),
            byAction: byAction.map(a => ({
                action: a.action,
                count: a._count,
            })),
            dailyTrend: dailyUsage.map(d => ({
                date: d.day,
                count: Number(d.count),
            })),
            topUsers: topUsers.map(u => {
                var _a, _b;
                return ({
                    userId: u.userId,
                    name: ((_a = userMap.get(u.userId)) === null || _a === void 0 ? void 0 : _a.fullName) || 'Unknown',
                    role: ((_b = userMap.get(u.userId)) === null || _b === void 0 ? void 0 : _b.role) || 'Unknown',
                    interactions: u._count,
                    tokens: u._sum.tokensUsed || 0,
                });
            }),
        });
    }
    catch (error) {
        console.error('AI usage summary error:', error);
        res.status(500).json({ error: 'Failed to load AI usage analytics' });
    }
});
exports.getUsageSummary = getUsageSummary;
/**
 * GET /api/v1/ai-analytics/usage/feature-breakdown
 * Detailed breakdown of a specific feature's usage
 */
const getFeatureBreakdown = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { feature } = req.params;
        const days = parseInt(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);
        const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
            ? { branchId: user.branchId } : {};
        const [total, byAction, avgResponse, recentErrors] = yield Promise.all([
            prisma_1.prisma.aIUsageLog.count({
                where: Object.assign({ feature, createdAt: { gte: since } }, branchFilter),
            }),
            prisma_1.prisma.aIUsageLog.groupBy({
                by: ['action'],
                where: Object.assign({ feature, createdAt: { gte: since } }, branchFilter),
                _count: true,
                _avg: { responseTimeMs: true },
            }),
            prisma_1.prisma.aIUsageLog.aggregate({
                where: Object.assign({ feature, createdAt: { gte: since }, success: true }, branchFilter),
                _avg: { responseTimeMs: true, tokensUsed: true },
            }),
            prisma_1.prisma.aIUsageLog.findMany({
                where: Object.assign({ feature, success: false, createdAt: { gte: since } }, branchFilter),
                orderBy: { createdAt: 'desc' },
                take: 10,
                select: { errorMessage: true, createdAt: true, action: true },
            }),
        ]);
        res.json({
            feature,
            period: { days },
            total,
            byAction: byAction.map(a => ({
                action: a.action,
                count: a._count,
                avgResponseMs: Math.round(a._avg.responseTimeMs || 0),
            })),
            avgResponseMs: Math.round(avgResponse._avg.responseTimeMs || 0),
            avgTokens: Math.round(avgResponse._avg.tokensUsed || 0),
            recentErrors,
        });
    }
    catch (error) {
        console.error('Feature breakdown error:', error);
        res.status(500).json({ error: 'Failed to load feature breakdown' });
    }
});
exports.getFeatureBreakdown = getFeatureBreakdown;
// ==========================================
// AI ADOPTION METRICS (for ROI proof)
// ==========================================
/**
 * GET /api/v1/ai-analytics/adoption
 * Measure AI adoption across the school — who's using it, how often, what value
 */
const getAdoptionMetrics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
            ? { branchId: user.branchId } : {};
        // Total eligible users (teachers + admins + bursars)
        const totalEligibleUsers = yield prisma_1.prisma.user.count({
            where: Object.assign({ role: { in: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'BRANCH_MANAGER'] } }, (branchFilter.branchId ? { branchId: branchFilter.branchId } : {})),
        });
        // Users who used AI in last 7 days, 30 days, all time
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const [weeklyActive, monthlyActive, allTimeActive] = yield Promise.all([
            prisma_1.prisma.aIUsageLog.findMany({
                where: Object.assign({ createdAt: { gte: sevenDaysAgo } }, branchFilter),
                select: { userId: true },
                distinct: ['userId'],
            }),
            prisma_1.prisma.aIUsageLog.findMany({
                where: Object.assign({ createdAt: { gte: thirtyDaysAgo } }, branchFilter),
                select: { userId: true },
                distinct: ['userId'],
            }),
            prisma_1.prisma.aIUsageLog.findMany({
                where: Object.assign({}, branchFilter),
                select: { userId: true },
                distinct: ['userId'],
            }),
        ]);
        // AI conversations total
        const totalConversations = yield prisma_1.prisma.aIConversation.count();
        const totalMessages = yield prisma_1.prisma.aIMessage.count();
        // Average interactions per active user (last 30 days)
        const monthlyTotal = yield prisma_1.prisma.aIUsageLog.count({
            where: Object.assign({ createdAt: { gte: thirtyDaysAgo } }, branchFilter),
        });
        // Time saved estimate: avg 5 min per AI interaction (lesson plan, grading, etc.)
        const estimatedTimeSavedMinutes = monthlyTotal * 5;
        const estimatedTimeSavedHours = Math.round(estimatedTimeSavedMinutes / 60);
        res.json({
            totalEligibleUsers,
            weeklyActiveUsers: weeklyActive.length,
            monthlyActiveUsers: monthlyActive.length,
            allTimeUsers: allTimeActive.length,
            adoptionRate: totalEligibleUsers > 0
                ? Math.round((monthlyActive.length / totalEligibleUsers) * 100) : 0,
            totalConversations,
            totalMessages,
            monthlyInteractions: monthlyTotal,
            avgInteractionsPerUser: monthlyActive.length > 0
                ? Math.round(monthlyTotal / monthlyActive.length) : 0,
            estimatedTimeSaved: {
                minutes: estimatedTimeSavedMinutes,
                hours: estimatedTimeSavedHours,
                description: `~${estimatedTimeSavedHours} hours saved this month across all staff`,
            },
        });
    }
    catch (error) {
        console.error('Adoption metrics error:', error);
        res.status(500).json({ error: 'Failed to load adoption metrics' });
    }
});
exports.getAdoptionMetrics = getAdoptionMetrics;
