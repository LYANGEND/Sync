/**
 * Minimal Seed for Ops Platform
 * Seeds only: Platform Admin + Subscription Plans
 * No schools/tenants seeded
 */

import 'dotenv/config';
import { PrismaClient, PlatformRole } from '@prisma/client';
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// ===========================================
// 1. PLATFORM ADMIN USERS
// ===========================================
async function seedPlatformAdmin() {
    console.log('\n🔧 Seeding Platform Admin Users...\n');

    const defaultPassword = 'Admin@123'; // Change this in production!
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    // Super Admin
    const superadmin = await prisma.platformUser.upsert({
        where: { email: 'admin@sync.com' },
        update: {},
        create: {
            email: 'admin@sync.com',
            passwordHash: hashedPassword,
            fullName: 'Platform Administrator',
            role: 'PLATFORM_SUPERADMIN' as PlatformRole,
            isActive: true,
        },
    });
    console.log(`   ✅ Platform Superadmin: ${superadmin.email}`);

    // Support User
    const support = await prisma.platformUser.upsert({
        where: { email: 'support@sync.com' },
        update: {},
        create: {
            email: 'support@sync.com',
            passwordHash: hashedPassword,
            fullName: 'Support Agent',
            role: 'PLATFORM_SUPPORT' as PlatformRole,
            isActive: true,
        },
    });
    console.log(`   ✅ Platform Support: ${support.email}`);

    // Sales User
    const sales = await prisma.platformUser.upsert({
        where: { email: 'sales@sync.com' },
        update: {},
        create: {
            email: 'sales@sync.com',
            passwordHash: hashedPassword,
            fullName: 'Sales Representative',
            role: 'PLATFORM_SALES' as PlatformRole,
            isActive: true,
        },
    });
    console.log(`   ✅ Platform Sales: ${sales.email}`);

    console.log('\n⚠️  Default password: Admin@123 - CHANGE IN PRODUCTION!');
}

// ===========================================
// 2. SUBSCRIPTION PLANS
// ===========================================
const EXCHANGE_RATE = 27; // ZMW per USD
const PER_STUDENT_ZMW = 20;
const PER_STUDENT_USD = Number((PER_STUDENT_ZMW / EXCHANGE_RATE).toFixed(2));

const plans = [
    {
        name: 'Free',
        tier: 'FREE',
        description: 'Perfect for small schools just getting started',
        monthlyPriceZMW: 0,
        yearlyPriceZMW: 0,
        includedStudents: 10,
        maxStudents: 10,
        maxTeachers: 2,
        maxUsers: 5,
        maxClasses: 3,
        maxStorageGB: 1,
        includedSmsPerMonth: 0,
        includedEmailsPerMonth: 50,
        features: ['attendance', 'basic_reports', 'fee_management'],
        isActive: true,
        isPopular: false,
        sortOrder: 0,
    },
    {
        name: 'Starter',
        tier: 'STARTER',
        description: 'Ideal for growing schools with essential features',
        monthlyPriceZMW: 3500,
        yearlyPriceZMW: 35000,
        includedStudents: 175,
        maxStudents: 175,
        maxTeachers: 20,
        maxUsers: 40,
        maxClasses: 20,
        maxStorageGB: 5,
        includedSmsPerMonth: 100,
        includedEmailsPerMonth: 500,
        features: ['attendance', 'fee_management', 'report_cards', 'parent_portal', 'email_notifications', 'basic_reports'],
        isActive: true,
        isPopular: false,
        sortOrder: 1,
    },
    {
        name: 'Professional',
        tier: 'PROFESSIONAL',
        description: 'Full-featured solution for established schools',
        monthlyPriceZMW: 9500,
        yearlyPriceZMW: 95000,
        includedStudents: 475,
        maxStudents: 475,
        maxTeachers: 60,
        maxUsers: 120,
        maxClasses: 60,
        maxStorageGB: 20,
        includedSmsPerMonth: 500,
        includedEmailsPerMonth: 2000,
        features: ['attendance', 'fee_management', 'report_cards', 'parent_portal', 'email_notifications', 'sms_notifications', 'online_assessments', 'timetable', 'syllabus_tracking', 'advanced_reports', 'priority_support'],
        isActive: true,
        isPopular: true,
        sortOrder: 2,
    },
    {
        name: 'Enterprise',
        tier: 'ENTERPRISE',
        description: 'Unlimited access for large institutions',
        monthlyPriceZMW: 15000,
        yearlyPriceZMW: 150000,
        includedStudents: 750,
        maxStudents: 0, // 0 = unlimited
        maxTeachers: 0,
        maxUsers: 0,
        maxClasses: 0,
        maxStorageGB: 100,
        includedSmsPerMonth: 2000,
        includedEmailsPerMonth: 10000,
        features: ['attendance', 'fee_management', 'report_cards', 'parent_portal', 'email_notifications', 'sms_notifications', 'online_assessments', 'timetable', 'syllabus_tracking', 'advanced_reports', 'api_access', 'white_label', 'data_export', 'dedicated_support', 'custom_integrations'],
        isActive: true,
        isPopular: false,
        sortOrder: 3,
    },
];

async function seedSubscriptionPlans() {
    console.log('\n💰 Seeding Subscription Plans...\n');
    console.log(`   Exchange rate: K${EXCHANGE_RATE} = $1`);
    console.log(`   Per-student rate: K${PER_STUDENT_ZMW}/month\n`);

    for (const plan of plans) {
        const monthlyPriceUSD = Number((plan.monthlyPriceZMW / EXCHANGE_RATE).toFixed(2));
        const yearlyPriceUSD = Number((plan.yearlyPriceZMW / EXCHANGE_RATE).toFixed(2));

        const existing = await prisma.subscriptionPlan.findFirst({
            where: { tier: plan.tier as any },
        });

        const planData = {
            name: plan.name,
            tier: plan.tier as any,
            description: plan.description,
            monthlyPriceZMW: plan.monthlyPriceZMW,
            yearlyPriceZMW: plan.yearlyPriceZMW,
            monthlyPriceUSD,
            yearlyPriceUSD,
            includedStudents: plan.includedStudents,
            maxStudents: plan.maxStudents,
            maxTeachers: plan.maxTeachers,
            maxUsers: plan.maxUsers,
            maxClasses: plan.maxClasses,
            maxStorageGB: plan.maxStorageGB,
            includedSmsPerMonth: plan.includedSmsPerMonth,
            includedEmailsPerMonth: plan.includedEmailsPerMonth,
            features: plan.features,
            isActive: plan.isActive,
            isPopular: plan.isPopular,
            sortOrder: plan.sortOrder,
            pricePerStudentZMW: PER_STUDENT_ZMW,
            pricePerStudentUSD: PER_STUDENT_USD,
        };

        if (existing) {
            await prisma.subscriptionPlan.update({
                where: { id: existing.id },
                data: planData,
            });
            console.log(`   ✅ Updated: ${plan.name} - K${plan.monthlyPriceZMW}/mo`);
        } else {
            await prisma.subscriptionPlan.create({
                data: planData,
            });
            console.log(`   ✅ Created: ${plan.name} - K${plan.monthlyPriceZMW}/mo`);
        }
    }
}

// ===========================================
// MAIN
// ===========================================
async function main() {
    console.log('🚀 Seeding Ops Platform (Admin + Plans only)...');
    console.log('═'.repeat(50));

    await seedPlatformAdmin();
    await seedSubscriptionPlans();

    console.log('\n═'.repeat(50));
    console.log('🎉 Ops Platform seeded successfully!\n');
    console.log('📝 Login credentials:');
    console.log('   URL: ops.bwangubwangu.net');
    console.log('   Email: admin@sync.com');
    console.log('   Password: Admin@123');
}

main()
    .catch((e) => {
        console.error('❌ Seeding failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
