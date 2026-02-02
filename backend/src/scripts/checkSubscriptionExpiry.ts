
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

// Configure SMTP (Use environment variables in production)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

async function checkExpiry() {
    console.log('Checking for expiring subscriptions...');

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    // Find tenants expiring in exactly 7 days (or less, simplified query)
    const expiringTenants = await prisma.tenant.findMany({
        where: {
            status: { in: ['ACTIVE', 'TRIAL'] },
            subscriptionEndsAt: {
                lte: sevenDaysFromNow,
                gte: new Date() // Not already expired
            }
        },
        include: {
            users: { where: { role: 'SUPER_ADMIN' } } // Notify super admins
        }
    });

    for (const tenant of expiringTenants) {
        console.log(`Sending reminder to ${tenant.name}`);
        const tenantWithUsers = tenant as typeof tenant & { users: { email: string; fullName: string }[] };
        for (const user of tenantWithUsers.users) {
            try {
                // Send Email Logic
                await transporter.sendMail({
                    from: '"Sync System" <noreply@syncschool.com>',
                    to: user.email,
                    subject: 'Action Required: Subscription Expiring Soon',
                    html: `
                        <h2>Hello ${user.fullName},</h2>
                        <p>Your subscription for <strong>${tenant.name}</strong> is expiring on <strong>${tenant.subscriptionEndsAt?.toDateString()}</strong>.</p>
                        <p>Please login and renew your subscription to avoid service interruption.</p>
                        <br>
                        <a href="https://app.syncschool.com/subscription">Renew Now</a>
                    `
                });
                console.log(`Email sent to ${user.email}`);
            } catch (err) {
                console.error(`Failed to email ${user.email}`, err);
            }
        }
    }
}

// Run if called directly
if (require.main === module) {
    checkExpiry()
        .then(() => process.exit(0))
        .catch(e => { console.error(e); process.exit(1); });
}
