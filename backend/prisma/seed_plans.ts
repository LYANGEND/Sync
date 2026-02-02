
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient() as any;  // Type assertion to bypass stale types

async function main() {
    console.log('📦 Seeding Subscription Plans Only...');
    const plans = [
        {
            name: 'Free Forever',
            tier: 'FREE',
            sortOrder: 1,
            monthlyPriceZMW: 0,
            yearlyPriceZMW: 0,
            monthlyPriceUSD: 0,
            yearlyPriceUSD: 0,
            maxStudents: 50,
            maxTeachers: 5,
            includedStudents: 50,
            maxUsers: 10,
            maxClasses: 5,
            maxStorageGB: 1,
            features: ['attendance', 'report_cards', 'basic_reports'],
            isPopular: false
        },
        {
            name: 'Starter',
            tier: 'STARTER',
            sortOrder: 2,
            monthlyPriceZMW: 500,
            yearlyPriceZMW: 5000,
            monthlyPriceUSD: 25,
            yearlyPriceUSD: 250,
            maxStudents: 200,
            maxTeachers: 10,
            includedStudents: 200,
            maxUsers: 20,
            maxClasses: 10,
            maxStorageGB: 5,
            features: ['attendance', 'report_cards', 'email_notifications', 'fee_management', 'basic_reports', 'ai_lesson_planner'],
            isPopular: false
        },
        {
            name: 'Professional',
            tier: 'PROFESSIONAL',
            sortOrder: 3,
            monthlyPriceZMW: 1500,
            yearlyPriceZMW: 15000,
            monthlyPriceUSD: 75,
            yearlyPriceUSD: 750,
            maxStudents: 500,
            maxTeachers: 25,
            includedStudents: 500,
            maxUsers: 50,
            maxClasses: 25,
            maxStorageGB: 20,
            features: ['attendance', 'report_cards', 'email_notifications', 'sms_notifications', 'fee_management', 'parent_portal', 'advanced_reports', 'ai_lesson_planner', 'ai_assessments', 'ai_report_cards', 'crm_basic'],
            isPopular: true
        },
        {
            name: 'Enterprise',
            tier: 'ENTERPRISE',
            sortOrder: 4,
            monthlyPriceZMW: 3000,
            yearlyPriceZMW: 30000,
            monthlyPriceUSD: 150,
            yearlyPriceUSD: 1500,
            maxStudents: 0, // Unlimited
            maxTeachers: 0,
            includedStudents: 10000, // Unlimited effectively
            maxUsers: 1000,
            maxClasses: 100,
            maxStorageGB: 100,
            features: ['white_label', 'api_access', 'dedicated_support', 'custom_integrations', 'priority_support', 'syllabus_tracking', 'timetable', 'ai_lesson_planner', 'ai_assessments', 'ai_report_cards', 'ai_tutor', 'ai_analytics', 'crm_advanced', 'teacher_ai_assistant'],
            isPopular: false
        },
    ];

    // Seed Tiers first
    const tiers = [
        { name: 'Free', value: 'FREE', sortOrder: 1 },
        { name: 'Starter', value: 'STARTER', sortOrder: 2 },
        { name: 'Professional', value: 'PROFESSIONAL', sortOrder: 3 },
        { name: 'Enterprise', value: 'ENTERPRISE', sortOrder: 4 },
    ];

    console.log('📦 Seeding Subscription Tiers...');
    for (const t of tiers) {
        await prisma.subscriptionTier.upsert({
            where: { value: t.value },
            update: { name: t.name, sortOrder: t.sortOrder },
            create: { name: t.name, value: t.value, sortOrder: t.sortOrder }
        });
    }

    // Seed Plans
    for (const p of plans) {
        const description = p.tier === 'FREE' ? 'Get started with basic features' :
            p.tier === 'STARTER' ? 'Perfect for small schools. Includes AI Lesson Planning.' :
                p.tier === 'PROFESSIONAL' ? 'Best for growing institutions. Full AI Suite used by best teachers.' :
                    'For large school networks. Complete AI & Analytics.';

        try {
            const existing = await prisma.subscriptionPlan.findFirst({
                where: { tier: p.tier as any }
            });

            if (existing) {
                console.log(`Updating ${p.name}`);
                await prisma.subscriptionPlan.update({
                    where: { id: existing.id },
                    data: {
                        name: p.name,
                        description,
                        monthlyPriceZMW: p.monthlyPriceZMW,
                        yearlyPriceZMW: p.yearlyPriceZMW,
                        monthlyPriceUSD: p.monthlyPriceUSD,
                        yearlyPriceUSD: p.yearlyPriceUSD,
                        features: p.features,
                        includedStudents: p.includedStudents,
                        maxStudents: p.maxStudents,
                        maxTeachers: p.maxTeachers,
                        maxUsers: p.maxUsers,
                        maxClasses: p.maxClasses,
                        maxStorageGB: p.maxStorageGB,
                        monthlyApiCallLimit: 0,
                        isPopular: p.isPopular,
                        sortOrder: p.sortOrder
                    } as any
                });
            } else {
                console.log(`Creating ${p.name}`);
                await prisma.subscriptionPlan.create({
                    data: {
                        ...p,
                        tier: p.tier,
                        description,
                        monthlyApiCallLimit: (p as any).monthlyApiCallLimit || 0
                    } as any
                });
            }
        } catch (err) {
            console.error(`Error on ${p.name}:`, err);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        throw e;  // Re-throw instead of process.exit to avoid type issues
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
