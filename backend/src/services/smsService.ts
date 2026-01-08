import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// SMS Provider types
type SmsProvider = 'twilio' | 'africastalking' | 'zamtel' | 'infobip' | 'termii';

interface SmsResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: string;
    recipient: string;
}

interface SendSmsOptions {
    to: string;
    message: string;
    senderId?: string;
    tenantId?: string;
}

/**
 * Get platform SMS settings
 */
async function getPlatformSmsSettings() {
    let settings = await prisma.platformSettings.findUnique({
        where: { id: 'default' },
    });

    if (!settings) {
        settings = await prisma.platformSettings.create({
            data: { id: 'default' },
        });
    }

    return settings;
}

/**
 * Get sender ID for a tenant (or use default)
 */
async function getTenantSenderId(tenantId?: string, defaultSenderId?: string): Promise<string> {
    if (!tenantId) return defaultSenderId || 'SYNC';

    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { smsSenderId: true },
    });

    return tenant?.smsSenderId || defaultSenderId || 'SYNC';
}

/**
 * Send SMS via Twilio
 * Docs: https://www.twilio.com/docs/sms/api
 */
async function sendViaTwilio(
    to: string,
    message: string,
    senderId: string,
    apiKey: string,
    apiSecret: string
): Promise<SmsResult> {
    try {
        // Twilio uses accountSid:authToken format
        const credentials = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${apiKey}/Messages.json`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: to.startsWith('+') ? to : `+${to}`,
                From: senderId,
                Body: message,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                messageId: data.sid,
                provider: 'twilio',
                recipient: to,
            };
        }

        return {
            success: false,
            error: data.message || 'Twilio error',
            provider: 'twilio',
            recipient: to,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            provider: 'twilio',
            recipient: to,
        };
    }
}

/**
 * Send SMS via Africa's Talking
 * Docs: https://africastalking.com/sms
 */
async function sendViaAfricasTalking(
    to: string,
    message: string,
    senderId: string,
    apiKey: string,
    username: string
): Promise<SmsResult> {
    try {
        const response = await fetch('https://api.africastalking.com/version1/messaging', {
            method: 'POST',
            headers: {
                'apiKey': apiKey,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json',
            },
            body: new URLSearchParams({
                username,
                to: to.startsWith('+') ? to : `+${to}`,
                message,
                from: senderId,
            }),
        });

        const data = await response.json();

        if (data.SMSMessageData?.Recipients?.[0]?.status === 'Success') {
            return {
                success: true,
                messageId: data.SMSMessageData.Recipients[0].messageId,
                provider: 'africastalking',
                recipient: to,
            };
        }

        return {
            success: false,
            error: data.SMSMessageData?.Message || 'Africa\'s Talking error',
            provider: 'africastalking',
            recipient: to,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            provider: 'africastalking',
            recipient: to,
        };
    }
}

/**
 * Send SMS via Infobip
 * Docs: https://www.infobip.com/docs/sms
 */
async function sendViaInfobip(
    to: string,
    message: string,
    senderId: string,
    apiKey: string,
    baseUrl: string
): Promise<SmsResult> {
    try {
        const response = await fetch(`${baseUrl}/sms/2/text/advanced`, {
            method: 'POST',
            headers: {
                'Authorization': `App ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                messages: [{
                    destinations: [{ to: to.startsWith('+') ? to : `+${to}` }],
                    from: senderId,
                    text: message,
                }],
            }),
        });

        const data = await response.json();

        if (data.messages?.[0]?.status?.groupName === 'PENDING' || data.messages?.[0]?.messageId) {
            return {
                success: true,
                messageId: data.messages[0].messageId,
                provider: 'infobip',
                recipient: to,
            };
        }

        return {
            success: false,
            error: data.messages?.[0]?.status?.description || 'Infobip error',
            provider: 'infobip',
            recipient: to,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            provider: 'infobip',
            recipient: to,
        };
    }
}

/**
 * Send SMS via Termii (Popular in Africa)
 * Docs: https://developers.termii.com/
 */
async function sendViaTermii(
    to: string,
    message: string,
    senderId: string,
    apiKey: string
): Promise<SmsResult> {
    try {
        const response = await fetch('https://api.ng.termii.com/api/sms/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                to: to.startsWith('+') ? to.substring(1) : to, // Termii doesn't want +
                from: senderId,
                sms: message,
                type: 'plain',
                channel: 'generic',
            }),
        });

        const data = await response.json();

        if (data.code === 'ok' || data.message_id) {
            return {
                success: true,
                messageId: data.message_id,
                provider: 'termii',
                recipient: to,
            };
        }

        return {
            success: false,
            error: data.message || 'Termii error',
            provider: 'termii',
            recipient: to,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            provider: 'termii',
            recipient: to,
        };
    }
}

/**
 * Send SMS via Zamtel (Local Zambian)
 * This is a placeholder - integrate with actual Zamtel API
 */
async function sendViaZamtel(
    to: string,
    message: string,
    senderId: string,
    apiKey: string,
    apiUrl: string
): Promise<SmsResult> {
    try {
        // Zamtel bulk SMS API integration (placeholder)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                recipient: to,
                message,
                sender_id: senderId,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            return {
                success: true,
                messageId: data.message_id || data.id,
                provider: 'zamtel',
                recipient: to,
            };
        }

        return {
            success: false,
            error: data.error || 'Zamtel error',
            provider: 'zamtel',
            recipient: to,
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            provider: 'zamtel',
            recipient: to,
        };
    }
}

/**
 * Main SMS sending function - uses platform settings to route to correct provider
 */
export async function sendSms(options: SendSmsOptions): Promise<SmsResult> {
    const { to, message, senderId, tenantId } = options;

    // Get platform settings
    const settings = await getPlatformSmsSettings();

    // Check SMS balance
    if (settings.smsBalanceUnits <= 0) {
        return {
            success: false,
            error: 'Insufficient SMS credits',
            provider: settings.smsProvider,
            recipient: to,
        };
    }

    // Get sender ID
    const finalSenderId = senderId || await getTenantSenderId(tenantId, settings.smsDefaultSenderId || 'SYNC');

    // Validate credentials
    if (!settings.smsApiKey) {
        return {
            success: false,
            error: 'SMS gateway not configured',
            provider: settings.smsProvider,
            recipient: to,
        };
    }

    let result: SmsResult;

    // Route to correct provider
    switch (settings.smsProvider.toLowerCase()) {
        case 'twilio':
            result = await sendViaTwilio(to, message, finalSenderId, settings.smsApiKey, settings.smsApiSecret || '');
            break;

        case 'africastalking':
            result = await sendViaAfricasTalking(to, message, finalSenderId, settings.smsApiKey, settings.smsApiSecret || 'sandbox');
            break;

        case 'infobip':
            result = await sendViaInfobip(to, message, finalSenderId, settings.smsApiKey, settings.smsApiUrl || 'https://api.infobip.com');
            break;

        case 'termii':
            result = await sendViaTermii(to, message, finalSenderId, settings.smsApiKey);
            break;

        case 'zamtel':
            result = await sendViaZamtel(to, message, finalSenderId, settings.smsApiKey, settings.smsApiUrl || 'https://api.zamtel.co.zm/sms');
            break;

        default:
            return {
                success: false,
                error: `Unknown SMS provider: ${settings.smsProvider}`,
                provider: settings.smsProvider,
                recipient: to,
            };
    }

    // Deduct SMS credit if successful
    if (result.success) {
        await prisma.platformSettings.update({
            where: { id: 'default' },
            data: { smsBalanceUnits: { decrement: 1 } },
        });
    }

    return result;
}

/**
 * Send bulk SMS
 */
export async function sendBulkSms(
    recipients: string[],
    message: string,
    tenantId?: string
): Promise<{ sent: number; failed: number; results: SmsResult[] }> {
    const results: SmsResult[] = [];

    for (const to of recipients) {
        const result = await sendSms({ to, message, tenantId });
        results.push(result);
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    return {
        sent: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results,
    };
}

/**
 * Test SMS configuration
 */
export async function testSmsConfig(testNumber: string): Promise<SmsResult> {
    return sendSms({
        to: testNumber,
        message: 'This is a test message from Sync School Management. If you received this, your SMS configuration is working!',
    });
}
