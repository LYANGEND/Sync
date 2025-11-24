import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const sendEmail = async (schoolId: string, to: string, subject: string, html: string) => {
  try {
    // 1. Fetch SMTP settings
    const settings = await prisma.school.findUnique({
      where: { id: schoolId }
    });

    if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.warn('SMTP settings not configured. Email not sent.');
      return false;
    }

    // 2. Create Transporter
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort || 587,
      secure: settings.smtpSecure, // true for 465, false for other ports
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
    });

    // 3. Send Email
    const info = await transporter.sendMail({
      from: `"${settings.smtpFromName || 'School Admin'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
      to,
      subject,
      html,
    });

    console.log('Message sent: %s', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};
