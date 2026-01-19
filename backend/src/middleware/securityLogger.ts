import { PrismaClient } from '@prisma/client';
import { Request } from 'express';
import { sendSecurityAlert } from '../services/securityNotificationService';

const prisma = new PrismaClient();

interface SecurityEventData {
    tenantId?: string;
    userId?: string;
    userEmail: string;
    eventType: 'FAILED_LOGIN' | 'SUCCESSFUL_LOGIN' | 'PASSWORD_CHANGE' | 'ACCOUNT_LOCKED' | 'ACCOUNT_UNLOCKED' | 'SUSPICIOUS_ACTIVITY' | 'DATA_EXPORT' | 'DATA_DELETION' | 'PERMISSION_CHANGE';
    status?: 'SUCCESS' | 'FAILED_PASSWORD' | 'FAILED_USER_NOT_FOUND' | 'FAILED_ACCOUNT_LOCKED' | 'FAILED_2FA';
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
    riskScore?: number;
}

/**
 * Log a security event
 */
export const logSecurityEvent = async (data: SecurityEventData): Promise<void> => {
    try {
        await prisma.securityEvent.create({
            data: {
                tenantId: data.tenantId || null,
                userId: data.userId || null,
                userEmail: data.userEmail,
                eventType: data.eventType,
                status: data.status || null,
                ipAddress: data.ipAddress || null,
                userAgent: data.userAgent || null,
                metadata: data.metadata || null,
                riskScore: data.riskScore || 0,
            },
        });
    } catch (error) {
        console.error('Failed to log security event:', error);
    }
};

/**
 * Calculate risk score based on various factors
 */
export const calculateRiskScore = async (email: string, ipAddress?: string): Promise<number> => {
    let score = 0;

    // Check recent failed attempts for this email
    const recentFailures = await prisma.securityEvent.count({
        where: {
            userEmail: email,
            eventType: 'FAILED_LOGIN',
            createdAt: {
                gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
            },
        },
    });

    score += Math.min(recentFailures * 20, 60); // Max 60 points

    // Check if IP has multiple failed attempts
    if (ipAddress) {
        const ipFailures = await prisma.securityEvent.count({
            where: {
                ipAddress,
                eventType: 'FAILED_LOGIN',
                createdAt: {
                    gte: new Date(Date.now() - 60 * 60 * 1000),
                },
            },
        });

        score += Math.min(ipFailures * 10, 30); // Max 30 points
    }

    // Check if account is locked
    const accountLock = await prisma.accountLock.findUnique({
        where: { userEmail: email },
    });

    if (accountLock?.isLocked) {
        score += 50;
    }

    return Math.min(score, 100);
};

/**
 * Check and lock account if too many failed attempts
 */
export const checkAndLockAccount = async (
    email: string,
    tenantId?: string,
    userId?: string
): Promise<boolean> => {
    const recentFailures = await prisma.securityEvent.count({
        where: {
            userEmail: email,
            eventType: 'FAILED_LOGIN',
            createdAt: {
                gte: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
            },
        },
    });

    // Lock after 5 failed attempts in 15 minutes
    if (recentFailures >= 5) {
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes

        await prisma.accountLock.upsert({
            where: { userEmail: email },
            update: {
                isLocked: true,
                failedAttempts: recentFailures,
                lockReason: 'Too many failed login attempts',
                lockedAt: new Date(),
                lockedUntil: lockUntil,
            },
            create: {
                tenantId: tenantId || null,
                userId: userId || null,
                userEmail: email,
                isLocked: true,
                failedAttempts: recentFailures,
                lockReason: 'Too many failed login attempts',
                lockedUntil: lockUntil,
            },
        });

        // Log account locked event
        await logSecurityEvent({
            tenantId,
            userId,
            userEmail: email,
            eventType: 'ACCOUNT_LOCKED',
            metadata: { reason: 'Too many failed attempts', failedAttempts: recentFailures },
            riskScore: 100,
        });

        // Send email notification
        await sendSecurityAlert({
            type: 'ACCOUNT_LOCKED',
            email,
            tenantId,
            metadata: { reason: 'Too many failed login attempts', failedAttempts: recentFailures },
        });

        return true;
    }

    return false;
};

/**
 * Check if account is locked
 */
export const isAccountLocked = async (email: string): Promise<boolean> => {
    const lock = await prisma.accountLock.findUnique({
        where: { userEmail: email },
    });

    if (!lock || !lock.isLocked) {
        return false;
    }

    // Check if lock has expired
    if (lock.lockedUntil && lock.lockedUntil < new Date()) {
        // Auto-unlock
        await prisma.accountLock.update({
            where: { userEmail: email },
            data: {
                isLocked: false,
                unlockedAt: new Date(),
                failedAttempts: 0,
            },
        });

        await logSecurityEvent({
            tenantId: lock.tenantId || undefined,
            userId: lock.userId || undefined,
            userEmail: email,
            eventType: 'ACCOUNT_UNLOCKED',
            metadata: { reason: 'Auto-unlock after timeout' },
        });

        return false;
    }

    return true;
};

/**
 * Extract IP address from request
 */
export const getClientIp = (req: Request): string | undefined => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress;
};
