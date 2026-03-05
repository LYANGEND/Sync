import nodemailer from 'nodemailer';
import { prisma } from '../utils/prisma';
export const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    // 1. Fetch SMTP settings
    const settings = await prisma.schoolSettings.findFirst();

    if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
      console.warn('SMTP settings not configured. Email not sent.');
      return false;
    }

    console.log('DEBUG: SMTP Settings found:', {
      host: settings.smtpHost,
      port: settings.smtpPort,
      user: settings.smtpUser,
      dbSecureSetting: settings.smtpSecure
    });

    // 2. Create Transporter
    // Auto-detect secure connection based on port if not explicitly clear
    // Port 465 requires secure: true (Implicit TLS)
    // Port 587 requires secure: false (STARTTLS)
    const port = settings.smtpPort || 587;
    const isSecure = port === 465;

    console.log(`DEBUG: Configuring Transporter: Host=${settings.smtpHost}, Port=${port}, Secure=${isSecure}`);

    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: port,
      secure: isSecure, 
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPassword,
      },
    });

    // 3. Send Email
    console.log(`DEBUG: Attempting to send email to ${to}`);
    const info = await transporter.sendMail({
      from: `"${settings.smtpFromName || 'School Admin'}" <${settings.smtpFromEmail || settings.smtpUser}>`,
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
      console.error('1. Ensure "Username" is your full email address (e.g. user@gmail.com).');
      console.error('2. If using Gmail, you MUST use an "App Password" if 2FA is enabled.');
      console.error('   (Your regular Gmail password will NOT work)');
      console.error('---------------------------------------------------');
    }
    
    return false;
  }
};
