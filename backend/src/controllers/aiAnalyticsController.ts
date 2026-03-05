import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

// ==========================================
// AI USAGE ANALYTICS
// ==========================================

/**
 * GET /api/v1/ai-analytics/usage/summary
 * Get overall AI usage summary — adoption, cost, popular features
 */
export const getUsageSummary = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const days = parseInt(req.query.days as string) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
      ? { branchId: user.branchId } : {};

    // Total interactions
    const [totalInteractions, successfulCalls, failedCalls] = await Promise.all([
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since }, ...branchFilter } }),
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since }, success: true, ...branchFilter } }),
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since }, success: false, ...branchFilter } }),
    ]);

    // Total tokens used
    const tokenAgg = await prisma.aIUsageLog.aggregate({
      where: { createdAt: { gte: since }, ...branchFilter },
      _sum: { tokensUsed: true },
      _avg: { tokensUsed: true, responseTimeMs: true },
    });

    // By feature
    const byFeature = await prisma.aIUsageLog.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: since }, ...branchFilter },
      _count: true,
      _sum: { tokensUsed: true },
    });

    // By action
    const byAction = await prisma.aIUsageLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since }, ...branchFilter },
      _count: true,
    });

    // Unique users
    const uniqueUsers = await prisma.aIUsageLog.findMany({
      where: { createdAt: { gte: since }, ...branchFilter },
      select: { userId: true },
      distinct: ['userId'],
    });

    // Daily usage trend (last N days)
    const dailyUsage = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
      `SELECT DATE("createdAt") as day, COUNT(*) as count 
       FROM "ai_usage_logs" 
       WHERE "createdAt" >= $1 
       GROUP BY DATE("createdAt") 
       ORDER BY day ASC`,
      since
    );

    // Top users
    const topUsers = await prisma.aIUsageLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since }, ...branchFilter },
      _count: true,
      _sum: { tokensUsed: true },
      orderBy: { _count: { feature: 'desc' } },
      take: 10,
    });

    // Get user details for top users
    const userIds = topUsers.map(u => u.userId);
    const users = await prisma.user.findMany({
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
      topUsers: topUsers.map(u => ({
        userId: u.userId,
        name: userMap.get(u.userId)?.fullName || 'Unknown',
        role: userMap.get(u.userId)?.role || 'Unknown',
        interactions: u._count,
        tokens: u._sum.tokensUsed || 0,
      })),
    });
  } catch (error: any) {
    console.error('AI usage summary error:', error);
    res.status(500).json({ error: 'Failed to load AI usage analytics' });
  }
};

/**
 * GET /api/v1/ai-analytics/usage/feature-breakdown
 * Detailed breakdown of a specific feature's usage
 */
export const getFeatureBreakdown = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { feature } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
      ? { branchId: user.branchId } : {};

    const [total, byAction, avgResponse, recentErrors] = await Promise.all([
      prisma.aIUsageLog.count({
        where: { feature, createdAt: { gte: since }, ...branchFilter },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['action'],
        where: { feature, createdAt: { gte: since }, ...branchFilter },
        _count: true,
        _avg: { responseTimeMs: true },
      }),
      prisma.aIUsageLog.aggregate({
        where: { feature, createdAt: { gte: since }, success: true, ...branchFilter },
        _avg: { responseTimeMs: true, tokensUsed: true },
      }),
      prisma.aIUsageLog.findMany({
        where: { feature, success: false, createdAt: { gte: since }, ...branchFilter },
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
  } catch (error: any) {
    console.error('Feature breakdown error:', error);
    res.status(500).json({ error: 'Failed to load feature breakdown' });
  }
};

// ==========================================
// AI ADOPTION METRICS (for ROI proof)
// ==========================================

/**
 * GET /api/v1/ai-analytics/adoption
 * Measure AI adoption across the school — who's using it, how often, what value
 */
export const getAdoptionMetrics = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
      ? { branchId: user.branchId } : {};

    // Total eligible users (teachers + admins + bursars)
    const totalEligibleUsers = await prisma.user.count({
      where: {
        role: { in: ['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'BRANCH_MANAGER'] },
        ...(branchFilter.branchId ? { branchId: branchFilter.branchId } : {}),
      },
    });

    // Users who used AI in last 7 days, 30 days, all time
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [weeklyActive, monthlyActive, allTimeActive] = await Promise.all([
      prisma.aIUsageLog.findMany({
        where: { createdAt: { gte: sevenDaysAgo }, ...branchFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.aIUsageLog.findMany({
        where: { createdAt: { gte: thirtyDaysAgo }, ...branchFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.aIUsageLog.findMany({
        where: { ...branchFilter },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    // AI conversations total
    const totalConversations = await prisma.aIConversation.count();
    const totalMessages = await prisma.aIMessage.count();

    // Average interactions per active user (last 30 days)
    const monthlyTotal = await prisma.aIUsageLog.count({
      where: { createdAt: { gte: thirtyDaysAgo }, ...branchFilter },
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
  } catch (error: any) {
    console.error('Adoption metrics error:', error);
    res.status(500).json({ error: 'Failed to load adoption metrics' });
  }
};
