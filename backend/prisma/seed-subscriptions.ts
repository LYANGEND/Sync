import { PrismaClient, SubscriptionTier } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Subscription Plans Seed Data
 * 
 * Pricing Model:
 * - ZMW is the anchor currency
 * - USD equivalent calculated at K27 = $1 (updated quarterly)
 * - Per-student overage: K20/student/month
 * 
 * Tier Structure:
 * - FREE: 10 students, limited features
 * - STARTER: K3,500/mo, 175 students included (K3,500 ÷ K20)
 * - PROFESSIONAL: K9,500/mo, 475 students included (K9,500 ÷ K20)
 * - ENTERPRISE: K15,000/mo, 750 students (K15,000 ÷ K20) or unlimited
 */

const EXCHANGE_RATE = 27; // ZMW per USD (update quarterly)
const PER_STUDENT_ZMW = 20;
const PER_STUDENT_USD = Number((PER_STUDENT_ZMW / EXCHANGE_RATE).toFixed(2));

const plans = [
    {
        name: 'Free',
        tier: SubscriptionTier.FREE,
        description: 'Perfect for small schools just getting started',
        monthlyPriceZMW: 0,
        yearlyPriceZMW: 0,
        includedStudents: 10,
        maxStudents: 10, // Hard cap
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
        tier: SubscriptionTier.STARTER,
        description: 'Ideal for growing schools with essential features',
        monthlyPriceZMW: 3500,
        yearlyPriceZMW: 35000, // ~17% discount
        includedStudents: 175, // K3,500 ÷ K20 = 175 students
        maxStudents: 175, // Must upgrade for more students
        maxTeachers: 20,
        maxUsers: 40,
        maxClasses: 20,
        maxStorageGB: 5,
        includedSmsPerMonth: 100,
        includedEmailsPerMonth: 500,
        features: [
            'attendance',
            'fee_management',
            'report_cards',
            'parent_portal',
            'email_notifications',
            'basic_reports',
        ],
        isActive: true,
        isPopular: false,
        sortOrder: 1,
    },
    {
        name: 'Professional',
        tier: SubscriptionTier.PROFESSIONAL,
        description: 'Full-featured solution for established schools',
        monthlyPriceZMW: 9500,
        yearlyPriceZMW: 95000, // ~17% discount
        includedStudents: 475, // K9,500 ÷ K20 = 475 students
        maxStudents: 475, // Must upgrade for more students
        maxTeachers: 60,
        maxUsers: 120,
        maxClasses: 60,
        maxStorageGB: 20,
        includedSmsPerMonth: 500,
        includedEmailsPerMonth: 2000,
        features: [
            'attendance',
            'fee_management',
            'report_cards',
            'parent_portal',
            'email_notifications',
            'sms_notifications',
            'online_assessments',
            'timetable',
            'syllabus_tracking',
            'advanced_reports',
            'priority_support',
        ],
        isActive: true,
        isPopular: true,
        sortOrder: 2,
    },
    {
        name: 'Enterprise',
        tier: SubscriptionTier.ENTERPRISE,
        description: 'Unlimited access for large institutions',
        monthlyPriceZMW: 15000,
        yearlyPriceZMW: 150000, // ~17% discount
        includedStudents: 750, // K15,000 ÷ K20 = 750 students
        maxStudents: 0, // 0 = unlimited (Enterprise benefit)
        maxTeachers: 0, // 0 = unlimited
        maxUsers: 0, // 0 = unlimited
        maxClasses: 0, // 0 = unlimited
        maxStorageGB: 100,
        includedSmsPerMonth: 2000,
        includedEmailsPerMonth: 10000,
        features: [
            'attendance',
            'fee_management',
            'report_cards',
            'parent_portal',
            'email_notifications',
            'sms_notifications',
            'online_assessments',
            'timetable',
            'syllabus_tracking',
            'advanced_reports',
            'api_access',
            'white_label',
            'data_export',
            'dedicated_support',
            'custom_integrations',
        ],
        isActive: true,
        isPopular: false,
        sortOrder: 3,
    },
];

async function seedSubscriptionPlans() {
    console.log('💰 Seeding subscription plans...');
    console.log(`   Exchange rate: K${EXCHANGE_RATE} = $1`);
    console.log(`   Per-student rate: K${PER_STUDENT_ZMW}/month (~$${PER_STUDENT_USD})`);
    console.log('');

    for (const plan of plans) {
        const monthlyPriceUSD = Number((plan.monthlyPriceZMW / EXCHANGE_RATE).toFixed(2));
        const yearlyPriceUSD = Number((plan.yearlyPriceZMW / EXCHANGE_RATE).toFixed(2));

        const existing = await prisma.subscriptionPlan.findFirst({
            where: { tier: plan.tier },
        });

        if (existing) {
            // Update existing plan
            await prisma.subscriptionPlan.update({
                where: { id: existing.id },
                data: {
                    ...plan,
                    monthlyPriceUSD,
                    yearlyPriceUSD,
                    pricePerStudentZMW: PER_STUDENT_ZMW,
                    pricePerStudentUSD: PER_STUDENT_USD,
                },
            });
            console.log(`   ✅ Updated: ${plan.name} - K${plan.monthlyPriceZMW}/mo ($${monthlyPriceUSD})`);
        } else {
            // Create new plan
            await prisma.subscriptionPlan.create({
                data: {
                    ...plan,
                    monthlyPriceUSD,
                    yearlyPriceUSD,
                    pricePerStudentZMW: PER_STUDENT_ZMW,
                    pricePerStudentUSD: PER_STUDENT_USD,
                },
            });
            console.log(`   ✅ Created: ${plan.name} - K${plan.monthlyPriceZMW}/mo ($${monthlyPriceUSD})`);
        }
    }

    console.log('');
    console.log('📊 Subscription Plans Summary:');
    console.log('┌─────────────────┬────────────┬────────────┬──────────────────┐');
    console.log('│ Tier            │ Monthly    │ Students   │ Extra/Student    │');
    console.log('├─────────────────┼────────────┼────────────┼──────────────────┤');
    for (const plan of plans) {
        const priceStr = plan.monthlyPriceZMW === 0 ? 'FREE' : `K${plan.monthlyPriceZMW.toLocaleString()}`;
        const studentsStr = plan.maxStudents === 0 ? 'Unlimited' : `${plan.includedStudents} incl.`;
        const extraStr = plan.tier === 'FREE' ? 'N/A' : `K${PER_STUDENT_ZMW}/mo`;
        console.log(`│ ${plan.name.padEnd(15)} │ ${priceStr.padEnd(10)} │ ${studentsStr.padEnd(10)} │ ${extraStr.padEnd(16)} │`);
    }
    console.log('└─────────────────┴────────────┴────────────┴──────────────────┘');
}

async function main() {
    try {
        await seedSubscriptionPlans();
        console.log('\n🎉 Subscription plans seeded successfully!');
    } catch (error) {
        console.error('❌ Error seeding subscription plans:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
