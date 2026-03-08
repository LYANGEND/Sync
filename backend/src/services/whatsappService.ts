import { prisma } from '../utils/prisma';
import axios from 'axios';
import { logCommunication, updateCommunicationLogStatus } from './communicationLogService';

interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * WhatsApp Service - Send messages via WhatsApp Business API
 * Supports Meta (Cloud API) and Twilio WhatsApp providers
 * All messages are logged to the CommunicationLog audit trail.
 */
class WhatsAppService {
  /**
   * Send a WhatsApp text message (with audit logging)
   */
  async sendMessage(phone: string, message: string, options?: { source?: string; sentById?: string; recipientName?: string }): Promise<WhatsAppResult> {
    const logId = await logCommunication({
      channel: 'WHATSAPP',
      status: 'PENDING',
      recipientPhone: phone,
      recipientName: options?.recipientName,
      message: message.substring(0, 500),
      source: options?.source || 'whatsapp_direct',
      sentById: options?.sentById,
    });

    try {
      const settings = await prisma.schoolSettings.findFirst();
      if (!settings) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'No school settings found');
        return { success: false, error: 'No school settings found' };
      }

      const whatsappEnabled = (settings as any).whatsappEnabled;
      if (!whatsappEnabled) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'WhatsApp is disabled');
        return { success: false, error: 'WhatsApp is disabled' };
      }

      const provider = (settings as any).whatsappProvider;
      const apiKey = (settings as any).whatsappApiKey;
      const phoneId = (settings as any).whatsappPhoneId;

      if (!provider || !apiKey) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'WhatsApp not configured');
        return { success: false, error: 'WhatsApp not configured' };
      }

      const formattedPhone = this.formatPhone(phone);

      let result: WhatsAppResult;
      switch (provider.toUpperCase()) {
        case 'META':
          result = await this.sendViaMeta(formattedPhone, message, apiKey, phoneId);
          break;
        case 'TWILIO_WHATSAPP':
          result = await this.sendViaTwilio(formattedPhone, message, settings);
          break;
        default:
          if (logId) await updateCommunicationLogStatus(logId, 'FAILED', `Unknown WhatsApp provider: ${provider}`);
          return { success: false, error: `Unknown WhatsApp provider: ${provider}` };
      }

      if (logId) await updateCommunicationLogStatus(logId, result.success ? 'SENT' : 'FAILED', result.error);
      return result;
    } catch (error: any) {
      console.error('WhatsApp send error:', error);
      if (logId) await updateCommunicationLogStatus(logId, 'FAILED', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send a WhatsApp template message (required for first-time messages)
   */
  async sendTemplate(phone: string, templateName: string, parameters: string[]): Promise<WhatsAppResult> {
    try {
      const settings = await prisma.schoolSettings.findFirst();
      if (!settings) return { success: false, error: 'No settings found' };

      const apiKey = (settings as any).whatsappApiKey;
      const phoneId = (settings as any).whatsappPhoneId;

      if (!apiKey || !phoneId) return { success: false, error: 'WhatsApp not configured' };

      const formattedPhone = this.formatPhone(phone);

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: 'en' },
            components: parameters.length > 0 ? [{
              type: 'body',
              parameters: parameters.map(p => ({ type: 'text', text: p })),
            }] : undefined,
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
      };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /**
   * Send fee reminder via WhatsApp
   */
  async sendFeeReminder(phone: string, studentName: string, amount: number, dueDate: string, schoolName: string): Promise<WhatsAppResult> {
    const message = `📚 *Fee Reminder - ${schoolName}*\n\nDear Parent/Guardian,\n\nA fee of *ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}* for *${studentName}* is due on *${dueDate}*.\n\nPlease make payment via mobile money or visit the school office.\n\nThank you! 🙏`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send attendance alert via WhatsApp
   */
  async sendAttendanceAlert(phone: string, studentName: string, absentDays: number, schoolName: string): Promise<WhatsAppResult> {
    const message = `⚠️ *Attendance Alert - ${schoolName}*\n\nDear Parent/Guardian,\n\n*${studentName}* has been absent for *${absentDays} consecutive day(s)*.\n\nPlease contact the school if there are any concerns.\n\nKind regards,\n${schoolName}`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send payment confirmation via WhatsApp
   */
  async sendPaymentConfirmation(phone: string, studentName: string, amount: number, transactionId: string, schoolName: string): Promise<WhatsAppResult> {
    const message = `✅ *Payment Received - ${schoolName}*\n\nDear Parent/Guardian,\n\nWe have received your payment:\n\n• Student: *${studentName}*\n• Amount: *ZMW ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}*\n• Reference: *${transactionId}*\n\nThank you for your payment! 🎉`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send report card notification via WhatsApp
   */
  async sendReportNotification(phone: string, studentName: string, termName: string, averageScore: number, schoolName: string): Promise<WhatsAppResult> {
    const emoji = averageScore >= 80 ? '🌟' : averageScore >= 60 ? '👍' : averageScore >= 50 ? '📖' : '📝';
    const message = `${emoji} *Report Card Available - ${schoolName}*\n\nDear Parent/Guardian,\n\n*${studentName}*'s report card for *${termName}* is now available.\n\n• Average Score: *${averageScore.toFixed(1)}%*\n\nPlease log in to the parent portal to view the full report.\n\nKind regards,\n${schoolName}`;
    return this.sendMessage(phone, message);
  }

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '260' + cleaned.substring(1);
    }
    return cleaned;
  }

  private async sendViaMeta(to: string, message: string, apiKey: string, phoneId: string): Promise<WhatsAppResult> {
    try {
      const response = await axios.post(
        `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message },
        },
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  private async sendViaTwilio(to: string, message: string, settings: any): Promise<WhatsAppResult> {
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
            To: `whatsapp:+${to}`,
            From: `whatsapp:${settings.smsSenderId || ''}`,
            Body: message,
          }),
        }
      );

      const result: any = await response.json();
      if (result.sid) {
        return { success: true, messageId: result.sid };
      }
      return { success: false, error: result.message || 'Twilio WhatsApp error' };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;
