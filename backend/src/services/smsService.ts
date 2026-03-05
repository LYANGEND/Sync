import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * SMS Service - Dedicated service for sending SMS messages
 * Supports Africa's Talking and Twilio providers
 */
class SmsService {
  /**
   * Send a single SMS message
   */
  async send(phone: string, message: string): Promise<SmsResult> {
    try {
      const settings = await prisma.schoolSettings.findFirst();
      if (!settings) return { success: false, error: 'No school settings found' };

      if (!settings.smsNotificationsEnabled) {
        return { success: false, error: 'SMS notifications are disabled' };
      }

      if (!settings.smsProvider || !settings.smsApiKey) {
        return { success: false, error: 'SMS provider not configured' };
      }

      const formattedPhone = this.formatPhone(phone);

      switch (settings.smsProvider.toUpperCase()) {
        case 'AFRICASTALKING':
          return await this.sendViaAfricasTalking(formattedPhone, message, settings);
        case 'TWILIO':
          return await this.sendViaTwilio(formattedPhone, message, settings);
        default:
          return { success: false, error: `Unknown SMS provider: ${settings.smsProvider}` };
      }
    } catch (error: any) {
      console.error('SMS send error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk SMS messages
   */
  async sendBulk(recipients: { phone: string; message: string }[]): Promise<{
    total: number;
    sent: number;
    failed: number;
    results: SmsResult[];
  }> {
    const results: SmsResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      // Add small delay between messages to avoid rate limiting
      if (results.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      const result = await this.send(recipient.phone, recipient.message);
      results.push(result);
      if (result.success) sent++;
      else failed++;
    }

    return { total: recipients.length, sent, failed, results };
  }

  /**
   * Send attendance alert SMS to parent
   */
  async sendAttendanceAlert(parentPhone: string, studentName: string, absentDays: number, schoolName: string): Promise<SmsResult> {
    const message = `Dear Parent, ${studentName} has been absent for ${absentDays} consecutive days at ${schoolName}. Please contact the school. Reply STOP to unsubscribe.`;
    return this.send(parentPhone, message);
  }

  /**
   * Send fee reminder SMS
   */
  async sendFeeReminder(parentPhone: string, studentName: string, amount: number, dueDate: string, schoolName: string): Promise<SmsResult> {
    const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const message = `Dear Parent, a fee of ZMW ${formattedAmount} for ${studentName} is due on ${dueDate} at ${schoolName}. Pay via mobile money or visit the school.`;
    return this.send(parentPhone, message);
  }

  /**
   * Send payment confirmation SMS
   */
  async sendPaymentConfirmation(parentPhone: string, studentName: string, amount: number, transactionId: string, schoolName: string): Promise<SmsResult> {
    const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const message = `Payment received: ZMW ${formattedAmount} for ${studentName} at ${schoolName}. Ref: ${transactionId}. Thank you!`;
    return this.send(parentPhone, message);
  }

  /**
   * Format phone number for Zambian format
   */
  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    // If starts with 0, replace with +260 (Zambia)
    if (cleaned.startsWith('0')) {
      cleaned = '+260' + cleaned.substring(1);
    }
    // If doesn't start with +, add +
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  private async sendViaAfricasTalking(to: string, message: string, settings: any): Promise<SmsResult> {
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey': settings.smsApiKey || '',
        },
        body: new URLSearchParams({
          username: settings.smsApiSecret || '',
          to,
          message,
          from: settings.smsSenderId || '',
        }),
      });

      const result = await response.json();
      const recipient = result.SMSMessageData?.Recipients?.[0];

      if (recipient?.status === 'Success') {
        return { success: true, messageId: recipient.messageId };
      }
      return { success: false, error: recipient?.status || 'Unknown error' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async sendViaTwilio(to: string, message: string, settings: any): Promise<SmsResult> {
    try {
      const accountSid = settings.smsApiKey || '';
      const authToken = settings.smsApiSecret || '';

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: to,
            From: settings.smsSenderId || '',
            Body: message,
          }),
        }
      );

      const result = await response.json();
      if (result.sid) {
        return { success: true, messageId: result.sid };
      }
      return { success: false, error: result.message || 'Twilio error' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const smsService = new SmsService();
export default smsService;
