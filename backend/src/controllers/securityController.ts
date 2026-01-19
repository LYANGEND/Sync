import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// SECURITY DASHBOARD
// ==========================================

/**
 * Get security dashboard stats
 */
export const getSecurityDashboard = async (req: Request, res: Response) => {
    try {
        const { days = 7 } = req.query;
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - Number(days));

        // Failed login attempts
        const failedLogins = await prisma.securityEvent.count({
            where: {
                eventType: 'FAILED_LOGIN',
                createdAt: { gte: daysAgo },
            },
        });

        // Successful logins
        const successfulLogins = await prisma.securityEvent.count({
            where: {
                eventType: 'SUCCESSFUL_LOGIN',
                createdAt: { gte: daysAgo },
            },
        });

        // Locked accounts
        const lockedAccounts = await prisma.accountLock.count({
            where: { isLocked: true },
        });

        // Suspicious activities (high risk score)
        const suspiciousActivities = await prisma.securityEvent.count({
            where: {
                riskScore: { gte: 70 },
                createdAt: { gte: daysAgo },
            },
        });

        // Recent failed login attempts
        const recentFailedLogins = await prisma.securityEvent.findMany({
            where: {
                eventType: 'FAILED_LOGIN',
                createdAt: { gte: daysAgo },
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
                id: true,
                userEmail: true,
                ipAddress: true,
                location: true,
                status: true,
                riskScore: true,
                createdAt: true,
            },
        });

        // Top IPs with failed attempts
        const failedLoginsByIP = await prisma.securityEvent.groupBy({
            by: ['ipAddress'],
            where: {
                eventType: 'FAILED_LOGIN',
                createdAt: { gte: daysAgo },
                ipAddress: { not: null },
            },
            _count: true,
            orderBy: { _count: { ipAddress: 'desc' } },
            take: 10,
        });

        // 2FA adoption rate
        const totalUsers = await prisma.user.count();
        const users2FA = await prisma.twoFactorAuth.count({
            where: { isEnabled: true },
        });
        const twoFactorAdoptionRate = totalUsers > 0 ? (users2FA / totalUsers) * 100 : 0;

        // Security events by type
        const eventsByType = await prisma.securityEvent.groupBy({
            by: ['eventType'],
            where: { createdAt: { gte: daysAgo } },
            _count: true,
        });

        res.json({
            stats: {
                failedLogins,
                successfulLogins,
                lockedAccounts,
                suspiciousActivities,
                twoFactorAdoptionRate: Number(twoFactorAdoptionRate.toFixed(2)),
            },
            recentFailedLogins,
            failedLoginsByIP: failedLoginsByIP.map(item => ({
                ipAddress: item.ipAddress,
                count: item._count,
            })),
            eventsByType: eventsByType.reduce((acc, item) => {
                acc[item.eventType] = item._count;
                return acc;
            }, {} as Record<string, number>),
        });
    } catch (error) {
        console.error('Get security dashboard error:', error);
        res.status(500).json({ error: 'Failed to fetch security dashboard' });
    }
};

/**
 * Get security events with filters
 */
export const getSecurityEvents = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;
        const eventType = req.query.eventType as string;
        const minRiskScore = req.query.minRiskScore ? parseInt(req.query.minRiskScore as string) : undefined;
        const search = req.query.search as string;

        const where: any = {};
        if (eventType) where.eventType = eventType;
        if (minRiskScore !== undefined) where.riskScore = { gte: minRiskScore };
        if (search) {
            where.OR = [
                { userEmail: { contains: search, mode: 'insensitive' } },
                { ipAddress: { contains: search } },
            ];
        }

        const [events, total] = await Promise.all([
            prisma.securityEvent.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { name: true, slug: true } },
                },
            }),
            prisma.securityEvent.count({ where }),
        ]);

        res.json({
            events,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get security events error:', error);
        res.status(500).json({ error: 'Failed to fetch security events' });
    }
};

/**
 * Get locked accounts
 */
export const getLockedAccounts = async (req: Request, res: Response) => {
    try {
        const accounts = await prisma.accountLock.findMany({
            where: { isLocked: true },
            orderBy: { lockedAt: 'desc' },
            include: {
                tenant: { select: { name: true, slug: true } },
            },
        });

        res.json(accounts);
    } catch (error) {
        console.error('Get locked accounts error:', error);
        res.status(500).json({ error: 'Failed to fetch locked accounts' });
    }
};

/**
 * Unlock an account
 */
export const unlockAccount = async (req: Request, res: Response) => {
    try {
        const { lockId } = req.params;
        const platformUserId = (req as any).platformUser?.userId;

        const lock = await prisma.accountLock.update({
            where: { id: lockId },
            data: {
                isLocked: false,
                unlockedAt: new Date(),
                unlockedBy: platformUserId,
                failedAttempts: 0,
            },
        });

        // Log security event
        await prisma.securityEvent.create({
            data: {
                tenantId: lock.tenantId,
                userEmail: lock.userEmail,
                eventType: 'ACCOUNT_UNLOCKED',
                metadata: { unlockedBy: platformUserId },
            },
        });

        res.json({ message: 'Account unlocked successfully', lock });
    } catch (error) {
        console.error('Unlock account error:', error);
        res.status(500).json({ error: 'Failed to unlock account' });
    }
};

// ==========================================
// DATA MANAGEMENT (GDPR)
// ==========================================

/**
 * Get data export requests
 */
export const getDataExportRequests = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;
        const tenantId = req.query.tenantId as string;

        const where: any = {};
        if (status) where.status = status;
        if (tenantId) where.tenantId = tenantId;

        const [requests, total] = await Promise.all([
            prisma.dataExportRequest.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { name: true, slug: true } },
                },
            }),
            prisma.dataExportRequest.count({ where }),
        ]);

        res.json({
            requests,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get data export requests error:', error);
        res.status(500).json({ error: 'Failed to fetch export requests' });
    }
};

/**
 * Create data export request
 */
export const createDataExportRequest = async (req: Request, res: Response) => {
    try {
        const { tenantId, exportType, requestedByEmail } = req.body;
        const platformUserId = (req as any).platformUser?.userId;

        const request = await prisma.dataExportRequest.create({
            data: {
                tenantId,
                requestedBy: platformUserId,
                requestedByEmail,
                exportType: exportType || 'FULL',
                status: 'PENDING',
            },
        });

        // Log security event
        await prisma.securityEvent.create({
            data: {
                tenantId,
                userEmail: requestedByEmail,
                eventType: 'DATA_EXPORT',
                metadata: { exportType, requestId: request.id },
            },
        });

        res.status(201).json({ message: 'Export request created', request });
    } catch (error) {
        console.error('Create export request error:', error);
        res.status(500).json({ error: 'Failed to create export request' });
    }
};

/**
 * Process data export (generate export file)
 */
export const processDataExport = async (req: Request, res: Response) => {
    try {
        const { requestId } = req.params;

        const request = await prisma.dataExportRequest.findUnique({
            where: { id: requestId },
            include: { tenant: true },
        });

        if (!request) {
            return res.status(404).json({ error: 'Export request not found' });
        }

        if (request.status !== 'PENDING') {
            return res.status(400).json({ error: 'Request already processed' });
        }

        // Update status to processing
        await prisma.dataExportRequest.update({
            where: { id: requestId },
            data: { status: 'PROCESSING' },
        });

        // TODO: Implement actual export logic (async job)
        // For now, just mark as completed
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

        await prisma.dataExportRequest.update({
            where: { id: requestId },
            data: {
                status: 'COMPLETED',
                fileUrl: `/exports/${requestId}.zip`,
                fileSize: 0,
                expiresAt,
                completedAt: new Date(),
            },
        });

        res.json({ message: 'Export processing started' });
    } catch (error) {
        console.error('Process export error:', error);
        res.status(500).json({ error: 'Failed to process export' });
    }
};

/**
 * Get data deletion requests
 */
export const getDataDeletionRequests = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;
        const tenantId = req.query.tenantId as string;

        const where: any = {};
        if (status) where.status = status;
        if (tenantId) where.tenantId = tenantId;

        const [requests, total] = await Promise.all([
            prisma.dataDeletionRequest.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { name: true, slug: true } },
                },
            }),
            prisma.dataDeletionRequest.count({ where }),
        ]);

        res.json({
            requests,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get deletion requests error:', error);
        res.status(500).json({ error: 'Failed to fetch deletion requests' });
    }
};

/**
 * Approve/Reject deletion request
 */
export const updateDeletionRequest = async (req: Request, res: Response) => {
    try {
        const { requestId } = req.params;
        const { status, reason } = req.body;
        const platformUserId = (req as any).platformUser?.userId;

        if (!['APPROVED', 'REJECTED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const request = await prisma.dataDeletionRequest.update({
            where: { id: requestId },
            data: {
                status,
                approvedBy: platformUserId,
                approvedAt: new Date(),
            },
        });

        // Log security event
        await prisma.securityEvent.create({
            data: {
                tenantId: request.tenantId,
                userEmail: request.requestedByEmail,
                eventType: 'DATA_DELETION',
                metadata: { 
                    requestId, 
                    status, 
                    entityType: request.entityType,
                    entityId: request.entityId 
                },
            },
        });

        res.json({ message: `Request ${status.toLowerCase()}`, request });
    } catch (error) {
        console.error('Update deletion request error:', error);
        res.status(500).json({ error: 'Failed to update deletion request' });
    }
};

/**
 * Get data retention policies
 */
export const getRetentionPolicies = async (req: Request, res: Response) => {
    try {
        const policies = await prisma.dataRetentionPolicy.findMany({
            orderBy: { createdAt: 'desc' },
            include: {
                tenant: { select: { name: true, slug: true } },
            },
        });

        res.json(policies);
    } catch (error) {
        console.error('Get retention policies error:', error);
        res.status(500).json({ error: 'Failed to fetch retention policies' });
    }
};

/**
 * Create/Update retention policy
 */
export const upsertRetentionPolicy = async (req: Request, res: Response) => {
    try {
        const { tenantId, entityType, retentionDays, autoDelete } = req.body;

        const policy = await prisma.dataRetentionPolicy.upsert({
            where: {
                tenantId_entityType: {
                    tenantId: tenantId || null,
                    entityType,
                },
            },
            update: {
                retentionDays,
                autoDelete: autoDelete !== undefined ? autoDelete : false,
            },
            create: {
                tenantId: tenantId || null,
                entityType,
                retentionDays,
                autoDelete: autoDelete !== undefined ? autoDelete : false,
            },
        });

        res.json({ message: 'Retention policy saved', policy });
    } catch (error) {
        console.error('Upsert retention policy error:', error);
        res.status(500).json({ error: 'Failed to save retention policy' });
    }
};

/**
 * Get backup logs
 */
export const getBackupLogs = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;

        const where: any = {};
        if (status) where.status = status;

        const [logs, total] = await Promise.all([
            prisma.backupLog.findMany({
                where,
                skip,
                take: limit,
                orderBy: { startedAt: 'desc' },
            }),
            prisma.backupLog.count({ where }),
        ]);

        res.json({
            logs: logs.map(log => ({
                ...log,
                fileSize: log.fileSize ? Number(log.fileSize) : null,
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get backup logs error:', error);
        res.status(500).json({ error: 'Failed to fetch backup logs' });
    }
};

/**
 * Trigger manual backup
 */
export const triggerBackup = async (req: Request, res: Response) => {
    try {
        const { backupType, tenantId } = req.body;

        const log = await prisma.backupLog.create({
            data: {
                backupType: backupType || 'FULL',
                tenantId: tenantId || null,
                status: 'STARTED',
            },
        });

        // TODO: Implement actual backup logic (async job)
        // For now, just mark as completed
        setTimeout(async () => {
            await prisma.backupLog.update({
                where: { id: log.id },
                data: {
                    status: 'COMPLETED',
                    completedAt: new Date(),
                    fileSize: BigInt(1024 * 1024 * 100), // 100MB example
                    fileLocation: `/backups/${log.id}.sql.gz`,
                    recordCount: 10000,
                    duration: 60,
                },
            });
        }, 1000);

        res.json({ message: 'Backup started', log });
    } catch (error) {
        console.error('Trigger backup error:', error);
        res.status(500).json({ error: 'Failed to trigger backup' });
    }
};
