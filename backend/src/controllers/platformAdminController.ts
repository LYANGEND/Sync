import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { logSecurityEvent, checkAndLockAccount, isAccountLocked, getClientIp, calculateRiskScore } from '../middleware/securityLogger';

const prisma = new PrismaClient();

// ==========================================
// PLATFORM ADMIN AUTHENTICATION
// ==========================================

const platformLoginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

/**
 * Platform admin login
 */
export const platformLogin = async (req: Request, res: Response) => {
    try {
        const { email, password } = platformLoginSchema.parse(req.body);
        const ipAddress = getClientIp(req);
        const userAgent = req.headers['user-agent'];

        // Check if account is locked
        if (await isAccountLocked(email)) {
            await logSecurityEvent({
                userEmail: email,
                eventType: 'FAILED_LOGIN',
                status: 'FAILED_ACCOUNT_LOCKED',
                ipAddress,
                userAgent,
                riskScore: 100,
                metadata: { reason: 'Platform admin account locked', isPlatformUser: true }
            });
            return res.status(403).json({
                error: 'Account locked',
                message: 'Your account has been locked. Please contact support.'
            });
        }

        // Find platform user
        const platformUser = await prisma.platformUser.findUnique({
            where: { email },
        });

        if (!platformUser || !platformUser.isActive) {
            const riskScore = await calculateRiskScore(email, ipAddress);
            await logSecurityEvent({
                userEmail: email,
                eventType: 'FAILED_LOGIN',
                status: platformUser ? 'FAILED_PASSWORD' : 'FAILED_USER_NOT_FOUND',
                ipAddress,
                userAgent,
                riskScore,
                metadata: { reason: platformUser ? 'Account inactive' : 'User not found', isPlatformUser: true }
            });
            
            await checkAndLockAccount(email);
            
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, platformUser.passwordHash);
        if (!isValid) {
            const riskScore = await calculateRiskScore(email, ipAddress);
            await logSecurityEvent({
                userId: platformUser.id,
                userEmail: email,
                eventType: 'FAILED_LOGIN',
                status: 'FAILED_PASSWORD',
                ipAddress,
                userAgent,
                riskScore,
                metadata: { reason: 'Invalid password', isPlatformUser: true }
            });
            
            await checkAndLockAccount(email, undefined, platformUser.id);
            
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Log successful login
        await logSecurityEvent({
            userId: platformUser.id,
            userEmail: email,
            eventType: 'SUCCESSFUL_LOGIN',
            status: 'SUCCESS',
            ipAddress,
            userAgent,
            riskScore: 0,
            metadata: { loginMethod: 'password', isPlatformUser: true, role: platformUser.role }
        });

        // Generate token
        const token = jwt.sign(
            {
                userId: platformUser.id,
                email: platformUser.email,
                role: platformUser.role,
                isPlatformUser: true,
            },
            process.env.JWT_SECRET || 'supersecretkey',
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: platformUser.id,
                email: platformUser.email,
                fullName: platformUser.fullName,
                role: platformUser.role,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Platform login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// ==========================================
// ANNOUNCEMENTS
// ==========================================

export const createAnnouncement = async (req: Request, res: Response) => {
    try {
        const { title, message, type, expiresAt } = req.body;
        const announcement = await prisma.platformAnnouncement.create({
            data: {
                title,
                message,
                type: type || 'INFO',
                isActive: true,
                expiresAt: expiresAt ? new Date(expiresAt) : null
            }
        });
        res.json(announcement);
    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({ error: 'Failed to create announcement' });
    }
};

export const getAllAnnouncements = async (req: Request, res: Response) => {
    try {
        const announcements = await prisma.platformAnnouncement.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(announcements);
    } catch (error) {
        console.error('Get announcements error:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
};

export const deleteAnnouncement = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await prisma.platformAnnouncement.delete({ where: { id } });
        res.json({ message: 'Deleted successfully' });
    } catch (error) {
        console.error('Delete announcement error:', error);
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
};

export const toggleAnnouncementStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const announcement = await prisma.platformAnnouncement.findUnique({ where: { id } });
        if (!announcement) return res.status(404).json({ error: 'Not found' });

        await prisma.platformAnnouncement.update({
            where: { id },
            data: { isActive: !announcement.isActive }
        });
        res.json({ message: 'Status updated' });
    } catch (error) {
        console.error('Toggle status error:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
};

// ==========================================
// OPS COMMUNICATION CENTER
// ==========================================

/**
 * Send bulk email to schools
 */
export const sendBulkEmailToSchools = async (req: Request, res: Response) => {
    try {
        const { subject, message, targetTiers, targetStatuses, tenantIds } = req.body;

        // Build filter
        const where: any = {};
        if (targetTiers && targetTiers.length > 0) {
            where.tier = { in: targetTiers };
        }
        if (targetStatuses && targetStatuses.length > 0) {
            where.status = { in: targetStatuses };
        }
        if (tenantIds && tenantIds.length > 0) {
            where.id = { in: tenantIds };
        }

        // Get target tenants
        const tenants = await prisma.tenant.findMany({
            where,
            select: { id: true, name: true, email: true },
        });

        if (tenants.length === 0) {
            return res.status(400).json({ error: 'No schools match the criteria' });
        }

        // Use email template service
        const { announcementTemplate } = require('../services/emailTemplateService');
        const { sendEmailForTenant } = require('../services/emailService');

        // Send emails
        const results = [];
        for (const tenant of tenants) {
            try {
                const html = await announcementTemplate({
                    tenantId: tenant.id,
                    recipientName: tenant.name,
                    subject,
                    message,
                });

                const sent = await sendEmailForTenant(tenant.id, tenant.email, subject, html);
                results.push({ tenantId: tenant.id, name: tenant.name, success: sent });
            } catch (error: any) {
                results.push({ tenantId: tenant.id, name: tenant.name, success: false, error: error.message });
            }
        }

        const successCount = results.filter(r => r.success).length;

        res.json({
            message: `Sent ${successCount} of ${tenants.length} emails`,
            total: tenants.length,
            successful: successCount,
            failed: tenants.length - successCount,
            results,
        });
    } catch (error) {
        console.error('Send bulk email error:', error);
        res.status(500).json({ error: 'Failed to send bulk email' });
    }
};

/**
 * Send SMS to schools
 */
export const sendBulkSMSToSchools = async (req: Request, res: Response) => {
    try {
        const { message, targetTiers, targetStatuses, tenantIds } = req.body;

        // Build filter
        const where: any = {};
        if (targetTiers && targetTiers.length > 0) {
            where.tier = { in: targetTiers };
        }
        if (targetStatuses && targetStatuses.length > 0) {
            where.status = { in: targetStatuses };
        }
        if (tenantIds && tenantIds.length > 0) {
            where.id = { in: tenantIds };
        }

        // Get target tenants with phone numbers
        const tenants = await prisma.tenant.findMany({
            where: {
                ...where,
                phone: { not: null },
            },
            select: { id: true, name: true, phone: true },
        });

        if (tenants.length === 0) {
            return res.status(400).json({ error: 'No schools with phone numbers match the criteria' });
        }

        // TODO: Implement SMS sending using platform SMS service
        // For now, just log
        console.log(`Would send SMS to ${tenants.length} schools: ${message}`);

        res.json({
            message: `SMS queued for ${tenants.length} schools`,
            total: tenants.length,
            recipients: tenants.map(t => ({ name: t.name, phone: t.phone })),
        });
    } catch (error) {
        console.error('Send bulk SMS error:', error);
        res.status(500).json({ error: 'Failed to send bulk SMS' });
    }
};

/**
 * Send in-app notification to schools
 */
export const sendBulkNotificationToSchools = async (req: Request, res: Response) => {
    try {
        const { title, message, type, targetTiers, targetStatuses, tenantIds } = req.body;

        // Build filter
        const where: any = {};
        if (targetTiers && targetTiers.length > 0) {
            where.tier = { in: targetTiers };
        }
        if (targetStatuses && targetStatuses.length > 0) {
            where.status = { in: targetStatuses };
        }
        if (tenantIds && tenantIds.length > 0) {
            where.id = { in: tenantIds };
        }

        // Get target tenants
        const tenants = await prisma.tenant.findMany({
            where,
            select: { id: true, name: true },
        });

        if (tenants.length === 0) {
            return res.status(400).json({ error: 'No schools match the criteria' });
        }

        // Get admin users for each tenant
        const notifications = [];
        for (const tenant of tenants) {
            const adminUsers = await prisma.user.findMany({
                where: {
                    tenantId: tenant.id,
                    role: 'SUPER_ADMIN',
                },
                select: { id: true },
            });

            // Create notifications for each admin
            for (const user of adminUsers) {
                await prisma.notification.create({
                    data: {
                        tenantId: tenant.id,
                        userId: user.id,
                        title,
                        message,
                        type: type || 'INFO',
                        isRead: false,
                    },
                });
                notifications.push({ tenantId: tenant.id, userId: user.id });
            }
        }

        res.json({
            message: `Sent notifications to ${tenants.length} schools`,
            total: tenants.length,
            notificationCount: notifications.length,
        });
    } catch (error) {
        console.error('Send bulk notification error:', error);
        res.status(500).json({ error: 'Failed to send bulk notification' });
    }
};

/**
 * Get communication history/logs
 */
export const getCommunicationHistory = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const type = req.query.type as string; // 'announcement', 'email', 'sms', 'notification'

        let history: any[] = [];
        let total = 0;

        if (!type || type === 'announcement') {
            const announcements = await prisma.platformAnnouncement.findMany({
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
            });

            history = announcements.map(a => ({
                id: a.id,
                type: 'announcement',
                title: a.title,
                message: a.message,
                status: a.isActive ? 'active' : 'inactive',
                createdAt: a.createdAt,
            }));

            total = await prisma.platformAnnouncement.count();
        }

        res.json({
            history,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get communication history error:', error);
        res.status(500).json({ error: 'Failed to fetch communication history' });
    }
};

/**
 * Get communication statistics
 */
export const getCommunicationStats = async (req: Request, res: Response) => {
    try {
        const days = parseInt(req.query.days as string) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        // Get announcement stats
        const totalAnnouncements = await prisma.platformAnnouncement.count();
        const activeAnnouncements = await prisma.platformAnnouncement.count({
            where: { isActive: true },
        });
        const recentAnnouncements = await prisma.platformAnnouncement.count({
            where: {
                createdAt: { gte: startDate },
            },
        });

        // Get tenant stats for targeting
        const totalTenants = await prisma.tenant.count();
        const activeTenants = await prisma.tenant.count({
            where: { status: 'ACTIVE' },
        });

        const tenantsByTier = await prisma.tenant.groupBy({
            by: ['tier'],
            _count: true,
        });

        const tenantsByStatus = await prisma.tenant.groupBy({
            by: ['status'],
            _count: true,
        });

        res.json({
            announcements: {
                total: totalAnnouncements,
                active: activeAnnouncements,
                recent: recentAnnouncements,
            },
            tenants: {
                total: totalTenants,
                active: activeTenants,
                byTier: tenantsByTier.reduce((acc: any, item) => {
                    acc[item.tier] = item._count;
                    return acc;
                }, {}),
                byStatus: tenantsByStatus.reduce((acc: any, item) => {
                    acc[item.status] = item._count;
                    return acc;
                }, {}),
            },
        });
    } catch (error) {
        console.error('Get communication stats error:', error);
        res.status(500).json({ error: 'Failed to fetch communication stats' });
    }
};

/**
 * Schedule announcement for future delivery
 */
export const scheduleAnnouncement = async (req: Request, res: Response) => {
    try {
        const { title, message, type, scheduledFor, targetTiers, targetStatuses } = req.body;

        // Create announcement with scheduled date
        const announcement = await prisma.platformAnnouncement.create({
            data: {
                title,
                message,
                type: type || 'INFO',
                isActive: false, // Will be activated when scheduled time arrives
                expiresAt: null,
            },
        });

        // TODO: Implement scheduling mechanism (cron job or queue)
        // For now, just return the announcement
        console.log(`Announcement scheduled for ${scheduledFor}`);

        res.json({
            message: 'Announcement scheduled successfully',
            announcement,
            scheduledFor,
        });
    } catch (error) {
        console.error('Schedule announcement error:', error);
        res.status(500).json({ error: 'Failed to schedule announcement' });
    }
};

/**
 * Send targeted message to specific schools
 */
export const sendTargetedMessage = async (req: Request, res: Response) => {
    try {
        const { tenantIds, subject, message, channels } = req.body;
        // channels: ['email', 'sms', 'notification']

        if (!tenantIds || tenantIds.length === 0) {
            return res.status(400).json({ error: 'No schools selected' });
        }

        const tenants = await prisma.tenant.findMany({
            where: { id: { in: tenantIds } },
            select: { id: true, name: true, email: true, phone: true },
        });

        const results = {
            email: { sent: 0, failed: 0 },
            sms: { sent: 0, failed: 0 },
            notification: { sent: 0, failed: 0 },
        };

        // Send via selected channels
        for (const tenant of tenants) {
            // Email
            if (channels.includes('email')) {
                try {
                    const { announcementTemplate } = require('../services/emailTemplateService');
                    const { sendEmailForTenant } = require('../services/emailService');

                    const html = await announcementTemplate({
                        tenantId: tenant.id,
                        recipientName: tenant.name,
                        subject,
                        message,
                    });

                    const sent = await sendEmailForTenant(tenant.id, tenant.email, subject, html);
                    if (sent) results.email.sent++;
                    else results.email.failed++;
                } catch (error) {
                    results.email.failed++;
                }
            }

            // SMS
            if (channels.includes('sms') && tenant.phone) {
                // TODO: Implement SMS sending
                console.log(`Would send SMS to ${tenant.phone}`);
                results.sms.sent++;
            }

            // In-app notification
            if (channels.includes('notification')) {
                try {
                    const adminUsers = await prisma.user.findMany({
                        where: {
                            tenantId: tenant.id,
                            role: 'SUPER_ADMIN',
                        },
                        select: { id: true },
                    });

                    for (const user of adminUsers) {
                        await prisma.notification.create({
                            data: {
                                tenantId: tenant.id,
                                userId: user.id,
                                title: subject,
                                message,
                                type: 'INFO',
                                isRead: false,
                            },
                        });
                    }
                    results.notification.sent++;
                } catch (error) {
                    results.notification.failed++;
                }
            }
        }

        res.json({
            message: 'Messages sent successfully',
            totalSchools: tenants.length,
            results,
        });
    } catch (error) {
        console.error('Send targeted message error:', error);
        res.status(500).json({ error: 'Failed to send targeted message' });
    }
};

/**
 * Get message templates
 */
export const getMessageTemplates = async (req: Request, res: Response) => {
    try {
        // Predefined templates
        const templates = [
            {
                id: 'welcome',
                name: 'Welcome Message',
                subject: 'Welcome to {{platformName}}',
                message: 'Dear {{schoolName}},\n\nWelcome to our platform! We\'re excited to have you on board.',
                category: 'onboarding',
            },
            {
                id: 'payment_reminder',
                name: 'Payment Reminder',
                subject: 'Payment Reminder - {{schoolName}}',
                message: 'Dear {{schoolName}},\n\nThis is a friendly reminder about your upcoming payment.',
                category: 'billing',
            },
            {
                id: 'feature_update',
                name: 'Feature Update',
                subject: 'New Features Available',
                message: 'Dear {{schoolName}},\n\nWe\'ve added exciting new features to the platform!',
                category: 'updates',
            },
            {
                id: 'maintenance',
                name: 'Maintenance Notice',
                subject: 'Scheduled Maintenance',
                message: 'Dear {{schoolName}},\n\nWe will be performing scheduled maintenance on {{date}}.',
                category: 'system',
            },
            {
                id: 'support',
                name: 'Support Follow-up',
                subject: 'How can we help?',
                message: 'Dear {{schoolName}},\n\nWe wanted to check in and see if you need any assistance.',
                category: 'support',
            },
        ];

        res.json(templates);
    } catch (error) {
        console.error('Get message templates error:', error);
        res.status(500).json({ error: 'Failed to fetch templates' });
    }
};

/**
 * Get current platform user profile
 */
export const getPlatformProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).platformUser?.userId;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const user = await prisma.platformUser.findUnique({
            where: { id: userId },
            select: { id: true, email: true, fullName: true, role: true }
        });

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// ==========================================
// DASHBOARD & ANALYTICS
// ==========================================

/**
 * Get platform dashboard stats with enhanced revenue analytics
 */
export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        // Get tenant counts by status
        const tenantsByStatus = await prisma.tenant.groupBy({
            by: ['status'],
            _count: true,
        });

        // Get tenant counts by tier
        const tenantsByTier = await prisma.tenant.groupBy({
            by: ['tier'],
            _count: true,
        });

        // Get total counts
        const [
            totalTenants,
            totalStudents,
            totalUsers,
            totalRevenue,
            recentPayments,
        ] = await Promise.all([
            prisma.tenant.count(),
            prisma.student.count(),
            prisma.user.count(),
            prisma.subscriptionPayment.aggregate({
                where: { status: 'COMPLETED' },
                _sum: { totalAmount: true },
            }),
            prisma.subscriptionPayment.findMany({
                where: { status: 'COMPLETED' },
                orderBy: { paidAt: 'desc' },
                take: 5,
                include: {
                    tenant: { select: { name: true } },
                    plan: { select: { name: true } },
                },
            }),
        ]);

        // Get monthly revenue for chart (last 12 months)
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

        const monthlyPayments = await prisma.subscriptionPayment.findMany({
            where: {
                status: 'COMPLETED',
                paidAt: { gte: twelveMonthsAgo },
            },
            select: {
                totalAmount: true,
                paidAt: true,
                currency: true,
            },
        });

        // Group by month
        const revenueByMonth: Record<string, number> = {};
        monthlyPayments.forEach((payment) => {
            if (payment.paidAt) {
                const month = payment.paidAt.toISOString().slice(0, 7); // YYYY-MM
                revenueByMonth[month] = (revenueByMonth[month] || 0) + Number(payment.totalAmount);
            }
        });

        // Calculate revenue growth
        const currentMonth = new Date().toISOString().slice(0, 7);
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastMonthKey = lastMonth.toISOString().slice(0, 7);
        
        const currentMonthRevenue = revenueByMonth[currentMonth] || 0;
        const lastMonthRevenue = revenueByMonth[lastMonthKey] || 0;
        const revenueGrowth = lastMonthRevenue > 0 
            ? ((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 
            : 0;

        // Revenue by tier
        const revenueByTier = await prisma.subscriptionPayment.groupBy({
            by: ['planId'],
            where: { status: 'COMPLETED' },
            _sum: { totalAmount: true },
        });

        const tierRevenueMap: Record<string, number> = {};
        for (const item of revenueByTier) {
            const plan = await prisma.subscriptionPlan.findUnique({
                where: { id: item.planId },
                select: { tier: true },
            });
            if (plan) {
                tierRevenueMap[plan.tier] = (tierRevenueMap[plan.tier] || 0) + Number(item._sum.totalAmount || 0);
            }
        }

        // Average revenue per school
        const avgRevenuePerSchool = totalTenants > 0 
            ? Number(totalRevenue._sum.totalAmount || 0) / totalTenants 
            : 0;

        // Payment success rate (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentPaymentStats = await prisma.subscriptionPayment.groupBy({
            by: ['status'],
            where: { createdAt: { gte: thirtyDaysAgo } },
            _count: true,
        });

        const totalRecentPayments = recentPaymentStats.reduce((sum, item) => sum + item._count, 0);
        const successfulPayments = recentPaymentStats.find(item => item.status === 'COMPLETED')?._count || 0;
        const paymentSuccessRate = totalRecentPayments > 0 
            ? (successfulPayments / totalRecentPayments) * 100 
            : 0;

        // Get expiring subscriptions (next 7 days)
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

        const expiringSubscriptions = await prisma.tenant.findMany({
            where: {
                status: 'ACTIVE',
                subscriptionEndsAt: {
                    lte: sevenDaysFromNow,
                    gte: new Date(),
                },
            },
            select: {
                id: true,
                name: true,
                tier: true,
                subscriptionEndsAt: true,
                email: true,
            },
            take: 10,
            orderBy: { subscriptionEndsAt: 'asc' },
        });

        // School transaction volume (gateway payments)
        const schoolTransactionVolume = await prisma.payment.aggregate({
            where: {
                status: 'COMPLETED',
                method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] },
            },
            _sum: { amount: true },
            _count: true,
        });

        res.json({
            totals: {
                tenants: totalTenants,
                students: totalStudents,
                users: totalUsers,
                revenue: Number(totalRevenue._sum.totalAmount || 0),
            },
            tenantsByStatus: tenantsByStatus.reduce((acc, item) => {
                acc[item.status] = item._count;
                return acc;
            }, {} as Record<string, number>),
            tenantsByTier: tenantsByTier.reduce((acc, item) => {
                acc[item.tier] = item._count;
                return acc;
            }, {} as Record<string, number>),
            revenueByMonth,
            revenueAnalytics: {
                currentMonthRevenue,
                lastMonthRevenue,
                revenueGrowth: Number(revenueGrowth.toFixed(2)),
                revenueByTier: tierRevenueMap,
                avgRevenuePerSchool: Number(avgRevenuePerSchool.toFixed(2)),
                paymentSuccessRate: Number(paymentSuccessRate.toFixed(2)),
                schoolTransactionVolume: {
                    total: Number(schoolTransactionVolume._sum.amount || 0),
                    count: schoolTransactionVolume._count,
                },
            },
            recentPayments: recentPayments.map((p) => ({
                id: p.id,
                tenantName: p.tenant.name,
                planName: p.plan.name,
                amount: Number(p.totalAmount),
                currency: p.currency,
                paidAt: p.paidAt,
            })),
            expiringSubscriptions,
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
};

// ==========================================
// TENANT MANAGEMENT
// ==========================================

/**
 * Get all tenants with pagination and filters
 */
export const getAllTenants = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;
        const tier = req.query.tier as string;
        const search = req.query.search as string;

        const where: any = {};
        if (status) where.status = status;
        if (tier) where.tier = tier;
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
            ];
        }

        const [tenants, total] = await Promise.all([
            prisma.tenant.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    email: true,
                    phone: true,
                    tier: true,
                    status: true,
                    currentStudentCount: true,
                    currentTeacherCount: true,
                    maxStudents: true,
                    subscriptionEndsAt: true,
                    trialEndsAt: true,
                    createdAt: true,
                    _count: {
                        select: {
                            users: true,
                            students: true,
                        },
                    },
                },
            }),
            prisma.tenant.count({ where }),
        ]);

        res.json({
            tenants,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get all tenants error:', error);
        res.status(500).json({ error: 'Failed to fetch tenants' });
    }
};

// Validation schema for creating a tenant
const createTenantSchema = z.object({
    name: z.string().min(2, 'School name must be at least 2 characters'),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
    email: z.string().email('Valid email required'),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().default('ZM'),
    tier: z.string().default('FREE'),
    // Admin user details
    adminEmail: z.string().email('Valid admin email required'),
    adminPassword: z.string().min(6, 'Password must be at least 6 characters'),
    adminFullName: z.string().min(2, 'Admin name must be at least 2 characters'),
});

/**
 * Create a new tenant (school) - PLATFORM_SUPERADMIN only
 * Creates tenant with initial admin user
 */
export const createTenant = async (req: Request, res: Response) => {
    try {
        const validatedData = createTenantSchema.parse(req.body);

        // Check if slug is already taken
        const existingSlug = await prisma.tenant.findUnique({
            where: { slug: validatedData.slug },
        });
        if (existingSlug) {
            return res.status(400).json({ error: 'School slug already exists. Please choose another.' });
        }

        // Check if tenant email is already used
        const existingEmail = await prisma.tenant.findFirst({
            where: { email: validatedData.email },
        });
        if (existingEmail) {
            return res.status(400).json({ error: 'School email already in use.' });
        }

        // Get plan limits based on tier
        const plan = await prisma.subscriptionPlan.findFirst({
            where: { tier: validatedData.tier as any },
        });

        const defaultLimits = {
            maxStudents: plan?.maxStudents || 50,
            maxTeachers: plan?.maxTeachers || 5,
            maxUsers: plan?.maxUsers || 10,
            maxClasses: plan?.maxClasses || 5,
        };

        // Calculate trial end date (14 days from now)
        const trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + 14);

        // Hash admin password
        const adminPasswordHash = await bcrypt.hash(validatedData.adminPassword, 10);

        // Create tenant and admin user in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // Create tenant
            const tenant = await tx.tenant.create({
                data: {
                    name: validatedData.name,
                    slug: validatedData.slug,
                    email: validatedData.email,
                    phone: validatedData.phone,
                    address: validatedData.address,
                    city: validatedData.city,
                    country: validatedData.country,
                    tier: validatedData.tier as any,
                    status: 'TRIAL',
                    trialEndsAt,
                    ...defaultLimits,
                },
            });

            // Create initial admin user for the tenant
            const adminUser = await tx.user.create({
                data: {
                    email: validatedData.adminEmail,
                    passwordHash: adminPasswordHash,
                    fullName: validatedData.adminFullName,
                    role: 'SUPER_ADMIN',
                    tenantId: tenant.id,
                    isActive: true,
                },
            });

            // Update tenant user count
            await tx.tenant.update({
                where: { id: tenant.id },
                data: { currentUserCount: 1 },
            });

            return { tenant, adminUser };
        });

        res.status(201).json({
            message: 'School created successfully',
            tenant: {
                id: result.tenant.id,
                name: result.tenant.name,
                slug: result.tenant.slug,
                email: result.tenant.email,
                tier: result.tenant.tier,
                status: result.tenant.status,
                trialEndsAt: result.tenant.trialEndsAt,
            },
            adminUser: {
                id: result.adminUser.id,
                email: result.adminUser.email,
                fullName: result.adminUser.fullName,
                role: result.adminUser.role,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Create tenant error:', error);
        res.status(500).json({ error: 'Failed to create school' });
    }
};

/**
 * Get single tenant details
 */
export const getTenantDetails = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                _count: {
                    select: {
                        users: true,
                        students: true,
                        classes: true,
                        subjects: true,
                    },
                },
            },
        });

        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Get recent payments
        const recentPayments = await prisma.subscriptionPayment.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            include: {
                plan: { select: { name: true, tier: true } },
            },
        });

        // Get admin users
        const adminUsers = await prisma.user.findMany({
            where: { tenantId, role: 'SUPER_ADMIN' },
            select: {
                id: true,
                fullName: true,
                email: true,
                createdAt: true,
            },
        });

        res.json({
            tenant: {
                ...tenant,
                smtpPassword: tenant.smtpPassword ? '********' : null,
                smsApiKey: tenant.smsApiKey ? '********' : null,
                smsApiSecret: tenant.smsApiSecret ? '********' : null,
            },
            recentPayments,
            adminUsers,
        });
    } catch (error) {
        console.error('Get tenant details error:', error);
        res.status(500).json({ error: 'Failed to fetch tenant details' });
    }
};

/**
 * Update tenant details
 */
export const updateTenant = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { name, slug, email, phone, address, city, country, tier } = req.body;

        // Validation for uniqueness if changing slug or email
        if (slug) {
            const existingSlug = await prisma.tenant.findUnique({
                where: { slug },
            });
            if (existingSlug && existingSlug.id !== tenantId) {
                return res.status(400).json({ error: 'Slug already taken' });
            }
        }

        if (email) {
            const existingEmail = await prisma.tenant.findFirst({
                where: { email },
            });
            if (existingEmail && existingEmail.id !== tenantId) {
                return res.status(400).json({ error: 'Email already used by another school' });
            }
        }

        // Tier update logic (if tier changed, update limits)
        let limitsUpdate = {};
        if (tier) {
            const plan = await prisma.subscriptionPlan.findFirst({
                where: { tier: tier as any },
            });
            if (plan) {
                limitsUpdate = {
                    maxStudents: plan.maxStudents,
                    maxTeachers: plan.maxTeachers,
                    maxUsers: plan.maxUsers,
                    maxClasses: plan.maxClasses,
                };
            }
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: {
                name,
                slug,
                email,
                phone,
                address,
                city,
                country,
                tier: tier as any,
                ...limitsUpdate,
            },
        });

        res.json({
            message: 'Tenant updated successfully',
            tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
                email: tenant.email,
                tier: tenant.tier,
                status: tenant.status,
            },
        });
    } catch (error) {
        console.error('Update tenant error:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
};

/**
 * Update tenant subscription/status
 */
export const updateTenantSubscription = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const {
            tier,
            status,
            subscriptionEndsAt,
            maxStudents,
            maxTeachers,
            maxUsers,
            maxClasses,
            notes,
        } = req.body;

        const updateData: any = {};
        if (tier) updateData.tier = tier;
        if (status) updateData.status = status;
        if (subscriptionEndsAt) updateData.subscriptionEndsAt = new Date(subscriptionEndsAt);
        if (maxStudents !== undefined) updateData.maxStudents = maxStudents;
        if (maxTeachers !== undefined) updateData.maxTeachers = maxTeachers;
        if (maxUsers !== undefined) updateData.maxUsers = maxUsers;
        if (maxClasses !== undefined) updateData.maxClasses = maxClasses;

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
        });

        res.json({
            message: 'Tenant updated successfully',
            tenant: {
                id: tenant.id,
                name: tenant.name,
                tier: tenant.tier,
                status: tenant.status,
            },
        });
    } catch (error) {
        console.error('Update tenant error:', error);
        res.status(500).json({ error: 'Failed to update tenant' });
    }
};

/**
 * Suspend a tenant
 */
export const suspendTenant = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { reason } = req.body;

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: { status: 'SUSPENDED' },
        });

        res.json({
            message: 'Tenant suspended',
            tenant: {
                id: tenant.id,
                name: tenant.name,
                status: tenant.status,
            },
        });
    } catch (error) {
        console.error('Suspend tenant error:', error);
        res.status(500).json({ error: 'Failed to suspend tenant' });
    }
};

/**
 * Activate a tenant
 */
export const activateTenant = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { subscriptionEndsAt } = req.body;

        const updateData: any = { status: 'ACTIVE' };
        if (subscriptionEndsAt) {
            updateData.subscriptionEndsAt = new Date(subscriptionEndsAt);
        }

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
        });

        res.json({
            message: 'Tenant activated',
            tenant: {
                id: tenant.id,
                name: tenant.name,
                status: tenant.status,
            },
        });
    } catch (error) {
        console.error('Activate tenant error:', error);
        res.status(500).json({ error: 'Failed to activate tenant' });
    }
};

// ==========================================
// PAYMENT MANAGEMENT
// ==========================================

/**
 * Get all payments with filters
 */
export const getAllPayments = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;
        const tenantId = req.query.tenantId as string;

        const where: any = {};
        if (status) where.status = status;
        if (tenantId) where.tenantId = tenantId;

        const [payments, total] = await Promise.all([
            prisma.subscriptionPayment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { name: true, slug: true } },
                    plan: { select: { name: true, tier: true } },
                },
            }),
            prisma.subscriptionPayment.count({ where }),
        ]);

        res.json({
            payments: payments.map((p) => ({
                ...p,
                totalAmount: Number(p.totalAmount),
                baseAmount: Number(p.baseAmount),
                overageAmount: Number(p.overageAmount),
            })),
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get all payments error:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
};

/**
 * Manually confirm a payment
 */
export const confirmPayment = async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;
        const { externalRef, notes } = req.body;

        const payment = await prisma.subscriptionPayment.findUnique({
            where: { id: paymentId },
            include: { plan: true },
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (payment.status !== 'PENDING') {
            return res.status(400).json({ error: 'Payment already processed' });
        }

        // Update payment
        await prisma.subscriptionPayment.update({
            where: { id: paymentId },
            data: {
                status: 'COMPLETED',
                paidAt: new Date(),
                externalRef,
                notes,
                receiptNumber: `RCP-${Date.now()}`,
            },
        });

        // Activate tenant subscription
        await prisma.tenant.update({
            where: { id: payment.tenantId },
            data: {
                tier: payment.plan.tier,
                status: 'ACTIVE',
                subscriptionStartedAt: payment.periodStart,
                subscriptionEndsAt: payment.periodEnd,
                maxStudents: payment.plan.maxStudents,
                maxTeachers: payment.plan.maxTeachers,
                maxUsers: payment.plan.maxUsers,
                maxClasses: payment.plan.maxClasses,
                // Enable features based on plan
                smsEnabled: payment.plan.features.includes('sms_notifications'),
                onlineAssessmentsEnabled: payment.plan.features.includes('online_assessments'),
                parentPortalEnabled: payment.plan.features.includes('parent_portal'),
                advancedReportsEnabled: payment.plan.features.includes('advanced_reports'),
                apiAccessEnabled: payment.plan.features.includes('api_access'),
                timetableEnabled: payment.plan.features.includes('timetable'),
                syllabusEnabled: payment.plan.features.includes('syllabus_tracking'),
            },
        });

        res.json({ message: 'Payment confirmed and subscription activated' });
    } catch (error) {
        console.error('Confirm payment error:', error);
        res.status(500).json({ error: 'Failed to confirm payment' });
    }
};

/**
 * Reject a payment
 */
export const rejectPayment = async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;
        const { reason } = req.body;

        const payment = await prisma.subscriptionPayment.update({
            where: { id: paymentId },
            data: {
                status: 'FAILED',
                failureReason: reason || 'Payment rejected by admin',
            },
        });

        res.json({ message: 'Payment rejected', payment });
    } catch (error) {
        console.error('Reject payment error:', error);
        res.status(500).json({ error: 'Failed to reject payment' });
    }
};

/**
 * Get comprehensive finance analytics for Ops dashboard
 * Includes both subscription revenue and school collections
 */
export const getFinanceAnalytics = async (req: Request, res: Response) => {
    try {
        const period = req.query.period as string || 'month'; // 'day', 'week', 'month', 'year'
        
        // Calculate date ranges
        const now = new Date();
        let startDate: Date;
        let previousStartDate: Date;
        let previousEndDate: Date;
        
        switch (period) {
            case 'day':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                previousStartDate = new Date(startDate);
                previousStartDate.setDate(previousStartDate.getDate() - 1);
                previousEndDate = startDate;
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                previousStartDate = new Date(startDate);
                previousStartDate.setDate(previousStartDate.getDate() - 7);
                previousEndDate = startDate;
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
                previousEndDate = startDate;
                break;
            default: // month
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                previousEndDate = startDate;
        }

        // Fetch all analytics in parallel
        const [
            // Subscription payments (platform revenue)
            subscriptionCurrent,
            subscriptionPrevious,
            subscriptionByStatus,
            subscriptionByTier,
            
            // School collections (fee revenue via gateway)
            collectionsCurrent,
            collectionsPrevious,
            collectionsByMethod,
            collectionsByStatus,
            collectionsBySchool,
            
            // Mobile money fee analytics
            feesCurrent,
            feesPrevious,
            
            // Failed payments
            failedPayments,
            pendingPayments,
        ] = await Promise.all([
            // Current period subscription revenue
            prisma.subscriptionPayment.aggregate({
                where: {
                    status: 'COMPLETED',
                    paidAt: { gte: startDate },
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Previous period subscription revenue
            prisma.subscriptionPayment.aggregate({
                where: {
                    status: 'COMPLETED',
                    paidAt: { gte: previousStartDate, lt: previousEndDate },
                },
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Subscription by status
            prisma.subscriptionPayment.groupBy({
                by: ['status'],
                _sum: { totalAmount: true },
                _count: true,
            }),
            // Subscription by tier (via plan)
            prisma.subscriptionPayment.findMany({
                where: { status: 'COMPLETED', paidAt: { gte: startDate } },
                include: { plan: { select: { tier: true, name: true } } },
            }),
            
            // Current period school collections
            prisma.payment.aggregate({
                where: {
                    status: 'COMPLETED',
                    method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] },
                    paymentDate: { gte: startDate },
                },
                _sum: { amount: true, mobileMoneyFee: true },
                _count: true,
            }),
            // Previous period school collections
            prisma.payment.aggregate({
                where: {
                    status: 'COMPLETED',
                    method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] },
                    paymentDate: { gte: previousStartDate, lt: previousEndDate },
                },
                _sum: { amount: true, mobileMoneyFee: true },
                _count: true,
            }),
            // Collections by payment method
            prisma.payment.groupBy({
                by: ['method'],
                where: {
                    method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] },
                    paymentDate: { gte: startDate },
                },
                _sum: { amount: true, mobileMoneyFee: true },
                _count: true,
            }),
            // Collections by status
            prisma.payment.groupBy({
                by: ['status'],
                where: {
                    method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] },
                    paymentDate: { gte: startDate },
                },
                _sum: { amount: true },
                _count: true,
            }),
            // Top 10 schools by collections
            prisma.payment.groupBy({
                by: ['tenantId'],
                where: {
                    status: 'COMPLETED',
                    method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] },
                    paymentDate: { gte: startDate },
                },
                _sum: { amount: true, mobileMoneyFee: true },
                _count: true,
                orderBy: { _sum: { amount: 'desc' } },
                take: 10,
            }),
            
            // Current fees collected
            prisma.payment.aggregate({
                where: {
                    status: 'COMPLETED',
                    method: 'MOBILE_MONEY',
                    paymentDate: { gte: startDate },
                },
                _sum: { mobileMoneyFee: true },
                _count: true,
            }),
            // Previous fees collected
            prisma.payment.aggregate({
                where: {
                    status: 'COMPLETED',
                    method: 'MOBILE_MONEY',
                    paymentDate: { gte: previousStartDate, lt: previousEndDate },
                },
                _sum: { mobileMoneyFee: true },
                _count: true,
            }),
            
            // Failed payments (last 30 days)
            prisma.payment.findMany({
                where: {
                    status: 'FAILED',
                    method: 'MOBILE_MONEY',
                    paymentDate: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
                },
                include: {
                    tenant: { select: { name: true, slug: true } },
                    student: { select: { firstName: true, lastName: true } },
                },
                orderBy: { paymentDate: 'desc' },
                take: 20,
            }),
            // Pending payments
            prisma.payment.findMany({
                where: {
                    status: 'PENDING',
                    method: 'MOBILE_MONEY',
                },
                include: {
                    tenant: { select: { name: true, slug: true } },
                    student: { select: { firstName: true, lastName: true } },
                },
                orderBy: { paymentDate: 'desc' },
                take: 20,
            }),
        ]);

        // Get tenant names for top schools
        const topSchoolIds = collectionsBySchool.map(s => s.tenantId);
        const tenants = await prisma.tenant.findMany({
            where: { id: { in: topSchoolIds } },
            select: { id: true, name: true, slug: true },
        });
        const tenantMap = new Map(tenants.map(t => [t.id, t]));

        // Calculate subscription revenue by tier
        const revenueByTier: Record<string, number> = {};
        subscriptionByTier.forEach(p => {
            const tier = p.plan.tier;
            revenueByTier[tier] = (revenueByTier[tier] || 0) + Number(p.totalAmount);
        });

        // Calculate growth percentages
        const subscriptionCurrentAmount = Number(subscriptionCurrent._sum.totalAmount || 0);
        const subscriptionPreviousAmount = Number(subscriptionPrevious._sum.totalAmount || 0);
        const subscriptionGrowth = subscriptionPreviousAmount > 0 
            ? ((subscriptionCurrentAmount - subscriptionPreviousAmount) / subscriptionPreviousAmount) * 100 
            : 0;

        const collectionsCurrentAmount = Number(collectionsCurrent._sum.amount || 0);
        const collectionsPreviousAmount = Number(collectionsPrevious._sum.amount || 0);
        const collectionsGrowth = collectionsPreviousAmount > 0 
            ? ((collectionsCurrentAmount - collectionsPreviousAmount) / collectionsPreviousAmount) * 100 
            : 0;

        const feesCurrentAmount = Number(feesCurrent._sum.mobileMoneyFee || 0);
        const feesPreviousAmount = Number(feesPrevious._sum.mobileMoneyFee || 0);
        const feesGrowth = feesPreviousAmount > 0 
            ? ((feesCurrentAmount - feesPreviousAmount) / feesPreviousAmount) * 100 
            : 0;

        res.json({
            period,
            dateRange: {
                start: startDate,
                end: now,
                previousStart: previousStartDate,
                previousEnd: previousEndDate,
            },
            
            // Subscription Revenue (Platform Income)
            subscriptionRevenue: {
                current: subscriptionCurrentAmount,
                previous: subscriptionPreviousAmount,
                growth: subscriptionGrowth,
                transactionCount: subscriptionCurrent._count,
                byStatus: subscriptionByStatus.map(s => ({
                    status: s.status,
                    amount: Number(s._sum.totalAmount || 0),
                    count: s._count,
                })),
                byTier: revenueByTier,
            },
            
            // School Collections (Fee Revenue via Gateway)
            schoolCollections: {
                current: collectionsCurrentAmount,
                previous: collectionsPreviousAmount,
                growth: collectionsGrowth,
                transactionCount: collectionsCurrent._count,
                byMethod: collectionsByMethod.map(m => ({
                    method: m.method,
                    amount: Number(m._sum.amount || 0),
                    fees: Number(m._sum.mobileMoneyFee || 0),
                    count: m._count,
                })),
                byStatus: collectionsByStatus.map(s => ({
                    status: s.status,
                    amount: Number(s._sum.amount || 0),
                    count: s._count,
                })),
                topSchools: collectionsBySchool.map(s => ({
                    tenant: tenantMap.get(s.tenantId) || { name: 'Unknown', slug: '' },
                    amount: Number(s._sum.amount || 0),
                    fees: Number(s._sum.mobileMoneyFee || 0),
                    count: s._count,
                })),
            },
            
            // Processing Fees (Platform Revenue from Gateway)
            processingFees: {
                current: feesCurrentAmount,
                previous: feesPreviousAmount,
                growth: feesGrowth,
                transactionCount: feesCurrent._count,
            },
            
            // Payment Issues
            issues: {
                failed: failedPayments.map(p => ({
                    id: p.id,
                    tenant: p.tenant,
                    student: `${p.student.firstName} ${p.student.lastName}`,
                    amount: Number(p.amount),
                    transactionId: p.transactionId,
                    mobileMoneyStatus: p.mobileMoneyStatus,
                    date: p.paymentDate,
                })),
                pending: pendingPayments.map(p => ({
                    id: p.id,
                    tenant: p.tenant,
                    student: `${p.student.firstName} ${p.student.lastName}`,
                    amount: Number(p.amount),
                    transactionId: p.transactionId,
                    date: p.paymentDate,
                })),
            },
        });
    } catch (error) {
        console.error('Get finance analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch finance analytics' });
    }
};

/**
 * Get all school transactions (Fees collected by tenants)
 * Only shows Mobile Money and Bank Deposit transactions (excludes Cash)
 */
export const getAllSchoolTransactions = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const status = req.query.status as string;
        const search = req.query.search as string;
        const tenantId = req.query.tenantId as string;

        const where: any = {
            // Only show payment gateway transactions (Mobile Money and Bank Deposit)
            method: {
                in: ['MOBILE_MONEY', 'BANK_DEPOSIT']
            }
        };

        if (status) where.status = status;
        
        // Filter by specific school/tenant
        if (tenantId) where.tenantId = tenantId;

        if (search) {
            where.OR = [
                { tenant: { name: { contains: search, mode: 'insensitive' } } },
                { transactionId: { contains: search, mode: 'insensitive' } },
                { student: { firstName: { contains: search, mode: 'insensitive' } } },
                { student: { lastName: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [payments, total, feeStats] = await Promise.all([
            prisma.payment.findMany({
                where,
                skip,
                take: limit,
                orderBy: { paymentDate: 'desc' },
                include: {
                    tenant: { select: { name: true, slug: true } },
                    student: { select: { firstName: true, lastName: true, admissionNumber: true } },
                },
            }),
            prisma.payment.count({ where }),
            // Get fee statistics for completed mobile money payments
            prisma.payment.aggregate({
                where: {
                    method: 'MOBILE_MONEY',
                    status: 'COMPLETED',
                    ...(tenantId ? { tenantId } : {}),
                },
                _sum: {
                    mobileMoneyFee: true,
                    amount: true,
                },
                _count: true,
            }),
        ]);

        res.json({
            payments: payments.map((p) => ({
                id: p.id,
                tenant: p.tenant,
                studentName: `${p.student.firstName} ${p.student.lastName}`,
                admissionNumber: p.student.admissionNumber,
                amount: Number(p.amount),
                mobileMoneyFee: p.mobileMoneyFee ? Number(p.mobileMoneyFee) : 0,
                currency: 'ZMW',
                method: p.method,
                status: p.status,
                transactionId: p.transactionId,
                mobileMoneyOperator: p.mobileMoneyOperator,
                mobileMoneyPhone: p.mobileMoneyPhone,
                mobileMoneyStatus: p.mobileMoneyStatus,
                date: p.paymentDate,
            })),
            feeStats: {
                totalFeesCollected: Number(feeStats._sum.mobileMoneyFee || 0),
                totalTransactionVolume: Number(feeStats._sum.amount || 0),
                transactionCount: feeStats._count,
            },
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Get school transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch school transactions' });
    }
};

// ==========================================
// PLATFORM USER MANAGEMENT
// ==========================================

/**
 * Create a platform user
 */
export const createPlatformUser = async (req: Request, res: Response) => {
    try {
        const { email, password, fullName, role } = req.body;

        const existing = await prisma.platformUser.findUnique({
            where: { email },
        });

        if (existing) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.platformUser.create({
            data: {
                email,
                passwordHash: hashedPassword,
                fullName,
                role: role || 'PLATFORM_SUPPORT',
            },
        });

        res.status(201).json({
            message: 'Platform user created',
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Create platform user error:', error);
        res.status(500).json({ error: 'Failed to create platform user' });
    }
};

/**
 * Get all platform users
 */
export const getPlatformUsers = async (req: Request, res: Response) => {
    try {
        const users = await prisma.platformUser.findMany({
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(users);
    } catch (error) {
        console.error('Get platform users error:', error);
        res.status(500).json({ error: 'Failed to fetch platform users' });
    }
};

// ==========================================
// PLATFORM SETTINGS (SMS, Email, etc.)
// ==========================================

/**
 * Get platform settings
 */
export const getPlatformSettings = async (req: Request, res: Response) => {
    try {
        let settings = await prisma.platformSettings.findUnique({
            where: { id: 'default' },
        });

        // Create default settings if they don't exist
        if (!settings) {
            settings = await prisma.platformSettings.create({
                data: { id: 'default' },
            });
        }

        // Mask sensitive fields
        res.json({
            ...settings,
            smsApiKey: settings.smsApiKey ? '********' : null,
            smsApiSecret: settings.smsApiSecret ? '********' : null,
            emailApiKey: settings.emailApiKey ? '********' : null,
            azureEmailConnectionString: settings.azureEmailConnectionString ? '********' : null,
            azureEmailAccessKey: settings.azureEmailAccessKey ? '********' : null,
        });
    } catch (error) {
        console.error('Get platform settings error:', error);
        res.status(500).json({ error: 'Failed to fetch platform settings' });
    }
};

/**
 * Update platform settings
 */
export const updatePlatformSettings = async (req: Request, res: Response) => {
    try {
        const {
            smsProvider,
            smsApiUrl,
            smsApiKey,
            smsApiSecret,
            smsDefaultSenderId,
            smsCostPerUnit,
            emailProvider,
            emailApiKey,
            emailFromAddress,
            emailFromName,
            platformName,
            platformLogoUrl,
            supportEmail,
            supportPhone,
            allowTenantCustomSms,
            allowTenantCustomEmail,
            // Azure Email Settings
            azureEmailEnabled,
            azureEmailConnectionString,
            azureEmailFromAddress,
            azureEmailEndpoint,
            azureEmailAccessKey,
            // Mobile Money Settings (non-secret, configurable in UI)
            paymentGatewayProvider,
            mobileMoneyFeePercent,
            mobileMoneyFeeCap,
            mobileMoneyEnabled,
            allowedPaymentMethods,
            allowedOrigins,
            publicApiRateLimitPerMinute,
            paymentApiRateLimitPerMinute,
        } = req.body;

        const updateData: any = {};

        // SMS settings
        if (smsProvider !== undefined) updateData.smsProvider = smsProvider;
        if (smsApiUrl !== undefined) updateData.smsApiUrl = smsApiUrl;
        if (smsApiKey && smsApiKey !== '********') updateData.smsApiKey = smsApiKey;
        if (smsApiSecret && smsApiSecret !== '********') updateData.smsApiSecret = smsApiSecret;
        if (smsDefaultSenderId !== undefined) updateData.smsDefaultSenderId = smsDefaultSenderId;
        if (smsCostPerUnit !== undefined) updateData.smsCostPerUnit = smsCostPerUnit;

        // Email settings
        if (emailProvider !== undefined) updateData.emailProvider = emailProvider;
        if (emailApiKey && emailApiKey !== '********') updateData.emailApiKey = emailApiKey;
        if (emailFromAddress !== undefined) updateData.emailFromAddress = emailFromAddress;
        if (emailFromName !== undefined) updateData.emailFromName = emailFromName;

        // Azure Email settings
        if (azureEmailEnabled !== undefined) updateData.azureEmailEnabled = azureEmailEnabled;
        if (azureEmailConnectionString && azureEmailConnectionString !== '********') {
            updateData.azureEmailConnectionString = azureEmailConnectionString;
        }
        if (azureEmailFromAddress !== undefined) updateData.azureEmailFromAddress = azureEmailFromAddress;
        if (azureEmailEndpoint !== undefined) updateData.azureEmailEndpoint = azureEmailEndpoint;
        if (azureEmailAccessKey && azureEmailAccessKey !== '********') {
            updateData.azureEmailAccessKey = azureEmailAccessKey;
        }

        // Platform branding
        if (platformName !== undefined) updateData.platformName = platformName;
        if (platformLogoUrl !== undefined) updateData.platformLogoUrl = platformLogoUrl;
        if (supportEmail !== undefined) updateData.supportEmail = supportEmail;
        if (supportPhone !== undefined) updateData.supportPhone = supportPhone;

        // Feature toggles
        if (allowTenantCustomSms !== undefined) updateData.allowTenantCustomSms = allowTenantCustomSms;
        if (allowTenantCustomEmail !== undefined) updateData.allowTenantCustomEmail = allowTenantCustomEmail;

        // Mobile Money Settings (non-secret, configurable)
        if (paymentGatewayProvider !== undefined) updateData.paymentGatewayProvider = paymentGatewayProvider;
        if (mobileMoneyFeePercent !== undefined) updateData.mobileMoneyFeePercent = mobileMoneyFeePercent;
        if (mobileMoneyFeeCap !== undefined) updateData.mobileMoneyFeeCap = mobileMoneyFeeCap || null;
        if (mobileMoneyEnabled !== undefined) updateData.mobileMoneyEnabled = mobileMoneyEnabled;
        if (allowedPaymentMethods !== undefined) updateData.allowedPaymentMethods = allowedPaymentMethods;
        if (allowedOrigins !== undefined) updateData.allowedOrigins = allowedOrigins;
        if (publicApiRateLimitPerMinute !== undefined) updateData.publicApiRateLimitPerMinute = publicApiRateLimitPerMinute;
        if (paymentApiRateLimitPerMinute !== undefined) updateData.paymentApiRateLimitPerMinute = paymentApiRateLimitPerMinute;

        // Dynamic configuration (features and tiers)
        const { availableFeatures, availableTiers } = req.body;
        if (availableFeatures !== undefined) updateData.availableFeatures = availableFeatures;
        if (availableTiers !== undefined) updateData.availableTiers = availableTiers;

        const settings = await prisma.platformSettings.upsert({
            where: { id: 'default' },
            update: updateData,
            create: { id: 'default', ...updateData },
        });

        res.json({
            message: 'Platform settings updated',
            settings: {
                ...settings,
                smsApiKey: settings.smsApiKey ? '********' : null,
                smsApiSecret: settings.smsApiSecret ? '********' : null,
                emailApiKey: settings.emailApiKey ? '********' : null,
                azureEmailConnectionString: settings.azureEmailConnectionString ? '********' : null,
                azureEmailAccessKey: settings.azureEmailAccessKey ? '********' : null,
            },
        });
    } catch (error) {
        console.error('Update platform settings error:', error);
        res.status(500).json({ error: 'Failed to update platform settings' });
    }
};

/**
 * Update tenant SMS sender ID
 */
export const updateTenantSmsConfig = async (req: Request, res: Response) => {
    try {
        const { tenantId } = req.params;
        const { smsSenderId, smsEnabled } = req.body;

        // Validate sender ID (usually 3-11 alphanumeric characters)
        if (smsSenderId && !/^[A-Za-z0-9]{3,11}$/.test(smsSenderId)) {
            return res.status(400).json({
                error: 'Invalid Sender ID',
                message: 'Sender ID must be 3-11 alphanumeric characters',
            });
        }

        const updateData: any = {};
        if (smsSenderId !== undefined) updateData.smsSenderId = smsSenderId.toUpperCase();
        if (smsEnabled !== undefined) updateData.smsEnabled = smsEnabled;

        const tenant = await prisma.tenant.update({
            where: { id: tenantId },
            data: updateData,
            select: {
                id: true,
                name: true,
                smsSenderId: true,
                smsEnabled: true,
            },
        });

        res.json({
            message: 'Tenant SMS configuration updated',
            tenant,
        });
    } catch (error) {
        console.error('Update tenant SMS config error:', error);
        res.status(500).json({ error: 'Failed to update tenant SMS config' });
    }
};

/**
 * Get SMS configuration for all tenants
 */
export const getAllTenantsSmsConfig = async (req: Request, res: Response) => {
    try {
        const tenants = await prisma.tenant.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                tier: true,
                status: true,
                smsEnabled: true,
                smsSenderId: true,
            },
            orderBy: { name: 'asc' },
        });

        // Get platform settings
        const platformSettings = await prisma.platformSettings.findUnique({
            where: { id: 'default' },
            select: {
                smsProvider: true,
                smsDefaultSenderId: true,
                smsBalanceUnits: true,
                smsCostPerUnit: true,
            },
        });

        res.json({
            platformSettings: platformSettings || {
                smsProvider: 'zamtel',
                smsDefaultSenderId: 'SYNC',
                smsBalanceUnits: 0,
                smsCostPerUnit: 0.15,
            },
            tenants,
        });
    } catch (error) {
        console.error('Get all tenants SMS config error:', error);
        res.status(500).json({ error: 'Failed to fetch SMS configuration' });
    }
};

/**
 * Add SMS credits to platform
 */
export const addSmsCredits = async (req: Request, res: Response) => {
    try {
        const { credits } = req.body;

        if (!credits || credits <= 0) {
            return res.status(400).json({ error: 'Invalid credit amount' });
        }

        const settings = await prisma.platformSettings.update({
            where: { id: 'default' },
            data: {
                smsBalanceUnits: { increment: credits },
            },
        });

        res.json({
            message: `Added ${credits} SMS credits`,
            newBalance: settings.smsBalanceUnits,
        });
    } catch (error) {
        console.error('Add SMS credits error:', error);
        res.status(500).json({ error: 'Failed to add SMS credits' });
    }
};

// ==========================================
// SUBSCRIPTION PLAN MANAGEMENT
// ==========================================

/**
 * Get all subscription plans (Admin)
 */
export const getAllPlans = async (req: Request, res: Response) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            orderBy: { sortOrder: 'asc' },
            include: {
                _count: {
                    select: { subscriptionPayments: true }
                }
            }
        });
        res.json(plans);
    } catch (error) {
        console.error('Get all plans error:', error);
        res.status(500).json({ error: 'Failed to fetch plans' });
    }
};

/**
 * Create a new subscription plan
 */
export const createPlan = async (req: Request, res: Response) => {
    try {
        const data = req.body;

        // Ensure tier is unique
        const existing = await prisma.subscriptionPlan.findUnique({
            where: { tier: data.tier }
        });

        if (existing) {
            return res.status(400).json({ error: 'Plan with this tier already exists' });
        }

        const plan = await prisma.subscriptionPlan.create({
            data: {
                name: data.name,
                tier: data.tier,
                description: data.description || '',
                // Pricing
                monthlyPriceZMW: data.monthlyPriceZMW || 0,
                yearlyPriceZMW: data.yearlyPriceZMW || 0,
                monthlyPriceUSD: data.monthlyPriceUSD || 0,
                yearlyPriceUSD: data.yearlyPriceUSD || 0,
                // Limits
                includedStudents: data.includedStudents || data.maxStudents || 50,
                maxStudents: data.maxStudents || 50,
                maxTeachers: data.maxTeachers || 5,
                maxUsers: data.maxUsers || 10,
                maxClasses: data.maxClasses || 5,
                maxStorageGB: data.maxStorageGB || 1,
                monthlyApiCallLimit: data.monthlyApiCallLimit || 0,
                // Features
                features: data.features || [],
                isActive: data.isActive !== undefined ? data.isActive : true,
                isPopular: data.isPopular || false,
                sortOrder: data.sortOrder || 0,
            }
        });

        res.status(201).json({ message: 'Plan created successfully', plan });
    } catch (error) {
        console.error('Create plan error:', error);
        res.status(500).json({ error: 'Failed to create plan' });
    }
};

/**
 * Update an existing subscription plan
 */
export const updatePlan = async (req: Request, res: Response) => {
    try {
        const { planId } = req.params;
        const data = req.body;

        // Remove fields that shouldn't be updated directly
        const { id, createdAt, updatedAt, _count, subscriptionPayments, ...updateData } = data;

        const plan = await prisma.subscriptionPlan.update({
            where: { id: planId },
            data: updateData
        });

        res.json({ message: 'Plan updated successfully', plan });
    } catch (error) {
        console.error('Update plan error:', error);
        res.status(500).json({ error: 'Failed to update plan' });
    }
};

/**
 * Toggle plan status (Active/Inactive)
 */
export const togglePlanStatus = async (req: Request, res: Response) => {
    try {
        const { planId } = req.params;
        const { isActive } = req.body;

        const plan = await prisma.subscriptionPlan.update({
            where: { id: planId },
            data: { isActive }
        });

        res.json({ message: `Plan marked as ${isActive ? 'active' : 'inactive'}`, plan });
    } catch (error) {
        console.error('Toggle plan status error:', error);
        res.status(500).json({ error: 'Failed to update plan status' });
    }
};

// ==========================================
// EXPORT REPORTS
// ==========================================

/**
 * Export tenants to CSV
 */
export const exportTenants = async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string;
        const tier = req.query.tier as string;

        const where: any = {};
        if (status) where.status = status;
        if (tier) where.tier = tier;

        const tenants = await prisma.tenant.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            select: {
                name: true,
                slug: true,
                email: true,
                phone: true,
                tier: true,
                status: true,
                currentStudentCount: true,
                currentTeacherCount: true,
                currentUserCount: true,
                maxStudents: true,
                subscriptionEndsAt: true,
                createdAt: true,
            },
        });

        // Convert to CSV format
        const headers = [
            'School Name',
            'Slug',
            'Email',
            'Phone',
            'Tier',
            'Status',
            'Students',
            'Teachers',
            'Users',
            'Max Students',
            'Subscription Ends',
            'Created Date',
        ];

        const rows = tenants.map(t => [
            t.name,
            t.slug,
            t.email,
            t.phone || '',
            t.tier,
            t.status,
            t.currentStudentCount,
            t.currentTeacherCount,
            t.currentUserCount,
            t.maxStudents,
            t.subscriptionEndsAt ? new Date(t.subscriptionEndsAt).toLocaleDateString() : '',
            new Date(t.createdAt).toLocaleDateString(),
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=schools-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export tenants error:', error);
        res.status(500).json({ error: 'Failed to export tenants' });
    }
};

/**
 * Export subscription payments to CSV
 */
export const exportSubscriptionPayments = async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string;
        const tenantId = req.query.tenantId as string;

        const where: any = {};
        if (status) where.status = status;
        if (tenantId) where.tenantId = tenantId;

        const payments = await prisma.subscriptionPayment.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            include: {
                tenant: { select: { name: true, slug: true } },
                plan: { select: { name: true, tier: true } },
            },
        });

        const headers = [
            'School Name',
            'Plan',
            'Tier',
            'Base Amount',
            'Overage Students',
            'Overage Amount',
            'Total Amount',
            'Currency',
            'Payment Method',
            'Status',
            'Billing Cycle',
            'Receipt Number',
            'External Ref',
            'Period Start',
            'Period End',
            'Paid At',
            'Created At',
        ];

        const rows = payments.map(p => [
            p.tenant.name,
            p.plan.name,
            p.plan.tier,
            Number(p.baseAmount),
            p.overageStudents,
            Number(p.overageAmount),
            Number(p.totalAmount),
            p.currency,
            p.paymentMethod,
            p.status,
            p.billingCycle,
            p.receiptNumber || '',
            p.externalRef || '',
            new Date(p.periodStart).toLocaleDateString(),
            new Date(p.periodEnd).toLocaleDateString(),
            p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '',
            new Date(p.createdAt).toLocaleDateString(),
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=subscription-payments-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export subscription payments error:', error);
        res.status(500).json({ error: 'Failed to export payments' });
    }
};

/**
 * Export school transactions to CSV
 */
export const exportSchoolTransactions = async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string;
        const tenantId = req.query.tenantId as string;

        const where: any = {
            method: { in: ['MOBILE_MONEY', 'BANK_DEPOSIT'] }
        };
        if (status) where.status = status;
        if (tenantId) where.tenantId = tenantId;

        const payments = await prisma.payment.findMany({
            where,
            orderBy: { paymentDate: 'desc' },
            include: {
                tenant: { select: { name: true, slug: true } },
                student: { select: { firstName: true, lastName: true, admissionNumber: true } },
            },
        });

        const headers = [
            'School Name',
            'Student Name',
            'Admission Number',
            'Amount',
            'Payment Method',
            'Transaction ID',
            'Status',
            'Payment Date',
            'Notes',
        ];

        const rows = payments.map(p => [
            p.tenant.name,
            `${p.student.firstName} ${p.student.lastName}`,
            p.student.admissionNumber,
            Number(p.amount),
            p.method,
            p.transactionId || '',
            p.status,
            new Date(p.paymentDate).toLocaleDateString(),
            p.notes || '',
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=school-transactions-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('Export school transactions error:', error);
        res.status(500).json({ error: 'Failed to export transactions' });
    }
};

// ==========================================
// BULK EMAIL TO SCHOOLS
// ==========================================

/**
 * Send bulk email to schools
 */
export const sendBulkEmail = async (req: Request, res: Response) => {
    try {
        const { subject, message, targetTiers, targetStatuses, tenantIds } = req.body;

        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }

        // Build filter criteria
        const where: any = {};
        if (targetTiers && targetTiers.length > 0) {
            where.tier = { in: targetTiers };
        }
        if (targetStatuses && targetStatuses.length > 0) {
            where.status = { in: targetStatuses };
        }
        if (tenantIds && tenantIds.length > 0) {
            where.id = { in: tenantIds };
        }

        // Get matching tenants
        const tenants = await prisma.tenant.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
            },
        });

        if (tenants.length === 0) {
            return res.json({
                message: 'No schools match the criteria',
                recipientCount: 0,
                recipients: [],
            });
        }

        // Use email template service for better formatting
        const { announcementTemplate } = require('../services/emailTemplateService');
        const { queueEmails } = require('../services/emailQueueService');

        // Queue emails using the email queue service
        const emailPromises = tenants.map(async (tenant) => {
            const html = await announcementTemplate({
                tenantId: tenant.id,
                recipientName: tenant.name,
                subject,
                message,
                preheader: message.substring(0, 100),
            });

            return {
                tenantId: tenant.id,
                to: tenant.email,
                subject,
                html,
            };
        });

        const emails = await Promise.all(emailPromises);
        queueEmails(emails);

        res.json({
            message: `Bulk email queued for ${tenants.length} schools`,
            recipientCount: tenants.length,
            recipients: tenants.map(t => ({ name: t.name, email: t.email })),
        });
    } catch (error) {
        console.error('Send bulk email error:', error);
        res.status(500).json({ error: 'Failed to send bulk email' });
    }
};

// ==========================================
// INVOICE GENERATION
// ==========================================

/**
 * Generate and download invoice PDF for subscription payment
 */
export const generateInvoice = async (req: Request, res: Response) => {
    try {
        const { paymentId } = req.params;

        const { generateSubscriptionInvoice } = require('../services/invoiceService');
        
        const pdfBuffer = await generateSubscriptionInvoice(paymentId);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${paymentId}.pdf`);
        res.send(pdfBuffer);
    } catch (error: any) {
        console.error('Generate invoice error:', error);
        
        if (error.message === 'Payment not found') {
            return res.status(404).json({ error: 'Payment not found' });
        }
        
        if (error.message.includes('PDFKit not installed')) {
            return res.status(500).json({ 
                error: 'PDF generation not available', 
                message: 'Install pdfkit package to enable invoice generation' 
            });
        }
        
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
};
