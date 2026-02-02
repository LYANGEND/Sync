import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TenantRequest, getTenantId, handleControllerError } from '../utils/tenantContext';
import { syncResourceCounts, getTenantSubscription } from '../services/subscriptionService';
import { initiateMobileMoneyCollection } from '../services/lencoService';

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
                monthlyApiCallLimit: true,
                features: true,
                isPopular: true,
            } as any,
        });

        // Get feature labels from platform settings
        const settings = await prisma.platformSettings.findUnique({
            where: { id: 'default' }
        });

        // Build feature label map
        const featureLabels: Record<string, string> = {};
        const features = (settings as any)?.availableFeatures || [];
        if (Array.isArray(features)) {
            features.forEach((f: any) => {
                if (f.key && f.label) featureLabels[f.key] = f.label;
            });
        }

        res.json({ plans, featureLabels });
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
                // AI Features
                aiLessonPlanEnabled: tenant.aiLessonPlanEnabled,
                aiTutorEnabled: tenant.aiTutorEnabled,
                aiAnalyticsEnabled: tenant.aiAnalyticsEnabled,
                aiReportCardsEnabled: tenant.aiReportCardsEnabled,
                aiAssessmentsEnabled: tenant.aiAssessmentsEnabled,
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
 * Pay for subscription with Mobile Money (Lenco integration)
 */
export const payWithMobileMoney = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { planId, billingCycle, operator, phoneNumber } = req.body;

        // Validate operator
        if (!['mtn', 'airtel'].includes(operator)) {
            return res.status(400).json({ error: 'Invalid operator. Use "mtn" or "airtel"' });
        }

        if (!phoneNumber) {
            return res.status(400).json({ error: 'Phone number is required' });
        }

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
        const baseAmount = billingCycle === 'ANNUAL'
            ? Number(plan.yearlyPriceZMW)
            : Number(plan.monthlyPriceZMW);

        // Add 2.5% processing fee
        const processingFee = baseAmount * 0.025;
        const totalAmount = baseAmount + processingFee;

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

        // Generate unique reference
        const reference = `SUB-${Date.now()}-${tenantId.substring(0, 8)}`;

        // Create pending payment record
        const payment = await prisma.subscriptionPayment.create({
            data: {
                tenantId,
                planId,
                baseAmount,
                studentCount: tenant.currentStudentCount,
                overageStudents: 0,
                overageAmount: processingFee,
                totalAmount,
                currency: 'ZMW',
                paymentMethod: `${operator}_momo`,
                billingCycle: billingCycle || 'MONTHLY',
                periodStart: now,
                periodEnd,
                status: 'PENDING',
                externalRef: reference,
                notes: `Mobile Money payment via ${operator.toUpperCase()}. Phone: ${phoneNumber}`,
            },
        });

        console.log(`DEBUG: Initiating subscription payment ${payment.id} for tenant ${tenantId}`);

        // Initiate Lenco Mobile Money collection
        try {
            const gatewayResponse = await initiateMobileMoneyCollection(
                totalAmount,
                phoneNumber,
                reference,
                operator as 'mtn' | 'airtel'
            );

            // Update payment with gateway response
            await prisma.subscriptionPayment.update({
                where: { id: payment.id },
                data: {
                    status: 'PROCESSING',
                    notes: `${payment.notes}\nGateway Reference: ${JSON.stringify(gatewayResponse)}`,
                },
            });

            return res.status(202).json({
                message: 'Payment initiated. Please check your phone to authorize the transaction.',
                paymentId: payment.id,
                reference,
                amount: totalAmount,
                processingFee,
                currency: 'ZMW',
                plan: {
                    name: plan.name,
                    tier: plan.tier,
                },
                billingCycle,
                periodStart: now,
                periodEnd,
                gateway: gatewayResponse,
            });
        } catch (err: any) {
            console.error('DEBUG: Lenco initiation failed for subscription:', err);

            // Mark payment as failed
            await prisma.subscriptionPayment.update({
                where: { id: payment.id },
                data: {
                    status: 'FAILED',
                    failureReason: err.message,
                },
            });

            return res.status(400).json({
                error: 'Payment initiation failed',
                message: err.message,
                paymentId: payment.id,
            });
        }
    } catch (error) {
        handleControllerError(res, error, 'payWithMobileMoney');
    }
};

/**
 * Helper: Activate subscription after successful payment
 */
export const activateSubscriptionFromPayment = async (paymentId: string) => {
    const payment = await prisma.subscriptionPayment.findUnique({
        where: { id: paymentId },
        include: { plan: true },
    });

    if (!payment || !payment.plan) {
        throw new Error('Payment or plan not found');
    }

    // Update payment status
    await prisma.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
            status: 'COMPLETED',
            paidAt: new Date(),
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
            // AI Features
            aiLessonPlanEnabled: payment.plan.features.includes('ai_lesson_planner'),
            aiTutorEnabled: payment.plan.features.includes('ai_tutor'),
            aiAnalyticsEnabled: payment.plan.features.includes('ai_analytics'),
            aiReportCardsEnabled: payment.plan.features.includes('ai_report_cards'),
            aiAssessmentsEnabled: payment.plan.features.includes('ai_assessments'),
        },
    });

    console.log(`DEBUG: Subscription activated for tenant ${payment.tenantId} with plan ${payment.plan.name}`);

    return payment;
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
                // AI Features
                aiLessonPlanEnabled: payment.plan.features.includes('ai_lesson_planner'),
                aiTutorEnabled: payment.plan.features.includes('ai_tutor'),
                aiAnalyticsEnabled: payment.plan.features.includes('ai_analytics'),
                aiReportCardsEnabled: payment.plan.features.includes('ai_report_cards'),
                aiAssessmentsEnabled: payment.plan.features.includes('ai_assessments'),
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

/**
 * Submit payment proof (User action)
 */
export const submitPaymentProof = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { paymentId } = req.params;
        const { transactionReference, notes } = req.body;

        const payment = await prisma.subscriptionPayment.findFirst({
            where: { id: paymentId, tenantId }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        if (payment.status !== 'PENDING') {
            return res.status(400).json({ error: 'Payment is not in pending state' });
        }

        const updatedPayment = await prisma.subscriptionPayment.update({
            where: { id: paymentId },
            data: {
                status: 'PROCESSING',
                externalRef: transactionReference,
                notes: notes ? (payment.notes ? `${payment.notes}\nUser Note: ${notes}` : `User Note: ${notes}`) : payment.notes
            }
        });

        res.json({
            message: 'Payment proof submitted successfully. Administrative approval pending.',
            payment: updatedPayment
        });
    } catch (error) {
        handleControllerError(res, error, 'submitPaymentProof');
    }
};

/**
 * Cancel Subscription
 */
export const cancelSubscription = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        // Don't actually delete, just mark as CANCELLED so it doesn't renew
        // In a real system we might use a Stripe 'cancel_at_period_end' flag
        await prisma.tenant.update({
            where: { id: tenantId },
            data: { status: 'CANCELLED' }
        });

        res.json({ message: 'Subscription cancelled. You will retain access until the end of your current period.' });
    } catch (error) {
        handleControllerError(res, error, 'cancelSubscription');
    }
};

/**
 * Download Invoice (HTML)
 */
export const downloadInvoice = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { paymentId } = req.params;

        const payment = await prisma.subscriptionPayment.findFirst({
            where: { id: paymentId, tenantId },
            include: { plan: true, tenant: true }
        });

        if (!payment) return res.status(404).send('Invoice not found');

        // Simple HTML Invoice
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 40px; color: #333; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
                    .title { font-size: 24px; font-weight: bold; color: #2563eb; }
                    .meta { text-align: right; }
                    .bill-to { margin-bottom: 40px; }
                    table { w-full; width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                    th { text-align: left; border-bottom: 2px solid #eee; padding: 10px; }
                    td { padding: 10px; border-bottom: 1px solid #eee; }
                    .total { text-align: right; font-size: 18px; font-weight: bold; }
                    .status { 
                        display: inline-block; padding: 5px 10px; border-radius: 4px; font-weight: bold; 
                        background: ${payment.status === 'COMPLETED' ? '#dcfce7' : '#fef9c3'}; 
                        color: ${payment.status === 'COMPLETED' ? '#166534' : '#854d0e'};
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">Sync School Management</div>
                        <div>Official Invoice</div>
                    </div>
                    <div class="meta">
                        <div>Invoice #: ${payment.receiptNumber || 'DRAFT'}</div>
                        <div>Date: ${new Date(payment.createdAt).toLocaleDateString()}</div>
                        <div class="status">${payment.status}</div>
                    </div>
                </div>

                <div class="bill-to">
                    <strong>Bill To:</strong><br>
                    ${payment.tenant.name}<br>
                    ${payment.tenant.domain || ''}
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th>Period</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>${payment.plan.name} Plan Subscription</td>
                            <td>${new Date(payment.periodStart).toLocaleDateString()} - ${new Date(payment.periodEnd).toLocaleDateString()}</td>
                            <td>${payment.currency} ${Number(payment.totalAmount).toLocaleString()}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="total">
                    Total: ${payment.currency} ${Number(payment.totalAmount).toLocaleString()}
                </div>
                
                <div style="margin-top: 50px; text-align: center; font-size: 12px; color: #888;">
                    Thank you for your business.<br>
                    Sync School Management Systems<br>
                    Lusaka, Zambia
                </div>
                
                <script>window.print();</script>
            </body>
            </html>
        `;

        res.send(html);

    } catch (error) {
        handleControllerError(res, error, 'downloadInvoice');
    }
};
