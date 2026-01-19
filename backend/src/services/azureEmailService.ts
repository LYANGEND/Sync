/**
 * Azure Communication Services Email Service
 * 
 * Provides email sending capabilities using Azure Communication Services
 * as an alternative to SMTP/Nodemailer for better deliverability and scalability.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AzureEmailConfig {
    connectionString?: string;
    endpoint?: string;
    accessKey?: string;
    fromAddress: string;
}

interface EmailMessage {
    to: string[];
    subject: string;
    html: string;
    text?: string;
}

/**
 * Send email using Azure Communication Services
 * Note: Install @azure/communication-email package to use this service
 * npm install @azure/communication-email
 */
export const sendEmailViaAzure = async (
    config: AzureEmailConfig,
    message: EmailMessage
): Promise<boolean> => {
    try {
        // Check if Azure SDK is available
        let EmailClient;
        try {
            const azureEmail = require('@azure/communication-email');
            EmailClient = azureEmail.EmailClient;
        } catch (error) {
            console.warn('Azure Communication Email SDK not installed. Install with: npm install @azure/communication-email');
            return false;
        }

        if (!config.connectionString && !config.endpoint) {
            console.error('Azure email configuration missing');
            return false;
        }

        // Initialize Azure Email Client
        const emailClient = config.connectionString
            ? new EmailClient(config.connectionString)
            : new EmailClient(config.endpoint!, { key: config.accessKey });

        // Prepare email message
        const emailMessage = {
            senderAddress: config.fromAddress,
            content: {
                subject: message.subject,
                html: message.html,
                plainText: message.text || message.html.replace(/<[^>]*>/g, ''), // Strip HTML for plain text
            },
            recipients: {
                to: message.to.map(email => ({ address: email })),
            },
        };

        // Send email
        const poller = await emailClient.beginSend(emailMessage);
        const result = await poller.pollUntilDone();

        console.log(`✅ Azure email sent successfully. Message ID: ${result.id}`);
        return true;
    } catch (error: any) {
        console.error('❌ Azure email error:', error.message);
        return false;
    }
};

/**
 * Send email for tenant using Azure if configured, fallback to SMTP
 */
export const sendEmailForTenantWithAzure = async (
    tenantId: string,
    to: string,
    subject: string,
    html: string
): Promise<boolean> => {
    try {
        // Get platform settings to check for Azure configuration
        const platformSettings = await prisma.platformSettings.findUnique({
            where: { id: 'default' },
        });

        // Check if Azure is enabled and configured
        if (platformSettings?.azureEmailEnabled) {
            const azureConnectionString = platformSettings.azureEmailConnectionString || process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
            const azureFromAddress = platformSettings.azureEmailFromAddress || process.env.AZURE_COMMUNICATION_FROM_ADDRESS;
            const azureEndpoint = platformSettings.azureEmailEndpoint;
            const azureAccessKey = platformSettings.azureEmailAccessKey;

            if ((azureConnectionString || (azureEndpoint && azureAccessKey)) && azureFromAddress) {
                console.log('📧 Attempting to send via Azure Communication Services...');
                
                const config: AzureEmailConfig = {
                    fromAddress: azureFromAddress,
                };

                if (azureConnectionString) {
                    config.connectionString = azureConnectionString;
                } else if (azureEndpoint && azureAccessKey) {
                    config.endpoint = azureEndpoint;
                    config.accessKey = azureAccessKey;
                }

                const success = await sendEmailViaAzure(
                    config,
                    {
                        to: [to],
                        subject,
                        html,
                    }
                );

                if (success) {
                    return true;
                }

                console.log('⚠️ Azure email failed, falling back to SMTP...');
            } else {
                console.log('⚠️ Azure email enabled but not fully configured, using SMTP...');
            }
        }

        // Fallback to existing SMTP service
        const { sendEmailForTenant } = require('./emailService');
        return await sendEmailForTenant(tenantId, to, subject, html);
    } catch (error) {
        console.error('Error in Azure email service:', error);
        
        // Fallback to SMTP
        const { sendEmailForTenant } = require('./emailService');
        return await sendEmailForTenant(tenantId, to, subject, html);
    }
};

/**
 * Send bulk emails using Azure (better for high volume)
 */
export const sendBulkEmailsViaAzure = async (
    config: AzureEmailConfig,
    messages: Array<{ to: string; subject: string; html: string }>
): Promise<{ sent: number; failed: number }> => {
    let sent = 0;
    let failed = 0;

    for (const message of messages) {
        const success = await sendEmailViaAzure(config, {
            to: [message.to],
            subject: message.subject,
            html: message.html,
        });

        if (success) {
            sent++;
        } else {
            failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { sent, failed };
};

export default {
    sendEmailViaAzure,
    sendEmailForTenantWithAzure,
    sendBulkEmailsViaAzure,
};
