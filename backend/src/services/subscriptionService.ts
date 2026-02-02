import { PrismaClient, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Feature keys that can be checked against subscription plans
 */
export const FEATURES = {
    ATTENDANCE: 'attendance',
    FEE_MANAGEMENT: 'fee_management',
    REPORT_CARDS: 'report_cards',
    PARENT_PORTAL: 'parent_portal',
    EMAIL_NOTIFICATIONS: 'email_notifications',
    SMS_NOTIFICATIONS: 'sms_notifications',
    ONLINE_ASSESSMENTS: 'online_assessments',
    TIMETABLE: 'timetable',
    SYLLABUS_TRACKING: 'syllabus_tracking',
    ADVANCED_REPORTS: 'advanced_reports',
    API_ACCESS: 'api_access',
    WHITE_LABEL: 'white_label',
    DATA_EXPORT: 'data_export',
    BASIC_REPORTS: 'basic_reports',
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

/**
 * Resource types for limit checking
 */
export type ResourceType = 'students' | 'teachers' | 'users' | 'classes';

/**
 * Subscription check result
 */
export interface SubscriptionCheckResult {
    allowed: boolean;
    reason?: string;
    currentCount?: number;
    maxAllowed?: number;
    tier?: string;
    status?: SubscriptionStatus;
    upgradeRequired?: boolean;
    daysUntilExpiry?: number;
}

/**
 * Get the subscription plan limits for a tenant
 */
export async function getTenantSubscription(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
            id: true,
            name: true,
            tier: true,
            status: true,
            trialEndsAt: true,
            subscriptionEndsAt: true,
            maxStudents: true,
            maxTeachers: true,
            maxUsers: true,
            maxClasses: true,
            currentStudentCount: true,
            currentTeacherCount: true,
            currentUserCount: true,
            smsEnabled: true,
            emailEnabled: true,
            onlineAssessmentsEnabled: true,
            parentPortalEnabled: true,
            reportCardsEnabled: true,
            attendanceEnabled: true,
            feeManagementEnabled: true,
            timetableEnabled: true,
            syllabusEnabled: true,
            apiAccessEnabled: true,
            advancedReportsEnabled: true,
            // AI Features
            aiLessonPlanEnabled: true,
            aiTutorEnabled: true,
            aiAnalyticsEnabled: true,
            aiReportCardsEnabled: true,
            aiAssessmentsEnabled: true,
        },
    });

    return tenant;
}

/**
 * Check if the subscription is active (not expired or suspended)
 */
export async function checkSubscriptionActive(tenantId: string): Promise<SubscriptionCheckResult> {
    const tenant = await getTenantSubscription(tenantId);

    if (!tenant) {
        return {
            allowed: false,
            reason: 'Tenant not found',
        };
    }

    const now = new Date();

    // Check subscription status
    if (tenant.status === 'SUSPENDED') {
        return {
            allowed: false,
            reason: 'Your subscription has been suspended. Please contact support.',
            status: tenant.status,
            tier: tenant.tier,
            upgradeRequired: true,
        };
    }

    if (tenant.status === 'CANCELLED') {
        return {
            allowed: false,
            reason: 'Your subscription has been cancelled.',
            status: tenant.status,
            tier: tenant.tier,
            upgradeRequired: true,
        };
    }

    if (tenant.status === 'EXPIRED') {
        return {
            allowed: false,
            reason: 'Your subscription has expired. Please renew to continue.',
            status: tenant.status,
            tier: tenant.tier,
            upgradeRequired: true,
        };
    }

    // Check trial expiry
    if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
        if (now > tenant.trialEndsAt) {
            return {
                allowed: false,
                reason: 'Your trial period has ended. Please subscribe to continue.',
                status: tenant.status,
                tier: tenant.tier,
                upgradeRequired: true,
            };
        }

        const daysLeft = Math.ceil((tenant.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
            allowed: true,
            tier: tenant.tier,
            status: tenant.status,
            daysUntilExpiry: daysLeft,
        };
    }

    // Check subscription expiry
    if (tenant.status === 'ACTIVE' && tenant.subscriptionEndsAt) {
        if (now > tenant.subscriptionEndsAt) {
            return {
                allowed: false,
                reason: 'Your subscription has expired. Please renew to continue.',
                status: 'EXPIRED',
                tier: tenant.tier,
                upgradeRequired: true,
            };
        }

        const daysLeft = Math.ceil((tenant.subscriptionEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
            allowed: true,
            tier: tenant.tier,
            status: tenant.status,
            daysUntilExpiry: daysLeft,
        };
    }

    return {
        allowed: true,
        tier: tenant.tier,
        status: tenant.status,
    };
}

/**
 * Check if a resource limit has been reached
 */
export async function checkResourceLimit(
    tenantId: string,
    resourceType: ResourceType,
    increment: number = 1
): Promise<SubscriptionCheckResult> {
    const tenant = await getTenantSubscription(tenantId);

    if (!tenant) {
        return {
            allowed: false,
            reason: 'Tenant not found',
        };
    }

    let currentCount: number;
    let maxAllowed: number;
    let resourceName: string;

    switch (resourceType) {
        case 'students':
            currentCount = tenant.currentStudentCount;
            maxAllowed = tenant.maxStudents;
            resourceName = 'students';
            break;
        case 'teachers':
            currentCount = tenant.currentTeacherCount;
            maxAllowed = tenant.maxTeachers;
            resourceName = 'teachers';
            break;
        case 'users':
            currentCount = tenant.currentUserCount;
            maxAllowed = tenant.maxUsers;
            resourceName = 'users';
            break;
        case 'classes':
            // Get actual class count from database
            const classCount = await prisma.class.count({ where: { tenantId } });
            currentCount = classCount;
            maxAllowed = tenant.maxClasses;
            resourceName = 'classes';
            break;
        default:
            return { allowed: true };
    }

    // 0 means unlimited
    if (maxAllowed === 0) {
        return {
            allowed: true,
            currentCount,
            maxAllowed,
            tier: tenant.tier,
        };
    }

    if (currentCount + increment > maxAllowed) {
        return {
            allowed: false,
            reason: `You have reached your ${resourceName} limit (${currentCount}/${maxAllowed}). Please upgrade your plan.`,
            currentCount,
            maxAllowed,
            tier: tenant.tier,
            upgradeRequired: true,
        };
    }

    return {
        allowed: true,
        currentCount,
        maxAllowed,
        tier: tenant.tier,
    };
}

/**
 * Check if a feature is enabled for the tenant
 */
export async function checkFeatureAccess(
    tenantId: string,
    feature: FeatureKey
): Promise<SubscriptionCheckResult> {
    const tenant = await getTenantSubscription(tenantId);

    if (!tenant) {
        return {
            allowed: false,
            reason: 'Tenant not found',
        };
    }

    let isEnabled = false;
    let requiredTier: string = 'STARTER';

    switch (feature) {
        case FEATURES.ATTENDANCE:
            isEnabled = tenant.attendanceEnabled;
            requiredTier = 'FREE';
            break;
        case FEATURES.FEE_MANAGEMENT:
            isEnabled = tenant.feeManagementEnabled;
            requiredTier = 'FREE';
            break;
        case FEATURES.REPORT_CARDS:
            isEnabled = tenant.reportCardsEnabled;
            requiredTier = 'STARTER';
            break;
        case FEATURES.PARENT_PORTAL:
            isEnabled = tenant.parentPortalEnabled;
            requiredTier = 'STARTER';
            break;
        case FEATURES.EMAIL_NOTIFICATIONS:
            isEnabled = tenant.emailEnabled;
            requiredTier = 'STARTER';
            break;
        case FEATURES.SMS_NOTIFICATIONS:
            isEnabled = tenant.smsEnabled;
            requiredTier = 'PROFESSIONAL';
            break;
        case FEATURES.ONLINE_ASSESSMENTS:
            isEnabled = tenant.onlineAssessmentsEnabled;
            requiredTier = 'PROFESSIONAL';
            break;
        case FEATURES.TIMETABLE:
            isEnabled = tenant.timetableEnabled;
            requiredTier = 'PROFESSIONAL';
            break;
        case FEATURES.SYLLABUS_TRACKING:
            isEnabled = tenant.syllabusEnabled;
            requiredTier = 'PROFESSIONAL';
            break;
        case FEATURES.ADVANCED_REPORTS:
            isEnabled = tenant.advancedReportsEnabled;
            requiredTier = 'PROFESSIONAL';
            break;
        case FEATURES.API_ACCESS:
            isEnabled = tenant.apiAccessEnabled;
            requiredTier = 'ENTERPRISE';
            break;
        case FEATURES.BASIC_REPORTS:
            isEnabled = true; // Always enabled
            requiredTier = 'FREE';
            break;
        default:
            isEnabled = false;
    }

    if (!isEnabled) {
        return {
            allowed: false,
            reason: `This feature requires the ${requiredTier} plan or higher. Please upgrade to access.`,
            tier: tenant.tier,
            upgradeRequired: true,
        };
    }

    return {
        allowed: true,
        tier: tenant.tier,
    };
}

/**
 * Increment resource count when adding new resources
 */
export async function incrementResourceCount(
    tenantId: string,
    resourceType: 'students' | 'teachers' | 'users',
    increment: number = 1
): Promise<void> {
    const updateData: any = {};

    switch (resourceType) {
        case 'students':
            updateData.currentStudentCount = { increment };
            break;
        case 'teachers':
            updateData.currentTeacherCount = { increment };
            break;
        case 'users':
            updateData.currentUserCount = { increment };
            break;
    }

    await prisma.tenant.update({
        where: { id: tenantId },
        data: updateData,
    });
}

/**
 * Decrement resource count when removing resources
 */
export async function decrementResourceCount(
    tenantId: string,
    resourceType: 'students' | 'teachers' | 'users',
    decrement: number = 1
): Promise<void> {
    const updateData: any = {};

    switch (resourceType) {
        case 'students':
            updateData.currentStudentCount = { decrement };
            break;
        case 'teachers':
            updateData.currentTeacherCount = { decrement };
            break;
        case 'users':
            updateData.currentUserCount = { decrement };
            break;
    }

    await prisma.tenant.update({
        where: { id: tenantId },
        data: updateData,
    });
}

/**
 * Sync the resource counts with actual database counts
 */
export async function syncResourceCounts(tenantId: string): Promise<void> {
    const [studentCount, teacherCount, userCount] = await Promise.all([
        prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
        prisma.user.count({ where: { tenantId, role: 'TEACHER' } }),
        prisma.user.count({ where: { tenantId } }),
    ]);

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            currentStudentCount: studentCount,
            currentTeacherCount: teacherCount,
            currentUserCount: userCount,
        },
    });
}
