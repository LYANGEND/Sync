/**
 * Scheduled Reports Service
 * 
 * Automatically generates and sends weekly/monthly reports to platform admins
 * Install: npm install node-cron @types/node-cron
 */

import { PrismaClient } from '@prisma/client';
import { queueEmails } from './emailQueueService';

const prisma = new PrismaClient();

interface ReportData {
    period: string;
    startDate: Date;
    endDate: Date;
    metrics: {
        newTenants: number;
        totalRevenue: number;
        newStudents: number;
        activeSubscriptions: number;
        expiringSubscriptions: number;
        paymentSuccessRate: number;
        topTier: string;
    };
    tenantGrowth: Array<{ date: string; count: number }>;
    revenueGrowth: Array<{ date: string; amount: number }>;
}

/**
 * Generate report data for a period
 */
export const generateReportData = async (startDate: Date, endDate: Date): Promise<ReportData> => {
    // New tenants in period
    const newTenants = await prisma.tenant.count({
        where: {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        },
    });

    // Revenue in period
    const revenueData = await prisma.subscriptionPayment.aggregate({
        where: {
            status: 'COMPLETED',
            paidAt: {
                gte: startDate,
                lte: endDate,
            },
        },
        _sum: {
            totalAmount: true,
        },
    });

    // New students in period
    const newStudents = await prisma.student.count({
        where: {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        },
    });

    // Active subscriptions
    const activeSubscriptions = await prisma.tenant.count({
        where: {
            status: 'ACTIVE',
        },
    });

    // Expiring subscriptions (next 7 days from end date)
    const sevenDaysFromEnd = new Date(endDate);
    sevenDaysFromEnd.setDate(sevenDaysFromEnd.getDate() + 7);

    const expiringSubscriptions = await prisma.tenant.count({
        where: {
            status: 'ACTIVE',
            subscriptionEndsAt: {
                gte: endDate,
                lte: sevenDaysFromEnd,
            },
        },
    });

    // Payment success rate
    const paymentStats = await prisma.subscriptionPayment.groupBy({
        by: ['status'],
        where: {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
        },
        _count: true,
    });

    const totalPayments = paymentStats.reduce((sum, item) => sum + item._count, 0);
    const successfulPayments = paymentStats.find(item => item.status === 'COMPLETED')?._count || 0;
    const paymentSuccessRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

    // Top tier
    const tierCounts = await prisma.tenant.groupBy({
        by: ['tier'],
        _count: true,
        orderBy: {
            _count: {
                tier: 'desc',
            },
        },
        take: 1,
    });

    const topTier = tierCounts[0]?.tier || 'N/A';

    // Tenant growth (daily breakdown)
    const tenantGrowth: Array<{ date: string; count: number }> = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
        const nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);

        const count = await prisma.tenant.count({
            where: {
                createdAt: {
                    gte: currentDate,
                    lt: nextDate,
                },
            },
        });

        tenantGrowth.push({
            date: currentDate.toISOString().split('T')[0],
            count,
        });

        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Revenue growth (daily breakdown)
    const revenueGrowth: Array<{ date: string; amount: number }> = [];
    const revenueDate = new Date(startDate);

    while (revenueDate <= endDate) {
        const nextDate = new Date(revenueDate);
        nextDate.setDate(nextDate.getDate() + 1);

        const dayRevenue = await prisma.subscriptionPayment.aggregate({
            where: {
                status: 'COMPLETED',
                paidAt: {
                    gte: revenueDate,
                    lt: nextDate,
                },
            },
            _sum: {
                totalAmount: true,
            },
        });

        revenueGrowth.push({
            date: revenueDate.toISOString().split('T')[0],
            amount: Number(dayRevenue._sum.totalAmount || 0),
        });

        revenueDate.setDate(revenueDate.getDate() + 1);
    }

    return {
        period: `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        startDate,
        endDate,
        metrics: {
            newTenants,
            totalRevenue: Number(revenueData._sum.totalAmount || 0),
            newStudents,
            activeSubscriptions,
            expiringSubscriptions,
            paymentSuccessRate: Number(paymentSuccessRate.toFixed(2)),
            topTier,
        },
        tenantGrowth,
        revenueGrowth,
    };
};

/**
 * Generate HTML report email
 */
export const generateReportHTML = (data: ReportData, reportType: 'weekly' | 'monthly'): string => {
    const primaryColor = '#2563eb';
    const successColor = '#059669';
    const warningColor = '#f59e0b';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${reportType === 'weekly' ? 'Weekly' : 'Monthly'} Platform Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${primaryColor} 0%, #1e40af 100%); padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; font-size: 24px; margin: 0;">
                📊 ${reportType === 'weekly' ? 'Weekly' : 'Monthly'} Platform Report
            </h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px;">
                ${data.period}
            </p>
        </div>

        <!-- Content -->
        <div style="padding: 30px;">
            
            <!-- Key Metrics -->
            <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 20px;">Key Metrics</h2>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 30px;">
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border-left: 4px solid ${successColor};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">New Schools</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${data.metrics.newTenants}</div>
                </div>
                
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border-left: 4px solid ${primaryColor};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">Revenue</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">K${data.metrics.totalRevenue.toLocaleString()}</div>
                </div>
                
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border-left: 4px solid ${warningColor};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">New Students</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${data.metrics.newStudents.toLocaleString()}</div>
                </div>
                
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border-left: 4px solid #8b5cf6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 5px;">Active Subs</div>
                    <div style="font-size: 24px; font-weight: 700; color: #1e293b;">${data.metrics.activeSubscriptions}</div>
                </div>
            </div>

            <!-- Additional Metrics -->
            <div style="background-color: #fef3c7; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <div style="font-size: 13px; color: #92400e; margin-bottom: 8px;">
                    ⚠️ <strong>${data.metrics.expiringSubscriptions}</strong> subscriptions expiring soon
                </div>
                <div style="font-size: 13px; color: #92400e;">
                    ✓ Payment success rate: <strong>${data.metrics.paymentSuccessRate}%</strong>
                </div>
            </div>

            <!-- Top Tier -->
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin-bottom: 30px;">
                <div style="font-size: 13px; color: #64748b; margin-bottom: 5px;">Most Popular Tier</div>
                <div style="font-size: 16px; font-weight: 600; color: ${primaryColor};">${data.metrics.topTier}</div>
            </div>

            <!-- Growth Summary -->
            <h3 style="color: #1e293b; font-size: 16px; margin: 0 0 15px;">Growth Summary</h3>
            
            <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                <div style="font-size: 13px; color: #64748b; margin-bottom: 10px;">Daily Tenant Signups</div>
                <div style="font-size: 11px; color: #94a3b8;">
                    ${data.tenantGrowth.slice(-7).map(d => `${d.date}: ${d.count}`).join(' | ')}
                </div>
            </div>

            <!-- CTA -->
            <div style="text-align: center; margin-top: 30px;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/platform" 
                   style="display: inline-block; background: linear-gradient(135deg, ${primaryColor} 0%, #1e40af 100%); color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 30px; border-radius: 8px;">
                    View Full Dashboard →
                </a>
            </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                Sync School Management Platform - Automated Report
            </p>
        </div>

    </div>
</body>
</html>
    `;
};

/**
 * Send weekly report
 */
export const sendWeeklyReport = async (): Promise<void> => {
    try {
        console.log('📊 Generating weekly report...');

        // Calculate date range (last 7 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        // Generate report data
        const reportData = await generateReportData(startDate, endDate);

        // Get platform admins
        const admins = await prisma.platformUser.findMany({
            where: {
                isActive: true,
                role: { in: ['PLATFORM_SUPERADMIN', 'PLATFORM_SALES'] },
            },
            select: {
                email: true,
                fullName: true,
            },
        });

        if (admins.length === 0) {
            console.log('⚠️ No platform admins found to send report to');
            return;
        }

        // Generate HTML
        const html = generateReportHTML(reportData, 'weekly');

        // Queue emails
        const emails = admins.map(admin => ({
            tenantId: 'platform', // Special tenant ID for platform emails
            to: admin.email,
            subject: `📊 Weekly Platform Report - ${reportData.period}`,
            html,
        }));

        queueEmails(emails);

        console.log(`✅ Weekly report queued for ${admins.length} admins`);
    } catch (error) {
        console.error('❌ Error sending weekly report:', error);
    }
};

/**
 * Send monthly report
 */
export const sendMonthlyReport = async (): Promise<void> => {
    try {
        console.log('📊 Generating monthly report...');

        // Calculate date range (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        // Generate report data
        const reportData = await generateReportData(startDate, endDate);

        // Get platform admins
        const admins = await prisma.platformUser.findMany({
            where: {
                isActive: true,
                role: { in: ['PLATFORM_SUPERADMIN', 'PLATFORM_SALES'] },
            },
            select: {
                email: true,
                fullName: true,
            },
        });

        if (admins.length === 0) {
            console.log('⚠️ No platform admins found to send report to');
            return;
        }

        // Generate HTML
        const html = generateReportHTML(reportData, 'monthly');

        // Queue emails
        const emails = admins.map(admin => ({
            tenantId: 'platform',
            to: admin.email,
            subject: `📊 Monthly Platform Report - ${reportData.period}`,
            html,
        }));

        queueEmails(emails);

        console.log(`✅ Monthly report queued for ${admins.length} admins`);
    } catch (error) {
        console.error('❌ Error sending monthly report:', error);
    }
};

/**
 * Initialize scheduled reports using node-cron
 * Call this in your server.ts
 */
export const initializeScheduledReports = (): void => {
    try {
        const cron = require('node-cron');

        // Weekly report - Every Monday at 9 AM
        cron.schedule('0 9 * * 1', () => {
            console.log('⏰ Running weekly report job...');
            sendWeeklyReport();
        });

        // Monthly report - First day of month at 9 AM
        cron.schedule('0 9 1 * *', () => {
            console.log('⏰ Running monthly report job...');
            sendMonthlyReport();
        });

        console.log('✅ Scheduled reports initialized');
        console.log('   - Weekly reports: Every Monday at 9 AM');
        console.log('   - Monthly reports: 1st of month at 9 AM');
    } catch (error) {
        console.warn('⚠️ node-cron not installed. Install with: npm install node-cron @types/node-cron');
        console.warn('   Scheduled reports will not run automatically');
    }
};

export default {
    generateReportData,
    generateReportHTML,
    sendWeeklyReport,
    sendMonthlyReport,
    initializeScheduledReports,
};
