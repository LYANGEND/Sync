import nodemailer from 'nodemailer';
import { prisma } from '../utils/prisma';
import { logCommunication, updateCommunicationLogStatus } from './communicationLogService';

/**
 * Send an email and log it to the communication audit trail.
 * This is the SINGLE source of truth for sending emails in the app.
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  options?: {
    source?: string;       // e.g. "announcement", "fee_reminder", "payment_receipt"
    sentById?: string;     // userId of person who triggered it
    recipientName?: string;
  }
): Promise<boolean> => {
  const source = options?.source || 'manual';
  const sentById = options?.sentById || undefined;
  const recipientName = options?.recipientName || undefined;

  // 1. Create a PENDING log entry
  const logId = await logCommunication({
    channel: 'EMAIL',
    status: 'PENDING',
    recipientEmail: to,
    recipientName,
    subject,
    message: html.replace(/<[^>]*>/g, '').substring(0, 500), // Plain text preview
    htmlBody: html,
    source,
    sentById,
  });

  try {
    // 2. Fetch SMTP settings
    const settings = await prisma.schoolSettings.findFirst();

    if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.warn('SMTP settings not configured. Email not sent.');
      if (logId) await updateCommunicationLogStatus(logId, 'FAILED', 'SMTP settings not configured');
      return false;
    }

    // 3. Create Transporter
    const port = settings.smtpPort || 587;
    const isSecure = port === 465;

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: port,
      secure: isSecure,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
    });

    // 4. Send Email
    const info = await transporter.sendMail({
      from: `"${settings.smtpFromName || 'School Admin'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
      to,
      subject,
      html,
    });

    console.log('Email sent successfully: %s', info.messageId);

    // 5. Update log to SENT
    if (logId) await updateCommunicationLogStatus(logId, 'SENT');

    return true;
  } catch (error: any) {
    console.error('Error sending email:', error);

    const errorMsg = error.code === 'EAUTH'
      ? 'SMTP authentication failed — check username/password'
      : error.message || 'Unknown email error';

    // 5b. Update log to FAILED
    if (logId) await updateCommunicationLogStatus(logId, 'FAILED', errorMsg);

    return false;
  }
};
