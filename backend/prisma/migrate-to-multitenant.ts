import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Migration script to convert single-tenant to multi-tenant
 * This script:
 * 1. Creates a default tenant from existing SchoolSettings
 * 2. Updates all existing records with the default tenant ID
 * 3. Creates seed data for subscription plans
 * 4. Creates a platform admin user
 */
async function migrateTenant() {
    console.log('🚀 Starting multi-tenant migration...\n');

    try {
        // Step 1: Get existing school settings (if any)
        const existingSettings = await prisma.schoolSettings.findFirst();

        console.log('📋 Step 1: Creating default tenant...');

        // Create default tenant from existing settings
        const defaultTenant = await prisma.tenant.create({
            data: {
                name: existingSettings?.schoolName || 'My School',
                slug: 'default',
                email: existingSettings?.schoolEmail || 'admin@school.com',
                phone: existingSettings?.schoolPhone,
                address: existingSettings?.schoolAddress,
                website: existingSettings?.schoolWebsite,
                logoUrl: existingSettings?.logoUrl,
                primaryColor: existingSettings?.primaryColor || '#2563eb',
                secondaryColor: existingSettings?.secondaryColor || '#475569',
                accentColor: existingSettings?.accentColor || '#f59e0b',
                tier: 'PROFESSIONAL', // Give existing school professional tier
                status: 'ACTIVE',
                maxStudents: 1000,
                maxTeachers: 100,
                maxUsers: 200,
                maxClasses: 50,
                maxStorageGB: 50,
                // Enable all features for existing school
                smsEnabled: true,
                emailEnabled: true,
                onlineAssessmentsEnabled: true,
                parentPortalEnabled: true,
                reportCardsEnabled: true,
                attendanceEnabled: true,
                feeManagementEnabled: true,
                chatEnabled: true,
                advancedReportsEnabled: true,
                apiAccessEnabled: true,
                timetableEnabled: true,
                syllabusEnabled: true,
                currentTermId: existingSettings?.currentTermId,
            }
        });

        console.log(`✅ Created tenant: ${defaultTenant.name} (${defaultTenant.id})\n`);

        // Step 2: Update all existing records with tenant ID
        console.log('📋 Step 2: Updating existing records with tenant ID...');

        // Update Users
        const usersUpdated = await prisma.user.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Users updated: ${usersUpdated.count}`);

        // Update Students
        const studentsUpdated = await prisma.student.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Students updated: ${studentsUpdated.count}`);

        // Update Classes
        const classesUpdated = await prisma.class.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Classes updated: ${classesUpdated.count}`);

        // Update Subjects
        const subjectsUpdated = await prisma.subject.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Subjects updated: ${subjectsUpdated.count}`);

        // Update Academic Terms
        const termsUpdated = await prisma.academicTerm.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Academic Terms updated: ${termsUpdated.count}`);

        // Update Fee Templates
        const feeTemplatesUpdated = await prisma.feeTemplate.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Fee Templates updated: ${feeTemplatesUpdated.count}`);

        // Update Payments
        const paymentsUpdated = await prisma.payment.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Payments updated: ${paymentsUpdated.count}`);

        // Update Attendance
        const attendanceUpdated = await prisma.attendance.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Attendance records updated: ${attendanceUpdated.count}`);

        // Update Assessments
        const assessmentsUpdated = await prisma.assessment.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Assessments updated: ${assessmentsUpdated.count}`);

        // Update Grading Scales
        const gradingScalesUpdated = await prisma.gradingScale.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Grading Scales updated: ${gradingScalesUpdated.count}`);

        // Update Scholarships
        const scholarshipsUpdated = await prisma.scholarship.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Scholarships updated: ${scholarshipsUpdated.count}`);

        // Update Timetable Periods
        const timetableUpdated = await prisma.timetablePeriod.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Timetable Periods updated: ${timetableUpdated.count}`);

        // Update Topics
        const topicsUpdated = await prisma.topic.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Topics updated: ${topicsUpdated.count}`);

        // Update Lesson Plans
        const lessonPlansUpdated = await prisma.lessonPlan.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Lesson Plans updated: ${lessonPlansUpdated.count}`);

        // Update Notifications
        const notificationsUpdated = await prisma.notification.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Notifications updated: ${notificationsUpdated.count}`);

        // Update Conversations
        const conversationsUpdated = await prisma.conversation.updateMany({
            where: { tenantId: undefined as any },
            data: { tenantId: defaultTenant.id }
        });
        console.log(`  - Conversations updated: ${conversationsUpdated.count}`);

        console.log('');

        // Step 3: Update tenant usage counts
        console.log('📋 Step 3: Updating tenant usage counts...');

        const studentCount = await prisma.student.count({ where: { tenantId: defaultTenant.id } });
        const userCount = await prisma.user.count({ where: { tenantId: defaultTenant.id } });
        const teacherCount = await prisma.user.count({
            where: { tenantId: defaultTenant.id, role: 'TEACHER' }
        });

        await prisma.tenant.update({
            where: { id: defaultTenant.id },
            data: {
                currentStudentCount: studentCount,
                currentUserCount: userCount,
                currentTeacherCount: teacherCount,
            }
        });

        console.log(`  - Students: ${studentCount}`);
        console.log(`  - Users: ${userCount}`);
        console.log(`  - Teachers: ${teacherCount}\n`);

        // Step 4: Create subscription plans
        console.log('📋 Step 4: Creating subscription plans...');

        const plans = [
            {
                name: 'Free',
                tier: 'FREE' as const,
                description: 'Perfect for small schools just getting started',
                monthlyPrice: 0,
                yearlyPrice: 0,
                maxStudents: 50,
                maxTeachers: 5,
                maxUsers: 10,
                maxClasses: 5,
                maxStorageGB: 1,
                features: ['email', 'attendance', 'fee_management', 'report_cards', 'timetable'],
                isActive: true,
                isPopular: false,
            },
            {
                name: 'Starter',
                tier: 'STARTER' as const,
                description: 'Great for growing schools',
                monthlyPrice: 1500,
                yearlyPrice: 15000,
                maxStudents: 300,
                maxTeachers: 30,
                maxUsers: 50,
                maxClasses: 20,
                maxStorageGB: 10,
                features: ['email', 'attendance', 'fee_management', 'report_cards', 'timetable', 'parent_portal'],
                isActive: true,
                isPopular: false,
            },
            {
                name: 'Professional',
                tier: 'PROFESSIONAL' as const,
                description: 'Advanced features for established institutions',
                monthlyPrice: 3500,
                yearlyPrice: 35000,
                maxStudents: 1000,
                maxTeachers: 100,
                maxUsers: 200,
                maxClasses: 50,
                maxStorageGB: 50,
                features: ['sms', 'email', 'attendance', 'fee_management', 'report_cards', 'timetable', 'parent_portal', 'online_assessments', 'chat', 'advanced_reports', 'syllabus'],
                isActive: true,
                isPopular: true,
            },
            {
                name: 'Enterprise',
                tier: 'ENTERPRISE' as const,
                description: 'Unlimited access for large institutions',
                monthlyPrice: 10000,
                yearlyPrice: 100000,
                maxStudents: -1, // Unlimited
                maxTeachers: -1,
                maxUsers: -1,
                maxClasses: -1,
                maxStorageGB: 500,
                features: ['sms', 'email', 'attendance', 'fee_management', 'report_cards', 'timetable', 'parent_portal', 'online_assessments', 'chat', 'advanced_reports', 'syllabus', 'api_access'],
                isActive: true,
                isPopular: false,
            },
        ];

        for (const plan of plans) {
            await prisma.subscriptionPlan.upsert({
                where: { id: plan.name.toLowerCase() },
                update: plan,
                create: {
                    id: plan.name.toLowerCase(),
                    ...plan,
                },
            });
            console.log(`  - Created plan: ${plan.name}`);
        }
        console.log('');

        // Step 5: Create platform admin
        console.log('📋 Step 5: Creating platform admin user...');

        const platformAdminEmail = 'platform@sync.app';
        const existingPlatformAdmin = await prisma.platformUser.findUnique({
            where: { email: platformAdminEmail }
        });

        if (!existingPlatformAdmin) {
            const hashedPassword = await bcrypt.hash('PlatformAdmin123!', 10);
            await prisma.platformUser.create({
                data: {
                    email: platformAdminEmail,
                    passwordHash: hashedPassword,
                    fullName: 'Platform Administrator',
                    role: 'PLATFORM_SUPERADMIN',
                    isActive: true,
                }
            });
            console.log(`  - Created platform admin: ${platformAdminEmail}`);
            console.log(`  - Password: PlatformAdmin123! (change this immediately!)\n`);
        } else {
            console.log(`  - Platform admin already exists: ${platformAdminEmail}\n`);
        }

        console.log('✅ Multi-tenant migration completed successfully!\n');
        console.log('📝 Next Steps:');
        console.log('  1. Run "npx prisma generate" to regenerate the Prisma client');
        console.log('  2. Update authentication to include tenantId in JWT');
        console.log('  3. Add tenant middleware to API routes');
        console.log('  4. Test the application with the default tenant');
        console.log('');
        console.log(`🏫 Default Tenant ID: ${defaultTenant.id}`);
        console.log(`🏫 Default Tenant Slug: ${defaultTenant.slug}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run migration
migrateTenant()
    .catch(console.error);
