import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

interface NotificationOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SmsOptions {
  to: string;
  message: string;
}

interface NotificationSettings {
  emailNotificationsEnabled?: boolean;
  smsNotificationsEnabled?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpSecure?: boolean;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFromEmail?: string | null;
  smtpFromName?: string | null;
  smsProvider?: string | null;
  smsApiKey?: string | null;
  smsApiSecret?: string | null;
  smsSenderId?: string | null;
  schoolName?: string;
}

// Get school settings for notifications
async function getNotificationSettings(tenantId: string): Promise<NotificationSettings | null> {
  const settings = await prisma.tenant.findUnique({
    where: { id: tenantId }
  });

  if (!settings) return null;

  return {
    emailNotificationsEnabled: settings.emailEnabled,
    smsNotificationsEnabled: settings.smsEnabled,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpSecure: settings.smtpSecure,
    smtpUser: settings.smtpUser,
    smtpPassword: settings.smtpPassword,
    smtpFromEmail: settings.smtpFromEmail,
    smtpFromName: settings.smtpFromName,
    smsProvider: settings.smsProvider,
    smsApiKey: settings.smsApiKey,
    smsApiSecret: settings.smsApiSecret,
    smsSenderId: settings.smsSenderId,
    schoolName: settings.name,
  };
}

// Send Email Notification
export async function sendEmail(tenantId: string, options: NotificationOptions): Promise<boolean> {
  try {
    const settings = await getNotificationSettings(tenantId);

    if (!settings) {
      console.log('No settings found for tenant:', tenantId);
      return false;
    }

    // Check if email notifications are enabled (default to true if field doesn't exist)
    const emailEnabled = settings.emailNotificationsEnabled ?? true;
    if (!emailEnabled) {
      console.log('Email notifications are disabled');
      return false;
    }

    if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.log('SMTP settings not configured');
      return false;
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure ?? true,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
    });

    const mailOptions = {
      from: `"${settings.smtpFromName || settings.schoolName || 'School'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${options.to}`);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    return false;
  }
}

// Send SMS Notification
export async function sendSms(tenantId: string, options: SmsOptions): Promise<boolean> {
  try {
    const settings = await getNotificationSettings(tenantId);

    if (!settings) {
      console.log('No settings found');
      return false;
    }

    // Check if SMS notifications are enabled (default to false if field doesn't exist)
    const smsEnabled = settings.smsNotificationsEnabled ?? false;
    if (!smsEnabled) {
      console.log('SMS notifications are disabled');
      return false;
    }

    if (!settings.smsProvider || !settings.smsApiKey) {
      console.log('SMS settings not configured');
      return false;
    }

    // Format phone number (remove spaces, ensure proper format)
    const phone = options.to.replace(/\s+/g, '');

    // Provider-specific SMS sending
    switch (settings.smsProvider.toUpperCase()) {
      case 'AFRICASTALKING':
        return await sendAfricasTalkingSms(phone, options.message, settings);
      case 'TWILIO':
        return await sendTwilioSms(phone, options.message, settings);
      default:
        console.log(`Unknown SMS provider: ${settings.smsProvider}`);
        return false;
    }
  } catch (error) {
    console.error('SMS sending failed:', error);
    return false;
  }
}

// Africa's Talking SMS Provider
async function sendAfricasTalkingSms(to: string, message: string, settings: NotificationSettings): Promise<boolean> {
  try {
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'apiKey': settings.smsApiKey || '',
      },
      body: new URLSearchParams({
        username: settings.smsApiSecret || '', // AT uses username in apiSecret field
        to: to,
        message: message,
        from: settings.smsSenderId || '',
      }),
    });

    const result = await response.json();
    console.log('Africa\'s Talking SMS response:', result);
    return result.SMSMessageData?.Recipients?.[0]?.status === 'Success';
  } catch (error) {
    console.error('Africa\'s Talking SMS error:', error);
    return false;
  }
}

// Twilio SMS Provider
async function sendTwilioSms(to: string, message: string, settings: NotificationSettings): Promise<boolean> {
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
    console.log('Twilio SMS response:', result);
    return result.status === 'queued' || result.status === 'sent';
  } catch (error) {
    console.error('Twilio SMS error:', error);
    return false;
  }
}

// Send notification via both channels (based on settings)
export async function sendNotification(
  tenantId: string,
  email: string | undefined,
  phone: string | undefined,
  subject: string,
  message: string,
  htmlMessage?: string,
  smsMessage?: string
): Promise<{ emailSent: boolean; smsSent: boolean }> {
  let emailSent = false;
  let smsSent = false;

  if (email) {
    emailSent = await sendEmail(tenantId, {
      to: email,
      subject,
      text: message,
      html: htmlMessage,
    });
  }

  if (phone) {
    // Use provided SMS message or fallback to truncated email text
    const finalSmsMessage = smsMessage || message.substring(0, 160);
    smsSent = await sendSms(tenantId, {
      to: phone,
      message: finalSmsMessage,
    });
  }

  return { emailSent, smsSent };
}

// Payment Receipt Email Template
export function generatePaymentReceiptEmail(
  guardianName: string,
  studentName: string,
  amount: number,
  paymentDate: Date,
  method: string,
  referenceNumber: string,
  schoolName: string
): { subject: string; text: string; html: string; sms: string } {
  const subject = `✅ Payment Receipt - ${schoolName}`;
  const formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const formattedDate = paymentDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Concise SMS with Guardian Name
  const sms = `Hi ${guardianName.split(' ')[0]}, received ZMW ${formattedAmount} for ${studentName} at ${schoolName}. Ref: ${referenceNumber}.`;

  const text = `
Dear Parent/Guardian,

This is to confirm that we have received your payment for ${studentName}.

Payment Details:
- Amount: ZMW ${formattedAmount}
- Date: ${formattedDate}
- Method: ${method.replace('_', ' ')}
- Reference: ${referenceNumber}

Thank you for your prompt payment.

Best regards,
${schoolName}
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; line-height: 1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 40px 40px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">Payment Receipt</h1>
                    <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">${schoolName}</p>
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <span style="display: inline-block; background-color: #10b981; color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">✓ Paid</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Success Amount Banner -->
          <tr>
            <td style="background-color: #10b981; padding: 25px; text-align: center;">
              <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Amount Received</p>
              <p style="margin: 8px 0 0; color: #ffffff; font-size: 42px; font-weight: 700;">ZMW ${formattedAmount}</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #334155; font-size: 16px;">Dear Parent/Guardian,</p>
              <p style="margin: 0 0 30px; color: #475569; font-size: 15px;">We're pleased to confirm that your payment for <strong style="color: #1e293b;">${studentName}</strong> has been successfully received.</p>
              
              <!-- Payment Details Card -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 20px; color: #1e293b; font-size: 16px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Payment Details</h3>
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                          <span style="color: #64748b; font-size: 14px;">Student</span>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                          <strong style="color: #1e293b; font-size: 14px;">${studentName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                          <span style="color: #64748b; font-size: 14px;">Date</span>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                          <strong style="color: #1e293b; font-size: 14px;">${formattedDate}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                          <span style="color: #64748b; font-size: 14px;">Payment Method</span>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                          <strong style="color: #1e293b; font-size: 14px;">${method.replace('_', ' ')}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <span style="color: #64748b; font-size: 14px;">Reference Number</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right;">
                          <strong style="color: #3b82f6; font-size: 14px; font-family: monospace;">${referenceNumber}</strong>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #475569; font-size: 15px;">Thank you for your prompt payment. This receipt serves as confirmation of the transaction.</p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #475569; font-size: 15px;">Best regards,</p>
                    <p style="margin: 5px 0 0; color: #1e293b; font-size: 16px; font-weight: 600;">${schoolName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
              <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html, sms };
}

// Fee Reminder Email Template
export function generateFeeReminderEmail(
  studentName: string,
  outstandingAmount: number,
  dueDate: Date | null,
  schoolName: string,
  isOverdue: boolean
): { subject: string; text: string; html: string } {
  const subject = isOverdue
    ? `⚠️ OVERDUE: Fee Payment Required - ${schoolName}`
    : `📋 Fee Payment Reminder - ${schoolName}`;

  const formattedAmount = outstandingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  const dueDateStr = dueDate
    ? dueDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'As soon as possible';
  const urgencyText = isOverdue ? 'This payment is now overdue.' : `Payment is due by ${dueDateStr}.`;

  const text = `
Dear Parent/Guardian,

This is a reminder regarding outstanding fees for ${studentName}.

Outstanding Amount: ZMW ${formattedAmount}
${urgencyText}

Please make payment at your earliest convenience to avoid any inconvenience.

Best regards,
${schoolName}
  `.trim();

  // Colors based on urgency
  const headerGradient = isOverdue
    ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
  const accentColor = isOverdue ? '#dc2626' : '#f59e0b';
  const accentBgColor = isOverdue ? '#fef2f2' : '#fffbeb';
  const accentBorderColor = isOverdue ? '#fecaca' : '#fde68a';
  const badgeText = isOverdue ? 'Overdue' : 'Reminder';
  const headerIcon = isOverdue ? '⚠️' : '📋';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Fee Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f1f5f9; line-height: 1.6;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f1f5f9;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background: ${headerGradient}; padding: 40px 40px 30px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td>
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">${headerIcon} Fee ${isOverdue ? 'Overdue Notice' : 'Reminder'}</h1>
                    <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.9); font-size: 16px;">${schoolName}</p>
                  </td>
                  <td style="text-align: right; vertical-align: top;">
                    <span style="display: inline-block; background-color: rgba(255, 255, 255, 0.2); color: #ffffff; padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${badgeText}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Outstanding Amount Banner -->
          <tr>
            <td style="background-color: ${accentColor}; padding: 25px; text-align: center;">
              <p style="margin: 0; color: rgba(255, 255, 255, 0.9); font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Outstanding Balance</p>
              <p style="margin: 8px 0 0; color: #ffffff; font-size: 42px; font-weight: 700;">ZMW ${formattedAmount}</p>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; color: #334155; font-size: 16px;">Dear Parent/Guardian,</p>
              <p style="margin: 0 0 30px; color: #475569; font-size: 15px;">This is a ${isOverdue ? 'final notice' : 'friendly reminder'} regarding outstanding school fees for <strong style="color: #1e293b;">${studentName}</strong>.</p>
              
              <!-- Urgency Box -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: ${accentBgColor}; border-radius: 12px; border: 2px solid ${accentBorderColor};">
                <tr>
                  <td style="padding: 20px; text-align: center;">
                    <p style="margin: 0; color: ${accentColor}; font-size: 18px; font-weight: 700;">
                      ${isOverdue ? '⚠️ Payment Required Immediately' : `� Due Date: ${dueDateStr}`}
                    </p>
                    <p style="margin: 10px 0 0; color: #64748b; font-size: 14px;">
                      ${isOverdue
      ? 'This payment has exceeded its due date. Please settle the outstanding balance as soon as possible to avoid service interruption.'
      : 'Please ensure payment is made before the due date to avoid any late fees or service interruption.'}
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Payment Details Card -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-top: 24px;">
                <tr>
                  <td style="padding: 24px;">
                    <h3 style="margin: 0 0 16px; color: #1e293b; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Account Summary</h3>
                    
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                          <span style="color: #64748b; font-size: 14px;">Student Name</span>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                          <strong style="color: #1e293b; font-size: 14px;">${studentName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                          <span style="color: #64748b; font-size: 14px;">Outstanding Amount</span>
                        </td>
                        <td style="padding: 12px 0; border-bottom: 1px solid #e2e8f0; text-align: right;">
                          <strong style="color: ${accentColor}; font-size: 16px;">ZMW ${formattedAmount}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 0;">
                          <span style="color: #64748b; font-size: 14px;">Status</span>
                        </td>
                        <td style="padding: 12px 0; text-align: right;">
                          <span style="display: inline-block; background-color: ${accentColor}; color: #ffffff; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">${isOverdue ? 'OVERDUE' : 'PENDING'}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0; color: #475569; font-size: 15px;">If you have already made this payment, please disregard this notice. For any questions or payment arrangements, please contact the school's finance office.</p>
              
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 30px;">
                <tr>
                  <td>
                    <p style="margin: 0; color: #475569; font-size: 15px;">Best regards,</p>
                    <p style="margin: 5px 0 0; color: #1e293b; font-size: 16px; font-weight: 600;">${schoolName}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply to this email.</p>
              <p style="margin: 8px 0 0; color: #94a3b8; font-size: 12px;">© ${new Date().getFullYear()} ${schoolName}. All rights reserved.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

// Create a single notification in the database
export async function createNotification(
  tenantId: string,
  userId: string,
  title: string,
  message: string,
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' = 'INFO'
): Promise<boolean> {
  try {
    await prisma.notification.create({
      data: {
        tenantId,
        userId,
        title,
        message,
        type,
        isRead: false,
      },
    });
    return true;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return false;
  }
}

// Broadcast notification to multiple users
export async function broadcastNotification(
  tenantId: string,
  userIds: string[],
  title: string,
  message: string,
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR' = 'INFO'
): Promise<number> {
  try {
    const result = await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        tenantId,
        userId,
        title,
        message,
        type,
        isRead: false,
      })),
    });
    return result.count;
  } catch (error) {
    console.error('Failed to broadcast notifications:', error);
    return 0;
  }
}

export default {
  sendEmail,
  sendSms,
  sendNotification,
  createNotification,
  broadcastNotification,
  generatePaymentReceiptEmail,
  generateFeeReminderEmail,
};
