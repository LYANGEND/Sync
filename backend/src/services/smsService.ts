import { prisma } from '../utils/prisma';
import { SchoolSettings } from '@prisma/client';
import axios from 'axios';
import { logCommunication, updateCommunicationLogStatus } from './communicationLogService';

interface SmsResult {
  success: boolean;
  messageId?: string;
  errorCode?: string;
  error?: string;
}

// ─── Security constants ─────────────────────────────────────

/** Valid Zambian mobile number patterns (after stripping formatting) */
const ZAMBIAN_PHONE_REGEX = /^(260[79][5-7]\d{7}|0[79][5-7]\d{7})$/;

/** Daily SMS rate limits */
const RATE_LIMITS = {
  perUser: 500,   // max SMS per user per day
  global: 5000,   // max SMS across all users per day
};

/**
 * Sanitize user-supplied values before interpolating into SMS text.
 * Strips URLs, HTML tags, and control characters that could be used for
 * SMS injection / phishing.
 */
function sanitizeSmsField(value: string): string {
  return value
    .replace(/https?:\/\/[^\s]+/gi, '')       // strip URLs
    .replace(/<[^>]*>/g, '')                    // strip HTML tags
    .replace(/[\r\n\t]/g, ' ')                  // normalise whitespace
    .replace(/[^\w\s.,'-]/g, '')                // keep only safe chars
    .trim()
    .substring(0, 100);                          // cap length
}

/**
 * mShastra error codes returned when ShowError=C is appended.
 * Ref: MobiShastra Technologies API Integration v1.3
 */
const MSHASTRA_ERROR_CODES: Record<string, string> = {
  '000': 'Send Successful',
  '001': 'Invalid Receiver',
  '003': 'Invalid Message',
  '005': 'Authorization failed',
  '006': 'DND Number',
  '007': 'Cannot Extract Country Code',
  '008': 'Empty Receiver',
  '009': 'Profile Blocked',
  '010': 'Invalid Profile ID',
  '011': 'Profile ID expired',
  '012': 'Sender Id more than 13 Chars',
  '013': 'Server Error',
};

/**
 * SMS Service - Dedicated service for sending SMS messages
 * Supports mShastra (primary, optimised for Zambia), Africa's Talking, and Twilio providers
 * All messages are logged to the CommunicationLog audit trail.
 *
 * mShastra field mapping (stored in SchoolSettings):
 *   smsApiKey    → mShastra "user" (8-digit profile ID)
 *   smsApiSecret → mShastra "pwd"  (password)
 *   smsSenderId  → mShastra "senderid" (approved sender ID)
 *
 * mShastra endpoints used:
 *   Single SMS  → https://mshastra.com/sendurl.aspx      (PUSH single)
 *   Bulk   SMS  → https://mshastra.com/sendurlcomma.aspx  (PUSH multiple, comma-separated)
 *   JSON   API  → https://mshastra.com/sendsms_api_json.aspx (POST, per-recipient messages)
 *   Balance     → https://mshastra.com/balance.aspx
 */
class SmsService {
  // ─── public API ────────────────────────────────────────────

  /**
   * Send a single SMS message (with audit logging).
   * Optionally schedule for a future date/time.
   */
  async send(
    phone: string,
    message: string,
    options?: { source?: string; sentById?: string; recipientName?: string; scheduledAt?: string },
  ): Promise<SmsResult> {
    // ── Phone validation ──
    const validationError = this.validatePhone(phone);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const logId = await logCommunication({
      channel: 'SMS',
      status: 'PENDING',
      recipientPhone: phone,
      recipientName: options?.recipientName,
      message: message.substring(0, 500),
      source: options?.source || 'sms_direct',
      sentById: options?.sentById,
    });

    try {
      // ── Rate limiting ──
      const rateLimitError = await this.checkRateLimit(options?.sentById);
      if (rateLimitError) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', rateLimitError);
        return { success: false, error: rateLimitError };
      }

      const settings = await prisma.schoolSettings.findFirst();
      if (!settings) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'No school settings found');
        return { success: false, error: 'No school settings found' };
      }

      if (!settings.smsNotificationsEnabled) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'SMS notifications are disabled');
        return { success: false, error: 'SMS notifications are disabled' };
      }

      if (!settings.smsProvider || !settings.smsApiKey) {
        if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'SMS provider not configured');
        return { success: false, error: 'SMS provider not configured' };
      }

      const formattedPhone = this.formatPhone(phone);

      let result: SmsResult;
      switch (settings.smsProvider.toUpperCase()) {
        case 'MSHASTRA':
          result = await this.sendViaMshastra(formattedPhone, message, settings, options?.scheduledAt);
          break;
        case 'AFRICASTALKING':
          result = await this.sendViaAfricasTalking(formattedPhone, message, settings);
          break;
        case 'TWILIO':
          result = await this.sendViaTwilio(formattedPhone, message, settings);
          break;
        default:
          if (logId)
            await updateCommunicationLogStatus(logId, 'FAILED', `Unknown SMS provider: ${settings.smsProvider}`);
          return { success: false, error: `Unknown SMS provider: ${settings.smsProvider}` };
      }

      if (logId) await updateCommunicationLogStatus(logId, result.success ? 'SENT' : 'FAILED', result.error);
      return result;
    } catch (error: any) {
      console.error('SMS send error:', error);
      if (logId) await updateCommunicationLogStatus(logId, 'FAILED', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk SMS messages.
   * When using mShastra with the **same message** for all recipients the
   * provider's comma-separated endpoint is used for efficiency (single HTTP call).
   * Otherwise falls back to sending one-by-one.
   */
  async sendBulk(
    recipients: { phone: string; message: string }[],
    options?: { source?: string; sentById?: string; scheduledAt?: string },
  ): Promise<{ total: number; sent: number; failed: number; results: SmsResult[] }> {
    const settings = await prisma.schoolSettings.findFirst();
    const isMshastra = settings?.smsProvider?.toUpperCase() === 'MSHASTRA';

    // Check if all messages are identical → use mShastra comma-separated bulk endpoint
    const allSameMessage = recipients.every((r) => r.message === recipients[0]?.message);

    if (isMshastra && allSameMessage && recipients.length > 1 && settings) {
      const phones = recipients.map((r) => this.formatPhoneMshastra(r.phone));
      const message = recipients[0].message;

      // Log each recipient
      const logIds = await Promise.all(
        recipients.map((r) =>
          logCommunication({
            channel: 'SMS',
            status: 'PENDING',
            recipientPhone: r.phone,
            message: message.substring(0, 500),
            source: options?.source || 'sms_bulk',
            sentById: options?.sentById,
          }),
        ),
      );

      const result = await this.sendBulkViaMshastra(phones, message, settings, options?.scheduledAt);

      // Update all logs
      await Promise.all(
        logIds.map((logId) =>
          logId ? updateCommunicationLogStatus(logId, result.success ? 'SENT' : 'FAILED', result.error) : null,
        ),
      );

      const singleResults = recipients.map(() => result);
      return {
        total: recipients.length,
        sent: result.success ? recipients.length : 0,
        failed: result.success ? 0 : recipients.length,
        results: singleResults,
      };
    }

    // mShastra JSON API — different messages per recipient in a single POST
    if (isMshastra && !allSameMessage && recipients.length > 1 && settings) {
      return this.sendViaJsonApi(recipients, settings, options);
    }

    // Fallback: send one-by-one
    const results: SmsResult[] = [];
    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      if (results.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const result = await this.send(recipient.phone, recipient.message, {
        source: options?.source || 'sms_bulk',
        sentById: options?.sentById,
        scheduledAt: options?.scheduledAt,
      });
      results.push(result);
      if (result.success) sent++;
      else failed++;
    }

    return { total: recipients.length, sent, failed, results };
  }

  // ─── convenience helpers ───────────────────────────────────

  /** Attendance alert */
  async sendAttendanceAlert(
    parentPhone: string,
    studentName: string,
    absentDays: number,
    schoolName: string,
  ): Promise<SmsResult> {
    const safeName = sanitizeSmsField(studentName);
    const safeSchool = sanitizeSmsField(schoolName);
    const message = `Dear Parent, ${safeName} has been absent for ${absentDays} consecutive days at ${safeSchool}. Please contact the school. Reply STOP to unsubscribe.`;
    return this.send(parentPhone, message, { source: 'attendance_alert' });
  }

  /** Fee reminder */
  async sendFeeReminder(
    parentPhone: string,
    studentName: string,
    amount: number,
    dueDate: string,
    schoolName: string,
  ): Promise<SmsResult> {
    const safeName = sanitizeSmsField(studentName);
    const safeSchool = sanitizeSmsField(schoolName);
    const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    const message = `Dear Parent, a fee of ZMW ${formattedAmount} for ${safeName} is due on ${dueDate} at ${safeSchool}. Pay via mobile money or visit the school.`;
    return this.send(parentPhone, message, { source: 'fee_reminder' });
  }

  /** Payment confirmation */
  async sendPaymentConfirmation(
    parentPhone: string,
    studentName: string,
    amount: number,
    transactionId: string,
    schoolName: string,
  ): Promise<SmsResult> {
    const safeName = sanitizeSmsField(studentName);
    const safeSchool = sanitizeSmsField(schoolName);
    const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
    // Only show last 6 chars of transaction ID to limit exposure over insecure SMS channel
    const maskedRef = transactionId.length > 6 ? '…' + transactionId.slice(-6) : transactionId;
    const message = `Payment received: ZMW ${formattedAmount} for ${safeName} at ${safeSchool}. Ref: ${maskedRef}. Thank you!`;
    return this.send(parentPhone, message, { source: 'payment_confirmation' });
  }

  // ─── security: validation & rate limiting ───────────────

  /**
   * Validate phone number — must be a valid Zambian mobile number.
   * Returns an error string if invalid, or null if valid.
   */
  private validatePhone(phone: string): string | null {
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    if (!ZAMBIAN_PHONE_REGEX.test(cleaned)) {
      return `Invalid Zambian mobile number: ${phone.substring(0, 4)}***. Must be a valid 09x/07x number.`;
    }
    return null;
  }

  /**
   * Check daily SMS rate limits (per-user and global).
   * Returns an error string if limit is exceeded, or null if within limits.
   */
  private async checkRateLimit(sentById?: string): Promise<string | null> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Global daily limit
    const globalCount = await prisma.communicationLog.count({
      where: {
        channel: 'SMS',
        createdAt: { gte: todayStart },
      },
    });
    if (globalCount >= RATE_LIMITS.global) {
      return `Global daily SMS limit reached (${RATE_LIMITS.global}). Try again tomorrow.`;
    }

    // Per-user daily limit
    if (sentById) {
      const userCount = await prisma.communicationLog.count({
        where: {
          channel: 'SMS',
          sentById,
          createdAt: { gte: todayStart },
        },
      });
      if (userCount >= RATE_LIMITS.perUser) {
        return `Your daily SMS limit reached (${RATE_LIMITS.perUser}). Try again tomorrow.`;
      }
    }

    return null;
  }

  // ─── phone formatting ─────────────────────────────────────

  /**
   * Generic phone formatter → +260…
   */
  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '+260' + cleaned.substring(1);
    }
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  /**
   * mShastra expects numbers **without** the "+" prefix, e.g. 260977123456
   */
  private formatPhoneMshastra(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    // 0977… → 260977…
    if (cleaned.startsWith('0')) {
      cleaned = '260' + cleaned.substring(1);
    }
    // If it doesn't start with 260 yet, prepend country code
    if (!cleaned.startsWith('260')) {
      cleaned = '260' + cleaned;
    }
    return cleaned;
  }

  // ─── mShastra provider ────────────────────────────────────

  /**
   * Send a single SMS via mShastra PUSH API (single number).
   * Uses ShowError=C for structured error codes (000 = success).
   * Endpoint: https://mshastra.com/sendurl.aspx
   */
  private async sendViaMshastra(
    to: string,
    message: string,
    settings: SchoolSettings,
    scheduledAt?: string,
  ): Promise<SmsResult> {
    try {
      const phoneNumber = this.formatPhoneMshastra(to);

      const params: Record<string, string> = {
        user: settings.smsApiKey || '',
        pwd: settings.smsApiSecret || '',
        senderid: settings.smsSenderId || 'MobiSMS',
        mobileno: phoneNumber,
        msgtext: message,
        priority: 'High',
        CountryCode: '260',
        ShowError: 'C',              // request structured error codes
      };

      // Scheduled SMS — format: mm/dd/year hh:min am
      if (scheduledAt) {
        params.scheduledDate = this.formatMshastraSchedule(scheduledAt);
      }

      const url = `https://mshastra.com/sendurl.aspx?${new URLSearchParams(params).toString()}`;
      // Log destination only — never log the full URL (contains credentials)
      console.log(`[mShastra] Sending SMS to ${phoneNumber}${scheduledAt ? ` (scheduled: ${params.scheduledDate})` : ''}`);

      const response = await axios.get(url, { timeout: 30000 });
      const body = typeof response.data === 'string' ? response.data.trim() : String(response.data);

      const result = this.parseMshastraResponse(body);
      console.log(`[mShastra] Result: success=${result.success}, errorCode=${result.errorCode || 'n/a'}`);
      return result;
    } catch (error: any) {
      console.error('[mShastra] SMS send error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send bulk SMS via mShastra PUSH API (comma-separated numbers, same message).
   * Endpoint: https://mshastra.com/sendurlcomma.aspx
   */
  private async sendBulkViaMshastra(
    phones: string[],
    message: string,
    settings: SchoolSettings,
    scheduledAt?: string,
  ): Promise<SmsResult> {
    try {
      const params: Record<string, string> = {
        user: settings.smsApiKey || '',
        pwd: settings.smsApiSecret || '',
        senderid: settings.smsSenderId || 'MobiSMS',
        mobileno: phones.join(','),
        msgtext: message,
        priority: 'High',
        CountryCode: '260',
      };

      if (scheduledAt) {
        params.scheduledDate = this.formatMshastraSchedule(scheduledAt);
      }

      const url = `https://mshastra.com/sendurlcomma.aspx?${new URLSearchParams(params).toString()}`;
      console.log(`[mShastra] Sending bulk SMS to ${phones.length} recipients`);

      const response = await axios.get(url, { timeout: 60000 });
      const body = typeof response.data === 'string' ? response.data.trim() : String(response.data);

      const result = this.parseMshastraResponse(body);
      console.log(`[mShastra] Bulk result: success=${result.success}, errorCode=${result.errorCode || 'n/a'}, recipients=${phones.length}`);
      return result;
    } catch (error: any) {
      console.error('[mShastra] Bulk SMS error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send per-recipient messages via mShastra JSON API.
   * Endpoint: POST https://mshastra.com/sendsms_api_json.aspx
   * Each item in the array can have a different number + message.
   */
  private async sendViaJsonApi(
    recipients: { phone: string; message: string }[],
    settings: SchoolSettings,
    options?: { source?: string; sentById?: string },
  ): Promise<{ total: number; sent: number; failed: number; results: SmsResult[] }> {
    // Log each recipient
    const logIds = await Promise.all(
      recipients.map((r) =>
        logCommunication({
          channel: 'SMS',
          status: 'PENDING',
          recipientPhone: r.phone,
          message: r.message.substring(0, 500),
          source: options?.source || 'sms_bulk_json',
          sentById: options?.sentById,
        }),
      ),
    );

    try {
      const payload = recipients.map((r) => ({
        user: settings.smsApiKey || '',
        pwd: settings.smsApiSecret || '',
        number: this.formatPhoneMshastra(r.phone),
        msg: r.message,
        sender: settings.smsSenderId || 'MobiSMS',
        language: 'English',
      }));

      // Never log payload — it contains credentials repeated per-recipient
      console.log(`[mShastra] JSON API — sending ${recipients.length} messages`);

      const response = await axios.post(
        'https://mshastra.com/sendsms_api_json.aspx',
        payload,
        { timeout: 60000, headers: { 'Content-Type': 'application/json' } },
      );

      // Response: [{"msg_id":"...","number":"...","response":"send success"}, ...]
      const results: SmsResult[] = [];
      let sent = 0;
      let failed = 0;
      const responseData = Array.isArray(response.data) ? response.data : [];

      for (let i = 0; i < recipients.length; i++) {
        const item = responseData[i];
        const isSuccess = item && typeof item.response === 'string' &&
          item.response.toLowerCase().includes('success');

        const result: SmsResult = isSuccess
          ? { success: true, messageId: item.msg_id }
          : { success: false, error: item?.response || 'No response from mShastra' };

        results.push(result);
        if (isSuccess) sent++;
        else failed++;

        if (logIds[i]) {
          await updateCommunicationLogStatus(logIds[i]!, result.success ? 'SENT' : 'FAILED', result.error);
        }
      }

      return { total: recipients.length, sent, failed, results };
    } catch (error: any) {
      console.error('[mShastra] JSON API error:', error.message);
      // Mark all as failed
      await Promise.all(
        logIds.map((id) => id ? updateCommunicationLogStatus(id, 'FAILED', error.message) : null),
      );
      return {
        total: recipients.length,
        sent: 0,
        failed: recipients.length,
        results: recipients.map(() => ({ success: false, error: error.message })),
      };
    }
  }

  /**
   * Check mShastra credit balance.
   * Endpoint: https://mshastra.com/balance.aspx
   */
  async checkMshastraBalance(): Promise<{ success: boolean; balance?: string; error?: string }> {
    try {
      const settings = await prisma.schoolSettings.findFirst();
      if (!settings || settings.smsProvider?.toUpperCase() !== 'MSHASTRA') {
        return { success: false, error: 'mShastra not configured' };
      }

      const params = new URLSearchParams({
        user: settings.smsApiKey || '',
        pwd: settings.smsApiSecret || '',
      });

      const url = `https://mshastra.com/balance.aspx?${params.toString()}`;
      const response = await axios.get(url, { timeout: 15000 });
      const body = typeof response.data === 'string' ? response.data.trim() : String(response.data);

      console.log('[mShastra] Balance check completed');
      return { success: true, balance: body };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse mShastra response — handles both ShowError=C error codes and
   * legacy plain-text responses.
   *
   * With ShowError=C the response starts with a 3-digit code:
   *   "000 - Send Successful"
   *   "005 - Authorization failed"
   *
   * Legacy responses are plain text like "Send Successful", "Invalid Password", etc.
   */
  private parseMshastraResponse(raw: string): SmsResult {
    // Structured error code (ShowError=C): "000", "001", "000 - Send Successful", etc.
    const codeMatch = raw.match(/^(\d{3})/);
    if (codeMatch) {
      const code = codeMatch[1];
      if (code === '000') {
        // Extract message ID if present after the status text
        const idMatch = raw.match(/\d{3}\s*-?\s*Send Successful\s*(.*)/);
        return { success: true, messageId: idMatch?.[1]?.trim() || raw, errorCode: code };
      }
      const description = MSHASTRA_ERROR_CODES[code] || raw;
      return { success: false, errorCode: code, error: `[${code}] ${description}` };
    }

    // Legacy plain-text detection
    const lower = raw.toLowerCase();
    if (lower.includes('send successful') || lower.includes('success')) {
      return { success: true, messageId: raw };
    }

    const errorKeywords = [
      'invalid', 'error', 'fail', 'insufficient', 'blocked',
      'expired', 'denied', 'unauthorized', 'no more credits',
    ];
    if (errorKeywords.some((kw) => lower.includes(kw))) {
      return { success: false, error: raw };
    }

    // If response looks like a message ID (numeric, 6+ digits), treat as success
    if (/^\d{6,}$/.test(raw)) {
      return { success: true, messageId: raw };
    }

    // Unknown response — treat as FAILURE to prevent silent data loss
    console.warn(`[mShastra] Unrecognised response treated as failure: ${raw.substring(0, 80)}`);
    return { success: false, error: `Unrecognised provider response: ${raw.substring(0, 100)}` };
  }

  /**
   * Convert an ISO date string to mShastra's schedule format: "mm/dd/year hh:min am"
   */
  private formatMshastraSchedule(isoDate: string): string {
    const d = new Date(isoDate);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${mm}/${dd}/${year} ${hours}:${min} ${ampm}`;
  }

  // ─── Africa's Talking provider ────────────────────────────

  private async sendViaAfricasTalking(to: string, message: string, settings: SchoolSettings): Promise<SmsResult> {
    try {
      const response = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          apiKey: settings.smsApiKey || '',
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

  // ─── Twilio provider ──────────────────────────────────────

  private async sendViaTwilio(to: string, message: string, settings: SchoolSettings): Promise<SmsResult> {
    try {
      const accountSid = settings.smsApiKey || '';
      const authToken = settings.smsApiSecret || '';

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: to,
            From: settings.smsSenderId || '',
            Body: message,
          }),
        },
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
