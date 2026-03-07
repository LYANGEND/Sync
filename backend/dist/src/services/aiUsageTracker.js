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
exports.aiUsageTracker = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../utils/prisma");
/**
 * AI Usage Tracker — logs every AI interaction for analytics, cost tracking, and adoption metrics.
 * Fire-and-forget: never blocks the main request flow.
 */
class AIUsageTracker {
    /**
     * Log an AI usage event (non-blocking)
     */
    track(event) {
        var _a;
        // Fire and forget — don't await, don't block
        prisma_1.prisma.aIUsageLog.create({
            data: {
                userId: event.userId,
                branchId: event.branchId || null,
                feature: event.feature,
                action: event.action,
                tokensUsed: event.tokensUsed || null,
                responseTimeMs: event.responseTimeMs || null,
                provider: event.provider || null,
                model: event.model || null,
                success: (_a = event.success) !== null && _a !== void 0 ? _a : true,
                errorMessage: event.errorMessage || null,
                metadata: event.metadata ? event.metadata : client_1.Prisma.DbNull,
            },
        }).catch((err) => {
            console.error('Failed to log AI usage:', err.message);
        });
    }
    /**
     * Helper: wrap an async AI call to automatically measure response time and track usage
     */
    trackCall(event, fn) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const startTime = Date.now();
            try {
                const result = yield fn();
                const responseTimeMs = Date.now() - startTime;
                this.track(Object.assign(Object.assign({}, event), { tokensUsed: result.tokensUsed || event.tokensUsed, model: result.model || event.model, responseTimeMs, success: true }));
                return result;
            }
            catch (error) {
                const responseTimeMs = Date.now() - startTime;
                this.track(Object.assign(Object.assign({}, event), { responseTimeMs, success: false, errorMessage: (_a = error.message) === null || _a === void 0 ? void 0 : _a.slice(0, 500) }));
                throw error;
            }
        });
    }
}
exports.aiUsageTracker = new AIUsageTracker();
exports.default = exports.aiUsageTracker;
