import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Send email using tenant-specific SMTP settings
 * @param tenantId - The tenant ID to get SMTP settings from
 * @param to - Recipient email address
 * @param subject - Email subject
 * @param html - Email HTML content
 */
export const sendEmailForTenant = async (
  tenantId: string,
  to: string,
  subject: string,
  html: string
): Promise<boolean> => {
  try {
    // 1. Fetch tenant SMTP settings
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFromEmail: true,
        smtpFromName: true,
        emailEnabled: true,
      }
    });

    if (!tenant) {
      console.warn('Tenant not found. Email not sent.');
      return false;
    }

    if (!tenant.emailEnabled) {
      console.warn('Email notifications are disabled for this tenant.');
      return false;
    }

    if (!tenant.smtpHost || !tenant.smtpUser || !tenant.smtpPassword) {
      console.warn('SMTP settings not configured for tenant. Email not sent.');
      return false;
    }

    console.log('DEBUG: SMTP Settings found:', {
      host: tenant.smtpHost,
      port: tenant.smtpPort,
      user: tenant.smtpUser,
    });

    // 2. Create Transporter
    const port = tenant.smtpPort || 587;
    const isSecure = port === 465;

    console.log(`DEBUG: Configuring Transporter: Host=${tenant.smtpHost}, Port=${port}, Secure=${isSecure}`);

    const transporter = nodemailer.createTransport({
      host: tenant.smtpHost,
      port: port,
      secure: isSecure,
      auth: {
        user: tenant.smtpUser,
        pass: tenant.smtpPassword,
      },
    });

    // 3. Send Email
    console.log(`DEBUG: Attempting to send email to ${to}`);
    const info = await transporter.sendMail({
      from: `"${tenant.smtpFromName || tenant.name || 'School Admin'}" <${tenant.smtpFromEmail || tenant.smtpUser}>`,
      to,
      subject,
      html,
    });

    console.log('DEBUG: Message sent successfully: %s', info.messageId);
    return true;
  } catch (error: any) {
    console.error('DEBUG: Error sending email:', error);

    if (error.code === 'EAUTH') {
      console.error('---------------------------------------------------');
      console.error('AUTHENTICATION ERROR:');
      console.error('The SMTP server rejected your username or password.');
      console.error('---------------------------------------------------');
    }

    return false;
  }
};

/**
 * Legacy: Send email using default/first tenant or SchoolSettings
 * This is for backward compatibility. New code should use sendEmailForTenant.
 */
export const sendEmail = async (to: string, subject: string, html: string): Promise<boolean> => {
  try {
    // Try to get the default tenant
    const tenant = await prisma.tenant.findFirst({
      where: { slug: 'default' },
      select: {
        id: true,
        name: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFromEmail: true,
        smtpFromName: true,
        emailEnabled: true,
      }
    });

    if (tenant && tenant.smtpHost && tenant.smtpUser && tenant.smtpPassword) {
      return sendEmailForTenant(tenant.id, to, subject, html);
    }

    // Fallback to SchoolSettings for backward compatibility
    const settings = await prisma.schoolSettings.findFirst();

    if (!settings) {
      console.warn('No email settings found. Email not sent.');
      return false;
    }

    // SchoolSettings doesn't have SMTP fields anymore (deprecated)
    // So we just log and return false
    console.warn('SchoolSettings is deprecated. Please configure SMTP in tenant settings.');
    return false;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};
