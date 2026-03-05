import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface UsageEvent {
  userId: string;
  branchId?: string;
  feature: string;    // 'teaching-assistant' | 'financial-advisor' | 'auto-grading' | 'risk-analysis' | 'report-remarks' | 'quick-insights'
  action: string;     // 'chat' | 'slash-command' | 'quick-insights' | 'auto-grade' | 'risk-assess' | 'generate-remarks'
  tokensUsed?: number;
  responseTimeMs?: number;
  provider?: string;
  model?: string;
  success?: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * AI Usage Tracker — logs every AI interaction for analytics, cost tracking, and adoption metrics.
 * Fire-and-forget: never blocks the main request flow.
 */
class AIUsageTracker {
  /**
   * Log an AI usage event (non-blocking)
   */
  track(event: UsageEvent): void {
    // Fire and forget — don't await, don't block
    prisma.aIUsageLog.create({
      data: {
        userId: event.userId,
        branchId: event.branchId || null,
        feature: event.feature,
        action: event.action,
        tokensUsed: event.tokensUsed || null,
        responseTimeMs: event.responseTimeMs || null,
        provider: event.provider || null,
        model: event.model || null,
        success: event.success ?? true,
        errorMessage: event.errorMessage || null,
        metadata: event.metadata ? event.metadata : Prisma.DbNull,
      },
    }).catch((err: any) => {
      console.error('Failed to log AI usage:', err.message);
    });
  }

  /**
   * Helper: wrap an async AI call to automatically measure response time and track usage
   */
  async trackCall<T>(
    event: Omit<UsageEvent, 'responseTimeMs' | 'success' | 'errorMessage'>,
    fn: () => Promise<T & { tokensUsed?: number; model?: string }>
  ): Promise<T & { tokensUsed?: number; model?: string }> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const responseTimeMs = Date.now() - startTime;
      this.track({
        ...event,
        tokensUsed: result.tokensUsed || event.tokensUsed,
        model: result.model || event.model,
        responseTimeMs,
        success: true,
      });
      return result;
    } catch (error: any) {
      const responseTimeMs = Date.now() - startTime;
      this.track({
        ...event,
        responseTimeMs,
        success: false,
        errorMessage: error.message?.slice(0, 500),
      });
      throw error;
    }
  }
}

export const aiUsageTracker = new AIUsageTracker();
export default aiUsageTracker;
