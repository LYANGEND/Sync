import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import aiService from '../services/aiService';
import aiUsageTracker from '../services/aiUsageTracker';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

// ==========================================
// PROACTIVE AI ALERTS
// ==========================================

/**
 * POST /api/v1/ai-analytics/proactive/scan
 * Run a full AI-powered scan of the school's data and generate proactive alerts
 * This is the "AI that ACTS" — not just advises
 */
export const runProactiveScan = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const alerts: Array<{
      category: string;
      severity: string;
      title: string;
      description: string;
      entityType?: string;
      entityId?: string;
      actionType?: string;
      actionLabel?: string;
      actionPayload?: any;
    }> = [];

    // ---- 1. ACADEMIC ALERTS ----
    // Find students with failing grades (avg < 40%)
    const currentTerm = await prisma.academicTerm.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    if (currentTerm) {
      const termResults = await prisma.termResult.findMany({
        where: { termId: currentTerm.id },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } } },
          subject: { select: { name: true } },
        },
      });

      // Group by student
      const studentScores = new Map<string, { student: any; scores: number[]; failingSubjects: string[] }>();
      for (const result of termResults) {
        const key = result.studentId;
        if (!studentScores.has(key)) {
          studentScores.set(key, { student: result.student, scores: [], failingSubjects: [] });
        }
        const entry = studentScores.get(key)!;
        const score = Number(result.totalScore || 0);
        entry.scores.push(score);
        if (score < 40) {
          entry.failingSubjects.push(result.subject.name);
        }
      }

      // Students with avg < 40%
      const failingStudents = Array.from(studentScores.entries())
        .filter(([, data]) => {
          const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
          return avg < 40;
        });

      if (failingStudents.length > 0) {
        alerts.push({
          category: 'academic',
          severity: failingStudents.length > 10 ? 'critical' : 'warning',
          title: `${failingStudents.length} students at academic risk`,
          description: `${failingStudents.length} students have an average score below 40% this term. Top concern: ${failingStudents.slice(0, 3).map(([, d]) => `${d.student.firstName} ${d.student.lastName} (${d.student.class?.name || 'N/A'}, failing ${d.failingSubjects.length} subjects)`).join('; ')}.`,
          entityType: 'student-group',
          actionType: 'flag-student',
          actionLabel: `Review ${failingStudents.length} at-risk students`,
          actionPayload: { studentIds: failingStudents.map(([id]) => id), termId: currentTerm.id },
        });
      }

      // Classes with low average
      const classScores = new Map<string, { name: string; scores: number[] }>();
      for (const result of termResults) {
        const className = result.student.class?.name || 'Unknown';
        if (!classScores.has(className)) classScores.set(className, { name: className, scores: [] });
        classScores.get(className)!.scores.push(Number(result.totalScore || 0));
      }

      const lowPerformingClasses = Array.from(classScores.entries())
        .filter(([, data]) => {
          const avg = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
          return avg < 50;
        })
        .map(([name, data]) => ({
          name,
          avg: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        }));

      if (lowPerformingClasses.length > 0) {
        alerts.push({
          category: 'academic',
          severity: 'warning',
          title: `${lowPerformingClasses.length} classes below 50% average`,
          description: `These classes need attention: ${lowPerformingClasses.map(c => `${c.name} (${c.avg}%)`).join(', ')}. Consider scheduling review meetings with class teachers.`,
          actionType: 'schedule-meeting',
          actionLabel: 'View class performance details',
        });
      }
    }

    // ---- 2. ATTENDANCE ALERTS ----
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAttendance = await prisma.attendance.findMany({
      where: { date: { gte: thirtyDaysAgo } },
      include: { student: { select: { id: true, firstName: true, lastName: true } } },
    });

    // Find chronic absentees (absent > 30% of the time)
    const attendanceByStudent = new Map<string, { name: string; total: number; absent: number }>();
    for (const record of recentAttendance) {
      const key = record.studentId;
      if (!attendanceByStudent.has(key)) {
        attendanceByStudent.set(key, {
          name: `${record.student.firstName} ${record.student.lastName}`,
          total: 0,
          absent: 0,
        });
      }
      const entry = attendanceByStudent.get(key)!;
      entry.total++;
      if (record.status === 'ABSENT') entry.absent++;
    }

    const chronicAbsentees = Array.from(attendanceByStudent.entries())
      .filter(([, data]) => data.total >= 5 && (data.absent / data.total) > 0.3)
      .map(([id, data]) => ({ id, ...data, rate: Math.round((data.absent / data.total) * 100) }));

    if (chronicAbsentees.length > 0) {
      alerts.push({
        category: 'attendance',
        severity: chronicAbsentees.length > 15 ? 'critical' : 'warning',
        title: `${chronicAbsentees.length} students with chronic absenteeism`,
        description: `These students have been absent more than 30% of the time in the last 30 days: ${chronicAbsentees.slice(0, 5).map(s => `${s.name} (${s.rate}% absent)`).join(', ')}${chronicAbsentees.length > 5 ? ` and ${chronicAbsentees.length - 5} more` : ''}.`,
        entityType: 'student-group',
        actionType: 'notify-parent',
        actionLabel: `Send attendance alerts to ${chronicAbsentees.length} parents`,
        actionPayload: { studentIds: chronicAbsentees.map(s => s.id) },
      });
    }

    // ---- 3. FINANCIAL ALERTS ----
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Outstanding fees
    const feeStructures = await prisma.studentFeeStructure.findMany({
      where: {
        amountPaid: { lt: prisma.studentFeeStructure.fields.amountDue ? undefined : 99999999 },
      },
      select: { studentId: true, amountDue: true, amountPaid: true },
    });
    const unpaidFees = feeStructures.filter((f: any) => Number(f.amountPaid) < Number(f.amountDue));
    const totalOutstanding = unpaidFees.reduce((sum: number, f: any) => sum + Number(f.amountDue) - Number(f.amountPaid), 0);

    if (totalOutstanding > 0) {
      alerts.push({
        category: 'financial',
        severity: totalOutstanding > 100000 ? 'critical' : 'warning',
        title: `ZMW ${totalOutstanding.toLocaleString()} in outstanding fees`,
        description: `${unpaidFees.length} students have unpaid fees. Consider sending fee reminders to improve collection rate.`,
        entityType: 'fee-collection',
        actionType: 'send-reminder',
        actionLabel: `Send reminders to ${unpaidFees.length} students`,
        actionPayload: { studentIds: unpaidFees.map((f: any) => f.studentId) },
      });
    }

    // Budget overruns
    try {
      const budgets = await prisma.budget.findMany({
        where: { status: 'ACTIVE' },
        include: { items: true },
      });

      for (const budget of budgets) {
        const totalBudgeted = budget.items.reduce((sum: number, item: any) => sum + Number(item.allocated || 0), 0);
        const totalSpent = budget.items.reduce((sum: number, item: any) => sum + Number(item.spent || 0), 0);

        if (totalBudgeted > 0 && totalSpent > totalBudgeted * 0.9) {
          const overspendPct = Math.round((totalSpent / totalBudgeted) * 100);
          alerts.push({
            category: 'financial',
            severity: totalSpent > totalBudgeted ? 'critical' : 'warning',
            title: `Budget "${budget.name}" at ${overspendPct}% spent`,
            description: totalSpent > totalBudgeted
              ? `Budget exceeded! ZMW ${(totalSpent - totalBudgeted).toLocaleString()} over budget. Immediate review needed.`
              : `Budget is approaching its limit (ZMW ${totalSpent.toLocaleString()} of ${totalBudgeted.toLocaleString()}). Consider reviewing expenses.`,
            entityType: 'budget',
            entityId: budget.id,
            actionType: 'adjust-budget',
            actionLabel: 'Review budget details',
          });
        }
      }
    } catch (e) {
      // Budget model may not have items depending on schema version
    }

    // ---- 4. OPERATIONAL ALERTS ----
    // Teacher coverage — classes without enough teacher-subject allocations
    const classes = await prisma.class.findMany({
      include: { _count: { select: { students: true } } },
    });
    const teacherSubjects = await prisma.teacherSubject.findMany();
    const classTeacherCount = new Map<string, number>();
    for (const ts of teacherSubjects) {
      classTeacherCount.set(ts.classId, (classTeacherCount.get(ts.classId) || 0) + 1);
    }

    const understaffedClasses = classes.filter(c => {
      const allocated = classTeacherCount.get(c.id) || 0;
      return allocated < 3 && c._count.students > 0; // Less than 3 subjects allocated
    });

    if (understaffedClasses.length > 0) {
      alerts.push({
        category: 'operational',
        severity: 'info',
        title: `${understaffedClasses.length} classes need teacher allocation`,
        description: `These classes have fewer than 3 subjects with assigned teachers: ${understaffedClasses.slice(0, 5).map(c => c.name).join(', ')}. Go to Subject Allocation to assign teachers.`,
        actionType: 'schedule-meeting',
        actionLabel: 'Go to Subject Allocation',
      });
    }

    // ---- SAVE ALERTS TO DATABASE ----
    // Clear old unactioned alerts (older than 7 days) 
    await prisma.aIProactiveAlert.deleteMany({
      where: {
        isActioned: false,
        isDismissed: false,
        createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    // Save new alerts
    if (alerts.length > 0) {
      await prisma.aIProactiveAlert.createMany({
        data: alerts.map(a => ({
          branchId: branchId || null,
          category: a.category,
          severity: a.severity,
          title: a.title,
          description: a.description,
          entityType: a.entityType || null,
          entityId: a.entityId || null,
          actionType: a.actionType || null,
          actionLabel: a.actionLabel || null,
          actionPayload: a.actionPayload || null,
          generatedBy: 'rule-engine',
        })),
      });
    }

    // Track this scan
    aiUsageTracker.track({
      userId: user.userId,
      branchId: user.branchId,
      feature: 'proactive-scan',
      action: 'full-scan',
      metadata: { alertsGenerated: alerts.length },
    });

    res.json({
      message: `Scan complete. ${alerts.length} alerts generated.`,
      alertsGenerated: alerts.length,
      alerts,
    });
  } catch (error: any) {
    console.error('Proactive scan error:', error);
    res.status(500).json({ error: 'Failed to run proactive scan' });
  }
};

/**
 * POST /api/v1/ai-analytics/proactive/ai-scan
 * Use AI to analyze school data and generate intelligent insights/alerts
 */
export const runAIScan = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({ error: 'AI is not configured.' });
    }

    // Gather school data snapshot
    const [
      studentCount,
      teacherCount,
      classCount,
      currentTerm,
      recentPayments,
      pendingFees,
      attendanceStats,
      riskStudents,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.class.count(),
      prisma.academicTerm.findFirst({ where: { isActive: true } }),
      prisma.payment.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        select: { amount: true, status: true },
      }),
      prisma.studentFeeStructure.count(),
      prisma.attendance.findMany({
        where: { date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
        select: { status: true },
      }),
      prisma.studentRiskAssessment.findMany({
        where: { riskLevel: { in: ['HIGH', 'CRITICAL'] } },
        select: { riskLevel: true },
      }),
    ]);

    const totalRevenue = recentPayments
      .filter((p: any) => p.status === 'COMPLETED')
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const attendanceRate = attendanceStats.length > 0
      ? Math.round((attendanceStats.filter((a: any) => a.status !== 'ABSENT').length / attendanceStats.length) * 100)
      : 0;

    const startTime = Date.now();
    const aiInsights = await aiService.generateJSON<{
      weeklyDigest: string;
      actionItems: Array<{ priority: 'high' | 'medium' | 'low'; title: string; description: string; category: string }>;
      opportunities: Array<{ title: string; description: string; impact: string }>;
      risks: Array<{ title: string; description: string; likelihood: string }>;
    }>(`Analyze this school data and provide actionable insights:

School Overview:
- Students: ${studentCount}, Teachers: ${teacherCount}, Classes: ${classCount}
- Current Term: ${currentTerm?.name || 'Unknown'}
- Revenue (30 days): ZMW ${totalRevenue.toLocaleString()}
- Pending fees: ${pendingFees} students
- Attendance rate (14 days): ${attendanceRate}%
- High/Critical risk students: ${riskStudents.length}

Generate a JSON response with:
{
  "weeklyDigest": "<2-3 sentence executive summary of school health>",
  "actionItems": [{"priority": "high|medium|low", "title": "...", "description": "...", "category": "academic|financial|attendance|operational"}],
  "opportunities": [{"title": "...", "description": "...", "impact": "..."}],
  "risks": [{"title": "...", "description": "...", "likelihood": "high|medium|low"}]
}
Include 3-5 action items, 2-3 opportunities, 2-3 risks. Be specific and actionable.`, {
      systemPrompt: 'You are an AI school operations analyst for a Zambian school management system. Provide data-driven, actionable insights.',
      temperature: 0.4,
    });

    aiUsageTracker.track({
      userId: user.userId,
      branchId: user.branchId,
      feature: 'proactive-scan',
      action: 'ai-scan',
      responseTimeMs: Date.now() - startTime,
    });

    // Save AI-generated action items as alerts
    for (const item of aiInsights.actionItems || []) {
      await prisma.aIProactiveAlert.create({
        data: {
          branchId: user.branchId || null,
          category: item.category || 'operational',
          severity: item.priority === 'high' ? 'warning' : 'info',
          title: item.title,
          description: item.description,
          generatedBy: 'ai-analysis',
        },
      });
    }

    // Cache the digest
    await prisma.aIInsightsCache.upsert({
      where: { cacheKey: 'weekly-digest' },
      create: {
        cacheKey: 'weekly-digest',
        data: aiInsights as any,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
      update: {
        data: aiInsights as any,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    res.json(aiInsights);
  } catch (error: any) {
    console.error('AI scan error:', error);
    res.status(500).json({ error: error.message || 'Failed to run AI scan' });
  }
};

/**
 * GET /api/v1/ai-analytics/proactive/alerts
 * Get all proactive alerts
 */
export const getAlerts = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchFilter = user.role !== 'SUPER_ADMIN' && user.branchId
      ? { branchId: user.branchId } : {};

    const status = req.query.status as string;
    const statusFilter = status === 'unread' ? { isRead: false, isDismissed: false }
      : status === 'actioned' ? { isActioned: true }
      : status === 'dismissed' ? { isDismissed: true }
      : { isDismissed: false }; // default: not dismissed

    const alerts = await prisma.aIProactiveAlert.findMany({
      where: { ...branchFilter, ...statusFilter },
      orderBy: [
        { severity: 'asc' }, // critical first
        { createdAt: 'desc' },
      ],
      take: 50,
    });

    const unreadCount = await prisma.aIProactiveAlert.count({
      where: { ...branchFilter, isRead: false, isDismissed: false },
    });

    res.json({ alerts, unreadCount });
  } catch (error: any) {
    console.error('Get alerts error:', error);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
};

/**
 * PUT /api/v1/ai-analytics/proactive/alerts/:id/read
 */
export const markAlertRead = async (req: Request, res: Response) => {
  try {
    await prisma.aIProactiveAlert.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json({ message: 'Alert marked as read' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
};

/**
 * PUT /api/v1/ai-analytics/proactive/alerts/:id/action
 */
export const markAlertActioned = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    await prisma.aIProactiveAlert.update({
      where: { id: req.params.id },
      data: {
        isActioned: true,
        actionedBy: user?.userId,
        actionedAt: new Date(),
        isRead: true,
      },
    });
    res.json({ message: 'Alert marked as actioned' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update alert' });
  }
};

/**
 * PUT /api/v1/ai-analytics/proactive/alerts/:id/dismiss
 */
export const dismissAlert = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    await prisma.aIProactiveAlert.update({
      where: { id: req.params.id },
      data: {
        isDismissed: true,
        dismissedBy: user?.userId,
      },
    });
    res.json({ message: 'Alert dismissed' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to dismiss alert' });
  }
};

/**
 * GET /api/v1/ai-analytics/proactive/digest
 * Get cached weekly digest (or generate fresh if expired)
 */
export const getWeeklyDigest = async (req: Request, res: Response) => {
  try {
    const cached = await prisma.aIInsightsCache.findUnique({
      where: { cacheKey: 'weekly-digest' },
    });

    if (cached && cached.expiresAt > new Date()) {
      return res.json({ ...cached.data as any, cached: true, generatedAt: cached.generatedAt });
    }

    // Return null if no cache — frontend should trigger ai-scan
    res.json({ cached: false, data: null, message: 'No cached digest. Run AI scan to generate.' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to load digest' });
  }
};
