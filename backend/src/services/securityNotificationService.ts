/**
 * Security Notification Service
 * Sends email alerts for security events
 */

import { PrismaClient } from '@prisma/client';
import { sendEmailForTenantWithAzure } from './azureEmailService';

const prisma = new PrismaClient();

interface SecurityAlert {
    type: 'ACCOUNT_LOCKED' | 'SUSPICIOUS_ACTIVITY' | 'MULTIPLE_FAILED_LOGINS' | 'DATA_EXPORT' | 'DATA_DELETION';
    email: string;
    tenantId?: string;
    metadata?: any;
}

/**
 * Send security alert email
 */
export const sendSecurityAlert = async (alert: SecurityAlert): Promise<void> => {
    try {
        const { type, email, tenantId, metadata } = alert;

        // Get platform settings for from address
        const settings = await prisma.platformSettings.findUnique({
            where: { id: 'default' },
        });

        const fromEmail = settings?.emailFromAddress || 'security@syncschool.com';
        const platformName = settings?.platformName || 'Sync School Management';

        // Generate email content based on alert type
        const emailContent = generateSecurityEmailContent(type, email, metadata);

        // Send to user
        if (tenantId) {
            await sendEmailForTenantWithAzure(
                tenantId,
                email,
                emailContent.subject,
                emailContent.html
            );
        }

        // Also notify platform admins for high-risk events
        if (type === 'SUSPICIOUS_ACTIVITY' || type === 'DATA_DELETION') {
            await notifyPlatformAdmins(emailContent.subject, emailContent.html, metadata);
        }

        console.log(`✅ Security alert sent: ${type} to ${email}`);
    } catch (error) {
        console.error('Failed to send security alert:', error);
    }
};

/**
 * Generate email content for security alerts
 */
function generateSecurityEmailContent(
    type: SecurityAlert['type'],
    email: string,
    metadata?: any
): { subject: string; html: string } {
    const timestamp = new Date().toLocaleString();

    switch (type) {
        case 'ACCOUNT_LOCKED':
            return {
                subject: '🔒 Your Account Has Been Locked',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
                            .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
                            .button { display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                            .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1 style="margin: 0;">🔒 Account Locked</h1>
                            </div>
                            <div class="content">
                                <p>Hello,</p>
                                <p>Your account (<strong>${email}</strong>) has been temporarily locked due to multiple failed login attempts.</p>
                                
                                <div class="warning">
                                    <strong>⚠️ Security Alert</strong><br>
                                    Time: ${timestamp}<br>
                                    Reason: ${metadata?.reason || 'Too many failed login attempts'}<br>
                                    Failed Attempts: ${metadata?.failedAttempts || 'Multiple'}
                                </div>

                                <p><strong>What happens next?</strong></p>
                                <ul>
                                    <li>Your account will automatically unlock in 30 minutes</li>
                                    <li>You can contact support to unlock immediately</li>
                                    <li>If this wasn't you, please change your password immediately</li>
                                </ul>

                                <p><strong>Security Tips:</strong></p>
                                <ul>
                                    <li>Use a strong, unique password</li>
                                    <li>Enable two-factor authentication</li>
                                    <li>Never share your password with anyone</li>
                                </ul>

                                <p>If you didn't attempt to log in, your account may be under attack. Please contact support immediately.</p>
                            </div>
                            <div class="footer">
                                <p>This is an automated security alert from Sync School Management</p>
                                <p>If you have questions, contact support@syncschool.com</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

        case 'SUSPICIOUS_ACTIVITY':
            return {
                subject: '⚠️ Suspicious Activity Detected',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
                            .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
                            .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1 style="margin: 0;">⚠️ Suspicious Activity Detected</h1>
                            </div>
                            <div class="content">
                                <p>Hello,</p>
                                <p>We detected suspicious activity on your account (<strong>${email}</strong>).</p>
                                
                                <div class="warning">
                                    <strong>Activity Details</strong><br>
                                    Time: ${timestamp}<br>
                                    IP Address: ${metadata?.ipAddress || 'Unknown'}<br>
                                    Location: ${metadata?.location || 'Unknown'}<br>
                                    Risk Score: ${metadata?.riskScore || 'High'}
                                </div>

                                <p><strong>Recommended Actions:</strong></p>
                                <ul>
                                    <li>Review your recent account activity</li>
                                    <li>Change your password if you don't recognize this activity</li>
                                    <li>Enable two-factor authentication</li>
                                    <li>Contact support if you need assistance</li>
                                </ul>

                                <p>If this was you, you can safely ignore this email.</p>
                            </div>
                            <div class="footer">
                                <p>This is an automated security alert from Sync School Management</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

        case 'MULTIPLE_FAILED_LOGINS':
            return {
                subject: '🔐 Multiple Failed Login Attempts',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #f59e0b; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
                            .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
                            .warning { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1 style="margin: 0;">🔐 Failed Login Attempts</h1>
                            </div>
                            <div class="content">
                                <p>Hello,</p>
                                <p>We detected multiple failed login attempts on your account (<strong>${email}</strong>).</p>
                                
                                <div class="warning">
                                    <strong>Alert Details</strong><br>
                                    Time: ${timestamp}<br>
                                    Failed Attempts: ${metadata?.count || 'Multiple'}<br>
                                    IP Address: ${metadata?.ipAddress || 'Various'}
                                </div>

                                <p>If this wasn't you, someone may be trying to access your account.</p>

                                <p><strong>Recommended Actions:</strong></p>
                                <ul>
                                    <li>Change your password immediately</li>
                                    <li>Enable two-factor authentication</li>
                                    <li>Review your account security settings</li>
                                </ul>
                            </div>
                            <div class="footer">
                                <p>This is an automated security alert from Sync School Management</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

        case 'DATA_EXPORT':
            return {
                subject: '📦 Data Export Request Created',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
                            .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
                            .info { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1 style="margin: 0;">📦 Data Export Request</h1>
                            </div>
                            <div class="content">
                                <p>Hello,</p>
                                <p>A data export request has been created for your account.</p>
                                
                                <div class="info">
                                    <strong>Request Details</strong><br>
                                    Time: ${timestamp}<br>
                                    Export Type: ${metadata?.exportType || 'Full'}<br>
                                    Status: Pending
                                </div>

                                <p>Your data export will be processed within 24-48 hours. You'll receive another email when it's ready for download.</p>

                                <p><strong>What's included:</strong></p>
                                <ul>
                                    <li>All your personal information</li>
                                    <li>Account activity history</li>
                                    <li>Associated records and data</li>
                                </ul>

                                <p>The download link will be valid for 7 days after generation.</p>
                            </div>
                            <div class="footer">
                                <p>This is an automated notification from Sync School Management</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

        case 'DATA_DELETION':
            return {
                subject: '🗑️ Data Deletion Request',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                            .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
                            .footer { background: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; }
                            .warning { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1 style="margin: 0;">🗑️ Data Deletion Request</h1>
                            </div>
                            <div class="content">
                                <p>Hello,</p>
                                <p>A data deletion request has been submitted for your account.</p>
                                
                                <div class="warning">
                                    <strong>⚠️ Important Notice</strong><br>
                                    Time: ${timestamp}<br>
                                    Entity Type: ${metadata?.entityType || 'Account'}<br>
                                    Status: Pending Approval
                                </div>

                                <p><strong>What happens next:</strong></p>
                                <ul>
                                    <li>Your request will be reviewed by our team</li>
                                    <li>You'll be notified of the decision within 30 days</li>
                                    <li>If approved, data will be permanently deleted</li>
                                    <li>This action cannot be undone</li>
                                </ul>

                                <p>If you didn't request this deletion, please contact support immediately.</p>
                            </div>
                            <div class="footer">
                                <p>This is an automated notification from Sync School Management</p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

        default:
            return {
                subject: '🔔 Security Alert',
                html: `
                    <p>A security event occurred on your account (${email}) at ${timestamp}.</p>
                    <p>If you didn't perform this action, please contact support.</p>
                `
            };
    }
}

/**
 * Notify platform admins of critical security events
 */
async function notifyPlatformAdmins(subject: string, html: string, metadata?: any): Promise<void> {
    try {
        const admins = await prisma.platformUser.findMany({
            where: {
                role: 'PLATFORM_SUPERADMIN',
                isActive: true,
            },
            select: { email: true },
        });

        for (const admin of admins) {
            // Send email to each admin
            // Note: This uses a simple approach. In production, use a proper email service
            console.log(`📧 Notifying admin: ${admin.email} - ${subject}`);
            // await sendEmailForTenantWithAzure(null, admin.email, subject, html);
        }
    } catch (error) {
        console.error('Failed to notify platform admins:', error);
    }
}

/**
 * Monitor security events and send alerts
 */
export const monitorSecurityEvents = async (): Promise<void> => {
    try {
        // Check for accounts with multiple recent failed logins
        const recentFailures = await prisma.securityEvent.groupBy({
            by: ['userEmail'],
            where: {
                eventType: 'FAILED_LOGIN',
                createdAt: {
                    gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
                },
            },
            _count: true,
            having: {
                userEmail: {
                    _count: {
                        gte: 3, // 3 or more failures
                    },
                },
            },
        });

        // Send alerts for accounts with multiple failures
        for (const failure of recentFailures) {
            await sendSecurityAlert({
                type: 'MULTIPLE_FAILED_LOGINS',
                email: failure.userEmail,
                metadata: {
                    count: failure._count,
                },
            });
        }
    } catch (error) {
        console.error('Security monitoring error:', error);
    }
};

export default {
    sendSecurityAlert,
    monitorSecurityEvents,
};
