import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import aiService from '../services/aiService';
import aiUsageTracker from '../services/aiUsageTracker';
import {
  getTrialBalance,
  getIncomeStatement,
  getCashFlowSummary,
  getAgedReceivables,
} from '../services/accountingService';

// ========================================
// AI FINANCIAL ADVISOR
// ========================================

/**
 * Gather a comprehensive financial snapshot for AI analysis
 */
async function gatherFinancialSnapshot(branchId?: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Date ranges
  const thisMonthStart = new Date(currentYear, currentMonth, 1);
  const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const lastMonthEnd = new Date(currentYear, currentMonth, 0);
  const thisYearStart = new Date(currentYear, 0, 1);
  const last3MonthsStart = new Date(currentYear, currentMonth - 3, 1);

  const branchFilter: any = branchId ? { branchId } : {};

  // ---- Revenue (Payments) ----
  const [
    totalRevenueThisMonth,
    totalRevenueLastMonth,
    totalRevenueThisYear,
    revenueByMethod,
    monthlyRevenueTrend,
    totalStudents,
    activeStudents,
    totalFeesAssigned,
    agedReceivables,
  ] = await Promise.all([
    // This month revenue
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paymentDate: { gte: thisMonthStart }, ...branchFilter },
      _sum: { amount: true },
      _count: true,
    }),
    // Last month revenue
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paymentDate: { gte: lastMonthStart, lte: lastMonthEnd }, ...branchFilter },
      _sum: { amount: true },
      _count: true,
    }),
    // Year-to-date revenue
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paymentDate: { gte: thisYearStart }, ...branchFilter },
      _sum: { amount: true },
      _count: true,
    }),
    // Revenue by payment method (this year)
    prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'COMPLETED', paymentDate: { gte: thisYearStart }, ...branchFilter },
      _sum: { amount: true },
      _count: true,
    }),
    // Monthly revenue trend (last 6 months)
    prisma.payment.findMany({
      where: { status: 'COMPLETED', paymentDate: { gte: new Date(currentYear, currentMonth - 6, 1) }, ...branchFilter },
      select: { paymentDate: true, amount: true },
    }),
    // Total students
    prisma.student.count({ where: branchFilter }),
    // Active students
    prisma.student.count({ where: { status: 'ACTIVE', ...branchFilter } }),
    // Total fees assigned
    prisma.studentFeeStructure.aggregate({ _sum: { amountDue: true, amountPaid: true } }),
    // Aged receivables
    getAgedReceivables(branchId).catch(() => null),
  ]);

  // ---- Expenses ----
  const [
    totalExpensesThisMonth,
    totalExpensesLastMonth,
    totalExpensesThisYear,
    expensesByCategory,
    pendingExpenses,
  ] = await Promise.all([
    prisma.expense.aggregate({
      where: { status: 'PAID', date: { gte: thisMonthStart }, ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { status: 'PAID', date: { gte: lastMonthStart, lte: lastMonthEnd }, ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { status: 'PAID', date: { gte: thisYearStart }, ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { status: 'PAID', date: { gte: thisYearStart }, ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.expense.aggregate({
      where: { status: 'PENDING_APPROVAL', ...branchFilter },
      _sum: { totalAmount: true },
      _count: true,
    }),
  ]);

  // ---- Payroll ----
  const [latestPayroll, totalPayrollThisYear] = await Promise.all([
    prisma.payrollRun.findFirst({
      where: { status: 'PAID', ...(branchId ? { branchId } : {}) },
      orderBy: { paidAt: 'desc' },
      include: { _count: { select: { payslips: true } } },
    }),
    prisma.payslip.aggregate({
      where: { isPaid: true, paidAt: { gte: thisYearStart }, payrollRun: branchId ? { branchId } : {} },
      _sum: { grossSalary: true, netSalary: true, payeTax: true, napsaContribution: true, totalDeductions: true },
    }),
  ]);

  // ---- Budgets ----
  const activeBudgets = await prisma.budget.findMany({
    where: { status: 'ACTIVE', ...(branchId ? { branchId } : {}) },
    include: { items: true },
  });

  // ---- Petty Cash ----
  const pettyCashAccounts = await prisma.pettyCashAccount.findMany({
    where: { isActive: true, ...(branchId ? { branchId } : {}) },
  });

  // ---- Cash Flow ----
  let cashFlow = null;
  try {
    cashFlow = await getCashFlowSummary(thisYearStart, now, branchId);
  } catch (e) { /* ignore */ }

  // ---- Income Statement ----
  let incomeStatement = null;
  try {
    incomeStatement = await getIncomeStatement(thisYearStart, now, branchId);
  } catch (e) { /* ignore */ }

  // ---- Monthly trend calculation ----
  const monthlyTrend: Record<string, number> = {};
  for (const p of monthlyRevenueTrend) {
    const key = `${p.paymentDate.getFullYear()}-${String(p.paymentDate.getMonth() + 1).padStart(2, '0')}`;
    monthlyTrend[key] = (monthlyTrend[key] || 0) + Number(p.amount);
  }

  // ---- Build snapshot ----
  const revenueThisMonth = Number(totalRevenueThisMonth._sum.amount || 0);
  const revenueLastMonth = Number(totalRevenueLastMonth._sum.amount || 0);
  const revenueYTD = Number(totalRevenueThisYear._sum.amount || 0);
  const expensesThisMonth = Number(totalExpensesThisMonth._sum.totalAmount || 0);
  const expensesLastMonth = Number(totalExpensesLastMonth._sum.totalAmount || 0);
  const expensesYTD = Number(totalExpensesThisYear._sum.totalAmount || 0);
  const totalFeesDue = Number(totalFeesAssigned._sum.amountDue || 0);
  const totalFeesPaid = Number(totalFeesAssigned._sum.amountPaid || 0);
  const collectionRate = totalFeesDue > 0 ? ((totalFeesPaid / totalFeesDue) * 100).toFixed(1) : '0';
  const revenueGrowth = revenueLastMonth > 0
    ? (((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100).toFixed(1)
    : 'N/A';

  return {
    generatedAt: now.toISOString(),
    currency: 'ZMW',
    school: {
      totalStudents,
      activeStudents,
    },
    revenue: {
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      yearToDate: revenueYTD,
      transactionsThisMonth: totalRevenueThisMonth._count,
      growthPercent: revenueGrowth,
      byMethod: revenueByMethod.map((r: any) => ({
        method: r.method,
        total: Number(r._sum.amount),
        count: r._count,
      })),
      monthlyTrend: Object.entries(monthlyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total })),
    },
    feeCollection: {
      totalDue: totalFeesDue,
      totalPaid: totalFeesPaid,
      outstanding: totalFeesDue - totalFeesPaid,
      collectionRatePercent: collectionRate,
      agedReceivables: agedReceivables ? {
        summary: agedReceivables.summary,
        studentCount: agedReceivables.studentCount,
        topDebtors: (agedReceivables.receivables as any[])?.slice(0, 5).map((r: any) => ({
          student: r.studentName,
          balance: r.balance,
          ageDays: r.ageDays,
        })),
      } : null,
    },
    expenses: {
      thisMonth: expensesThisMonth,
      lastMonth: expensesLastMonth,
      yearToDate: expensesYTD,
      pendingApproval: {
        amount: Number(pendingExpenses._sum.totalAmount || 0),
        count: pendingExpenses._count,
      },
      byCategory: expensesByCategory.map((e: any) => ({
        category: e.category,
        total: Number(e._sum.totalAmount),
        count: e._count,
      })),
    },
    profitability: {
      netIncomeThisMonth: revenueThisMonth - expensesThisMonth,
      netIncomeYTD: revenueYTD - expensesYTD,
      expenseRatioPercent: revenueYTD > 0 ? ((expensesYTD / revenueYTD) * 100).toFixed(1) : 'N/A',
    },
    payroll: {
      lastRun: latestPayroll ? {
        month: latestPayroll.month,
        year: latestPayroll.year,
        staffCount: latestPayroll._count.payslips,
        totalGross: Number(latestPayroll.totalGross),
        totalNet: Number(latestPayroll.totalNet),
      } : null,
      yearToDate: {
        totalGross: Number(totalPayrollThisYear._sum?.grossSalary || 0),
        totalNet: Number(totalPayrollThisYear._sum?.netSalary || 0),
        totalPAYE: Number(totalPayrollThisYear._sum?.payeTax || 0),
        totalNAPSA: Number(totalPayrollThisYear._sum?.napsaContribution || 0) * 2, // employee + employer
      },
    },
    budgets: activeBudgets.map(b => ({
      name: b.name,
      totalBudget: Number(b.totalBudget),
      totalSpent: Number(b.totalSpent),
      status: b.status,
      itemCount: b.items.length,
    })),
    pettyCash: {
      totalBalance: pettyCashAccounts.reduce((sum, a) => sum + Number(a.balance), 0),
      accounts: pettyCashAccounts.map(a => ({
        name: a.name,
        balance: Number(a.balance),
        floatAmount: Number(a.floatAmount),
      })),
    },
    cashFlow: cashFlow ? {
      totalInflows: cashFlow.inflows.totalInflow,
      totalOutflows: cashFlow.outflows.totalOutflow,
      netCashFlow: cashFlow.netCashFlow,
    } : null,
    incomeStatement: incomeStatement ? {
      totalIncome: incomeStatement.totalIncome,
      totalExpenses: incomeStatement.totalExpenses,
      netIncome: incomeStatement.netIncome,
    } : null,
  };
}

/**
 * Build the financial advisor system prompt
 */
function buildFinancialAdvisorPrompt(snapshot: any): string {
  return `You are a Financial Advisor AI for a Zambian school management system called Sync.
You analyze school financial data and provide actionable insights, recommendations, and warnings.

ROLE: You are a certified financial analyst specializing in Zambian educational institutions.
CURRENCY: All amounts are in Zambian Kwacha (ZMW).
CONTEXT: This is a school — revenue comes from student fees, expenses include salaries, utilities, supplies, etc.

FINANCIAL DATA SNAPSHOT (as of ${snapshot.generatedAt}):
${JSON.stringify(snapshot, null, 2)}

GUIDELINES:
- Be specific with numbers — reference actual ZMW amounts from the data
- Highlight critical issues first (cash flow problems, low collection rates, budget overruns)
- Provide actionable recommendations the school admin can implement
- Consider Zambian context: ZRA compliance (PAYE, NAPSA, NHIMA), school term cycles, economic factors
- Compare month-over-month and identify trends
- Flag any compliance risks (statutory deductions, overdue payments)
- Keep responses concise but insightful — use bullet points and clear headings
- If data is limited (e.g., no journal entries yet), acknowledge this and advise on getting started
- Format currency as "ZMW X,XXX.XX"

DEBT COLLECTION ACTIONS:
You can suggest actions the user can perform. When recommending debt collection actions, include an ACTION BLOCK at the end of your response using this exact format:

\`\`\`action
{"type": "SEND_REMINDERS", "channels": ["EMAIL","SMS","WHATSAPP"], "segments": ["AT_RISK","NEEDS_NUDGE"], "minDaysOverdue": 14}
\`\`\`

Available action types:
- SEND_REMINDERS — Send fee reminders to debtors. Params: channels (EMAIL/SMS/WHATSAPP), segments (WILL_PAY/NEEDS_NUDGE/AT_RISK/HARDSHIP), minDaysOverdue
- CREATE_CAMPAIGN — Create a debt collection campaign. Params: name, minAmountOwed, targetSegments
- VIEW_DEBTORS — Show the debtors list (suggest navigating to the Collection Dashboard)

Only include an action block when the user explicitly asks to send reminders, contact debtors, or create a campaign. For regular questions, just answer normally.`;
}

/**
 * POST /api/v1/financial/ai-advisor
 * AI-powered financial analysis and recommendations
 */
export const getAIFinancialAdvice = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { question, conversationHistory } = req.body;

    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Check AI availability
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        error: 'AI is not configured. Please set up AI in School Settings (Settings → AI Configuration).',
      });
    }

    // Gather financial data
    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const snapshot = await gatherFinancialSnapshot(branchId);

    // Build messages
    const systemPrompt = buildFinancialAdvisorPrompt(snapshot);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 messages)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current question
    messages.push({ role: 'user', content: question });

    // Call AI
    const startTime = Date.now();
    const aiResponse = await aiService.chat(messages, {
      temperature: 0.4,
      maxTokens: 4000,
    });
    const responseTimeMs = Date.now() - startTime;

    // Track usage
    aiUsageTracker.track({
      userId: user.userId,
      branchId: user.branchId,
      feature: 'financial-advisor',
      action: 'chat',
      tokensUsed: aiResponse.tokensUsed,
      responseTimeMs,
      model: aiResponse.model,
    });

    // Auto-save to conversation if conversationId provided, or create new one
    let conversationId = req.body.conversationId || null;
    try {
      if (conversationId) {
        // Append to existing conversation
        await prisma.aIMessage.createMany({
          data: [
            { conversationId, role: 'user', content: question, tokenCount: null },
            { conversationId, role: 'assistant', content: aiResponse.content, tokenCount: aiResponse.tokensUsed || null },
          ],
        });
        // Update title if this is the first real exchange (title is still default)
        const convo = await prisma.aIConversation.findUnique({ where: { id: conversationId } });
        if (convo && convo.title === 'New Conversation') {
          const shortTitle = question.length > 60 ? question.slice(0, 57) + '...' : question;
          await prisma.aIConversation.update({ where: { id: conversationId }, data: { title: shortTitle } });
        }
        await prisma.aIConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
      } else {
        // Create a new conversation
        const shortTitle = question.length > 60 ? question.slice(0, 57) + '...' : question;
        const convo = await prisma.aIConversation.create({
          data: {
            userId: user.userId,
            title: shortTitle,
            model: 'financial-advisor',
            context: { type: 'financial-advisor' },
            messages: {
              create: [
                { role: 'user', content: question },
                { role: 'assistant', content: aiResponse.content, tokenCount: aiResponse.tokensUsed || null },
              ],
            },
          },
        });
        conversationId = convo.id;
      }
    } catch (saveErr: any) {
      console.error('Failed to save conversation:', saveErr.message);
      // Don't fail the response if save fails
    }

    // Extract action block if present and strip it from the displayed answer
    let action = null;
    let cleanAnswer = aiResponse.content;
    const actionMatch = aiResponse.content.match(/```action\n([\s\S]*?)\n```/);
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1].trim());
        const { type, ...params } = parsed;
        action = { type, params };
        // Remove the action block from the displayed text
        cleanAnswer = cleanAnswer.replace(/```action\n[\s\S]*?\n```/, '').trim();
      } catch { /* ignore parse errors */ }
    }

    res.json({
      answer: cleanAnswer,
      action, // null or { type: "SEND_REMINDERS", params: { channels: [...], ... } }
      tokensUsed: aiResponse.tokensUsed,
      conversationId,
      snapshotSummary: {
        revenueThisMonth: snapshot.revenue.thisMonth,
        expensesThisMonth: snapshot.expenses.thisMonth,
        netIncome: snapshot.profitability.netIncomeThisMonth,
        collectionRate: snapshot.feeCollection.collectionRatePercent,
        outstandingFees: snapshot.feeCollection.outstanding,
      },
    });
  } catch (error: any) {
    console.error('AI Financial Advisor error:', error);
    res.status(500).json({ error: error.message || 'Failed to get AI financial advice' });
  }
};

/**
 * GET /api/v1/financial/ai-advisor/snapshot
 * Get the raw financial snapshot (no AI — for dashboard display)
 */
export const getFinancialSnapshot = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const snapshot = await gatherFinancialSnapshot(branchId);

    res.json(snapshot);
  } catch (error: any) {
    console.error('Financial snapshot error:', error);
    res.status(500).json({ error: 'Failed to generate financial snapshot' });
  }
};

/**
 * POST /api/v1/financial/ai-advisor/quick-insights
 * Get quick AI-generated insights without a specific question
 */
export const getQuickInsights = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        error: 'AI is not configured. Please set up AI in School Settings.',
      });
    }

    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const snapshot = await gatherFinancialSnapshot(branchId);
    const systemPrompt = buildFinancialAdvisorPrompt(snapshot);

    const startTime = Date.now();
    const result = await aiService.generateJSON<{
      healthScore: number;
      healthLabel: string;
      criticalAlerts: Array<{ title: string; description: string; severity: 'high' | 'medium' | 'low' }>;
      recommendations: Array<{ title: string; description: string; impact: string }>;
      keyMetrics: Array<{ label: string; value: string; trend: 'up' | 'down' | 'stable'; isGood: boolean }>;
    }>(
      `Based on the financial data provided, generate a structured financial health report.
Respond with JSON only:
{
  "healthScore": <number 0-100, overall financial health>,
  "healthLabel": "<Excellent/Good/Fair/Needs Attention/Critical>",
  "criticalAlerts": [{"title": "...", "description": "...", "severity": "high|medium|low"}],
  "recommendations": [{"title": "...", "description": "...", "impact": "..."}],
  "keyMetrics": [{"label": "...", "value": "ZMW X,XXX", "trend": "up|down|stable", "isGood": true|false}]
}
Include 2-4 critical alerts, 3-5 recommendations, and 4-6 key metrics.
Focus on the most important insights for a school administrator.`,
      {
        systemPrompt,
        temperature: 0.3,
      }
    );

    // Track usage
    aiUsageTracker.track({
      userId: user.userId,
      branchId: user.branchId,
      feature: 'financial-advisor',
      action: 'quick-insights',
      responseTimeMs: Date.now() - startTime,
    });

    res.json({
      ...result,
      snapshot: {
        revenueThisMonth: snapshot.revenue.thisMonth,
        expensesThisMonth: snapshot.expenses.thisMonth,
        netIncome: snapshot.profitability.netIncomeThisMonth,
        collectionRate: snapshot.feeCollection.collectionRatePercent,
        outstandingFees: snapshot.feeCollection.outstanding,
      },
    });
  } catch (error: any) {
    console.error('Quick insights error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate insights' });
  }
};

// ========================================
// CONVERSATION HISTORY ENDPOINTS
// ========================================

/**
 * GET /api/v1/financial/ai-advisor/conversations
 * List user's financial advisor conversations
 */
export const listConversations = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const conversations = await prisma.aIConversation.findMany({
      where: {
        userId: user.userId,
        context: { path: ['type'], equals: 'financial-advisor' },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
      take: 50,
    });

    res.json(conversations);
  } catch (error: any) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
};

/**
 * GET /api/v1/financial/ai-advisor/conversations/:id
 * Get a specific conversation with all messages
 */
export const getConversation = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: req.params.id, userId: user.userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true, content: true, createdAt: true },
        },
      },
    });

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    res.json(conversation);
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
};

/**
 * PATCH /api/v1/financial/ai-advisor/conversations/:id
 * Rename a conversation
 */
export const updateConversation = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: req.params.id, userId: user.userId },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const updated = await prisma.aIConversation.update({
      where: { id: req.params.id },
      data: { title: title.trim() },
    });

    res.json(updated);
  } catch (error: any) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
};

/**
 * DELETE /api/v1/financial/ai-advisor/conversations/:id
 * Delete a conversation
 */
export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const conversation = await prisma.aIConversation.findFirst({
      where: { id: req.params.id, userId: user.userId },
    });
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    await prisma.aIConversation.delete({ where: { id: req.params.id } });

    res.json({ message: 'Conversation deleted' });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};
