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
exports.logCommunication = logCommunication;
exports.updateCommunicationLogStatus = updateCommunicationLogStatus;
exports.getCommunicationLogs = getCommunicationLogs;
exports.getCommunicationStats = getCommunicationStats;
const prisma_1 = require("../utils/prisma");
/**
 * Log any outbound communication (email, SMS, WhatsApp, push) to the audit trail.
 */
function logCommunication(params) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const log = yield prisma_1.prisma.communicationLog.create({
                data: {
                    channel: params.channel,
                    status: params.status,
                    recipientEmail: params.recipientEmail || null,
                    recipientPhone: params.recipientPhone || null,
                    recipientName: params.recipientName || null,
                    subject: params.subject || null,
                    message: params.message,
                    htmlBody: params.htmlBody || null,
                    source: params.source,
                    sentById: params.sentById || null,
                    errorMessage: params.errorMessage || null,
                },
            });
            return log.id;
        }
        catch (error) {
            console.error('Failed to log communication:', error);
            return null;
        }
    });
}
/**
 * Update the status of a communication log entry (e.g. from PENDING to SENT or FAILED).
 */
function updateCommunicationLogStatus(logId, status, errorMessage) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield prisma_1.prisma.communicationLog.update({
                where: { id: logId },
                data: {
                    status,
                    errorMessage: errorMessage || null,
                },
            });
        }
        catch (error) {
            console.error('Failed to update communication log:', error);
        }
    });
}
/**
 * Get communication logs with filtering and pagination
 */
function getCommunicationLogs(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const { channel, status, source, sentById, search, page = 1, limit = 25 } = options;
        const where = {};
        if (channel)
            where.channel = channel;
        if (status)
            where.status = status;
        if (source)
            where.source = source;
        if (sentById)
            where.sentById = sentById;
        if (search) {
            where.OR = [
                { recipientEmail: { contains: search, mode: 'insensitive' } },
                { recipientName: { contains: search, mode: 'insensitive' } },
                { subject: { contains: search, mode: 'insensitive' } },
                { message: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [logs, total] = yield Promise.all([
            prisma_1.prisma.communicationLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    sentBy: {
                        select: { id: true, fullName: true, role: true },
                    },
                },
            }),
            prisma_1.prisma.communicationLog.count({ where }),
        ]);
        return {
            logs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    });
}
/**
 * Get communication statistics (for dashboard cards)
 */
function getCommunicationStats() {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const [totalSent, totalFailed, sentToday, sentThisMonth, byChannel] = yield Promise.all([
            prisma_1.prisma.communicationLog.count({ where: { status: 'SENT' } }),
            prisma_1.prisma.communicationLog.count({ where: { status: 'FAILED' } }),
            prisma_1.prisma.communicationLog.count({
                where: { status: 'SENT', createdAt: { gte: startOfDay } },
            }),
            prisma_1.prisma.communicationLog.count({
                where: { status: 'SENT', createdAt: { gte: startOfMonth } },
            }),
            prisma_1.prisma.communicationLog.groupBy({
                by: ['channel'],
                _count: { id: true },
                where: { status: 'SENT' },
            }),
        ]);
        const channelBreakdown = byChannel.reduce((acc, item) => {
            acc[item.channel] = item._count.id;
            return acc;
        }, {});
        return {
            totalSent,
            totalFailed,
            sentToday,
            sentThisMonth,
            byChannel: channelBreakdown,
        };
    });
}
