import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';
import { syncResourceCounts, getTenantSubscription } from '../services/subscriptionService';

const prisma = new PrismaClient();

/**
 * Get all available subscription plans
 */
export const getPlans = async (req: Request, res: Response) => {
    try {
        const plans = await prisma.subscriptionPlan.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                name: true,
                tier: true,
                description: true,
                monthlyPriceZMW: true,
                yearlyPriceZMW: true,
                monthlyPriceUSD: true,
                yearlyPriceUSD: true,
                pricePerStudentZMW: true,
                pricePerStudentUSD: true,
                includedStudents: true,
                maxStudents: true,
                maxTeachers: true,
                maxUsers: true,
                maxClasses: true,
                maxStorageGB: true,
                includedSmsPerMonth: true,
                includedEmailsPerMonth: true,
                features: true,
                isPopular: true,
            },
        });

        res.json(plans);
    } catch (error) {
        handleControllerError(res, error, 'getPlans');
    }
};

/**
 * Get current tenant subscription status
 */
export const getSubscriptionStatus = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);

        // Sync resource counts first
        await syncResourceCounts(tenantId);

        const tenant = await getTenantSubscription(tenantId);

        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Get the plan details
        const plan = await prisma.subscriptionPlan.findFirst({
            where: { tier: tenant.tier, isActive: true },
        });

        // Calculate days until expiry
        let daysUntilExpiry: number | null = null;
        let expiryDate: Date | null = null;

        if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
            expiryDate = tenant.trialEndsAt;
        } else if (tenant.subscriptionEndsAt) {
            expiryDate = tenant.subscriptionEndsAt;
        }

        if (expiryDate) {
            daysUntilExpiry = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        }

        // Get recent payments
        const recentPayments = await prisma.subscriptionPayment.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: {
                id: true,
                totalAmount: true,
                currency: true,
                status: true,
                billingCycle: true,
                periodStart: true,
                periodEnd: true,
                paidAt: true,
                receiptNumber: true,
            },
        });

        res.json({
            subscription: {
                tier: tenant.tier,
                status: tenant.status,
                expiryDate,
                daysUntilExpiry,
                plan: plan ? {
                    name: plan.name,
                    monthlyPriceZMW: plan.monthlyPriceZMW,
                    yearlyPriceZMW: plan.yearlyPriceZMW,
                } : null,
            },
            usage: {
                students: {
                    current: tenant.currentStudentCount,
                    max: tenant.maxStudents,
                    percentage: tenant.maxStudents > 0
                        ? Math.round((tenant.currentStudentCount / tenant.maxStudents) * 100)
                        : 0,
                },
                teachers: {
                    current: tenant.currentTeacherCount,
                    max: tenant.maxTeachers,
                    percentage: tenant.maxTeachers > 0
                        ? Math.round((tenant.currentTeacherCount / tenant.maxTeachers) * 100)
                        : 0,
                },
                users: {
                    current: tenant.currentUserCount,
                    max: tenant.maxUsers,
                    percentage: tenant.maxUsers > 0
                        ? Math.round((tenant.currentUserCount / tenant.maxUsers) * 100)
                        : 0,
                },
            },
            features: {
                smsEnabled: tenant.smsEnabled,
                emailEnabled: tenant.emailEnabled,
                onlineAssessmentsEnabled: tenant.onlineAssessmentsEnabled,
                parentPortalEnabled: tenant.parentPortalEnabled,
                reportCardsEnabled: tenant.reportCardsEnabled,
                attendanceEnabled: tenant.attendanceEnabled,
                feeManagementEnabled: tenant.feeManagementEnabled,
                timetableEnabled: tenant.timetableEnabled,
                syllabusEnabled: tenant.syllabusEnabled,
                apiAccessEnabled: tenant.apiAccessEnabled,
                advancedReportsEnabled: tenant.advancedReportsEnabled,
            },
            recentPayments,
        });
    } catch (error) {
        handleControllerError(res, error, 'getSubscriptionStatus');
    }
};

/**
 * Get payment history for tenant
 */
export const getPaymentHistory = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        const [payments, total] = await Promise.all([
            prisma.subscriptionPayment.findMany({
                where: { tenantId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    plan: {
                        select: {
                            name: true,
                            tier: true,
                        },
                    },
                },
            }),
            prisma.subscriptionPayment.count({ where: { tenantId } }),
        ]);

        res.json({
            payments,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'getPaymentHistory');
    }
};

/**
 * Initiate subscription upgrade (placeholder for payment integration)
 */
export const initiateUpgrade = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { planId, billingCycle } = req.body;

        const plan = await prisma.subscriptionPlan.findUnique({
            where: { id: planId },
        });

        if (!plan) {
            return res.status(404).json({ error: 'Plan not found' });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
        });

        if (!tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        // Calculate amount based on billing cycle
        const amount = billingCycle === 'ANNUAL'
            ? plan.yearlyPriceZMW
            : plan.monthlyPriceZMW;

        // Calculate period
        const now = new Date();
        const periodEnd = new Date(now);
        if (billingCycle === 'ANNUAL') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else if (billingCycle === 'QUARTERLY') {
            periodEnd.setMonth(periodEnd.getMonth() + 3);
        } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
        }

        // Create pending payment record
        const payment = await prisma.subscriptionPayment.create({
            data: {
                tenantId,
                planId,
                baseAmount: amount,
                studentCount: tenant.currentStudentCount,
                overageStudents: 0,
                overageAmount: 0,
                totalAmount: amount,
                currency: 'ZMW',
                paymentMethod: 'pending',
                billingCycle: billingCycle || 'MONTHLY',
                periodStart: now,
                periodEnd,
                status: 'PENDING',
            },
        });

        // TODO: Integrate with payment gateway (Flutterwave, DPO, etc.)
        // For now, return payment details for manual processing

        res.json({
            paymentId: payment.id,
            amount: Number(amount),
            currency: 'ZMW',
            plan: {
                name: plan.name,
                tier: plan.tier,
            },
            billingCycle,
            periodStart: now,
            periodEnd,
            message: 'Please complete payment via Mobile Money or Bank Transfer',
            paymentInstructions: {
                mobileMoney: {
                    mtn: 'Send payment to MTN MoMo: 097XXXXXXX',
                    airtel: 'Send payment to Airtel Money: 097XXXXXXX',
                },
                bankTransfer: {
                    bank: 'Zambia National Bank',
                    accountName: 'Sync School Management',
                    accountNumber: 'XXXXXXXXXXXX',
                    reference: payment.id,
                },
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'initiateUpgrade');
    }
};

/**
 * Confirm payment (for admin/manual confirmation)
 */
export const confirmPayment = async (req: TenantRequest, res: Response) => {
    try {
        const { paymentId } = req.params;
        const { externalRef } = req.body;

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

        // Update payment status
        await prisma.subscriptionPayment.update({
            where: { id: paymentId },
            data: {
                status: 'COMPLETED',
                paidAt: new Date(),
                externalRef,
                receiptNumber: `RCP-${Date.now()}`,
            },
        });

        // Update tenant subscription
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

        res.json({
            message: 'Payment confirmed and subscription activated',
            subscription: {
                tier: payment.plan.tier,
                status: 'ACTIVE',
                expiryDate: payment.periodEnd,
            },
        });
    } catch (error) {
        handleControllerError(res, error, 'confirmPayment');
    }
};
