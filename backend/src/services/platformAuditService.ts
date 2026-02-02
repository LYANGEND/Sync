import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type PlatformAction =
    | 'LOGIN'
    | 'CREATE_TENANT'
    | 'UPDATE_TENANT'
    | 'SUSPEND_TENANT'
    | 'ACTIVATE_TENANT'
    | 'UPDATE_SUBSCRIPTION'
    | 'CONFIRM_PAYMENT'
    | 'REJECT_PAYMENT'
    | 'UPDATE_SETTINGS'
    | 'CREATE_PLAN'
    | 'UPDATE_PLAN'
    | 'CREATE_ANNOUNCEMENT'
    | 'DELETE_ANNOUNCEMENT'
    | 'IMPERSONATE_TENANT';

interface AuditLogData {
    userId: string;
    action: PlatformAction;
    description: string;
    entityType?: string; // 'Tenant', 'Payment', 'Plan'
    entityId?: string;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
}

export const logPlatformAudit = async (data: AuditLogData) => {
    try {
        // TODO: Add PlatformAuditLog model to schema
        // For now, just log to console
        console.log('[AUDIT]', {
            userId: data.userId,
            action: data.action,
            description: data.description,
            entityType: data.entityType,
            entityId: data.entityId,
            timestamp: new Date().toISOString(),
        });
        
        // Uncomment when PlatformAuditLog model is added:
        // await prisma.platformAuditLog.create({
        //     data: {
        //         platformUserId: data.userId,
        //         action: data.action,
        //         description: data.description,
        //         entityType: data.entityType,
        //         entityId: data.entityId,
        //         metadata: data.metadata || {},
        //         ipAddress: data.ipAddress,
        //         userAgent: data.userAgent,
        //     },
        // });
    } catch (error) {
        console.error('Failed to create platform audit log:', error);
        // Don't throw, just log error so main flow isn't interrupted
    }
};
